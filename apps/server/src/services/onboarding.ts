import {
  planOnboarding,
  suggestWorkspaceNavigation,
  type OnboardingStartingPoint,
  type OnboardingState,
  type WorkDomain,
  type WorkRequirement
} from '@sv/shared';
import type { Db } from '../db/index.js';

/**
 * Post-registration onboarding.
 *
 * Called once, right after a new account and workspace exist. It:
 *
 *  1. stores the founder's answers on the workspace (so teammates share the
 *     same starting point),
 *  2. saves a workspace setup profile derived from the answer, using the same
 *     conservative domain → navigation mapping the setup page uses,
 *  3. creates the first product when the founder named what they are building,
 *     starting it at the stage their answer implies.
 *
 * Everything here is additive: it inserts the same rows the product and
 * workspace-setup routes would insert, so nothing bypasses validation rules in
 * spirit even though it runs before a session cookie is issued.
 */

export interface OnboardingInput {
  building: string;
  startingPoint: OnboardingStartingPoint;
  /** Optional category for the first product, e.g. "Hardware". */
  category?: string;
}

/** Guesses a work domain from free text so navigation emphasis is sensible. */
export function inferDomain(building: string): WorkDomain {
  const text = building.toLowerCase();
  const rules: [RegExp, WorkDomain][] = [
    [/robot|drone|electronic|circuit|firmware|hardware|device|sensor|iot/, 'hardware'],
    [/app|software|platform|dashboard|api|website|saas|tool/, 'software'],
    [/aerospace|satellite|aircraft|rocket/, 'aerospace'],
    [/research|study|thesis|lab/, 'research'],
    [/service|consult|operations|workflow/, 'service'],
    [/course|student|school|teach|education|class|cohort/, 'education'],
    [/startup|venture|business|company/, 'startup']
  ];
  for (const [pattern, domain] of rules) if (pattern.test(text)) return domain;
  return 'physical';
}

export interface OnboardingResult {
  state: OnboardingState;
  workspaceId: string;
  productId: string | null;
}

export async function applyOnboarding(
  trx: Db,
  input: { workspaceId: string; userId: string; name: string; answers: OnboardingInput }
): Promise<OnboardingResult> {
  const building = input.answers.building.trim();
  const plan = planOnboarding({ building, startingPoint: input.answers.startingPoint });
  const now = new Date();
  const state: OnboardingState = {
    building,
    startingPoint: plan.startingPoint,
    startingStage: plan.startingStage,
    completedAt: now.toISOString()
  };

  await trx.updateTable('workspaces').set({ onboarding: JSON.stringify(state) }).where('id', '=', input.workspaceId).execute();

  // Workspace setup profile: objective + inferred domain + navigation emphasis.
  const domain = inferDomain(building);
  const requirements: WorkRequirement[] = [];
  const navigation = suggestWorkspaceNavigation([domain], requirements);
  const profile = { domains: [domain], objective: building.slice(0, 300), requirements: [], navigation };
  const existingProfile = await trx.selectFrom('workspace_profiles').select('revision').where('workspace_id', '=', input.workspaceId).executeTakeFirst();
  if (!existingProfile) {
    await trx
      .insertInto('workspace_profiles')
      .values({ workspace_id: input.workspaceId, profile: JSON.stringify(profile), revision: 1, updated_by: input.userId, updated_at: now })
      .execute();
  }

  if (!plan.createsProduct) return { state, workspaceId: input.workspaceId, productId: null };

  // First product. This mirrors `POST /api/products`: the same columns, the
  // same stage-history row, and the same base XP award, so the gamified
  // journey starts in a consistent state rather than a special one.
  const productName = building.length > 120 ? `${building.slice(0, 117)}...` : building;
  const product = await trx
    .insertInto('products')
    .values({
      workspace_id: input.workspaceId,
      name: productName,
      category: input.answers.category?.trim() || 'General',
      description: '',
      image_url: '',
      target_price: null,
      stage: plan.startingStage,
      created_by: input.userId,
      updated_at: now
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await trx
    .insertInto('stage_history')
    .values({ product_id: product.id, from_stage: null, to_stage: plan.startingStage, user_id: input.userId })
    .execute();
  // Awarded through the ordinary ledger rules (20 XP, once per product).
  await trx
    .insertInto('xp_events')
    .values({
      workspace_id: input.workspaceId,
      user_id: input.userId,
      product_id: product.id,
      kind: 'product_created',
      ref: product.id,
      points: 20,
      label: `Created ${productName}`
    })
    .onConflict((oc) => oc.columns(['workspace_id', 'user_id', 'kind', 'ref']).doNothing())
    .execute();
  return { state, workspaceId: input.workspaceId, productId: product.id };
}

/** Reads the persisted onboarding answers for a workspace, if any. */
export async function onboardingFor(db: Db, workspaceId: string): Promise<OnboardingState | null> {
  const row = await db.selectFrom('workspaces').select('onboarding').where('id', '=', workspaceId).executeTakeFirst();
  if (!row || !row.onboarding) return null;
  const value = row.onboarding as OnboardingState;
  return value && typeof value === 'object' && value.building !== undefined ? value : null;
}
