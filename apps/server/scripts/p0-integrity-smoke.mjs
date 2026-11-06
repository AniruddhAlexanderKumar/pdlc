// Destructive test fixtures/triggers: run ONLY against a disposable local PostgreSQL and API.
// The application must run with NODE_ENV=test, DATABASE_POOL_MAX=2, and LLAMA_CPP_URL=http://127.0.0.1:8091.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import pg from 'pg';
const url = process.env.P0_SMOKE_URL, dbUrl = process.env.P0_SMOKE_DATABASE_URL;
if (!url || !dbUrl || !['localhost','127.0.0.1'].includes(new URL(url).hostname) || !['localhost','127.0.0.1'].includes(new URL(dbUrl).hostname)) throw new Error('P0 smoke requires a disposable localhost API and database');
const db = new pg.Client({ connectionString: dbUrl });
await db.connect();
const origin = process.env.P0_SMOKE_ORIGIN ?? 'http://localhost:5173';
let cookie = '';
async function call(method, path, body) {
 const r = await fetch(`${url}/api${path}`, { method, headers: { origin, ...(cookie ? {cookie} : {}), ...(body === undefined ? {} : {'content-type':'application/json'}) }, ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:AbortSignal.timeout(12000) });
 if(r.headers.get('set-cookie')) cookie=r.headers.get('set-cookie').split(';')[0];
 return {status:r.status,body:await r.json().catch(()=>null)};
}
const draft = {product:{name:'P0 Imported',category:'General',stage:'Idea',description:'',target_price:null,labour:0,packaging:0,overhead:0},answers:[{question_key:'idea.problem',value:'A valid answer'}],materials:[],project:{project_key:'P0TEST',name:'P0 project',description:''},issues:[{type:'Task',status:'Done',priority:'Medium',summary:'Linked work',description:'',labels:[]}]};
const model = http.createServer(async (req,res) => {
 let body=''; for await (const chunk of req) body+=chunk;
 const invalid=body.includes('invalid scale');
 const generated=structuredClone(draft); if(invalid) generated.answers=[{question_key:'idea.excitement',value:9}]; if(body.includes('invalid milestone')) generated.issues[0].milestone_tag='Launch';
 res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(generated)}}]}));
});
await new Promise((resolve,reject)=>model.listen(8091,'127.0.0.1',resolve).once('error',reject));
try {
 let r=await call('POST','/auth/register',{name:'P0 Owner',email:`p0-${Date.now()}@example.test`,password:'Test-Password-123!',workspaceName:'P0'});
 assert.equal(r.status,201,JSON.stringify(r.body));const ws=r.body.workspace.id;
 const writes=await Promise.all(Array.from({length:12},(_,i)=>call('POST','/products',{name:`Concurrent P0 ${i}`})));
 assert(writes.every(x=>x.status===201),JSON.stringify(writes));
 const manualProduct=writes[0].body.data.id;
 for (const [key,value] of [['idea.category','x'.repeat(61)],['planning.target_price',10000000001]]) {
   const manual=await call('PUT',`/products/${manualProduct}/answers/${key}`,{value});
   const voice=await call('POST','/voice/import',{requestId:randomUUID(),draft:{...draft,answers:[{question_key:key,value}]}});
   assert.equal(manual.status,400,JSON.stringify(manual.body));assert.equal(voice.status,400,JSON.stringify(voice.body));
 }
 const tooLong='x'.repeat(201);
 r=await call('POST',`/products/${manualProduct}/tasks`,{title:tooLong});assert.equal(r.status,400);
 r=await call('POST','/voice/import',{requestId:randomUUID(),draft:{...draft,issues:[{summary:tooLong}]}});assert.equal(r.status,400);
 r=await call('POST',`/products/${manualProduct}/tasks`,{title:'Valid task',description:'x'.repeat(4001)});assert.equal(r.status,400);
 r=await call('POST','/voice/import',{requestId:randomUUID(),draft:{...draft,issues:[{summary:'Valid task',description:'x'.repeat(4001)}]}});assert.equal(r.status,400);
 console.log('PASS manual and voice product/task validation reject the same invalid values');
 let count=await db.query("SELECT count(*)::int n FROM analytics_events WHERE workspace_id=$1 AND event_name='product.create' AND metadata->>'name' LIKE 'Concurrent P0 %'",[ws]);assert.equal(count.rows[0].n,12);
 console.log('PASS 12 concurrent real product writes against pool size 2 and committed analytics');
 await db.query(`CREATE FUNCTION p0_fail_price_xp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='price_set' THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER p0_fail_price_xp BEFORE INSERT ON xp_events FOR EACH ROW EXECUTE FUNCTION p0_fail_price_xp()`);
 r=await call('POST','/products',{name:'P0 Rollback',targetSellingPrice:20});assert.equal(r.status,500,JSON.stringify(r.body));
 assert.equal((await db.query("SELECT count(*)::int n FROM products WHERE workspace_id=$1 AND name='P0 Rollback'",[ws])).rows[0].n,0);
 assert.equal((await db.query("SELECT count(*)::int n FROM analytics_events WHERE workspace_id=$1 AND metadata->>'name'='P0 Rollback'",[ws])).rows[0].n,0);
 await db.query('DROP TRIGGER p0_fail_price_xp ON xp_events; DROP FUNCTION p0_fail_price_xp()');
 console.log('PASS rollback removes business write and its analytics event');
 await db.query(`CREATE FUNCTION p0_fail_analytics() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_name='product.create' THEN RAISE EXCEPTION 'test analytics failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER p0_fail_analytics BEFORE INSERT ON analytics_events FOR EACH ROW EXECUTE FUNCTION p0_fail_analytics()`);
 r=await call('POST','/products',{name:'P0 Analytics Failure'});assert.equal(r.status,201,JSON.stringify(r.body));
 assert.equal((await db.query("SELECT count(*)::int n FROM products WHERE workspace_id=$1 AND name='P0 Analytics Failure'",[ws])).rows[0].n,1);
 await db.query('DROP TRIGGER p0_fail_analytics ON analytics_events; DROP FUNCTION p0_fail_analytics()');
 console.log('PASS analytics failure rolls back savepoint, not business transaction');
 r=await call('POST','/voice/process',{transcript:'This is an invalid scale test'});assert.equal(r.status,400,JSON.stringify(r.body));assert.match(r.body.error,/idea.excitement/);
 r=await call('POST','/voice/process',{transcript:'This is an invalid milestone test'});assert.equal(r.status,400,JSON.stringify(r.body));assert.match(r.body.error,/Milestone tags cannot be imported/);
 r=await call('POST','/voice/import',{requestId:randomUUID(),draft:{...draft,issues:[{...draft.issues[0],milestone_tag:'Launch'}]}});assert.equal(r.status,400,JSON.stringify(r.body));
 r=await call('POST','/voice/process',{transcript:'This is a valid draft test'});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.data.issues[0].summary,'Linked work');
 console.log('PASS model-generated invalid draft rejected before preview, valid draft accepted');
 r=await call('POST','/voice/import',draft);assert.equal(r.status,400);assert.match(r.body.error,/Refresh/);
 const invalid=structuredClone(draft);invalid.answers=[{question_key:'idea.excitement',value:9}];
 r=await call('POST','/voice/import',{requestId:randomUUID(),draft:invalid});assert.equal(r.status,400,JSON.stringify(r.body));
 assert.equal((await db.query("SELECT count(*)::int n FROM products WHERE workspace_id=$1 AND name='P0 Imported'",[ws])).rows[0].n,0);
 await db.query(`CREATE FUNCTION p0_fail_link() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test import rollback'; END $$; CREATE TRIGGER p0_fail_link BEFORE INSERT ON voice_import_work_items FOR EACH ROW EXECUTE FUNCTION p0_fail_link()`);
 const failedRequest=randomUUID();r=await call('POST','/voice/import',{requestId:failedRequest,draft});assert.equal(r.status,500,JSON.stringify(r.body));
 assert.equal((await db.query("SELECT count(*)::int n FROM products WHERE workspace_id=$1 AND name='P0 Imported'",[ws])).rows[0].n,0);
 assert.equal((await db.query("SELECT count(*)::int n FROM projects WHERE workspace_id=$1 AND project_key='P0TEST'",[ws])).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*)::int n FROM voice_import_receipts WHERE workspace_id=$1 AND request_id=$2',[ws,failedRequest])).rows[0].n,0);
 await db.query('DROP TRIGGER p0_fail_link ON voice_import_work_items; DROP FUNCTION p0_fail_link()');
 console.log('PASS forced mid-import failure rolls back project, product and idempotency receipt');
 const requestId=randomUUID();const results=await Promise.all([call('POST','/voice/import',{requestId,draft}),call('POST','/voice/import',{requestId,draft})]);
 assert(results.every(x=>x.status===201),JSON.stringify(results));assert.equal(results[0].body.data.productId,results[1].body.data.productId);assert.equal(results[0].body.data.projectId,results[1].body.data.projectId);
 const result=results[0].body.data, task=result.product.tasks[0];assert.equal(task.status,'done');assert(task.linkedIssue);const issue=task.linkedIssue;
 assert.equal((await db.query('SELECT count(*)::int n FROM voice_import_work_items WHERE workspace_id=$1',[ws])).rows[0].n,1);
 r=await call('POST','/voice/import',{requestId,draft:{...draft,product:{...draft.product,name:'different'}}});assert.equal(r.status,409,JSON.stringify(r.body));
 console.log('PASS invalid import rejected, concurrent identical retries create one linked pair, conflicting reuse rejected');
 r=await call('PATCH',`/products/${result.productId}/tasks/${task.id}`,{status:'in_progress'});assert.equal(r.status,200,JSON.stringify(r.body));
 let issues=await call('GET',`/projects/${result.projectId}/issues`);assert.equal(issues.body.items[0].status,'In Progress');assert.equal(issues.body.items[0].linkedTask.id,task.id);
 r=await call('PATCH',`/projects/${result.projectId}/issues/${issue.id}`,{status:'Open'});assert.equal(r.status,200,JSON.stringify(r.body));
 let data=await call('GET','/workspace/data');let updated=data.body.products.find(p=>p.id===result.productId).tasks[0];assert.equal(updated.status,'todo');assert.equal(updated.completedAt,null);
 console.log('PASS bidirectional status synchronization through real product and project APIs');
 // Opposite-direction writers may deadlock; server must expose a retryable conflict,
 // and committed state must remain consistent. Retry conflicts with the same input.
 for (let i=0;i<8;i++) {
   const attempts=await Promise.all([call('PATCH',`/products/${result.productId}/tasks/${task.id}`,{status:'done'}),call('PATCH',`/projects/${result.projectId}/issues/${issue.id}`,{status:'In Progress'})]);
   assert(attempts.every(x=>x.status===200||x.status===409),JSON.stringify(attempts));
   for (const x of attempts.filter(x=>x.status===409)) assert.equal(x.body.code,'retryable_conflict');
   const state=await db.query(`SELECT t.status AS task, i.status AS issue FROM tasks t JOIN voice_import_work_items l ON l.task_id=t.id JOIN issues i ON i.id=l.issue_id WHERE t.id=$1`,[task.id]);
   assert.equal(({todo:'Open',in_progress:'In Progress',done:'Done'})[state.rows[0].task],state.rows[0].issue);
 }
 // Force the opposite lock order using separate disposable database sessions.
 // One transaction must be rolled back, and the survivor must leave a consistent pair.
 r=await call('PATCH',`/projects/${result.projectId}/issues/${issue.id}`,{status:'In Progress'});assert.equal(r.status,200);
 const left=new pg.Client({connectionString:dbUrl}),right=new pg.Client({connectionString:dbUrl});
 await Promise.all([left.connect(),right.connect()]);
 try {
   await Promise.all([left.query('BEGIN'),right.query('BEGIN')]);
   await Promise.all([left.query('SELECT id FROM tasks WHERE id=$1 FOR UPDATE',[task.id]),right.query('SELECT id FROM issues WHERE id=$1 FOR UPDATE',[issue.id])]);
   const outcomes=await Promise.all([
     left.query("UPDATE tasks SET status='done' WHERE id=$1",[task.id]).then(async()=>{await left.query('COMMIT');return 'committed';}).catch(async e=>{await left.query('ROLLBACK');return e.code;}),
     right.query("UPDATE issues SET status='Open' WHERE id=$1",[issue.id]).then(async()=>{await right.query('COMMIT');return 'committed';}).catch(async e=>{await right.query('ROLLBACK');return e.code;})
   ]);
   assert.deepEqual(outcomes.sort(),['40P01','committed'].sort());
   const state=(await db.query(`SELECT t.status AS task, i.status AS issue FROM tasks t JOIN voice_import_work_items l ON l.task_id=t.id JOIN issues i ON i.id=l.issue_id WHERE t.id=$1`,[task.id])).rows[0];
   assert.equal(({todo:'Open',in_progress:'In Progress',done:'Done'})[state.task],state.issue);
 } finally { await Promise.all([left.end(),right.end()]); }
 console.log('PASS forced opposite-direction deadlock rolls back one writer and preserves synchronized status');
 const ownerCookie=cookie;
 r=await call('POST','/auth/register',{name:'Other',email:`p0-other-${Date.now()}@example.test`,password:'Test-Password-123!',workspaceName:'Other'});assert.equal(r.status,201);
 assert.equal((await call('PATCH',`/products/${result.productId}/tasks/${task.id}`,{status:'done'})).status,404);
 assert.equal((await call('PATCH',`/projects/${result.projectId}/issues/${issue.id}`,{status:'Done'})).status,404);
 cookie=ownerCookie;
 console.log('PASS opposite-direction concurrent updates remain synchronized; cross-workspace updates denied');
 r=await call('DELETE',`/products/${result.productId}/tasks/${task.id}`);assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal((await db.query('SELECT count(*)::int n FROM voice_import_work_items WHERE task_id=$1',[task.id])).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*)::int n FROM issues WHERE id=$1',[issue.id])).rows[0].n,1);
 console.log('PASS deleting linked task removes link but retains issue');
 await call('DELETE',`/products/${result.productId}`);r=await call('POST','/voice/import',{requestId,draft});assert.equal(r.status,410,JSON.stringify(r.body));
 console.log('PASS retry does not recreate a deleted product');
} finally {
 await db.query('DROP TRIGGER IF EXISTS p0_fail_link ON voice_import_work_items; DROP FUNCTION IF EXISTS p0_fail_link(); DROP TRIGGER IF EXISTS p0_fail_price_xp ON xp_events; DROP FUNCTION IF EXISTS p0_fail_price_xp(); DROP TRIGGER IF EXISTS p0_fail_analytics ON analytics_events; DROP FUNCTION IF EXISTS p0_fail_analytics()').catch(()=>{});
 await db.end();await new Promise(resolve=>model.close(resolve));
}
