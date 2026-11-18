import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildJourney, CHAPTER_BRIEFS, PATH_STAGES } from './journey.js';
import { stageQuestWithApprovals } from './recommendations.js';
import { activityState, type ActivityRecord } from './activity.js';
import { nextWork } from './next-work.js';
import { productHealth, stageQuest } from './gamification.js';
import { QUESTIONS_BY_KEY, normaliseAnswer, questionsForStage } from './questions.js';
import type { Product } from './types.js';

const product = (patch: Partial<Product> = {}): Product => ({
  id: 'p',
  name: 'Pilot',
  productKind: 'software',
  stage: 'Idea',
  category: '',
  description: '',
  notes: '',
  imageUrl: '',
  targetSellingPrice: null,
  costs: { labour: 0, packaging: 0, overhead: 0 },
  materials: [],
  tasks: [],
  answers: {},
  approvalStates: {},
  createdAt: '',
  updatedAt: '',
  ...patch
});
const input = (key: string, value: unknown) => normaliseAnswer(QUESTIONS_BY_KEY.get(key)!, value);

test('each of eight chapters has a real deliverable, guided activities and two guidance depths', () => {
  assert.equal(PATH_STAGES.length, 8);
  for (const stage of PATH_STAGES) {
    assert.ok(CHAPTER_BRIEFS[stage]);
    const qs = questionsForStage(stage, 'service');
    assert.ok(qs.some((q) => q.required));
    for (const q of qs)
      for (const field of [q.output, q.help, q.example, q.advanced, q.prompt]) assert.ok(field.trim());
  }
  assert.deepEqual(
    questionsForStage('Prototype', 'software').filter((q) => q.physicalOnly),
    []
  );
  assert.ok(questionsForStage('Planning', 'physical').some((q) => q.key === 'planning.first_batch'));
  assert.ok(!questionsForStage('Planning', 'service').some((q) => q.key === 'planning.first_batch'));
});

test('ranked and evidence answers validate structure, order and attribution without asserting validation', () => {
  assert.deepEqual(input('planning.priorities', ['  Build ', 'Try']), { value: ['Build', 'Try'] });
  for (const v of [[' Build', 'Build'], [], [''], Array(13).fill('x')])
    assert.ok('error' in input('planning.priorities', v));
  for (const basis of ['Independent evidence', 'Research finding'])
    assert.ok('error' in input('research.finding', [basis, 'Observation', '  ']));
  assert.ok('value' in input('research.finding', ['Founder assumption', 'Unconfirmed', '']));
  assert.ok('value' in input('research.finding', ['Independent evidence', 'Observation', 'Dated source']));
  assert.ok('error' in input('research.finding', ['AI confirmed', 'x', 'model']));
  assert.ok('error' in input('launch.readiness', ['None finished yet', 'Pricing reviewed']));
});

test('old option values, false, zero and explicit clears remain valid; invalid estimates/dates do not', () => {
  for (const value of ['Sketch / mock-up', 'v1 looks-like', 'v1 works-like', 'v2+', 'Pre-production sample'])
    assert.deepEqual(input('prototype.version', value), { value });
  assert.deepEqual(input('research.validated', false), { value: false });
  assert.deepEqual(input('prototype.overhead', 0), { value: 0 });
  assert.deepEqual(input('planning.mvp', null), { value: null });
  assert.ok('error' in input('launch.date', '2026-02-31'));
  assert.ok('error' in input('planning.target_margin', 101));
});

test('dashboard milestone, outstanding work and percentage derive from real core responses and chapter-linked tasks', () => {
  const p = product({
    description: 'Tutor booking',
    answers: { 'idea.problem': 'Cancellations', 'idea.customer': 'Tutors', 'idea.oneliner': 'Tutor booking' },
    tasks: [
      {
        chapter: 'Research',
        id: 't',
        title: 'Interview tutors',
        status: 'todo',
        description: '',
        position: 0,
        completedAt: null,
        dueDate: null
      }
    ]
  });
  const j = buildJourney(p);
  assert.ok(j.current.complete);
  assert.equal(j.completedCount, 1);
  assert.equal(j.overallPercent, Math.round((100 * 5) / j.path.reduce((n, s) => n + s.total, 0)));
  assert.equal(stageQuest(p, new Map(), 'Prototype').items.find((i) => i.id === 'tasks')!.done, false);
  assert.equal(nextWork(p, j, []).action, 'Review milestone');
  const { parts } = productHealth(
    { ...p, targetSellingPrice: 20, costs: { labour: 5, packaging: 0, overhead: 5 } },
    new Map()
  );
  assert.equal(parts.costs, 100);
  assert.equal(parts.margin, 100);
});

test('resume selects my draft for this product, not unrelated work; review and iteration have actionable destinations', () => {
  const p = product(),
    j = buildJourney(p);
  const draft = { productId: 'p', questionKey: 'planning.mvp', value: 'My draft', previousValue: null, updatedAt: '' };
  assert.match(nextWork(p, j, [], [draft]).href, /stage=Planning&q=planning.mvp/);
  assert.equal(nextWork(p, j, [], [{ ...draft, productId: 'other' }]).action, 'Continue building');
  const it = product({
    stage: 'Improvement',
    answers: Object.fromEntries(
      questionsForStage('Improvement')
        .filter((q) => q.required)
        .map((q) => [q.key, q.type === 'ranked' ? ['One change'] : q.type === 'number' ? 0 : 'Research'])
    )
  });
  assert.equal(nextWork(it, buildJourney(it), []).action, 'Open iteration brief');
});

test('a recorded answer or tool action has a truthful status without fabricating collaboration history', () => {
  const auto = activityState({ id: 'task', done: true }, undefined, []);
  assert.equal(auto.status, 'completed');
  assert.equal(auto.completedAt, null);
  assert.equal(auto.completedBy, null);
  const decision = activityState({ id: 'research.validated', done: true }, undefined, []);
  assert.equal(decision.status, 'in_progress');
  assert.ok(decision.awaitingApproval);
  assert.equal(decision.reviewLabel, 'Sign-off required');
});

test('chapter sign-off considers the requested chapter, including recorded decisions not yet submitted', () => {
  const p = product({
    answers: {
      'research.validated': false,
      'idea.problem': 'Late cancellations',
      'idea.customer': 'Tutors',
      'idea.oneliner': 'Booking page'
    },
    description: 'Booking page'
  });
  const pending = {
    ...activityState({ id: 'research.validated', done: true }, undefined, []),
    activityKey: 'research.validated',
    status: 'needs_review',
    reviewState: 'pending',
    reviewedBy: null,
    reviewedByName: null,
    reviewNote: '',
    reviewedAt: null,
    reviewRequestedAt: null,
    startedAt: null,
    updatedAt: ''
  } satisfies ActivityRecord;
  assert.deepEqual(stageQuestWithApprovals(p, new Map(), 'Idea', { 'research.validated': pending }), {
    questComplete: true,
    blockedByApproval: []
  });
  assert.deepEqual(stageQuestWithApprovals(p, new Map(), 'Research', {}).blockedByApproval, ['research.validated']);
});
