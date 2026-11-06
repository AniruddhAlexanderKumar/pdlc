// Real HTTP + disposable local PostgreSQL; all accounts are synthetic.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { sql } from 'kysely';
const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid');
if (process.env.NODE_ENV !== 'test' || url.hostname !== '127.0.0.1' || url.pathname !== '/founders_dashboard_test') throw Error('Requires disposable local founders_dashboard_test');
process.env.FOUNDER_AUTH_EXPERIMENTAL = 'true'; process.env.FOUNDER_MANAGEMENT_EXPERIMENTAL = 'true';
process.env.SV_FOUNDER_TOTP_KEY = randomBytes(32).toString('base64'); process.env.SV_FOUNDER_RATE_LIMIT_KEY = randomBytes(32).toString('base64'); process.env.APP_URL = 'http://localhost:5173';
const { db } = await import('../src/db/index.js'); const { migrateToLatest } = await import('../src/db/migrate.js'); const { createApp } = await import('../src/app.js');
const { hashPassword, newToken } = await import('../src/auth/crypto.js');
let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
try {
  await migrateToLatest(() => {});
  const password = `Synthetic-${randomBytes(24).toString('base64url')}`;
  async function founder(role: 'owner' | 'admin' | 'operations') {
    const row = await db.insertInto('founder_accounts').values({ name: 'Fixture', email: `${role}@example.test`, password_hash: await hashPassword(password), role, status: 'active', password_rotation_required: false, mfa_enrolled_at: new Date(), totp_ciphertext: 'synthetic', last_login_at: null, last_failed_login_at: null, password_changed_at: null, locked_until: null }).returning('id').executeTakeFirstOrThrow();
    const token = newToken(); const now = Date.now();
    await db.insertInto('founder_sessions').values({ token_hash: token.hash, founder_id: row.id, session_version: 1, idle_expires_at: new Date(now + 30 * 60_000), absolute_expires_at: new Date(now + 8 * 3600_000) }).execute();
    return { id: row.id, cookie: `sv_founder_session=${token.token}` };
  }
  const owner = await founder('owner'), admin = await founder('admin'), ops = await founder('operations');
  const ordinary = await db.insertInto('users').values({ name: 'Ordinary administrator', email: 'admin@example.test', password_hash: await hashPassword(password), is_admin: true, last_login_at: null }).returning('id').executeTakeFirstOrThrow();
  const ordinaryWs = await db.insertInto('workspaces').values({ name: 'Existing organization', mode: 'team' }).returning('id').executeTakeFirstOrThrow();
  await db.insertInto('memberships').values({ user_id: ordinary.id, workspace_id: ordinaryWs.id, role: 'owner' }).execute();
  const ordinarySession = newToken(); await db.insertInto('sessions').values({ id: ordinarySession.hash, user_id: ordinary.id, workspace_id: ordinaryWs.id, expires_at: new Date(Date.now() + 3600_000), user_agent: null, ip: null }).execute();
  server = createApp().listen(0, '127.0.0.1'); await new Promise<void>((r) => server!.once('listening', r));
  const address = server.address(); if (!address || typeof address === 'string') throw Error('No port');
  const base = `http://127.0.0.1:${address.port}`;
  async function call(path: string, method = 'GET', body?: unknown, cookie?: string, origin = 'http://localhost:5173') {
    const response = await fetch(`${base}/api${path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json', origin } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text(); return { response, data: text ? JSON.parse(text) : null };
  }
  const payload = { name: 'Individual fixture', email: 'individual@example.test', mode: 'solo', workspaceName: 'Personal fixture' };
  assert.equal((await call('/founders/customers')).response.status, 403);
  assert.equal((await call('/founders/customers', 'GET', undefined, `sv_session=${ordinarySession.token}`)).response.status, 403);
  assert.equal((await call('/founders/customers', 'POST', payload, ops.cookie)).response.status, 403);
  assert.equal((await call('/founders/customers', 'POST', payload, owner.cookie, 'https://evil.test')).response.status, 403);
  assert.equal((await call('/founders/customers', 'GET', undefined, ops.cookie)).response.status, 200);
  const created = await call('/founders/customers', 'POST', payload, owner.cookie); assert.equal(created.response.status, 201);
  const setup = new URL(created.data.setupUrl); assert.equal(setup.pathname, '/reset'); assert.equal(setup.origin, 'http://localhost:5173');
  const setupToken = setup.hash.slice(1); assert.match(setupToken, /^[\w-]{43}$/);
  const createdUser = await db.selectFrom('users').selectAll().where('id', '=', created.data.user.id).executeTakeFirstOrThrow(); assert.equal(createdUser.is_admin, false); assert(!JSON.stringify(createdUser).includes(setupToken));
  assert.equal((await db.selectFrom('workspaces').select('mode').where('id', '=', created.data.workspaceId).executeTakeFirstOrThrow()).mode, 'solo');
  assert.equal((await call('/founders/customers', 'POST', payload, owner.cookie)).response.status, 409);
  assert.equal((await call('/auth/reset/validate', 'POST', { token: setupToken })).response.status, 200);
  const customerPassword = `Customer-${randomBytes(24).toString('base64url')}`;
  const redeemed = await call('/auth/reset', 'POST', { token: setupToken, newPassword: customerPassword }); assert.equal(redeemed.response.status, 200);
  const customerCookie = redeemed.response.headers.getSetCookie().find((s) => s.startsWith('sv_session='))?.split(';')[0]; assert(customerCookie);
  assert.equal((await call('/auth/reset', 'POST', { token: setupToken, newPassword: customerPassword })).response.status, 410);
  const team = await call('/founders/customers', 'POST', { name: 'Organization owner', email: 'team@example.test', mode: 'team', workspaceName: 'Team fixture' }, admin.cookie); assert.equal(team.response.status, 201);
  assert.equal((await db.selectFrom('workspaces').select('mode').where('id', '=', team.data.workspaceId).executeTakeFirstOrThrow()).mode, 'team');
  assert.equal((await call(`/founders/customers/${created.data.user.id}/status`, 'PATCH', { disabled: true }, ops.cookie)).response.status, 403);
  assert.equal((await call(`/founders/customers/${ordinary.id}/status`, 'PATCH', { disabled: true }, owner.cookie)).response.status, 404);
  assert.equal((await call(`/founders/customers/${created.data.user.id}/status`, 'PATCH', { disabled: true }, owner.cookie)).response.status, 200);
  assert.equal((await call('/auth/me', 'GET', undefined, customerCookie)).response.status, 401);
  assert.equal((await call(`/founders/customers/${created.data.user.id}/status`, 'PATCH', { disabled: false }, owner.cookie)).response.status, 200);
  assert.equal((await call('/auth/login', 'POST', { email: payload.email, password: customerPassword })).response.status, 200);
  const list = await call('/founders/organizations', 'GET', undefined, owner.cookie); assert.equal(list.response.status, 200); assert(list.data.items.some((w: { id: string }) => w.id === team.data.workspaceId));
  const logs = await db.selectFrom('founder_security_audit').selectAll().execute();
  assert.equal(logs.filter((r) => r.event_type === 'customer_created').length, 2); assert.equal(logs.filter((r) => r.event_type === 'customer_suspended').length, 1);
  const firstAudit = logs.find((r) => r.event_type === 'customer_created' && r.target_id === created.data.user.id);
  assert.equal(firstAudit?.actor_id, owner.id); assert.equal(firstAudit?.request_id, created.response.headers.get('x-request-id'));
  assert.equal((await db.selectFrom('memberships').select('role').where('workspace_id', '=', team.data.workspaceId).where('user_id', '=', team.data.user.id).executeTakeFirstOrThrow()).role, 'owner');
  assert(!JSON.stringify(logs).includes(setupToken) && !JSON.stringify(logs).includes(customerPassword));
  await sql`CREATE FUNCTION dashboard_fixture_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$`.execute(db);
  await sql`CREATE TRIGGER dashboard_fixture_audit_failure BEFORE INSERT ON founder_security_audit FOR EACH ROW EXECUTE FUNCTION dashboard_fixture_audit_failure()`.execute(db);
  try {
    assert.equal((await call('/founders/customers', 'POST', { ...payload, email: 'rollback@example.test' }, owner.cookie)).response.status, 503);
    assert.equal(await db.selectFrom('users').select('id').where('email', '=', 'rollback@example.test').executeTakeFirst(), undefined);
  } finally { await sql`DROP TRIGGER dashboard_fixture_audit_failure ON founder_security_audit`.execute(db); await sql`DROP FUNCTION dashboard_fixture_audit_failure()`.execute(db); }
  await db.updateTable('founder_accounts').set({ status: 'suspended' }).where('id', '=', owner.id).execute();
  assert.equal((await call('/founders/customers', 'GET', undefined, owner.cookie)).response.status, 403);
  console.log('PASS local customer dashboard API: founder roles, CSRF, individual/team creation, one-time setup, session revocation, audit rollback and suspension');
} finally { if (server) await new Promise<void>((resolve, reject) => server!.close((e) => e ? reject(e) : resolve())); await db.destroy(); }
