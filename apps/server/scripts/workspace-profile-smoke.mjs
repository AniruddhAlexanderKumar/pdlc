// Run only against a disposable, migrated local database/API.
import assert from 'node:assert/strict';
const base = process.env.PROFILE_SMOKE_URL;
if (!base || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Set PROFILE_SMOKE_URL to a disposable local API');
const origin = process.env.PROFILE_SMOKE_ORIGIN ?? 'http://localhost:5173';
async function call(method, path, body, cookie) {
  const r = await fetch(`${base}/api${path}`, { method, headers: { origin, ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
async function register(name, inviteToken) {
  const r = await call('POST', '/auth/register', { name, email: `${name}-${stamp}@example.test`, password: 'Test-Password-123!', workspaceName: name, ...(inviteToken ? { inviteToken } : {}) });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r;
}
const owner = await register('owner');
const outsider = await register('outsider');
const ws = owner.data.workspace.id, foreign = outsider.data.workspace.id;
const path = id => `/workspace/profile?workspaceId=${id}`;
let r = await call('GET', path(ws), undefined, owner.cookie);
assert.equal(r.status, 200); assert.deepEqual(r.data, { revision: 0, profile: null });
assert.equal((await call('GET', path(ws))).status, 401);
assert.equal((await call('GET', path(ws), undefined, outsider.cookie)).status, 404);
const profile = { domains: ['software', 'education'], objective: 'Build a SaaS project', requirements: ['projects', 'verification'], navigation: ['projects', 'help'] };
assert.equal((await call('PUT', '/workspace/profile', { workspaceId: foreign, revision: 0, profile }, owner.cookie)).status, 404);
for (const invalid of [
  { ...profile, domains: [] }, { ...profile, domains: ['software', 'software'] },
  { ...profile, domains: ['fake'] }, { ...profile, requirements: ['projects', 'projects'] },
  { ...profile, navigation: ['projects', 'projects'] }, { ...profile, objective: 'a'.repeat(301) },
  { ...profile, unexpected: true }
]) assert.equal((await call('PUT', '/workspace/profile', { workspaceId: ws, revision: 0, profile: invalid }, owner.cookie)).status, 400);
r = await call('PUT', '/workspace/profile', { workspaceId: ws, revision: 0, profile }, owner.cookie);
assert.equal(r.status, 200, JSON.stringify(r.data)); assert.deepEqual(r.data, { revision: 1, profile });
assert.equal((await call('PUT', '/workspace/profile', { workspaceId: ws, revision: 0, profile }, owner.cookie)).status, 409);
const invite = await call('POST', '/workspace/invites', { role: 'member' }, owner.cookie);
assert.equal(invite.status, 201, JSON.stringify(invite.data));
const member = await register('member', new URL(invite.data.url).pathname.split('/').pop());
assert.equal(member.data.workspace.id, ws);
r = await call('GET', path(ws), undefined, member.cookie);
assert.equal(r.status, 200); assert.deepEqual(r.data.profile, profile);
assert.equal((await call('PUT', '/workspace/profile', { workspaceId: ws, revision: 1, profile }, member.cookie)).status, 403);
const revised = { ...profile, objective: 'Research', domains: ['research'] };
r = await call('PUT', '/workspace/profile', { workspaceId: ws, revision: 1, profile: revised }, owner.cookie);
assert.equal(r.status, 200); assert.equal(r.data.revision, 2);
r = await call('GET', path(ws), undefined, member.cookie); assert.deepEqual(r.data.profile, revised);
r = await call('GET', path(foreign), undefined, outsider.cookie); assert.deepEqual(r.data, { revision: 0, profile: null });
const adminInvite = await call('POST', '/workspace/invites', { role: 'admin' }, owner.cookie);
assert.equal(adminInvite.status, 201);
const admin = await register('admin', new URL(adminInvite.data.url).pathname.split('/').pop());
assert.equal(admin.data.workspace.role, 'admin');
const writes = await Promise.all([
  call('PUT', '/workspace/profile', { workspaceId: ws, revision: 2, profile: { ...revised, objective: 'First change' } }, owner.cookie),
  call('PUT', '/workspace/profile', { workspaceId: ws, revision: 2, profile: { ...revised, objective: 'Second change' } }, admin.cookie)
]);
assert.deepEqual(writes.map(x => x.status).sort(), [200, 409]);
assert.equal((await call('GET', path(ws), undefined, member.cookie)).data.revision, 3);
console.log('Workspace profile API smoke passed: validation, concurrent revision conflict, persistence, owner/admin/member permissions and workspace isolation.');
