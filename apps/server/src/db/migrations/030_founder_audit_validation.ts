import { sql, type Kysely } from 'kysely';

/** No free-form event strings; existing typed fields cannot contain credentials. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    REVOKE ALL ON founder_security_audit FROM PUBLIC;
    ALTER TABLE founder_security_audit ADD CONSTRAINT founder_security_audit_event_known CHECK (event_type IN (
      'bootstrap', 'bootstrap_rate_limited', 'login_password', 'mfa_enrollment_started', 'mfa_enrolled',
      'mfa_verification', 'session_created', 'session_revoked', 'logout', 'password_changed',
      'password_recovery_requested', 'password_recovery_issued', 'password_recovery_denied', 'password_recovery_completed',
      'mfa_reset', 'role_changed', 'account_suspended', 'account_disabled'
    ));
  `.execute(db);
}
export async function down(): Promise<void> { throw new Error('Founder audit security state cannot be rolled back automatically'); }
