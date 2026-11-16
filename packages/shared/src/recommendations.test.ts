import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildJourney } from './journey.js';
import { blockersFor, indexActivityStages, recommendNextActions } from './recommendations.js';
import { requiresApproval } from './activity.js';
import type { ActivityRecord } from './activity.js';
import { questionsForStage } from './questions.js';
import { STAGE_IDS } from './stages.js';
import type { Material, Product } from './types.js';

const steel: Material = {
  id: 'm1',
  name: 'Steel',
  category: 'Metals & Alloys',
  unit: 'pcs',
  unitPrice: 5,
  description: '',
  sourceUrl: '',
  notes: '',
  suppliers: []
};
const materials = new Map([[steel.id, steel]]);

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Bottle',
    category: 'Drinkware',
    stage: 'Idea',
    imageUrl: '',
    description: '',
    notes: '',
    targetSellingPrice: null,
    costs: { labour: 0, packaging: 0, overhead: 0 },
    materials: [],
    tasks: [],
    answers: {},
    createdAt: '',
    updatedAt: '',
    ...overrides
  };
}

const ideaAnswered = {
  'idea.problem': 'Leaks',
  'idea.customer': 'Commuters',
  'idea.oneliner': 'A bottle'
};

function record(overrides: Partial<ActivityRecord> = {}): ActivityRecord {
  return {
    activityKey: 'idea.problem',
    status: 'not_started',
    assigneeId: null,
    assigneeName: null,
    reviewState: 'none',
    reviewRequestedAt: null,
    reviewedBy: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: '',
    startedAt: null,
    completedAt: null,
    completedBy: null,
    completedByName: null,
    updatedAt: '',
    ...overrides
  };
}

