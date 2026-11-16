import { requiresApproval, type ActivityBlocker, type ActivityRecord, type ActivityState } from './activity.js';
import { stageQuest } from './gamification.js';
import type { Journey, StageJourneyActivity, JourneyStage } from './journey.js';
import { getStage, stageIndex, type StageId } from './stages.js';
import type { Material, Product } from './types.js';

/**
 * Contextual next-action recommendations and dependency/blocker resolution.
 *
 * Every recommendation is grounded in real product data: an unanswered required
 * question, an unfinished quest item, a task that is overdue or blocked, or a
 * dependency that has not been satisfied. Nothing here invents priorities, and
 * nothing redefines completion — `stageQuest()` remains the source of truth.
 */

export type RecommendationReason =
  | 'blocked_task'
  | 'overdue_task'
  | 'awaiting_changes'
  | 'needs_review'
  | 'blocked_activity'
  | 'dependency_blocked'
  | 'required_incomplete'
  | 'optional_incomplete';

export interface Recommendation {
  /** Stable key, so the UI can highlight and de-duplicate. */
  id: string;
  stage: StageId;
  stageLabel: string;
  activityKey: string;
  label: string;
  /** Why this activity matters, in the user's words. */
  why: string;
  reason: RecommendationReason;
  /** Plain-English explanation of why this one is first. */
  because: string;
  assigneeId: string | null;
  assigneeName: string | null;
  /** Completed-but-unapproved activities count here. */
  awaitingApproval: boolean;
  /** 0 = most urgent. */
  priority: number;
}

/** Ranked so the first item is always the most defensible next action. */
const REASON_PRIORITY: Record<RecommendationReason, number> = {
  blocked_task: 0,
  overdue_task: 1,
  awaiting_changes: 2,
  needs_review: 3,
  blocked_activity: 4,
  dependency_blocked: 5,
  required_incomplete: 6,
  // Never outrank real work; only offered when nothing is outstanding.
  optional_incomplete: 7
};

const REASON_BECAUSE: Record<RecommendationReason, string> = {
  blocked_task: 'A task is blocked, so this work cannot move until it is unblocked.',
  overdue_task: 'This task is past its due date.',
  awaiting_changes: 'A reviewer asked for changes, so this needs your attention.',
  needs_review: 'Finished work is waiting for someone to review it.',
  blocked_activity: 'This activity is marked blocked.',
  dependency_blocked: 'Something this depends on is not finished yet.',
  required_incomplete: 'This is the next required step in the current stage.',
  optional_incomplete: 'Everything required is done — this is a useful extra.'
};

/** Tasks the recommendation engine understands. Mirrors the product task shape. */
export interface RecommenderTask {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
}

export interface RecommendationInput {
  product: Product;
  journey: Journey;
  materials?: Map<string, Material>;
  /** Activity records, keyed by activity key. */
  records?: Record<string, ActivityRecord>;
  /** Dependencies: activityKey -> keys it depends on. */
  dependencies?: Record<string, string[]>;
  /** Activity lookup for labels, when a prerequisite lives in another stage. */
  allActivities?: StageJourneyActivity[];
  /** Injected so results are deterministic in tests and stable in the UI. */
  now?: Date;
}

function activityDone(activity: StageJourneyActivity, record: ActivityRecord | undefined): boolean {
  if (!activity.done) return false;
  // An activity requiring approval only counts once approved. This is the one
  // rule that can make a "done" activity not done, and it is enforced from the
  // review state rather than by overwriting `stageQuest()`.
  if (requiresApproval(activity.id)) {
    return record?.reviewState === 'approved';
  }
  return true;
}

/** True when a dependency is satisfied, i.e. the prerequisite is genuinely done. */
function isSatisfied(key: string, activities: Map<string, StageJourneyActivity>, records: Record<string, ActivityRecord>): boolean {
  const activity = activities.get(key);
  if (!activity) {
    // Unknown keys are treated as satisfied rather than silently blocking work
    // forever after an activity is renamed or removed.
    return true;
  }
  return activityDone(activity, records[key]);
}

