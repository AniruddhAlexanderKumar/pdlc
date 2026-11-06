// Destructive fixture writes. Use only a disposable localhost API and database.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base=process.env.DESIGN_SMOKE_URL;
if(!base||!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Set DESIGN_SMOKE_URL to an isolated local test API');
const origin='http://localhost:5173';
async function call(cookie,method,path,body){const r=await fetch(`${base}/api${path}`,{method,headers:{origin,...(cookie?{cookie}:{}),...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});return {status:r.status,data:r.status===204?null:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const expect=(r,n)=>assert.equal(r.status,n,JSON.stringify(r.data));
const stamp=Date.now();
async function register(label,inviteToken){const r=await call('','POST','/auth/register',{name:label,email:`design-${label}-${stamp}@example.test`,password:'Test-Password-123!',workspaceName:label,inviteToken});expect(r,201);return r.cookie;}
const owner=await register('owner'),other=await register('other');
let r=await call(owner,'POST','/workspace/invites',{role:'member'});expect(r,201);const member=await register('member',new URL(r.data.url).pathname.split('/').pop());
r=await call(owner,'POST','/projects',{key:'DESIGN',name:'Design project'});expect(r,201);const project=r.data.id;
r=await call(owner,'POST','/products',{name:'Design product'});expect(r,201);const product=r.data.data.id;
r=await call(other,'POST','/projects',{key:'OTHER',name:'Other project'});expect(r,201);const foreignProject=r.data.id;
r=await call(owner,'POST','/designs',{title:'Bad association',projectId:foreignProject,productId:null});expect(r,400);
r=await call(owner,'POST','/designs',{title:'System diagram',projectId:project,productId:product});expect(r,201);const id=r.data.document.id;assert.equal(r.data.document.headRevision,1);
r=await call(owner,'POST','/projects',{key:'SECOND',name:'Second project'});expect(r,201);const secondProject=r.data.id;
r=await call(owner,'POST','/designs',{title:'Second project diagram',projectId:secondProject,productId:null});expect(r,201);const secondDesign=r.data.document.id;
r=await call(owner,'POST','/designs',{title:'Unassigned diagram',projectId:null,productId:null});expect(r,201);const unassigned=r.data.document.id;
r=await call(owner,'GET',`/designs?projectId=${project}`);expect(r,200);assert(r.data.some(d=>d.id===id));assert(!r.data.some(d=>d.id===secondDesign||d.id===unassigned));
r=await call(member,'GET',`/designs?projectId=${project}`);expect(r,200);assert(r.data.some(d=>d.id===id));
expect(await call(owner,'GET',`/designs?projectId=${foreignProject}`),404);expect(await call(other,'GET',`/designs?projectId=${project}`),404);expect(await call(owner,'GET','/designs?projectId=not-a-uuid'),400);
r=await call(owner,'GET','/designs');expect(r,200);assert([id,secondDesign,unassigned].every(d=>r.data.some(x=>x.id===d)));
expect(await call(other,'GET',`/designs/${id}`),404);expect(await call(other,'GET',`/designs/${id}/revisions`),404);
r=await call(member,'GET',`/designs/${id}`);expect(r,200);assert.equal(r.data.document.canEdit,false);
const a=randomUUID(),b=randomUUID(),edge=randomUUID();const source={schemaVersion:1,nodes:[{id:a,label:'Sensor',x:80,y:80},{id:b,label:'Controller',x:400,y:80}],edges:[{id:edge,from:a,to:b,label:'signal'}]};
expect(await call(member,'PUT',`/designs/${id}`,{expectedRevision:1,summary:'Unauthorized',source}),403);
expect(await call(other,'PUT',`/designs/${id}`,{expectedRevision:1,summary:'Cross workspace',source}),404);
expect(await call(owner,'PUT',`/designs/${id}`,{expectedRevision:1,source:{...source,edges:[{...source.edges[0],to:randomUUID()}]}}),400);
const writes=await Promise.all([call(owner,'PUT',`/designs/${id}`,{expectedRevision:1,summary:'first',source}),call(owner,'PUT',`/designs/${id}`,{expectedRevision:1,summary:'competing',source})]);assert.deepEqual(writes.map(x=>x.status).sort(),[200,409]);
r=await call(owner,'GET',`/designs/${id}`);expect(r,200);assert.deepEqual(r.data.source,source);assert.equal(r.data.document.headRevision,2);
r=await call(owner,'GET',`/designs/${id}/revisions`);expect(r,200);assert.deepEqual(r.data.map(x=>x.revision),[2,1]);
expect(await call(other,'POST',`/designs/${id}/revisions/1/restore`,{expectedRevision:2}),404);
expect(await call(member,'POST',`/designs/${id}/revisions/1/restore`,{expectedRevision:2}),403);
r=await call(owner,'POST',`/designs/${id}/revisions/1/restore`,{expectedRevision:2});expect(r,200);assert.equal(r.data.document.headRevision,3);assert.deepEqual(r.data.source,{schemaVersion:1,nodes:[],edges:[]});
r=await call(owner,'GET',`/designs/${id}/revisions`);expect(r,200);assert.deepEqual(r.data.map(x=>x.revision),[3,2,1]);
expect(await call(owner,'POST',`/designs/${id}/revisions/2/restore`,{expectedRevision:2}),409);
// Members can create and edit their own diagrams; owners can administer them.
r=await call(member,'POST','/designs',{title:'Member design',projectId:null,productId:null});expect(r,201);const memberId=r.data.document.id;
r=await call(member,'PUT',`/designs/${memberId}`,{expectedRevision:1,summary:'edit',source});expect(r,200);
r=await call(owner,'PUT',`/designs/${memberId}`,{expectedRevision:2,summary:'admin edit',source});expect(r,200);
r=await call(other,'GET','/designs');expect(r,200);assert(!r.data.some(d=>d.id===id||d.id===memberId));
console.log('PASS design create, scoped associations and reads, creator/admin permissions, atomic save, conflict, revision restore and cross-workspace isolation');
