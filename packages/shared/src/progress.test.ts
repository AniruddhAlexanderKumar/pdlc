import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Product } from './types.js';
import { WORLDS, TOTAL_LESSONS, ALL_LESSONS } from './curriculum.js';
import { buildJourneyV2, type JourneyRecords } from './progress.js';

/** A bare product with nothing filled in — the state a brand-new founder sees. */
function freshProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Plant monitor',
    category: 'Other',
    stage: 'Idea',
    imageUrl: '',
    description: '',
    notes: '',
    targetSellingPrice: null,
    costs: { labour: 0, packaging: 0, overhead: 0 },
    materials: [],
    tasks: [],
    answers: {},
    legacyStage: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

const at = (j: ReturnType<typeof buildJourneyV2>, id: string) =>
  j.worlds.flatMap((w) => w.units.flatMap((u) => u.lessons)).find((l) => l.id === id)!;

describe('curriculum', () => {
  it('has eight worlds, each with units, lessons and a checkpoint', () => {
    assert.equal(WORLDS.length, 8);
    for (const world of WORLDS) {
      assert.ok(world.units.length >= 3, `${world.id} has units`);
      const lessons = world.units.flatMap((u) => u.lessons);
      assert.ok(lessons.length >= 6, `${world.id} has real lessons, got ${lessons.length}`);
      assert.ok(world.checkpoint.criteria.length >= 4, `${world.id} checkpoint checks real records`);
    }
  });

  it('maps each world to a distinct lifecycle stage in order', () => {
    assert.deepEqual(
      WORLDS.map((w) => w.stage),
      ['Idea', 'Research', 'Planning', 'Design', 'Prototype', 'Testing', 'Launch', 'Improvement']
    );
  });

  it('has unique lesson and checkpoint ids', () => {
    const ids = ALL_LESSONS.map((l) => l.id);
    assert.equal(new Set(ids).size, ids.length, 'lesson ids must be unique');
    const checkpoints = WORLDS.map((w) => w.checkpoint.id);
    assert.equal(new Set(checkpoints).size, checkpoints.length);
  });

  it('gives every lesson real content and an activity that writes somewhere', () => {
    for (const lesson of ALL_LESSONS) {
      assert.ok(lesson.summary.length > 10, `${lesson.id} summary`);
      assert.ok(lesson.concept.length > 60, `${lesson.id} concept`);
      assert.ok(lesson.example.length > 20, `${lesson.id} example`);
      assert.ok(lesson.help.length > 20, `${lesson.id} help`);
      assert.ok(lesson.activity.prompt.length > 10, `${lesson.id} prompt`);
      assert.ok(lesson.xp > 0, `${lesson.id} awards xp`);
      assert.ok(lesson.bind.target && lesson.bind.key, `${lesson.id} binds a record`);
      if (lesson.activity.kind === 'choice') {
        assert.ok((lesson.activity.options?.length ?? 0) >= 2, `${lesson.id} has options`);
      }
      if (lesson.activity.kind === 'checklist') {
        assert.ok((lesson.activity.items?.length ?? 0) >= 2, `${lesson.id} has checklist items`);
      }
      if (lesson.activity.kind === 'form') {
        assert.ok((lesson.activity.fields?.length ?? 0) >= 1, `${lesson.id} has fields`);
      }
      if (lesson.activity.kind === 'priority') {
        assert.ok((lesson.activity.priorities?.length ?? 0) >= 2, `${lesson.id} has priorities`);
      }
      if (lesson.activity.kind === 'write') {
        assert.ok((lesson.activity.minLength ?? 0) > 0, `${lesson.id} validates length`);
      }
    }
  });

  it('does not turn every lesson into a quiz', () => {
    const kinds = new Set(ALL_LESSONS.map((l) => l.activity.kind));
    assert.ok(kinds.size >= 4, `expected varied activity kinds, saw ${[...kinds].join(', ')}`);
    const choices = ALL_LESSONS.filter((l) => l.activity.kind === 'choice').length;
    assert.ok(choices / ALL_LESSONS.length < 0.4, 'most lessons must involve real work, not multiple choice');
  });
});

