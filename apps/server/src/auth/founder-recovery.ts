import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import { hashPassword, hashToken, newToken, verifyPassword } from './crypto.js';

// Internal foundation only: no caller or mail delivery is enabled. In particular,
// do not expose the returned token to an HTTP requester or application logs.
const RECOVERY_TTL = 20 * 60_000;
function strongPassword(value: string): boolean { return value.length >= 14 && value.length <= 200 && /[a-zA-Z]/.test(value) && /[^a-zA-Z]/.test(value); }

/** Caller must first perform authenticated, rate-limited delivery orchestration.
 * Owner recovery is deliberately excluded and requires an operational procedure. */
export async function createFounderRecovery(database: Kysely<Database>, founderId: string, now = new Date()): Promise<string | null> {
  return database.transaction().execute(async (trx) => {
    const founder = await trx.selectFrom('founder_accounts').selectAll().where('id', '=', founderId).forUpdate().executeTakeFirst();
    if (!founder || founder.role === 'owner' || founder.status !== 'active' || !founder.mfa_enrolled_at) return null;
    await trx.updateTable('founder_password_recoveries').set({ used_at: now }).where('founder_id', '=', founder.id).where('used_at', 'is', null).execute();
    const token = newToken();
    await trx.insertInto('founder_password_recoveries').values({ token_hash: token.hash, founder_id: founder.id, expires_at: new Date(now.getTime() + RECOVERY_TTL), used_at: null }).execute();
    await trx.insertInto('founder_security_audit').values({ event_type: 'password_recovery_issued', actor_id: null, actor_role: 'system', target_id: founder.id, outcome: 'success', request_id: randomUUID() }).execute();
    return token.token;
  });
}

/** Consumes a token and revokes every session/flow. It never issues a session:
 * the next login must still pass the previously enrolled MFA. */
export async function completeFounderRecovery(database: Kysely<Database>, token: string, password: string, now = new Date()): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !strongPassword(password)) return false;
  return database.transaction().execute(async (trx) => {
    const hash = hashToken(token);
    // Lock founder before recovery rows so concurrent recovery requests serialize.
    const candidate = await trx.selectFrom('founder_password_recoveries').select('founder_id').where('token_hash', '=', hash).executeTakeFirst();
    if (!candidate) return false;
    const founder = await trx.selectFrom('founder_accounts').selectAll().where('id', '=', candidate.founder_id).forUpdate().executeTakeFirst();
    if (!founder || founder.role === 'owner' || founder.status !== 'active' || !founder.mfa_enrolled_at) return false;
    const recovery = await trx.selectFrom('founder_password_recoveries').selectAll().where('token_hash', '=', hash).forUpdate().executeTakeFirst();
    if (!recovery || recovery.used_at || recovery.expires_at <= now || await verifyPassword(password, founder.password_hash)) return false;
    await trx.updateTable('founder_password_recoveries').set({ used_at: now }).where('founder_id', '=', founder.id).where('used_at', 'is', null).execute();
    await trx.updateTable('founder_accounts').set({ password_hash: await hashPassword(password), password_changed_at: now, failed_logins: 0, locked_until: null, session_version: founder.session_version + 1 }).where('id', '=', founder.id).execute();
    await trx.deleteFrom('founder_sessions').where('founder_id', '=', founder.id).execute();
    await trx.deleteFrom('founder_auth_flows').where('founder_id', '=', founder.id).execute();
    await trx.insertInto('founder_security_audit').values({ event_type: 'password_recovery_completed', actor_id: founder.id, actor_role: founder.role, target_id: founder.id, outcome: 'success', request_id: randomUUID() }).execute();
    return true;
  });
}