/** Resolves blockers for one activity from its declared dependencies. */
export function blockersFor(
  activityKey: string,
  dependencies: Record<string, string[]>,
  allActivities: StageJourneyActivity[],
  records: Record<string, ActivityRecord> = {},
  index: Map<string, StageId> = new Map()
): ActivityBlocker[] {
  const deps = dependencies[activityKey] ?? [];
  if (deps.length === 0) return [];
  const byKey = new Map(allActivities.map((a) => [a.id, a]));
  const blockers: ActivityBlocker[] = [];
  for (const dep of deps) {
    if (isSatisfied(dep, byKey, records)) continue;
    const activity = byKey.get(dep);
    if (!activity) continue;
    const stage = stageOfActivity(dep, index);
    blockers.push({
      activityKey,
      blockedByKey: dep,
      blockedByLabel: activity.label,
      blockedByStage: stage,
      resolution: activity.kind === 'question'
        ? `Answer “${activity.label}” in ${getStage(stage).label} first.`
        : `Complete “${activity.label}” in ${getStage(stage).label} first.`
    });
  }
  return blockers;
}

/** Builds an activity → stage index. Pure; no module state. */
export function indexActivityStages(journey: Journey): Map<string, StageId> {
  const index = new Map<string, StageId>();
  for (const stage of journey.stages) {
    for (const activity of stage.activities) index.set(activity.id, stage.id);
  }
  return index;
}

/** Question keys are `<stage>.<name>`, so the prefix identifies the stage. */
const STAGE_BY_PREFIX: Record<string, StageId> = {
  idea: 'Idea',
  research: 'Research',
  planning: 'Planning',
  design: 'Design',
  prototype: 'Prototype',
  testing: 'Testing',
  launch: 'Launch',
  improve: 'Improvement',
  retired: 'Retired'
};

function stageOfActivity(key: string, index: Map<string, StageId>): StageId {
  const mapped = index.get(key);
  if (mapped) return mapped;
  return STAGE_BY_PREFIX[key.split('.')[0] ?? ''] ?? 'Idea';
}

/** Builds the full collaboration state for one activity. */
export function activityState(
  activity: StageJourneyActivity,
  record: ActivityRecord | undefined,
  blockers: ActivityBlocker[],
  commentCount = 0
): ActivityState {
  const status = record?.status ?? 'not_started';
  const reviewState = record?.reviewState ?? 'none';
  return {
    activityKey: activity.id,
    status,
    statusLabel: status === 'not_started' ? 'Not started' : status === 'in_progress' ? 'In progress' : status === 'needs_review' ? 'Needs review' : status === 'completed' ? 'Completed' : 'Blocked',
    assigneeId: record?.assigneeId ?? null,
    assigneeName: record?.assigneeName ?? null,
    reviewState,
    reviewLabel: reviewState === 'none' ? 'No review needed' : reviewState === 'pending' ? 'Awaiting review' : reviewState === 'approved' ? 'Approved' : 'Changes requested',
    awaitingApproval: requiresApproval(activity.id) && activity.done && reviewState !== 'approved',
    completedBy: record?.completedBy ?? null,
    completedByName: record?.completedByName ?? null,
    completedAt: record?.completedAt ?? null,
    reviewNote: record?.reviewNote ?? null,
    blockers,
    commentCount
  };
}

