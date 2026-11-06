// Fixture only: local frontend must proxy to a disposable NODE_ENV=test API/database.
// DESIGN_BROWSER_URL=http://localhost:5173 BROWSER_EXECUTABLE=/path/to/chromium PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs node apps/web/scripts/design-studio-smoke.mjs
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const base=process.env.DESIGN_BROWSER_URL;
if(!base||!['localhost','127.0.0.1'].includes(new URL(base).hostname)||!process.env.BROWSER_EXECUTABLE)throw Error('Set local DESIGN_BROWSER_URL and BROWSER_EXECUTABLE');
const mod=process.env.PLAYWRIGHT_MODULE??'playwright-core';const {chromium}=await import(mod.startsWith('/')?pathToFileURL(mod).href:mod);
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const context=await browser.newContext({viewport:{width:1365,height:900}});const page=await context.newPage();
 await page.goto(base);const consent=page.getByRole('button',{name:'Essential only'});if(await consent.isVisible())await consent.click();
 const registration=await page.evaluate(async()=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Design browser',email:`design-ui-${Date.now()}@example.test`,password:'Test-Password-123!',workspaceName:'Design browser'})});return r.status});assert.equal(registration,201);
 await page.goto(`${base}/designs`);await page.getByRole('heading',{name:'Design Studio'}).waitFor();
 await page.getByLabel('Name',{exact:true}).fill('Editable fixture diagram');await page.getByRole('button',{name:'Create diagram'}).click();await page.getByRole('heading',{name:'Editable fixture diagram'}).waitFor();
 await page.getByRole('button',{name:'Add box'}).click();await page.getByLabel('Box label').fill('Sensor');await page.getByRole('button',{name:'Add box'}).click();await page.getByLabel('Box label').fill('Controller');
 await page.getByLabel('From',{exact:true}).selectOption({label:'Sensor'});await page.getByLabel('To',{exact:true}).selectOption({label:'Controller'});await page.getByLabel('Connector label (optional)').fill('signal');await page.getByRole('button',{name:'Add connector'}).click();
 await page.getByRole('button',{name:'Save revision'}).click();await page.getByText(/revision 2 · editable/i).waitFor();
 await page.reload();await page.getByRole('button',{name:'Select Sensor'}).waitFor();await page.getByRole('button',{name:'Select Controller'}).waitFor();assert.equal(await page.getByText('Sensor → Controller · signal').count(),1);
 const second=await page.context().newPage();await second.goto(page.url());await second.getByRole('button',{name:'Select Sensor'}).waitFor();
 const box=await page.getByRole('button',{name:'Select Sensor'}).boundingBox();assert(box);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+55,box.y+box.height/2+30,{steps:4});await page.mouse.up();assert.notEqual(await page.getByLabel('X',{exact:true}).inputValue(),'80');await page.getByLabel('Box label').fill('Sensor updated');await page.getByRole('button',{name:'Save revision'}).click();await page.getByText(/revision 3 · editable/i).waitFor();
 await second.getByRole('button',{name:'Select Sensor'}).click();await second.getByLabel('Box label').fill('Second tab unsaved');
 second.once('dialog',d=>d.dismiss());assert.equal(await second.evaluate(()=>window.dispatchEvent(new Event('sv:before-session-change',{cancelable:true}))),false);
 await second.getByRole('button',{name:'Save revision'}).click();await second.getByRole('alert').getByText(/changed in another session/).waitFor();assert.equal(await second.getByLabel('Box label').inputValue(),'Second tab unsaved');await second.close();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Restore as new revision'}).last().click();await page.getByText(/revision 4 · editable/i).waitFor();assert.equal(await page.getByRole('button',{name:'Select Sensor'}).count(),0);
 console.log('PASS browser creates, edits, saves, reloads, rejects a stale edit without losing it, and restores a conceptual diagram');
}finally{await browser.close()}
