import { isAnswered, questionsForStage } from './questions.js';
import { stageQuest } from './gamification.js';
import { STAGES, STAGE_IDS, getStage, nextStage, stageIndex, type PhaseId, type StageId } from './stages.js';
import type { Material, Product } from './types.js';
import { requiresApproval, type ActivityRecord, type ActivityBlocker, type ActivityState } from './activity.js';

/**
 * The product journey.
 *
 * This is a *presentation* model. It never redefines the lifecycle: every stage,
 * question and completion rule comes from `stages.ts`, `questions.ts` and
 * `gamification.ts`. A stage's `complete` flag is read straight from
 * `stageQuest()`, the same function the server uses to gate transitions, so the
 * journey can never claim a stage is finished when the backend disagrees.
 */

export type StageState = 'completed' | 'current' | 'available' | 'locked';

export interface StageGuide {
  /** "What is this stage?" — one plain-English sentence. */
  purpose: string;
  /** "Why does this matter?" — one plain-English sentence. */
  why: string;
}

/**
 * Guides for all nine lifecycle stages. `Retired` is included because the stage
 * exists in the domain model, but it is presented off the main path.
 */
export const STAGE_GUIDES: Record<StageId, StageGuide> = {
  Idea: {
    purpose: 'Capture the product idea and the problem it solves.',
    why: 'A clear problem and audience is what every later stage builds on.'
  },
  Research: {
    purpose: 'Understand the market, the competitors and the people who will buy it.',
    why: 'You avoid building something nobody wants, and you learn what to charge.'
  },
  Planning: {
    purpose: 'Decide the price, the margin, the batch size and the launch date.',
    why: 'Numbers turn an idea into something you can actually budget for.'
  },
  Design: {
    purpose: 'Work out the features, materials and specifications.',
    why: 'The bill of materials here is what makes your cost per unit real.'
  },
  Prototype: {
    purpose: 'Build a first version and see what it teaches you.',
    why: 'A rough prototype finds problems while they are still cheap to fix.'
  },
  Testing: {
    purpose: 'Check that the product works, holds up and is safe to sell.',
    why: 'Testing catches the failures that would otherwise become returns.'
  },
  Launch: {
    purpose: 'Get the product finished, priced and in front of customers.',
    why: 'Launch turns all your preparation into revenue and real feedback.'
  },
  Improvement: {
    purpose: 'Learn from sales and feedback and decide what to change next.',
    why: 'Each batch is a chance to raise the margin or fix the top complaint.'
  },
  Retired: {
    purpose: 'Record why the product is no longer being made.',
    why: 'Keeping the reason keeps your history useful for future products.'
  }
};

/** Why a checklist step matters, in the user's words. */
const STEP_WHY: Record<string, string> = {
  questions: 'These answers give the checklist and your teammates the full picture.',
  description: 'A one-line description is the first thing anyone reads about this product.',
  task: 'A research task is how you turn “I think” into “I checked”.',
  price: 'Without a price you cannot work out profit or margin.',
  tasks: 'Three or more tasks means the work is broken down enough to start.',
  bom: 'Every material you add makes the unit cost more accurate.',
  costs: 'Labour, packaging and overhead are what your materials do not cover.',
  margin: 'A healthy margin is what makes the product worth continuing to build.',
  next_batch: 'Naming one improvement turns feedback into a plan.',
  retire_reason: 'A recorded reason means this product’s history is still useful later.'
};

const STEP_WHY_FALLBACK = 'Finishing this step moves the stage forward and earns XP.';

export interface StageJourneyActivity {
  id: string;
  /** Plain-English instruction. */
  label: string;
  /** Why completing it helps. */
  why: string;
  done: boolean;
  /** Only required activities gate the stage. */
  required: boolean;
  kind: 'question' | 'action';
  /** Present when `kind === 'question'`; used for deep links. */
  questionKey?: string;
  /** Which product tab completes this activity. */
  tab: 'discover' | 'overview' | 'materials' | 'costs' | 'tasks';
  /** XP earned the first time this is completed, when known. */
  xp: number;
  /**
   * Collaboration metadata, when the caller supplied it. Absent means "no
   * ownership recorded", which keeps `buildJourney(product)` working exactly as
   * before for existing callers and tests.
   */
  collaboration?: ActivityState;
}

