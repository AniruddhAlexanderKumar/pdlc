import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildJourney, PATH_STAGES, STAGE_GUIDES, stageStateLabel } from './journey.js';
import { stageQuest } from './gamification.js';
import { STAGE_IDS, nextStage, stageIndex } from './stages.js';
import type { Material, Product } from './types.js';

const steel: Material = {
  id: 'm1',
  name: 'Steel body',
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

/** A product with every required answer filled, priced, costed and its tasks done. */
function finishedProduct(stage: (typeof STAGE_IDS)[number]): Product {
  const p = product({
    stage,
    description: 'A bottle',
    targetSellingPrice: 100,
    costs: { labour: 1, packaging: 1, overhead: 1 },
    materials: [
      { materialId: 'm1', quantity: 1 },
      { materialId: 'm1', quantity: 2 },
      { materialId: 'm1', quantity: 3 }
    ],
    tasks: [
      { id: 't1', title: 'Interview', chapter: 'Research', description: '', status: 'done', dueDate: null, position: 0, completedAt: '2026-01-01' },
      { id: 't2', title: 'Build pilot', chapter: 'Prototype', description: '', status: 'done', dueDate: null, position: 1, completedAt: '2026-01-01' },
      { id: 't3', title: 'c', description: '', status: 'done', dueDate: null, position: 2, completedAt: '2026-01-01' }
    ]
  });
  const answers: Record<string, string | number | boolean | string[]> = {};
  for (const stageId of STAGE_IDS.slice(0, stageIndex(stage) + 1)) {
    for (const q of stageQuestAllQuestions(stageId)) {
      if (!q.required) continue;
      answers[q.key] =
        q.type === 'ranked'
          ? ['Pilot booking']
          : q.type === 'evidence'
            ? ['Research finding', 'Recorded trial', 'Trial notebook, 2 May']
            : q.type === 'comparison'
              ? ['Delivery time', 'Option A: 2 days', 'Option B: 3 days']
              : q.type === 'number' || q.type === 'money'
                ? 100
                : q.type === 'yesno'
                  ? true
                  : q.type === 'scale'
                    ? 5
                    : q.type === 'choice'
                      ? (q.options?.[0] ?? 'x')
                      : q.type === 'date'
                        ? '2026-01-01'
                        : q.type === 'multi'
                          ? [(q.options ?? ['x'])[0]!]
                          : 'text';
    }
  }
  return { ...p, answers: answers as Product['answers'] };
}

function stageQuestAllQuestions(stage: (typeof STAGE_IDS)[number]) {
  // Imported lazily through the barrel to avoid a second import list.
  return questionsFor(stage);
}

import { questionsForStage as questionsFor } from './questions.js';

describe('product journey', () => {
  it('presents exactly the eight progressive stages plus Retired off-path', () => {
    const j = buildJourney(product());
    assert.equal(j.stages.length, 9);
    assert.equal(j.path.length, 8);
    assert.deepEqual(j.path.map((s) => s.id), PATH_STAGES);
    assert.equal(j.retired.id, 'Retired');
    assert.ok(!j.path.some((s) => s.id === 'Retired'));
  });

  it('has a plain-English guide for every stage', () => {
    for (const id of STAGE_IDS) {
      assert.ok(STAGE_GUIDES[id].purpose.length > 10, `${id} needs a purpose`);
      assert.ok(STAGE_GUIDES[id].why.length > 10, `${id} needs a why`);
    }
  });

  it('gives every stage at least one activity so none renders empty', () => {
    for (const id of STAGE_IDS) {
      const j = buildJourney(product({ stage: id }));
      const stage = j.stages.find((s) => s.id === id)!;
      assert.ok(stage.activities.length > 0, `${id} has no activities`);
      assert.ok(stage.total > 0, `${id} has no required activities`);
    }
  });

  it('marks the product stage as current and later stages locked', () => {
    const j = buildJourney(product({ stage: 'Design' }));
    assert.equal(j.current.id, 'Design');
    assert.equal(j.stages.find((s) => s.id === 'Idea')!.state, 'completed');
    assert.equal(j.stages.find((s) => s.id === 'Prototype')!.state, 'locked');
    assert.ok(j.stages.find((s) => s.id === 'Prototype')!.lockReason?.includes('Design'));
    assert.equal(j.stages.find((s) => s.id === 'Design')!.state, 'current');
  });

  it('unlocks the next stage only once the current one is complete', () => {
    const incomplete = buildJourney(product({ stage: 'Idea' }));
    assert.equal(incomplete.stages.find((s) => s.id === 'Research')!.state, 'locked');

    const complete = buildJourney(finishedProduct('Idea'), { materials });
    assert.equal(complete.stages.find((s) => s.id === 'Idea')!.state, 'current');
    assert.equal(complete.stages.find((s) => s.id === 'Research')!.state, 'available');
    assert.equal(complete.stages.find((s) => s.id === 'Planning')!.state, 'locked');
  });

  it('grandfathers stages the product has already visited', () => {
    // A product that jumped ahead earlier keeps access instead of being locked out.
    const j = buildJourney(product({ stage: 'Idea' }), { visitedStages: ['Idea', 'Planning'] });
    assert.equal(j.stages.find((s) => s.id === 'Planning')!.state, 'available');
    assert.equal(j.stages.find((s) => s.id === 'Design')!.state, 'locked');
  });

  it('matches stageQuest completion exactly, so the UI never overstates progress', () => {
    for (const stage of STAGE_IDS) {
      const p = finishedProduct(stage);
      const j = buildJourney(p, { materials });
      const js = j.stages.find((s) => s.id === stage)!;
      assert.equal(js.complete, stageQuest(p, materials, stage).complete, `${stage} disagrees with stageQuest`);
    }
  });

  it('reports overall progress across the path and finishes at 100%', () => {
    const start = buildJourney(product());
    assert.equal(start.overallPercent, 0);

    const end = buildJourney(finishedProduct('Improvement'), { materials });
    assert.equal(end.overallPercent, 100);
    assert.equal(end.completedCount, end.totalCount);
    assert.equal(end.isComplete, true);
    assert.equal(end.nextActivity, null);
  });

  it('points at the first outstanding required activity', () => {
    const j = buildJourney(product({ stage: 'Idea' }));
    assert.equal(j.nextActivity?.stage, 'Idea');
    assert.equal(j.nextActivity?.activity.done, false);
    assert.equal(j.nextActivity?.activity.required, true);
    assert.ok(j.nextActivity?.activity.why.length > 0);
  });

  it('exposes the next stage using the canonical transition rule', () => {
    for (const id of STAGE_IDS) {
      const j = buildJourney(product({ stage: id }));
      assert.equal(j.nextStageId, nextStage(id));
    }
    assert.equal(buildJourney(product({ stage: 'Improvement' })).nextStageId, null);
  });

  it('labels every stage state in plain language', () => {
    for (const s of ['completed', 'current', 'available', 'locked'] as const) {
      assert.ok(stageStateLabel(s).length > 0);
    }
  });
});
