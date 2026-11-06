// Only use a disposable local API/database; this creates synthetic accounts.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const base = process.env.FOUNDERS_SMOKE_URL;
const database = process.env.FOUNDERS_SMOKE_DATABASE_URL;
if (!base || !database || !['localhost', '127.0.0.1'].includes(new URL(base).hostname) || !['localhost', '127.0.0.1'].includes(new URL(database).hostname) || new URL(database).pathname !== '/founders_boundary_test') {
  throw Error('Use only a disposable localhost API and a localhost database named founders_boundary_test');
}
const pool = new pg.Pool({ connectionString: database });
const stamp = randomUUID();
async function request(path, { method = 'GET', cookie, body } = {}) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: { origin: 'http://localhost:5173', ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  return { response, data: response.status === 204 ? null : await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function register(label) {
  const result = await request('/auth/register', { method: 'POST', body: { name: label, email: `${label}-${stamp}@example.test`, password: 'Synthetic-test-password-123!', workspaceName: label, workspaceMode: 'team' } });
  assert.equal(result.response.status, 201);
  return result;
}
async function denied(cookie) {
  for (const path of ['/founders', '/founders/overview', '/founders/accounts', '/founders/audit']) {
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
      const result = await request(path, { method, cookie });
      assert.equal(result.response.status, 404, `${method} ${path}`);
      assert.deepEqual(result.data, { error: 'Not found' });
      assert.equal(result.response.headers.get('cache-control'), 'no-store');
    }
  }
}
try {
  await denied();
  const owner = await register('owner');
  const workspaceAdmin = await register('workspace-admin');
  const ordinary = await register('ordinary');
  const systemAdmin = await register('system-admin');
  await pool.query('update memberships set role = $1 where user_id = $2', ['admin', workspaceAdmin.data.user.id]);
  await pool.query('update memberships set role = $1 where user_id = $2', ['member', ordinary.data.user.id]);
  await pool.query('update users set is_admin = true where id = $1', [systemAdmin.data.user.id]);
  for (const [account, expectedRole, isAdmin] of [[owner, 'owner', false], [workspaceAdmin, 'admin', false], [ordinary, 'member', false], [systemAdmin, 'owner', true]]) {
    const me = await request('/auth/me', { cookie: account.cookie });
    assert.equal(me.response.status, 200);
    assert.equal(me.data.workspace.role, expectedRole);
    assert.equal(me.data.user.isAdmin, isAdmin);
    await denied(account.cookie);
  }
  assert.equal((await request('/admin/overview', { cookie: systemAdmin.cookie })).response.status, 200);
  assert.equal((await request('/admin/overview', { cookie: workspaceAdmin.cookie })).response.status, 403);
  assert.equal((await request('/auth/logout', { method: 'POST', cookie: systemAdmin.cookie })).response.status, 204);
  assert.equal((await request('/auth/me', { cookie: systemAdmin.cookie })).response.status, 401);
  await denied(systemAdmin.cookie);
  console.log('PASS closed founder namespace with anonymous, owner, workspace admin, member, system admin and revoked ordinary sessions');
} finally {
  await pool.end();
}