export interface JourneyStage {
  id: StageId;
  label: string;
  phase: PhaseId;
  index: number;
  guide: StageGuide;
  state: StageState;
  /** Plain-English reason the stage is locked, else null. */
  lockReason: string | null;
  activities: StageJourneyActivity[];
  /** Required activities completed. */
  done: number;
  /** Required activities in total. */
  total: number;
  /** 0–100, based on required activities. */
  progress: number;
  /** Matches `stageQuest().complete` exactly, plus the approval gate. */
  complete: boolean;
  /** Activities that are filled in but await sign-off, so they do not count. */
  pendingApproval?: string[];
}

export interface NextActivity {
  stage: StageId;
  activity: StageJourneyActivity;
}

export interface Journey {
  /** All nine stages, in lifecycle order. */
  stages: JourneyStage[];
  /** The eight progressive stages (excludes Retired, which is off-path). */
  path: JourneyStage[];
  retired: JourneyStage;
  current: JourneyStage;
  currentIndex: number;
  /** 0–100 across the eight path stages. */
  overallPercent: number;
  completedCount: number;
  totalCount: number;
  /** The single most useful next thing to do, or null when everything is done. */
  nextActivity: NextActivity | null;
  /** The stage that follows the current one, or null at the end of the path. */
  nextStageId: StageId | null;
  /** True when every path stage is complete. */
  isComplete: boolean;
}

function activitiesForStage(product: Product, stage: StageId, materials: Map<string, Material>): StageJourneyActivity[] {
  const quest = stageQuest(product, materials, stage);
  const questions = questionsForStage(stage);

  const questionActivities: StageJourneyActivity[] = questions.map((q) => ({
    id: q.key,
    label: q.prompt,
    why: q.help ?? STEP_WHY.questions,
    done: isAnswered(product.answers[q.key]),
    required: q.required,
    kind: 'question' as const,
    questionKey: q.key,
    tab: 'discover' as const,
    xp: q.xp
  }));

  // Everything the quest tracks that is not the aggregate "answer the questions"
  // step or an already-listed question. Keeps the two systems from double counting.
  const questionKeys = new Set(questions.map((q) => q.key));
  const actionActivities: StageJourneyActivity[] = quest.items
    .filter((item) => item.id !== 'questions' && !questionKeys.has(item.id))
    .map((item) => ({
      id: item.id,
      label: item.label,
      why: STEP_WHY[item.id] ?? STEP_WHY_FALLBACK,
      done: item.done,
      required: true,
      kind: 'action' as const,
      tab: item.tab,
      xp: 0
    }));

  return [...questionActivities, ...actionActivities];
}

/**
 * Attaches ownership/status/blockers to activities, when the caller has them.
 *
 * `allActivities` is the flat list across every stage, which blockers need in
 * order to resolve a prerequisite that lives in a different stage.
 */
