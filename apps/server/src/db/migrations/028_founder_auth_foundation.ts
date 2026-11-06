import { sql, type Kysely } from 'kysely';

// Additive authentication storage. This migration does not enable an API.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE founder_accounts ADD COLUMN totp_ciphertext text;
    ALTER TABLE founder_accounts ADD COLUMN totp_last_step bigint;
    ALTER TABLE founder_accounts ADD CONSTRAINT founder_active_has_totp
      CHECK (status <> 'active' OR (totp_ciphertext IS NOT NULL AND mfa_enrolled_at IS NOT NULL));
    CREATE TABLE founder_auth_flows (
      token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
      founder_id uuid NOT NULL REFERENCES founder_accounts(id) ON DELETE CASCADE,
      session_version integer NOT NULL CHECK (session_version > 0),
      stage text NOT NULL CHECK (stage IN ('enroll', 'verify', 'rotate')),
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX founder_auth_flows_founder_idx ON founder_auth_flows(founder_id);
    CREATE TABLE founder_sessions (
      token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
      founder_id uuid NOT NULL REFERENCES founder_accounts(id) ON DELETE CASCADE,
      session_version integer NOT NULL CHECK (session_version > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      idle_expires_at timestamptz NOT NULL,
      absolute_expires_at timestamptz NOT NULL,
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      CHECK (idle_expires_at <= absolute_expires_at)
    );
    CREATE INDEX founder_sessions_founder_idx ON founder_sessions(founder_id);
    CREATE TABLE founder_recovery_codes (
      founder_id uuid NOT NULL REFERENCES founder_accounts(id) ON DELETE CASCADE,
      code_hash text NOT NULL CHECK (code_hash ~ '^[a-f0-9]{64}$'),
      used_at timestamptz,
      PRIMARY KEY (founder_id, code_hash)
    );
    CREATE TABLE founder_password_recoveries (
      token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
      founder_id uuid NOT NULL REFERENCES founder_accounts(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX founder_password_recoveries_founder_idx ON founder_password_recoveries(founder_id);
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Founder authentication state cannot be rolled back automatically');
}
