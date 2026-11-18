import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildJourney, PATH_STAGES } from './journey.js';
import { lessonEvidence, PRODUCT_KINDS, QUESTIONS_BY_KEY } from './questions.js';
import { currentLesson, productWorlds } from './worlds.js';
import { builderHistory, periodBounds } from './builder-history.js';
import type { Product } from './types.js';
const pilot = (patch: Partial<Product> = {}): Product => ({
  id: 'p',
  stage: 'Idea',
  category: 'Pilot',
  name: 'Notebook',
  description: '',
  imageUrl: '',
  notes: '',
  answers: {},
  approvalStates: {},
  costs: { labour: 0, overhead: 0, packaging: 0 },
  targetSellingPrice: null,
  materials: [],
  tasks: [],
  createdAt: '',
  updatedAt: '',
  productKind: 'software',
  ...patch
});
test('all seven product types have 8 worlds and 24 nonempty units with each real editor exactly once', () => {
  for (const productKind of PRODUCT_KINDS) {
    const p = pilot({ productKind }),
      j = buildJourney(p),
      worlds = productWorlds(p, j);
    assert.equal(worlds.length, 8);
    assert.equal(new Set(worlds.flatMap((w) => w.units.map((u) => u.id))).size, 24);
    for (const [i, w] of worlds.entries()) {
      assert.equal(w.stage, PATH_STAGES[i]);
      assert.deepEqual(
        w.units.flatMap((u) => u.lessons.map((l) => l.key)).sort(),
        j.path[i].activities.map((a) => a.id).sort()
      );
      assert.ok(w.units.every((u) => u.total > 0));
      assert.equal(w.total, j.path[i].total);
      assert.equal(w.ready, j.path[i].complete);
    }
    const keys = worlds.flatMap((w) => w.units.flatMap((u) => u.lessons.map((l) => l.key)));
    assert.equal(keys.includes('design.architecture'), productKind === 'software');
    assert.equal(keys.includes('design.delivery'), productKind === 'service');
    assert.equal(
      keys.includes('planning.first_batch'),
      ['hardware', 'engineering', 'physical', 'consumer'].includes(productKind)
    );
  }
});
test('unambiguous placement preserves access, not fabricated completion; partial work and source reviews stay distinguishable', () => {
  const p = pilot({
    stage: 'Testing',
    legacyStage: 'Launch',
    answers: { 'testing.testers': 0, 'research.finding': ['Founder assumption', 'Question still open', ''] }
  });
  const w = productWorlds(
    p,
    buildJourney(p),
    { originalStage: 'Testing', through: 'Launch', knownKeys: ['research.finding'], importedKeys: [], counts: {} },
    new Set(),
    [{ id: 'note', keys: ['testing.results'], excerpt: 'Prior notebook', label: 'Notes' }],
    new Set(['testing.scenario'])
  );
  assert.ok(!w[0].finished && !w[0].ready && w[0].recognised);
  assert.equal(w[6].lock, null);
  assert.ok(w[7].lock);
  const lessons = w[5].units.flatMap((u) => u.lessons);
  const state = (k: string) => lessons.find((l) => l.key === k)?.state;
  assert.equal(state('testing.scenario'), 'in_progress');
  assert.equal(state('testing.testers'), 'completed');
  assert.equal(state('testing.results'), 'needs_review');
  assert.ok(currentLesson(w[5])?.key.startsWith('testing.'));
});
test('a submitted assumption, unperformed release checks, bad types and approvals do not impersonate deliverables', () => {
  const valid = (k: string, v: unknown) => lessonEvidence(QUESTIONS_BY_KEY.get(k)!, v);
  assert.equal(valid('research.finding', ['Founder assumption', 'Maybe', '']), false);
  assert.equal(valid('prototype.artifact', ['Research finding', 'Trial ran', 'Build log 18']), true);
  assert.equal(valid('launch.readiness', ['None finished yet']), false);
  assert.equal(valid('planning.priorities', { legacy: 'x' }), false);
  assert.equal(valid('research.validated', false), true);
  const p = pilot({ stage: 'Testing', answers: { 'testing.criteria': 'Core criterion' } });
  const w = productWorlds(p, buildJourney(p))[5];
  assert.equal(w.units[0].complete, false);
  assert.match(w.units[0].lessons[0].href, /activity=testing.criteria/);
});
test('a verified unit opens the next one; future worlds still require the checkpoint', () => {
  const p = pilot();
  let w = productWorlds(p, buildJourney(p))[0];
  assert.equal(w.units[0].lock, null);
  assert.match(w.units[1].lock!, /Frame the concept/);
  p.description = 'A refillable bottle';
  p.answers['idea.oneliner'] = p.description;
  w = productWorlds(p, buildJourney(p))[0];
  assert.ok(w.units[0].complete);
  assert.equal(w.units[1].lock, null);
  assert.ok(w.units[2].lock);
});
test('calendar includes non-XP revisions, UTC grace, disconnected runs and every crossed level', () => {
  const rows = [
    { day: '2026-10-31', xp: 90 },
    { day: '2026-11-01', xp: 250 },
    { day: '2026-11-05', xp: 0 }
  ];
  const a = builderHistory(rows, new Date('2026-11-06T23:59:59Z'));
  assert.equal(a.streakDays, 1);
  assert.equal(a.longestStreak, 2);
  assert.deepEqual(a.levelHistory, [
    { level: 3, day: '2026-11-01' },
    { level: 2, day: '2026-11-01' }
  ]);
  assert.ok(a.calendar.find((r) => r.day === '2026-11-05')?.active);
  assert.equal(builderHistory(rows, new Date('2026-11-07T00:00:00Z')).streakDays, 0);
  assert.equal(builderHistory([], new Date()).longestStreak, 0);
});

test('daily and weekly quest keys change only at UTC day and Monday boundaries', () => {
  for (const [time, day, week] of [
    ['2026-11-22T18:29:59.999-05:30', '2026-11-22', '2026-11-16'],
    ['2026-11-23T05:30:00+05:30', '2026-11-23', '2026-11-23'],
    ['2024-03-01T00:01:00+05:30', '2024-02-29', '2024-02-26']
  ]) {
    const bounds = periodBounds(new Date(time));
    assert.equal(bounds.day.toISOString(), day + 'T00:00:00.000Z');
    assert.equal(bounds.week.toISOString(), week + 'T00:00:00.000Z');
  }
});