function attachCollaboration(
  activities: StageJourneyActivity[],
  collab: BuildJourneyCollaboration | undefined,
  allActivities: StageJourneyActivity[]
): StageJourneyActivity[] {
  if (!collab) return activities;
  return activities.map((a) => {
    const record = collab.records[a.id];
    const blockers = collab.blockersFor ? collab.blockersFor(a.id, allActivities, collab.records) : [];
    return {
      ...a,
      collaboration: {
        activityKey: a.id,
        status: record?.status ?? 'not_started',
        statusLabel: record?.status === 'in_progress' ? 'In progress' : record?.status === 'needs_review' ? 'Needs review' : record?.status === 'completed' ? 'Completed' : record?.status === 'blocked' ? 'Blocked' : 'Not started',
        assigneeId: record?.assigneeId ?? null,
        assigneeName: record?.assigneeName ?? null,
        reviewState: record?.reviewState ?? 'none',
        reviewLabel: record?.reviewState === 'pending' ? 'Awaiting review' : record?.reviewState === 'approved' ? 'Approved' : record?.reviewState === 'changes_requested' ? 'Changes requested' : 'No review needed',
        awaitingApproval: requiresApproval(a.id) && a.done && (record?.reviewState ?? 'none') !== 'approved',
        completedBy: record?.completedBy ?? null,
        completedByName: record?.completedByName ?? null,
        completedAt: record?.completedAt ?? null,
        reviewNote: record?.reviewNote ?? null,
        blockers,
        commentCount: collab.commentCounts?.[a.id] ?? 0
      }
    };
  });
}

function stageStateFor(
  index: number,
  currentIndex: number,
  currentComplete: boolean,
  unlockedThrough: number
): StageState {
  if (index < currentIndex) return 'completed';
  if (index === currentIndex) return 'current';
  // Reached before (grandfathering) or the next one after a finished stage.
  if (index <= unlockedThrough) return 'available';
  if (index === currentIndex + 1 && currentComplete) return 'available';
  return 'locked';
}

function lockReasonFor(stage: StageId): string {
  const previous = STAGE_IDS[stageIndex(stage) - 1];
  if (!previous) return 'Finish the previous stage to unlock this one.';
  return `Finish ${getStage(previous).label} to unlock ${getStage(stage).label}.`;
}

export interface BuildJourneyCollaboration {
  records: Record<string, ActivityRecord>;
  /** Resolves blockers for an activity. Injected to keep this module pure. */
  blockersFor?: (activityKey: string, allActivities: StageJourneyActivity[], records: Record<string, ActivityRecord>) => ActivityBlocker[];
  /**
   * Optional pre-computed activity list. `buildJourney` now derives this itself,
   * so callers do not need to supply it; it is kept for compatibility.
   */
  journeyActivities?: Record<string, StageJourneyActivity>;
  commentCounts?: Record<string, number>;
}

export interface BuildJourneyOptions {
  /** Materials, used to price the bill of materials for margin-based steps. */
  materials?: Map<string, Material>;
  /**
   * Stages this product has already reached, from `stage_history`. Stages listed
   * here are grandfathered: they can never appear locked, so products created
   * before gating existed keep their access and can still move around.
   */
  visitedStages?: StageId[];
  /** Ownership, status, review and blocker data. Omitted by existing callers. */
  collaboration?: BuildJourneyCollaboration;
}

