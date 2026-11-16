import { sql, type Kysely } from 'kysely';

/**
 * Collaboration metadata for journey activities (iteration 2).
 *
 * Journey activities are *derived* from existing data: a question key
 * (`idea.problem`) or a quest item id (`bom`, `price`). They are not rows in a
 * separate table anywhere, so there is nothing to duplicate. These tables only
 * attach ownership, status, review state and discussion to those derived keys.
 *
 * That keeps `stageQuest()` the single source of truth for whether a stage's
 * requirements are satisfied — this migration adds no completion flags that
 * could disagree with it.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE activity_records (
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      activity_key text NOT NULL,
      status text NOT NULL DEFAULT 'not_started',
      assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
      review_state text NOT NULL DEFAULT 'none',
      review_requested_at timestamptz,
      reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at timestamptz,
      review_note text NOT NULL DEFAULT '',
      started_at timestamptz,
      completed_at timestamptz,
      completed_by uuid REFERENCES users(id) ON DELETE SET NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (product_id, activity_key),
      CONSTRAINT activity_status_known CHECK (status IN ('not_started', 'in_progress', 'needs_review', 'completed', 'blocked')),
      CONSTRAINT activity_review_known CHECK (review_state IN ('none', 'pending', 'approved', 'changes_requested'))
    )
  `.execute(db);
  await sql`CREATE INDEX player_activity_assignee_idx ON activity_records (assignee_id)`.execute(db);

  await sql`
    CREATE TABLE activity_comments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      activity_key text NOT NULL,
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      body text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`CREATE INDEX activity_comments_activity_idx ON activity_comments (product_id, activity_key, created_at)`.execute(db);

  await sql`
    CREATE TABLE activity_dependencies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      activity_key text NOT NULL,
      depends_on_key text NOT NULL,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (product_id, activity_key, depends_on_key),
      CONSTRAINT activity_dependency_not_self CHECK (activity_key <> depends_on_key)
    )
  `.execute(db);

  await sql`
    CREATE TABLE notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind text NOT NULL,
      product_id uuid REFERENCES products(id) ON DELETE CASCADE,
      activity_key text,
      title text NOT NULL,
      body text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      read_at timestamptz,
      CONSTRAINT notification_kind_known CHECK (kind IN (
        'activity_assigned', 'activity_reassigned', 'review_requested',
        'review_approved', 'review_changes_requested', 'blocker_resolved', 'stage_completed'
      ))
    )
  `.execute(db);
  await sql`CREATE INDEX notifications_inbox_idx ON notifications (user_id, read_at, created_at)`.execute(db);

  // Per-user preferences. Absent row means "everything on" — the sensible default
  // that keeps behaviour unchanged for existing accounts.
  await sql`
    CREATE TABLE notification_preferences (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      assignments boolean NOT NULL DEFAULT true,
      reviews boolean NOT NULL DEFAULT true,
      blockers boolean NOT NULL DEFAULT true,
      stages boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS notification_preferences, notifications, activity_dependencies, activity_comments, activity_records`.execute(db);
}
