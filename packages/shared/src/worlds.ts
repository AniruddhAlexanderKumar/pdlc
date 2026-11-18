import { activityHref, type Journey } from './journey.js';
import { isAnswered, QUESTIONS_BY_KEY } from './questions.js';
import { requiresApproval } from './activity.js';
import type { Product } from './types.js';
import { stageIndex, type StageId } from './stages.js';

export type WorldId = Exclude<StageId, 'Retired'>;
/** Stable node identifiers, not array positions. The keys point to the real product editors. */
const unit = (id: string, title: string, keys: string) => ({ id, title, keys: keys.split(' ') });
export const WORLD_UNITS: Record<WorldId, ReturnType<typeof unit>[]> = {
  Idea: [
    unit('idea.concept', 'Frame the concept', 'idea.oneliner description idea.category idea.excitement'),
    unit('idea.problem-space', 'Understand the problem', 'idea.problem idea.customer idea.workaround'),
    unit('idea.value', 'Define the promise', 'idea.promise idea.success')
  ],
  Research: [
    unit('research.people', 'Meet the customer', 'research.profile research.interview research.validated task'),
    unit(
      'research.landscape',
      'Compare alternatives',
      'research.competitors research.comparison research.market_price research.differentiator research.channels'
    ),
    unit('research.notebook', 'Separate findings from beliefs', 'research.finding research.to_check')
  ],
  Planning: [
    unit('planning.scope', 'Shape the first release', 'planning.mvp planning.priorities'),
    unit(
      'planning.economics',
      'Size the investment',
      'planning.budget planning.target_price planning.target_margin planning.first_batch'
    ),
    unit('planning.delivery', 'Sequence the work', 'planning.roadmap planning.risk planning.launch_date')
  ],
  Design: [
    unit('design.experience', 'Map the experience', 'design.journey'),
    unit(
      'design.specification',
      'Specify the first version',
      'design.must_haves design.behaviour design.architecture design.interfaces design.delivery design.unpack'
    ),
    unit(
      'design.decisions',
      'Record design choices',
      'design.decision design.materials_chosen design.dimensions design.sustainability'
    )
  ],
  Prototype: [
    unit('prototype.intent', 'Choose a learning goal', 'prototype.objective prototype.resources'),
    unit(
      'prototype.build',
      'Assemble the pilot',
      'prototype.version prototype.overhead tasks prototype.cost_confidence'
    ),
    unit('prototype.log', 'Document the build', 'prototype.learnings prototype.artifact')
  ],
  Testing: [
    unit('testing.protocol', 'Set acceptance criteria', 'testing.criteria testing.certifications'),
    unit('testing.trial', 'Run the trial', 'testing.scenario testing.testers'),
    unit('testing.report', 'Triage the results', 'testing.results testing.issues testing.satisfaction')
  ],
  Launch: [
    unit('launch.offer', 'Define the offer', 'launch.price price launch.plan'),
    unit('launch.release', 'Prepare release day', 'launch.date launch.readiness'),
    unit('launch.measure', 'Measure the launch', 'launch.metric launch.first_month_units')
  ],
  Improvement: [
    unit('improve.signals', 'Read the signals', 'improve.feedback improve.units_sold improve.performance'),
    unit('improve.triage', 'Prioritise improvements', 'improve.backlog'),
    unit('improve.iteration', 'Design the next cycle', 'improve.next improve.return')
  ]
};
export type RecognitionState = 'completed' | 'in_progress' | 'needs_review' | 'not_started' | 'legacy_recognised';
export interface ProductUpgrade {
  needsPlacement?: boolean;
  originalStage: string;
  through: StageId;
  knownKeys: string[];
  importedKeys: string[];
  counts: Record<string, number>;
}
export interface WorkSource {
  id: string;
  label: string;
  excerpt: string;
  keys: string[];
  href?: string;
}
export interface TrailLesson {
  key: string;
  title: string;
  href: string;
  required: boolean;
  done: boolean;
  state: RecognitionState;
  reason: string | null;
  lock: string | null;
  credit: number;
}
export interface TrailUnit {
  id: string;
  title: string;
  lessons: TrailLesson[];
  done: number;
  total: number;
  complete: boolean;
  lock: string | null;
}
export interface World {
  stage: WorldId;
  units: TrailUnit[];
  ready: boolean;
  done: number;
  total: number;
  lock: string | null;
  recognised: boolean;
  checkpoint: boolean;
  finished: boolean;
  missing: string[];
}
export interface PeriodQuest {
  period: 'daily' | 'weekly';
  title: string;
  start: string;
  end: string;
  progress: number;
  target: number;
  points: number;
  earned: boolean;
}
export interface Trail {
  rewards: { unit: number; checkpoint: number; world: number };
  worlds: World[];
  upgrade: ProductUpgrade | null;
  sources: WorkSource[];
  quests: PeriodQuest[];
  next: TrailLesson | null;
}
export const stampId = (kind: 'unit' | 'checkpoint' | 'world', key: string) => `${kind}:${key}`;

