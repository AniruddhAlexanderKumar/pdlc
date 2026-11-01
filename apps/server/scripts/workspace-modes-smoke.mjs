// Run only against an isolated development server and its isolated database.
// WORKSPACE_SMOKE_URL=http://localhost:4000 WORKSPACE_SMOKE_DB=postgres://velocity:velocity@localhost:5433/velocity node apps/server/scripts/workspace-modes-smoke.mjs
import assert from 'node:assert/strict';
import pg from 'pg';
const base = process.env.WORKSPACE_SMOKE_URL;
const dbUrl = process.env.WORKSPACE_SMOKE_DB;
if (!base || !dbUrl || !['localhost', '127.0.0.1'].includes(new URL(base).hostname) || !['localhost', '127.0.0.1'].includes(new URL(dbUrl).hostname)) throw new Error('Set isolated local WORKSPACE_SMOKE_URL and WORKSPACE_SMOKE_DB.');
const stamp = Date.now();
async function call(cookie, method, path, body) {
  const r = await fetch(`${base}/api${path}`, { method, headers: { origin: 'http://localhost:5173', ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: r.status === 204 ? null : await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
async function register(name, workspaceMode) {
  const r = await call('', 'POST', '/auth/register', { name, email: `workspace-mode-${stamp}-${name.toLowerCase()}@example.test`, password: `Test-${stamp}Abc9`, workspaceName: `${name} personal`, workspaceMode });
  assert.equal(r.status, 201, JSON.stringify(r.data)); return r;
}
const owner = await register('Owner', 'solo');
const other = await register('Other', 'solo');
const legacy = await register('Legacy', undefined);
assert.equal(legacy.data.workspace.mode, 'team');
const solo = owner.data.workspace.id;
assert.equal(owner.data.workspace.mode, 'solo');
let r = await call(owner.cookie, 'POST', '/workspace/invites', { role: 'member' });
assert.equal(r.status, 403);
r = await call(owner.cookie, 'PATCH', '/workspace', { mode: 'team' });
assert.equal(r.status, 400);
r = await call(owner.cookie, 'GET', '/auth/me');
assert.equal(r.data.workspace.mode, 'solo');
r = await call(owner.cookie, 'POST', '/products', { name: 'Private product' });
assert.equal(r.status, 201, JSON.stringify(r.data));
const productId = r.data.data.id;
r = await call(owner.cookie, 'POST', '/workspace/workspaces', { name: 'Team workspace', mode: 'team', currency: 'INR' });
assert.equal(r.status, 201, JSON.stringify(r.data));
assert.equal(r.data.workspace.mode, 'team');
const team = r.data.workspace.id;
assert.equal(r.data.workspaces.length, 2);
r = await call(owner.cookie, 'GET', '/workspace/data');
assert.equal(r.status, 200); assert.equal(r.data.products.some((product) => product.id === productId), false);
r = await call(owner.cookie, 'POST', '/workspace/invites', { role: 'member' });
assert.equal(r.status, 201, JSON.stringify(r.data));
const token = new URL(r.data.url).pathname.split('/').pop();
r = await call(other.cookie, 'POST', '/auth/accept-invite', { token });
assert.equal(r.status, 200); assert.equal(r.data.workspace.id, team); assert.equal(r.data.workspace.role, 'member');
r = await call(other.cookie, 'POST', '/auth/switch-workspace', { workspaceId: solo });
assert.equal(r.status, 403);
r = await call(owner.cookie, 'POST', '/auth/switch-workspace', { workspaceId: solo });
assert.equal(r.status, 200); assert.equal(r.data.workspace.mode, 'solo');
r = await call(owner.cookie, 'GET', '/workspace/data');
assert.equal(r.status, 200); assert.equal(r.data.products.some((product) => product.id === productId), true);
const db = new pg.Client({ connectionString: dbUrl }); await db.connect();
try {
  // A system-admin path and direct DB writes must not bypass the one-member rule.
  await db.query('UPDATE users SET is_admin=true WHERE id=$1', [owner.data.user.id]);
  r = await call(owner.cookie, 'POST', `/admin/workspaces/${solo}/members`, { userId: other.data.user.id, role: 'member' });
  assert.equal(r.status, 403, JSON.stringify(r.data));
  await assert.rejects(db.query('INSERT INTO memberships (workspace_id,user_id,role) VALUES ($1,$2,$3)', [solo, other.data.user.id, 'member']), (e) => e.code === '23514');
} finally { await db.end(); }
console.log('Workspace mode checks passed: solo privacy, team invites, switching, isolation, legacy defaults and admin/database guards.');