describe('contextual recommendations', () => {
  it('recommends the first incomplete required activity in the current stage', () => {
    const p = product();
    const journey = buildJourney(p, { materials });
    const [first] = recommendNextActions({ product: p, journey, materials });
    assert.ok(first, 'expected a recommendation');
    assert.equal(first.stage, 'Idea');
    assert.equal(first.reason, 'required_incomplete');
    assert.ok(first.label.length > 0);
    assert.ok(first.why.length > 0, 'must explain why it matters');
    assert.ok(first.because.length > 0, 'must say why it is first');
  });

  it('never recommends work from a locked stage', () => {
    const p = product({ stage: 'Idea' });
    const journey = buildJourney(p, { materials });
    const recs = recommendNextActions({ product: p, journey, materials });
    assert.ok(recs.length > 0);
    for (const r of recs) {
      const stage = journey.stages.find((s) => s.id === r.stage)!;
      assert.notEqual(stage.state, 'locked', `${r.stage} is locked but was recommended`);
    }
  });

  it('surfaces a blocked task ahead of ordinary outstanding work', () => {
    const p = product({
      tasks: [{ id: 't1', title: 'Order samples', description: '', status: 'blocked' as never, dueDate: null, position: 0, completedAt: null }]
    });
    const journey = buildJourney(p, { materials });
    const [first] = recommendNextActions({ product: p, journey, materials });
    assert.equal(first?.reason, 'blocked_task');
    assert.equal(first?.label, 'Unblock “Order samples”');
  });

  it('treats a task past its due date as overdue, but not one due today', () => {
    const now = new Date('2026-05-10T12:00:00Z');
    const overdueTask = { id: 't1', title: 'Late', description: '', status: 'todo', dueDate: '2026-05-01', position: 0, completedAt: null };
    const todayTask = { id: 't2', title: 'Today', description: '', status: 'todo', dueDate: '2026-05-10', position: 1, completedAt: null };

    const p1 = product({ tasks: [overdueTask] as never });
    const overdue = recommendNextActions({ product: p1, journey: buildJourney(p1, { materials }), materials, now });
    assert.ok(overdue.some((r) => r.reason === 'overdue_task' && r.label.includes('Late')));

    const p2 = product({ tasks: [todayTask] as never });
    const today = recommendNextActions({ product: p2, journey: buildJourney(p2, { materials }), materials, now });
    assert.ok(!today.some((r) => r.reason === 'overdue_task'), 'a task due today is not overdue');
  });

  it('asks for changes before suggesting new work', () => {
    const p = product({ answers: ideaAnswered });
    const journey = buildJourney(p, { materials });
    const records = { 'idea.problem': record({ status: 'in_progress', reviewState: 'changes_requested' }) };
    const [first] = recommendNextActions({ product: p, journey, materials, records });
    assert.equal(first?.reason, 'awaiting_changes');
    assert.equal(first?.activityKey, 'idea.problem');
  });

  it('surfaces an approval that is waiting on a reviewer', () => {
    // research.validated requires approval, so answering it is not enough.
    const p = product({
      stage: 'Research',
      description: 'A bottle',
      tasks: [{ id: 't1', title: 'Bench test', description: '', status: 'todo', dueDate: null, position: 0, completedAt: null }] as never,
      answers: { ...ideaAnswered, 'research.competitors': 'x', 'research.market_price': 20, 'research.validated': true, 'research.differentiator': 'y' }
    });
    const journey = buildJourney(p, { materials });
    const records = { 'research.validated': record({ activityKey: 'research.validated', status: 'needs_review', reviewState: 'pending' }) };
    const recs = recommendNextActions({ product: p, journey, materials, records });
    assert.ok(recs.some((r) => r.reason === 'needs_review' && r.activityKey === 'research.validated'));
  });

  it('shows the unresolved prerequisite rather than the blocked activity', () => {
    const p = product();
    const journey = buildJourney(p, { materials });
    // design.must_haves depends on the requirements captured in Idea.
    const dependencies = { 'design.must_haves': ['idea.problem'] };
    const all = journey.stages.flatMap((s) => s.activities);
    const blockers = blockersFor('design.must_haves', dependencies, all, {}, indexActivityStages(journey));
    assert.equal(blockers.length, 1);
    assert.equal(blockers[0]?.blockedByKey, 'idea.problem');
    assert.ok(blockers[0]?.resolution.includes('Idea'));
  });

  it('clears the blocker once the prerequisite is satisfied', () => {
    const p = product({ answers: ideaAnswered });
    const journey = buildJourney(p, { materials });
    const dependencies = { 'design.must_haves': ['idea.problem'] };
    const all = journey.stages.flatMap((s) => s.activities);
    const blockers = blockersFor('design.must_haves', dependencies, all, {}, indexActivityStages(journey));
    assert.deepEqual(blockers, []);
  });

  it('never blocks on a dependency that no longer exists', () => {
    const p = product();
    const journey = buildJourney(p, { materials });
    const all = journey.stages.flatMap((s) => s.activities);
    const blockers = blockersFor('idea.problem', { 'idea.problem': ['ghost.key'] }, all, {}, indexActivityStages(journey));
    assert.deepEqual(blockers, [], 'missing prerequisites must not freeze work forever');
  });

  it('returns at most one recommendation per activity and is deterministic', () => {
    const p = product({ answers: ideaAnswered, tasks: [{ id: 't1', title: 'A', description: '', status: 'todo', dueDate: '2020-01-01', position: 0, completedAt: null }] as never });
    const journey = buildJourney(p, { materials });
    const a = recommendNextActions({ product: p, journey, materials, now: new Date('2026-01-01') });
    const b = recommendNextActions({ product: p, journey, materials, now: new Date('2026-01-01') });
    assert.deepEqual(a.map((r) => r.id), b.map((r) => r.id), 'ordering must be stable');
    const keys = a.map((r) => r.activityKey);
    assert.equal(new Set(keys).size, keys.length, 'one recommendation per activity');
  });

  it('has nothing to recommend once the whole journey is complete', () => {
    const answers: Record<string, string | number | boolean | string[]> = {};
    const p = product({
      stage: 'Improvement',
      description: 'A bottle',
      targetSellingPrice: 100,
      costs: { labour: 1, packaging: 1, overhead: 1 },
      // Design and Prototype quests need 2+ and 3+ BOM lines respectively.
      materials: [
        { materialId: 'm1', quantity: 1 },
        { materialId: 'm1', quantity: 2 },
        { materialId: 'm1', quantity: 3 }
      ],
      tasks: [1, 2, 3].map((n) => ({ id: `t${n}`, title: `T${n}`, description: '', status: 'done', dueDate: null, position: n, completedAt: '2026-01-01' }))
    });
    for (const s of STAGE_IDS) {
      for (const q of questionsForStage(s)) {
        if (!q.required) continue;
        answers[q.key] =
          q.type === 'number' || q.type === 'money' ? 100
          : q.type === 'yesno' ? true
          : q.type === 'scale' ? 5
          : q.type === 'choice' ? (q.options?.[0] ?? 'x')
          : q.type === 'date' ? '2026-01-01'
          : q.type === 'multi' ? [(q.options ?? ['x'])[0]!]
          : 'text';
      }
    }
    const done = { ...p, answers };
    // `materials` must include the BOM rows, or the margin-based quests cannot be
    // satisfied and the journey is legitimately incomplete.
    const journey = buildJourney(done, { materials });
    assert.equal(journey.isComplete, true);
    assert.deepEqual(recommendNextActions({ product: done, journey, materials }), []);
  });
});

