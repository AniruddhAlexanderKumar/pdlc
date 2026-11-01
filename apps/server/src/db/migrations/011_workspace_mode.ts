import { sql, type Kysely } from 'kysely';

/** Existing workspaces keep their collaborative behavior. */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE workspaces ADD COLUMN mode text NOT NULL DEFAULT 'team' CHECK (mode IN ('solo', 'team'));
    CREATE FUNCTION enforce_solo_workspace_membership() RETURNS trigger AS $$
    DECLARE workspace_mode text;
    BEGIN
      -- Serializes competing membership inserts for the same workspace.
      SELECT mode INTO workspace_mode FROM workspaces WHERE id = NEW.workspace_id FOR UPDATE;
      IF workspace_mode = 'solo' AND EXISTS (
        SELECT 1 FROM memberships WHERE workspace_id = NEW.workspace_id AND user_id <> NEW.user_id
      ) THEN
        RAISE EXCEPTION 'A personal workspace can only have one member' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER solo_workspace_membership_guard BEFORE INSERT OR UPDATE OF workspace_id, user_id ON memberships
    FOR EACH ROW EXECUTE FUNCTION enforce_solo_workspace_membership();
  `.execute(db);
}
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DROP TRIGGER IF EXISTS solo_workspace_membership_guard ON memberships;
    DROP FUNCTION IF EXISTS enforce_solo_workspace_membership();
    ALTER TABLE workspaces DROP COLUMN IF EXISTS mode;
  `.execute(db);
}
