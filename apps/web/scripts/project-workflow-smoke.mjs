// Destructive synthetic fixture writes: only run against a disposable local app/database.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
if (process.env.PROJECT_WORKFLOW_TEST_URL !== 'http://localhost:5173' || process.env.NODE_ENV !== 'test') throw Error('Requires NODE_ENV=test and an isolated disposable app at localhost:5173');
if (!process.env.FOUNDER_TEST_PLAYWRIGHT_MODULE || !process.env.FOUNDER_TEST_CHROMIUM_MODULE) throw Error('Set test-only browser module paths');
const { chromium: pw } = await import(process.env.FOUNDER_TEST_PLAYWRIGHT_MODULE);
const { default: chromium } = await import(process.env.FOUNDER_TEST_CHROMIUM_MODULE);
const base = process.env.PROJECT_WORKFLOW_TEST_URL;
const password = `Synthetic-${randomBytes(24).toString('base64url')}`;
const email = `project-fixture-${randomBytes(8).toString('hex')}@example.test`;
async function call(method, path, body, cookie) {
 const response = await fetch(`${base}/api${path}`, {method, headers:{origin:base, ...(cookie?{cookie}:{}), ...(body?{'content-type':'application/json'}:{})}, ...(body?{body:JSON.stringify(body)}:{})});
 const data = await response.json().catch(()=>null); return {status:response.status,data,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
const registered = await call('POST','/auth/register',{name:'Project fixture',email,password,workspaceName:'Fixture workspace'}); assert.equal(registered.status,201); const cookie=registered.cookie; assert(cookie);
const first=await call('POST','/projects',{name:'Alpha fixture',key:'ALPHA'},cookie); const second=await call('POST','/projects',{name:'Beta fixture',key:'BETA'},cookie); assert.equal(first.status,201);assert.equal(second.status,201);
const old=await call('POST','/designs',{title:'Existing alpha diagram',projectId:first.data.id,productId:null},cookie);
const elsewhere=await call('POST','/designs',{title:'Existing beta diagram',projectId:second.data.id,productId:null},cookie);
const unassigned=await call('POST','/designs',{title:'Existing workspace diagram',projectId:null,productId:null},cookie);
const product=await call('POST','/products',{name:'Existing workspace product'},cookie);
assert.equal(old.status,201);assert.equal(elsewhere.status,201);assert.equal(unassigned.status,201);assert.equal(product.status,201);
const browser=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(x=>x!=='--disable-web-security'),headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:850}}); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/login`);await page.getByLabel('Work email').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in'}).click();
 await page.waitForURL(`${base}/projects`);await page.getByRole('heading',{name:'Choose a project'}).waitFor({timeout:10000}).catch(async error=>{console.error('Project chooser failed:', page.url(), (await page.locator('body').innerText()).slice(0,600), errors); throw error;});
 await page.getByRole('link',{name:/Alpha fixture/}).click();await page.waitForURL(`${base}/projects/${first.data.id}`);
 await page.getByRole('link',{name:'Existing alpha diagram'}).waitFor();assert.equal(await page.getByText('Existing beta diagram').count(),0);assert.equal(await page.getByText('Existing workspace diagram').count(),0);
 await page.getByLabel('New diagram name').fill('New alpha diagram');await page.getByRole('button',{name:'Create diagram'}).click();await page.getByRole('status').getByRole('link',{name:'New alpha diagram'}).waitFor();
 const alpha=await call('GET',`/designs?projectId=${first.data.id}`,undefined,cookie);assert(alpha.data.some(d=>d.title==='New alpha diagram'&&d.projectId===first.data.id));
 await page.reload();await page.getByRole('link',{name:'New alpha diagram'}).waitFor();
 async function confirmNavigation(link, accept) {
  const handled=new Promise((resolve,reject)=>page.once('dialog',dialog=>{(accept?dialog.accept():dialog.dismiss()).then(resolve,reject);}));
  await link.click(); await handled;
 }
 await page.getByLabel('New diagram name').fill('Unsaved name');await confirmNavigation(page.getByRole('link',{name:'Switch project'}),false);assert.equal(new URL(page.url()).pathname,`/projects/${first.data.id}`);assert.equal(await page.getByLabel('New diagram name').inputValue(),'Unsaved name');
 await confirmNavigation(page.getByRole('link',{name:'Switch project'}),true);await page.waitForURL(`${base}/projects`);await page.getByRole('link',{name:/Beta fixture/}).click();await page.getByRole('link',{name:'Existing beta diagram'}).waitFor();assert.equal(await page.getByText('Existing alpha diagram').count(),0);assert.equal(await page.getByText('New alpha diagram').count(),0);
 await page.getByRole('link',{name:'Open project issues'}).click();await page.getByRole('button',{name:'Create issue'}).first().click();await page.getByLabel('Summary').fill('Unsaved issue');await confirmNavigation(page.getByRole('link',{name:'Project overview'}),false);assert.equal(await page.getByLabel('Summary').inputValue(),'Unsaved issue');
 await page.locator('form').getByRole('button',{name:'Create issue'}).click();await page.getByRole('heading',{name:'Unsaved issue'}).waitFor();
 const betaIssues=await call('GET',`/projects/${second.data.id}/issues`,undefined,cookie);const alphaIssues=await call('GET',`/projects/${first.data.id}/issues`,undefined,cookie);assert(betaIssues.data.items.some(i=>i.summary==='Unsaved issue'));assert(!alphaIssues.data.items.some(i=>i.summary==='Unsaved issue'));
 await page.getByRole('button',{name:'Create issue'}).first().click();await page.getByLabel('Summary').fill('Another unsaved issue');await confirmNavigation(page.getByRole('link',{name:'Project overview'}),true);
 await page.getByRole('heading',{name:/Beta fixture/}).waitFor();const all=await call('GET','/designs',undefined,cookie);assert([old.data.document.id,elsewhere.data.document.id,unassigned.data.document.id].every(id=>all.data.some(d=>d.id===id)));
 const products=await call('GET','/workspace/data',undefined,cookie);assert(products.data.products.some(p=>p.name==='Existing workspace product'));
 for (const width of [390,1440]) { await page.setViewportSize({width,height:850}); const size=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})); assert(size.scroll<=size.width); }
 await page.evaluate(async()=>{await fetch('/api/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});});await page.goto(`${base}/login?next=%2Fdesigns`);await page.getByLabel('Work email').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in'}).click();await page.waitForURL(`${base}/designs`);await page.getByRole('heading',{name:'Design Studio'}).waitFor();assert.deepEqual(errors,[]);
 console.log('PASS project selection, isolation of linked diagrams, creation/reload, switch guards and existing workspace data');
} finally {await browser.close();}
