import { sql, type Kysely } from 'kysely';

/** Separate account preference so changing the shell never overwrites a dashboard layout. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users ADD COLUMN app_layout jsonb`.execute(db);
}
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users DROP COLUMN IF EXISTS app_layout`.execute(db);
}
