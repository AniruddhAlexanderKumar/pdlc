import { lessonEvidence, questionsForStage } from './questions.js';
import { stageQuest } from './gamification.js';
import { STAGES, STAGE_IDS, getStage, nextStage, stageIndex, type PhaseId, type StageId } from './stages.js';
import type { Material, Product } from './types.js';
import { activityState, requiresApproval, type ActivityRecord, type ActivityBlocker, type ActivityState } from './activity.js';

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
  Idea: { purpose: 'Capture the product idea and the problem it solves.', why: 'A clear problem gives you something specific to investigate.' },
  Research: { purpose: 'Learn how people solve the problem today.', why: 'Separating assumptions from observations helps you decide what to test before investing.' },
  Planning: { purpose: 'Choose the smallest useful first version and plan the work.', why: 'A short feature list and a budget keep the first build achievable.' },
  Design: { purpose: 'Describe the experience from the user’s point of view.', why: 'A shared design brief lets you spot confusing steps before building them.' },
  Prototype: { purpose: 'Build a first version around one learning goal.', why: 'A small trial reveals blockers while changes are still affordable.' },
  Testing: { purpose: 'Compare what you expected with what really happened.', why: 'Observed results help you fix the right problem, not just the loudest complaint.' },
  Launch: { purpose: 'Decide who will get the product, when and at what price.', why: 'A release checklist and a measurable goal give you a useful first week.' },
  Improvement: { purpose: 'Turn feedback into the next development cycle.', why: 'Returning to an earlier chapter lets you test a change without losing what you learned.' },
  Retired: { purpose: 'Record why you stopped developing this product.', why: 'Your notes remain useful for future products.' }
};

export const CHAPTER_BRIEFS: Record<StageId, string> = {
  Idea: 'Concept brief', Research: 'Research notebook', Planning: 'Build roadmap', Design: 'Design brief',
  Prototype: 'Prototype log', Testing: 'Test report', Launch: 'Launch plan', Improvement: 'Iteration brief', Retired: 'Archive note'
};

/** Why a checklist step matters, in the user's words. */
const STEP_WHY: Record<string, string> = {
  questions: 'These answers give the checklist and your teammates the full picture.',
  description: 'A one-line description is the first thing anyone reads about this product.',
  task: 'A research task is how you turn “I think” into “I checked”.',
  price: 'Without a price you cannot work out profit or margin.',
  tasks: 'One concrete task gives you a place to record a due date, progress and blockers.',
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
  const questions = questionsForStage(stage, product.productKind);

  const questionActivities: StageJourneyActivity[] = questions.map((q) => ({
    id: q.key,
    label: q.prompt,
    why: q.help ?? STEP_WHY.questions,
    done: lessonEvidence(q, product.answers[q.key]),
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
  allActivities: StageJourneyActivity[],
  stagesByKey: Map<string, StageId>
): StageJourneyActivity[] {
  if (!collab) return activities;
  return activities.map((a) => {
    const record = collab.records[a.id];
    const blockers = collab.blockersFor ? collab.blockersFor(a.id, allActivities, collab.records, stagesByKey) : [];
    return {
      ...a,
      collaboration: activityState(a, record, blockers, collab.commentCounts?.[a.id])
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
  blockersFor?: (activityKey: string, allActivities: StageJourneyActivity[], records: Record<string, ActivityRecord>, stages: Map<string, StageId>) => ActivityBlocker[];
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
  const unlockedThrough = Math.max(currentIndex, visitedMax, product.legacyStage ? stageIndex(product.legacyStage) : -1);

  // Every activity across the lifecycle, built once. Dependencies may point at
  // another stage (design depends on research), so blockers need the full list.
  const rawByStage = new Map(STAGE_IDS.map((id) => [id, activitiesForStage(product, id, materials)]));
  const allActivities = STAGE_IDS.flatMap((id) => rawByStage.get(id) ?? []);

  const stagesByKey = new Map(STAGE_IDS.flatMap(id => (rawByStage.get(id) ?? []).map(a => [a.id,id] as const)));
  const stages = STAGE_IDS.map((id) => {
    const activities = attachCollaboration(rawByStage.get(id) ?? [], options.collaboration, allActivities, stagesByKey);
    const required = activities.filter((a) => a.required);
    const total = required.length;
    // Canonical completion, straight from the same rule the server enforces.
    const questComplete = stageQuest(product, materials, id).complete;

    // Approval gate. An activity that needs sign-off does not count until it is
    // approved, so it is excluded from the tally and from completion. With no
    // collaboration data this is a no-op and `stageQuest()` decides, which keeps
    // every prior behaviour intact.
    const collab = options.collaboration;
    const pendingApproval = collab || product.approvalStates
      ? required.filter(a => a.done && requiresApproval(a.id) && (collab ? collab.records[a.id]?.reviewState : product.approvalStates?.[a.id]) !== 'approved')
      : [];
    const blocked = required.filter((a) => a.collaboration?.blockers.length);
    const excluded = new Set([...pendingApproval, ...blocked].map((a) => a.id));
    const done = required.filter((a) => a.done && !excluded.has(a.id)).length;
    const complete = questComplete && !excluded.size;
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
    if (
      product.stage === 'Retired' &&
      product.legacyStage &&
      stage.id !== 'Retired' &&
      stage.index > stageIndex(product.legacyStage)
    )
      stage.state = 'locked';
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
  return `/products/${productId}/${activity.tab}${activity.tab === 'tasks' ? `?stage=${stage}` : ''}`;
}

/** Exposed for tests: the eight progressive stages in order. */
export const PATH_STAGES = STAGES.filter((s) => s.id !== 'Retired').map((s) => s.id);
