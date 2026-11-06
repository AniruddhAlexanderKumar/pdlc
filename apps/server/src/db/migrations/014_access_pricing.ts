import { sql, type Kysely } from "kysely";
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE access_requests ADD COLUMN country text, ADD COLUMN pricing_snapshot jsonb`.execute(
    db,
  );
}
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE access_requests DROP COLUMN pricing_snapshot, DROP COLUMN country`.execute(
    db,
  );
}
