import { sql, type Kysely } from 'kysely';

// Additive: stores 3D CAD models and versioned STL artifacts associated with workspace products.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE product_cad_models (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
      filename text NOT NULL CHECK (length(filename) BETWEEN 1 AND 255),
      format text NOT NULL DEFAULT 'stl' CHECK (format IN ('stl', 'obj', 'step')),
      file_size integer NOT NULL CHECK (file_size > 0),
      head_revision integer NOT NULL DEFAULT 1 CHECK (head_revision > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_product_cad UNIQUE (workspace_id, product_id)
    );

    CREATE INDEX idx_product_cad_models_product ON product_cad_models(product_id);
    CREATE INDEX idx_product_cad_models_workspace ON product_cad_models(workspace_id, updated_at DESC);

    CREATE TABLE product_cad_revisions (
      model_id uuid NOT NULL REFERENCES product_cad_models(id) ON DELETE CASCADE,
      revision integer NOT NULL CHECK (revision > 0),
      stl_data bytea NOT NULL,
      byte_size integer NOT NULL CHECK (byte_size > 0),
      author_id uuid REFERENCES users(id) ON DELETE SET NULL,
      summary text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (model_id, revision)
    );
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP TABLE IF EXISTS product_cad_revisions;
    DROP TABLE IF EXISTS product_cad_models;
  `.execute(db);
}

