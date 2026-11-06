import { sql, type Kysely } from 'kysely';

/** Per-account dashboard layout: `{ preset }` today, `{ preset: null, items }` for custom layouts later. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users ADD COLUMN dashboard_layout jsonb`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users DROP COLUMN IF EXISTS dashboard_layout`.execute(db);
}