describe('journey progress — new founder', () => {
  it('starts every founder at World 1, lesson 1', () => {
    const j = buildJourneyV2(freshProduct());
    assert.equal(j.currentWorld.id, 'w1');
    assert.equal(j.nextLesson?.id, 'w1.u1.l1');
    assert.equal(at(j, 'w1.u1.l1').state, 'current');
    assert.equal(at(j, 'w1.u1.l2').state, 'available');
  });

  it('locks every world after the first and says why', () => {
    const j = buildJourneyV2(freshProduct());
    assert.equal(j.worlds[0].state, 'current');
    for (const world of j.worlds.slice(1)) {
      assert.equal(world.state, 'locked', `${world.id} should be locked`);
      assert.ok(world.lockReason && world.lockReason.length > 10, `${world.id} explains the lock`);
    }
    assert.equal(j.overallPercent, 0);
    assert.equal(j.lessonsComplete, 0);
    assert.equal(j.lessonsTotal, TOTAL_LESSONS);
  });

  it('locks the checkpoint until every lesson in the world is complete', () => {
    const j = buildJourneyV2(freshProduct());
    for (const world of j.worlds) {
      assert.equal(world.checkpoint.state, 'locked');
      assert.equal(world.checkpoint.passed, false);
      // In the open world the reason is its own lessons; locked worlds cite the
      // previous checkpoint, which is also accurate.
      assert.ok(world.checkpoint.lockReason && world.checkpoint.lockReason.length > 10, world.id);
    }
    assert.match(j.worlds[0].checkpoint.lockReason!, /9 lessons/);
  });
});

describe('journey progress — completing real work', () => {
  it('recognises a bound record as in progress, not complete, until the lesson is taken', () => {
    const product = freshProduct({ description: 'A battery-powered plant monitor for apartment gardeners' });
    const j = buildJourneyV2(product);
    const lesson = at(j, 'w1.u1.l1');
    assert.equal(lesson.state, 'current', 'still the current lesson');
    assert.equal(lesson.recognition, 'in_progress');
    assert.equal(lesson.evidence, 'A battery-powered plant monitor for apartment gardeners');
  });

  it('completes the lesson once it is submitted', () => {
    const product = freshProduct({ description: 'A battery-powered plant monitor for apartment gardeners' });
    const records: JourneyRecords = { submissions: new Set(['w1.u1.l1']) };
    const j = buildJourneyV2(product, records);
    const lesson = at(j, 'w1.u1.l1');
    assert.equal(lesson.state, 'completed');
    assert.equal(lesson.recognition, 'completed');
    assert.equal(lesson.legacy, false);
    assert.equal(j.nextLesson?.id, 'w1.u1.l2', 'the journey advances');
  });

  it('never completes a write lesson on an empty or trivial record', () => {
    const records: JourneyRecords = { submissions: new Set(['w1.u1.l1']) };
    const j = buildJourneyV2(freshProduct({ description: 'a' }), records);
    assert.equal(at(j, 'w1.u1.l1').state, 'current');
  });

  it('requires every checklist item before a checklist lesson completes', () => {
    const records: JourneyRecords = { checkedItems: new Set(['w1.u1.l3:item']) };
    const j = buildJourneyV2(freshProduct(), records);
    assert.notEqual(at(j, 'w1.u1.l3').state, 'completed');
  });

  it('opens the checkpoint and passes it against real records', () => {
    const product = freshProduct({
      description: 'A battery-powered plant monitor for apartment gardeners that never lets a plant die',
      category: 'Electronics',
      answers: {
        'idea.problem': 'Houseplants die because owners cannot tell when to water',
        'idea.customer': 'Apartment gardeners who work long hours',
        'idea.customer_needs': 'I need to know when to water without checking the soil',
        'idea.value_proposition': 'The only monitor that tells you exactly when to water',
        'idea.assumptions': 'Owners will pay 30 dollars, the sensor lasts a year, watering advice is enough',
        'idea.concept': 'A soil moisture probe with an indicator light and no app',
        'idea.excitement': 4
      }
    });
    const allWorld1Lessons = WORLDS[0].units.flatMap((u) => u.lessons.map((l) => l.id));
    const submissions = new Set<string>([...allWorld1Lessons, 'w1.checkpoint']);
    const checkedItems = new Set(WORLDS[0].units.flatMap((u) => u.lessons.flatMap((l) => (l.activity.items ?? []).map((i) => `${l.id}:${i.id}`))));
    const j = buildJourneyV2(product, { submissions, checkedItems });

    assert.equal(j.worlds[0].completed, j.worlds[0].total, 'all World 1 lessons complete');
    assert.equal(j.worlds[0].checkpoint.state, 'completed');
    assert.equal(j.worlds[0].checkpoint.passed, true);
    assert.equal(j.worlds[0].complete, true);
    assert.equal(j.worlds[1].state, 'current', 'Research unlocks');
    assert.equal(j.nextLesson?.worldId, 'w2');
  });

  it('refuses to pass a checkpoint whose criteria are unmet', () => {
    const submissions = new Set([...WORLDS[0].units.flatMap((u) => u.lessons.map((l) => l.id)), 'w1.checkpoint']);
    const j = buildJourneyV2(freshProduct(), { submissions });
    assert.equal(j.worlds[0].checkpoint.passed, false, 'empty records cannot pass');
    assert.ok(j.worlds[0].checkpoint.results.some((r) => !r.passed));
    assert.equal(j.worlds[1].state, 'locked');
  });

  it('reports progress percentages from real completions only', () => {
    const product = freshProduct({
      description: 'A battery-powered plant monitor for apartment gardeners that never lets a plant die',
      answers: { 'idea.problem': 'Houseplants die because owners cannot tell when to water' }
    });
    const j = buildJourneyV2(product, { submissions: new Set(['w1.u1.l1', 'w1.u1.l2']) });
    assert.equal(j.worlds[0].progress, Math.round((2 / j.worlds[0].total) * 100));
    assert.ok(j.overallPercent > 0 && j.overallPercent < 100);
  });
});

