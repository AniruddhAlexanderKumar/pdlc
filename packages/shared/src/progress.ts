/**
 * Progress engine for the gamified PDLC journey.
 *
 * Nothing here is stored as "progress". Every state is derived from records the
 * product actually has — answers, costs, materials, tasks, research, requirements,
 * tests, decisions, feedback — plus the lesson/checkpoint activity rows that only
 * exist once a founder has genuinely submitted work.
 *
 * The rules, in order:
 *
 *   1. A lesson is `completed` when its bound record exists (or, for pure
 *      teaching lessons, when its submission row exists). Legacy work counts:
 *      an answer written before this feature existed satisfies its lesson.
 *   2. A lesson is `current` when it is the first incomplete lesson of the
 *      furthest reachable world, or explicitly opened.
 *   3. Lessons inside a unit unlock in order. A unit unlocks when the previous
 *      unit in that world is complete.
 *   4. A checkpoint unlocks when every required lesson in its world is complete,
 *      and its criteria pass against real records.
 *   5. A world unlocks when the previous world's checkpoint has been passed, or
 *      the product's lifecycle stage is already at or beyond it (legacy users keep
 *      their position and never replay from Idea).
 *
 * Re-running anything is safe: state is computed, never accumulated, and XP is
 * de-duplicated by the `xp_events` unique key.
 */

import type { Product } from './types.js';
import type { StageId } from './stages.js';
import { STAGE_IDS, stageIndex } from './stages.js';
import {
  WORLDS,
  ALL_LESSONS,
  LESSON_BY_ID,
  TOTAL_JOURNEY_XP,
  TOTAL_LESSONS,
  type Checkpoint,
  type CheckpointCriterion,
  type Lesson,
  type Unit,
  type World
} from './curriculum.js';

// ── Records supplied by the caller ─────────────────────────────────────────

/**
 * The extra product records the curriculum binds to. All optional so existing
 * callers (`buildJourney(product)`) keep working unchanged.
 */
export interface JourneyRecords {
  /** Research entries by kind: `competitor`, `evidence`, `interview`, … */
  research?: { kind: string; title: string; detail?: string }[];
  /** Product requirements by kind: `mvp`, `feature`, `design`, `any`. */
  requirements?: { kind: string; text: string }[];
  /** Test results, one row per test. */
  tests?: { name: string; result: string; requirement?: string | null }[];
  /** Decisions recorded against the product. */
  decisions?: { kind: string; decision: string; rationale?: string }[];
  /** Feedback items / improvement backlog. */
  feedback?: { kind: string; body: string; status?: string }[];
  /** Checklist items a founder ticked in a lesson, keyed `lessonId:itemId`. */
  checkedItems?: Set<string>;
  /** Lessons the founder explicitly submitted (write/form/choice/priority). */
  submissions?: Set<string>;
}

export interface JourneyRecordsView {
  submissions: string[];
  checkedItems: string[];
  checkpoints: { id: string; status: string; submittedAt: string }[];
  research: { id: string; kind: string; title: string; detail: string }[];
  requirements: { id: string; kind: string; text: string; priority: string }[];
  tests: { id: string; name: string; result: string; outcome: string }[];
  decisions: { id: string; kind: string; decision: string; rationale: string }[];
  feedback: { id: string; kind: string; body: string; severity: string; status: string }[];
}

export interface LessonSubmissionInput {
  text?: string;
  optionId?: string;
  fields?: Record<string, string>;
  order?: string[];
}

export type LessonState = 'completed' | 'current' | 'available' | 'locked';

/**
 * Legacy recognition states, per the requirement:
 * Completed / In progress / Needs review / Not started / Legacy recognised.
 */
export type LessonRecognition = 'completed' | 'in_progress' | 'needs_review' | 'not_started' | 'legacy';

