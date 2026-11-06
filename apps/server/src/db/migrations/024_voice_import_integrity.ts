import { sql, type Kysely } from 'kysely';

// Additive only: historical tasks/issues are deliberately not matched or altered.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE voice_import_receipts (
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_id uuid NOT NULL,
      payload_hash text NOT NULL,
      product_id uuid REFERENCES products(id) ON DELETE SET NULL,
      project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, user_id, request_id)
    );
    CREATE TABLE voice_import_work_items (
      task_id uuid PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
      issue_id uuid NOT NULL UNIQUE REFERENCES issues(id) ON DELETE CASCADE,
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE FUNCTION validate_voice_work_item_link() RETURNS trigger AS $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM tasks t JOIN products prod ON prod.id=t.product_id
        JOIN issues i ON i.id=NEW.issue_id JOIN projects proj ON proj.id=i.project_id
        WHERE t.id=NEW.task_id AND prod.workspace_id=NEW.workspace_id AND proj.workspace_id=NEW.workspace_id
          AND t.status = CASE i.status WHEN 'Open' THEN 'todo' WHEN 'In Progress' THEN 'in_progress' WHEN 'Done' THEN 'done' END
      ) THEN RAISE EXCEPTION 'Invalid voice work item link' USING ERRCODE='23514'; END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER voice_work_item_link_guard BEFORE INSERT OR UPDATE ON voice_import_work_items
      FOR EACH ROW EXECUTE FUNCTION validate_voice_work_item_link();

    -- Only status is shared. Titles/descriptions remain independent, and deletion
    -- removes the link, not the other record. Trigger updates are in the same transaction.
    CREATE FUNCTION sync_voice_work_item_status() RETURNS trigger AS $$
    BEGIN
      IF pg_trigger_depth() > 1 OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
      IF TG_TABLE_NAME='tasks' THEN
        UPDATE issues SET status=CASE NEW.status WHEN 'todo' THEN 'Open' WHEN 'in_progress' THEN 'In Progress' WHEN 'done' THEN 'Done' END,
          updated_at=now() WHERE id=(SELECT issue_id FROM voice_import_work_items WHERE task_id=NEW.id)
          AND status IS DISTINCT FROM CASE NEW.status WHEN 'todo' THEN 'Open' WHEN 'in_progress' THEN 'In Progress' WHEN 'done' THEN 'Done' END;
      ELSE
        UPDATE tasks SET status=CASE NEW.status WHEN 'Open' THEN 'todo' WHEN 'In Progress' THEN 'in_progress' WHEN 'Done' THEN 'done' END,
          completed_at=CASE WHEN NEW.status='Done' THEN COALESCE(completed_at,now()) ELSE NULL END, updated_at=now()
          WHERE id=(SELECT task_id FROM voice_import_work_items WHERE issue_id=NEW.id)
          AND status IS DISTINCT FROM CASE NEW.status WHEN 'Open' THEN 'todo' WHEN 'In Progress' THEN 'in_progress' WHEN 'Done' THEN 'done' END;
        UPDATE products SET updated_at=now() WHERE id=(SELECT t.product_id FROM tasks t JOIN voice_import_work_items l ON l.task_id=t.id WHERE l.issue_id=NEW.id);
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER voice_task_status_sync AFTER UPDATE OF status ON tasks FOR EACH ROW EXECUTE FUNCTION sync_voice_work_item_status();
    CREATE TRIGGER voice_issue_status_sync AFTER UPDATE OF status ON issues FOR EACH ROW EXECUTE FUNCTION sync_voice_work_item_status();
  `.execute(db);
}
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP TRIGGER IF EXISTS voice_task_status_sync ON tasks;
    DROP TRIGGER IF EXISTS voice_issue_status_sync ON issues;
    DROP TRIGGER IF EXISTS voice_work_item_link_guard ON voice_import_work_items;
    DROP FUNCTION IF EXISTS sync_voice_work_item_status();
    DROP FUNCTION IF EXISTS validate_voice_work_item_link();
    DROP TABLE IF EXISTS voice_import_work_items, voice_import_receipts;
  `.execute(db);
}
