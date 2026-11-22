import { sql, type Kysely } from 'kysely';

/**
 * Journey-first architecture: every project owns one Journey.
 *
 * Adds the journey entity tables (journey → stages → activities → dependencies),
 * attaches existing work to them (issues.stage_id for tasks, design_documents /
 * cad_documents journey_activity_id for Design Studio artefacts), and nothing
 * else. Existing tables, columns and rows are untouched; the link columns are
 * nullable so every historical record stays exactly as it was.
 *
 * Journeys for pre-existing projects are created lazily on first open by
 * `ensureProjectJourney`, so this migration needs no data backfill and cannot
 * fail on legacy rows.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE project_journeys (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
      name text NOT NULL DEFAULT 'Journey',
      template text NOT NULL DEFAULT 'general'
        CHECK (template IN ('hardware', 'software', 'research', 'general')),
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE journey_stages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      journey_id uuid NOT NULL REFERENCES project_journeys(id) ON DELETE CASCADE,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name text NOT NULL,
      description text NOT NULL DEFAULT '',
      position integer NOT NULL CHECK (position >= 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (journey_id, position)
    );
    CREATE INDEX journey_stages_project_idx ON journey_stages (project_id, position);

    CREATE TABLE journey_activities (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      stage_id uuid NOT NULL REFERENCES journey_stages(id) ON DELETE CASCADE,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      kind text NOT NULL
        CHECK (kind IN ('requirement', 'milestone', 'deliverable', 'document', 'approval', 'decision', 'risk')),
      title text NOT NULL,
      description text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'not_started'
        CHECK (status IN ('not_started', 'in_progress', 'blocked', 'in_review', 'completed')),
      priority text NOT NULL DEFAULT 'Medium'
        CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
      assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
      due_at timestamptz,
      position integer NOT NULL DEFAULT 0,
      blocked_reason text NOT NULL DEFAULT '',
      review_state text NOT NULL DEFAULT 'none'
        CHECK (review_state IN ('none', 'pending', 'approved', 'changes_requested')),
      reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at timestamptz,
      review_note text NOT NULL DEFAULT '',
      completed_at timestamptz,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX journey_activities_stage_idx ON journey_activities (stage_id, position);
    CREATE INDEX journey_activities_project_idx ON journey_activities (project_id);
    CREATE INDEX journey_activities_assignee_idx ON journey_activities (assignee_id);

    CREATE TABLE journey_dependencies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      activity_id uuid NOT NULL REFERENCES journey_activities(id) ON DELETE CASCADE,
      depends_on_id uuid NOT NULL REFERENCES journey_activities(id) ON DELETE CASCADE,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (activity_id, depends_on_id),
      CONSTRAINT journey_dependency_not_self CHECK (activity_id <> depends_on_id)
    );
    CREATE INDEX journey_dependencies_depends_idx ON journey_dependencies (depends_on_id);

    -- Tasks (issues) attach to the stage whose Journey they belong to.
    ALTER TABLE issues ADD COLUMN stage_id uuid REFERENCES journey_stages(id) ON DELETE SET NULL;
    CREATE INDEX issues_stage_idx ON issues (stage_id) WHERE stage_id IS NOT NULL;

    -- Design Studio artefacts attach to the journey activity that needs them.
    ALTER TABLE design_documents ADD COLUMN journey_activity_id uuid
      REFERENCES journey_activities(id) ON DELETE SET NULL;
    ALTER TABLE cad_documents ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
    ALTER TABLE cad_documents ADD COLUMN journey_activity_id uuid
      REFERENCES journey_activities(id) ON DELETE SET NULL;
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE cad_documents DROP COLUMN IF EXISTS journey_activity_id;
    ALTER TABLE cad_documents DROP COLUMN IF EXISTS project_id;
    ALTER TABLE design_documents DROP COLUMN IF EXISTS journey_activity_id;
    ALTER TABLE issues DROP COLUMN IF EXISTS stage_id;
    DROP TABLE IF EXISTS journey_dependencies;
    DROP TABLE IF EXISTS journey_activities;
    DROP TABLE IF EXISTS journey_stages;
    DROP TABLE IF EXISTS project_journeys;
  `.execute(db);
}
