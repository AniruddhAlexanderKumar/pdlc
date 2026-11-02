import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE demo_guests (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      workspace_id uuid NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL
    );
    CREATE INDEX demo_guests_expires_idx ON demo_guests(expires_at);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Never turn temporary guest accounts into ordinary accounts on rollback.
  await sql`
    CREATE TEMP TABLE demo_rollback_ids ON COMMIT DROP AS SELECT user_id, workspace_id FROM demo_guests;
    DELETE FROM analytics_events WHERE workspace_id IN (SELECT workspace_id FROM demo_rollback_ids);
    DELETE FROM workspaces WHERE id IN (SELECT workspace_id FROM demo_rollback_ids);
    DELETE FROM users WHERE id IN (SELECT user_id FROM demo_rollback_ids);
    DROP TABLE demo_guests;
  `.execute(db);
}
