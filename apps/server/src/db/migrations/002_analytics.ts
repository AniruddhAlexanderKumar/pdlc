import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE analytics_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type text NOT NULL,
      event_name text NOT NULL,
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
      session_id text,
      anonymous_id text,
      page_path text,
      page_title text,
      referrer text,
      user_agent text,
      ip text,
      metadata jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX analytics_events_created_at_idx ON analytics_events (created_at DESC);
    CREATE INDEX analytics_events_user_idx ON analytics_events (user_id);
    CREATE INDEX analytics_events_workspace_idx ON analytics_events (workspace_id);
    CREATE INDEX analytics_events_type_idx ON analytics_events (event_type);
    CREATE INDEX analytics_events_name_idx ON analytics_events (event_name);
    CREATE INDEX analytics_events_path_idx ON analytics_events (page_path);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP TABLE IF EXISTS analytics_events CASCADE;
  `.execute(db);
}
