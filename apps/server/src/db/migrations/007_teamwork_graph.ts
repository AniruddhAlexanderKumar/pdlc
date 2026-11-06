import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE issue_relationships (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      source_issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      target_issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      relationship_type text NOT NULL CHECK (relationship_type IN ('depends_on', 'relates_to')),
      description text NOT NULL DEFAULT '',
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (source_issue_id <> target_issue_id),
      UNIQUE (workspace_id, source_issue_id, target_issue_id, relationship_type)
    );
    CREATE INDEX issue_relationships_source_idx ON issue_relationships (workspace_id, source_issue_id);
    CREATE INDEX issue_relationships_target_idx ON issue_relationships (workspace_id, target_issue_id);
    CREATE TABLE issue_relationship_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      relationship_id uuid NOT NULL,
      source_issue_id uuid NOT NULL,
      target_issue_id uuid NOT NULL,
      relationship_type text NOT NULL,
      description text NOT NULL DEFAULT '',
      action text NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
      actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX issue_relationship_events_lookup_idx ON issue_relationship_events (workspace_id, relationship_id, created_at DESC);
  `.execute(db);
}
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS issue_relationship_events; DROP TABLE IF EXISTS issue_relationships`.execute(db);
}
