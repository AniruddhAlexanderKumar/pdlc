import { Link } from 'react-router';
import { ArrowRight, Compass, Flag, Plus, Star, Trophy, Zap } from 'lucide-react';
import { useJourney } from '../api/journey';
import { useLoadSamples, useSession, useWorkspaceData } from '../api/hooks';
import { useNewProduct } from '../components/Layout';
import { JourneyMap } from '../components/journey/JourneyMap';
import { Button, Card, cx, EmptyState, Spinner } from '../components/ui';

/**
 * The home screen: the journey.
 *
 * A returning founder lands on their product's path, not a dashboard of
 * numbers. The recommended lesson is the most prominent thing on the page, and
 * the map below it shows the whole route so progress is legible at a glance.
 */
export function HomeJourneyPage() {
  const me = useSession();
  const { data, isLoading, isError, refetch } = useWorkspaceData();
  const openNew = useNewProduct();
  const samples = useLoadSamples();

  if (isLoading) return <Spinner label="Loading your journey" />;
  if (isError || !data) {
    return (
      <div className="m-6 rounded-lg border border-rose-200 bg-white p-5 text-sm dark:border-rose-900 dark:bg-zinc-900" role="alert">
        <p>We couldn’t load your workspace.</p>
        <Button className="mt-3" variant="secondary" onClick={() => void refetch()}>Try again</Button>
      </div>
    );
  }

  if (data.products.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-10 md:px-8">
        <EmptyState
          icon={<Compass className="h-6 w-6" />}
          title="Start your journey"
          body="Every product follows the same eight worlds, from first idea to improvement. Create a product and the path opens at World 1."
          action={<Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>Create a product</Button>}
        />
        {!me.demo && (
          <div className="mt-4 text-center">
            <Button variant="ghost" loading={samples.isPending} onClick={() => samples.mutate()}>
              Or explore with sample products
            </Button>
          </div>
        )}
      </div>
    );
  }

  // The product being journeyed: the first one, since a workspace may hold several.
  const product = data.products[0];
  return <HomeJourney productId={product.id} productName={product.name} productCount={data.products.length} onCreate={openNew} />;
}

function HomeJourney({ productId, productName, productCount, onCreate }: { productId: string; productName: string; productCount: number; onCreate: () => void }) {
  const query = useJourney(productId);
  const me = useSession();

  if (query.isLoading) return <Spinner label="Loading your journey" />;
  if (query.isError || !query.data) {
    return (
      <div className="m-6 rounded-lg border border-rose-200 bg-white p-5 text-sm dark:border-rose-900 dark:bg-zinc-900" role="alert">
        <p className="font-semibold">We could not load the journey.</p>
        <p className="mt-1 text-slate-600 dark:text-zinc-400">{(query.error as Error | undefined)?.message ?? 'Please try again.'}</p>
        <Button className="mt-3" variant="secondary" onClick={() => void query.refetch()}>Try again</Button>
      </div>
    );
  }

  const { journey } = query.data;
  const next = journey.nextLesson;
  const world = next ? journey.worlds.find((w) => w.id === next.worldId) : journey.currentWorld;
  const checkpointReady = journey.currentWorld.checkpoint.state === 'current' || journey.currentWorld.checkpoint.state === 'available';

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-5 py-7 md:px-8 md:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-5 dark:border-zinc-800">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-blue-700 dark:text-blue-400">{me.workspace.name} / Journey</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-zinc-50">{productName}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
            {journey.isComplete ? 'Every world complete — idea to improvement.' : `World ${journey.currentWorld.index} of 8 · ${journey.lessonsComplete} of ${journey.lessonsTotal} lessons`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/products/${productId}/overview`} className="inline-flex min-h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-semibold hover:bg-slate-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
            Product details
          </Link>
          {productCount > 1 && (
            <Link to="/products" className="inline-flex min-h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-semibold hover:bg-slate-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
              All products
            </Link>
          )}
          <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={onCreate}>New product</Button>
        </div>
      </header>

      {/* Stats */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric icon={<Trophy className="h-4 w-4" />} label="Worlds complete" value={`${journey.worldsComplete}/8`} />
        <Metric icon={<Flag className="h-4 w-4" />} label="Checkpoints passed" value={`${journey.checkpointsPassed}/8`} />
        <Metric icon={<Star className="h-4 w-4" />} label="Lessons complete" value={`${journey.lessonsComplete}/${journey.lessonsTotal}`} />
        <Metric icon={<Zap className="h-4 w-4" />} label="Journey XP" value={String(journey.earnedJourneyXp)} />
      </dl>

      {/* The next lesson — the most prominent element on the page */}
      <Card className={cx('overflow-hidden border-2 p-0', checkpointReady && !next ? 'border-emerald-300 dark:border-emerald-800' : 'border-blue-300 dark:border-blue-800')}>
        <div className="bg-gradient-to-br from-blue-600 to-indigo-600 px-5 py-4 text-white dark:from-blue-700 dark:to-indigo-700">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-blue-100">
            {checkpointReady && !next ? 'Checkpoint ready' : journey.isComplete ? 'Journey complete' : 'Your next lesson'}
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
            {next ? next.lesson.title : journey.isComplete ? 'You finished all eight worlds' : journey.currentWorld.checkpoint.title}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-blue-50">
            {next ? next.lesson.summary : journey.isComplete ? 'Revisit any lesson to sharpen the product, or take a new product through the same path.' : `Every lesson in ${journey.currentWorld.title} is done. Pass the checkpoint to open the next world.`}
          </p>
          {next && world && (
            <p className="mt-2 text-xs font-medium text-blue-100">
              World {world.index} · {world.title} · {next.xp} XP
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
          {next ? (
            <Link to={`/products/${productId}/journey?lesson=${encodeURIComponent(next.id)}`} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500">
              Start lesson <ArrowRight className="h-4 w-4" />
            </Link>
          ) : checkpointReady ? (
            <Link to={`/products/${productId}/journey`} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700">
              Open checkpoint <Flag className="h-4 w-4" />
            </Link>
          ) : (
            <Link to={`/products/${productId}/journey`} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800">
              Open the journey <ArrowRight className="h-4 w-4" />
            </Link>
          )}
          <div className="ml-auto flex items-center gap-2">
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-800" role="progressbar" aria-valuenow={journey.overallPercent} aria-valuemin={0} aria-valuemax={100} aria-label="Overall journey progress">
              <div className="h-full rounded-full bg-blue-600 transition-all duration-700" style={{ width: `${journey.overallPercent}%` }} />
            </div>
            <span className="text-xs font-semibold tabular-nums text-slate-600 dark:text-zinc-400">{journey.overallPercent}%</span>
          </div>
        </div>
      </Card>

      {/* The whole path */}
      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">The whole path</h2>
          <Link to={`/products/${productId}/journey`} className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400">Open in product</Link>
        </div>
        <JourneyMap
          journey={journey}
          focusLessonId={next?.id ?? null}
          onOpenLesson={(lessonId) => {
            window.location.assign(`/products/${productId}/journey?lesson=${encodeURIComponent(lessonId)}`);
          }}
          onOpenCheckpoint={() => {
            window.location.assign(`/products/${productId}/journey`);
          }}
        />
      </Card>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-500">
        <span className="text-blue-600 dark:text-blue-400">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-zinc-50">{value}</dd>
    </div>
  );
}
