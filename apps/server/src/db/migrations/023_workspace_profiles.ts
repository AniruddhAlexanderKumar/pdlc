import { sql, type Kysely } from 'kysely';

/** Additive; existing workspaces remain unconfigured until an owner/admin saves setup. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE workspace_profiles (
      workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
      revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
      profile jsonb NOT NULL CHECK (jsonb_typeof(profile) = 'object'),
      updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
}
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS workspace_profiles`.execute(db);
}
