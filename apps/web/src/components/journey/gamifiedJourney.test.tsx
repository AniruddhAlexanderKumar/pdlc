import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildJourneyV2, WORLDS, type JourneyV2, type Product } from '@sv/shared';
import { JourneyMap } from './JourneyMap';

/**
 * Renders the real journey map against real engine output.
 *
 * These assertions are deliberately about what a founder can see and do, not
 * about class names: which states are shown, whether locked nodes explain
 * themselves, and whether every world and checkpoint is present.
 */

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Commuter bottle',
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

const noop = () => {};
const renderMap = (journey: JourneyV2) =>
  renderToStaticMarkup(<JourneyMap journey={journey} onOpenLesson={noop} onOpenCheckpoint={noop} onLocked={noop} />);

test('the map shows all eight worlds in order with their checkpoints', () => {
  const html = renderMap(buildJourneyV2(product()));
  for (const world of WORLDS) {
    assert.ok(html.includes(world.title), `missing world ${world.title}`);
    assert.ok(html.includes(world.checkpoint.title), `missing checkpoint ${world.checkpoint.title}`);
  }
  // Order matters: the path is read top to bottom.
  const positions = WORLDS.map((w) => html.indexOf(w.title));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'worlds render in curriculum order');
});

test('a new founder sees World 1 open and every later world locked with a reason', () => {
  const html = renderMap(buildJourneyV2(product()));
  assert.match(html, /You are here/);
  assert.match(html, /Pass the Idea checkpoint to unlock Research/);
  // The first lesson is marked as next up and is clickable.
  assert.match(html, /Next up/);
  // Later worlds must not claim to be open.
  assert.equal((html.match(/You are here/g) ?? []).length, 1);
});

test('the map reports real progress counts, not placeholder numbers', () => {
  const html = renderMap(buildJourneyV2(product()));
  // The open world shows its real lesson count, and no world claims progress.
  assert.ok(html.includes('0/9'), 'World 1 shows 0 of its 9 lessons');
  assert.ok(html.includes('0/3'), 'each unit shows its own count');
  assert.doesNotMatch(html, /width:100%/, 'nothing is complete yet');
});

test('completed work is shown as complete, with legacy work called out', () => {
  const legacy = product({
    stage: 'Research',
    answers: {
      'idea.problem': 'Bottles leak in bags',
      'idea.customer': 'Daily commuters',
      'idea.value_proposition': 'The only bottle that survives a commute'
    }
  });
  const html = renderMap(buildJourneyV2(legacy));
  assert.match(html, /Recognised from earlier work/, 'legacy completions are labelled honestly');
});

test('locked lesson nodes remain in the document and explain the unlock', () => {
  const html = renderMap(buildJourneyV2(product()));
  // A locked lesson is still rendered (never hidden), so the route is legible,
  // and its accessible name carries the reason it is locked.
  assert.ok(html.includes(WORLDS[0].units[1].lessons[0].title));
  assert.match(html, /Finish the previous unit in Idea first/);
  assert.match(html, /aria-label="[^"]*locked\. Finish the previous unit in Idea first\./);
});

test('an existing product in Testing lands in its own world, not World 1', () => {
  const html = renderMap(buildJourneyV2(product({ stage: 'Testing', legacyStage: 'Idea' })));
  // World 1 is no longer the current world for this founder.
  assert.match(html, /World 6/);
  assert.ok(!/World 1: Idea<\/h3>/.test(html));
});

