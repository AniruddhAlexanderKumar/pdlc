// Run only against an isolated local server and disposable PostgreSQL database.
import assert from 'node:assert/strict';
import pg from 'pg';
const base=process.env.ASSISTANT_TEST_URL,dbUrl=process.env.ASSISTANT_TEST_DB;
if(!base||!dbUrl||!['localhost','127.0.0.1'].includes(new URL(base).hostname)||!['localhost','127.0.0.1'].includes(new URL(dbUrl).hostname))throw Error('Set local ASSISTANT_TEST_URL and ASSISTANT_TEST_DB');
const db=new pg.Client({connectionString:dbUrl});await db.connect();const stamp=Date.now();
async function call(method,path,body,cookie){const r=await fetch(base+'/api'+path,{method,headers:{origin:'http://localhost:5173',...(cookie?{cookie}:{}),...(body!==undefined?{'content-type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json().catch(()=>null),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const expect=(r,n)=>assert.equal(r.status,n,JSON.stringify(r.data));
async function register(name,inviteToken){const r=await call('POST','/auth/register',{name,email:`env-${name}-${stamp}@example.test`,password:'Test-Password-123!',workspaceName:name+' workspace',inviteToken});expect(r,201);return r;}
try{
 const owner=await register('owner'),other=await register('other');const invite=await call('POST','/workspace/invites',{role:'member'},owner.cookie);expect(invite,201);const member=await register('member',new URL(invite.data.url).pathname.split('/').pop());
 expect(await call('GET','/ai/health'),401);expect(await call('GET','/ai/health',undefined,member.cookie),403);
 const empty=await call('POST','/assistant/conversations',{projectId:null},owner.cookie);expect(empty,201);
 const ask=async(id,text,cookie)=>{expect(await call('POST',`/assistant/conversations/${id}/messages`,{content:text},cookie),201);const r=await call('GET',`/assistant/conversations/${id}`,undefined,cookie);expect(r,200);return r.data;};
 let data=await ask(empty.data.id,'Show my projects',owner.cookie);assert(data.messages.at(-1).content.includes('no projects'));
 const p=await call('POST','/projects',{key:'SOLAR',name:'Real project'},owner.cookie);expect(p,201);const foreign=await call('POST','/projects',{key:'OTHER',name:'Other workspace project'},other.cookie);expect(foreign,201);
 data=await ask(empty.data.id,'Show my projects',owner.cookie);assert(data.messages.at(-1).content.includes('Real project'));assert(!JSON.stringify(data).includes('Other workspace project'));assert.equal(data.messages.at(-1).sources.length,1);assert(!('recordId' in data.messages.at(-1).sources[0]));
 const issue=await call('POST',`/projects/${p.data.id}/issues`,{summary:'Verify real part'},member.cookie);expect(issue,201);
 const c=await call('POST','/assistant/conversations',{projectId:p.data.id},member.cookie);expect(c,201);const cid=c.data.id;
 data=await ask(cid,'Set task SOLAR-1 priority to High',member.cookie);let action=data.actions.at(-1);assert.equal(action.kind,'update_issue_priority');assert.equal(action.payload.previousPriority,'Medium');assert.equal(action.payload.nextPriority,'High');assert.equal(action.payload.issueId,undefined);
 assert.equal((await db.query('select priority from issues where id=$1',[issue.data.id])).rows[0].priority,'Medium');expect(await call('POST',`/assistant/actions/${action.id}/confirm`,{},other.cookie),404);
 const [x,y]=await Promise.all([call('POST',`/assistant/actions/${action.id}/confirm`,{},member.cookie),call('POST',`/assistant/actions/${action.id}/confirm`,{},member.cookie)]);expect(x,200);expect(y,200);assert.equal((await db.query('select priority from issues where id=$1',[issue.data.id])).rows[0].priority,'High');
 data=await ask(cid,'Set task SOLAR-1 priority to Critical',member.cookie);action=data.actions.at(-1);expect(await call('PATCH',`/projects/${p.data.id}/issues/${issue.data.id}`,{priority:'Low'},owner.cookie),200);expect(await call('POST',`/assistant/actions/${action.id}/confirm`,{},member.cookie),409);expect(await call('POST',`/assistant/actions/${action.id}/cancel`,{},member.cookie),200);
 data=await ask(cid,'Set task OTHER-1 priority to High',member.cookie);assert.equal(data.actions.length,2);assert(data.messages.at(-1).content.includes('not in the selected project'));
 expect(await call('POST','/voice/process',{transcript:'A real idea with no configured model'},owner.cookie),503);expect(await call('POST','/voice/import',{},member.cookie),403);
 await db.query('delete from projects where id=$1',[p.data.id]);data=await call('GET',`/assistant/conversations/${empty.data.id}`,undefined,owner.cookie);expect(data,200);assert(data.data.messages.some(m=>m.content.includes('source that is no longer available or has changed')));assert(!data.data.messages.some(m=>m.role==='assistant'&&m.content.includes('Real project')));
 console.log('Assistant environment smoke passed: real workspace data, isolation, stale-source redaction, priority confirmation and voice failure/permissions.');
}finally{await db.end();}
