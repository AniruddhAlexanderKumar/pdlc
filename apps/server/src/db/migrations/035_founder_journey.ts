import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE products ADD COLUMN product_kind text NOT NULL DEFAULT 'other' CHECK (product_kind IN ('physical','software','service','other'));
    ALTER TABLE users ADD COLUMN guide_mode text NOT NULL DEFAULT 'beginner' CHECK (guide_mode IN ('beginner','advanced')),
                      ADD COLUMN show_streak boolean NOT NULL DEFAULT false;
    ALTER TABLE workspaces ADD COLUMN show_leaderboard boolean NOT NULL DEFAULT true;
    -- Older tasks have no known chapter. Let the owner link them; do not guess.
    ALTER TABLE tasks ADD COLUMN chapter text CHECK (chapter IN ('Idea','Research','Planning','Design','Prototype','Testing','Launch','Improvement','Retired'));
    CREATE TABLE activity_drafts (
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_key text NOT NULL, value jsonb NOT NULL, previous_value jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(product_id,user_id,question_key)
    );
    CREATE INDEX activity_drafts_resume ON activity_drafts(user_id, updated_at DESC);
    -- Preserve actual return paths for products that had moved since 033. A
    -- high-water mark allows a revisit, not a claim of chapter completion.
    WITH stages AS (SELECT ARRAY['Idea','Research','Planning','Design','Prototype','Testing','Launch','Improvement'] AS path),
    reached AS (SELECT h.product_id, max(array_position(s.path,h.to_stage)) AS n FROM stage_history h CROSS JOIN stages s GROUP BY h.product_id)
    UPDATE products p SET legacy_stage=s.path[greatest(array_position(s.path,p.legacy_stage),array_position(s.path,p.stage),r.n)]
      FROM reached r, stages s WHERE r.product_id=p.id AND p.legacy_stage IS DISTINCT FROM 'Retired';
    -- Only backfill from recorded work. Never manufacture a reviewer, change
    -- an existing collaboration record, infer demand, or credit XP on upgrade.
    INSERT INTO activity_records(product_id,activity_key,status,started_at,completed_at,completed_by)
      SELECT product_id,question_key, CASE WHEN signoff THEN 'in_progress' ELSE 'completed' END,answered_at,
        CASE WHEN NOT signoff THEN answered_at END,CASE WHEN NOT signoff THEN answered_by END
      FROM (SELECT a.*,question_key IN ('research.validated','design.must_haves','testing.criteria') AS signoff FROM answers a
        WHERE value NOT IN ('null'::jsonb,'""'::jsonb,'[]'::jsonb)) recorded
      ON CONFLICT(product_id,activity_key) DO NOTHING;
    -- Grandfather real credits without deleting or changing their points. Future
    -- retries by *any teammate* conflict with the first credit for this work.
    ALTER TABLE xp_events ADD COLUMN first_credit boolean NOT NULL DEFAULT true;
    WITH credits AS (SELECT id,row_number() OVER (PARTITION BY workspace_id,kind,ref ORDER BY created_at,id) AS n FROM xp_events)
    UPDATE xp_events x SET first_credit=false FROM credits WHERE x.id=credits.id AND credits.n>1;
    CREATE UNIQUE INDEX xp_work_once ON xp_events(workspace_id,kind,ref) WHERE first_credit;
  `.execute(db);
}
// Dropping private drafts or the credit fence is destructive. Roll forward,
// or restore the matching pre-upgrade database backup and application image.
export async function down(): Promise<void> {
  throw new Error('Refusing to discard saved founder work and reward history');
}
