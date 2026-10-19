import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL,
      name text NOT NULL,
      password_hash text NOT NULL,
      is_disabled boolean NOT NULL DEFAULT false,
      failed_logins integer NOT NULL DEFAULT 0,
      locked_until timestamptz,
      last_login_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT users_email_lower CHECK (email = lower(email))
    );
    CREATE UNIQUE INDEX users_email_key ON users (email);

    CREATE TABLE workspaces (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      currency text NOT NULL DEFAULT 'USD',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE memberships (
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, user_id)
    );
    CREATE INDEX memberships_user_idx ON memberships (user_id);

    CREATE TABLE sessions (
      id text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      user_agent text,
      ip text
    );
    CREATE INDEX sessions_user_idx ON sessions (user_id);
    CREATE INDEX sessions_expires_idx ON sessions (expires_at);

    CREATE TABLE invites (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      role text NOT NULL CHECK (role IN ('admin', 'member')),
      created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      used_by uuid REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE password_resets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      used_at timestamptz
    );

    CREATE TABLE suppliers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name text NOT NULL,
      website text NOT NULL DEFAULT '',
      contact text NOT NULL DEFAULT '',
      notes text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX suppliers_workspace_idx ON suppliers (workspace_id);

    CREATE TABLE materials (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name text NOT NULL,
      category text NOT NULL,
      unit text NOT NULL,
      unit_price numeric(14, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
      description text NOT NULL DEFAULT '',
      source_url text NOT NULL DEFAULT '',
      notes text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX materials_workspace_idx ON materials (workspace_id);

    CREATE TABLE material_quotes (
      material_id uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      quoted_price numeric(14, 2) NOT NULL CHECK (quoted_price >= 0),
      moq integer CHECK (moq IS NULL OR moq >= 1),
      PRIMARY KEY (material_id, supplier_id)
    );
    CREATE INDEX material_quotes_supplier_idx ON material_quotes (supplier_id);

    CREATE TABLE products (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name text NOT NULL,
      category text NOT NULL DEFAULT 'General',
      stage text NOT NULL,
      image_url text NOT NULL DEFAULT '',
      description text NOT NULL DEFAULT '',
      notes text NOT NULL DEFAULT '',
      target_price numeric(14, 2) CHECK (target_price IS NULL OR target_price >= 0),
      labour numeric(14, 2) NOT NULL DEFAULT 0 CHECK (labour >= 0),
      packaging numeric(14, 2) NOT NULL DEFAULT 0 CHECK (packaging >= 0),
      overhead numeric(14, 2) NOT NULL DEFAULT 0 CHECK (overhead >= 0),
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX products_workspace_idx ON products (workspace_id);

    CREATE TABLE product_materials (
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      material_id uuid NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      quantity numeric(14, 4) NOT NULL CHECK (quantity > 0),
      position integer NOT NULL DEFAULT 0,
      PRIMARY KEY (product_id, material_id)
    );
    CREATE INDEX product_materials_material_idx ON product_materials (material_id);

    CREATE TABLE tasks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      title text NOT NULL,
      description text NOT NULL DEFAULT '',
      status text NOT NULL CHECK (status IN ('todo', 'in_progress', 'done')),
      due_date date,
      position double precision NOT NULL DEFAULT 0,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX tasks_product_idx ON tasks (product_id);

    CREATE TABLE answers (
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      question_key text NOT NULL,
      value jsonb NOT NULL,
      answered_by uuid REFERENCES users(id) ON DELETE SET NULL,
      answered_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (product_id, question_key)
    );

    CREATE TABLE stage_history (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      from_stage text,
      to_stage text NOT NULL,
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX stage_history_product_idx ON stage_history (product_id);

    CREATE TABLE xp_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id uuid REFERENCES products(id) ON DELETE SET NULL,
      kind text NOT NULL,
      ref text NOT NULL,
      points integer NOT NULL,
      label text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, user_id, kind, ref)
    );
    CREATE INDEX xp_events_user_idx ON xp_events (workspace_id, user_id, created_at DESC);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP TABLE IF EXISTS xp_events, stage_history, answers, tasks, product_materials, products,
      material_quotes, materials, suppliers, password_resets, invites, sessions, memberships,
      workspaces, users CASCADE;
  `.execute(db);
}
