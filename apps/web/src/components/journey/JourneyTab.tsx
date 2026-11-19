import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, BadgeCheck, Flag, Lock, Sparkles, Star, Trophy, Zap } from 'lucide-react';
import type { JourneyV2, Product } from '@sv/shared';
import { useJourney } from '../../api/journey';
import { Button, Card, cx, Spinner } from '../ui';
import { useToast } from '../Toast';
import { CheckpointPanel } from './CheckpointPanel';
import { JourneyMap } from './JourneyMap';
import { LessonPlayer } from './LessonPlayer';

/**
 * The product's journey tab — the default screen for a product.
 *
 * It shows one thing: the path from idea to improvement, where you are on it,
 * and what to do next. Opening a lesson or a checkpoint happens in place, and
 * the map behind it updates from the server's response.
 */
export function JourneyTab({ product }: { product: Product }) {
  const query = useJourney(product.id);
  const toast = useToast();
  const [openLessonId, setOpenLessonId] = useState<string | null>(null);
  const [openWorldId, setOpenWorldId] = useState<string | null>(null);
  const [justPassed, setJustPassed] = useState<string | null>(null);

  // A deep link (?lesson=w1.u1.l1) or a notification can open a lesson directly.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('lesson');
    if (fromUrl) setOpenLessonId(fromUrl);
  }, []);

  if (query.isLoading) return <Spinner label="Loading your journey" />;

  if (query.isError || !query.data) {
    return (
      <div role="alert" className="rounded-lg border border-rose-200 bg-white p-5 text-sm dark:border-rose-900 dark:bg-zinc-900">
        <p className="font-semibold text-rose-900 dark:text-rose-200">We could not load this product's journey.</p>
        <p className="mt-1 text-slate-600 dark:text-zinc-400">{(query.error as Error | undefined)?.message ?? 'Please try again.'}</p>
        <Button className="mt-3" variant="secondary" onClick={() => void query.refetch()}>Try again</Button>
      </div>
    );
  }

  const { journey } = query.data;
  const currentWorld = journey.currentWorld;
  const openWorld = openWorldId ? journey.worlds.find((w) => w.id === openWorldId) ?? null : null;

  return (
    <div className="space-y-5">
      {/* Where you are, and what to do next */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700 dark:text-blue-400">Your journey</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900 dark:text-zinc-50">
                {journey.isComplete ? 'Idea to improvement, complete' : `World ${currentWorld.index}: ${currentWorld.title}`}
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
                {journey.isComplete
                  ? 'Every lesson is done and every checkpoint has passed.'
                  : `${journey.lessonsComplete} of ${journey.lessonsTotal} lessons complete across eight worlds.`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-zinc-50">{journey.overallPercent}%</p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-zinc-400">Journey</p>
            </div>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-800" role="progressbar" aria-valuenow={journey.overallPercent} aria-valuemin={0} aria-valuemax={100} aria-label="Overall journey progress">
            <div className={cx('h-full rounded-full transition-all duration-700', journey.isComplete ? 'bg-emerald-500' : 'bg-gradient-to-r from-blue-600 to-indigo-500')} style={{ width: `${journey.overallPercent}%` }} />
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat icon={<Trophy className="h-3.5 w-3.5" />} label="Worlds" value={`${journey.worldsComplete}/8`} />
            <Stat icon={<Flag className="h-3.5 w-3.5" />} label="Checkpoints" value={`${journey.checkpointsPassed}/8`} />
            <Stat icon={<Star className="h-3.5 w-3.5" />} label="Lessons" value={`${journey.lessonsComplete}/${journey.lessonsTotal}`} />
            <Stat icon={<Zap className="h-3.5 w-3.5" />} label="Journey XP" value={`${journey.earnedJourneyXp}`} />
          </dl>
        </Card>

        {/* The recommended lesson, visually prominent */}
        <NextUpCard journey={journey} onStart={(id) => setOpenLessonId(id)} onOpenCheckpoint={() => setOpenWorldId(currentWorld.id)} />
      </div>

      {justPassed && (
        <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 dark:border-emerald-900 dark:bg-emerald-950/30">
          <Sparkles className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm text-emerald-900 dark:text-emerald-200">
            Checkpoint passed — <span className="font-semibold">{justPassed}</span> is now open.
          </p>
        </div>
      )}

      {/* The path */}
      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">The path</h3>
          <p className="text-[11px] text-slate-500 dark:text-zinc-500">Worlds unlock as you pass their checkpoints</p>
        </div>
        <JourneyMap
          journey={journey}
          focusLessonId={journey.nextLesson?.id ?? null}
          onOpenLesson={(lessonId) => setOpenLessonId(lessonId)}
          onOpenCheckpoint={(worldId) => setOpenWorldId(worldId)}
          onLocked={(reason) => toast.info(reason)}
        />
      </Card>

      {openLessonId && (
        <LessonPlayer
          productId={product.id}
          lessonId={openLessonId}
          onClose={() => setOpenLessonId(null)}
          onNext={(next) => {
            if (next) setOpenLessonId(next);
            else setOpenLessonId(null);
          }}
        />
      )}

      {openWorld && (
        <CheckpointPanel
          productId={product.id}
          world={openWorld}
          onClose={() => setOpenWorldId(null)}
          onPassed={(nextWorldTitle) => {
            setOpenWorldId(null);
            setJustPassed(nextWorldTitle ?? 'The next world');
            void query.refetch();
          }}
        />
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-800/40">
      <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-500">
        <span className="text-slate-400 dark:text-zinc-600">{icon}</span>
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-bold tabular-nums text-slate-900 dark:text-zinc-100">{value}</dd>
    </div>
  );
}

function NextUpCard({
  journey,
  onStart,
  onOpenCheckpoint
}: {
  journey: JourneyV2;
  onStart: (lessonId: string) => void;
  onOpenCheckpoint: () => void;
}) {
  const next = journey.nextLesson;
  const world = next ? journey.worlds.find((w) => w.id === next.worldId) : null;
  const unit = next && world ? world.units.find((u) => u.id === next.unitId) : null;
  const checkpointReady = journey.currentWorld.checkpoint.state === 'current' || journey.currentWorld.checkpoint.state === 'available';

  return (
    <Card className="flex flex-col justify-between border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 dark:border-blue-900 dark:from-blue-950/50 dark:to-indigo-950/40">
      <div>
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700 dark:text-blue-400">
          <BadgeCheck className="h-3.5 w-3.5" /> {checkpointReady && !next ? 'Checkpoint ready' : 'Up next'}
        </p>

        {next && world && unit ? (
          <>
            <h3 className="mt-1.5 text-base font-semibold leading-snug text-slate-900 dark:text-zinc-50">{next.lesson.title}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-zinc-400">{next.lesson.summary}</p>
            <p className="mt-2 text-[11px] font-medium text-slate-500 dark:text-zinc-500">
              World {world.index} · {world.title} · {unit.title}
            </p>
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
              <Star className="h-3 w-3" /> {next.xp} XP
            </p>
          </>
        ) : journey.isComplete ? (
          <>
            <h3 className="mt-1.5 text-base font-semibold text-slate-900 dark:text-zinc-50">You finished every world</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-zinc-400">
              Revisit any lesson to sharpen the product, or start the next product.
            </p>
            <Link to="/products" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 underline dark:text-blue-400">
              View all products <ArrowRight className="h-3 w-3" />
            </Link>
          </>
        ) : (
          <>
            <h3 className="mt-1.5 text-base font-semibold text-slate-900 dark:text-zinc-50">{journey.currentWorld.checkpoint.title}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-zinc-400">
              All lessons in {journey.currentWorld.title} are done — pass the checkpoint to open the next world.
            </p>
          </>
        )}
      </div>

      {next ? (
        <Button className="mt-3 w-full" icon={<ArrowRight className="h-4 w-4" />} onClick={() => onStart(next.id)}>
          Start lesson
        </Button>
      ) : checkpointReady ? (
        <Button className="mt-3 w-full" icon={<Flag className="h-4 w-4" />} onClick={onOpenCheckpoint}>
          Open checkpoint
        </Button>
      ) : null}
    </Card>
  );
}

/** Small helper used by other surfaces that need to explain a lock consistently. */
export function lockText(reason: string | null): string {
  return reason ? reason : 'Finish the previous step to unlock this.';
}

export function LockNote({ reason }: { reason: string | null }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-slate-500 dark:text-zinc-500">
      <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
      {lockText(reason)}
    </p>
  );
}
