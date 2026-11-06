// Local experimental API only. No email delivery or browser recovery is tested.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { Secret, TOTP } from 'otpauth';
const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid');
if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/founders_api_test') throw Error('Requires NODE_ENV=test and disposable localhost founders_api_test DB');
process.env.FOUNDER_AUTH_EXPERIMENTAL = 'true';
process.env.SV_FOUNDER_TOTP_KEY = randomBytes(32).toString('base64');
process.env.SV_FOUNDER_RATE_LIMIT_KEY = randomBytes(32).toString('base64');
process.env.APP_URL = 'http://localhost:5173';
const { db } = await import('../src/db/index.js');
const { migrateToLatest } = await import('../src/db/migrate.js');
const { createApp } = await import('../src/app.js');
const { bootstrapFounder, INITIAL_FOUNDER_EMAIL } = await import('../src/auth/founder-bootstrap.js');
const { newToken, hashPassword } = await import('../src/auth/crypto.js');
const secret = randomBytes(32).toString('base64url');
const tempPassword = `Synthetic-${randomBytes(24).toString('base64url')}`;
const nextPassword = `Rotated-${randomBytes(24).toString('base64url')}`;
let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
try {
  await migrateToLatest(() => {});
  assert.equal(await bootstrapFounder(db, { expectedSecretSha256: createHash('sha256').update(secret).digest('hex'), submittedSecret: secret, initialPassword: tempPassword, name: 'Synthetic founder' }), 'created');
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  const addr = server.address(); if (!addr || typeof addr === 'string') throw Error('No listener');
  const port = addr.port;
  const ordinaryPassword = `Synthetic-${randomBytes(24).toString('base64url')}`;
  const ordinary = await db.insertInto('users').values({ email: 'ordinary@example.test', name: 'Synthetic admin', password_hash: await hashPassword(ordinaryPassword), is_admin: true, last_login_at: null }).returning('id').executeTakeFirstOrThrow();
  const workspace = await db.insertInto('workspaces').values({ name: 'Synthetic workspace' }).returning('id').executeTakeFirstOrThrow();
  await db.insertInto('memberships').values({ user_id: ordinary.id, workspace_id: workspace.id, role: 'owner' }).execute();
  const ordinarySession = newToken();
  await db.insertInto('sessions').values({ id: ordinarySession.hash, user_id: ordinary.id, workspace_id: workspace.id, expires_at: new Date(Date.now() + 3600_000), ip: null, user_agent: null }).execute();
  assert.equal((await fetch(`http://127.0.0.1:${addr.port}/api/auth/me`, { headers: { cookie: `sv_session=${ordinarySession.token}` } })).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${addr.port}/api/founders/me`, { headers: { cookie: `sv_session=${ordinarySession.token}` } })).status, 401);
  let flow = ''; let session = '';
  async function call(endpoint: string, method = 'GET', body?: unknown, origin = 'http://localhost:5173') {
    const cookie = [flow, session].filter(Boolean).join('; ');
    const r = await fetch(`http://127.0.0.1:${port}/api/founders${endpoint}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(method === 'POST' ? { 'content-type': 'application/json', origin } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    for (const v of r.headers.getSetCookie()) {
      const pair = v.split(';')[0];
      if (pair.startsWith('sv_founder_flow=')) flow = pair.endsWith('=') ? '' : pair;
      if (pair.startsWith('sv_founder_session=')) session = pair.endsWith('=') ? '' : pair;
    }
    const json = (r.status === 204 ? {} : await r.json()) as { step: string; secret: string; recoveryCodes: string[] };
    return { r, json };
  }
  assert.equal((await call('/login', 'POST', { email: 'ordinary@example.test', password: ordinaryPassword })).r.status, 401);
  assert.equal((await call('/login', 'POST', { email: INITIAL_FOUNDER_EMAIL, password: tempPassword }, 'https://evil.test')).r.status, 403);
  assert.equal((await call('/login', 'POST', { email: INITIAL_FOUNDER_EMAIL, password: 'invalid' })).r.status, 401);
  const login = await call('/login', 'POST', { email: INITIAL_FOUNDER_EMAIL, password: tempPassword });
  assert.equal(login.r.status, 200); assert.equal(login.json.step, 'enroll');
  assert(flow && !session);
  assert.equal((await call('/me')).r.status, 401);
  assert.equal((await call('/password/rotate', 'POST', { password: nextPassword })).r.status, 401);
  const setup = await call('/mfa/setup', 'POST', {}); assert.equal(setup.r.status, 200);
  const otp = new TOTP({ secret: Secret.fromBase32(setup.json.secret), digits: 6, period: 30, algorithm: 'SHA1' });
  assert.equal((await call('/mfa/verify', 'POST', { code: 'abcdef' })).r.status, 401);
  const enrolled = await call('/mfa/verify', 'POST', { code: otp.generate() });
  assert.equal(enrolled.r.status, 200); assert.equal(enrolled.json.step, 'rotate'); assert.equal(enrolled.json.recoveryCodes.length, 10);
  assert.equal((await call('/me')).r.status, 401);
  assert.equal((await call('/password/rotate', 'POST', { password: tempPassword })).r.status, 401);
  assert.equal((await call('/password/rotate', 'POST', { password: nextPassword })).r.status, 200);
  assert(session); assert.equal((await call('/me')).r.status, 200);
  assert.equal((await call('/accounts')).r.status, 404);
  assert.equal((await call('/customers')).r.status, 404);
  assert.equal((await call('/organizations')).r.status, 404);
  const oldSession = session;
  assert.equal((await call('/logout', 'POST', {})).r.status, 204);
  session = oldSession; assert.equal((await call('/me')).r.status, 403); session = '';
  assert.equal((await call('/login', 'POST', { email: INITIAL_FOUNDER_EMAIL, password: nextPassword })).json.step, 'verify');
  assert.equal((await call('/mfa/verify', 'POST', { code: enrolled.json.recoveryCodes[0] })).json.step, 'authenticated');
  assert.equal((await call('/me')).r.status, 200);
  await db.updateTable('founder_accounts').set({ status: 'suspended' }).execute();
  assert.equal((await call('/me')).r.status, 403);
  assert.equal((await call('/login', 'POST', { email: INITIAL_FOUNDER_EMAIL, password: nextPassword })).r.status, 401);
  await db.updateTable('founder_accounts').set({ status: 'active', failed_logins: 0, locked_until: null }).execute();
  // Isolate the pre-existing account-wide lockout test from the shared bucket test.
  await db.deleteFrom('founder_rate_limits').execute();
  for (let i = 0; i < 5; i++) assert.equal((await call('/login', 'POST', { email: INITIAL_FOUNDER_EMAIL, password: 'incorrect' })).r.status, 401);
  const initialLock = (await db.selectFrom('founder_accounts').select(['locked_until', 'failed_logins']).executeTakeFirstOrThrow());
  assert(initialLock.locked_until);
  assert.equal((await call('/login', 'POST', { email: INITIAL_FOUNDER_EMAIL, password: nextPassword })).r.status, 401);
  const afterLockedAttempt = (await db.selectFrom('founder_accounts').select(['locked_until', 'failed_logins']).executeTakeFirstOrThrow());
  assert.equal(afterLockedAttempt.locked_until?.getTime(), initialLock.locked_until.getTime());
  assert.equal(afterLockedAttempt.failed_logins, initialLock.failed_logins);
  let limited = false;
  for (let i = 0; i < 35; i++) {
    const response = await call('/login', 'POST', { email: 'unknown@example.test', password: 'synthetic-password' });
    if (response.r.status === 429) { limited = true; break; }
    assert.equal(response.r.status, 401);
  }
  assert(limited, 'shared IP rate limiter must reject excess attempts');
  // Simulate the limiter store being unavailable: authentication must not proceed.
  await db.schema.alterTable('founder_rate_limits').renameTo('founder_rate_limits_fixture_unavailable').execute();
  try {
    const unavailable = await call('/login', 'POST', { email: INITIAL_FOUNDER_EMAIL, password: nextPassword });
    assert.equal(unavailable.r.status, 503);
  } finally { await db.schema.alterTable('founder_rate_limits_fixture_unavailable').renameTo('founder_rate_limits').execute(); }
  console.log('PASS local-only API lifecycle, CSRF, restricted flow, MFA, password rotation, logout, suspension, shared throttling and fail-closed store failure; management remains blocked');
} finally {
  if (server) await new Promise<void>((resolve, reject) => server!.close((err) => err ? reject(err) : resolve()));
  await db.destroy();
}
