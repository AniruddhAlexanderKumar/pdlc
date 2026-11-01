import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE contribution_categories (
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9-]{1,63}$'),
      name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
      description text NOT NULL DEFAULT '',
      applicable_dimensions jsonb NOT NULL DEFAULT '["impact","quality","complexity","collaboration","effort"]'::jsonb,
      active boolean NOT NULL DEFAULT true,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, key)
    );

    CREATE TABLE contribution_rubrics (
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      version text NOT NULL,
      weights jsonb NOT NULL,
      conversion text NOT NULL CHECK (conversion = 'one_point_per_score_point'),
      active boolean NOT NULL DEFAULT false,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      activated_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      activated_at timestamptz,
      PRIMARY KEY (workspace_id, version)
    );
    CREATE UNIQUE INDEX contribution_rubrics_one_active_idx ON contribution_rubrics (workspace_id) WHERE active;

    CREATE TABLE contributions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      submitted_by uuid REFERENCES users(id) ON DELETE SET NULL,
      idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
      category_key text NOT NULL,
      title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
      description text NOT NULL CHECK (length(description) BETWEEN 1 AND 10000),
      outcome text NOT NULL DEFAULT '' CHECK (length(outcome) <= 5000),
      expected_impact text NOT NULL DEFAULT '' CHECK (length(expected_impact) <= 5000),
      project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
      issue_id uuid REFERENCES issues(id) ON DELETE SET NULL,
      task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
      product_id uuid REFERENCES products(id) ON DELETE SET NULL,
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'revision_requested', 'approved', 'rejected', 'disputed')),
      disputed_from_status text CHECK (disputed_from_status IN ('approved', 'rejected')),
      submitted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (workspace_id, category_key) REFERENCES contribution_categories(workspace_id, key) ON DELETE CASCADE,
      UNIQUE (workspace_id, submitted_by, idempotency_key)
    );
    CREATE INDEX contributions_workspace_status_date_idx ON contributions (workspace_id, status, created_at DESC);
    CREATE INDEX contributions_project_date_idx ON contributions (project_id, created_at DESC);
    CREATE INDEX contributions_issue_idx ON contributions (issue_id) WHERE issue_id IS NOT NULL;
    CREATE INDEX contributions_task_idx ON contributions (task_id) WHERE task_id IS NOT NULL;

    CREATE TABLE contribution_participants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      contribution_id uuid NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      role_description text NOT NULL CHECK (length(role_description) BETWEEN 1 AND 1000),
      contribution_description text NOT NULL CHECK (length(contribution_description) BETWEEN 1 AND 5000),
      attribution_share integer NOT NULL CHECK (attribution_share BETWEEN 1 AND 100),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (contribution_id, user_id)
    );
    CREATE INDEX contribution_participants_user_idx ON contribution_participants (user_id, contribution_id);

    CREATE TABLE contribution_evidence (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      contribution_id uuid NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
      participant_id uuid REFERENCES users(id) ON DELETE SET NULL,
      source_type text NOT NULL CHECK (source_type IN ('url', 'description', 'project', 'issue', 'task', 'product')),
      url text CHECK (url IS NULL OR length(url) <= 2000),
      description text NOT NULL CHECK (length(description) BETWEEN 1 AND 2000),
      project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
      issue_id uuid REFERENCES issues(id) ON DELETE SET NULL,
      task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
      product_id uuid REFERENCES products(id) ON DELETE SET NULL,
      verified_by uuid REFERENCES users(id) ON DELETE SET NULL,
      verified_at timestamptz,
      removed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (
        (source_type = 'url' AND url IS NOT NULL) OR
        (source_type = 'description' AND url IS NULL) OR
        (source_type = 'project' AND project_id IS NOT NULL) OR
        (source_type = 'issue' AND issue_id IS NOT NULL) OR
        (source_type = 'task' AND task_id IS NOT NULL) OR
        (source_type = 'product' AND product_id IS NOT NULL)
      )
    );
    CREATE INDEX contribution_evidence_contribution_idx ON contribution_evidence (contribution_id, created_at);

    CREATE TABLE contribution_reviews (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      contribution_id uuid NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
      actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
      decision text NOT NULL CHECK (decision IN ('submitted', 'revision_requested', 'approved', 'rejected', 'disputed', 'dispute_resolved')),
      from_status text CHECK (from_status IN ('draft', 'submitted', 'revision_requested', 'approved', 'rejected', 'disputed')),
      to_status text NOT NULL CHECK (to_status IN ('draft', 'submitted', 'revision_requested', 'approved', 'rejected', 'disputed')),
      notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 5000),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX contribution_reviews_contribution_idx ON contribution_reviews (contribution_id, created_at DESC);

    CREATE TABLE contribution_scores (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      contribution_id uuid NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      version integer NOT NULL CHECK (version > 0),
      rubric_version text NOT NULL,
      ratings jsonb NOT NULL,
      breakdown jsonb NOT NULL,
      raw_score integer NOT NULL CHECK (raw_score BETWEEN 0 AND 100),
      attribution_share integer NOT NULL CHECK (attribution_share BETWEEN 1 AND 100),
      awarded_xp integer NOT NULL CHECK (awarded_xp BETWEEN 0 AND 100),
      explanation text NOT NULL CHECK (length(explanation) BETWEEN 1 AND 5000),
      scored_by uuid REFERENCES users(id) ON DELETE SET NULL,
      supersedes_score_id uuid REFERENCES contribution_scores(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (workspace_id, rubric_version) REFERENCES contribution_rubrics(workspace_id, version) ON DELETE CASCADE,
      UNIQUE (contribution_id, user_id, version)
    );
    CREATE INDEX contribution_scores_current_idx ON contribution_scores (contribution_id, user_id, version DESC);

    CREATE TABLE contribution_awards (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      contribution_id uuid REFERENCES contributions(id) ON DELETE SET NULL,
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      score_id uuid REFERENCES contribution_scores(id) ON DELETE SET NULL,
      idempotency_key text NOT NULL,
      points integer NOT NULL CHECK (points BETWEEN -100 AND 100),
      explanation text NOT NULL CHECK (length(explanation) BETWEEN 1 AND 5000),
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, idempotency_key)
    );
    CREATE INDEX contribution_awards_user_date_idx ON contribution_awards (workspace_id, user_id, created_at DESC);

    CREATE TABLE contribution_history (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      contribution_id uuid REFERENCES contributions(id) ON DELETE SET NULL,
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
      action text NOT NULL,
      before_data jsonb,
      after_data jsonb,
      reason text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX contribution_history_contribution_idx ON contribution_history (contribution_id, created_at DESC);

    INSERT INTO contribution_categories (workspace_id, key, name, description)
      SELECT w.id, seed.key, seed.name, seed.description
      FROM workspaces w
      CROSS JOIN (VALUES
        ('product-delivery', 'Product features and deliverables', 'Features and outcomes delivered for the product.'),
        ('engineering', 'Engineering and implementation', 'Implementation, architecture, and technical execution.'),
        ('research', 'Research and technical problem solving', 'Research, discovery, and resolving uncertain problems.'),
        ('defect-prevention', 'Bug fixes and defect prevention', 'Finding, resolving, or preventing defects.'),
        ('testing-quality', 'Testing and quality improvements', 'Testing, reliability, accessibility, and quality work.'),
        ('design', 'Design and user experience', 'Product, interaction, and visual design outcomes.'),
        ('documentation', 'Documentation and knowledge sharing', 'Useful documentation and reusable knowledge.'),
        ('review', 'Code, design, or technical reviews', 'Reviews that improve quality or reduce risk.'),
        ('collaboration', 'Mentoring, collaboration, and unblocking', 'Helping teammates succeed and removing blockers.'),
        ('process-improvement', 'Initiative and process improvements', 'Improvements to team processes and internal tools.')
      ) AS seed(key, name, description);

    INSERT INTO contribution_rubrics (workspace_id, version, weights, conversion, active)
      SELECT id, 'baseline-v1', '{"impact":35,"quality":25,"complexity":20,"collaboration":10,"effort":10}'::jsonb, 'one_point_per_score_point', true
      FROM workspaces;
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  void db;
  throw new Error('Contribution data is auditable user data; back up and migrate it explicitly before rollback');
}
