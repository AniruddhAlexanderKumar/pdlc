import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Secret, TOTP } from 'otpauth';
// Provide Playwright and a compatible Chromium launcher from a test-only installation.
if (!process.env.FOUNDER_TEST_PLAYWRIGHT_MODULE || !process.env.FOUNDER_TEST_CHROMIUM_MODULE) throw Error('Set absolute test-only Playwright and Chromium module paths');
const { chromium: pw } = await import(process.env.FOUNDER_TEST_PLAYWRIGHT_MODULE);
const { default: chromium } = await import(process.env.FOUNDER_TEST_CHROMIUM_MODULE);
const parsed = new URL(process.env.DATABASE_URL!);
if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/founders_browser_test' || process.env.NODE_ENV !== 'test') throw Error('Requires disposable local browser database');
process.env.FOUNDER_AUTH_EXPERIMENTAL = 'true'; process.env.SV_FOUNDER_TOTP_KEY = randomBytes(32).toString('base64'); process.env.SV_FOUNDER_RATE_LIMIT_KEY = randomBytes(32).toString('base64'); process.env.APP_URL = 'http://127.0.0.1:4222';
const {db} = await import('../src/db/index.js'); const {migrateToLatest} = await import('../src/db/migrate.js'); const {createApp} = await import('../src/app.js');
const secret = randomBytes(32).toString('base64url'); const temp = `Synthetic-${randomBytes(24).toString('base64url')}`; const next = `Rotated-${randomBytes(24).toString('base64url')}`;
let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
let browser: Awaited<ReturnType<typeof pw.launch>> | undefined;
try {
 await migrateToLatest(() => {});
 const child = spawnSync(process.execPath, ['apps/server/dist/scripts/founder-bootstrap.js'], {env: {...process.env, SV_FOUNDER_BOOTSTRAP_ENABLED:'true',SV_FOUNDER_BOOTSTRAP_SECRET_SHA256:createHash('sha256').update(secret).digest('hex'),SV_FOUNDER_BOOTSTRAP_SECRET:secret,SV_FOUNDER_BOOTSTRAP_PASSWORD:temp,SV_FOUNDER_BOOTSTRAP_NAME:'Synthetic founder'}, encoding:'utf8'});
 assert.equal(child.status,0); assert(!child.stdout.includes(secret) && !child.stdout.includes(temp) && !child.stderr.includes(secret) && !child.stderr.includes(temp));
 server=createApp().listen(4222,'127.0.0.1'); await new Promise<void>(resolve=>server!.once('listening',resolve));
 browser=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter((x: string)=>x!=='--disable-web-security'),headless:true}); const page=await browser.newPage();
 await page.goto('http://127.0.0.1:4222/founders', {waitUntil:'networkidle'});
 await page.getByLabel('Founder email').fill('f5manmission@sv.com'); await page.getByLabel('Password', {exact:true}).fill(temp); await page.getByRole('button',{name:'Sign in'}).click();
 await page.getByRole('heading',{name:'Set up your authenticator'}).waitFor();
 const seed=await page.locator('code').textContent(); assert(seed);
 const otp=new TOTP({secret:Secret.fromBase32(seed),digits:6,period:30,algorithm:'SHA1'});
 assert.equal(await page.evaluate(async()=> (await fetch('/api/founders/me')).status),401);
 await page.getByLabel('Authenticator code or recovery code').fill(otp.generate()); await page.getByRole('button',{name:'Verify'}).click();
 await page.getByRole('heading',{name:'Change temporary password'}).waitFor(); assert.equal(await page.locator('ul li').count(),10);
 assert.equal(await page.evaluate(async()=> (await fetch('/api/founders/me')).status),401);
 await page.getByLabel('I saved my recovery codes').check(); await page.getByLabel('New password',{exact:true}).fill(next); await page.getByLabel('Confirm new password').fill(next); await page.getByRole('button',{name:'Change password'}).click();
 await page.getByRole('heading',{name:'Founder authentication'}).waitFor(); assert.equal(await page.evaluate(async()=> (await fetch('/api/founders/me')).status),200);
 await page.getByRole('button',{name:'Sign out'}).click(); await page.getByRole('heading',{name:'Founders sign in'}).waitFor();
 assert.equal(await page.evaluate(async()=> (await fetch('/api/founders/me')).status),401);
 await page.getByLabel('Founder email').fill('f5manmission@sv.com'); await page.getByLabel('Password',{exact:true}).fill(next); await page.getByRole('button',{name:'Sign in'}).click(); await page.getByRole('heading',{name:'Verify your identity'}).waitFor();
 await page.getByLabel('Authenticator code or recovery code').fill(otp.generate({timestamp:Date.now()+30000})); await page.getByRole('button',{name:'Verify'}).click(); await page.getByRole('heading',{name:'Founder authentication'}).waitFor();
 await db.updateTable('founder_accounts').set({status:'suspended'}).execute(); assert.equal(await page.evaluate(async()=> (await fetch('/api/founders/me')).status),403);
 console.log('PASS local-only browser: CLI bootstrap, restricted MFA enrollment, rotation, session, logout, TOTP re-login and suspension');
} finally { if(browser) await browser.close(); if(server) await new Promise<void>((resolve,reject)=>server!.close(e=>e?reject(e):resolve())); await db.destroy(); }
