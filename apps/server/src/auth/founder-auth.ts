import { randomBytes, randomUUID } from 'node:crypto';
import type { Kysely, Transaction } from 'kysely';
import type { Database, FounderRole, FounderSecurityEvent } from '../db/schema.js';
import { getDummyHash, hashPassword, hashToken, newToken, verifyPassword } from './crypto.js';
import { decryptFounderTotp, encryptFounderTotp, newFounderTotp, verifyFounderTotp } from './founder-mfa.js';

// INTERNAL FOUNDATION ONLY. No HTTP router currently invokes this module.
// Full founder authentication remains disabled until the lifecycle is wired,
// independently reviewed and tested end-to-end, including recovery and rate limits.
const FLOW_LIFETIME = 5 * 60_000;
const SESSION_IDLE = 30 * 60_000;
const SESSION_ABSOLUTE = 8 * 60 * 60_000;
const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60_000;

type Trx = Transaction<Database>;
async function audit(trx: Trx, event: FounderSecurityEvent, actor: string | null, role: FounderRole | 'system', outcome: 'success' | 'denied', requestId: string): Promise<void> {
  await trx.insertInto('founder_security_audit').values({ event_type: event, actor_id: actor, actor_role: role, target_id: actor, outcome, request_id: requestId }).execute();
}

async function failure(trx: Trx, account: { id: string; role: FounderRole; failed_logins: number }, event: FounderSecurityEvent, requestId: string, now: Date): Promise<void> {
  const count = account.failed_logins + 1;
  await trx.updateTable('founder_accounts').set({ failed_logins: count, last_failed_login_at: now, locked_until: count >= LOCK_AFTER ? new Date(now.getTime() + LOCK_MS) : null }).where('id', '=', account.id).execute();
  await audit(trx, event, account.id, account.role, 'denied', requestId);
}

function locked(value: Date | null, now: Date): boolean { return value !== null && value > now; }
function usableToken(token: string): boolean { return /^[A-Za-z0-9_-]{43}$/.test(token); }
function validPassword(value: string): boolean { return value.length >= 14 && value.length <= 200 && /[a-zA-Z]/.test(value) && /[^a-zA-Z]/.test(value); }

/** Verifies password only; always returns a short-lived restricted flow, never a session. */
export async function founderPasswordStep(database: Kysely<Database>, email: string, password: string, now = new Date()): Promise<{ token: string; stage: 'enroll' | 'verify' } | null> {
  if (email.length > 254 || password.length > 200 || password.length < 1) return null;
  const requestId = randomUUID();
  return database.transaction().execute(async (trx) => {
    const account = await trx.selectFrom('founder_accounts').selectAll().where('email', '=', email.trim().toLowerCase()).forUpdate().executeTakeFirst();
    const good = await verifyPassword(password, account?.password_hash ?? await getDummyHash());
    if (!account) { await audit(trx, 'login_password', null, 'system', 'denied', requestId); return null; }
    if (locked(account.locked_until, now) || !['pending', 'active'].includes(account.status)) {
      // Unauthenticated traffic must not keep extending an existing lockout.
      await audit(trx, 'login_password', account.id, account.role, 'denied', requestId); return null;
    }
    if (!good) { await failure(trx, account, 'login_password', requestId, now); return null; }
    const stage = account.status === 'pending' && !account.mfa_enrolled_at ? 'enroll' : 'verify';
    const issued = newToken();
    await trx.insertInto('founder_auth_flows').values({ token_hash: issued.hash, founder_id: account.id, session_version: account.session_version, stage, expires_at: new Date(now.getTime() + FLOW_LIFETIME) }).execute();
    await audit(trx, 'login_password', account.id, account.role, 'success', requestId);
    return { token: issued.token, stage };
  });
}

async function flowAccount(trx: Trx, token: string, now: Date) {
  if (!usableToken(token)) return null;
  const flow = await trx.selectFrom('founder_auth_flows').selectAll().where('token_hash', '=', hashToken(token)).forUpdate().executeTakeFirst();
  if (!flow || flow.expires_at <= now) return null;
  const account = await trx.selectFrom('founder_accounts').selectAll().where('id', '=', flow.founder_id).forUpdate().executeTakeFirst();
  if (!account || !['pending', 'active'].includes(account.status) || account.session_version !== flow.session_version || locked(account.locked_until, now)) return null;
  return { flow, account };
}

/** A valid restricted enrollment flow can retrieve a pending secret; no session is created. */
export async function founderEnrollment(database: Kysely<Database>, token: string, key: Buffer, now = new Date()): Promise<{ secret: string; uri: string } | null> {
  return database.transaction().execute(async (trx) => {
    const state = await flowAccount(trx, token, now);
    if (!state || state.flow.stage !== 'enroll' || state.account.status !== 'pending' || state.account.mfa_enrolled_at) return null;
    let secret = state.account.totp_ciphertext ? decryptFounderTotp(state.account.totp_ciphertext, state.account.id, key) : null;
    if (!secret) {
      const setup = newFounderTotp(state.account.email);
      secret = setup.secret;
      await trx.updateTable('founder_accounts').set({ totp_ciphertext: encryptFounderTotp(secret, state.account.id, key), totp_last_step: null }).where('id', '=', state.account.id).execute();
      await audit(trx, 'mfa_enrollment_started', state.account.id, state.account.role, 'success', randomUUID());
    }
    // Generate the provisioning URI from the same existing secret.
    const { TOTP, Secret } = await import('otpauth');
    const uri = new TOTP({ issuer: 'Solution Velocity', label: state.account.email, algorithm: 'SHA1', digits: 6, period: 30, secret: Secret.fromBase32(secret) }).toString();
    return { secret, uri };
  });
}

