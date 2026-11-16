import type { ActivityRecord, ActivityStatus, ReviewState, TeamContribution } from '@sv/shared';
import type { Db } from '../db/index.js';

/**
 * Read/write helpers for activity collaboration metadata.
 *
 * Journey activities are derived, so this module only manages the surrounding
 * metadata. It never stores a "completed" flag that could disagree with
 * `stageQuest()`.
 */

export interface LoadedCollaboration {
  records: Record<string, ActivityRecord>;
  /** activityKey -> prerequisite keys */
  dependencies: Record<string, string[]>;
  commentCounts: Record<string, number>;
}

/** Loads all collaboration data for one product in three queries. */
export async function loadCollaboration(db: Db, productId: string): Promise<LoadedCollaboration> {
  const [records, deps, comments] = await Promise.all([
    db
      .selectFrom('activity_records as r')
      .leftJoin('users as assignee', 'assignee.id', 'r.assignee_id')
      .leftJoin('users as completer', 'completer.id', 'r.completed_by')
      .leftJoin('users as reviewer', 'reviewer.id', 'r.reviewed_by')
      .select([
        'r.activity_key',
        'r.status',
        'r.assignee_id',
        'assignee.name as assignee_name',
        'r.review_state',
        'r.review_requested_at',
        'r.reviewed_by',
        'reviewer.name as reviewer_name',
        'r.reviewed_at',
        'r.review_note',
        'r.started_at',
        'r.completed_at',
        'r.completed_by',
        'completer.name as completed_by_name',
        'r.updated_at'
      ])
      .where('r.product_id', '=', productId)
      .execute(),
    db
      .selectFrom('activity_dependencies')
      .select(['id', 'activity_key', 'depends_on_key'])
      .where('product_id', '=', productId)
      .execute(),
    db
      .selectFrom('activity_comments')
      .select(['activity_key'])
      .where('product_id', '=', productId)
      .execute()
  ]);

  const out: LoadedCollaboration = { records: {}, dependencies: {}, commentCounts: {} };
  for (const r of records) {
    out.records[r.activity_key] = {
      activityKey: r.activity_key,
      status: r.status as ActivityStatus,
      assigneeId: r.assignee_id,
      assigneeName: r.assignee_name ?? null,
      reviewState: r.review_state as ReviewState,
      reviewRequestedAt: r.review_requested_at ? r.review_requested_at.toISOString() : null,
      reviewedBy: r.reviewed_by,
      reviewedByName: r.reviewer_name ?? null,
      reviewedAt: r.reviewed_at ? r.reviewed_at.toISOString() : null,
      reviewNote: r.review_note,
      startedAt: r.started_at ? r.started_at.toISOString() : null,
      completedAt: r.completed_at ? r.completed_at.toISOString() : null,
      completedBy: r.completed_by,
      completedByName: r.completed_by_name ?? null,
      updatedAt: r.updated_at.toISOString()
    };
  }
  for (const d of deps) {
    (out.dependencies[d.activity_key] ??= []).push(d.depends_on_key);
  }
  for (const c of comments) {
    out.commentCounts[c.activity_key] = (out.commentCounts[c.activity_key] ?? 0) + 1;
  }
  return out;
}

export interface RecordPatch {
  status?: ActivityStatus;
  assigneeId?: string | null;
  reviewState?: ReviewState;
  reviewRequestedAt?: Date | null;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  reviewNote?: string;
  startedAt?: Date | null;
  completedAt?: Date | null;
  completedBy?: string | null;
}

/** Upserts a metadata row. The activity key is trusted only after route validation. */
export async function upsertRecord(db: Db, productId: string, activityKey: string, patch: RecordPatch): Promise<void> {
  const values = {
    product_id: productId,
    activity_key: activityKey,
    ...patch,
    updated_at: new Date()
  };
  await db
    .insertInto('activity_records')
    .values({
      product_id: productId,
      activity_key: activityKey,
      status: patch.status ?? 'not_started',
      assignee_id: patch.assigneeId ?? null,
      review_state: patch.reviewState ?? 'none',
      review_requested_at: patch.reviewRequestedAt ?? null,
      reviewed_by: patch.reviewedBy ?? null,
      reviewed_at: patch.reviewedAt ?? null,
      review_note: patch.reviewNote ?? '',
      started_at: patch.startedAt ?? null,
      completed_at: patch.completedAt ?? null,
      completed_by: patch.completedBy ?? null,
      updated_at: new Date()
    })
    .onConflict((oc) => oc.columns(['product_id', 'activity_key']).doUpdateSet(values))
    .execute();
}

/**
 * Team contribution for a product.
 *
 * Deliberately descriptive: counts of work by state, with no score, ratio or
 * ranking. The brief is explicit that this is accountability, not surveillance.
 */
export async function teamContribution(
  db: Db,
  workspaceId: string,
  productId: string
): Promise<TeamContribution[]> {
  const members = await db
    .selectFrom('memberships as m')
    .innerJoin('users as u', 'u.id', 'm.user_id')
    .select(['u.id', 'u.name', 'm.role'])
    .where('m.workspace_id', '=', workspaceId)
    .orderBy('u.name')
    .execute();

  const records = await db
    .selectFrom('activity_records')
    .select(['assignee_id', 'status'])
    .where('product_id', '=', productId)
    .where('assignee_id', 'is not', null)
    .execute();

  return members.map((m) => {
    const mine = records.filter((r) => r.assignee_id === m.id);
    const count = (s: ActivityStatus) => mine.filter((r) => r.status === s).length;
    return {
      userId: m.id,
      name: m.name,
      role: m.role,
      assigned: mine.length,
      completed: count('completed'),
      inProgress: count('in_progress'),
      needsReview: count('needs_review'),
      blocked: count('blocked'),
      notStarted: count('not_started')
    };
  });
}

/** True when the user belongs to the workspace. Guards assignment targets. */
export async function isWorkspaceMember(db: Db, workspaceId: string, userId: string): Promise<boolean> {
  const row = await db
    .selectFrom('memberships')
    .select(['user_id'])
    .where('workspace_id', '=', workspaceId)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  return Boolean(row);
}
