import { sql, type Kysely } from 'kysely';

/**
 * Backward-compatible stage gating.
 *
 * Gating means a product can only move forward once the current stage's quest is
 * complete. Products created before gating existed may sit mid-journey with an
 * unfinished checklist, and must not be frozen by the change.
 *
 * Rather than a per-product allow-list, we record the lifecycle position each
 * product already occupied at migration time as its "legacy stage". Anything at
 * or behind that stage stays reachable, so existing progress is preserved
 * exactly, while forward movement is still gated from the normal rules.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS legacy_stage text`.execute(db);
  // Snapshot current position for every product that exists today.
  await sql`UPDATE products SET legacy_stage = stage WHERE legacy_stage IS NULL`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE products DROP COLUMN IF EXISTS legacy_stage`.execute(db);
}