/** Read-only projection. The API supplies scoped work, actual sign-offs, historical receipts and only the viewer's drafts. */
export function productWorlds(
  p: Product,
  journey: Journey,
  upgrade: ProductUpgrade | null = null,
  stamps: ReadonlySet<string> = new Set(),
  sources: WorkSource[] = [],
  drafts: ReadonlySet<string> = new Set()
): World[] {
  return journey.path.map((s) => {
    const stage = s.id as WorldId;
    const recognised = !!upgrade && s.index <= stageIndex(upgrade.through);
    // The legacy stage editor may finish the current world and advance in one transaction.
    // On the guided path a new world opens at the finish receipt, never just on a percentage.
    const needsFinish =
      s.index === journey.currentIndex + 1 &&
      s.index > stageIndex(p.legacyStage ?? p.stage) &&
      !recognised &&
      !stamps.has(stampId('world', p.stage));
    const worldLock =
      s.lockReason ?? (needsFinish ? `Record the ${p.stage} world milestone to open ${stage}.` : null);
    let previous: string | null = null;
    const units = WORLD_UNITS[stage].map((def) => {
      const nodes = def.keys.flatMap((k) => s.activities.filter((a) => a.id === k));
      const started = nodes.some((a) => a.done || isAnswered(p.answers[a.id]));
      const lock =
        worldLock ??
        (previous && !recognised && !started && s.index >= journey.currentIndex
          ? `Finish ${previous} to open this unit.`
          : null);
      const lessons: TrailLesson[] = nodes.map((a) => {
        const col = a.collaboration;
        const pending = requiresApproval(a.id) && (p.approvalStates?.[a.id] ?? col?.reviewState) !== 'approved';
        const done = a.done && !pending && !col?.blockers.length;
        const recorded = isAnswered(p.answers[a.id]);
        const evidence = sources.some((x) => x.keys.includes(a.id));
        const state: RecognitionState = done
          ? 'completed'
          : recorded || evidence || col?.status === 'completed' || col?.status === 'needs_review'
            ? 'needs_review'
            : drafts.has(a.id) || (col && col.status !== 'not_started')
              ? 'in_progress'
              : upgrade?.knownKeys.includes(a.id)
                ? 'legacy_recognised'
                : 'not_started';
        const reason = col?.blockers.length
          ? col.blockers[0].resolution
          : done
            ? upgrade?.importedKeys.includes(a.id)
              ? 'Recognised from a product record.'
              : null
            : pending && recorded
              ? 'Submit the recorded decision for sign-off.'
              : recorded && ['prototype.artifact', 'research.finding'].includes(a.id)
                ? 'Record an observation and its source; an assumption is not a finding.'
                : a.id === 'launch.readiness' && recorded
                  ? 'Record a release check you have actually finished.'
                  : recorded
                    ? 'Review the existing response against this exercise.'
                    : evidence
                      ? 'Related product work is available to review.'
                      : null;
        return {
          key: a.id,
          title: QUESTIONS_BY_KEY.get(a.id)?.output ?? a.label,
          href:
            pending && a.done
              ? `/products/${p.id}/journey?stage=${stage}&activity=${a.id}`
              : activityHref(p.id, stage, a),
          required: a.required,
          done,
          state,
          reason,
          credit: a.xp,
          lock: done ? null : col?.blockers.length ? `First: ${col.blockers[0].blockedByLabel}` : lock
        };
      });
      const core = lessons.filter((a) => a.required),
        done = core.filter((a) => a.done).length,
        complete = core.length > 0 && done === core.length;
      if (!complete && !previous) previous = def.title;
      return { id: def.id, title: def.title, lessons, done, total: core.length, complete, lock };
    });
    const all = units.flatMap((u) => u.lessons).filter((l) => l.required),
      missing = all.filter((l) => !l.done).map((l) => l.title);
    return {
      stage,
      units,
      done: all.length - missing.length,
      total: all.length,
      ready: s.complete && !missing.length,
      missing,
      lock: worldLock,
      recognised,
      checkpoint: stamps.has(stampId('checkpoint', stage)),
      finished: stamps.has(stampId('world', stage))
    };
  });
}
export const currentLesson = (world?: World) =>
  world?.units.flatMap((u) => u.lessons).find((l) => l.required && !l.done && !l.lock) ?? null;
