import {sql,type Kysely} from 'kysely';
// Only update the unchanged original seed; never overwrite an administrator's edits.
const oldText='Open Projects and select a project. Choose Create issue, enter a summary and optional description, priority, labels and assignee, then save. Open an issue to change its status or assignment. Assignees must be members of the same workspace.';
const newText=oldText.replace('Open an issue to change its status or assignment.','Use the status and assignee controls on the issue card to update them.');
async function replace(db:Kysely<unknown>,from:string,to:string){
 await sql`WITH changed AS (UPDATE help_articles SET body=${to}, updated_at=now() WHERE slug='project-issues' AND body=${from} RETURNING *) INSERT INTO help_article_revisions (article_id,actor_id,snapshot) SELECT id,NULL,jsonb_build_object('slug',slug,'title',title,'summary',summary,'body',body,'category',category,'keywords',keywords,'audience',audience,'status',status) FROM changed`.execute(db);
}
export async function up(db:Kysely<unknown>):Promise<void>{await replace(db,oldText,newText);}
export async function down(db:Kysely<unknown>):Promise<void>{await replace(db,newText,oldText);}
