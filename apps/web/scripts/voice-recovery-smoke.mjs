// Fixture-only browser regression. Use an isolated local frontend proxying a disposable test API.
// VOICE_BROWSER_URL=http://localhost:5173 BROWSER_EXECUTABLE=/path/to/chromium \
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs node apps/web/scripts/voice-recovery-smoke.mjs
// Install Playwright outside this repository, or set PLAYWRIGHT_MODULE to an available package.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const base=process.env.VOICE_BROWSER_URL;
if (!base || !['localhost','127.0.0.1'].includes(new URL(base).hostname) || !process.env.BROWSER_EXECUTABLE) throw new Error('Set a disposable local VOICE_BROWSER_URL and BROWSER_EXECUTABLE');
const moduleName=process.env.PLAYWRIGHT_MODULE ?? 'playwright-core';
const {chromium:pw}=await import(moduleName.startsWith('/') ? pathToFileURL(moduleName).href : moduleName);
const browser=await pw.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
 const context=await browser.newContext();const page=await context.newPage();
 await page.goto(`${base}/`);
 await page.getByRole('button',{name:'Essential only'}).click();
 const registration=await page.evaluate(async()=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Voice Browser Test',email:`voice-browser-${Date.now()}@example.test`,password:'Test-Password-123!',workspaceName:'Browser fixture'})});return {status:r.status,body:await r.json()}});
 assert.equal(registration.status,201,JSON.stringify(registration.body));
 const draft={product:{name:'Browser Recovery Fixture',category:'General',stage:'Idea',description:'',target_price:null,labour:0,packaging:0,overhead:0},answers:[],materials:[],project:{project_key:'BRW',name:'Browser fixture',description:''},issues:[{type:'Task',status:'Done',priority:'Medium',summary:'Browser linked work',description:'',labels:[]}]};
 await page.route('**/api/voice/process',async route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({provider:'llama-cpp',data:draft})}));
 await page.goto(`${base}/`);
 await page.getByRole('button',{name:'Voice capture',exact:true}).first().click();
 await page.locator('#voice-transcript').fill('This fixture describes an actual reviewed browser draft');
 await page.getByRole('button',{name:'Create draft'}).click();
 await page.getByText('Status: Done').waitFor();
 let capturedRequest=null,releaseResponse,notifyCommitted;
 const responseGate=new Promise(resolve=>{releaseResponse=resolve});
 const committed=new Promise(resolve=>{notifyCommitted=resolve});
 await page.route('**/api/voice/import',async route=>{capturedRequest=route.request().postDataJSON();const response=await route.fetch();assert.equal(response.status(),201);notifyCommitted();await responseGate;await route.abort('failed');},{times:1});
 await page.getByRole('button',{name:/Confirm & Create Records/}).click();
 await committed;
 assert.equal(await page.getByRole('button',{name:'Back to Dictation'}).isDisabled(),true);
 releaseResponse();
 await page.getByRole('alert').waitFor();
 assert(capturedRequest?.requestId);
 const storageBefore=await page.evaluate(()=>Object.entries(sessionStorage).filter(([k])=>k.startsWith('sv-voice-pending:')));
 assert.equal(storageBefore.length,1);assert.equal(JSON.parse(storageBefore[0][1]).requestId,capturedRequest.requestId);
 await page.reload();
 await page.getByRole('button',{name:'Voice capture',exact:true}).first().click();
 await page.getByText('Status: Done').waitFor();
 let retry=null;page.on('request',r=>{if(r.url().endsWith('/api/voice/import'))retry=r.postDataJSON()});
 await page.getByRole('button',{name:/Confirm & Create Records/}).click();
 await page.waitForURL('**/projects');assert.equal(retry.requestId,capturedRequest.requestId);
 const storageAfter=await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('sv-voice-pending:')));assert.equal(storageAfter.length,0);
 const result=await page.evaluate(async()=>{const r=await fetch('/api/workspace/data');return r.json()});
 assert.equal(result.products.filter(p=>p.name==='Browser Recovery Fixture').length,1);
 console.log('PASS browser lost-response recovery retains request ID across reload, retries without duplicate, shows status, blocks starting over in flight, clears tab storage after success');
} finally {await browser.close()}
