import { sql, type Kysely } from 'kysely';

/** Older requests keep their data; new requests need not supply team size or product stage. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE access_requests ALTER COLUMN team_size DROP NOT NULL, ALTER COLUMN product_stage DROP NOT NULL`.execute(db);
}
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    UPDATE access_requests SET team_size = 'Not provided' WHERE team_size IS NULL;
    UPDATE access_requests SET product_stage = 'Not provided' WHERE product_stage IS NULL;
    ALTER TABLE access_requests ALTER COLUMN team_size SET NOT NULL, ALTER COLUMN product_stage SET NOT NULL;
  `.execute(db);
}
