import { db } from '../db/index.js';

/** Delete only explicitly marked, expired demo workspaces and their guest users. */
export async function cleanupExpiredDemos(now = new Date()) {
  await db.transaction().execute(async (trx) => {
    const expired = await trx.selectFrom('demo_guests').select(['user_id', 'workspace_id']).where('expires_at', '<=', now).forUpdate().execute();
    if (!expired.length) return;
    await trx.deleteFrom('analytics_events').where('workspace_id', 'in', expired.map((d) => d.workspace_id)).execute();
    // The marker cascades when the workspace is deleted; retain the selected IDs.
    await trx.deleteFrom('workspaces').where('id', 'in', expired.map((d) => d.workspace_id)).execute();
    await trx.deleteFrom('users').where('id', 'in', expired.map((d) => d.user_id)).execute();
  });
}
