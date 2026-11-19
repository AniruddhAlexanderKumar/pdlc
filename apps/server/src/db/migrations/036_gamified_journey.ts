import { sql, type Kysely } from 'kysely';

/**
 * Persistence for the gamified PDLC journey (worlds → units → lessons → checkpoints).
 *
 * Two kinds of table here:
 *
 *  1. **Journey state** — `lesson_progress`, `journey_checkpoints`. These record
 *     that a founder actually took a lesson or submitted a checkpoint. They are
 *     the *only* place completion is stored, and they never replace derived
 *     evidence: a lesson is only complete when its bound record also exists.
 *
 *  2. **Curriculum-bound records** — research, requirements, tests, decisions and
 *     feedback. The lessons write to these, and the checkpoints read them. They
 *     are ordinary product records, scoped to the workspace, so they are usable
 *     outside the journey too.
 *
 * Existing XP, achievements, activity records and stage gating are untouched:
 * lesson XP is written through the existing `xp_events` ledger, which already
 * de-duplicates on (workspace, user, kind, ref).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Lesson completions ──────────────────────────────────────────────────
  await sql`
    CREATE TABLE lesson_progress (
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id text NOT NULL,
      status text NOT NULL DEFAULT 'completed',
      evidence text NOT NULL DEFAULT '',
      xp_awarded integer NOT NULL DEFAULT 0,
      completed_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (product_id, user_id, lesson_id),
      CONSTRAINT lesson_progress_status_known CHECK (status IN ('in_progress', 'completed', 'needs_review', 'legacy'))
    )
  `.execute(db);
  await sql`CREATE INDEX lesson_progress_lesson_idx ON lesson_progress (product_id, lesson_id)`.execute(db);

  // ── Checklist ticks inside a lesson ─────────────────────────────────────
  await sql`
    CREATE TABLE lesson_checklist_items (
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id text NOT NULL,
      item_id text NOT NULL,
      checked_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (product_id, user_id, lesson_id, item_id)
    )
  `.execute(db);

  // ── Checkpoint submissions ──────────────────────────────────────────────
  await sql`
    CREATE TABLE journey_checkpoints (
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      checkpoint_id text NOT NULL,
      status text NOT NULL DEFAULT 'submitted',
      results jsonb NOT NULL DEFAULT '[]'::jsonb,
      evidence text NOT NULL DEFAULT '',
      submitted_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (product_id, user_id, checkpoint_id),
      CONSTRAINT journey_checkpoint_status_known CHECK (status IN ('submitted', 'passed', 'failed'))
    )
  `.execute(db);

  // ── Curriculum-bound product records ────────────────────────────────────
  // Research entries: customer discovery, competitors, evidence.
  await sql`
    CREATE TABLE research_entries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      kind text NOT NULL,
      title text NOT NULL,
      detail text NOT NULL DEFAULT '',
      source text NOT NULL DEFAULT '',
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`CREATE INDEX research_entries_product_idx ON research_entries (product_id, kind)`.execute(db);

  // Requirements: MVP, features, design specifications.
  await sql`
    CREATE TABLE requirements (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      kind text NOT NULL,
      text text NOT NULL,
      detail text NOT NULL DEFAULT '',
      priority text NOT NULL DEFAULT 'should',
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT requirement_priority_known CHECK (priority IN ('must', 'should', 'could'))
    )
  `.execute(db);
  await sql`CREATE INDEX requirements_product_idx ON requirements (product_id, kind)`.execute(db);

  // Test results against a requirement.
  await sql`
    CREATE TABLE test_results (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      requirement_id uuid REFERENCES requirements(id) ON DELETE SET NULL,
      name text NOT NULL,
      result text NOT NULL,
      outcome text NOT NULL DEFAULT 'pass',
      tested_at timestamptz NOT NULL DEFAULT now(),
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT test_outcome_known CHECK (outcome IN ('pass', 'fail', 'partial'))
    )
  `.execute(db);
  await sql`CREATE INDEX test_results_product_idx ON test_results (product_id)`.execute(db);

  // Product decisions, including rejected alternatives.
  await sql`
    CREATE TABLE decisions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      kind text NOT NULL,
      decision text NOT NULL,
      rationale text NOT NULL DEFAULT '',
      alternatives text NOT NULL DEFAULT '',
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`CREATE INDEX decisions_product_idx ON decisions (product_id, kind)`.execute(db);

  // Customer feedback and the improvement backlog.
  await sql`
    CREATE TABLE feedback_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      kind text NOT NULL,
      body text NOT NULL,
      severity text NOT NULL DEFAULT 'normal',
      status text NOT NULL DEFAULT 'open',
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT feedback_severity_known CHECK (severity IN ('low', 'normal', 'high', 'blocker')),
      CONSTRAINT feedback_status_known CHECK (status IN ('open', 'planned', 'done', 'wont_fix'))
    )
  `.execute(db);
  await sql`CREATE INDEX feedback_items_product_idx ON feedback_items (product_id, kind, status)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP TABLE IF EXISTS feedback_items, decisions, test_results, requirements,
      research_entries, journey_checkpoints, lesson_checklist_items, lesson_progress CASCADE
  `.execute(db);
}
