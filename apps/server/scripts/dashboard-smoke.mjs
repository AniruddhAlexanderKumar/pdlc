// Run only against an isolated development server, not production:
// DASHBOARD_SMOKE_URL=http://localhost:4000 DASHBOARD_SMOKE_ORIGIN=http://localhost:5173 node apps/server/scripts/dashboard-smoke.mjs
import assert from 'node:assert/strict';
if (!process.env.DASHBOARD_SMOKE_URL) throw new Error('Set DASHBOARD_SMOKE_URL to an isolated development server.');
const base = `${process.env.DASHBOARD_SMOKE_URL}/api`;
const origin = process.env.DASHBOARD_SMOKE_ORIGIN ?? 'http://localhost:5173';
async function call(cookie, method, path, body) {
  const response = await fetch(base + path, {
    method,
    headers: { origin, ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    data: response.status === 204 ? null : await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0],
  };
}
const stamp = Date.now(),
  password = `Test-${stamp}Abc9`;
async function register(n, inviteToken) {
  const email = `dashboard-${stamp}-${n}@example.test`;
  const r = await call('', 'POST', '/auth/register', {
    name: `Dashboard ${n}`,
    email,
    password,
    workspaceName: `Workspace ${n}`,
    ...(inviteToken ? { inviteToken } : {}),
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { cookie: r.cookie, email, me: r.data };
}
const owner = await register('owner');
const foreign = await register('foreign');
let r = await call(owner.cookie, 'POST', '/workspace/invites', { role: 'member' });
assert.equal(r.status, 201, JSON.stringify(r.data));
const member = await register('member', new URL(r.data.url).pathname.split('/').pop());
r = await call(owner.cookie, 'GET', '/auth/me');
assert.equal('language' in r.data.user, false);
r = await call(owner.cookie, 'PUT', '/auth/language', { language: 'fr' });
assert.equal(r.status, 404);
r = await call(owner.cookie, 'GET', '/dashboard/app-layout');
assert.deepEqual(r.data, { navigation: 'expanded', contentWidth: 'full' });
for (const navigation of ['expanded', 'compact', 'tabs', 'menu']) {
  r = await call(owner.cookie, 'PUT', '/dashboard/app-layout', { navigation, contentWidth: 'full' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await call(owner.cookie, 'GET', '/dashboard/app-layout');
  assert.equal(r.data.navigation, navigation);
}
r = await call(owner.cookie, 'PUT', '/dashboard/app-layout', { navigation: 'compact', contentWidth: 'constrained' });
assert.equal(r.status, 200);
r = await call(member.cookie, 'GET', '/dashboard/app-layout');
assert.deepEqual(r.data, { navigation: 'expanded', contentWidth: 'full' });
r = await call(member.cookie, 'PUT', '/dashboard/app-layout', { navigation: 'invalid', contentWidth: 'full' });
assert.equal(r.status, 400);
r = await call('', 'GET', '/dashboard/app-layout');
assert.equal(r.status, 401);
r = await call(owner.cookie, 'GET', '/dashboard');
assert.equal(r.data.preset, 'executive');
assert.equal(r.data.isDefault, true);
r = await call(member.cookie, 'GET', '/dashboard');
assert.equal(r.data.preset, 'personal');
const layout = {
  preset: 'engineering',
  density: 'compact',
  items: [
    { widget: 'assigned-issues', span: 12 },
    { widget: 'project-summary', span: 6 },
  ],
};
r = await call(owner.cookie, 'PUT', '/dashboard', layout);
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.deepEqual(r.data.items, layout.items);
assert.ok(r.data.updatedAt);
r = await call(member.cookie, 'GET', '/dashboard');
assert.equal(r.data.preset, 'personal');
r = await call(member.cookie, 'PUT', '/dashboard', { preset: 'quality' });
assert.equal(r.status, 200);
r = await call(owner.cookie, 'GET', '/dashboard');
assert.equal(r.data.preset, 'engineering');
assert.deepEqual(r.data.items, layout.items);
for (const invalid of [
  { preset: 'engineering', items: [{ widget: 'assigned-issues', span: 3 }] },
  {
    preset: 'engineering',
    items: [
      { widget: 'assigned-issues', span: 6 },
      { widget: 'assigned-issues', span: 6 },
    ],
  },
  { preset: 'engineering', items: [{ widget: 'unknown', span: 6 }] },
  { preset: 'unknown' },
]) {
  r = await call(owner.cookie, 'PUT', '/dashboard', invalid);
  assert.equal(r.status, 400, JSON.stringify(r.data));
}
r = await call(owner.cookie, 'POST', '/auth/logout', {});
assert.equal(r.status, 204);
r = await call('', 'POST', '/auth/login', { email: owner.email, password });
assert.equal(r.status, 200, JSON.stringify(r.data));
owner.cookie = r.cookie;
r = await call(owner.cookie, 'GET', '/dashboard');
assert.equal(r.data.preset, 'engineering');
assert.deepEqual(r.data.items, layout.items);
assert.equal(r.data.density, 'compact');
r = await call(owner.cookie, 'GET', '/dashboard/app-layout');
assert.deepEqual(r.data, { navigation: 'compact', contentWidth: 'constrained' });
r = await call(owner.cookie, 'POST', '/projects', { key: 'DASH', name: 'Dashboard project' });
assert.equal(r.status, 201, JSON.stringify(r.data));
const project = r.data;
r = await call(owner.cookie, 'POST', `/projects/${project.id}/issues`, {
  summary: 'Assigned high priority',
  priority: 'High',
  assigneeId: member.me.user.id,
});
assert.equal(r.status, 201, JSON.stringify(r.data));
const issue = r.data;
r = await call(owner.cookie, 'POST', `/projects/${project.id}/issues`, { summary: 'Dependency' });
assert.equal(r.status, 201);
const dependency = r.data;
r = await call(owner.cookie, 'POST', '/teamwork-graph/relationships', { sourceId: issue.id, targetId: dependency.id, type: 'depends_on' });
assert.equal(r.status, 201, JSON.stringify(r.data));
r = await call(foreign.cookie, 'POST', '/projects', { key: 'FOREIGN', name: 'Foreign project' });
assert.equal(r.status, 201);
const otherProject = r.data;
r = await call(foreign.cookie, 'POST', `/projects/${otherProject.id}/issues`, { summary: 'Foreign secret', priority: 'Critical' });
assert.equal(r.status, 201);
r = await call(member.cookie, 'GET', '/dashboard/summary');
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.projectCount, 1);
assert.equal(r.data.total, 2);
assert.equal(r.data.dependencies[0].id, issue.id);
assert.equal(r.data.assigned[0].id, issue.id);
assert.equal(r.data.priority[0].id, issue.id);
assert(!JSON.stringify(r.data).includes('Foreign secret'));
r = await call(owner.cookie, 'PATCH', `/projects/${project.id}/issues/${dependency.id}`, { status: 'Done' });
assert.equal(r.status, 200);
r = await call(owner.cookie, 'GET', '/dashboard/summary');
assert.equal(r.data.dependencies.length, 0);
assert.equal(r.data.done, 1);
assert.equal(r.data.projects[0].done, 1);
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.assigned.length, 0);
assert(r.data.workload.some((w) => w.id === member.me.user.id && w.open === 1));
r = await call('', 'GET', '/dashboard/summary');
assert.equal(r.status, 401);
console.log('Dashboard integration checks passed (account isolation, persistence, validation and workspace-scoped data).');
