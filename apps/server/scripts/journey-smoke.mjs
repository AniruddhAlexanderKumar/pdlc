// Journey-first end-to-end smoke test against a running server (default http://localhost:4000).
// Creates throwaway users. Never run it against production.
//   SMOKE_URL=http://localhost:4000 npm run journey-smoke --workspace @sv/server
const B = (process.env.SMOKE_URL ?? 'http://localhost:4000') + '/api';
let cookie = '';
const pw = 'Test-' + Math.random().toString(36).slice(2) + '9x';
async function call(method, path, body) {
  const r = await fetch(B + path, {
    method,
    headers: { 'content-type': 'application/json', origin: 'http://localhost:5173', cookie },
    body: body ? JSON.stringify(body) : undefined
  });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const t = await r.text();
  let j;
  try { j = JSON.parse(t); } catch { j = t; }
  return { s: r.status, j };
}
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) process.exitCode = 1; };

const email = `j${Date.now()}@example.com`;
let r = await call('POST', '/auth/register', { acceptedTerms: true, name: 'Journey User', email, password: pw, workspaceName: 'Journey Co' });
ok(r.s === 201 && r.j.workspace.role === 'owner', 'register ' + r.s);

// ── Project creation seeds its Journey from the chosen template ──────────────
r = await call('POST', '/projects', { key: 'SOLR', name: 'Solar purifier', description: 'Field purifier', template: 'hardware' });
ok(r.s === 201 && r.j.key === 'SOLR', 'create project ' + r.s);
const projectId = r.j.id;

r = await call('GET', `/journeys/projects/${projectId}`);
ok(r.s === 200 && r.j.stages.length === 6, 'hardware journey seeded: ' + (r.j.stages?.length ?? r.j.error));
ok(r.j.journey.template === 'hardware', 'template recorded');
ok(r.j.stages[0].state === 'active' && r.j.stages[0].activities.length > 0, 'first stage active with activities');
ok(typeof r.j.summary.percent === 'number' && r.j.summary.nextAction, 'summary has percent and next action');
const journey = r.j;

// ── Progress from real state ─────────────────────────────────────────────────
const firstStage = journey.stages[0];
const firstActivity = firstStage.activities[0];
r = await call('PATCH', `/journeys/activities/${firstActivity.id}`, { status: 'in_progress' });
ok(r.s === 200, 'start activity ' + r.s);
r = await call('PATCH', `/journeys/activities/${firstActivity.id}`, { status: 'completed' });
ok(r.s === 200, 'complete activity ' + r.s);
r = await call('GET', `/journeys/projects/${projectId}`);
ok(r.j.summary.activitiesCompleted === 1 && r.j.summary.percent > 0, 'progress reflects completion: ' + r.j.summary.percent + '%');
ok(r.j.stages[0].percent > 0 && r.j.stages[0].percent < 100, 'stage percent partial: ' + r.j.stages[0].percent);

// ── Tasks (issues) attach to a stage and count toward progress ───────────────
r = await call('POST', `/projects/${projectId}/issues`, { summary: 'Order membrane sheets', stageId: firstStage.id });
ok(r.s === 201 && r.j.stageId === firstStage.id, 'issue created with stage ' + r.s);
const issueId = r.j.id;
r = await call('PATCH', `/projects/${projectId}/issues/${issueId}`, { status: 'Done' });
ok(r.s === 200 && r.j.status === 'Done', 'issue done');
r = await call('GET', `/journeys/projects/${projectId}`);
const stageAfter = r.j.stages.find(s => s.id === firstStage.id);
ok(stageAfter.issues.length === 1 && stageAfter.issues[0].status === 'Done', 'issue shown in stage');
ok(r.j.summary.percent > 0, 'issue counts toward progress');

// ── Custom activity, review/approval workflow ────────────────────────────────
r = await call('POST', `/journeys/projects/${projectId}/activities`, {
  stageId: journey.stages[1].id, kind: 'approval', title: 'Requirements sign-off'
});
ok(r.s === 201 && r.j.id, 'create activity ' + r.s);
const approvalId = r.j.id;
r = await call('POST', `/journeys/activities/${approvalId}/review`, { action: 'request' });
ok(r.s === 200 && r.j.reviewState === 'pending', 'review requested');
r = await call('GET', `/journeys/projects/${projectId}`);
ok(r.j.summary.pendingApprovals === 1, 'pending approval counted');
r = await call('POST', `/journeys/activities/${approvalId}/review`, { action: 'approve', note: 'Looks good' });
ok(r.s === 200 && r.j.reviewState === 'approved', 'approved');
r = await call('GET', `/journeys/projects/${projectId}`);
const approved = r.j.stages.flatMap(s => s.activities).find(a => a.id === approvalId);
ok(approved.status === 'completed' && approved.reviewState === 'approved', 'approval completed the activity');