function isPastDue(dueDate: string | null, now: Date): boolean {
  if (!dueDate) return false;
  const due = Date.parse(dueDate);
  if (Number.isNaN(due)) return false;
  // Compare whole days so a task due today is not reported as overdue.
  return due < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/**
 * Builds a ranked list of next actions. The first entry is what the UI shows as
 * "the" next action; the rest are available for an optional short list.
 */
export function recommendNextActions(input: RecommendationInput): Recommendation[] {
  const { journey, records = {}, dependencies = {}, now = new Date() } = input;
  const index = indexActivityStages(journey);
  const allActivities = journey.stages.flatMap((s) => s.activities);
  const out: Recommendation[] = [];

  const push = (stage: JourneyStage, activity: StageJourneyActivity, reason: RecommendationReason) => {
    const record = records[activity.id];
    out.push({
      id: `${reason}:${activity.id}`,
      stage: stage.id,
      stageLabel: stage.label,
      activityKey: activity.id,
      label: activity.label,
      why: activity.why,
      reason,
      because: REASON_BECAUSE[reason],
      assigneeId: record?.assigneeId ?? null,
      assigneeName: record?.assigneeName ?? null,
      awaitingApproval: requiresApproval(activity.id) && activity.done && record?.reviewState !== 'approved',
      priority: REASON_PRIORITY[reason]
    });
  };

  for (const stage of journey.stages) {
    // Locked stages cannot be worked on, so they never produce a recommendation.
    if (stage.state === 'locked') continue;
    // Retired is off the happy path: finishing the journey must never suggest
    // retiring the product the user just completed.
    if (stage.id === 'Retired') continue;
    for (const activity of stage.activities) {
      const record = records[activity.id];
      const done = activityDone(activity, record);
      const blockers = blockersFor(activity.id, dependencies, allActivities, records, index);
      const blocked = blockers.length > 0 || record?.status === 'blocked';

      // A reviewer's request for changes outranks everything except a hard
      // blocker, even when the activity was previously marked done.
      if (record?.reviewState === 'changes_requested') {
        push(stage, activity, 'awaiting_changes');
        continue;
      }
      // A sign-off that has been submitted is waiting on a reviewer, and is
      // recommended ahead of new work.
      if (activity.done && requiresApproval(activity.id) && record?.reviewState === 'pending') {
        push(stage, activity, 'needs_review');
        continue;
      }
      // A sign-off whose content is filled in but was never submitted counts as
      // done for now: the reviewer is not the bottleneck, so it must not be
      // recommended as outstanding work. `journey.complete` still waits for
      // approval (see buildJourney's approval gate).
      if (activity.done && requiresApproval(activity.id)) continue;
      if (done) continue;
      if (blocked) {
        // An unanswered prerequisite is the real next action, not this one.
        if (blockers.length > 0) push(stage, activity, 'dependency_blocked');
        else push(stage, activity, 'blocked_activity');
        continue;
      }
      push(stage, activity, activity.required ? 'required_incomplete' : 'optional_incomplete');
    }
  }

  // Tasks feed in as blockers/overdue signals, but never duplicate an activity.
  const tasks = (input.product.tasks ?? []) as unknown as RecommenderTask[];
  const blockedTasks = tasks.filter((t) => t.status !== 'done' && t.status === 'blocked');
  const overdue = tasks.filter((t) => t.status !== 'done' && isPastDue(t.dueDate, now));
  const current = journey.current;
  for (const task of blockedTasks.slice(0, 3)) {
    out.push({
      id: `blocked_task:${task.id}`,
      stage: current.id,
      stageLabel: current.label,
      activityKey: `task:${task.id}`,
      label: `Unblock “${task.title}”`,
      why: 'A blocked task is stopping work in this stage.',
      reason: 'blocked_task',
      because: REASON_BECAUSE.blocked_task,
      assigneeId: null,
      assigneeName: null,
      awaitingApproval: false,
      priority: REASON_PRIORITY.blocked_task
    });
  }
  for (const task of overdue.slice(0, 3)) {
    out.push({
      id: `overdue_task:${task.id}`,
      stage: current.id,
      stageLabel: current.label,
      activityKey: `task:${task.id}`,
      label: `Finish “${task.title}”`,
      why: `Due ${task.dueDate}.`,
      reason: 'overdue_task',
      because: REASON_BECAUSE.overdue_task,
      assigneeId: null,
      assigneeName: null,
      awaitingApproval: false,
      priority: REASON_PRIORITY.overdue_task
    });
  }

  // Optional extras are a nicety, not a to-do. When the journey is complete and
  // nothing is blocked or overdue, there is genuinely nothing to recommend.
  const hasRealWork = out.some((r) => r.reason !== 'optional_incomplete');
  if (!hasRealWork) return [];

  // Stable ordering: priority, then stage order, then label, so the result is
  // deterministic and never reshuffles between renders.
  out.sort(
    (a, b) =>
      a.priority - b.priority ||
      stageIndex(a.stage) - stageIndex(b.stage) ||
      a.label.localeCompare(b.label)
  );

  // Only one entry per activity key — the highest-priority reason wins.
  const seen = new Set<string>();
  return out.filter((r) => {
    if (seen.has(r.activityKey)) return false;
    seen.add(r.activityKey);
    return true;
  });
}

/**
 * Recomputes a stage's completion with approval rules applied on top of
 * `stageQuest()`.
 *
 * `stageQuest()` decides whether requirements are satisfied; this only explains
 * an additional gate for activities that need sign-off. It never adds its own
 * requirements and never marks something complete that `stageQuest()` calls
 * incomplete.
 */
export function stageQuestWithApprovals(
  product: Product,
  materials: Map<string, Material>,
  stage: StageId,
  records: Record<string, ActivityRecord>
): { questComplete: boolean; blockedByApproval: string[] } {
  const quest = stageQuest(product, materials, stage);
  const blockedByApproval = Object.keys(records)
    .filter((key) => requiresApproval(key) && records[key]?.reviewState === 'pending')
    .map((key) => key);
  return { questComplete: quest.complete && blockedByApproval.length === 0, blockedByApproval };
}
