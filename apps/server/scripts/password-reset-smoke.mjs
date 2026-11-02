// Integration test: only use with a disposable local API, PostgreSQL database and SMTP capture file.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import pg from 'pg';
const base=process.env.RESET_TEST_URL, database=process.env.RESET_TEST_DB, mail=process.env.RESET_TEST_MAIL;
if(!base||!database||!mail||!['localhost','127.0.0.1'].includes(new URL(base).hostname)||!['localhost','127.0.0.1'].includes(new URL(database).hostname)) throw Error('Set local RESET_TEST_URL, RESET_TEST_DB and RESET_TEST_MAIL');
const db=new pg.Client({connectionString:database});await db.connect();const stamp=Date.now();
async function call(method,path,body,cookie,origin='http://localhost:5173'){const r=await fetch(base+'/api'+path,{method,headers:{origin,...(cookie?{cookie}:{}),...(body!==undefined?{'content-type':'application/json'}:{})},body:body!==undefined?JSON.stringify(body):undefined});return {status:r.status,data:await r.json().catch(()=>null),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
function expect(r,status){assert.equal(r.status,status,JSON.stringify(r.data));}
async function register(name,inviteToken){const email=`${name}-${stamp}@example.test`;const r=await call('POST','/auth/register',{name,email,password:'Old-Password-123!',workspaceName:`${name} workspace`,inviteToken});expect(r,201);return {...r,email};}
async function invite(owner,role){const r=await call('POST','/workspace/invites',{role},owner.cookie);expect(r,201);return new URL(r.data.url).pathname.split('/').pop();}
async function messages(){return (await readFile(mail,'utf8').catch(()=>'' )).trim().split('\n').filter(Boolean).map(JSON.parse);}
function tokenOf(message){const text=message.data.replace(/=\r?\n/g,'');const token=text.match(/\/reset#([A-Za-z0-9_-]{43})/);assert(token,'email must contain a fragment-only reset token');return token[1];}
try{
 const owner=await register('owner'),admin=await register('admin',await invite(owner,'admin')),member=await register('member',await invite(owner,'member')),other=await register('other');
 const path=`/workspace/members/${member.data.user.id}/reset-link`;
 expect(await call('POST',path,{},member.cookie),403);
 expect(await call('POST',`/workspace/members/${owner.data.user.id}/reset-link`,{},admin.cookie),403);
 expect(await call('POST',`/workspace/members/${admin.data.user.id}/reset-link`,{},admin.cookie),400);
 expect(await call('POST',`/workspace/members/${other.data.user.id}/reset-link`,{},admin.cookie),404);
 expect(await call('POST',path,{},admin.cookie,'https://attacker.example'),403);
 let count=(await messages()).length;
 let result=await call('POST',path,{},admin.cookie);expect(result,201);assert.deepEqual(result.data,{sent:true,expiresInHours:24});
 let all=await messages();assert.equal(all.length,count+1);assert.deepEqual(all.at(-1).to,[member.email]);const token=tokenOf(all.at(-1));
 const hash=createHash('sha256').update(token).digest('hex');const stored=await db.query('select * from password_resets where token_hash=$1',[hash]);assert.equal(stored.rowCount,1);assert.notEqual(stored.rows[0].token_hash,token);
 result=await call('POST','/auth/reset/validate',{token});expect(result,200);assert.equal(result.data.email,member.email);
 result=await call('POST',path,{},owner.cookie);expect(result,201);all=await messages();const second=tokenOf(all.at(-1));assert.notEqual(token,second);
 result=await call('POST','/auth/reset',{token,newPassword:'New-Password-456!'});expect(result,200);
 expect(await call('POST','/auth/reset',{token,newPassword:'Another-Password-789!'}),410);
 expect(await call('POST','/auth/reset/validate',{token:second}),410);
 expect(await call('GET','/auth/me',undefined,member.cookie),401);
 expect(await call('POST','/auth/login',{email:member.email,password:'Old-Password-123!'}),401);
 expect(await call('POST','/auth/login',{email:member.email,password:'New-Password-456!'}),200);
 result=await call('POST',path,{},admin.cookie);expect(result,201);all=await messages();const expiring=tokenOf(all.at(-1));await db.query('update password_resets set expires_at=now()-interval \'1 minute\' where token_hash=$1',[createHash('sha256').update(expiring).digest('hex')]);expect(await call('POST','/auth/reset/validate',{token:expiring}),410);
 await db.query('update users set is_disabled=true where id=$1',[member.data.user.id]);expect(await call('POST',path,{},admin.cookie),400);
 console.log('Password-reset smoke passed: permissions, SMTP recipient, hashed single-use tokens, expiry, session revocation and workspace isolation.');
}finally{await db.end();}
