import { CONTRIBUTION_CATEGORIES, CONTRIBUTION_DIMENSIONS, CONTRIBUTION_WEIGHTS } from '@sv/shared';
import type { Db } from '../db/index.js';

export async function initializeContributionConfig(trx: Db, workspaceId: string, createdBy: string) {
  await trx.insertInto('contribution_categories').values(
    CONTRIBUTION_CATEGORIES.map((category) => ({
      workspace_id: workspaceId,
      key: category.key,
      name: category.name,
      description: category.name,
      applicable_dimensions: JSON.stringify(CONTRIBUTION_DIMENSIONS),
      created_by: createdBy,
      updated_at: new Date()
    }))
  ).execute();
  await trx.insertInto('contribution_rubrics').values({
    workspace_id: workspaceId,
    version: 'baseline-v1',
    weights: JSON.stringify(CONTRIBUTION_WEIGHTS),
    conversion: 'one_point_per_score_point',
    active: true,
    created_by: createdBy,
    activated_by: createdBy,
    activated_at: new Date()
  }).execute();
}