export interface LessonProgress {
  id: string;
  worldId: string;
  unitId: string;
  state: LessonState;
  recognition: LessonRecognition;
  /** True when the bound record existed before this feature (migrated work). */
  legacy: boolean;
  /** Plain-English reason when locked. */
  lockReason: string | null;
  /** Why the lesson is complete, in the founder's terms. */
  evidence: string | null;
  xp: number;
  /** Title and summary, so a map can render without a second lookup. */
  lesson: { id: string; title: string; summary: string };
}

export interface UnitProgress {
  id: string;
  title: string;
  blurb: string;
  state: LessonState;
  lessons: LessonProgress[];
  completed: number;
  total: number;
  /** 0–100. */
  progress: number;
  lockReason: string | null;
}

export interface CheckpointProgress {
  id: string;
  title: string;
  deliverable: string;
  readyWhen: string;
  state: LessonState;
  /** Per-criterion result against real records. */
  results: { id: string; label: string; passed: boolean; observed: string }[];
  passed: boolean;
  /** True when the founder has submitted and it was accepted. */
  submitted: boolean;
  met: number;
  total: number;
  lockReason: string | null;
  xp: number;
}

export interface WorldProgress {
  id: string;
  index: number;
  stage: StageId;
  title: string;
  blurb: string;
  outcome: string;
  state: LessonState;
  units: UnitProgress[];
  checkpoint: CheckpointProgress;
  completed: number;
  total: number;
  /** 0–100 across this world's lessons. */
  progress: number;
  /** True when the checkpoint has been passed. */
  complete: boolean;
  lockReason: string | null;
  /** The product's lifecycle is already past this world. */
  behind: boolean;
  /** Every lesson in the world is complete, so its checkpoint can be opened. */
  allLessonsDone: boolean;
  /** The world can be entered. A locked world cannot. */
  unlocked: boolean;
}

export interface JourneyV2 {
  worlds: WorldProgress[];
  /** The world the founder is working in. */
  currentWorld: WorldProgress;
  currentUnit: UnitProgress;
  /** The next lesson to do, or null when the whole journey is done. */
  nextLesson: (LessonProgress & { lesson: Lesson }) | null;
  /** Total lessons complete across all worlds. */
  lessonsComplete: number;
  lessonsTotal: number;
  /** 0–100 across the whole journey (lessons + 8 checkpoints). */
  overallPercent: number;
  /** XP available from completed work. */
  earnedJourneyXp: number;
  totalJourneyXp: number;
  worldsComplete: number;
  checkpointsPassed: number;
  isComplete: boolean;
}

// ── Binding evaluation ─────────────────────────────────────────────────────

/** Minimum characters for free text to count as a real record rather than a placeholder. */
const SUBSTANTIVE_TEXT = 3;

