// Browser regression for a disposable local database and synthetic credentials.
// Run once against an opted-in web build and once against a default web build.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid');
if (process.env.NODE_ENV !== 'test' || url.hostname !== '127.0.0.1' || url.pathname !== '/founders_unified_disabled_test') throw Error('Requires disposable local founders_unified_disabled_test database');
if (!process.env.FOUNDER_TEST_PLAYWRIGHT_MODULE || !process.env.FOUNDER_TEST_CHROMIUM_MODULE || !['opted-in', 'default'].includes(process.env.FOUNDER_WEB_BUILD ?? '')) throw Error('Set test-only browser module paths and FOUNDER_WEB_BUILD');
process.env.FOUNDER_AUTH_EXPERIMENTAL = 'false'; process.env.FOUNDER_MANAGEMENT_EXPERIMENTAL = 'false'; process.env.APP_URL = 'http://127.0.0.1:4223';
const { chromium: pw } = await import(process.env.FOUNDER_TEST_PLAYWRIGHT_MODULE);
const { default: chromium } = await import(process.env.FOUNDER_TEST_CHROMIUM_MODULE);
const { db } = await import('../src/db/index.js'); const { migrateToLatest } = await import('../src/db/migrate.js'); const { createApp } = await import('../src/app.js');
const { hashPassword } = await import('../src/auth/crypto.js'); const { INITIAL_FOUNDER_EMAIL } = await import('@sv/shared');
let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined; let browser: Awaited<ReturnType<typeof pw.launch>> | undefined;
try {
 await migrateToLatest(() => {});
 const password = `Synthetic-${randomBytes(24).toString('base64url')}`;
 const user = await db.insertInto('users').values({name:'Ordinary fixture',email:INITIAL_FOUNDER_EMAIL,password_hash:await hashPassword(password),last_login_at:null}).returning('id').executeTakeFirstOrThrow();
 const ws = await db.insertInto('workspaces').values({name:'Ordinary fixture',mode:'solo'}).returning('id').executeTakeFirstOrThrow();
 await db.insertInto('memberships').values({user_id:user.id,workspace_id:ws.id,role:'owner'}).execute();
 server=createApp().listen(4223,'127.0.0.1'); await new Promise<void>(resolve=>server!.once('listening',resolve));
 browser=await pw.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter((x:string)=>x!=='--disable-web-security'),headless:true});
 const page=await browser.newPage(); let founderRequests=0;
 page.on('request', (request: { url(): string }) => { if (request.url().endsWith('/api/founders/login')) founderRequests++; });
 await page.goto('http://127.0.0.1:4223/login'); await page.getByLabel('Work email').fill(INITIAL_FOUNDER_EMAIL); await page.getByLabel('Password',{exact:true}).fill(password); await page.getByRole('button',{name:'Sign in'}).click();
 await page.waitForURL('http://127.0.0.1:4223/projects');
 assert.equal(founderRequests, process.env.FOUNDER_WEB_BUILD === 'opted-in' ? 1 : 0);
 assert.notEqual(await page.evaluate(async()=> (await fetch('/api/founders/me')).status),200);
 console.log(`PASS ${process.env.FOUNDER_WEB_BUILD} web build with founder API disabled: ordinary collision account signs in without founder access`);
} finally { if(browser) await browser.close(); if(server) await new Promise<void>((resolve,reject)=>server!.close(e=>e?reject(e):resolve())); await db.destroy(); }
