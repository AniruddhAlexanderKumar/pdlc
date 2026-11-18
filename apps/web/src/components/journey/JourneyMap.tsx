import { memo } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Beaker,
  Boxes,
  Check,
  ClipboardList,
  CircleDashed,
  FlaskConical,
  Lightbulb,
  Lock,
  Megaphone,
  PenTool,
  Rocket,
  Search
} from 'lucide-react';
import { PHASES, stageStateLabel, type Journey, type JourneyStage, type PhaseId, type StageId } from '@sv/shared';
import { cx } from '../ui';

/** One recognisable icon per lifecycle stage. */
const STAGE_ICONS: Record<StageId, typeof Lightbulb> = {
  Idea: Lightbulb,
  Research: Search,
  Planning: ClipboardList,
  Design: PenTool,
  Prototype: Boxes,
  Testing: FlaskConical,
  Launch: Rocket,
  Improvement: Megaphone,
  Retired: CircleDashed
};

const PHASE_TONE: Record<PhaseId, { ring: string; text: string; chip: string; line: string }> = {
  discover: { ring: 'bg-sky-600', text: 'text-sky-700 dark:text-sky-400', chip: 'bg-sky-500/10 text-sky-700 dark:text-sky-400', line: 'bg-sky-500/25' },
  build: { ring: 'bg-[#16598d]', text: 'text-[#16598d] dark:text-blue-400', chip: 'bg-blue-500/10 text-blue-700 dark:text-blue-400', line: 'bg-blue-500/25' },
  grow: { ring: 'bg-emerald-600', text: 'text-emerald-700 dark:text-emerald-400', chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', line: 'bg-emerald-500/25' }
};

export function stageIcon(stage: StageId) {
  return STAGE_ICONS[stage] ?? Beaker;
}

/**
 * The four journey states, as distinct as possible without relying on colour
 * alone: completed = solid tinted + check, current = elevated ring + "You are
 * here", available = outlined, locked = muted + padlock.
 */
function nodeClasses(state: JourneyStage['state']): string {
  switch (state) {
    case 'completed':
      return 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300';
    case 'current':
      return 'border-[#16598d] bg-white text-zinc-900 ring-4 ring-[#16598d]/15 dark:border-blue-500 dark:bg-zinc-900 dark:text-white dark:ring-blue-500/20';
    case 'available':
      return 'border-zinc-300 bg-white text-zinc-800 hover:border-[#16598d]/50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';
    case 'locked':
      return 'border-dashed border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-500';
  }
}

function iconClasses(state: JourneyStage['state'], phase: PhaseId): string {
  switch (state) {
    case 'completed':
      return 'bg-emerald-500 text-white';
    case 'current':
      return cx(PHASE_TONE[phase].ring, 'text-white shadow-sm');
    case 'available':
      return 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400';
    case 'locked':
      return 'bg-zinc-200/70 text-zinc-400 dark:bg-zinc-800/60 dark:text-zinc-600';
  }
}

/**
 * The collaboration line under a stage: what is waiting on review, what is
 * blocked, who is involved. Only rendered when there is something to say, so a
 * quiet stage stays visually clean.
 */
function StageCardSummary({ stage }: { stage: JourneyStage }) {
  const activities = stage.activities;
  const awaitingReview = activities.filter(
    (a) => a.collaboration?.reviewState === 'pending' || a.collaboration?.reviewState === 'changes_requested'
  ).length;
  const blocked = activities.filter((a) => (a.collaboration?.blockers.length ?? 0) > 0).length;
  const owners = new Set(activities.map((a) => a.collaboration?.assigneeName).filter((n): n is string => Boolean(n)));

  if (awaitingReview === 0 && blocked === 0 && owners.size === 0) return null;

  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] leading-4">
      {awaitingReview > 0 && (
        <span className="font-medium text-amber-700 dark:text-amber-400">
          {awaitingReview} awaiting review
        </span>
      )}
      {blocked > 0 && <span className="font-medium text-rose-700 dark:text-rose-400">{blocked} blocked</span>}
      {owners.size > 0 && (
        <span className="truncate text-zinc-500 dark:text-zinc-400">
          {[...owners].slice(0, 2).join(', ')}
          {owners.size > 2 && ` +${owners.size - 2}`}
        </span>
      )}
    </span>
  );
}

