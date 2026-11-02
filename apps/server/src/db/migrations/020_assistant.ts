import { sql, type Kysely } from 'kysely';
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE assistant_conversations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
      title text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX assistant_conversations_owner_idx ON assistant_conversations(workspace_id, user_id, updated_at DESC);
    CREATE TABLE assistant_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
      role text NOT NULL CHECK(role IN ('user','assistant')), content text NOT NULL,
      sources jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX assistant_messages_conversation_idx ON assistant_messages(conversation_id, created_at, id);
    CREATE TABLE assistant_actions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid REFERENCES assistant_conversations(id) ON DELETE SET NULL,
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind text NOT NULL CHECK(kind IN ('create_project','create_issue')), payload jsonb NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled')),
      result jsonb, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
    );
    CREATE INDEX assistant_actions_owner_idx ON assistant_actions(workspace_id,user_id,created_at DESC);
    CREATE TABLE assistant_allowances (
      workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      remaining_tokens bigint NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE assistant_credit_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      actor_id uuid REFERENCES users(id) ON DELETE SET NULL, delta_tokens integer NOT NULL, balance_after bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE assistant_usage (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, conversation_id uuid REFERENCES assistant_conversations(id) ON DELETE SET NULL,
      provider text NOT NULL, model text NOT NULL, reserved_tokens integer NOT NULL, charged_tokens integer,
      status text NOT NULL CHECK(status IN ('reserved','success','failed','uncertain')), created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
    );
    CREATE INDEX assistant_usage_workspace_idx ON assistant_usage(workspace_id,created_at DESC);
  `.execute(db);
}
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE assistant_usage, assistant_credit_events, assistant_allowances, assistant_actions, assistant_messages, assistant_conversations`.execute(db);
}