/** Has the given bind been satisfied by real records? Returns evidence text or null. */
export function bindEvidence(bind: { target: string; key: string }, product: Product, records: JourneyRecords): string | null {
  switch (bind.target) {
    case 'answer': {
      const value = product.answers[bind.key];
      if (value === undefined || value === null) return null;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        // A single character is not an answer; require a substantive record.
        return trimmed.length >= SUBSTANTIVE_TEXT ? trimmed : null;
      }
      if (typeof value === 'number') return String(value);
      if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : null;
      if (typeof value === 'boolean') return value ? 'Yes' : null;
      return null;
    }
    case 'field': {
      // Free-text product fields must be substantive, not merely present: a
      // one-character description is not a product concept and must never
      // satisfy a lesson or a checkpoint.
      const substantive = (value: string) => {
        const trimmed = value.trim();
        return trimmed.length >= SUBSTANTIVE_TEXT ? trimmed : null;
      };
      if (bind.key === 'description') return substantive(product.description);
      if (bind.key === 'name') return substantive(product.name);
      if (bind.key === 'category') return substantive(product.category);
      if (bind.key === 'notes') return substantive(product.notes);
      if (bind.key === 'targetSellingPrice') {
        return product.targetSellingPrice !== null && product.targetSellingPrice > 0 ? String(product.targetSellingPrice) : null;
      }
      return null;
    }
    case 'costs': {
      const { labour, packaging, overhead } = product.costs;
      const filled = labour > 0 && packaging > 0 && overhead > 0;
      return filled ? `Labour ${labour}, packaging ${packaging}, overhead ${overhead}` : null;
    }
    case 'material': {
      const lines = product.materials.filter((m) => m.quantity > 0);
      if (bind.key === 'bom') return lines.length > 0 ? `${lines.length} material line(s)` : null;
      return lines.length > 0 ? `${lines.length} material line(s)` : null;
    }
    case 'task': {
      const all = product.tasks;
      if (bind.key === 'any') return all.length > 0 ? `${all.length} task(s)` : null;
      if (bind.key === 'done') {
        const done = all.filter((t) => t.status === 'done');
        return done.length > 0 ? `${done.length} task(s) complete` : null;
      }
      // Kind-specific task counts come from the task record's own tags; a task's
      // title is what a founder wrote, so match on the recorded kind when present,
      // else fall back to any task (the checklist activity is what proves intent).
      const matching = all.filter((t) => matchesTaskKind(t, bind.key));
      if (matching.length > 0) return `${matching.length} ${bind.key} task(s)`;
      // No typed tasks yet: any task satisfies the checklist activity, because the
      // founder ticks the checklist items themselves to claim the specific work.
      return all.length > 0 ? `${all.length} task(s)` : null;
    }
    case 'research': {
      const rows = (records.research ?? []).filter((r) => r.kind === bind.key || bind.key === 'any');
      return rows.length > 0 ? rows.map((r) => r.title).slice(0, 3).join('; ') : null;
    }
    case 'requirement': {
      const rows = (records.requirements ?? []).filter((r) => r.kind === bind.key || bind.key === 'any');
      return rows.length > 0 ? rows.map((r) => r.text).slice(0, 3).join('; ') : null;
    }
    case 'test': {
      const rows = (records.tests ?? []).filter((t) => bind.key === 'any' || t.name.toLowerCase().includes(bind.key));
      return rows.length > 0 ? `${rows.length} test result(s)` : null;
    }
    case 'decision': {
      const rows = (records.decisions ?? []).filter((d) => d.kind === bind.key || bind.key === 'any');
      return rows.length > 0 ? rows.map((d) => d.decision).slice(0, 3).join('; ') : null;
    }
    case 'feedback': {
      const rows = (records.feedback ?? []).filter((f) => f.kind === bind.key || bind.key === 'any');
      return rows.length > 0 ? `${rows.length} item(s)` : null;
    }
    default:
      return null;
  }
}

/** Does a task belong to a named kind? Uses the task title/tag vocabulary the app already writes. */
function matchesTaskKind(task: { title: string; description?: string }, kind: string): boolean {
  const haystack = `${task.title} ${task.description ?? ''}`.toLowerCase();
  switch (kind) {
    case 'research':
      return /\bresearch|interview|competitor|survey\b/.test(haystack);
    case 'roadmap':
      return /\broadmap|milestone|plan\b/.test(haystack);
    case 'prototype':
      return /\bprototype|build|machine|assemble|sample\b/.test(haystack);
    case 'launch':
      return /\blaunch|release|announce|packag|stock\b/.test(haystack);
    case 'improvement':
      return /\bv2|iteration|improve|retest|redesign\b/.test(haystack);
    default:
      return false;
  }
}