test('a complete journey shows every world complete and no next-up nudge', () => {
  const complete = product({
    stage: 'Improvement',
    description: 'A commuter bottle that does not leak, built for daily commuters',
    targetSellingPrice: 35,
    notes: 'Tooling and packaging notes for the second production run',
    costs: { labour: 30, packaging: 5, overhead: 4 },
    materials: [
      { materialId: 'm1', quantity: 2 },
      { materialId: 'm2', quantity: 1 }
    ],
    tasks: [
      { id: 't1', title: 'Get supplier quotes', status: 'done', position: 0, description: '' },
      { id: 't2', title: 'Build the prototype', status: 'done', position: 1, description: '' },
      { id: 't3', title: 'Test the lid', status: 'done', position: 2, description: '' },
      // Launch work is matched by the task's own vocabulary, so the fixture needs
      // real launch tasks to satisfy the Launch checkpoint.
      { id: 't4', title: 'Pack and stock the first 50 units', status: 'todo', position: 3, description: '' },
      { id: 't5', title: 'Schedule the launch announcement', status: 'todo', position: 4, description: '' }
    ],
    answers: Object.fromEntries(
      WORLDS.flatMap((w) => w.units.flatMap((u) => u.lessons.map((l) => [l.bind.key, 'A real recorded answer that is long enough'])))
    )
  } as Partial<Product>);

  // Form lessons bound to research/requirements/tests/decisions/feedback write
  // real rows, so a genuinely complete journey has those records too — one per
  // field of each such lesson, exactly as the API writes them.
  const records = {
    submissions: new Set(WORLDS.flatMap((w) => w.units.flatMap((u) => u.lessons.map((l) => l.id))).concat(WORLDS.map((w) => w.checkpoint.id))),
    checkedItems: new Set<string>(),
    research: WORLDS.flatMap((w) => w.units.flatMap((u) => u.lessons))
      .filter((l) => l.bind.target === 'research')
      .flatMap((l) => Array.from({ length: Math.max(1, (l.activity.fields ?? []).length) }, (_, i) => ({ id: `r-${l.id}-${i}`, kind: l.bind.key, title: 'Recorded finding', detail: 'Evidence recorded by the lesson' }))),
    requirements: WORLDS.flatMap((w) => w.units.flatMap((u) => u.lessons))
      .filter((l) => l.bind.target === 'requirement')
      .flatMap((l) => Array.from({ length: Math.max(1, (l.activity.fields ?? []).length) }, (_, i) => ({ id: `q-${l.id}-${i}`, kind: l.bind.key, text: 'A real requirement', priority: 'must' }))),
    tests: WORLDS.flatMap((w) => w.units.flatMap((u) => u.lessons))
      .filter((l) => l.bind.target === 'test')
      .flatMap((l) => Array.from({ length: Math.max(1, (l.activity.fields ?? []).length - 1) }, (_, i) => ({ id: `t-${l.id}-${i}`, name: 'functional', result: 'Passed the check', outcome: 'pass' }))),
    decisions: WORLDS.flatMap((w) => w.units.flatMap((u) => u.lessons))
      .filter((l) => l.bind.target === 'decision')
      .map((l) => ({ id: `d-${l.id}`, kind: l.bind.key, decision: 'Chose the simpler option', rationale: 'Because it ships sooner' })),
    feedback: WORLDS.flatMap((w) => w.units.flatMap((u) => u.lessons))
      .filter((l) => l.bind.target === 'feedback')
      .flatMap((l) => Array.from({ length: Math.max(1, (l.activity.fields ?? []).length) }, (_, i) => ({ id: `f-${l.id}-${i}`, kind: l.bind.key, body: 'Something a customer said', severity: 'normal', status: 'open' })))
  };


  const journey = buildJourneyV2(complete, records);
  const html = renderMap(journey);
  assert.equal(journey.isComplete, true, 'the fixture really is complete');
  assert.equal(journey.worldsComplete, 8, 'the engine reports eight complete worlds');
  assert.ok((html.match(/Completed/g) ?? []).length >= 8, 'each world is marked completed');
  assert.doesNotMatch(html, /Next up/);
});

test('every locked world cites the checkpoint that unlocks it', () => {
  const html = renderMap(buildJourneyV2(product()));
  const visible = html.replace(/<[^>]*>/g, ' ');
  const locks = visible.match(/Pass the [A-Za-z ]+ checkpoint to unlock [A-Za-z ]+/g) ?? [];
  assert.equal(locks.length, 7, 'seven later worlds each cite the checkpoint that unlocks them');
});
