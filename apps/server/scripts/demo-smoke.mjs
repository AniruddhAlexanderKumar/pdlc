// Run only against a disposable local database and server started with NODE_ENV=test, ALLOW_SIGNUP=false.
// DEMO_SMOKE_URL=http://localhost:4000 DATABASE_URL=postgres://velocity:velocity@localhost:5433/velocity node --import tsx apps/server/scripts/demo-smoke.mjs
import assert from 'node:assert/strict';
import pg from 'pg';
import { cleanupExpiredDemos } from '../src/services/demoCleanup.ts';
import { db } from '../src/db/index.ts';

const base = process.env.DEMO_SMOKE_URL;
const dbUrl = process.env.DATABASE_URL;
if (!base || !dbUrl || !['localhost', '127.0.0.1'].includes(new URL(base).hostname) || !['localhost', '127.0.0.1'].includes(new URL(dbUrl).hostname)) throw new Error('An isolated local DEMO_SMOKE_URL and DATABASE_URL are required.');
const pool = new pg.Pool({ connectionString: dbUrl });
async function call(cookie, method, path, body) {
  const r = await fetch(`${base}/api${path}`, { method, headers: { origin: 'http://localhost:5173', ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: r.status === 204 ? null : await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
try {
  const first = await call('', 'POST', '/auth/demo', {});
  const second = await call('', 'POST', '/auth/demo', {});
  assert.equal(first.status, 201, JSON.stringify(first.data)); assert.equal(second.status, 201, JSON.stringify(second.data));
  assert.notEqual(first.data.workspace.id, second.data.workspace.id);
  assert.equal(first.data.workspace.mode, 'solo'); assert.ok(first.data.demo.expiresAt);
  let r = await call(first.cookie, 'GET', '/workspace/data');
  assert.ok(r.data.products.length && r.data.materials.length && r.data.suppliers.length);
  assert.ok(r.data.products.every(product => product.imageUrl === ''), 'public demo should not depend on external image hosts');
  const sampleId = r.data.products[0].id;
  r = await call(first.cookie, 'POST', '/products', { name: 'Guest-only product' }); assert.equal(r.status, 201, JSON.stringify(r.data));
  const project = await call(first.cookie, 'POST', '/projects', { key:'DEMO', name:'Guest project' }); assert.equal(project.status, 201, JSON.stringify(project.data));
  const issue = await call(first.cookie, 'POST', `/projects/${project.data.id}/issues`, { summary:'Guest issue' }); assert.equal(issue.status, 201, JSON.stringify(issue.data));
  await pool.query("UPDATE sessions SET last_seen_at = now() - interval '3 hours' WHERE user_id = $1", [first.data.user.id]);
  r = await call(first.cookie, 'GET', '/auth/me'); assert.equal(r.data.demo.expiresAt, first.data.demo.expiresAt);
  const sessionExpiry = await pool.query('SELECT expires_at FROM sessions WHERE user_id = $1', [first.data.user.id]);
  assert.equal(sessionExpiry.rows[0].expires_at.toISOString(), first.data.demo.expiresAt);
  r = await call(second.cookie, 'GET', '/workspace/data'); assert.ok(!r.data.products.some(p => p.name === 'Guest-only product'));
  r = await call(second.cookie, 'PATCH', `/products/${sampleId}`, { name: 'Cross workspace' }); assert.equal(r.status, 404);
  for (const [method, path, body] of [['POST', '/workspace/workspaces', {name:'Escape', mode:'team'}], ['POST', '/auth/accept-invite', {token:'x'}], ['POST', '/auth/switch-workspace', {workspaceId:second.data.workspace.id}], ['POST', '/workspace/invites', {role:'member'}], ['POST', '/voice/process', {transcript:'hello there'}], ['POST', '/teamwork-graph/ask', {question:'hello world'}], ['POST', '/teamwork-graph/ask/', {question:'hello world'}], ['POST', '/ai/chat', {prompt:'hello'}], ['GET', '/admin/users']]) {
    r = await call(first.cookie, method, path, body); assert.equal(r.status, 403, `${method} ${path}: ${JSON.stringify(r)}`);
  }
  r = await call(first.cookie, 'POST', '/auth/demo', {}); assert.equal(r.status, 200); assert.equal(r.data.workspace.id, first.data.workspace.id);
  r = await call('', 'GET', '/auth/config'); assert.equal(r.data.allowSignup, true, 'demo users must not block first real signup');
  const real = await call('', 'POST', '/auth/register', {name:'Real User', email:`real-${Date.now()}@example.test`, password:'Password123!', workspaceName:'Real workspace', workspaceMode:'solo'});
  assert.equal(real.status, 201, JSON.stringify(real.data));
  r = await call('', 'GET', '/auth/config'); assert.equal(r.data.allowSignup, false);
  r = await call(real.cookie, 'POST', '/auth/demo', {}); assert.equal(r.status, 409);
  r = await call(real.cookie, 'GET', '/auth/me'); assert.equal(r.data.workspace.id, real.data.workspace.id); assert.equal(r.data.demo, undefined);
  await pool.query('UPDATE demo_guests SET expires_at = now() - interval \'1 minute\' WHERE user_id = $1', [first.data.user.id]);
  r = await call(first.cookie, 'GET', '/auth/me'); assert.equal(r.status, 401);
  await cleanupExpiredDemos();
  const deleted = await pool.query('SELECT (SELECT count(*) FROM users WHERE id = $1)::int AS users, (SELECT count(*) FROM workspaces WHERE id = $2)::int AS workspaces', [first.data.user.id, first.data.workspace.id]);
  assert.deepEqual(deleted.rows[0], {users:0, workspaces:0});
  r = await call(second.cookie, 'GET', '/auth/me'); assert.equal(r.status, 200);
  r = await call(real.cookie, 'GET', '/auth/me'); assert.equal(r.status, 200);
  console.log('Demo smoke passed: isolation, restrictions, first signup, existing session protection, fixed expiry and cleanup.');
} finally { await db.destroy(); await pool.end(); }
