import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE demo_access (
      ip_hash text PRIMARY KEY CHECK (length(ip_hash) = 64),
      token_hash text NOT NULL CHECK (length(token_hash) = 64),
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX demo_access_expires_idx ON demo_access (expires_at);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  void db;
  throw new Error('Demo access history enforces one-time IP access; remove it only through an explicit reviewed data migration');
}
