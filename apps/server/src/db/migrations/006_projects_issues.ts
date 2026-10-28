import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      project_key text NOT NULL CHECK (project_key ~ '^[A-Z][A-Z0-9]{1,9}$'),
      name text NOT NULL,
      description text NOT NULL DEFAULT '',
      next_issue_number integer NOT NULL DEFAULT 1 CHECK (next_issue_number > 0),
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, project_key)
    );
    CREATE INDEX projects_workspace_created_idx ON projects (workspace_id, created_at DESC);

    CREATE TABLE issues (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      issue_number integer NOT NULL CHECK (issue_number > 0),
      type text NOT NULL CHECK (type IN ('Task', 'Bug', 'Story')),
      status text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Done')),
      priority text NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
      summary text NOT NULL,
      description text NOT NULL DEFAULT '',
      labels text[] NOT NULL DEFAULT '{}',
      reporter_id uuid REFERENCES users(id) ON DELETE SET NULL,
      assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (project_id, issue_number)
    );
    CREATE INDEX issues_project_order_idx ON issues (project_id, issue_number DESC);
    CREATE INDEX issues_project_status_idx ON issues (project_id, status);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS issues; DROP TABLE IF EXISTS projects`.execute(db);
}