describe('approval rules', () => {
  it('marks only sign-off style activities as needing approval', () => {
    assert.equal(requiresApproval('research.validated'), true);
    assert.equal(requiresApproval('design.must_haves'), true);
    assert.equal(requiresApproval('testing.criteria'), true);
    assert.equal(requiresApproval('idea.problem'), false);
    assert.equal(requiresApproval('improve.next'), false);
  });

  it('holds back stage completion while a sign-off is pending', () => {
    const answered = {
      ...ideaAnswered,
      'research.competitors': 'Generic bottles',
      'research.market_price': 20,
      'research.validated': true,
      'research.differentiator': 'Does not leak'
    };
    const p = product({
      stage: 'Research',
      description: 'A bottle',
      // Research's quest also requires at least one research task.
      tasks: [{ id: 't1', title: 'Bench test', description: '', status: 'todo', dueDate: null, position: 0, completedAt: null }] as never,
      answers: answered
    });

    // Without collaboration data, stageQuest decides and the stage is complete.
    const plain = buildJourney(p, { materials });
    assert.equal(plain.stages.find((s) => s.id === 'Research')!.complete, true);

    // With an unapproved sign-off, the stage is not complete yet.
    const gated = buildJourney(p, {
      materials,
      collaboration: { records: { 'research.validated': record({ activityKey: 'research.validated', reviewState: 'pending' }) } }
    });
    const research = gated.stages.find((s) => s.id === 'Research')!;
    assert.equal(research.complete, false, 'an unapproved sign-off must not count');
    assert.deepEqual(research.pendingApproval, ['research.validated']);
    assert.ok(research.done < research.total, 'it must not be tallied as done');

    // Once approved, the stage completes.
    const approved = buildJourney(p, {
      materials,
      collaboration: { records: { 'research.validated': record({ activityKey: 'research.validated', reviewState: 'approved' }) } }
    });
    assert.equal(approved.stages.find((s) => s.id === 'Research')!.complete, true);
  });
});

// ── Cross-stage dependencies and the server's call shape ──────────────────

describe('dependencies across stages', () => {
  it('treats an unmet prerequisite in another stage as the blocker, not the activity', () => {
    const p = product({ stage: 'Design', answers: { ...ideaAnswered, 'design.must_haves': 'Steel body' } });
    const journey = buildJourney(p, { materials, collaboration: { records: {} } });
    const recs = recommendNextActions({
      product: p,
      journey,
      materials,
      records: {},
      dependencies: { 'design.must_haves': ['research.validated'] }
    });
    // research.validated is unanswered, so it is the real next action; the
    // dependent design activity must not outrank it.
    const validation = recs.find((r) => r.activityKey === 'research.validated');
    assert.ok(validation, 'the unmet prerequisite should be recommended');
    assert.equal(validation!.reason, 'required_incomplete');

    const design = recs.find((r) => r.activityKey === 'design.must_haves');
    if (design) {
      assert.equal(design.reason, 'dependency_blocked');
      assert.ok(design.priority > validation!.priority, 'blocked work must rank below the prerequisite');
    }
  });

  it('resolves a prerequisite completed in a different stage', () => {
    const p = product({ stage: 'Design', answers: { ...ideaAnswered, 'research.validated': true } });
    const records = {
      'research.validated': record({ status: 'completed' as const, reviewState: 'approved' as const })
    };
    const journey = buildJourney(p, {
      materials,
      collaboration: {
        records,
        blockersFor: (key, all, r) => blockersFor(key, { 'design.must_haves': ['research.validated'] }, all, r)
      }
    });
    const design = journey.stages.flatMap((s) => s.activities).find((a) => a.id === 'design.must_haves')!;
    assert.equal(design.collaboration?.blockers.length, 0, 'an approved prerequisite must not block');
  });

  it('blocks when the prerequisite is filled in but not approved', () => {
    // research.validated requires sign-off, so "answered" alone is not satisfied.
    const p = product({ stage: 'Design', answers: { ...ideaAnswered, 'research.validated': true } });
    const journey = buildJourney(p, {
      materials,
      collaboration: {
        records: { 'research.validated': record({ status: 'needs_review' as const, reviewState: 'pending' as const }) },
        blockersFor: (key, all, r) => blockersFor(key, { 'design.must_haves': ['research.validated'] }, all, r)
      }
    });
    const design = journey.stages.flatMap((s) => s.activities).find((a) => a.id === 'design.must_haves')!;
    assert.equal(design.collaboration?.blockers.length, 1);
    assert.match(design.collaboration!.blockers[0]!.resolution, /Research/);
  });

  it('never recommends a locked stage', () => {
    const p = product({ stage: 'Idea' });
    const journey = buildJourney(p, { materials });
    const recs = recommendNextActions({ product: p, journey, materials, records: {} });
    assert.ok(recs.length > 0);
    for (const r of recs) {
      const stage = journey.stages.find((s) => s.id === r.stage)!;
      assert.notEqual(stage.state, 'locked', `recommended work in locked stage ${r.stage}`);
    }
  });
});
