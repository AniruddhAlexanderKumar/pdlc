import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users ADD COLUMN is_admin boolean NOT NULL DEFAULT false`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE users DROP COLUMN IF EXISTS is_admin`.execute(db);
}
