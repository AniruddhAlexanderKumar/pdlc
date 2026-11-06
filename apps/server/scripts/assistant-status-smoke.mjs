// Only run against a disposable local server and database.
import assert from 'node:assert/strict';
import pg from 'pg';
const base=process.env.ASSISTANT_TEST_URL,dbUrl=process.env.ASSISTANT_TEST_DB;
if(!base||!dbUrl||!['localhost','127.0.0.1'].includes(new URL(base).hostname)||!['localhost','127.0.0.1'].includes(new URL(dbUrl).hostname))throw Error('Set local ASSISTANT_TEST_URL and ASSISTANT_TEST_DB');
const db=new pg.Client({connectionString:dbUrl});await db.connect();const stamp=Date.now();
async function call(method,path,body,cookie){const r=await fetch(base+'/api'+path,{method,headers:{origin:'http://localhost:5173',...(cookie?{cookie}:{}),...(body!==undefined?{'content-type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json().catch(()=>null),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const expect=(r,n)=>assert.equal(r.status,n,JSON.stringify(r.data));
async function register(name,inviteToken){const r=await call('POST','/auth/register',{name,email:`status-${name}-${stamp}@example.test`,password:'Test-Password-123!',workspaceName:name+' workspace',inviteToken});expect(r,201);return r;}
try{
 const owner=await register('owner'),other=await register('other');const invite=await call('POST','/workspace/invites',{role:'member'},owner.cookie);expect(invite,201);const member=await register('member',new URL(invite.data.url).pathname.split('/').pop());
 const p=await call('POST','/projects',{key:'SOLAR',name:'Solar'},owner.cookie);expect(p,201);const issue=await call('POST',`/projects/${p.data.id}/issues`,{summary:'Test solar panel'},owner.cookie);expect(issue,201);
 const c=await call('POST','/assistant/conversations',{projectId:p.data.id},member.cookie);expect(c,201);const cid=c.data.id;
 async function propose(message){expect(await call('POST',`/assistant/conversations/${cid}/messages`,{content:message},member.cookie),201);const r=await call('GET',`/assistant/conversations/${cid}`,undefined,member.cookie);expect(r,200);return r.data;}
 let result=await propose('Set task SOLAR-1 status to In Progress');let action=result.actions.at(-1);assert.equal(action.kind,'update_issue_status');assert.equal(action.payload.previousStatus,'Open');assert.equal(action.payload.nextStatus,'In Progress');assert.equal(action.payload.issueId,undefined);assert.equal((await db.query('select status from issues where id=$1',[issue.data.id])).rows[0].status,'Open');
 expect(await call('POST',`/assistant/actions/${action.id}/confirm`,{},other.cookie),404);
 const [x,y]=await Promise.all([call('POST',`/assistant/actions/${action.id}/confirm`,{},member.cookie),call('POST',`/assistant/actions/${action.id}/confirm`,{},member.cookie)]);expect(x,200);expect(y,200);assert.equal((await db.query('select status from issues where id=$1',[issue.data.id])).rows[0].status,'In Progress');
 result=await propose('Set task SOLAR-1 status to Done');action=result.actions.at(-1);expect(await call('PATCH',`/projects/${p.data.id}/issues/${issue.data.id}`,{summary:'Changed by a colleague'},owner.cookie),200);expect(await call('POST',`/assistant/actions/${action.id}/confirm`,{},member.cookie),409);assert.equal((await db.query('select status from issues where id=$1',[issue.data.id])).rows[0].status,'In Progress');expect(await call('POST',`/assistant/actions/${action.id}/cancel`,{},member.cookie),200);expect(await call('POST',`/assistant/actions/${action.id}/confirm`,{},member.cookie),400);
 result=await propose('Set task OTHER-1 status to Done');assert.equal(result.actions.length,2);assert(result.messages.at(-1).content.includes('not in the selected project'));
 result=await propose('Set task SOLAR-999 status to Done');assert.equal(result.actions.length,2);assert(result.messages.at(-1).content.includes('not found'));
 result=await propose('Set task SOLAR-1 status to In Progress');assert.equal(result.actions.length,2);assert(result.messages.at(-1).content.includes('already'));
 result=await propose('Set task SOLAR-1 status to Done');action=result.actions.at(-1);expect(await call('POST',`/assistant/actions/${action.id}/confirm`,{},member.cookie),200);assert.equal((await db.query('select status from issues where id=$1',[issue.data.id])).rows[0].status,'Done');
 const noProject=await call('POST','/assistant/conversations',{projectId:null},member.cookie);expect(noProject,201);expect(await call('POST',`/assistant/conversations/${noProject.data.id}/messages`,{content:'Set task SOLAR-1 status to Open'},member.cookie),201);const d=await call('GET',`/assistant/conversations/${noProject.data.id}`,undefined,member.cookie);assert.equal(d.data.actions.length,0);
 console.log('Assistant status smoke passed: scoped proposals, explicit confirmation, idempotency, cancellation, stale record conflicts and role isolation.');
}finally{await db.end();}
