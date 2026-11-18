// Real API, fresh identities and a disposable localhost database. No reward or completion comes from the test client.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const url = process.env.JOURNEY_TEST_URL;
if (process.env.NODE_ENV !== 'test' || !url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
  throw Error('Need isolated local test API');
const origin = process.env.APP_URL ?? 'http://localhost:5173';
async function call(cookie, path, method = 'GET', body, status = 200) {
  const r = await fetch(url + '/api' + path, {
    method,
    headers: { origin, cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const value = await r.json().catch(() => null);
  assert.equal(r.status, status, `${method} ${path}: ${JSON.stringify(value)}`);
  return { value, cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
async function reg(inviteToken) {
  return call(
    '',
    '/auth/register',
    'POST',
    {
      email: `world-${randomUUID()}@example.test`,
      name: 'Builder',
      password: randomUUID(),
      workspaceName: 'World test',
      inviteToken
    },
    201
  );
}
const { cookie: a } = await reg(),
  { cookie: f } = await reg(),
  invite = (await call(a, '/workspace/invites', 'POST', { role: 'member' }, 201)).value;
const { cookie: b } = await reg(new URL(invite.url).pathname.split('/').pop());
const p = (
    await call(
      a,
      '/products',
      'POST',
      { name: 'Weather notebook', productKind: 'engineering', notes: 'Imported field notebook for review.' },
      201
    )
  ).value.data,
  root = '/products/' + p.id;
const trail = async (actor = a) => (await call(actor, root + '/activities')).value.trail,
  game = async (actor) => (await call(actor, '/game/me')).value;
const answer = (actor, k, v, s = 200) => call(actor, root + '/answers/' + k, 'PUT', { value: v, guided: true }, s);
const check = (actor, op, s = 200) => call(actor, root + '/worlds/Idea/' + op, 'POST', {}, s);
let t = await trail();
assert.equal(t.upgrade, null);
assert.equal(t.next.key, 'idea.oneliner');
assert.equal(t.worlds.length, 8);
assert.equal(t.worlds.flatMap((w) => w.units).length, 24);
assert.ok(t.sources.find((x) => x.id === 'notes'));
assert.ok(t.worlds[3].units.flatMap((u) => u.lessons).some((l) => l.key === 'design.interfaces'));
await call(f, root + '/activities', 'GET', undefined, 404);
await call('', root + '/worlds/Idea/check', 'POST', {}, 401);
await check(f, 'finish', 404);
await call(a, root + '/worlds/Idea/check', 'POST', { xp: 300 }, 400);
await check(a, 'finish', 409);
await answer(a, 'idea.promise', 'Premature', 409);
await answer(a, 'launch.date', '2027-01-01', 409);
assert.equal((await call(a, '/auth/me')).value.user.showStreak, true);
await call(a, root + '/placement', 'POST', { stage: 'Launch' }, 409);
await call(b, root + '/placement', 'POST', { stage: 'Launch' }, 403);
const before = (await game(b)).xp;
const out = await answer(b, 'idea.oneliner', 'One notebook for the weather trial.');
assert.equal(out.value.xp.filter((x) => x.points === 50).length, 1);
assert.ok(out.value.xp.some((x) => x.points === 75));
assert.equal((await game(a)).achievements.find((x) => x.id === 'unit_maker').unlocked, false);
assert.equal((await game(b)).achievements.find((x) => x.id === 'unit_maker').unlocked, true);
const first = await Promise.all([
  answer(a, 'idea.problem', 'People lose their trial notes'),
  answer(b, 'idea.problem', 'People lose their trial notes')
]);
assert.equal(first.flatMap((x) => x.value.xp).filter((x) => x.points === 15).length, 1);
await answer(b, 'idea.customer', 'Field teams');
assert.ok((await trail(b)).quests.every((q) => q.earned));
const award = await answer(a, 'idea.promise', 'Keep revision and trial notes together');
assert.ok(award.value.xp.some((x) => x.points === 100));
t = await trail();
assert.ok(t.worlds[0].checkpoint && t.worlds[0].ready && !t.worlds[0].finished);
assert.match(t.worlds[1].lock, /world milestone/);
await answer(b, 'research.profile', 'An early attempt', 409);
assert.deepEqual((await check(a, 'check')).value.xp, []);
await call(a, root, 'PATCH', { stage: 'Design' }, 409);
const receipts = await Promise.all([check(a, 'finish'), check(b, 'finish')]);
assert.equal((await trail()).worlds[1].lock, null);
assert.equal(receipts.flatMap((x) => x.value.xp).filter((x) => x.points === 200).length, 1);
assert.equal(
  [await game(a), await game(b)].filter((g) => g.achievements.find((x) => x.id === 'world_Idea').unlocked).length,
  1
);
await call(a, root, 'PATCH', { stage: 'Research' });
await call(a, root, 'PATCH', { stage: 'Retired' });
await call(a, root, 'PATCH', { stage: 'Improvement' }, 409);
await call(a, root, 'PATCH', { stage: 'Research' });
const player = await game(b);
assert.ok(player.level >= 2 && player.xp > before && player.longestStreak >= 1 && player.streakDays === 1);
assert.equal(player.levelHistory.at(-1).level, 2);
assert.ok(player.calendar.at(-1).active);
assert.deepEqual((await answer(a, 'idea.promise', 'Keep notes searchable')).value.xp, []);
await call(a, root + '/answers/idea.promise', 'PUT', { value: null });
assert.equal((await trail()).worlds[0].ready, false);
assert.equal((await trail()).worlds[0].finished, true);
await check(a, 'check', 409);
assert.deepEqual((await answer(a, 'idea.promise', 'Keep a complete record')).value.xp, []);
await check(a, 'finish');
const second = (
  await call(
    a,
    '/products',
    'POST',
    { name: 'Different case', startingStage: 'Launch', productKind: 'software' },
    201
  )
).value.data;
const t2 = (await call(a, `/products/${second.id}/activities`)).value.trail;
assert.equal(t2.worlds[6].lock, null);
assert.ok(!t2.worlds[0].finished && !t2.worlds[0].ready);
assert.ok(t2.quests.every((q) => !q.earned));
const secondPath = '/products/' + second.id;
assert.match(t2.quests[0].title, /launch plan/);
const daily = await call(b, secondPath + '/answers/launch.plan', 'PUT', {
  value: 'Invite the pilot group',
  guided: true
});
assert.ok(daily.value.xp.some((x) => x.points === 20));
await call(b, secondPath + '/tasks', 'POST', { title: 'Confirm release owner', status: 'done' }, 201);
const weekly = await call(
  b,
  secondPath + '/tasks',
  'POST',
  { title: 'Confirm support rota', status: 'done' },
  201
);
assert.ok(weekly.value.xp.some((x) => x.points === 75));
assert.ok((await call(b, secondPath + '/activities')).value.trail.quests.every((q) => q.earned));
assert.ok((await call(a, secondPath + '/activities')).value.trail.quests.every((q) => !q.earned));
// Exercise pagination beyond both the 15-row overview and 30-row history page.
for (let n = 0; n < 31; n++)
  await call(a, root + '/tasks', 'POST', { title: `Checked build task ${n}`, status: 'done' }, 201);
const page1 = (await call(a, '/game/history')).value;
assert.equal(page1.rows.length, 30);
const page2 = (await call(a, '/game/history?after=' + page1.next)).value;
assert.ok(page2.rows.length);
const events = [...page1.rows, ...page2.rows];
assert.equal(new Set(events.map((e) => e.id)).size, events.length);
assert.ok(events.every((e) => e.origin === 'earned'));
assert.equal((await call(f, '/game/history?after=' + page1.next)).value.rows.length, 0);
await call(a, '/game/history?after=nope', 'GET', undefined, 400);
console.log(
  'PASS world map and typed placement, locked guided writes, real checkpoint and retry, concurrent personal unit/quest/world awards, levels/streak/calendar, durable personal badges, deleted/revised evidence, per-product isolation and paginated XP history.'
);