function StageNode({
  stage,
  isLast,
  onSelect
}: {
  stage: JourneyStage;
  isLast: boolean;
  onSelect: (s: StageId) => void;
}) {
  const Icon = STAGE_ICONS[stage.id] ?? Beaker;
  const locked = stage.state === 'locked';
  const tone = PHASE_TONE[stage.phase];

  return (
    <li className="relative">
      <button
        type="button"
        onClick={() => onSelect(stage.id)}
        aria-current={stage.state === 'current' ? 'step' : undefined}
        aria-label={`${stage.label} — ${stage.state === 'completed' && !stage.complete ? 'Earlier chapter; work remaining' : stageStateLabel(stage.state)}`}
        className={cx(
          'group flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all',
          nodeClasses(stage.state),
          locked ? 'hover:shadow-sm' : 'hover:-translate-y-0.5 hover:shadow-sm'
        )}
      >
        <span className={cx('relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-transform', iconClasses(stage.state, stage.phase))}>
          <Icon className="h-5 w-5" aria-hidden="true" />
          {stage.complete && (
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-emerald-500 dark:border-zinc-900">
              <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} aria-hidden="true" />
            </span>
          )}
          {locked && (
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-zinc-400 dark:border-zinc-900">
              <Lock className="h-2 w-2 text-white" strokeWidth={3} aria-hidden="true" />
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold">{stage.label}</span>
            {stage.state === 'current' && (
              <span className={cx('rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', tone.chip)}>You are here</span>
            )}
            {stage.state === 'completed' && stage.complete && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                <BadgeCheck className="h-3 w-3" aria-hidden="true" /> Done
              </span>
            )}
            {/* Behind the current stage but not actually finished: say so instead of
                claiming it is done, so a skipped stage is never misleading. */}
            {stage.state === 'completed' && !stage.complete && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                {stage.total - stage.done} left
              </span>
            )}
            {stage.state === 'available' && (
              <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                Ready
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">{stage.guide.purpose}</span>

          {stage.state !== 'locked' ? (
            <>
              <span className="mt-2 flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800">
                  <span
                    className={cx('block h-full rounded-full transition-all duration-500', stage.complete ? 'bg-emerald-500' : tone.ring)}
                    style={{ width: `${stage.progress}%` }}
                  />
                </span>
                <span className="shrink-0 text-[11px] font-medium tabular-nums text-zinc-500">
                  {stage.done}/{stage.total}
                </span>
              </span>
              <StageCardSummary stage={stage} />
            </>
          ) : (
            <span className="mt-1.5 block text-[11px] text-zinc-400 dark:text-zinc-500">{stage.lockReason}</span>
          )}
        </span>
      </button>

      {!isLast && (
        <span aria-hidden="true" className="ml-8 flex h-4 w-0.5 justify-center">
          <span className={cx('h-full w-0.5 rounded', stage.state === 'completed' ? 'bg-emerald-400' : tone.line)} />
        </span>
      )}
    </li>
  );
}

/**
 * The product journey: a vertical progression path grouped into the existing
 * three phases. Reads entirely from a `Journey` built by `buildJourney`, so it
 * never redefines stage order or completion.
 */
export const JourneyMap = memo(function JourneyMap({
  journey,
  onSelect,
  compact = false
}: {
  journey: Journey;
  onSelect: (s: StageId) => void;
  compact?: boolean;
}) {
  const grouped = PHASES.map((phase) => ({
    phase,
    stages: journey.path.filter((s) => s.phase === phase.id)
  }));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Your product journey</p>
        <p className="text-[11px] font-medium tabular-nums text-zinc-500">
          {journey.completedCount}/{journey.totalCount} stages · {journey.overallPercent}% of steps
        </p>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800">
        <div className="h-full rounded-full bg-[#16598d] transition-all duration-700" style={{ width: `${journey.overallPercent}%` }} />
      </div>

      <div className={cx('space-y-4', compact && 'space-y-3')}>
        {grouped.map(({ phase, stages }) => {
          const done = stages.filter((s) => s.complete).length;
          return (
            <section key={phase.id} aria-label={phase.label}>
              <header className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className={cx('text-xs font-bold uppercase tracking-wider', PHASE_TONE[phase.id].text)}>{phase.label}</h3>
                <span className="text-[11px] tabular-nums text-zinc-400">
                  {done}/{stages.length}
                </span>
              </header>
              <p className="mb-2 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">{phase.blurb}</p>
              <ol className="space-y-0">
                {stages.map((s, i) => (
                  <StageNode key={s.id} stage={s} isLast={i === stages.length - 1} onSelect={onSelect} />
                ))}
              </ol>
            </section>
          );
        })}
      </div>

      {/* Retiring is always allowed (the server permits it regardless of the
          checklist), so this affordance is not gated on the Retired node. */}
      {journey.current.id !== 'Retired' && (
        <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => onSelect('Retired')}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[11px] text-zinc-500 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
          >
            <span className="flex items-center gap-1.5">
              <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />
              Retire this product
            </span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
});
