// Writes synthetic data. Run only with a disposable local application and PostgreSQL database.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
if(process.env.NODE_ENV!=='test'||process.env.STUDIO_TEST_URL!=='http://localhost:5173')throw Error('Requires NODE_ENV=test and a disposable local app at localhost:5173');
if(!process.env.STUDIO_PLAYWRIGHT_MODULE||!process.env.STUDIO_CHROMIUM_MODULE)throw Error('Set browser module paths');
const {chromium:pw}=await import(process.env.STUDIO_PLAYWRIGHT_MODULE);
const {default:chromium}=await import(process.env.STUDIO_CHROMIUM_MODULE);
const base=process.env.STUDIO_TEST_URL;
const email=`autosave-${randomBytes(10).toString('hex')}@example.test`,password=`Synthetic-${randomBytes(24).toString('base64url')}`;
async function call(method,path,body,cookie){const r=await fetch(`${base}/api${path}`,{method,headers:{origin:base,...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const reg=await call('POST','/auth/register',{name:'Autosave fixture',email,password,workspaceName:'Autosave fixture'});assert.equal(reg.status,201);const cookie=reg.cookie;assert(cookie);
const created=await call('POST','/designs',{title:'Autosave fixture',projectId:null,productId:null},cookie);assert.equal(created.status,201);const id=created.data.document.id;
const browser=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(x=>x!=='--disable-web-security'),headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/login`);await page.getByLabel('Work email').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in'}).click();await page.waitForURL(`${base}/projects`);
 await page.goto(`${base}/designs/${id}`);await page.getByRole('button',{name:'Add box'}).click();await page.getByLabel('Box label').fill('Persisted box');await page.getByText('Saved',{exact:true}).waitFor({timeout:10000});
 let result=await call('GET',`/designs/${id}`,undefined,cookie);assert.equal(result.data.document.headRevision,2);assert.equal(result.data.source.nodes[0].label,'Persisted box');
 await page.reload();await page.getByRole('button',{name:'Select Persisted box'}).waitFor();
 // Simulate another writer using the real API while this editor retains revision 2.
 const next={...result.data.source,nodes:result.data.source.nodes.map(n=>({...n,label:'Other session'}))};
 result=await call('PUT',`/designs/${id}`,{expectedRevision:2,summary:'Concurrent edit',source:next},cookie);assert.equal(result.status,200);
 await page.getByRole('button',{name:'Add box'}).click();await page.getByRole('alert').getByText(/changed in another session/).waitFor({timeout:10000});assert.equal(await page.getByRole('button',{name:'Select New box'}).count(),1);
 result=await call('GET',`/designs/${id}`,undefined,cookie);assert.equal(result.data.document.headRevision,3);assert.equal(result.data.source.nodes[0].label,'Other session');assert.equal(result.data.source.nodes.length,1);
 const revisions=await call('GET',`/designs/${id}/revisions`,undefined,cookie);assert.deepEqual(revisions.data.map(r=>r.revision),[3,2,1]);assert.deepEqual(errors,[]);
 console.log('PASS autosave persisted through real API/PostgreSQL, reload, and concurrent revision conflict');
}finally{await browser.close();}
