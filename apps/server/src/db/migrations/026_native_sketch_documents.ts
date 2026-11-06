import { sql, type Kysely } from 'kysely';
// Additive tables; sketch content is stored as editable, versioned JSON, not render output.
export async function up(db:Kysely<unknown>):Promise<void> {
 await sql`CREATE TABLE cad_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  head_revision integer NOT NULL DEFAULT 1 CHECK (head_revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
 );
 CREATE INDEX cad_documents_workspace_updated_idx ON cad_documents(workspace_id, updated_at DESC) WHERE archived_at IS NULL;
 CREATE TABLE cad_document_revisions (
  document_id uuid NOT NULL REFERENCES cad_documents(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  source jsonb NOT NULL, author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(document_id,revision)
 );`.execute(db);
}
// Destructive for all CAD documents/revisions. Back up and export before rollback.
export async function down(db:Kysely<unknown>):Promise<void> { await sql`DROP TABLE IF EXISTS cad_document_revisions; DROP TABLE IF EXISTS cad_documents`.execute(db); }
