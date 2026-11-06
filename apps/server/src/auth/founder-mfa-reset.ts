import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import { verifyPassword } from './crypto.js';
import { decryptFounderTotp, verifyFounderTotp } from './founder-mfa.js';
import { authorizeFounderInTransaction } from './founder-session.js';

// Not exposed by any route. This self-service primitive is only one possible
// part of a future reviewed, audited recovery procedure; it does not recover an
// owner who has lost both the authenticator and recovery codes.
export async function resetFounderMfa(database: Kysely<Database>, sessionToken: string, password: string, code: string, key: Buffer, now = new Date()): Promise<boolean> {
  if (password.length < 1 || password.length > 200 || !/^\d{6}$/.test(code)) return false;
  return database.transaction().execute(async (trx) => {
    const actor = await authorizeFounderInTransaction(trx, sessionToken, 'platform.operations.read', now);
    if (!actor) return false;
    const account = await trx.selectFrom('founder_accounts').selectAll().where('id', '=', actor.id).forUpdate().executeTakeFirstOrThrow();
    if (account.locked_until && account.locked_until > now) return false;
    const validPassword = await verifyPassword(password, account.password_hash);
    const step = account.totp_ciphertext ? verifyFounderTotp(decryptFounderTotp(account.totp_ciphertext, account.id, key), code, account.totp_last_step, now.getTime()) : null;
    if (!validPassword || step === null) {
      const failures = account.failed_logins + 1;
      await trx.updateTable('founder_accounts').set({ failed_logins: failures, last_failed_login_at: now, locked_until: failures >= 5 ? new Date(now.getTime() + 15 * 60_000) : null }).where('id', '=', account.id).execute();
      await trx.insertInto('founder_security_audit').values({ event_type: 'mfa_reset', actor_id: account.id, actor_role: account.role, target_id: account.id, outcome: 'denied', request_id: randomUUID() }).execute();
      return false;
    }
    // Re-enrollment and password rotation are required before another full session.
    await trx.updateTable('founder_accounts').set({ status: 'pending', mfa_enrolled_at: null, totp_ciphertext: null, totp_last_step: null, password_rotation_required: true, session_version: account.session_version + 1, failed_logins: 0, locked_until: null }).where('id', '=', account.id).execute();
    await trx.deleteFrom('founder_sessions').where('founder_id', '=', account.id).execute();
    await trx.deleteFrom('founder_auth_flows').where('founder_id', '=', account.id).execute();
    await trx.deleteFrom('founder_recovery_codes').where('founder_id', '=', account.id).execute();
    await trx.insertInto('founder_security_audit').values({ event_type: 'mfa_reset', actor_id: account.id, actor_role: account.role, target_id: account.id, outcome: 'success', request_id: randomUUID() }).execute();
    return true;
  });
}