// ── Blockers ─────────────────────────────────────────────────────────────────
const target = r.j.stages[1].activities.find(a => a.id !== approvalId && a.status !== 'completed') ?? r.j.stages[2].activities[0];
r = await call('PATCH', `/journeys/activities/${target.id}`, { status: 'blocked', blockedReason: 'Waiting on lab' });
ok(r.s === 200, 'block activity');
r = await call('GET', `/journeys/projects/${projectId}`);
ok(r.j.summary.blockers >= 1, 'blocker counted');
const blockedStage = r.j.stages.find(s => s.blockers > 0 && s.state !== 'completed');
ok(blockedStage === undefined || ['blocked', 'active', 'upcoming'].includes(blockedStage.state), 'blocked stage state valid');

// ── Dependencies ─────────────────────────────────────────────────────────────
const depA = r.j.stages[2].activities[0];
const depB = r.j.stages[2].activities[1] ?? r.j.stages[3].activities[0];
if (depA && depB && depA.id !== depB.id) {
  r = await call('POST', `/journeys/activities/${depB.id}/dependencies`, { dependsOnId: depA.id });
  ok(r.s === 201, 'dependency added');
  r = await call('GET', `/journeys/projects/${projectId}`);
  const waiting = r.j.stages.flatMap(s => s.activities).find(a => a.id === depB.id);
  ok(waiting.waitingOn.length === 1, 'waitingOn reported');
}

// ── Custom stage ─────────────────────────────────────────────────────────────
r = await call('POST', `/journeys/projects/${projectId}/stages`, { name: 'Supplier selection', description: 'Pick a supplier' });
ok(r.s === 201, 'custom stage ' + r.s);
r = await call('GET', `/journeys/projects/${projectId}`);
ok(r.j.stages.length === 7, 'stage count ' + r.j.stages.length);

// ── Design Studio links ──────────────────────────────────────────────────────
r = await call('POST', '/designs', { title: 'Flow diagram', projectId, productId: null });
ok(r.s === 201, 'diagram created ' + r.s);
const diagramId = r.j.document.id;
r = await call('POST', `/journeys/activities/${firstActivity.id}/link`, { artifactType: 'diagram', artifactId: diagramId });
ok(r.s === 201, 'diagram linked to activity');
r = await call('GET', `/journeys/projects/${projectId}`);
const linked = r.j.stages.flatMap(s => s.activities).find(a => a.id === firstActivity.id);
ok(linked.artifacts.some(x => x.id === diagramId && x.type === 'diagram'), 'artifact listed on activity');
r = await call('GET', `/designs?projectId=${projectId}`);
ok(r.s === 200 && r.j.length === 1, 'designs filtered by project');

// ── Isolation: another workspace cannot see this journey ─────────────────────
const ownerCookie = cookie;
cookie = '';
const email2 = `j2${Date.now()}@example.com`;
r = await call('POST', '/auth/register', { acceptedTerms: true, name: 'Other', email: email2, password: pw, workspaceName: 'Other Co' });
ok(r.s === 201, 'second workspace registered');
r = await call('GET', `/journeys/projects/${projectId}`);
ok(r.s === 404, 'foreign journey 404: ' + r.s);
r = await call('PATCH', `/journeys/activities/${firstActivity.id}`, { status: 'in_progress' });
ok(r.s === 404, 'foreign activity patch 404: ' + r.s);
r = await call('POST', `/journeys/projects/${projectId}/activities`, { stageId: firstStage.id, kind: 'risk', title: 'Leak' });
ok(r.s === 404, 'foreign activity create 404: ' + r.s);

cookie = ownerCookie;
r = await call('GET', `/journeys/projects/${projectId}/members`);
ok(r.s === 200 && r.j.some(m => m.name === 'Journey User'), 'members list for assignees');

if (process.exitCode) console.log('\nSome journey checks failed.');
else console.log('\nAll journey checks passed.');
