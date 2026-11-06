import { sql, type Kysely } from 'kysely';

// Additive; no historical product/project records are changed.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE design_documents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
      project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
      product_id uuid REFERENCES products(id) ON DELETE SET NULL,
      title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
      kind text NOT NULL CHECK (kind = 'diagram'),
      head_revision integer NOT NULL DEFAULT 1 CHECK (head_revision > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX design_documents_workspace_updated_idx ON design_documents(workspace_id, updated_at DESC);
    CREATE TABLE design_revisions (
      document_id uuid NOT NULL REFERENCES design_documents(id) ON DELETE CASCADE,
      revision integer NOT NULL CHECK (revision > 0),
      source jsonb NOT NULL,
      author_id uuid REFERENCES users(id) ON DELETE SET NULL,
      summary text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (document_id, revision)
    );
  `.execute(db);
}
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS design_revisions; DROP TABLE IF EXISTS design_documents`.execute(db);
}
