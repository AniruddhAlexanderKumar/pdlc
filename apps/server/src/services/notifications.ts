import {
  preferenceFor,
  type StageId,
  type NotificationKind,
  type NotificationPreference
} from '@sv/shared';
import type { Db } from '../db/index.js';

/**
 * Notifications.
 *
 * Delivery is deliberate and narrow: one row per recipient per event, gated by
 * the recipient's own preferences, and never sent to the person who caused it.
 * That keeps the inbox quiet, which the brief asks for explicitly.
 */

export interface NotifyInput {
  workspaceId: string;
  /** Who should see this. Typically the assignee, or a reviewer. */
  recipientIds: string[];
  /** The acting user. Never notified about their own action. */
  actorId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  productId?: string | null;
  activityKey?: string | null;
}

export async function loadPreferences(db: Db, userId: string): Promise<NotificationPreference> {
  const row = await db
    .selectFrom('notification_preferences')
    .select(['assignments', 'reviews', 'blockers', 'stages'])
    .where('user_id', '=', userId)
    .executeTakeFirst();
  // No row means "everything on", so existing accounts behave as before.
  return row ?? { assignments: true, reviews: true, blockers: true, stages: true };
}

export async function savePreferences(db: Db, userId: string, prefs: NotificationPreference): Promise<void> {
  await db
    .insertInto('notification_preferences')
    .values({ user_id: userId, ...prefs, updated_at: new Date() })
    .onConflict((oc) =>
      oc.column('user_id').doUpdateSet({ ...prefs, updated_at: new Date() })
    )
    .execute();
}

/**
 * Writes notifications for everyone who should receive one.
 * Returns how many rows were created, which makes it testable.
 */
export async function notify(db: Db, input: NotifyInput): Promise<number> {
  const recipients = [...new Set(input.recipientIds)].filter((id) => id && id !== input.actorId);
  if (recipients.length === 0) return 0;

  const toggle = preferenceFor(input.kind);
  const allowed: string[] = [];
  for (const userId of recipients) {
    const prefs = await loadPreferences(db, userId);
    if (prefs[toggle]) allowed.push(userId);
  }
  if (allowed.length === 0) return 0;

  await db
    .insertInto('notifications')
    .values(
      allowed.map((userId) => ({
        workspace_id: input.workspaceId,
        user_id: userId,
        kind: input.kind,
        product_id: input.productId ?? null,
        activity_key: input.activityKey ?? null,
        title: input.title,
        body: input.body ?? ''
      }))
    )
    .execute();
  return allowed.length;
}

/** Who can review changes: owners and admins, never the submitter. */
export function reviewersFor(role: string, members: { userId: string; role: string }[], submitterId: string): string[] {
  return members
    .filter((m) => (m.role === 'owner' || m.role === 'admin') && m.userId !== submitterId)
    .map((m) => m.userId);
}

/**
 * Tells whoever was waiting on a prerequisite that it is now satisfied.
 *
 * Derived entirely from the dependency rows: if activity B depends on A and A
 * has just become done, B's owner is notified once. Nothing is sent when A was
 * already done, so a repeated status change cannot spam the team.
 */
export async function notifyUnblocked(
  trx: Db,
  input: {
    workspaceId: string;
    actorId: string;
    productId: string;
    completedKey: string;
    completedLabel: string;
    /** True when the prerequisite was already complete, so nothing is sent. */
    wasAlreadyDone: boolean;
  }
): Promise<void> {
  if (input.wasAlreadyDone) return;
  const dependents = await trx
    .selectFrom('activity_dependencies as d')
    .leftJoin('activity_records as r', (join) =>
      join.onRef('r.activity_key', '=', 'd.activity_key').onRef('r.product_id', '=', 'd.product_id')
    )
    .select(['d.activity_key', 'r.assignee_id'])
    .where('d.product_id', '=', input.productId)
    .where('d.depends_on_key', '=', input.completedKey)
    .execute();
  const recipients = dependents.map((d) => d.assignee_id).filter((id): id is string => Boolean(id));
  if (recipients.length === 0) return;
  // One notification per dependent activity, so the body names what is unblocked.
  for (const dependent of dependents) {
    if (!dependent.assignee_id) continue;
    await notify(trx, {
      workspaceId: input.workspaceId,
      recipientIds: [dependent.assignee_id],
      actorId: input.actorId,
      kind: 'blocker_resolved',
      title: 'A prerequisite is complete',
      body: `“${input.completedLabel}” is done. Review your activity for any remaining blockers.`,
      productId: input.productId,
      activityKey: dependent.activity_key
    });
  }
}

/**
 * Notifies the team when a stage completes. Exported for the product route so
 * the transition and the notification happen in the same transaction.
 */
export async function notifyStageCompleted(
  trx: Db,
  input: { workspaceId: string; actorId: string; productId: string; productName: string; stage: StageId }
): Promise<void> {
  const members = await trx
    .selectFrom('memberships')
    .select(['user_id'])
    .where('workspace_id', '=', input.workspaceId)
    .execute();
  await notify(trx, {
    workspaceId: input.workspaceId,
    recipientIds: members.map((m) => m.user_id),
    actorId: input.actorId,
    kind: 'stage_completed',
    title: `${input.stage} completed`,
    body: `${input.productName} moved past ${input.stage}.`,
    productId: input.productId
  });
}
