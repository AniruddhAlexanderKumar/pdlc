import { sql, type Kysely } from 'kysely';
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE assistant_actions DROP CONSTRAINT assistant_actions_kind_check;
    ALTER TABLE assistant_actions ADD CONSTRAINT assistant_actions_kind_check CHECK(kind IN ('create_project','create_issue','update_issue_status','update_issue_priority'))`.execute(db);
}
// Preserve action audit history; rollback fails if priority actions exist.
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE assistant_actions DROP CONSTRAINT assistant_actions_kind_check;
    ALTER TABLE assistant_actions ADD CONSTRAINT assistant_actions_kind_check CHECK(kind IN ('create_project','create_issue','update_issue_status'))`.execute(db);
}
