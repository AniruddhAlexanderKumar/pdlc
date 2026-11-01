import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculateContributionScore,
  CONTRIBUTION_DIMENSIONS,
  CONTRIBUTION_WEIGHTS,
  DEFAULT_CONTRIBUTION_RUBRIC,
  isContributionScoringEnabled
} from './contributions.js';

describe('contribution scoring', () => {
  const allDimensions = [...CONTRIBUTION_DIMENSIONS];

  it('enables contribution scoring only for workspaces with more than two members', () => {
    assert.equal(isContributionScoringEnabled(1), false);
    assert.equal(isContributionScoringEnabled(2), false);
    assert.equal(isContributionScoringEnabled(3), true);
    assert.equal(isContributionScoringEnabled(2.5), false);
  });

  it('calculates the documented weighted score and one XP per score point', () => {
    const result = calculateContributionScore({
      ratings: { impact: 4, quality: 4, complexity: 3, collaboration: 2, effort: 2 },
      applicableDimensions: allDimensions,
      attributionShare: 100
    });
    assert.equal(result.score, 68);
    assert.equal(result.awardedXp, 68);
    assert.deepEqual(result.normalizedWeights, CONTRIBUTION_WEIGHTS);
    assert.equal(DEFAULT_CONTRIBUTION_RUBRIC.conversion, 'one_point_per_score_point');
  });

  it('normalizes weights when a dimension is not applicable', () => {
    const result = calculateContributionScore({
      ratings: { impact: 4, quality: 4, complexity: 3, collaboration: null, effort: 2 },
      applicableDimensions: ['impact', 'quality', 'complexity', 'effort'],
      attributionShare: 100
    });
    assert.equal(result.score, 71);
    assert.equal(result.breakdown.collaboration, null);
    assert.equal(result.normalizedWeights.collaboration, 0);
  });

  it('allocates a shared deliverable score according to individual attribution', () => {
    const result = calculateContributionScore({
      ratings: { impact: 5, quality: 5, complexity: 5, collaboration: 5, effort: 5 },
      applicableDimensions: allDimensions,
      attributionShare: 40
    });
    assert.equal(result.score, 100);
    assert.equal(result.awardedXp, 40);
  });

  it('matches the documented examples across different contribution types', () => {
    const examples = [
      { ratings: { impact: 3, quality: 4, complexity: 1, collaboration: 1, effort: 2 }, score: 51 },
      { ratings: { impact: 4, quality: 4, complexity: 5, collaboration: 2, effort: 4 }, score: 80 },
      { ratings: { impact: 5, quality: 5, complexity: 4, collaboration: 2, effort: 3 }, score: 86 },
      { ratings: { impact: 3, quality: 4, complexity: 2, collaboration: 5, effort: 1 }, score: 61 },
      { ratings: { impact: 3, quality: 4, complexity: 2, collaboration: 4, effort: 2 }, score: 61 },
      { ratings: { impact: 1, quality: 3, complexity: 4, collaboration: 1, effort: 4 }, score: 48 }
    ];
    for (const example of examples) {
      const result = calculateContributionScore({
        ratings: example.ratings,
        applicableDimensions: allDimensions,
        attributionShare: 100
      });
      assert.equal(result.score, example.score);
    }
  });

  it('rejects missing ratings, invalid ratings, shares, and weights', () => {
    const base = {
      ratings: { impact: 5, quality: 5, complexity: 5, collaboration: 5, effort: 5 },
      applicableDimensions: allDimensions,
      attributionShare: 100
    };
    assert.throws(() => calculateContributionScore({ ...base, ratings: { ...base.ratings, impact: null } }));
    assert.throws(() => calculateContributionScore({ ...base, ratings: { ...base.ratings, effort: 6 } }));
    assert.throws(() => calculateContributionScore({ ...base, attributionShare: 101 }));
    assert.throws(() => calculateContributionScore({ ...base, weights: { ...CONTRIBUTION_WEIGHTS, impact: -1 } }));
    assert.throws(() => calculateContributionScore({ ...base, applicableDimensions: ['impact'], ratings: { ...base.ratings, quality: 1 } }));
  });
});
