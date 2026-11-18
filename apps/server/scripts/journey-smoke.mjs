// Synthetic, localhost-only black-box integration. No fixture writes to production.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PATH_STAGES, questionsForStage, requiresApproval } from '@sv/shared';
const url = process.env.JOURNEY_TEST_URL;
if (process.env.NODE_ENV !== 'test' || !url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
  throw Error('Set JOURNEY_TEST_URL to a disposable localhost test API');
const password = `Test-${randomUUID()}`;
async function call(cookie, method, path, data, status = 200) {
  const r = await fetch(`${url}/api${path}`, {
    method,
    headers: {
      origin: process.env.APP_URL ?? 'http://localhost:5173',
      ...(cookie ? { cookie } : {}),
      ...(data !== undefined ? { 'content-type': 'application/json' } : {})
    },
    body: data === undefined ? undefined : JSON.stringify(data)
  });
  const result = await r.json().catch(() => null);
  assert.equal(r.status, status, `${method} ${path}: ${JSON.stringify(result)}`);
  return { result, cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
function register(inviteToken) {
  return call(
    '',
    'POST',
    '/auth/register',
    {
      email: `journey-${randomUUID()}@example.test`,
      name: 'Journey fixture',
      password,
      workspaceName: 'Journey fixture',
      inviteToken
    },
    201
  );
}
const { cookie: owner, result: me } = await register(),
  { cookie: foreign } = await register();
const invitation = await call(owner, 'POST', '/workspace/invites', { role: 'member' }, 201);
const { cookie: member } = await register(new URL(invitation.result.url).pathname.split('/').pop());
const newProduct = await call(
  owner,
  'POST',
  '/products',
  { name: 'Tutor pilot', productKind: 'software', guideMode: 'advanced' },
  201
);
const id = newProduct.result.data.id,
  root = `/products/${id}`;
const answer = (cookie, key, value, previousValue, status) =>
  call(cookie, 'PUT', `${root}/answers/${key}`, { value, previousValue }, status).then((r) => r.result);
const data = async (cookie) => (await call(cookie, 'GET', '/workspace/data')).result.products.find((p) => p.id === id);
const act = async () => (await call(owner, 'GET', root + '/activities')).result;
const draft = root + '/drafts/idea.problem',
  mine = { value: 'Unfinished founder note', previousValue: null };
assert.equal((await call(owner, 'GET', '/auth/me')).result.user.guideMode, 'advanced');
await call(owner, 'PUT', draft, mine, 204);
await call(member, 'PUT', draft, { ...mine, value: 'Separate draft' }, 204);
assert.equal((await call(owner, 'GET', '/products/drafts')).result[0].value, mine.value);
assert.equal((await call(member, 'GET', '/products/drafts')).result[0].value, 'Separate draft');
assert.deepEqual((await call(foreign, 'GET', '/products/drafts')).result, []);
await call(foreign, 'PUT', draft, mine, 404);
await call(foreign, 'DELETE', draft, undefined, 404);
await answer(foreign, 'idea.problem', 'unrelated', null, 404);
await call('', 'GET', '/products/drafts', undefined, 401);
assert.equal((await data(owner)).answers['idea.problem'], undefined);
const [a, b] = await Promise.all([
  answer(member, 'idea.problem', 'Schedule gaps', null),
  answer(owner, 'idea.problem', 'Schedule gaps', null)
]);
assert.equal(a.xp.length + b.xp.length, 1);
assert.deepEqual((await call(member, 'GET', '/products/drafts')).result, []);
const attempt = await act();
assert.ok(attempt.records['idea.problem'].completedAt && attempt.records['idea.problem'].startedAt);
await call(owner, 'PUT', draft, { value: 'My revision', previousValue: 'Schedule gaps' }, 204);
await answer(member, 'idea.problem', 'Live team revision', 'Schedule gaps');
await answer(owner, 'idea.problem', 'My revision', 'Schedule gaps', 409);
assert.equal((await call(owner, 'GET', '/products/drafts')).result[0].value, 'My revision');
assert.deepEqual((await answer(owner, 'idea.problem', 'My revision', 'Live team revision')).xp, []);
await answer(owner, 'idea.problem', null, 'My revision');
assert.deepEqual((await answer(member, 'idea.problem', 'Schedule gaps', null)).xp, []);
await call(owner, 'PATCH', root + '/activities/idea.customer/assignee', { assigneeId: me.user.id });
await answer(member, 'idea.customer', 'Not my activity', null, 403);
const dep = root + '/activities/idea.customer/dependencies';
await call(member, 'POST', dep, { dependsOnKey: 'idea.oneliner' }, 403);
await call(owner, 'POST', dep, { dependsOnKey: 'idea.oneliner' });
assert.equal((await act()).recommendations[0].reason, 'dependency_blocked');
await call(owner, 'POST', root + '/activities/idea.oneliner/dependencies', { dependsOnKey: 'idea.customer' }, 409);
await call(owner, 'DELETE', dep + '/idea.oneliner');
await call(owner, 'PATCH', '/workspace', { showLeaderboard: false });
await call(member, 'PATCH', '/workspace', { showLeaderboard: true }, 403);
assert.deepEqual((await call(member, 'GET', '/game/leaderboard')).result, []);
await call(owner, 'PATCH', '/game/preferences', { guideMode: 'beginner', showStreak: true });
assert.equal((await call(member, 'GET', '/auth/me')).result.user.showStreak, false);
const assist = root + '/lessons/planning.mvp/assist';
await call(foreign, 'POST', assist, { message: 'Explain' }, 404);
const fallback = (await call(owner, 'POST', assist, { message: 'Explain MVP' })).result;
assert.equal(fallback.source, 'guide');
assert.match(fallback.text, /smallest|minimum viable product/i);
assert.equal((await data(owner)).answers['planning.mvp'], undefined);
console.log(
  'PASS private drafts, cross-workspace/assignment permissions, conflicts, retry-safe writes and contextual fallback'
);

function response(q) {
  switch (q.type) {
    case 'yesno':
      return false;
    case 'money':
      return q.key === 'prototype.overhead' ? 5 : 20;
    case 'number':
      return 0;
    case 'date':
      return '2027-02-01';
    case 'multi':
      return [q.options.at(-1)];
    case 'choice':
      return q.key === 'improve.return' ? 'Research' : q.options[0];
    case 'scale':
      return 3;
    case 'comparison':
      return ['Booking flow', 'Calendar: unknown', 'Group chat: manual'];
    case 'evidence':
      return ['Founder assumption', 'We do not have independent evidence.', 'Book an interview'];
    case 'ranked':
      return ['Publish a slot', 'Confirm booking'];
    default:
      return `Fixture note: ${q.output}`;
  }
}
const chapters = [],
  milestones = [],
  awards = [];
for (const [index, stage] of PATH_STAGES.entries()) {
  const next = PATH_STAGES[index + 1];
  const current = await data(owner);
  assert.equal(current.stage, stage);
  if (next) await call(owner, 'PATCH', root, { stage: next }, 409);
  for (const q of questionsForStage(stage, 'software').filter((q) => q.required)) {
    const saved = await answer(owner, q.key, response(q));
    awards.push(...saved.xp);
    assert.deepEqual(saved.data.answers[q.key], response(q), q.key);
    if (q.syncsTo === 'targetSellingPrice') assert.equal(saved.data.targetSellingPrice, response(q));
    if (q.syncsTo === 'description') assert.equal(saved.data.description, response(q));
    if (q.syncsTo === 'overhead') assert.equal(saved.data.costs.overhead, 5);
    if (q.type === 'evidence') await answer(owner, q.key, ['Independent evidence', 'A claim', ''], undefined, 400);
  }
  if (stage === 'Research' || stage === 'Prototype') {
    const t = await call(owner, 'POST', root + '/tasks', { title: `Fixture ${stage} task` }, 201);
    awards.push(...t.result.xp);
    assert.ok(t.result.data.tasks.some((t) => t.chapter === stage));
  }
  const review = questionsForStage(stage, 'software').find((q) => requiresApproval(q.key));
  if (review) {
    const r = `${root}/activities/${review.key}`;
    assert.equal((await act()).journey.current.complete, false);
    await call(owner, 'POST', r + '/submit-review', {});
    await call(member, 'POST', r + '/review', { decision: 'approve' }, 403);
    if (next) await call(owner, 'PATCH', root, { stage: next }, 409);
    await call(owner, 'POST', r + '/review', { decision: 'approve', expectedAnswer: 'A stale review' }, 409);
    const approved = await call(owner, 'POST', r + '/review', { decision: 'approve' });
    awards.push(...approved.result.xp);
    if (stage === 'Research') {
      await answer(owner, review.key, true, false);
      assert.equal((await act()).journey.current.complete, false);
      await call(owner, 'POST', r + '/submit-review', {});
      assert.deepEqual((await call(owner, 'POST', r + '/review', { decision: 'approve' })).result.xp, []);
    }
  }
  const currentJourney = (await act()).journey;
  assert.equal(currentJourney.current.complete, true, stage);
  milestones.push(currentJourney.completedCount);
  chapters.push(currentJourney.current.id);
  if (next) {
    const move = await call(owner, 'PATCH', root, { stage: next });
    assert.ok(move.result.xp.some((x) => x.label.includes(`moved to ${next}`)));
  }
}
assert.deepEqual(chapters, PATH_STAGES);
assert.deepEqual(milestones, [1, 2, 3, 4, 5, 6, 7, 8]);
assert.equal(awards.filter((x) => x.label.includes('chapter complete')).length, 8);
const complete = (await act()).journey;
assert.equal(complete.overallPercent, 100);
assert.equal(complete.nextStageId, null);
const prior = await data(owner);
const nextCycle = await call(owner, 'PATCH', root, { stage: 'Research' });
assert.deepEqual(nextCycle.result.data.answers, prior.answers);
assert.deepEqual(nextCycle.result.xp, []);
assert.deepEqual((await call(member, 'PATCH', root, { stage: 'Planning' })).result.xp, []);
console.log(
  'PASS eight chapters, chapter-specific tasks, independent evidence rules, approval invalidation, live cost sheet, first-credit milestones and iteration without lost work'
);