/** Builds the full journey for one product. Pure: safe to call on every render. */
export function buildJourney(product: Product, options: BuildJourneyOptions = {}): Journey {
  const materials = options.materials ?? new Map<string, Material>();
  const currentIndex = Math.max(stageIndex(product.stage), 0);
  const visited = options.visitedStages ?? [];
  const visitedMax = visited.reduce((max, s) => Math.max(max, stageIndex(s)), currentIndex);
  // Grandfathering: never lock a stage the product has already reached.
  const unlockedThrough = Math.max(currentIndex, visitedMax);

  // Every activity across the lifecycle, built once. Dependencies may point at
  // another stage (design depends on research), so blockers need the full list.
  const rawByStage = new Map(STAGE_IDS.map((id) => [id, activitiesForStage(product, id, materials)]));
  const allActivities = STAGE_IDS.flatMap((id) => rawByStage.get(id) ?? []);

  const stages = STAGE_IDS.map((id) => {
    const activities = attachCollaboration(rawByStage.get(id) ?? [], options.collaboration, allActivities);
    const required = activities.filter((a) => a.required);
    const total = required.length;
    // Canonical completion, straight from the same rule the server enforces.
    const questComplete = stageQuest(product, materials, id).complete;

    // Approval gate. An activity that needs sign-off does not count until it is
    // approved, so it is excluded from the tally and from completion. With no
    // collaboration data this is a no-op and `stageQuest()` decides, which keeps
    // every prior behaviour intact.
    const collab = options.collaboration;
    const pendingApproval = collab
      ? required.filter((a) => a.done && requiresApproval(a.id) && collab.records[a.id]?.reviewState !== 'approved')
      : [];
    const done = required.filter((a) => a.done).length - pendingApproval.length;
    const complete = questComplete && pendingApproval.length === 0;
    const index = stageIndex(id);
    return {
      id,
      label: getStage(id).label,
      phase: getStage(id).phase,
      index,
      guide: STAGE_GUIDES[id],
      state: 'locked' as StageState,
      lockReason: null as string | null,
      activities,
      pendingApproval: pendingApproval.map((a) => a.id),
      done: complete ? total : Math.max(0, done),
      total,
      progress: total === 0 ? (complete ? 100 : 0) : Math.round((complete ? total : done) / total * 100),
      complete
    } satisfies JourneyStage;
  });

  const current = stages[currentIndex] ?? stages[0]!;
  const currentComplete = current.complete;

  for (const stage of stages) {
    stage.state = stageStateFor(stage.index, currentIndex, currentComplete, unlockedThrough);
    stage.lockReason = stage.state === 'locked' ? lockReasonFor(stage.id) : null;
  }

  const path = stages.filter((s) => s.id !== 'Retired');

  const requiredDone = path.reduce((n, s) => n + s.done, 0);
  const requiredTotal = path.reduce((n, s) => n + s.total, 0);
  const overallPercent = requiredTotal === 0 ? 0 : Math.round((requiredDone / requiredTotal) * 100);
  // "Complete" means the eight progressive stages are done; Retired is off-path.
  const isPathComplete = path.length > 0 && path.every((s) => s.complete);

  // The first outstanding required activity, starting from the current stage.
  // Retired is off the happy path: finishing the journey must not hand the user
  // a "next" task that implies retirement.
  let nextActivity: NextActivity | null = null;
  if (!isPathComplete) {
    for (let i = currentIndex; i < stages.length && !nextActivity; i += 1) {
      const stage = stages[i];
      if (!stage || stage.state === 'locked' || stage.id === 'Retired') continue;
      const activity = stage.activities.find((a) => a.required && !a.done);
      if (activity) nextActivity = { stage: stage.id, activity };
    }
    // A finished path stage may still have optional activities worth suggesting.
    if (!nextActivity) {
      const optional = current.activities.find((a) => !a.done);
      if (optional) nextActivity = { stage: current.id, activity: optional };
    }
  }

  return {
    stages,
    path,
    retired: stages[stages.length - 1]!,
    current,
    currentIndex,
    overallPercent,
    completedCount: path.filter((s) => s.complete).length,
    totalCount: path.length,
    nextActivity,
    nextStageId: nextStage(product.stage),
    isComplete: isPathComplete
  } satisfies Journey;
}

/** Short, user-facing label for a stage state. */
export function stageStateLabel(state: StageState): string {
  switch (state) {
    case 'completed':
      return 'Completed';
    case 'current':
      return 'You are here';
    case 'available':
      return 'Ready to start';
    case 'locked':
      return 'Locked';
  }
}

/** Which tab a journey activity lives in, for deep links. */
export function activityHref(productId: string, stage: StageId, activity: StageJourneyActivity): string {
  if (activity.kind === 'question' && activity.tab === 'discover') {
    return `/products/${productId}/discover?stage=${stage}&q=${encodeURIComponent(activity.id)}`;
  }
  return `/products/${productId}/${activity.tab}`;
}

/** Exposed for tests: the eight progressive stages in order. */
export const PATH_STAGES = STAGES.filter((s) => s.id !== 'Retired').map((s) => s.id);
