import { sql, type Kysely } from 'kysely';

/**
 * Open registration: email verification tokens and onboarding capture.
 *
 * Additive only. Existing accounts are treated as already known to the
 * operator, so they keep working exactly as before: no user is forced to
 * verify, re-register or re-onboard. New columns default to "nothing
 * happened", which is precisely the state existing rows should have.
 *
 * Nothing here touches pricing, subscriptions, billing history, entitlements
 * or existing workspaces, products and XP.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // Email verification. NULL means "no verification has ever been requested",
  // which is the correct reading for every pre-existing account.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz`.execute(db);
  // Explicit Terms of Service / Privacy Policy acceptance for self-registered
  // accounts. NULL for accounts created before open registration (or by an
  // operator through the admin CLI/API), who accepted nothing and are not
  // asked to retroactively.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz`.execute(db);
  await sql`
    CREATE TABLE IF NOT EXISTS email_verifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      used_at timestamptz
    )
  `.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS email_verifications_user_idx ON email_verifications (user_id)`.execute(db);

  // Onboarding answers: what the founder is building and where they start in
  // the PDLC progression. Stored per workspace so the whole team sees the same
  // starting point, never per-device.
  await sql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS onboarding jsonb`.execute(db);
  await sql`
    ALTER TABLE workspaces
    ADD CONSTRAINT workspaces_onboarding_object
    CHECK (onboarding IS NULL OR jsonb_typeof(onboarding) = 'object')
  `.execute(db).catch(() => {
    // Re-running the migration must not fail because the constraint exists.
  });
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_onboarding_object`.execute(db);
  await sql`ALTER TABLE workspaces DROP COLUMN IF EXISTS onboarding`.execute(db);
  await sql`DROP TABLE IF EXISTS email_verifications`.execute(db);
  await sql`ALTER TABLE users DROP COLUMN IF EXISTS terms_accepted_at`.execute(db);
  await sql`ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at`.execute(db);
}
