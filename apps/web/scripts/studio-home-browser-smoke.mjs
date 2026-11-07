// Synthetic browser fixtures only. Never connects to production or a database.
import assert from 'node:assert/strict';
if(process.env.STUDIO_TEST_URL!=='http://localhost:5173')throw Error('Requires local Vite at localhost:5173');
const {chromium:pw}=await import(process.env.STUDIO_PLAYWRIGHT_MODULE);
const {default:chromium}=await import(process.env.STUDIO_CHROMIUM_MODULE);
const workspace={id:'fixture-workspace',name:'Fixture workspace',mode:'solo',currency:'USD',role:'owner'};
const me={user:{id:'fixture-user',name:'Fixture User',email:'fixture@example.test',createdAt:new Date().toISOString()},workspace,workspaces:[workspace]};
let enabled=false;const id='00000000-0000-4000-8000-000000000001';
const doc={id,workspaceId:workspace.id,ownerId:me.user.id,name:'New fixture sketch',headRevision:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),archivedAt:null,canEdit:true};
const source={schemaVersion:1,id,plane:'XY',units:'m',revision:1,entities:[],constraints:[]};
let sketches=[];let failCreate=false,holdCreate=false,releaseCreate;
const browser=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(x=>x!=='--disable-web-security'),headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(/^http:\/\/localhost:5173\/api\//,async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let status=200,body={};
  if(path==='/api/auth/me')body=me;
  else if(path==='/api/workspace/data')body={products:[],materials:[],suppliers:[]};
  else if(path==='/api/designs')body=[{id:'legacy',title:'Preserved fixture diagram',headRevision:1,ownerName:'Fixture',updatedAt:new Date().toISOString()}];
  else if(path==='/api/cad-documents'&&!enabled){status=404;body={error:'Not found'};}
  else if(path==='/api/cad-documents'&&req.method()==='GET')body=sketches;
  else if(path==='/api/cad-documents'&&req.method()==='POST'){
   if(holdCreate)await new Promise(resolve=>{releaseCreate=resolve});
   if(failCreate){status=500;body={error:'Fixture error'};}else{sketches=[doc];body={document:doc,source};status=201;}
  } else if(path===`/api/cad-documents/${id}`)body={document:doc,source};
  else {status=404;body={error:'Unavailable in fixture'};}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('http://localhost:5173/designs/sketches');const consent=page.getByRole('button',{name:'Essential only'});if(await consent.isVisible())await consent.click();await page.getByRole('heading',{name:'Design Studio'}).waitFor();await page.getByText('The experimental sketch workspace is disabled on this deployment.').waitFor();assert.equal(await page.getByRole('button',{name:'Create XY sketch'}).count(),0);
 await page.getByRole('link',{name:'Previous diagrams'}).first().click();await page.getByRole('link',{name:'Preserved fixture diagram'}).waitFor();assert.equal(await page.getByRole('button',{name:'Create diagram'}).count(),0);await page.getByRole('link',{name:'← Design Studio'}).click();await page.getByRole('link',{name:'Experimental sketches'}).click();
 enabled=true;await page.reload();await page.getByLabel('New sketch name').fill('A draft name');await page.getByRole('button',{name:'Create XY sketch'}).waitFor();await page.waitForTimeout(250);
 await Promise.all([page.waitForEvent('dialog').then(dialog=>dialog.dismiss()),page.getByRole('link',{name:'Open projects'}).click()]);assert.equal(new URL(page.url()).pathname,'/designs/sketches');
 failCreate=true;await page.getByRole('button',{name:'Create XY sketch'}).click();await page.getByRole('alert').getByText(/Could not confirm sketch creation/).waitFor();assert.equal(await page.getByLabel('New sketch name').inputValue(),'A draft name');
 failCreate=false;holdCreate=true;await page.getByRole('button',{name:'Create XY sketch'}).click();await page.getByRole('button',{name:'Create XY sketch'}).waitFor();
 assert.equal(await page.evaluate(()=>window.dispatchEvent(new Event('sv:before-session-change',{cancelable:true}))),false);
 await page.getByRole('link',{name:'Open projects'}).click();assert.equal(new URL(page.url()).pathname,'/designs/sketches');holdCreate=false;releaseCreate();
 await page.waitForURL(`http://localhost:5173/designs/cad/${id}`,{timeout:5000}).catch(async e=>{console.error('Navigation failure:',page.url(),(await page.locator('body').innerText()).slice(0,2500),errors);throw e});await page.getByLabel('XY sketch canvas').waitFor();await page.getByRole('button',{name:'Rectangle',exact:true}).waitFor();
 await page.getByRole('link',{name:'Back to documents'}).click();await page.getByRole('heading',{name:'New fixture sketch'}).waitFor();
 await page.goto('http://localhost:5173/designs/sketches');await page.getByRole('link',{name:/New fixture sketch/}).waitFor();await page.getByLabel('Search loaded sketches').fill('not in list');await page.getByText('No loaded sketches match this search.').waitFor();
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:900});const size=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert(size.scroll<=size.width,JSON.stringify(size));}
 assert.deepEqual(errors,[]);console.log('PASS studio gate, preserved diagrams, create guards, enabled sketch entry, search and responsive layout');
}finally{await browser.close();}