describe('journey progress — existing users', () => {
  it('recognises discovery answers written before the curriculum as legacy completions', () => {
    const product = freshProduct({
      stage: 'Research',
      answers: {
        'idea.problem': 'Houseplants die because owners cannot tell when to water',
        'idea.customer': 'Apartment gardeners who work long hours',
        'idea.customer_needs': 'I need to know when to water without checking the soil',
        'idea.value_proposition': 'The only monitor that tells you exactly when to water',
        'idea.assumptions': 'Owners will pay 30 dollars, the sensor lasts a year, watering advice is enough',
        'idea.concept': 'A soil moisture probe with an indicator light and no app',
        'idea.excitement': 4
      }
    });
    const j = buildJourneyV2(product);
    for (const id of ['w1.u1.l2', 'w1.u2.l1', 'w1.u2.l3']) {
      const lesson = at(j, id);
      assert.equal(lesson.state, 'completed', `${id} recognised`);
      assert.equal(lesson.legacy, true, `${id} marked legacy`);
      assert.equal(lesson.recognition, 'legacy');
    }
  });

  it('does not force a product already in Testing back to World 1', () => {
    const product = freshProduct({ stage: 'Testing', legacyStage: 'Idea' });
    const j = buildJourneyV2(product);
    assert.equal(j.currentWorld.stage, 'Testing', 'the founder lands in their real world');
    assert.notEqual(j.nextLesson?.worldId, 'w1');
  });

  it('never locks a world the product has already passed', () => {
    const j = buildJourneyV2(freshProduct({ stage: 'Launch', legacyStage: 'Idea' }));
    for (const world of j.worlds.filter((w) => ['Idea', 'Research', 'Planning', 'Design', 'Prototype', 'Testing'].includes(w.stage))) {
      assert.notEqual(world.state, 'locked', `${world.id} must stay reachable`);
    }
  });

  it('marks exactly one world as current, even for a product past World 1', () => {
    const j = buildJourneyV2(freshProduct({ stage: 'Testing', legacyStage: 'Idea' }));
    const current = j.worlds.filter((w) => w.state === 'current');
    assert.equal(current.length, 1, `exactly one current world, saw ${current.map((w) => w.id).join(', ')}`);
    assert.equal(current[0].stage, 'Testing');
    // Earlier worlds stay reachable for revision.
    for (const world of j.worlds.filter((w) => w.index < current[0].index)) {
      assert.equal(world.state, 'available', `${world.id} should stay open`);
    }
  });

  it('is deterministic: the same product always yields the same journey', () => {
    const product = freshProduct({ stage: 'Prototype', legacyStage: 'Idea', answers: { 'idea.problem': 'X is broken for Y' } });
    const a = buildJourneyV2(product);
    const b = buildJourneyV2(product);
    assert.deepEqual(
      a.worlds.map((w) => [w.id, w.state, w.completed]),
      b.worlds.map((w) => [w.id, w.state, w.completed])
    );
  });
});
