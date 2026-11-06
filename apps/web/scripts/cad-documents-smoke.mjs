// Only against a disposable local API/database. Screenshots contain fixture data only.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const base=process.env.CAD_BROWSER_URL;
if(!base||!['localhost','127.0.0.1'].includes(new URL(base).hostname)||!process.env.BROWSER_EXECUTABLE)throw Error('Set local CAD_BROWSER_URL and BROWSER_EXECUTABLE');
const mod=process.env.PLAYWRIGHT_MODULE??'playwright-core';const {chromium}=await import(mod.startsWith('/')?pathToFileURL(mod).href:mod);
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const context=await browser.newContext({viewport:{width:1365,height:900}}),page=await context.newPage();
 await page.goto(base);const consent=page.getByRole('button',{name:'Essential only'});if(await consent.isVisible())await consent.click();
 const register=async(page,label)=>page.evaluate(async label=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:`CAD ${label}`,email:`cad-${label}-${Date.now()}@example.test`,password:'Test-Password-123!',workspaceName:`CAD ${label}`})});return r.status},label);
 assert.equal(await register(page,'owner'),201);await page.goto(`${base}/designs`);await page.getByRole('link',{name:'Manage sketches'}).click();await page.getByRole('heading',{name:'Experimental CAD documents'}).waitFor();
 await page.getByLabel('Sketch name').fill('Fixture sketch');await page.getByRole('button',{name:'Create sketch'}).click();await page.getByRole('heading',{name:'Fixture sketch'}).waitFor();await page.getByLabel('XY sketch canvas').waitFor();assert.equal(await page.getByText('This sketch is empty.').count(),1);const docUrl=page.url();
 await page.reload();await page.getByRole('heading',{name:'Fixture sketch'}).waitFor();await page.getByRole('link',{name:'Back to documents',exact:true}).click();await page.getByRole('heading',{name:'Fixture sketch'}).waitFor();
 await page.getByLabel('Search sketches').fill('missing');await page.getByText('No sketches match this view.').waitFor();await page.getByLabel('Search sketches').fill('Fixture');await page.getByRole('heading',{name:'Fixture sketch'}).waitFor();
 await page.getByRole('button',{name:'My sketches'}).click();await page.getByRole('heading',{name:'Fixture sketch'}).waitFor();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Archive',exact:true}).click();await page.getByText('No sketches match this view.').waitFor();await page.getByRole('button',{name:'Archived'}).click();await page.getByRole('heading',{name:'Fixture sketch'}).waitFor();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Restore',exact:true}).click();await page.getByText('No sketches match this view.').waitFor();await page.getByRole('button',{name:'Workspace',exact:true}).click();await page.getByRole('heading',{name:'Fixture sketch'}).waitFor();
 if(process.env.CAD_SCREENSHOT)await page.screenshot({path:process.env.CAD_SCREENSHOT,fullPage:true});
 const other=await browser.newContext(),otherPage=await other.newPage();await otherPage.goto(base);assert.equal(await register(otherPage,'other'),201);const status=await otherPage.evaluate(async url=>(await fetch(`/api/cad-documents/${url.split('/').pop()}`)).status,docUrl);assert.equal(status,404);await otherPage.goto(docUrl);await otherPage.getByRole('alert').waitFor();assert.equal(await otherPage.getByRole('heading',{name:'Fixture sketch'}).count(),0);await other.close();
 await page.setViewportSize({width:390,height:844});await page.getByRole('heading',{name:'Experimental CAD documents'}).waitFor();assert(await page.getByRole('button',{name:'Create sketch'}).isVisible());
 console.log('PASS browser experimental CAD document create, inspect, reload, filter, archive, restore, cross-workspace denial and narrow viewport');
}finally{await browser.close()}
