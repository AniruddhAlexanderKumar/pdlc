import { sql, type Kysely } from 'kysely';

/** Additive, isolated founder identity and bootstrap state. No founder API is enabled. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE founder_accounts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
      email text NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
      password_hash text NOT NULL CHECK (password_hash LIKE 'scrypt$%'),
      role text NOT NULL CHECK (role IN ('owner', 'admin', 'operations')),
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'disabled')),
      password_rotation_required boolean NOT NULL DEFAULT true,
      mfa_enrolled_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_login_at timestamptz,
      last_failed_login_at timestamptz,
      password_changed_at timestamptz,
      failed_logins integer NOT NULL DEFAULT 0 CHECK (failed_logins >= 0),
      locked_until timestamptz,
      session_version integer NOT NULL DEFAULT 1 CHECK (session_version > 0),
      CONSTRAINT founder_active_requires_mfa CHECK (status <> 'active' OR (mfa_enrolled_at IS NOT NULL AND NOT password_rotation_required))
    );
    CREATE TABLE founder_bootstrap_state (
      singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
      consumed_at timestamptz,
      founder_id uuid REFERENCES founder_accounts(id) ON DELETE RESTRICT,
      CHECK ((consumed_at IS NULL) = (founder_id IS NULL))
    );
    INSERT INTO founder_bootstrap_state (singleton) VALUES (true);
    CREATE TABLE founder_security_audit (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 80),
      actor_id uuid,
      actor_role text NOT NULL CHECK (actor_role IN ('system', 'owner', 'admin', 'operations')),
      target_id uuid,
      outcome text NOT NULL CHECK (outcome IN ('success', 'denied', 'failure')),
      request_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE FUNCTION reject_founder_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'founder security audit is append-only'; END;
    $$;
    CREATE TRIGGER founder_audit_immutable_rows BEFORE UPDATE OR DELETE ON founder_security_audit
      FOR EACH ROW EXECUTE FUNCTION reject_founder_audit_mutation();
    CREATE TRIGGER founder_audit_immutable_truncate BEFORE TRUNCATE ON founder_security_audit
      FOR EACH STATEMENT EXECUTE FUNCTION reject_founder_audit_mutation();
  `.execute(db);
}

// Refuse to silently delete security state and evidence during rollback.
export async function down(): Promise<void> {
  throw new Error('Founder security state cannot be rolled back automatically');
}