type VerifyResult = { kind: 'rotate'; flowToken: string; recoveryCodes?: string[] } | { kind: 'session'; sessionToken: string };
/** Single-use TOTP/recovery verification; rotates the restricted token on transition. */
export async function founderMfaStep(database: Kysely<Database>, token: string, code: string, key: Buffer, now = new Date()): Promise<VerifyResult | null> {
  const requestId = randomUUID();
  return database.transaction().execute(async (trx) => {
    const state = await flowAccount(trx, token, now);
    if (!state || !['enroll', 'verify'].includes(state.flow.stage) || !state.account.totp_ciphertext) return null;
    const { account, flow } = state;
    const ciphertext = account.totp_ciphertext;
    if (!ciphertext) return null;
    if (flow.stage === 'enroll' && (account.status !== 'pending' || account.mfa_enrolled_at)) return null;
    if (flow.stage === 'verify' && !account.mfa_enrolled_at) return null;
    let step: number | null = null;
    let accepted = false;
    if (/^\d{6}$/.test(code)) {
      step = verifyFounderTotp(decryptFounderTotp(ciphertext, account.id, key), code, account.totp_last_step, now.getTime());
      accepted = step !== null;
    } else if (flow.stage === 'verify' && /^[A-Za-z0-9_-]{43}$/.test(code)) {
      const used = await trx.updateTable('founder_recovery_codes').set({ used_at: now }).where('founder_id', '=', account.id).where('code_hash', '=', hashToken(code)).where('used_at', 'is', null).returning('code_hash').executeTakeFirst();
      accepted = !!used;
    }
    if (!accepted) { await failure(trx, account, 'mfa_verification', requestId, now); return null; }
    await trx.updateTable('founder_accounts').set({ failed_logins: 0, locked_until: null, ...(step !== null ? { totp_last_step: step } : {}), ...(flow.stage === 'enroll' ? { mfa_enrolled_at: now } : {}) }).where('id', '=', account.id).execute();
    await trx.deleteFrom('founder_auth_flows').where('token_hash', '=', flow.token_hash).execute();
    let recoveryCodes: string[] | undefined;
    if (flow.stage === 'enroll') {
      recoveryCodes = Array.from({ length: 10 }, () => randomBytes(32).toString('base64url'));
      await trx.deleteFrom('founder_recovery_codes').where('founder_id', '=', account.id).execute();
      await trx.insertInto('founder_recovery_codes').values(recoveryCodes.map((c) => ({ founder_id: account.id, code_hash: hashToken(c), used_at: null }))).execute();
      await audit(trx, 'mfa_enrolled', account.id, account.role, 'success', requestId);
    }
    await audit(trx, 'mfa_verification', account.id, account.role, 'success', requestId);
    if (account.status === 'pending' || account.password_rotation_required) {
      const next = newToken();
      await trx.insertInto('founder_auth_flows').values({ token_hash: next.hash, founder_id: account.id, session_version: account.session_version, stage: 'rotate', expires_at: new Date(now.getTime() + FLOW_LIFETIME) }).execute();
      return { kind: 'rotate', flowToken: next.token, ...(recoveryCodes ? { recoveryCodes } : {}) };
    }
    const session = await createSession(trx, account.id, account.session_version, account.role, now);
    return { kind: 'session', sessionToken: session };
  });
}

async function createSession(trx: Trx, founderId: string, version: number, role: FounderRole, now: Date): Promise<string> {
  const session = newToken();
  await trx.insertInto('founder_sessions').values({ token_hash: session.hash, founder_id: founderId, session_version: version, idle_expires_at: new Date(now.getTime() + SESSION_IDLE), absolute_expires_at: new Date(now.getTime() + SESSION_ABSOLUTE), last_seen_at: now }).execute();
  await trx.updateTable('founder_accounts').set({ last_login_at: now }).where('id', '=', founderId).execute();
  await audit(trx, 'session_created', founderId, role, 'success', randomUUID());
  return session.token;
}

/** Completes first-login rotation after verified MFA; invalidates all older state. */
export async function founderFirstPasswordRotation(database: Kysely<Database>, flowToken: string, newPassword: string, now = new Date()): Promise<string | null> {
  if (!validPassword(newPassword)) return null;
  return database.transaction().execute(async (trx) => {
    const state = await flowAccount(trx, flowToken, now);
    if (!state || state.flow.stage !== 'rotate' || state.account.status !== 'pending' || !state.account.mfa_enrolled_at || !state.account.totp_ciphertext || !state.account.password_rotation_required) return null;
    if (await verifyPassword(newPassword, state.account.password_hash)) return null;
    const version = state.account.session_version + 1;
    await trx.updateTable('founder_accounts').set({ password_hash: await hashPassword(newPassword), password_changed_at: now, password_rotation_required: false, status: 'active', session_version: version }).where('id', '=', state.account.id).execute();
    await trx.deleteFrom('founder_sessions').where('founder_id', '=', state.account.id).execute();
    await trx.deleteFrom('founder_auth_flows').where('founder_id', '=', state.account.id).execute();
    await audit(trx, 'password_changed', state.account.id, state.account.role, 'success', randomUUID());
    return createSession(trx, state.account.id, version, state.account.role, now);
  });
}
