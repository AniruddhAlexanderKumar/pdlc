import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Secret, TOTP } from 'otpauth';
// Provide Playwright and a compatible Chromium launcher from a test-only installation.
if (!process.env.FOUNDER_TEST_PLAYWRIGHT_MODULE || !process.env.FOUNDER_TEST_CHROMIUM_MODULE) throw Error('Set absolute test-only Playwright and Chromium module paths');
const { chromium: pw } = await import(process.env.FOUNDER_TEST_PLAYWRIGHT_MODULE);
const { default: chromium } = await import(process.env.FOUNDER_TEST_CHROMIUM_MODULE);
const parsed = new URL(process.env.DATABASE_URL!);
if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/founders_dashboard_browser_test' || process.env.NODE_ENV !== 'test') throw Error('Requires disposable local dashboard browser database');
process.env.FOUNDER_MANAGEMENT_EXPERIMENTAL = 'true'; process.env.FOUNDER_AUTH_EXPERIMENTAL = 'true'; process.env.SV_FOUNDER_TOTP_KEY = randomBytes(32).toString('base64'); process.env.SV_FOUNDER_RATE_LIMIT_KEY = randomBytes(32).toString('base64'); process.env.APP_URL = 'http://127.0.0.1:4222';
const {db} = await import('../src/db/index.js'); const {migrateToLatest} = await import('../src/db/migrate.js'); const {createApp} = await import('../src/app.js');
const secret = randomBytes(32).toString('base64url'); const temp = `Synthetic-${randomBytes(24).toString('base64url')}`; const next = `Rotated-${randomBytes(24).toString('base64url')}`;
let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
let browser: Awaited<ReturnType<typeof pw.launch>> | undefined;
try {
 await migrateToLatest(() => {});
 const child = spawnSync(process.execPath, ['apps/server/dist/scripts/founder-bootstrap.js'], {env: {...process.env, SV_FOUNDER_BOOTSTRAP_ENABLED:'true',SV_FOUNDER_BOOTSTRAP_SECRET_SHA256:createHash('sha256').update(secret).digest('hex'),SV_FOUNDER_BOOTSTRAP_SECRET:secret,SV_FOUNDER_BOOTSTRAP_PASSWORD:temp,SV_FOUNDER_BOOTSTRAP_NAME:'Synthetic founder'}, encoding:'utf8'});
 assert.equal(child.status,0); assert(!child.stdout.includes(secret) && !child.stdout.includes(temp) && !child.stderr.includes(secret) && !child.stderr.includes(temp));
 const { hashPassword } = await import('../src/auth/crypto.js');
 const adminPassword = `Admin-${randomBytes(24).toString('base64url')}`;
 const admin = await db.insertInto('users').values({name:'Synthetic admin', email:'browser-admin@example.test', password_hash:await hashPassword(adminPassword), is_admin:true, last_login_at:null}).returning('id').executeTakeFirstOrThrow();
 const ordinary = await db.insertInto('users').values({name:'Synthetic user', email:'browser-user@example.test', password_hash:await hashPassword(adminPassword), is_admin:false, last_login_at:null}).returning('id').executeTakeFirstOrThrow();
 // Model an externally introduced collision; ordinary authentication must not
 // create a founder session even if this email matches the routing hint.
 const collision = await db.insertInto('users').values({name:'Synthetic collision', email:'f5manmission@sv.com', password_hash:await hashPassword(adminPassword), is_admin:false, last_login_at:null}).returning('id').executeTakeFirstOrThrow();
 const ws = await db.insertInto('workspaces').values({name:'Admin fixture', mode:'team'}).returning('id').executeTakeFirstOrThrow();
 await db.insertInto('memberships').values([{user_id:admin.id, workspace_id:ws.id, role:'owner'}, {user_id:ordinary.id, workspace_id:ws.id, role:'member'}, {user_id:collision.id, workspace_id:ws.id, role:'member'}]).execute();
 server=createApp().listen(4222,'127.0.0.1'); await new Promise<void>(resolve=>server!.once('listening',resolve));
 browser=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter((x: string)=>x!=='--disable-web-security'),headless:true}); const page=await browser.newPage();
 // Test ordinary sessions before any founder cookie exists (single-process
 // Chromium in this test environment can share cookies across contexts).
 for (const [email, destination] of [['browser-user@example.test','/'], ['browser-admin@example.test','/admin'], ['f5manmission@sv.com','/']]) {
  await page.goto('http://127.0.0.1:4222/login');
  await page.getByLabel('Work email').fill(email); await page.getByLabel('Password',{exact:true}).fill(adminPassword); await page.getByRole('button',{name:'Sign in'}).click();
  await page.waitForURL(`http://127.0.0.1:4222${destination}`); assert.notEqual(await page.evaluate(async()=> (await fetch('/api/founders/me')).status),200);
  await page.evaluate(async()=> { await fetch('/api/auth/logout', {method:'POST', headers:{'content-type':'application/json'}, body:'{}'}); });
 }
 await db.deleteFrom('users').where('id','=',collision.id).execute();
 await page.goto('http://127.0.0.1:4222/founders');
 await page.evaluate(() => history.replaceState({usr:{founderStep:'enroll'},key:'test',idx:0}, '', '/founders'));
 await page.reload(); await page.getByRole('heading',{name:'Founders sign in'}).waitFor();
 assert.notEqual(await page.evaluate(async()=> (await fetch('/api/founders/me')).status),200);
 await page.goto('http://127.0.0.1:4222/login', {waitUntil:'networkidle'});
 await page.getByLabel('Work email').fill('f5manmission@sv.com'); await page.getByLabel('Password', {exact:true}).fill('Incorrect-synthetic-password-123'); await page.getByRole('button',{name:'Sign in'}).click();
 await page.getByRole('alert').waitFor(); assert.equal(new URL(page.url()).pathname, '/login');
 assert.notEqual(await page.evaluate(async()=> (await fetch('/api/founders/me')).status),200);
 await page.getByLabel('Password', {exact:true}).fill(temp); await page.getByRole('button',{name:'Sign in'}).click();
 await page.getByRole('heading',{name:'Set up your authenticator'}).waitFor();
 const seed=await page.locator('code').textContent(); assert(seed);
 const otp=new TOTP({secret:Secret.fromBase32(seed),digits:6,period:30,algorithm:'SHA1'});
 assert.equal(await page.evaluate(async()=> (await fetch('/api/founders/me')).status),401);
 await page.getByLabel('Authenticator code or recovery code').fill(otp.generate()); await page.getByRole('button',{name:'Verify'}).click();
 await page.getByRole('heading',{name:'Change temporary password'}).waitFor(); assert.equal(await page.locator('ul li').count(),10);
 assert.equal(await page.evaluate(async()=> (await fetch('/api/founders/me')).status),401);
 await page.getByLabel('I saved my recovery codes').check(); await page.getByLabel('New password',{exact:true}).fill(next); await page.getByLabel('Confirm new password').fill(next); await page.getByRole('button',{name:'Change password'}).click();
 await page.getByRole('heading',{name:'Founder authentication'}).waitFor(); assert.equal(await page.evaluate(async()=> (await fetch('/api/founders/me')).status),200);
 await page.getByRole('heading',{name:'Customer management'}).waitFor();
 await page.getByLabel('Customer name').fill('Synthetic customer'); await page.getByLabel('Customer email').fill('browser-customer@example.test');
 await page.getByLabel('Account type').selectOption('team'); await page.getByLabel('Organization name').fill('Synthetic organization');
 await page.getByRole('button',{name:'Create account'}).click();
 const setup = page.getByLabel('One-time setup link'); await setup.waitFor(); const link = await setup.inputValue(); assert(link.includes('/reset#'));
 const client = await browser.newPage(); await client.goto(link); await client.getByRole('heading',{name:'Choose a new password'}).waitFor();
 const customerPassword = `Customer-${randomBytes(24).toString('base64url')}`;
 await client.getByLabel('New password').fill(customerPassword); await client.getByRole('button',{name:'Set password and sign in'}).click();
 await client.waitForURL('http://127.0.0.1:4222/'); assert.equal(await client.evaluate(async()=> (await fetch('/api/auth/me')).status),200);
 await client.evaluate(async()=> { await fetch('/api/auth/logout', {method:'POST', headers:{'content-type':'application/json'}, body:'{}'}); });

 await page.getByRole('button',{name:'I saved the link'}).click();
 await page.getByText('Synthetic organization', { exact:true }).waitFor();
 page.once('dialog', (dialog: { accept(): Promise<void> }) => dialog.accept());
 await page.locator('li').filter({hasText:'browser-customer@example.test'}).getByRole('button',{name:'Suspend'}).click();
 await page.locator('li').filter({hasText:'browser-customer@example.test'}).getByText('Suspended').waitFor();
 await page.getByRole('button',{name:'Sign out'}).click(); await page.getByRole('heading',{name:'Founders sign in'}).waitFor();
 assert.equal(await page.evaluate(async()=> (await fetch('/api/founders/me')).status),401);
 await page.goto('http://127.0.0.1:4222/login');
 await page.getByLabel('Work email').fill('F5MANMISSION@sv.com'); await page.getByLabel('Password',{exact:true}).fill(next); await page.getByRole('button',{name:'Sign in'}).click(); await page.getByRole('heading',{name:'Verify your identity'}).waitFor();
 assert.notEqual(await page.evaluate(async()=> (await fetch('/api/founders/me')).status),200);
 await page.getByLabel('Authenticator code or recovery code').fill('wrong-code'); await page.getByRole('button',{name:'Verify'}).click();
 await page.getByRole('alert').waitFor(); assert.notEqual(await page.evaluate(async()=> (await fetch('/api/founders/me')).status),200);
 await page.getByLabel('Authenticator code or recovery code').fill(otp.generate({timestamp:Date.now()+30000})); await page.getByRole('button',{name:'Verify'}).click(); await page.getByRole('heading',{name:'Founder authentication'}).waitFor();
 await db.updateTable('founder_accounts').set({status:'suspended'}).execute(); assert.equal(await page.evaluate(async()=> (await fetch('/api/founders/me')).status),403);
 await page.getByRole('button',{name:'Sign out'}).click(); await page.goto('http://127.0.0.1:4222/login');
 await page.getByLabel('Work email').fill('f5manmission@sv.com'); await page.getByLabel('Password',{exact:true}).fill(next); await page.getByRole('button',{name:'Sign in'}).click();
 await page.getByRole('alert').waitFor(); assert.equal(new URL(page.url()).pathname,'/login'); assert.notEqual(await page.evaluate(async()=> (await fetch('/api/founders/me')).status),200);
 console.log('PASS local-only browser: ordinary login handoff, bad password/MFA, CLI bootstrap, MFA/rotation, user/admin separation, customer management and suspension');
} finally { if(browser) await browser.close(); if(server) await new Promise<void>((resolve,reject)=>server!.close(e=>e?reject(e):resolve())); await db.destroy(); }
