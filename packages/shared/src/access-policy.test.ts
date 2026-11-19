import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCESS_POLICIES,
  DEFAULT_ACCESS_POLICY,
  accessStatusFor,
  isAccessPolicy
} from './access-policy.js';
import {
  ONBOARDING_STARTING_POINTS,
  STARTING_POINT_STAGES,
  planOnboarding,
  startingPointSummary
} from './onboarding.js';

describe('account access policy', () => {
  it('defaults to open registration without a payment step', () => {
    const status = accessStatusFor(DEFAULT_ACCESS_POLICY);
    assert.equal(DEFAULT_ACCESS_POLICY, 'beta-open');
    assert.equal(status.openRegistration, true);
    assert.equal(status.paymentRequired, false);
    assert.equal(status.standardAccess, 'full');
    assert.equal(status.launchPeriod, true);
  });

  it('never requires a paid subscription under any shipping policy', () => {
    for (const policy of ACCESS_POLICIES) {
      const status = accessStatusFor(policy);
      assert.equal(status.paymentRequired, false, `${policy} must not gate access behind payment`);
      assert.equal(status.standardAccess, 'full');
    }
  });

  it('keeps the invite-only policy for operators who need it', () => {
    const status = accessStatusFor('invite-only');
    assert.equal(status.openRegistration, false);
    assert.equal(status.launchPeriod, false);
    assert.equal(status.registrationEmailVerification, 'required');
  });

  it('treats a paid entitlement as full access under every policy', () => {
    for (const policy of ACCESS_POLICIES) {
      const entitled = accessStatusFor(policy, true);
      assert.equal(entitled.standardAccess, 'full');
      assert.equal(entitled.paymentRequired, false);
    }
  });

  it('rejects unknown policy identifiers instead of guessing', () => {
    assert.equal(isAccessPolicy('beta-open'), true);
    assert.equal(isAccessPolicy('free-forever'), false);
    assert.equal(isAccessPolicy(undefined), false);
  });
});

describe('registration onboarding plan', () => {
  it('starts a founder from scratch at the Idea stage', () => {
    const plan = planOnboarding({ building: 'A modular robot arm', startingPoint: 'scratch' });
    assert.equal(plan.startingStage, 'Idea');
    assert.deepEqual(plan.visitedStages, []);
    assert.equal(plan.createsProduct, true);
  });

  it('starts a founder with an existing product at Prototype with earlier stages visited', () => {
    const plan = planOnboarding({ building: 'A delivery drone', startingPoint: 'existing' });
    assert.equal(plan.startingStage, 'Prototype');
    assert.deepEqual(plan.visitedStages, ['Idea', 'Research', 'Planning', 'Design']);
    assert.equal(plan.createsProduct, true);
  });

  it('defaults to scratch when the answer is missing or malformed', () => {
    assert.equal(planOnboarding({}).startingPoint, 'scratch');
    assert.equal(planOnboarding({ startingPoint: 'nonsense' as never }).startingPoint, 'scratch');
    assert.equal(planOnboarding({ building: '   ' }).createsProduct, false);
    for (const startingPoint of ONBOARDING_STARTING_POINTS) {
      assert.ok(STARTING_POINT_STAGES[startingPoint]);
      assert.ok(startingPointSummary(startingPoint).length > 0);
    }
  });
});