/** Count matching records for a checkpoint criterion. */
function criterionCount(criterion: CheckpointCriterion, product: Product, records: JourneyRecords): { passed: boolean; observed: string } {
  const min = criterion.min ?? 1;
  const { target, key } = criterion.bind;

  let count = 0;
  let sample = '';
  switch (target) {
    case 'answer':
    case 'field':
    case 'costs': {
      const evidence = bindEvidence(criterion.bind, product, records);
      count = evidence ? 1 : 0;
      sample = evidence ?? 'Not recorded';
      break;
    }
    case 'material': {
      // A bill of materials is counted in lines, so "at least two lines" means
      // two rows, not "some materials exist".
      const lines = product.materials.filter((m) => m.quantity > 0);
      count = lines.length;
      sample = `${count} material line(s)`;
      break;
    }
    case 'task': {
      const all = product.tasks;
      count = key === 'done' ? all.filter((t) => t.status === 'done').length : key === 'any' ? all.length : all.filter((t) => matchesTaskKind(t, key)).length;
      sample = `${count} task(s)`;
      break;
    }
    case 'research':
      count = (records.research ?? []).filter((r) => key === 'any' || r.kind === key).length;
      sample = `${count} research entr(ies)`;
      break;
    case 'requirement':
      count = (records.requirements ?? []).filter((r) => key === 'any' || r.kind === key).length;
      sample = `${count} requirement(s)`;
      break;
    case 'test':
      count = (records.tests ?? []).filter((t) => key === 'any' || t.name.toLowerCase().includes(key)).length;
      sample = `${count} test result(s)`;
      break;
    case 'decision':
      count = (records.decisions ?? []).filter((d) => key === 'any' || d.kind === key).length;
      sample = `${count} decision(s)`;
      break;
    case 'feedback':
      count = (records.feedback ?? []).filter((f) => key === 'any' || f.kind === key).length;
      sample = `${count} item(s)`;
      break;
  }

  if (count >= min) return { passed: true, observed: sample };
  const missing = min - count;
  return { passed: false, observed: `${sample} — ${missing} more needed` };
}

// ── Lesson completion ──────────────────────────────────────────────────────

function lessonComplete(
  lesson: Lesson,
  product: Product,
  records: JourneyRecords
): { done: boolean; evidence: string | null; legacy: boolean; inProgress: boolean } {
  // An explicit submission (write / form / choice / priority) is required for
  // those kinds; a bound record alone is not enough to claim the lesson was taken.
  const submitted = records.submissions?.has(lesson.id) ?? false;

  if (lesson.activity.kind === 'checklist') {
    const items = lesson.activity.items ?? [];
    const ticked = items.filter((i) => records.checkedItems?.has(`${lesson.id}:${i.id}`)).length;
    if (items.length === 0) return { done: false, evidence: null, legacy: false, inProgress: false };
    if (ticked !== items.length) return { done: false, evidence: null, legacy: false, inProgress: ticked > 0 };

    // Every box is ticked. A tick is a claim; the bound record has to back it.
    // Without this a checklist is an XP button that requires no work at all.
    const proof = bindEvidence(lesson.bind, product, records);
    if (!proof) return { done: false, evidence: null, legacy: false, inProgress: true };
    return { done: true, evidence: `All ${items.length} steps confirmed — ${proof}`, legacy: false, inProgress: false };
  }

  const evidence = bindEvidence(lesson.bind, product, records);
  if (!evidence) return { done: false, evidence: null, legacy: false, inProgress: false };

  // The bound record exists. For interactive lessons we also require the
  // submission row, so clicking through without writing does not award anything.
  // Legacy work (a record that predates the lesson) is recognised without it.
  if (submitted) return { done: true, evidence, legacy: false, inProgress: false };

  // Work that predates this curriculum is recognised as already done.
  const isLegacy = legacyRecord(lesson, product, records);
  if (isLegacy) return { done: true, evidence, legacy: true, inProgress: false };

  // The record exists but this lesson was never taken: it is in progress, not
  // complete. The founder reviews what is there and submits the lesson.
  return { done: false, evidence, legacy: false, inProgress: true };
}

/**
 * Was the bound record produced before this lesson existed?
 *
 * We cannot know the exact timing of every record from the product snapshot, but
 * we can recognise the shapes that unambiguously predate the curriculum: a
 * product that was already advanced past a world, or has discovery answers that
 * were written by the original question flow. Those count as `legacy` so an
 * existing user is never asked to redo work they already did.
 */
