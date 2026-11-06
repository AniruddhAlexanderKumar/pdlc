import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE access_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      email text NOT NULL,
      organization text NOT NULL,
      role text NOT NULL,
      industry text NOT NULL,
      team_size text NOT NULL,
      product_stage text NOT NULL,
      current_tools text NOT NULL DEFAULT '',
      goals text NOT NULL,
      status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'reviewing', 'approved', 'declined')),
      review_note text NOT NULL DEFAULT '',
      reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX access_requests_status_created_idx ON access_requests (status, created_at DESC);
    CREATE INDEX access_requests_email_idx ON access_requests (email);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS access_requests`.execute(db);
}
