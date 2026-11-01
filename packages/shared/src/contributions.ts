export const CONTRIBUTION_DIMENSIONS = ['impact', 'quality', 'complexity', 'collaboration', 'effort'] as const;
export type ContributionDimension = (typeof CONTRIBUTION_DIMENSIONS)[number];
export type ContributionRatings = Record<ContributionDimension, number | null>;

export function isContributionScoringEnabled(memberCount: number): boolean {
  return Number.isInteger(memberCount) && memberCount > 2;
}

export const CONTRIBUTION_WEIGHTS: Record<ContributionDimension, number> = {
  impact: 35,
  quality: 25,
  complexity: 20,
  collaboration: 10,
  effort: 10
};

export const CONTRIBUTION_CATEGORIES = [
  { key: 'product-delivery', name: 'Product features and deliverables' },
  { key: 'engineering', name: 'Engineering and implementation' },
  { key: 'research', name: 'Research and technical problem solving' },
  { key: 'defect-prevention', name: 'Bug fixes and defect prevention' },
  { key: 'testing-quality', name: 'Testing and quality improvements' },
  { key: 'design', name: 'Design and user experience' },
  { key: 'documentation', name: 'Documentation and knowledge sharing' },
  { key: 'review', name: 'Code, design, or technical reviews' },
  { key: 'collaboration', name: 'Mentoring, collaboration, and unblocking' },
  { key: 'process-improvement', name: 'Initiative and process improvements' }
] as const;

export interface ContributionRubric {
  version: string;
  weights: Record<ContributionDimension, number>;
  conversion: 'one_point_per_score_point';
}

export const DEFAULT_CONTRIBUTION_RUBRIC: ContributionRubric = {
  version: 'baseline-v1',
  weights: CONTRIBUTION_WEIGHTS,
  conversion: 'one_point_per_score_point'
};

export interface ContributionScoreInput {
  ratings: ContributionRatings;
  applicableDimensions: readonly ContributionDimension[];
  attributionShare: number;
  weights?: Record<ContributionDimension, number>;
}

export interface ContributionScoreResult {
  score: number;
  awardedXp: number;
  breakdown: Record<ContributionDimension, number | null>;
  normalizedWeights: Record<ContributionDimension, number>;
}

export function calculateContributionScore(input: ContributionScoreInput): ContributionScoreResult {
  const { ratings, applicableDimensions, attributionShare } = input;
  const weights = input.weights ?? CONTRIBUTION_WEIGHTS;
  const applicable = new Set(applicableDimensions);

  if (applicable.size === 0 || applicable.size !== applicableDimensions.length) {
    throw new Error('At least one unique scoring dimension is required');
  }
  if (!Number.isInteger(attributionShare) || attributionShare < 1 || attributionShare > 100) {
    throw new Error('Attribution share must be a whole number from 1 to 100');
  }

  const totalWeight = applicableDimensions.reduce((sum, dimension) => {
    const weight = weights[dimension];
    if (!Number.isFinite(weight) || weight < 0) throw new Error(`Invalid weight for ${dimension}`);
    return sum + weight;
  }, 0);
  if (totalWeight <= 0) throw new Error('Applicable scoring weights must total more than zero');

  const breakdown = {} as Record<ContributionDimension, number | null>;
  const normalizedWeights = {} as Record<ContributionDimension, number>;
  let score = 0;
  for (const dimension of CONTRIBUTION_DIMENSIONS) {
    if (!applicable.has(dimension)) {
      if (ratings[dimension] !== null) throw new Error(`${dimension} is not applicable and must not be rated`);
      breakdown[dimension] = null;
      normalizedWeights[dimension] = 0;
      continue;
    }

    const rating = ratings[dimension];
    if (rating === null || !Number.isInteger(rating) || rating < 0 || rating > 5) {
      throw new Error(`${dimension} rating must be a whole number from 0 to 5`);
    }
    const normalizedWeight = (weights[dimension] / totalWeight) * 100;
    normalizedWeights[dimension] = normalizedWeight;
    breakdown[dimension] = (rating / 5) * normalizedWeight;
    score += breakdown[dimension]!;
  }

  const roundedScore = Math.round(score);
  return {
    score: roundedScore,
    awardedXp: Math.round((roundedScore * attributionShare) / 100),
    breakdown,
    normalizedWeights
  };
}