function legacyRecord(lesson: Lesson, product: Product, records: JourneyRecords): boolean {
  // Product is already at or beyond this lesson's world → earlier work is presumed done.
  const lessonWorld = WORLDS.find((w) => w.units.some((u) => u.lessons.some((l) => l.id === lesson.id)));
  if (!lessonWorld) return false;
  const productStageIdx = stageIndex(product.stage);
  const worldStageIdx = stageIndex(lessonWorld.stage);
  if (productStageIdx > worldStageIdx) return true;

  // Grandfathered product (created before gating) with the record present.
  if (product.legacyStage && stageIndex(product.legacyStage) >= worldStageIdx) return true;

  // Discovery answers written through the original "Tell us" flow carry the
  // question's own key; those are legacy for lessons bound to them.
  if (lesson.bind.target === 'answer' && product.answers[lesson.bind.key] !== undefined) {
    // Only treat it as legacy when the lesson has never been submitted; a
    // submission would have produced a row and taken the non-legacy path.
    return !records.submissions?.has(lesson.id);
  }

  return false;
}

// ── The engine ─────────────────────────────────────────────────────────────

/**
 * Builds the whole journey for one product.
 *
 * `product.stage` is the lifecycle position the server enforces. A world is
 * never presented as locked when the product has already passed it, which is how
 * an existing product in Testing keeps access to everything before it.
 */
