// Writes synthetic records: only run against a disposable local app and PostgreSQL.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
if(process.env.NODE_ENV!=='test'||process.env.STUDIO_TEST_URL!=='http://localhost:5173')throw Error('Requires test mode and a disposable app at localhost:5173');
const {chromium:pw}=await import(process.env.STUDIO_PLAYWRIGHT_MODULE);
const {default:chromium}=await import(process.env.STUDIO_CHROMIUM_MODULE);
const email=`studio-${randomBytes(12).toString('hex')}@example.test`,password=`Fixture-${randomBytes(24).toString('base64url')}`,base=process.env.STUDIO_TEST_URL;
async function call(method,path,body,cookie){const res=await fetch(`${base}/api${path}`,{method,headers:{origin:base,...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};}
const reg=await call('POST','/auth/register',{name:'Studio fixture',email,password,workspaceName:'Studio fixture'});assert.equal(reg.status,201);const cookie=reg.cookie;
const old=await call('POST','/designs',{title:'Preserved fixture diagram',projectId:null,productId:null},cookie);assert.equal(old.status,201);
const browser=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(x=>x!=='--disable-web-security'),headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/login`);const consent=page.getByRole('button',{name:'Essential only'});if(await consent.isVisible())await consent.click();await page.getByLabel('Work email').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in'}).click();await page.waitForURL(`${base}/projects`);
 await page.goto(`${base}/designs`);await page.getByLabel('New sketch name').fill('Real fixture sketch');await page.getByRole('button',{name:'Create XY sketch'}).click();await page.getByRole('heading',{name:'Real fixture sketch'}).waitFor();await page.getByRole('button',{name:'Rectangle',exact:true}).click();
 const xy=async(x,y)=>page.getByLabel('XY sketch canvas').evaluate((el,point)=>{const p=new DOMPoint(point[0],point[1]).matrixTransform(el.getScreenCTM());return {x:p.x,y:p.y}},[x,y]);const a=await xy(0,0),b=await xy(10,-20);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});await page.mouse.up();await page.getByText('Constraints (8)').waitFor();await page.getByText(/Saved · revision [2-9]/).waitFor({timeout:12000});
 const id=new URL(page.url()).pathname.split('/').pop();let detail=await call('GET',`/cad-documents/${id}`,undefined,cookie);assert.equal(detail.status,200);assert.equal(detail.data.source.entities.length,4);assert.equal(detail.data.source.constraints.length,8);await page.reload();await page.getByText('Constraints (8)').waitFor();
 await page.goto(`${base}/designs/diagrams`);await page.getByRole('link',{name:/Preserved fixture diagram/}).waitFor();const legacy=await call('GET',`/designs/${old.data.document.id}`,undefined,cookie);assert.equal(legacy.status,200);assert.equal(legacy.data.document.title,'Preserved fixture diagram');assert.deepEqual(errors,[]);
 console.log('PASS new studio entry, real sketch creation/drawing/autosave/reload and preserved legacy diagram');
} finally {await browser.close();}
