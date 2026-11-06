import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import { hashPassword } from './crypto.js';

// No HTTP route or operational CLI invokes this foundation yet. The caller must
// authenticate the operator, obtain the expected digest from a protected source
// independent of the submitted secret, and never print either value.
import { INITIAL_FOUNDER_EMAIL } from '@sv/shared';
export { INITIAL_FOUNDER_EMAIL };

export interface FounderBootstrapInput {
  expectedSecretSha256: string;
  submittedSecret: string;
  initialPassword: string;
  name: string;
}

function validSecret(expected: string, submitted: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(expected) || Buffer.byteLength(submitted, 'utf8') < 32 || Buffer.byteLength(submitted, 'utf8') > 1024) return false;
  const actual = createHash('sha256').update(submitted, 'utf8').digest();
  return timingSafeEqual(Buffer.from(expected, 'hex'), actual);
}

/**
 * Isolated transaction: secret verification, collision check, owner creation,
 * audit and consumption serialize on the same singleton row. The result never
 * contains credentials. A denied attempt commits its audit record.
 *
 * Not a usable bootstrap procedure until an authenticated operator channel,
 * MFA enrollment and first-login password rotation are implemented.
 */
export async function bootstrapFounder(database: Kysely<Database>, input: FounderBootstrapInput): Promise<'created' | 'denied'> {
  const requestId = randomUUID();
  const acceptableInput = validSecret(input.expectedSecretSha256, input.submittedSecret)
    && input.initialPassword.length >= 14 && input.initialPassword.length <= 200
    && /[a-zA-Z]/.test(input.initialPassword) && /[^a-zA-Z]/.test(input.initialPassword)
    && input.name.trim().length >= 1 && input.name.trim().length <= 80;

  try {
    return await database.transaction().execute(async (trx) => {
      const state = await trx.selectFrom('founder_bootstrap_state').selectAll().where('singleton', '=', true).forUpdate().executeTakeFirstOrThrow();
      const deny = async (): Promise<'denied'> => {
        await trx.insertInto('founder_security_audit').values({ event_type: 'bootstrap', actor_id: null, actor_role: 'system', target_id: null, outcome: 'denied', request_id: requestId }).execute();
        return 'denied';
      };
      if (!acceptableInput || state.consumed_at !== null) return deny();
      if (await trx.selectFrom('founder_accounts').select('id').where('role', '=', 'owner').executeTakeFirst()) return deny();

      // Block ordinary registration while checking the pre-existing account rule.
      // A matching normal user must not be elevated or implicitly verified.
      await sql`LOCK TABLE users IN SHARE MODE`.execute(trx);
      if (await trx.selectFrom('users').select('id').where('email', '=', INITIAL_FOUNDER_EMAIL).executeTakeFirst()) return deny();
      if (await trx.selectFrom('founder_accounts').select('id').where('email', '=', INITIAL_FOUNDER_EMAIL).executeTakeFirst()) return deny();

      const account = await trx.insertInto('founder_accounts').values({
        email: INITIAL_FOUNDER_EMAIL,
        name: input.name.trim(),
        password_hash: await hashPassword(input.initialPassword),
        role: 'owner',
        status: 'pending',
        password_rotation_required: true,
        mfa_enrolled_at: null,
        last_login_at: null,
        last_failed_login_at: null,
        password_changed_at: null,
        locked_until: null
      }).returning('id').executeTakeFirstOrThrow();
      await trx.updateTable('founder_bootstrap_state').set({ consumed_at: new Date(), founder_id: account.id }).where('singleton', '=', true).execute();
      await trx.insertInto('founder_security_audit').values({ event_type: 'bootstrap', actor_id: null, actor_role: 'system', target_id: account.id, outcome: 'success', request_id: requestId }).execute();
      return 'created';
    });
  } catch {
    // Do not propagate driver errors, which may contain sensitive row values. A
    // separate failure record is best-effort if the database itself is down.
    try {
      await database.insertInto('founder_security_audit').values({ event_type: 'bootstrap', actor_id: null, actor_role: 'system', target_id: null, outcome: 'failure', request_id: requestId }).execute();
    } catch { /* The caller must alert on the generic failure; no secret is logged here. */ }
    throw new Error('Founder bootstrap failed');
  }
}
