// Browser-only synthetic API fixture. Never contacts production or a database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
if (process.env.STUDIO_TEST_URL !== 'http://localhost:5173') throw Error('Requires the local Vite server at http://localhost:5173');
if (!process.env.STUDIO_PLAYWRIGHT_MODULE || !process.env.STUDIO_CHROMIUM_MODULE) throw Error('Set browser module paths');
const { chromium: pw } = await import(process.env.STUDIO_PLAYWRIGHT_MODULE);
const { default: chromium } = await import(process.env.STUDIO_CHROMIUM_MODULE);
const workspace = {id:'fixture-workspace',name:'Fixture',mode:'solo',currency:'USD',role:'owner'};
const me = {user:{id:'fixture-user',name:'Fixture User',email:'fixture@example.test',createdAt:new Date().toISOString()},workspace,workspaces:[workspace]};
let detail = {document:{id:'fixture-design',title:'Fixture diagram',kind:'diagram',ownerId:me.user.id,ownerName:me.user.name,projectId:null,productId:null,headRevision:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),canEdit:true},source:{schemaVersion:1,nodes:[],edges:[]}};
let conflict = false, failSave = false, loseResponse = false, saveCount = 0, holdSave = false, releaseSave;
const browser = await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(x=>x!=='--disable-web-security'),headless:true});
try {
 const page = await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.route(/^http:\/\/localhost:5173\/api\//,async route=>{
  const req=route.request(),path=new URL(req.url()).pathname; let body={};let status=200;
  if(path==='/api/auth/me') body=me;
  else if(path==='/api/workspace/data') body={products:[],materials:[],suppliers:[]};
  else if(path==='/api/designs/fixture-design/revisions') body=[];
  else if(path==='/api/designs/fixture-design' && req.method()==='GET') body=detail;
  else if(path==='/api/designs/fixture-design' && req.method()==='PUT') {
   const input=req.postDataJSON(); saveCount++;
   if(holdSave) await new Promise(resolve=>{releaseSave=resolve});
   if(failSave){status=503;body={error:'Temporary fixture failure'};}
   else if(conflict||input.expectedRevision!==detail.document.headRevision){status=409;body={error:'This design changed in another session.'};}
   else {detail={document:{...detail.document,headRevision:detail.document.headRevision+1},source:input.source};body=detail;}
   if(loseResponse){await route.abort();return;}
  } else {status=404;body={error:'Not available in fixture'};}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('http://localhost:5173/designs/fixture-design');
 await page.getByRole('heading',{name:'Fixture diagram'}).waitFor();
 await page.getByRole('button',{name:'Add box'}).click();
 await page.getByLabel('Box label').fill('Control unit');
 await page.getByRole('button',{name:'Duplicate box'}).click();
 assert.equal(await page.getByRole('button',{name:'Select Control unit'}).count(),2);
 await page.getByRole('button',{name:'Undo',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Select Control unit'}).count(),1);
 await page.getByRole('button',{name:'Redo',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Select Control unit'}).count(),2);
 await page.getByRole('button',{name:'Zoom in'}).click();assert.equal(await page.getByText('125%',{exact:true}).count(),1);
 await page.getByLabel('Snap to grid').check();
 const box=page.getByRole('button',{name:'Select Control unit'}).first(); await page.getByRole('complementary',{name:'Design navigation'}).getByRole('button',{name:'Control unit'}).first().click();const beforeX=Number(await page.getByLabel('X',{exact:true}).inputValue()),beforeY=Number(await page.getByLabel('Y',{exact:true}).inputValue());const bounds=await box.boundingBox();
 await page.mouse.move(bounds.x+3,bounds.y+3);await page.mouse.down();await page.mouse.move(bounds.x+40,bounds.y+34,{steps:5});await page.mouse.up();
 const x=Number(await page.getByLabel('X',{exact:true}).inputValue());const y=Number(await page.getByLabel('Y',{exact:true}).inputValue());assert.equal(x%20,0);assert.equal(y%20,0);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.getByRole('complementary',{name:'Design navigation'}).getByRole('button',{name:'Control unit'}).first().click();assert.equal(Number(await page.getByLabel('X',{exact:true}).inputValue()),beforeX);assert.equal(Number(await page.getByLabel('Y',{exact:true}).inputValue()),beforeY);await page.getByRole('button',{name:'Redo',exact:true}).click();await page.getByRole('complementary',{name:'Design navigation'}).getByRole('button',{name:'Control unit'}).first().click();assert.equal(Number(await page.getByLabel('X',{exact:true}).inputValue()),x);assert.equal(Number(await page.getByLabel('Y',{exact:true}).inputValue()),y);
 for(const [format,signature] of [['SVG','<svg'],['PNG','89504e470d0a1a0a']]){
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:`Export ${format}`}).click();const download=await pending;const data=await readFile(await download.path());assert(format==='SVG'?data.toString().startsWith(signature):data.subarray(0,8).toString('hex')===signature);
 }
 await page.getByRole('button',{name:'Save revision'}).click();await page.getByText(/revision 2 · editable/).waitFor();assert.equal(detail.source.nodes.length,2);
 await page.reload();await page.getByRole('button',{name:'Select Control unit'}).first().waitFor();assert.equal(await page.getByRole('button',{name:'Select Control unit'}).count(),2);
 // Invalid drafts do not produce revisions; fixing them resumes autosave.
 await page.getByRole('complementary',{name:'Design navigation'}).getByRole('button',{name:'Control unit'}).first().click();
 let count=saveCount;await page.getByLabel('Box label').fill('');await page.getByText('Give every box a label before saving.').waitFor();await page.waitForTimeout(2500);assert.equal(saveCount,count);
 holdSave=true;await page.getByLabel('Box label').fill('Updated automatically');await page.getByText('Saving…').waitFor({timeout:6000});
 const dialog=page.waitForEvent('dialog').then(d=>d.accept());await page.getByRole('button',{name:'← Previous diagrams'}).click();await dialog;assert.equal(new URL(page.url()).pathname,'/designs/fixture-design');
 assert.equal(await page.evaluate(()=>window.dispatchEvent(new Event('sv:before-session-change',{cancelable:true}))),false); // Alert is dismissed by Playwright.
 holdSave=false;releaseSave();await page.getByText('Saved',{exact:true}).waitFor();assert.equal(detail.source.nodes[0].label,'Updated automatically');assert.equal(saveCount,count+1);
 // A lost response may have committed: no automatic retries and local draft remains available.
 loseResponse=true;await page.getByRole('button',{name:'Add box'}).click();await page.getByRole('alert').getByText(/Autosave is paused/).waitFor({timeout:6000});count=saveCount;await page.waitForTimeout(2500);assert.equal(saveCount,count);assert.equal(await page.getByRole('button',{name:'Select New box'}).count(),1);
 const backupEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Download draft JSON'}).click();const backup=JSON.parse((await readFile(await (await backupEvent).path())).toString());assert.equal(backup.source.nodes.length,3);
 // Explicit retry is conflict-safe when the unknown request committed.
 loseResponse=false;await page.getByRole('button',{name:'Save revision'}).click();await page.getByRole('alert').getByText('This design changed in another session.').waitFor();assert.equal(await page.getByRole('button',{name:'Select New box'}).count(),1);
 // Reload intentionally discards the local draft after the conflict. A non-committing failure
 // can be retried explicitly, and a successful retry allows later edits to autosave again.
 page.once('dialog',d=>d.accept());await page.reload();await page.getByRole('heading',{name:'Fixture diagram'}).waitFor();
 failSave=true;await page.getByRole('button',{name:'Add box'}).click();await page.getByRole('alert').getByText('Temporary fixture failure').waitFor({timeout:6000});
 failSave=false;await page.getByRole('button',{name:'Save revision'}).click();await page.getByText('Saved',{exact:true}).waitFor();count=saveCount;
 await page.getByRole('button',{name:'Add box'}).click();await page.getByText('Saved',{exact:true}).waitFor({timeout:6000});assert.equal(saveCount,count+1);
 detail={...detail,document:{...detail.document,canEdit:false}};await page.reload();await page.getByRole('heading',{name:'Fixture diagram'}).waitFor();assert(await page.getByRole('button',{name:'Add box'}).isDisabled());assert(await page.getByRole('button',{name:'Save revision'}).isDisabled());
 await page.setViewportSize({width:390,height:900});const canvas=page.getByLabel('Conceptual diagram canvas');const large=(await canvas.boundingBox()).width;await page.getByRole('button',{name:'Zoom out'}).click();assert((await canvas.boundingBox()).width<large);
 for(const width of [390,1440]){await page.setViewportSize({width,height:900});const sizes=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert(sizes.scroll<=sizes.width,JSON.stringify(sizes));}
 assert.deepEqual(errors,[]);console.log('PASS local mocked editor: interactions, exports, autosave, validation, pending guard, lost response and conflict retention');
} finally {await browser.close();}
