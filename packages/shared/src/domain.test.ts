import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cheaperQuote, costSummary } from './costing.js';
import { formatMoney } from './format.js';
import { levelFromXp, productHealth, stageQuest, xpForLevel } from './gamification.js';
import { ruleInsights } from './insights.js';
import { QUESTION_BANK, QUESTIONS_BY_KEY, normaliseAnswer } from './questions.js';
import { nextStage } from './stages.js';
import type { Material, Product, Supplier } from './types.js';

const steel: Material = {
  id: 'm1',
  name: 'Steel body',
  category: 'Metals & Alloys',
  unit: 'pcs',
  unitPrice: 5.2,
  description: '',
  sourceUrl: '',
  notes: '',
  suppliers: [
    { supplierId: 's1', quotedPrice: 5.2, moq: 300 },
    { supplierId: 's2', quotedPrice: 4.6, moq: 500 }
  ]
};
const lid: Material = { ...steel, id: 'm2', name: 'Lid', unitPrice: 1.6, suppliers: [] };
const materials = new Map([steel, lid].map((m) => [m.id, m]));
const suppliers = new Map<string, Supplier>([
  ['s1', { id: 's1', name: 'Precision', website: '', contact: '', notes: '' }],
  ['s2', { id: 's2', name: 'GreenSteel', website: '', contact: '', notes: '' }]
]);

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Bottle',
    category: 'Drinkware',
    stage: 'Idea',
    imageUrl: '',
    description: '',
    notes: '',
    targetSellingPrice: 29,
    costs: { labour: 2, packaging: 0, overhead: 1.2 },
    materials: [
      { materialId: 'm1', quantity: 1 },
      { materialId: 'm2', quantity: 1 }
    ],
    tasks: [],
    answers: {},
    createdAt: '',
    updatedAt: '',
    ...overrides
  };
}

describe('costing', () => {
  it('sums materials and other costs into a unit cost and margin', () => {
    const s = costSummary(product(), materials);
    assert.equal(s.materialsCost, 6.8);
    assert.equal(s.totalUnitCost, 10);
    assert.equal(s.grossProfit, 19);
    assert.equal(s.grossMargin, 65.5);
  });

  it('has no margin without a price', () => {
    const s = costSummary(product({ targetSellingPrice: null }), materials);
    assert.equal(s.grossMargin, null);
    assert.equal(s.grossProfit, null);
  });

  it('ignores BOM lines whose material was deleted', () => {
    const s = costSummary(product({ materials: [{ materialId: 'gone', quantity: 3 }] }), materials);
    assert.equal(s.materialsCost, 0);
  });

  it('finds a cheaper supplier quote', () => {
    assert.deepEqual(cheaperQuote(steel), { supplierId: 's2', quotedPrice: 4.6, moq: 500, saving: 0.6 });
    assert.equal(cheaperQuote(lid), null);
  });
});

describe('questions', () => {
  it('has unique keys', () => {
    assert.equal(QUESTIONS_BY_KEY.size, QUESTION_BANK.length);
  });

  it('validates answers by type', () => {
    const scale = QUESTIONS_BY_KEY.get('idea.excitement')!;
    assert.deepEqual(normaliseAnswer(scale, 4), { value: 4 });
    assert.ok('error' in normaliseAnswer(scale, 7));
    const money = QUESTIONS_BY_KEY.get('research.market_price')!;
    assert.deepEqual(normaliseAnswer(money, '32.456'), { value: 32.46 });
    assert.ok('error' in normaliseAnswer(money, -1));
    const multi = QUESTIONS_BY_KEY.get('research.channels')!;
    assert.deepEqual(normaliseAnswer(multi, ['Own website', 'Own website']), { value: ['Own website'] });
    assert.ok('error' in normaliseAnswer(multi, ['Not an option']));
    const date = QUESTIONS_BY_KEY.get('planning.launch_date')!;
    assert.ok('error' in normaliseAnswer(date, '2027-13-45'));
    assert.deepEqual(normaliseAnswer(date, ''), { value: null });
  });
});

describe('gamification', () => {
  it('maps XP to levels', () => {
    assert.equal(xpForLevel(1), 0);
    assert.equal(xpForLevel(2), 100);
    assert.equal(levelFromXp(0).level, 1);
    assert.equal(levelFromXp(99).level, 1);
    assert.equal(levelFromXp(100).level, 2);
    assert.deepEqual(levelFromXp(350), { level: 3, title: 'Maker', xpIntoLevel: 50, xpForNextLevel: 300 });
  });

  it('completes the Idea quest once required questions and a description exist', () => {
    const p = product();
    assert.equal(stageQuest(p, materials).complete, false);
    const done = product({
      description: 'A bottle',
      answers: { 'idea.problem': 'Leaks', 'idea.customer': 'Commuters', 'idea.oneliner': 'A bottle' }
    });
    assert.equal(stageQuest(done, materials).complete, true);
  });

  it('scores health between 0 and 100', () => {
    const h = productHealth(product(), materials);
    assert.ok(h.score >= 0 && h.score <= 100);
    assert.ok(['A', 'B', 'C', 'D'].includes(h.grade));
  });

  it('never suggests Retired as the next stage', () => {
    assert.equal(nextStage('Idea'), 'Research');
    assert.equal(nextStage('Improvement'), null);
  });
});

describe('insights', () => {
  const fmt = (n: number) => formatMoney(n, 'USD');

  it('suggests the cheaper supplier with the per-unit saving', () => {
    const list = ruleInsights(product(), materials, suppliers, fmt);
    const sw = list.find((i) => i.kind === 'supplier');
    assert.ok(sw);
    assert.equal(sw.perUnitImpact, 0.6);
    assert.deepEqual(sw.action, { type: 'switch_supplier', materialId: 'm1', supplierId: 's2', price: 4.6 });
  });

  it('suggests a price that hits the target margin', () => {
    const p = product({ targetSellingPrice: 12, answers: { 'planning.target_margin': 50 } });
    const m = ruleInsights(p, materials, suppliers, fmt).find((i) => i.kind === 'margin');
    assert.deepEqual(m?.action, { type: 'set_price', price: 20 });
  });

  it('gives stable ids so applying is idempotent', () => {
    const a = ruleInsights(product(), materials, suppliers, fmt).map((i) => i.id);
    const b = ruleInsights(product(), materials, suppliers, fmt).map((i) => i.id);
    assert.deepEqual(a, b);
  });
});

describe('formatMoney', () => {
  it('shows cents only when needed', () => {
    assert.equal(formatMoney(29, 'USD'), '$29');
    assert.equal(formatMoney(4.1, 'USD'), '$4.10');
    assert.equal(formatMoney(1234.5, 'INR'), '₹1,234.50');
  });
});