export function buildJourneyV2(product: Product, records: JourneyRecords = {}): JourneyV2 {
  const productStageIdx = stageIndex(product.stage);

  const worldProgress: WorldProgress[] = WORLDS.map((world) => {
    const worldStageIdx = stageIndex(world.stage);

    // ── Lessons and units ──
    const unitProgress: UnitProgress[] = world.units.map((unit) => {
      const lessons: LessonProgress[] = unit.lessons.map((lesson) => {
        const { done, evidence, legacy, inProgress } = lessonComplete(lesson, product, records);
        return {
          id: lesson.id,
          worldId: world.id,
          unitId: unit.id,
          state: (done ? 'completed' : 'locked') as LessonState,
          recognition: (done ? (legacy ? 'legacy' : 'completed') : inProgress ? 'in_progress' : 'not_started') as LessonRecognition,
          legacy,
          lockReason: null,
          evidence,
          xp: lesson.xp,
          lesson: { id: lesson.id, title: lesson.title, summary: lesson.summary }
        };
      });
      const completed = lessons.filter((l) => l.state === 'completed').length;
      return {
        id: unit.id,
        title: unit.title,
        blurb: unit.blurb,
        state: 'locked' as LessonState,
        lessons,
        completed,
        total: lessons.length,
        progress: lessons.length === 0 ? 0 : Math.round((completed / lessons.length) * 100),
        lockReason: null
      };
    });

    // ── Checkpoint against real records ──
    const results = world.checkpoint.criteria.map((c) => {
      const r = criterionCount(c, product, records);
      return { id: c.id, label: c.label, passed: r.passed, observed: r.observed };
    });
    const met = results.filter((r) => r.passed).length;
    const submitted = records.submissions?.has(world.checkpoint.id) ?? false;
    const criteriaPass = met === results.length;

    const lessonsDone = unitProgress.reduce((n, u) => n + u.completed, 0);
    const lessonsTotal = unitProgress.reduce((n, u) => n + u.total, 0);
    const allLessonsDone = lessonsDone === lessonsTotal;

    return {
      id: world.id,
      index: world.index,
      stage: world.stage,
      title: world.title,
      blurb: world.blurb,
      outcome: world.outcome,
      state: 'locked' as LessonState,
      units: unitProgress,
      checkpoint: {
        id: world.checkpoint.id,
        title: world.checkpoint.title,
        deliverable: world.checkpoint.deliverable,
        readyWhen: world.checkpoint.readyWhen,
        state: 'locked' as LessonState,
        results,
        passed: submitted && criteriaPass,
        submitted,
        met,
        total: results.length,
        lockReason: null,
        xp: world.checkpoint.xp
      },
      completed: lessonsDone,
      total: lessonsTotal,
      progress: lessonsTotal === 0 ? 0 : Math.round((lessonsDone / lessonsTotal) * 100),
      complete: submitted && criteriaPass,
      // A world is complete when its checkpoint passed, or (for a product already
      // past it) the lifecycle says this world is behind us.
      lockReason: null,
      behind: false,
      allLessonsDone,
      unlocked: false
    };
  });

  // ── State resolution ──────────────────────────────────────────────────────
  // Worlds in order. A world unlocks when the previous one's checkpoint passed,
  // when the product's lifecycle has already reached it, or when it is first.
  // The first unlocked-but-incomplete world is `current`; later ones are
  // `available`; earlier complete ones are `completed`.
  const scored = worldProgress;

  scored.forEach((world, i) => {
    const previous = i > 0 ? scored[i - 1] : null;
    const worldStageIdx = stageIndex(world.stage);
    world.behind = productStageIdx > worldStageIdx;
    world.allLessonsDone = world.completed === world.total && world.total > 0;
    world.unlocked = i === 0 || Boolean(previous?.checkpoint.passed) || productStageIdx >= worldStageIdx;
  });

  // The founder's active world. A product already at Testing must show Testing as
  // current, not World 1, or the map contradicts their actual position and two
  // worlds both read "You are here".
  const stageWorldScored = scored.find((w) => w.stage === product.stage);
  const firstActive =
    (stageWorldScored && stageWorldScored.unlocked && !stageWorldScored.checkpoint.passed ? stageWorldScored : null) ??
    scored.find((w) => w.unlocked && !w.checkpoint.passed) ??
    null;

  for (const world of scored) {
    if (!world.unlocked) {
      world.state = 'locked';
      const previous = scored[scored.indexOf(world) - 1];
      world.lockReason = previous ? `Pass the ${previous.title} checkpoint to unlock ${world.title}.` : null;
      world.checkpoint.state = 'locked';
      world.checkpoint.lockReason = world.lockReason;
      for (const unit of world.units) {
        unit.state = 'locked';
        unit.lockReason = world.lockReason;
        for (const lesson of unit.lessons) {
          lesson.state = 'locked';
          lesson.lockReason = world.lockReason;
        }
      }
      continue;
    }

    if (world.checkpoint.passed) world.state = 'completed';
    else if (world === firstActive) world.state = 'current';
    else world.state = 'available';

    // Units unlock strictly in order. A unit that is fully complete is
    // `completed`; the first reachable, incomplete unit is `current` (or
    // `available` in a world the founder is only revisiting); every unit after
    // that is locked until its predecessor finishes.
    let sawIncompleteUnit = false;
    for (const unit of world.units) {
      const done = unit.total > 0 && unit.completed === unit.total;
      if (done) {
        unit.state = 'completed';
        unit.lockReason = null;
      } else if (!sawIncompleteUnit) {
        unit.state = world.state === 'current' ? 'current' : 'available';
        unit.lockReason = null;
        sawIncompleteUnit = true;
      } else {
        unit.state = 'locked';
        unit.lockReason = `Finish the previous unit in ${world.title} first.`;
      }

      // Lessons inside a unit unlock strictly in order. A locked unit locks all
      // of its lessons; a reachable unit makes its first incomplete lesson
      // `current` and the rest `available`.
      let sawIncompleteLesson = false;
      for (const lesson of unit.lessons) {
        if (lesson.state === 'completed') {
          lesson.lockReason = null;
          continue;
        }
        if (unit.state === 'locked') {
          lesson.state = 'locked';
          lesson.lockReason = unit.lockReason;
          continue;
        }
        if (!sawIncompleteLesson) {
          lesson.state = 'current';
          lesson.lockReason = null;
          sawIncompleteLesson = true;
        } else {
          lesson.state = 'available';
          lesson.lockReason = null;
        }
      }
    }

    // Checkpoint: opens when every lesson in the world is done.
    if (world.checkpoint.passed) {
      world.checkpoint.state = 'completed';
      world.checkpoint.lockReason = null;
    } else if (world.allLessonsDone) {
      world.checkpoint.state = world.state === 'current' ? 'current' : 'available';
      world.checkpoint.lockReason = null;
    } else {
      world.checkpoint.state = 'locked';
      world.checkpoint.lockReason = `Finish all ${world.total} lessons in ${world.title} to open its checkpoint.`;
    }
  }


  // ── Aggregate ──
  const lessonsComplete = worldProgress.reduce((n, w) => n + w.completed, 0);
  const checkpointsPassed = worldProgress.filter((w) => w.checkpoint.passed).length;
  const worldsComplete = worldProgress.filter((w) => w.complete).length;
  const scoreDenominator = TOTAL_LESSONS + WORLDS.length;
  const earnedJourneyXp =
    ALL_LESSONS.filter((l) => worldProgress.some((w) => w.units.some((u) => u.lessons.some((x) => x.id === l.id && x.state === 'completed')))).reduce((n, l) => n + l.xp, 0) +
    WORLDS.filter((w) => worldProgress.find((x) => x.id === w.id)?.checkpoint.passed).reduce((n, w) => n + w.checkpoint.xp, 0);

  // The founder's position is the world matching the product's lifecycle stage
  // when that world is reachable, otherwise the first reachable incomplete world.
  // This is what stops an existing product in Testing being shown World 1.
  const stageWorld = worldProgress.find((w) => w.stage === product.stage);
  const firstOpen = worldProgress.find((w) => w.state === 'current');
  const currentWorld =
    (stageWorld && stageWorld.state !== 'locked' && !stageWorld.checkpoint.passed ? stageWorld : null) ??
    firstOpen ??
    worldProgress[worldProgress.length - 1];
  const currentUnit = currentWorld.units.find((u) => u.state === 'current') ?? currentWorld.units[0];

  // The recommended next lesson: the first non-completed, non-locked lesson in order.
  let nextLesson: (LessonProgress & { lesson: Lesson }) | null = null;
  const orderedWorlds = [
    ...worldProgress.filter((w) => w.index >= currentWorld.index),
    ...worldProgress.filter((w) => w.index < currentWorld.index)
  ];
  for (const world of orderedWorlds) {
    for (const unit of world.units) {
      for (const lp of unit.lessons) {
        if (lp.state === 'completed') continue;
        if (lp.state === 'locked') continue;
        const lesson = LESSON_BY_ID.get(lp.id);
        if (lesson) nextLesson = { ...lp, lesson };
        break;
      }
      if (nextLesson) break;
    }
    if (nextLesson) break;
  }

  return {
    worlds: worldProgress,
    currentWorld,
    currentUnit,
    nextLesson,
    lessonsComplete,
    lessonsTotal: TOTAL_LESSONS,
    overallPercent: Math.round(((lessonsComplete + checkpointsPassed) / scoreDenominator) * 100),
    earnedJourneyXp,
    totalJourneyXp: TOTAL_JOURNEY_XP,
    worldsComplete,
    checkpointsPassed,
    isComplete: worldsComplete === WORLDS.length
  };
}

/** Flatten a journey into `{ lessonId: state }` for quick lookups. */
export function lessonStateMap(journey: JourneyV2): Map<string, LessonProgress> {
  const map = new Map<string, LessonProgress>();
  for (const world of journey.worlds) for (const unit of world.units) for (const lesson of unit.lessons) map.set(lesson.id, lesson);
  return map;
}

/** The world a lifecycle stage belongs to. */
export function worldForStage(stage: StageId): World | undefined {
  return WORLDS.find((w) => w.stage === stage);
}

/** Which world a lesson lives in. */
export function worldOfLesson(lessonId: string): World | undefined {
  return WORLDS.find((w) => w.units.some((u) => u.lessons.some((l) => l.id === lessonId)));
}

export function checkpointOfWorld(worldId: string): Checkpoint | undefined {
  return WORLDS.find((w) => w.id === worldId)?.checkpoint;
}

export function unitOfLesson(lessonId: string): Unit | undefined {
  return WORLDS.flatMap((w) => w.units).find((u) => u.lessons.some((l) => l.id === lessonId));
}

export { WORLDS, ALL_LESSONS, TOTAL_JOURNEY_XP, TOTAL_LESSONS };
