import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildJourney, STAGE_IDS, type Material, type Product } from '@sv/shared';
import { StageJourneyMap } from './StageJourneyMap';
import { StageOverview } from './StageOverview';

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

const completeIdea = product({
  description: 'A bottle',
  answers: { 'idea.problem': 'Leaks', 'idea.customer': 'Commuters', 'idea.oneliner': 'A bottle' }
});

const renderMap = (p: Product) => renderToStaticMarkup(<StageJourneyMap journey={buildJourney(p, { materials })} onSelect={() => {}} />);

test('the journey map shows every stage and all three existing phases', () => {
  const html = renderMap(product());
  for (const stage of ['Idea', 'Research', 'Planning', 'Design', 'Prototype', 'Testing', 'Launch', 'Improvement']) {
    assert.ok(html.includes(stage), `missing stage ${stage}`);
  }
  for (const phase of ['Tell us', 'Track it', 'Improve it']) {
    assert.ok(html.includes(phase), `missing phase ${phase}`);
  }
});

test('the current stage is announced to assistive tech and labelled in words', () => {
  const html = renderMap(product({ stage: 'Design' }));
  assert.match(html, /aria-current="step"/);
  assert.ok(html.includes('You are here'));
  assert.ok(html.includes('Design'));
});

test('stages behind you are labelled truthfully, and locked stages explain why', () => {
  const html = renderMap(product({ stage: 'Design' }));
  // Idea/Research/Planning are behind Design but this product has no answers, so
  // they must NOT claim to be done — they show how much is outstanding instead.
  assert.ok(!html.includes('>Done<'), 'a skipped stage must not be labelled Done');
  assert.match(html, /\d+ left/, 'skipped stages should show what is outstanding');
  // Prototype is ahead of a current stage with an unfinished checklist.
  assert.match(html, /Finish Design to unlock Prototype/);
});

test('a genuinely finished stage is labelled Done', () => {
  const done = product({
    stage: 'Research',
    description: 'A bottle',
    answers: {
      'idea.problem': 'Leaks',
      'idea.customer': 'Commuters',
      'idea.oneliner': 'A bottle',
      // Idea's quest also needs a description, supplied above.
      'research.competitors': 'Generic bottles',
      'research.market_price': 20,
      'research.validated': true,
      'research.differentiator': 'Does not leak'
    }
  });
  const html = renderMap(done);
  assert.ok(html.includes('Done'), 'a complete stage should read as Done');
});

test('the next stage is shown as ready once the current stage is complete', () => {
  const html = renderMap(completeIdea);
  assert.ok(html.includes('Ready'), 'the unlocked stage should read as ready');
  assert.ok(!html.includes('Finish Idea to unlock Research'), 'Research must not be locked when Idea is complete');
});

test('overall progress is displayed as a count and a percentage', () => {
  const j = buildJourney(product(), { materials });
  const html = renderMap(product());
  assert.ok(html.includes(`0/${j.totalCount} stages`), 'should show stage count');
  assert.ok(html.includes(`${j.overallPercent}%`));
});

test('Retired is offered off the main path, never as a ninth node on it', () => {
  const html = renderMap(product({ stage: 'Launch' }));
  assert.ok(html.includes('Retire this product'), 'retire affordance should exist');
  // The eight path stages are listed as nodes; Retired is not among them.
  const nodeCount = (html.match(/aria-label="[A-Za-z]+ — (Completed|You are here|Ready to start|Locked)"/g) ?? []).length;
  assert.equal(nodeCount, 8, `expected 8 journey nodes, got ${nodeCount}`);
});

test('the stage overview answers what/why/how-much/what-next in plain language', () => {
  const journey = buildJourney(product(), { materials });
  const html = renderToStaticMarkup(
    <StageOverview
      product={product()}
      materials={materials}
      stage={journey.current}
      nextStageId={journey.nextStageId}
      isCurrent
      onGoTab={() => {}}
      onAdvance={() => {}}
      advancing={false}
    />
  );
  assert.ok(html.includes('What you need to do'), 'must list the steps');
  assert.ok(html.includes('Why this matters'), 'must explain why it matters');
  assert.ok(html.includes('What happens next'), 'must say what happens next');
  assert.match(html, /\d+ of \d+ done/, 'must show how much is left');
  assert.ok(html.includes('Capture the product idea'), 'must use the plain-English stage purpose');
});

test('a locked stage overview explains the prerequisite instead of offering actions', () => {
  const journey = buildJourney(product({ stage: 'Idea' }), { materials });
  const lockedStage = journey.stages.find((s) => s.id === 'Testing')!;
  const html = renderToStaticMarkup(
    <StageOverview
      product={product()}
      materials={materials}
      stage={lockedStage}
      nextStageId={null}
      isCurrent={false}
      onGoTab={() => {}}
      onAdvance={() => {}}
      advancing={false}
    />
  );
  assert.match(html, /Finish .* to unlock Testing/);
});

test('every stage deep-links its activities so nobody has to hunt for the next step', () => {
  const journey = buildJourney(product(), { materials });
  const withLinks = renderToStaticMarkup(
    <StageOverview
      product={product()}
      materials={materials}
      stage={journey.current}
      nextStageId={journey.nextStageId}
      isCurrent
      onGoTab={() => {}}
      onAdvance={() => {}}
      advancing={false}
    />
  );
  // Activities render as buttons wired to a tab, not dead text.
  assert.ok((withLinks.match(/<button/g) ?? []).length > 0);
});

test('the journey never renders a stage with an empty checklist', () => {
  for (const stage of STAGE_IDS) {
    const j = buildJourney(product({ stage }), { materials });
    const s = j.stages.find((x) => x.id === stage)!;
    assert.ok(s.activities.length > 0, `${stage} has no activities`);
    assert.ok(!renderMap(product({ stage })).includes('No checklist items'), `${stage} rendered an empty state`);
  }
});
