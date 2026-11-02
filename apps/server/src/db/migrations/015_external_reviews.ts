import { sql, type Kysely } from "kysely";
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
 ALTER TABLE workspaces ADD COLUMN allow_unrestricted_reviews boolean NOT NULL DEFAULT false;
 CREATE TABLE external_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE, created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE, title text NOT NULL, instructions text NOT NULL DEFAULT '',
  expires_at timestamptz, revoked_at timestamptz, reviewer_email text, show_links boolean NOT NULL DEFAULT false,
  access_count integer NOT NULL DEFAULT 0, last_accessed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
 );
 CREATE INDEX external_reviews_workspace_idx ON external_reviews(workspace_id, created_at DESC);
 CREATE TABLE external_review_issues (review_id uuid NOT NULL REFERENCES external_reviews(id) ON DELETE CASCADE, issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE, PRIMARY KEY(review_id, issue_id));
 CREATE TABLE external_review_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), review_id uuid NOT NULL REFERENCES external_reviews(id) ON DELETE CASCADE, event_type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
 CREATE INDEX external_review_events_review_idx ON external_review_events(review_id, created_at DESC);
 CREATE TABLE external_review_challenges (review_id uuid PRIMARY KEY REFERENCES external_reviews(id) ON DELETE CASCADE, code_hash text NOT NULL, expires_at timestamptz NOT NULL, sent_at timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0);
 CREATE TABLE external_review_sessions (id text PRIMARY KEY, review_id uuid NOT NULL REFERENCES external_reviews(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL);
 CREATE INDEX external_review_sessions_expiry_idx ON external_review_sessions(expires_at);
 `.execute(db);
}
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS external_review_sessions, external_review_challenges, external_review_events, external_review_issues, external_reviews; ALTER TABLE workspaces DROP COLUMN allow_unrestricted_reviews`.execute(
    db,
  );
}
