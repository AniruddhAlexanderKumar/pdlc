import { sql, type Kysely } from "kysely";
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
  ALTER TABLE access_requests ADD COLUMN proposed_pricing_snapshot jsonb;
  ALTER TABLE access_requests DROP CONSTRAINT access_requests_status_check;
  ALTER TABLE access_requests ADD CONSTRAINT access_requests_status_check CHECK (status IN ('pending','reviewing','needs_info','approved','declined'));
  CREATE TABLE access_request_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES access_requests(id) ON DELETE CASCADE, actor_id uuid REFERENCES users(id) ON DELETE SET NULL, old_status text NOT NULL, new_status text NOT NULL, proposal_snapshot jsonb, created_at timestamptz NOT NULL DEFAULT now());
  CREATE INDEX access_request_events_request_idx ON access_request_events(request_id, created_at DESC);
 `.execute(db);
}
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS access_request_events; ALTER TABLE access_requests DROP COLUMN proposed_pricing_snapshot; UPDATE access_requests SET status='reviewing' WHERE status='needs_info'; ALTER TABLE access_requests DROP CONSTRAINT access_requests_status_check; ALTER TABLE access_requests ADD CONSTRAINT access_requests_status_check CHECK (status IN ('pending','reviewing','approved','declined'))`.execute(
    db,
  );
}
