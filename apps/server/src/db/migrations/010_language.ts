import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users ADD COLUMN language text CHECK (language IN ('en', 'zh', 'hi', 'es', 'fr'))`.execute(db);
}
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users DROP COLUMN IF EXISTS language`.execute(db);
}
