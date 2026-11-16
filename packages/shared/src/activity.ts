import type { StageId } from './stages.js';

/**
 * Activity collaboration model (iteration 2).
 *
 * Journey activities are derived from existing data, so this module only adds
 * *metadata* around them: who owns them, what state they are in, what blocks
 * them. Completion itself is still decided by `stageQuest()`; nothing here can
 * override it.
 */

export const ACTIVITY_STATUSES = ['not_started', 'in_progress', 'needs_review', 'completed', 'blocked'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const REVIEW_STATES = ['none', 'pending', 'approved', 'changes_requested'] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  needs_review: 'Needs review',
  completed: 'Completed',
  blocked: 'Blocked'
};

export const REVIEW_STATE_LABELS: Record<ReviewState, string> = {
  none: 'No review needed',
  pending: 'Awaiting review',
  approved: 'Approved',
  changes_requested: 'Changes requested'
};

/**
 * Whether an activity can only count once someone has approved it.
 *
 * Deliberately narrow: only activities that represent a *decision or sign-off*
 * require approval. Requiring review on every question would turn a guided
 * journey into a bureaucracy, which the brief explicitly warns against.
 */
export const APPROVAL_REQUIRED_ACTIVITIES: readonly string[] = [
  'research.validated',
  'design.must_haves',
  'testing.criteria'
];

export function requiresApproval(activityKey: string): boolean {
  return APPROVAL_REQUIRED_ACTIVITIES.includes(activityKey);
}

export interface ActivityRecord {
  activityKey: string;
  status: ActivityStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  reviewState: ReviewState;
  /** Present only while `reviewState === 'pending'`. */
  reviewRequestedAt: string | null;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  startedAt: string | null;
  completedAt: string | null;
  completedBy: string | null;
  completedByName: string | null;
  updatedAt: string;
}

export interface ActivityComment {
  id: string;
  activityKey: string;
  userId: string | null;
  userName: string | null;
  body: string;
  createdAt: string;
}

export interface ActivityDependency {
  id: string;
  activityKey: string;
  dependsOnKey: string;
}

/** A dependency that is not yet satisfied, resolved into something readable. */
export interface ActivityBlocker {
  activityKey: string;
  /** The prerequisite that is holding this activity up. */
  blockedByKey: string;
  /** Plain-English name of the prerequisite. */
  blockedByLabel: string;
  /** Which stage the prerequisite belongs to. */
  blockedByStage: StageId;
  /** What the user can do about it. */
  resolution: string;
}

/** Everything the UI needs about one activity's collaboration state. */
export interface ActivityState {
  activityKey: string;
  status: ActivityStatus;
  statusLabel: string;
  assigneeId: string | null;
  assigneeName: string | null;
  reviewState: ReviewState;
  reviewLabel: string;
  /** True when approval is required but not yet granted. */
  awaitingApproval: boolean;
  completedBy: string | null;
  completedByName: string | null;
  completedAt: string | null;
  /** Reviewer feedback, shown to the author when changes were requested. */
  reviewNote: string | null;
  blockers: ActivityBlocker[];
  commentCount: number;
}

// ── Notifications ─────────────────────────────────────────────────────────

export const NOTIFICATION_KINDS = [
  'activity_assigned',
  'activity_reassigned',
  'review_requested',
  'review_approved',
  'review_changes_requested',
  'blocker_resolved',
  'stage_completed'
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  productId: string | null;
  activityKey: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationPreference {
  assignments: boolean;
  reviews: boolean;
  blockers: boolean;
  stages: boolean;
}

/** Which preference toggle governs a given notification kind. */
export function preferenceFor(kind: NotificationKind): keyof NotificationPreference {
  switch (kind) {
    case 'activity_assigned':
    case 'activity_reassigned':
      return 'assignments';
    case 'review_requested':
    case 'review_approved':
    case 'review_changes_requested':
      return 'reviews';
    case 'blocker_resolved':
      return 'blockers';
    case 'stage_completed':
      return 'stages';
  }
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreference = {
  assignments: true,
  reviews: true,
  blockers: true,
  stages: true
};

/** Accountabilities shown in the team contribution panel. */
export interface TeamContribution {
  userId: string;
  name: string;
  role: string;
  assigned: number;
  completed: number;
  inProgress: number;
  needsReview: number;
  blocked: number;
  /** Assigned but not yet started — the "outstanding responsibilities". */
  notStarted: number;
}
