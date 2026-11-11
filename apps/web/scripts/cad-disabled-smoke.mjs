// Only against a disposable localhost API with CAD_NATIVE_EXPERIMENTAL unset or false.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const base=process.env.CAD_BROWSER_URL;
if(!base||!['localhost','127.0.0.1'].includes(new URL(base).hostname)||!process.env.BROWSER_EXECUTABLE)throw Error('Set local CAD_BROWSER_URL and BROWSER_EXECUTABLE');
const mod=process.env.PLAYWRIGHT_MODULE??'playwright-core';const {chromium}=await import(mod.startsWith('/')?pathToFileURL(mod).href:mod);
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage();await page.goto(base);
 const status=await page.evaluate(async()=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Disabled CAD fixture',email:`cad-off-${Date.now()}@example.test`,password:'Test-Password-123!',workspaceName:'Disabled fixture'})});return r.status});assert.equal(status,201);
 assert.equal(await page.evaluate(async()=>(await fetch('/api/cad-documents')).status),404);
 const request=page.waitForResponse(r=>r.url().endsWith('/api/cad-documents'));await page.goto(`${base}/designs/sketches`);await page.getByRole('heading',{name:'Design Studio'}).waitFor();await request;assert.equal(await page.getByRole('link',{name:'Manage sketches'}).count(),0);
 await page.goto(`${base}/designs/cad`);await page.getByRole('heading',{name:'Experimental CAD documents unavailable'}).waitFor();assert.equal(await page.getByText('The experimental CAD API is disabled.').count(),1);assert.equal(await page.getByRole('button',{name:'Create sketch'}).count(),0);
 console.log('PASS disabled CAD API and navigation remain unavailable');
}finally{await browser.close()}
