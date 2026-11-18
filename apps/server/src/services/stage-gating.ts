import { questionsForStage, requiresApproval, stageQuest, STAGE_IDS, stageIndex, type Material, type Product, type ReviewState, type StageId } from '@sv/shared';

/**
 * Stage transition gating.
 *
 * Pure and dependency-free so it can be unit tested without a database. The web
 * app renders lock states from the same rules via `buildJourney`, and this module
 * is the authority the API enforces.
 */

export type TransitionVerdict = { allowed: true } | { allowed: false; reason: string; missing: string[] };

/**
 * Stages this product is grandfathered into.
 *
 * A product is grandfathered up to the further of its current stage and its
 * recorded `legacyStage` (the position it held when gating shipped). Retired is
 * included so an archived product is never frozen out of its own record.
 */
export function grandfatheredThrough(product: Pick<Product, 'stage' | 'legacyStage'>): number {
  const current = stageIndex(product.stage);
  const legacy = product.legacyStage ? stageIndex(product.legacyStage) : -1;
  return Math.max(current, legacy);
}

export function isGrandfathered(product: Pick<Product, 'stage' | 'legacyStage'>, to: StageId): boolean {
  return stageIndex(to) <= grandfatheredThrough(product);
}

/**
 * Whether `product` may move from its current stage to `to`.
 *
 * Rules, in order:
 *  1. Same stage is a no-op and always allowed.
 *  2. Moving backwards is always allowed — revisiting a completed stage is part
 *     of the journey and cannot lose progress.
 *  3. Retiring is always allowed: you may need to archive a product without
 *     finishing its checklist.
 *  4. Grandfathered stages stay reachable, so existing products are not frozen.
 *  5. Otherwise forward movement requires the current stage's quest to be
 *     complete. Missing items are returned so the UI can name them.
 */
export function canTransition(
  product: Pick<Product, 'stage' | 'legacyStage' | 'productKind' | 'answers' | 'description' | 'targetSellingPrice' | 'costs' | 'materials' | 'tasks'>,
  to: StageId,
  materials: Map<string, Material>,
  /** Review state of sign-off activities, keyed by activity key. */
  approvals: Record<string, ReviewState> = {}
): TransitionVerdict {
  const from = product.stage;
  if (from === to) return { allowed: true };
  if (!STAGE_IDS.includes(to)) return { allowed: false, reason: 'That is not a lifecycle stage.', missing: [] };

  if (stageIndex(to) < stageIndex(from)) return { allowed: true };
  if (to === 'Retired') return { allowed: true };
  if (isGrandfathered(product, to)) return { allowed: true };

  const quest = stageQuest({ ...product, approvalStates: undefined } as Product, materials, from);
  if (!quest.complete) {
    const missing = quest.items.filter((i) => !i.done).map((i) => i.label);
    const reason = missing.length
      ? `Finish ${from} before moving on. Still to do: ${missing.join('; ')}.`
      : `Finish ${from} before moving on.`;
    return { allowed: false, reason, missing };
  }

  // The quest is satisfied, but an activity that needs sign-off is only complete
  // once approved. Without this the API would let a stage advance on unapproved
  // work, which would make the review workflow advisory.
  const unapproved = questionsForStage(from, product.productKind)
    .filter((q) => q.required && requiresApproval(q.key) && approvals[q.key] !== 'approved')
    .map((q) => q.prompt);
  if (unapproved.length > 0) {
    return {
      allowed: false,
      reason: `Finish ${from} before moving on. Waiting for approval: ${unapproved.join('; ')}.`,
      missing: unapproved
    };
  }
  return { allowed: true };

}
