import { memo, useMemo } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Beaker,
  Boxes,
  Check,
  CircleDashed,
  ClipboardList,
  Flag,
  FlaskConical,
  Lightbulb,
  Lock,
  Megaphone,
  PenTool,
  Rocket,
  Search,
  Sparkles,
  Star
} from 'lucide-react';
import type { CheckpointProgress, LessonProgress, UnitProgress, WorldProgress, JourneyV2 } from '@sv/shared';
import { cx } from '../ui';

/** One recognisable icon per world (the eight lifecycle stages). */
const WORLD_ICONS: Record<string, typeof Lightbulb> = {
  Idea: Lightbulb,
  Research: Search,
  Planning: ClipboardList,
  Design: PenTool,
  Prototype: Boxes,
  Testing: FlaskConical,
  Launch: Rocket,
  Improvement: Megaphone
};

/** Tone per world so each stretch of the path is distinguishable. */
const WORLD_TONE: Record<string, { ring: string; text: string; chip: string; line: string; glow: string }> = {
  Idea: { ring: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-400', line: 'bg-amber-400/40', glow: 'shadow-amber-500/25' },
  Research: { ring: 'bg-sky-600', text: 'text-sky-700 dark:text-sky-400', chip: 'bg-sky-500/10 text-sky-700 dark:text-sky-400', line: 'bg-sky-400/40', glow: 'shadow-sky-500/25' },
  Planning: { ring: 'bg-indigo-600', text: 'text-indigo-700 dark:text-indigo-400', chip: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400', line: 'bg-indigo-400/40', glow: 'shadow-indigo-500/25' },
  Design: { ring: 'bg-fuchsia-600', text: 'text-fuchsia-700 dark:text-fuchsia-400', chip: 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400', line: 'bg-fuchsia-400/40', glow: 'shadow-fuchsia-500/25' },
  Prototype: { ring: 'bg-[#16598d]', text: 'text-[#16598d] dark:text-blue-400', chip: 'bg-blue-500/10 text-blue-700 dark:text-blue-400', line: 'bg-blue-400/40', glow: 'shadow-blue-500/25' },
  Testing: { ring: 'bg-teal-600', text: 'text-teal-700 dark:text-teal-400', chip: 'bg-teal-500/10 text-teal-700 dark:text-teal-400', line: 'bg-teal-400/40', glow: 'shadow-teal-500/25' },
  Launch: { ring: 'bg-rose-600', text: 'text-rose-700 dark:text-rose-400', chip: 'bg-rose-500/10 text-rose-700 dark:text-rose-400', line: 'bg-rose-400/40', glow: 'shadow-rose-500/25' },
  Improvement: { ring: 'bg-emerald-600', text: 'text-emerald-700 dark:text-emerald-400', chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', line: 'bg-emerald-400/40', glow: 'shadow-emerald-500/25' }
};

const NEUTRAL_TONE = { ring: 'bg-slate-400', text: 'text-slate-600 dark:text-zinc-400', chip: 'bg-slate-500/10 text-slate-600 dark:text-zinc-400', line: 'bg-slate-300/50', glow: 'shadow-slate-400/20' };

function toneFor(stage: string) {
  return WORLD_TONE[stage] ?? NEUTRAL_TONE;
}

export interface JourneyMapProps {
  journey: JourneyV2;
  /** Open a lesson by id. Locked lessons call `onLocked` instead. */
  onOpenLesson: (lessonId: string) => void;
  onOpenCheckpoint: (worldId: string) => void;
  onLocked?: (reason: string) => void;
  /** Highlight this lesson even if the engine picks another. */
  focusLessonId?: string | null;
}

/**
 * The journey map: one connected path, world by world, unit by unit.
 *
 * Reading order is the only reading order — down the page, in curriculum order.
 * Every node is a real control: completed and available lessons open, locked
 * nodes explain exactly what unlocks them, and checkpoints open once their
 * world's lessons are done.
 */
export const JourneyMap = memo(function JourneyMap({ journey, onOpenLesson, onOpenCheckpoint, onLocked, focusLessonId }: JourneyMapProps) {
  const nextId = focusLessonId ?? journey.nextLesson?.id ?? null;
  const focusRef = useMemo(() => nextId, [nextId]);

  return (
    <div className="relative">
      {/* The spine: one continuous line running behind every node. */}
      <div aria-hidden="true" className="absolute bottom-6 left-[1.4rem] top-6 w-0.5 bg-gradient-to-b from-slate-200 via-slate-200 to-transparent sm:left-6 dark:from-zinc-800 dark:via-zinc-800" />

      <ol className="relative space-y-2">
        {journey.worlds.map((world) => (
          <WorldSection
            key={world.id}
            world={world}
            isCurrent={journey.currentWorld.id === world.id}
            focusLessonId={focusRef}
            onOpenLesson={onOpenLesson}
            onOpenCheckpoint={onOpenCheckpoint}
            onLocked={onLocked}
          />
        ))}
      </ol>

      <div className="relative mt-2 flex items-center gap-3 pl-1 sm:pl-3">
        <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2', journey.isComplete ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-dashed border-slate-300 bg-white text-slate-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-600')}>
          {journey.isComplete ? <Star className="h-4 w-4" /> : <CircleDashed className="h-4 w-4" />}
        </div>
        <p className="text-sm text-slate-600 dark:text-zinc-400">
          {journey.isComplete ? 'Every world complete. Your product has been taken from idea to improvement.' : 'The path ends here once all eight worlds are complete.'}
        </p>
      </div>
    </div>
  );
});

function WorldSection({
  world,
  isCurrent,
  focusLessonId,
  onOpenLesson,
  onOpenCheckpoint,
  onLocked
}: {
  world: WorldProgress;
  isCurrent: boolean;
  focusLessonId: string | null;
  onOpenLesson: (id: string) => void;
  onOpenCheckpoint: (worldId: string) => void;
  onLocked?: (reason: string) => void;
}) {
  const tone = toneFor(world.stage);
  const Icon = WORLD_ICONS[world.stage] ?? Beaker;
  const locked = world.state === 'locked';

  return (
    <li className="relative">
      {/* World milestone header */}
      <div className="relative flex items-start gap-3 py-3 sm:gap-4">
        <div
          className={cx(
            'relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 shadow-sm transition',
            locked ? 'border-slate-300 bg-slate-100 text-slate-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-600' : `${tone.ring} border-transparent text-white shadow-lg ${isCurrent ? tone.glow : ''}`
          )}
          aria-hidden="true"
        >
          {locked ? <Lock className="h-5 w-5" /> : world.complete ? <BadgeCheck className="h-6 w-6" /> : <Icon className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cx('text-[11px] font-bold uppercase tracking-[0.14em]', locked ? 'text-slate-400 dark:text-zinc-600' : tone.text)}>
              World {world.index}
            </span>
            {world.state === 'completed' && <Pill tone="emerald">Completed</Pill>}
            {isCurrent && <Pill tone="blue">You are here</Pill>}
            {world.state === 'available' && <Pill tone="slate">Open</Pill>}
            {locked && <Pill tone="slate">Locked</Pill>}
          </div>
          <h3 className={cx('mt-0.5 text-base font-semibold tracking-tight sm:text-lg', locked ? 'text-slate-400 dark:text-zinc-600' : 'text-slate-900 dark:text-zinc-100')}>{world.title}</h3>
          <p className={cx('mt-0.5 text-xs leading-5 sm:text-sm', locked ? 'text-slate-400 dark:text-zinc-600' : 'text-slate-600 dark:text-zinc-400')}>{world.blurb}</p>
          {!locked && (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 w-full max-w-[14rem] overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-800" role="progressbar" aria-valuenow={world.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${world.title} progress`}>
                <div className={cx('h-full rounded-full transition-all duration-500', world.complete ? 'bg-emerald-500' : tone.ring)} style={{ width: `${world.progress}%` }} />
              </div>
              <span className="shrink-0 text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                {world.completed}/{world.total}
              </span>
            </div>
          )}
          {locked && world.lockReason && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-500">
              <Lock className="h-3 w-3 shrink-0" aria-hidden="true" /> {world.lockReason}
            </p>
          )}
        </div>
        {world.complete && (
          <span className="hidden shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 sm:flex dark:bg-emerald-500/10 dark:text-emerald-400">
            <Sparkles className="h-3 w-3" /> {world.checkpoint.xp} XP
          </span>
        )}
      </div>

      {/* Units and their lessons, indented under the spine */}
      <div className={cx('space-y-1 pl-6 sm:pl-8', locked && 'pointer-events-none opacity-60')}>
        {world.units.map((unit) => (
          <UnitBlock key={unit.id} unit={unit} worldStage={world.stage} focusLessonId={focusLessonId} onOpenLesson={onOpenLesson} onLocked={onLocked} />
        ))}

        {/* Checkpoint node closes the world */}
        <CheckpointNode
          checkpoint={world.checkpoint}
          worldTitle={world.title}
          onOpen={() => onOpenCheckpoint(world.id)}
          onLocked={onLocked}
        />
      </div>
    </li>
  );
}

function UnitBlock({
  unit,
  worldStage,
  focusLessonId,
  onOpenLesson,
  onLocked
}: {
  unit: UnitProgress;
  worldStage: string;
  focusLessonId: string | null;
  onOpenLesson: (id: string) => void;
  onLocked?: (reason: string) => void;
}) {
  const tone = toneFor(worldStage);
  return (
    <div className="relative py-1">
      <div className="flex items-center gap-2 py-1">
        <span className={cx('h-2 w-2 shrink-0 rounded-full', unit.state === 'completed' ? 'bg-emerald-500' : unit.state === 'locked' ? 'bg-slate-300 dark:bg-zinc-700' : tone.ring)} aria-hidden="true" />
        <h4 className={cx('text-xs font-semibold uppercase tracking-wide', unit.state === 'locked' ? 'text-slate-400 dark:text-zinc-600' : 'text-slate-600 dark:text-zinc-300')}>{unit.title}</h4>
        {unit.state === 'completed' && <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-label="Unit complete" />}
        <span className="text-[11px] font-medium text-slate-400 dark:text-zinc-500">{unit.completed}/{unit.total}</span>
      </div>
      <div className="space-y-1">
        {unit.lessons.map((lesson) => (
          <LessonNode
            key={lesson.id}
            lesson={lesson}
            tone={tone}
            isFocus={focusLessonId === lesson.id}
            onOpen={() => onOpenLesson(lesson.id)}
            onLocked={onLocked}
          />
        ))}
      </div>
    </div>
  );
}

function LessonNode({
  lesson,
  tone,
  isFocus,
  onOpen,
  onLocked
}: {
  lesson: LessonProgress;
  tone: ReturnType<typeof toneFor>;
  isFocus: boolean;
  onOpen: () => void;
  onLocked?: (reason: string) => void;
}) {
  const done = lesson.state === 'completed';
  const locked = lesson.state === 'locked';
  const recog = lesson.recognition;

  if (locked) {
    return (
      <button
        type="button"
        onClick={() => onLocked?.(lesson.lockReason ?? 'This lesson is locked.')}
        aria-disabled="true"
        aria-label={`${lesson.lesson.title} — locked. ${lesson.lockReason ?? ''}`}
        title={lesson.lockReason ?? undefined}
        className="group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2 py-2 text-left transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-zinc-800/50"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-slate-200 bg-white text-slate-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-600">
          <Lock className="h-3 w-3" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-400 dark:text-zinc-600">{lesson.lesson.title}</span>
          {/* The world header already states why; a locked unit says what unlocks it. */}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        'group flex w-full items-center gap-2.5 rounded-lg border px-2 py-2 text-left transition focus-visible:ring-2 focus-visible:ring-blue-500',
        isFocus
          ? 'border-blue-300 bg-blue-50/70 shadow-sm hover:bg-blue-50 dark:border-blue-800 dark:bg-blue-500/10 dark:hover:bg-blue-500/15'
          : 'border-transparent hover:bg-slate-50 dark:hover:bg-zinc-800/50'
      )}
      aria-current={isFocus ? 'step' : undefined}
    >
      <span
        className={cx(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition',
          done
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : isFocus
              ? `${tone.ring} border-transparent text-white shadow-md`
              : 'border-slate-300 bg-white text-slate-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-500'
        )}
      >
        {done ? <Check className="h-3.5 w-3.5" /> : isFocus ? <ArrowRight className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block truncate text-sm', done || isFocus ? 'font-semibold text-slate-900 dark:text-zinc-100' : 'font-medium text-slate-700 dark:text-zinc-300')}>
          {lesson.lesson.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-500">
          <span className="font-semibold text-slate-400 dark:text-zinc-500">{lesson.xp} XP</span>
          {recog === 'legacy' && <span className="rounded bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">Recognised from earlier work</span>}
          {recog === 'in_progress' && !done && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">Partly done</span>}
          {recog === 'needs_review' && <span className="rounded bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">Needs review</span>}
          {isFocus && !done && <span className="rounded bg-blue-100 px-1.5 py-0.5 font-semibold text-blue-800 dark:bg-blue-500/15 dark:text-blue-300">Next up</span>}
        </span>
      </span>
    </button>
  );
}

function CheckpointNode({
  checkpoint,
  worldTitle,
  onOpen,
  onLocked
}: {
  checkpoint: CheckpointProgress;
  worldTitle: string;
  onOpen: () => void;
  onLocked?: (reason: string) => void;
}) {
  const passed = checkpoint.passed;
  const locked = checkpoint.state === 'locked';

  return (
    <div className="pt-2">
      <button
        type="button"
        onClick={() => (locked ? onLocked?.(checkpoint.lockReason ?? 'This checkpoint is locked.') : onOpen())}
        aria-disabled={locked}
        className={cx(
          'flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition focus-visible:ring-2 focus-visible:ring-blue-500',
          passed
            ? 'border-emerald-300 bg-emerald-50/70 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-500/10'
            : locked
              ? 'border-dashed border-slate-200 bg-slate-50/60 dark:border-zinc-800 dark:bg-zinc-900/40'
              : 'border-indigo-300 bg-indigo-50/60 shadow-sm hover:bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-500/10'
        )}
      >
        <span
          className={cx(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            passed ? 'bg-emerald-500 text-white' : locked ? 'bg-slate-200 text-slate-400 dark:bg-zinc-800 dark:text-zinc-600' : 'bg-indigo-600 text-white'
          )}
        >
          {passed ? <BadgeCheck className="h-5 w-5" /> : locked ? <Lock className="h-4 w-4" /> : <Flag className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={cx('text-[11px] font-bold uppercase tracking-[0.12em]', passed ? 'text-emerald-700 dark:text-emerald-400' : locked ? 'text-slate-400 dark:text-zinc-600' : 'text-indigo-700 dark:text-indigo-400')}>
              Checkpoint
            </span>
            {!locked && !passed && <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200">{checkpoint.met}/{checkpoint.total} met</span>}
            {passed && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">{checkpoint.xp} XP earned</span>}
          </span>
          <span className={cx('mt-0.5 block truncate text-sm font-semibold', locked ? 'text-slate-400 dark:text-zinc-600' : 'text-slate-900 dark:text-zinc-100')}>{checkpoint.title}</span>
          <span className={cx('mt-0.5 block truncate text-[11px]', locked ? 'text-slate-400 dark:text-zinc-600' : 'text-slate-500 dark:text-zinc-400')}>
            {locked ? `Locked until ${worldTitle} is finished` : passed ? `Unlocked ${worldTitle}'s next world` : checkpoint.deliverable}
          </span>
        </span>
        {!locked && !passed && <ArrowRight className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />}
      </button>
    </div>
  );
}

function Pill({ tone, children }: { tone: 'emerald' | 'blue' | 'slate'; children: React.ReactNode }) {
  const cls =
    tone === 'emerald'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
      : tone === 'blue'
        ? 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300'
        : 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400';
  return <span className={cx('rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', cls)}>{children}</span>;
}
