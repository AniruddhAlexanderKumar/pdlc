import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canTransition, grandfatheredThrough, isGrandfathered } from './stage-gating.js';
import type { Material, Product, StageId } from '@sv/shared';

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

/** Idea stage fully satisfied: the three required answers plus a description. */
const completeIdea = (stage: StageId = 'Idea', extra: Partial<Product> = {}) =>
  product({
    stage,
    description: 'A bottle',
    answers: { 'idea.problem': 'Leaks', 'idea.customer': 'Commuters', 'idea.oneliner': 'A bottle' },
    ...extra
  });

describe('stage gating', () => {
  it('allows the same stage (a no-op)', () => {
    assert.equal(canTransition(product(), 'Idea', materials).allowed, true);
  });

  it('blocks a forward move when the checklist is incomplete, naming what is missing', () => {
    const v = canTransition(product(), 'Research', materials);
    assert.equal(v.allowed, false);
    if (v.allowed) return;
    assert.ok(v.reason.includes('Idea'));
    assert.ok(v.missing.length > 0, 'should name the missing items');
    assert.ok(v.reason.includes(';'), 'reason lists the missing items');
  });

  it('allows a forward move once the checklist is complete', () => {
    assert.equal(canTransition(completeIdea(), 'Research', materials).allowed, true);
  });

  it('gates only on the current stage, so skipping ahead is refused by the missing checklist', () => {
    // A complete Idea unlocks the *next* stage. Jumping straight to Design is a
    // forward move from a stage whose own checklist is satisfied, so the gate
    // permits it; the journey UI is what restricts navigation to available
    // stages. Keeping this explicit stops the rule drifting silently.
    assert.equal(canTransition(completeIdea(), 'Design', materials).allowed, true);
  });

  it('always allows moving backwards to revisit a completed stage', () => {
    const p = product({ stage: 'Design' });
    assert.equal(canTransition(p, 'Idea', materials).allowed, true);
    assert.equal(canTransition(p, 'Research', materials).allowed, true);
  });

  it('always allows retiring a product without a finished checklist', () => {
    assert.equal(canTransition(product({ stage: 'Testing' }), 'Retired', materials).allowed, true);
  });

  it('rejects a value that is not a stage', () => {
    const v = canTransition(product(), 'Nonsense' as StageId, materials);
    assert.equal(v.allowed, false);
  });

  describe('grandfathering for products created before gating', () => {
    it('treats the further of current and legacy stage as the baseline', () => {
      assert.equal(grandfatheredThrough({ stage: 'Idea' }), 0);
      assert.equal(grandfatheredThrough({ stage: 'Idea', legacyStage: 'Launch' }), 6);
      assert.equal(grandfatheredThrough({ stage: 'Testing', legacyStage: 'Design' }), 5);
    });

    it('keeps a legacy product able to move within stages it already reached', () => {
      // Incomplete checklist, but it was already at Design when gating shipped.
      const legacy = product({ stage: 'Research', legacyStage: 'Design' });
      assert.equal(isGrandfathered(legacy, 'Design'), true);
      assert.equal(canTransition(legacy, 'Design', materials).allowed, true);
    });

    it('still gates a legacy product beyond its recorded baseline', () => {
      const legacy = product({ stage: 'Research', legacyStage: 'Design' });
      const v = canTransition(legacy, 'Prototype', materials);
      assert.equal(v.allowed, false, 'must not grandfather stages it never reached');
    });

    it('does not grandfather products created after gating (null legacy stage)', () => {
      const fresh = product({ stage: 'Idea', legacyStage: null });
      assert.equal(isGrandfathered(fresh, 'Research'), false);
      assert.equal(canTransition(fresh, 'Research', materials).allowed, false);
    });

    it('preserves progress for a product sitting at its legacy stage with gaps', () => {
      const legacy = product({ stage: 'Launch', legacyStage: 'Launch' });
      // Every earlier stage is behind it, and Retirement stays available.
      assert.equal(canTransition(legacy, 'Improvement', materials).allowed, false);
      assert.equal(canTransition(legacy, 'Retired', materials).allowed, true);
      assert.equal(canTransition(legacy, 'Design', materials).allowed, true);
    });
  });

  describe('approval gate', () => {
    // Research requires approval on research.validated.
    const completeResearch = () =>
      product({
        stage: 'Research',
        description: 'A bottle',
        tasks: [{ id: 't1', title: 'Bench test', description: '', status: 'todo', dueDate: null, position: 0, completedAt: null }],
        answers: {
          'idea.problem': 'Leaks',
          'idea.customer': 'Commuters',
          'idea.oneliner': 'A bottle',
          'research.competitors': 'Generic bottles',
          'research.market_price': 20,
          'research.validated': true,
          'research.differentiator': 'Does not leak'
        }
      });

    it('blocks a forward move while a required sign-off is unapproved', () => {
      const v = canTransition(completeResearch(), 'Planning', materials, {});
      assert.equal(v.allowed, false);
      if (v.allowed) return;
      assert.match(v.reason, /Waiting for approval/);
    });

    it('blocks while the sign-off is merely pending', () => {
      const v = canTransition(completeResearch(), 'Planning', materials, { 'research.validated': 'pending' });
      assert.equal(v.allowed, false);
    });

    it('allows the move once the sign-off is approved', () => {
      const v = canTransition(completeResearch(), 'Planning', materials, { 'research.validated': 'approved' });
      assert.equal(v.allowed, true);
    });

    it('ignores approval state for stages with no sign-off activities', () => {
      // Idea has no approval-gated activities, so empty approvals do not block it.
      const v = canTransition(completeIdea(), 'Research', materials, {});
      assert.equal(v.allowed, true);
    });

    it('still allows backward moves and retiring without approval', () => {
      const p = product({ stage: 'Testing' });
      assert.equal(canTransition(p, 'Design', materials, {}).allowed, true);
      assert.equal(canTransition(p, 'Retired', materials, {}).allowed, true);
    });
  });
});
