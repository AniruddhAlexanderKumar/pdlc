import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Supports exact-summary duplicate candidates without adding any new records or facts.
  await sql`CREATE INDEX issues_graph_normalized_summary_idx ON issues ((lower(btrim(summary))))`.execute(db);
}
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS issues_graph_normalized_summary_idx`.execute(db);
}
