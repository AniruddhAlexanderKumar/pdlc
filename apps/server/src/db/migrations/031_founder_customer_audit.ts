import { sql, type Kysely } from 'kysely';

// Extends the fixed event vocabulary without storing customer data in the audit.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE founder_security_audit DROP CONSTRAINT founder_security_audit_event_known`.execute(db);
  await sql`ALTER TABLE founder_security_audit ADD CONSTRAINT founder_security_audit_event_known CHECK (event_type IN (
    'bootstrap', 'bootstrap_rate_limited', 'login_password', 'mfa_enrollment_started', 'mfa_enrolled',
    'mfa_verification', 'session_created', 'session_revoked', 'logout', 'password_changed',
    'password_recovery_requested', 'password_recovery_issued', 'password_recovery_denied', 'password_recovery_completed',
    'mfa_reset', 'role_changed', 'account_suspended', 'account_disabled',
    'customer_created', 'customer_suspended', 'customer_reactivated'
  ))`.execute(db);
}
export async function down(): Promise<void> { throw new Error('Founder audit security state cannot be rolled back automatically'); }
