import type { StageId } from './stages.js';

/**
 * Post-registration onboarding.
 *
 * Two questions decide where a new founder enters the PDLC progression:
 *
 *  1. What are you building? — chooses the workspace work domain and, from it,
 *     the navigation emphasis (the same conservative mapping the workspace
 *     setup page already uses).
 *  2. Are you starting from scratch or do you already have a product? — chooses
 *     the first lifecycle stage for the product that is created during
 *     onboarding. Nothing is skipped permanently: stages are always reachable
 *     in both directions, and a product that starts later still shows what was
 *     completed before.
 *
 * These helpers are pure so the API and the web app agree on the mapping.
 */

export const ONBOARDING_STARTING_POINTS = ['scratch', 'existing'] as const;
export type OnboardingStartingPoint = (typeof ONBOARDING_STARTING_POINTS)[number];

/**
 * A starting point maps to its first PDLC stage, and to the stages a founder
 * who already has a product would have worked through. The second list is used
 * to record the journey as an established baseline rather than an empty one.
 */
export const STARTING_POINT_STAGES: Record<OnboardingStartingPoint, StageId> = {
  scratch: 'Idea',
  existing: 'Prototype'
};

export const STARTING_POINT_LABELS: Record<OnboardingStartingPoint, string> = {
  scratch: 'Starting from scratch',
  existing: 'Already building a product'
};

export const STARTING_POINT_DESCRIPTIONS: Record<OnboardingStartingPoint, string> = {
  scratch: 'Begin at Idea and work through the full journey, from problem to launch.',
  existing: 'Begin at Prototype with earlier stages available to revisit and record.'
};

export interface OnboardingAnswers {
  /** What the founder is working on, in their own words. Used for the workspace objective. */
  building: string;
  startingPoint: OnboardingStartingPoint;
}

export interface OnboardingPlan {
  startingPoint: OnboardingStartingPoint;
  /** The lifecycle stage the new product starts in. */
  startingStage: StageId;
  /** Stages treated as already visited, in lifecycle order, when starting with an existing product. */
  visitedStages: StageId[];
  /** Whether this plan should create a first product record. */
  createsProduct: boolean;
}

const LIFECYCLE_ORDER: StageId[] = ['Idea', 'Research', 'Planning', 'Design', 'Prototype', 'Testing', 'Launch', 'Improvement'];

/**
 * Derives the concrete starting plan. A founder who names what they are
 * building gets a first product in the matching stage; one who leaves the
 * description empty simply enters the journey with an empty workspace.
 */
export function planOnboarding(answers: Partial<OnboardingAnswers>): OnboardingPlan {
  const startingPoint: OnboardingStartingPoint =
    answers.startingPoint === 'existing' ? 'existing' : 'scratch';
  const startingStage = STARTING_POINT_STAGES[startingPoint];
  const startIndex = LIFECYCLE_ORDER.indexOf(startingStage);
  return {
    startingPoint,
    startingStage,
    visitedStages: startIndex > 0 ? LIFECYCLE_ORDER.slice(0, startIndex) : [],
    createsProduct: Boolean(answers.building?.trim())
  };
}

/** A readable label for where a plan begins, for use in the UI and API responses. */
export function startingPointSummary(startingPoint: OnboardingStartingPoint): string {
  return startingPoint === 'existing'
    ? 'Available from Prototype, with Idea through Design reviewed early.'
    : 'Available from Idea, the first stage of the journey.';
}
