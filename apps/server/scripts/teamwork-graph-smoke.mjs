// Integration smoke test against an isolated development server. Creates two workspaces.
// GRAPH_SMOKE_URL=http://localhost:4000 node apps/server/scripts/teamwork-graph-smoke.mjs
import assert from 'node:assert/strict';
if (!process.env.GRAPH_SMOKE_URL) throw new Error('Set GRAPH_SMOKE_URL to an isolated development server; never use production.');
const base = `${process.env.GRAPH_SMOKE_URL}/api`;
const origin = process.env.GRAPH_SMOKE_ORIGIN ?? 'http://localhost:5173';
async function call(cookie, method, path, body) {
  const response = await fetch(base + path, { method, headers: { origin, ...(cookie ? {cookie} : {}), ...(body ? {'content-type': 'application/json'} : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = response.status === 204 ? null : await response.json();
  return {status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0]};
}
const stamp = Date.now(); const pw = `Test-${stamp}Abc9`;
const register = async n => { const r = await call('', 'POST', '/auth/register', {name: `Graph ${n}`, email: `graph-${stamp}-${n}@example.com`, password: pw, workspaceName: `Graph ${n}`}); assert.equal(r.status, 201, JSON.stringify(r.data)); return r.cookie; };
const owner = await register('one'); const other = await register('two');
const project = await call(owner, 'POST', '/projects', {key: 'GRAPH', name: 'Graph test'}); assert.equal(project.status, 201);
const createIssue = async (cookie, projectId, summary) => {const r = await call(cookie, 'POST', `/projects/${projectId}/issues`, {summary}); assert.equal(r.status, 201, JSON.stringify(r.data)); return r.data;};
const a = await createIssue(owner, project.data.id, 'Dependent'); const b = await createIssue(owner, project.data.id, 'Prerequisite');
const foreignProject = await call(other, 'POST', '/projects', {key: 'OTHER', name: 'Other'}); const foreign = await createIssue(other, foreignProject.data.id, 'Foreign issue');
let r = await call(owner, 'GET', `/teamwork-graph?projectId=${project.data.id}`); assert.equal(r.status, 200, JSON.stringify(r.data)); assert(r.data.nodes.some(n => n.recordId === a.id)); assert(!r.data.nodes.some(n => n.recordId === foreign.id)); assert(r.data.edges.some(e => e.type === 'contains' && e.target === `issue:${a.id}`));
r = await call(other, 'GET', `/teamwork-graph?projectId=${project.data.id}`); assert.equal(r.status, 404);
r = await call(owner, 'POST', '/teamwork-graph/relationships', {sourceId: a.id, targetId: foreign.id, type: 'depends_on'}); assert.equal(r.status, 404);
r = await call(owner, 'POST', '/teamwork-graph/relationships', {sourceId: a.id, targetId: a.id, type: 'depends_on'}); assert.equal(r.status, 400);
r = await call(owner, 'POST', '/teamwork-graph/relationships', {sourceId: a.id, targetId: b.id, type: 'fake'}); assert.equal(r.status, 400);
r = await call(owner, 'POST', '/teamwork-graph/relationships', {sourceId: a.id, targetId: b.id, type: 'depends_on', description: 'Waiting'}); assert.equal(r.status, 201, JSON.stringify(r.data)); const id = r.data.id;
r = await call(owner, 'POST', '/teamwork-graph/relationships', {sourceId: a.id, targetId: b.id, type: 'depends_on'}); assert.equal(r.status, 409);
r = await call(owner, 'POST', '/teamwork-graph/relationships', {sourceId: b.id, targetId: a.id, type: 'depends_on'}); assert.equal(r.status, 400);
r = await call(owner, 'GET', `/teamwork-graph?projectId=${project.data.id}`); assert(r.data.edges.some(e => e.id === id && e.source === `issue:${a.id}` && e.target === `issue:${b.id}`));
r = await call(owner, 'GET', '/teamwork-graph/search?q=GRAPH-1'); assert.equal(r.status, 200, JSON.stringify(r.data)); assert(r.data.nodes.some(n => n.recordId === a.id));
r = await call(other, 'GET', '/teamwork-graph/search?q=GRAPH-1'); assert.equal(r.status, 200); assert(!r.data.nodes.some(n => n.recordId === a.id));
r = await call(owner, 'GET', `/teamwork-graph?focusIssueId=${a.id}`); assert.equal(r.status, 200, JSON.stringify(r.data)); assert(r.data.nodes.some(n => n.recordId === b.id)); assert(r.data.edges.some(e => e.id === id));
r = await call(other, 'GET', `/teamwork-graph?focusIssueId=${a.id}`); assert.equal(r.status, 404);
if (process.env.GRAPH_SMOKE_AI === '1') {
  const ask = async question => call(owner, 'POST', '/teamwork-graph/ask', {question, projectId: project.data.id});
  r = await ask('What is blocking this project?'); assert.equal(r.status, 200, JSON.stringify(r.data)); assert(r.data.findings.some(f => f.id === b.id)); assert(!r.data.findings.some(f => f.id === foreign.id));
  r = await ask(`Show everything connected to ${a.key}`); assert.equal(r.status, 200, JSON.stringify(r.data)); assert(r.data.findings.some(f => f.id === b.id));
  r = await ask(`What is the impact of ${b.key}?`); assert.equal(r.status, 200, JSON.stringify(r.data)); assert(r.data.findings.some(f => f.id === a.id && f.reason === 'Direct dependent'));
  r = await ask('What is blocking this project?'); assert.equal(r.data.findings.find(f => f.id === b.id)?.supporting?.id, a.id);
  r = await ask('Show unassigned issues'); assert.equal(r.status, 200, JSON.stringify(r.data)); assert(r.data.findings.some(f => f.id === a.id));
  r = await ask('Show disconnected issues'); assert.equal(r.status, 200, JSON.stringify(r.data)); assert(!r.data.findings.some(f => f.id === a.id));
  const me = await call(owner, 'GET', '/auth/me');
  r = await call(owner, 'PATCH', `/projects/${project.data.id}/issues/${a.id}`, {assigneeId: me.data.user.id, priority: 'High'}); assert.equal(r.status, 200);
  r = await ask('Show issues assigned to Graph one'); assert.equal(r.status, 200, JSON.stringify(r.data)); assert(r.data.findings.some(f => f.id === a.id));
  r = await ask('Show high priority issues'); assert.equal(r.status, 200, JSON.stringify(r.data)); assert(r.data.findings.some(f => f.id === a.id));
  const duplicate = await createIssue(owner, project.data.id, a.summary);
  r = await ask('Find duplicate issues'); assert.equal(r.status, 200, JSON.stringify(r.data)); assert(r.data.findings.some(f => f.id === a.id && f.supporting?.id === duplicate.id));
  r = await ask('malformed'); assert.equal(r.status, 503);
  r = await call(other, 'POST', '/teamwork-graph/ask', {question: `Show everything connected to ${a.key}`, selectedIssueId: a.id}); assert.equal(r.status, 404);
}
if (process.env.GRAPH_SMOKE_LARGE === '1') {
  for (let n = 0; n < 205; n++) await createIssue(owner, project.data.id, `bulk issue ${n}`);
  r = await call(owner, 'GET', `/teamwork-graph?projectId=${project.data.id}`); assert.equal(r.status, 200); assert.equal(r.data.truncated, true); assert(!r.data.nodes.some(n => n.recordId === a.id));
  r = await call(owner, 'GET', `/teamwork-graph/search?q=${a.key}`); assert.equal(r.status, 200); assert(r.data.nodes.some(n => n.recordId === a.id));
  r = await call(owner, 'GET', `/teamwork-graph?focusIssueId=${a.id}`); assert.equal(r.status, 200); assert(r.data.nodes.some(n => n.recordId === a.id)); assert(r.data.nodes.some(n => n.recordId === b.id));
}
const secondProject = await call(owner, 'POST', '/projects', {key: 'CROSS', name: 'Cross project'}); assert.equal(secondProject.status, 201);
const crossIssue = await createIssue(owner, secondProject.data.id, 'Cross project neighbor');
r = await call(owner, 'POST', '/teamwork-graph/relationships', {sourceId: a.id, targetId: crossIssue.id, type: 'relates_to'}); assert.equal(r.status, 201);
r = await call(owner, 'GET', `/teamwork-graph?focusIssueId=${a.id}`); assert.equal(r.status, 200); assert(r.data.nodes.some(n => n.recordId === crossIssue.id)); assert(r.data.nodes.some(n => n.recordId === secondProject.data.id));
r = await call(owner, 'GET', `/teamwork-graph?projectId=${project.data.id}`); assert.equal(r.status, 200); assert(!r.data.nodes.some(n => n.recordId === crossIssue.id));
r = await call(other, 'DELETE', `/teamwork-graph/relationships/${id}`); assert.equal(r.status, 404);
r = await call(owner, 'PATCH', `/teamwork-graph/relationships/${id}`, {description: 'Updated'}); assert.equal(r.status, 200);
r = await call(owner, 'GET', `/teamwork-graph/relationships/${id}/history`); assert.deepEqual(r.data.map(e => e.action).sort(), ['created', 'updated']);
r = await call(owner, 'DELETE', `/teamwork-graph/relationships/${id}`); assert.equal(r.status, 204);
r = await call(owner, 'GET', `/teamwork-graph/relationships/${id}/history`); assert.equal(r.data.length, 3);
r = await call(owner, 'GET', `/projects/${project.data.id}/issues?issueId=${a.id}`); assert.equal(r.data.items.length, 1); assert.equal(r.data.items[0].id, a.id);
r = await call('', 'GET', '/teamwork-graph'); assert.equal(r.status, 401);
console.log('Teamwork Graph integration checks passed.');
