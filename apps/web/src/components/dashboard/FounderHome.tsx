import { Link, useSearchParams } from 'react-router';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleDot,
  ChevronRight,
  Flag,
  Gauge,
  Layers3,
  Mic,
  Settings2,
  Wand2
} from 'lucide-react';
import {
  buildJourney,
  CHAPTER_BRIEFS,
  nextWork,
  PATH_STAGES,
  productHealth,
  type Product,
  type WorkspaceData
} from '@sv/shared';
import { useCollaboration } from '../../api/collaboration';
import { useDrafts, useGame, useLoadSamples, useSession } from '../../api/hooks';
import { useNewProduct, useVoiceDictation } from '../Layout';
import { useMaterialsMap } from '../ProductBits';
import { BuildPlate } from '../journey/BuildPlate';
import { stageIcon } from '../journey/JourneyMap';
import { Button, Select } from '../ui';

function ChapterIndex({ product, journey }: { product?: Product; journey?: ReturnType<typeof buildJourney> }) {
  return (
    <section aria-labelledby="chapter-index">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="sv-kicker">Chapter index</p>
          <h2 id="chapter-index" className="mt-1 text-2xl font-semibold tracking-tight">
            Your product journey
          </h2>
        </div>
        <p className="text-xs text-zinc-500">
          {journey ? `${journey.completedCount} of 8 milestones complete` : 'Eight chapters · revisit any time'}
        </p>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PATH_STAGES.map((stage, i) => {
          const s = journey?.path[i],
            Icon = stageIcon(stage),
            current = s?.id === product?.stage && !!product;
          const body = (
            <>
              <div className="flex items-center justify-between">
                <span className={`sv-icon ${current ? '!bg-[#1e5965] !text-white' : ''}`}>
                  <Icon size={19} />
                </span>
                <span className="font-mono text-[11px] text-zinc-500">CH / {String(i + 1).padStart(2, '0')}</span>
              </div>
              <h3 className="mt-4 flex items-center justify-between text-base font-semibold">
                {stage}
                {product && <ArrowUpRight size={14} className="text-zinc-400" />}
              </h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{CHAPTER_BRIEFS[stage]}</p>
              {s && (
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
                    <span
                      className={
                        current || s.complete ? 'font-semibold text-teal-700 dark:text-teal-300' : 'text-zinc-500'
                      }
                    >
                      {s.complete ? 'Complete' : current ? 'Current chapter' : s.done ? 'In progress' : 'Not started'}
                    </span>
                    <span className="tabular-nums text-zinc-500">
                      {s.done}/{s.total} core
                    </span>
                  </div>
                  <progress
                    aria-label={`${stage} core activities`}
                    className="sv-progress"
                    value={s.done}
                    max={s.total}
                  />
                </div>
              )}
            </>
          );
          return (
            <li key={stage} className={`sv-sheet ${current ? 'border-teal-600 ring-1 ring-teal-600/20' : ''}`}>
              {product ? (
                <Link
                  className="block h-full rounded-xl p-4 hover:bg-teal-500/5"
                  to={`/products/${product.id}/journey?stage=${stage}`}
                >
                  {body}
                </Link>
              ) : (
                <div className="p-4">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ActiveProduct({ product, data }: { product: Product; data: WorkspaceData }) {
  const me = useSession(),
    game = useGame(),
    drafts = useDrafts(),
    team = useCollaboration(product.id),
    materials = useMaterialsMap(data.materials);
  const journey = team.data?.journey ?? buildJourney(product, { materials });
  const recommendations = team.data?.recommendations ?? [];
  const work = nextWork(product, journey, recommendations, drafts.data),
    health = productHealth(product, materials);
  const attention = recommendations.filter((r) => r.priority < 6).slice(0, 3);
  const missing = journey.current.activities.find((a) => a.required && !a.done);
  return (
    <>
      <section className="sv-build-card">
        <div className="relative z-10 min-w-0 p-6 sm:p-8">
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#a5dcce]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#a5dcce]" /> Continue building
          </p>
          <p className="mt-4 text-sm font-medium text-[#b9d4da]">
            {product.name} <span className="mx-1 text-[#73a5ad]">/</span> {product.stage}
          </p>
          <h2 className="mt-1.5 max-w-xl text-[clamp(1.5rem,3vw,2.5rem)] font-semibold leading-tight tracking-tight">
            {work.title}
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#c3dadd]">{work.reason}</p>
          <Link
            to={work.href}
            className="mt-5 inline-flex min-h-11 items-center gap-3 rounded-md bg-[#d4efda] px-4 text-sm font-bold text-[#143f43] hover:bg-white"
          >
            {work.action}
            <ArrowRight size={16} />
          </Link>
        </div>
        <div className="relative hidden min-w-0 self-center sm:block">
          <BuildPlate annotated={false} />
        </div>
      </section>
      <section
        aria-label="Your progress"
        className="sv-sheet grid grid-cols-2 divide-x divide-zinc-200 overflow-hidden sm:grid-cols-4 dark:divide-zinc-700"
      >
        {[
          ['Journey progress', `${journey.overallPercent}%`],
          ['Milestones', `${journey.completedCount} / 8`],
          ['Total experience', game.data ? `${game.data.xp} XP` : '—'],
          ['Builder level', game.data ? `${game.data.level} · ${game.data.levelTitle}` : '—']
        ].map(([label, value]) => (
          <div key={label} className="p-4">
            <p className="text-[11px] font-medium text-zinc-500">{label}</p>
            <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums">{value}</p>
          </div>
        ))}
      </section>
      {me.user.showStreak && game.data && (
        <p className="text-xs text-zinc-500">{game.data.streakDays}-day activity streak · work at your own pace.</p>
      )}
      <ChapterIndex product={product} journey={journey} />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="sv-sheet p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Flag size={17} className="text-teal-700" /> Needs attention
          </h2>
          {team.isError ? (
            <p className="mt-3 text-sm">
              Could not check dependencies.{' '}
              <button className="sv-link" onClick={() => team.refetch()}>
                Retry
              </button>
            </p>
          ) : team.isLoading ? (
            <p className="mt-3 text-xs text-zinc-500">Checking team activity…</p>
          ) : attention.length ? (
            <ul className="mt-3 space-y-3">
              {attention.map((r) => (
                <li key={r.id}>
                  <Link
                    className="sv-link text-sm"
                    to={
                      r.activityKey.startsWith('task:')
                        ? `/products/${product.id}/tasks`
                        : `/products/${product.id}/journey?stage=${r.stage}&activity=${r.activityKey}`
                    }
                  >
                    {r.label}
                  </Link>
                  <p className="text-xs text-zinc-500">{r.because}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">No overdue tasks or recorded blockers.</p>
          )}
          {missing && (
            <p className="mt-3 text-xs leading-5 text-zinc-500">
              Still needed in {product.stage}: {missing.label}
            </p>
          )}
        </section>
        <section className="sv-sheet p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Gauge size={18} className="text-teal-700" /> Product health{' '}
            <span className="ml-auto text-sm tabular-nums">{health.score}/100</span>
          </h2>
          <p className="mt-3 text-sm leading-6 text-zinc-500">
            A snapshot of recorded work and estimated economics. Not proof of demand, safety or engineering readiness.
          </p>
          <details className="mt-3 text-xs">
            <summary className="sv-link cursor-pointer">How the score is calculated</summary>
            <ul className="mt-2 space-y-1 leading-5 text-zinc-600 dark:text-zinc-300">
              <li>
                35% · Required questions answered through {product.stage}: {health.parts.discovery}%.
              </li>
              <li>
                25% · Price, cost inputs{product.productKind === 'physical' ? ' and materials' : ''} recorded:{' '}
                {health.parts.costs}%.
              </li>
              <li>
                25% · Estimated gross margin relative to 50% (no credit with no recorded cost): {health.parts.margin}%.
              </li>
              <li>15% · Share of tasks finished: {health.parts.tasks}% (neutral 50% with no tasks).</li>
            </ul>
          </details>
        </section>
      </div>
      <section className="sv-sheet p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Recent accomplishments</h2>
          <Link className="sv-link text-xs" to="/achievements">
            All achievements →
          </Link>
        </div>
        {game.data?.recent.length ? (
          <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-700">
            {game.data.recent.slice(0, 3).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <Check size={15} className="shrink-0 text-teal-700" />
                  {r.label}
                </span>
                <span className="whitespace-nowrap font-mono text-xs text-zinc-500">+{r.points} XP</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">
            {game.isError
              ? 'Progress is temporarily unavailable.'
              : game.isLoading
                ? 'Loading experience ledger…'
                : 'Your first credited action will appear here.'}
          </p>
        )}
      </section>
    </>
  );
}
export function FounderHome({ data }: { data: WorkspaceData }) {
  const me = useSession(),
    openNew = useNewProduct(),
    openVoice = useVoiceDictation(),
    samples = useLoadSamples(),
    drafts = useDrafts();
  const [params, setParams] = useSearchParams();
  const active = data.products.filter((p) => p.stage !== 'Retired');
  const product =
    active.find((p) => p.id === params.get('product')) ??
    active.find((p) => p.id === drafts.data?.find((d) => active.some((p) => p.id === d.productId))?.productId) ??
    active[0];
  return (
    <div className="mx-auto max-w-[1320px] space-y-6 px-4 py-6 sm:px-7 lg:px-10 lg:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4 text-xs dark:border-zinc-800">
        <span className="inline-flex items-center gap-2 text-zinc-500">
          <Layers3 size={15} />
          {me.workspace.name}
          <ChevronRight size={13} /> <strong className="text-zinc-700 dark:text-zinc-200">Founder workspace</strong>
        </span>
        <Link className="inline-flex items-center gap-2 text-zinc-500 hover:underline" to="/?view=workspace">
          <Settings2 size={14} /> Workspace overview
        </Link>
      </div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="sv-kicker">Field guide / Dashboard</p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-[-.045em] sm:text-4xl">
            {product ? 'Your building desk' : 'Let’s build your product.'}
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            {product
              ? 'Pick up where you left off, one useful activity at a time.'
              : 'Start with an idea. We’ll help you decide what to do next.'}
          </p>
        </div>
        {product && (
          <Select
            aria-label="Current product"
            className="w-full sm:!w-auto sm:max-w-56 text-sm"
            value={product.id}
            onChange={(e) => setParams({ product: e.target.value, view: 'journey' })}
          >
            {active.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
      </header>
      {product ? (
        <ActiveProduct key={product.id} product={product} data={data} />
      ) : (
        <>
          <section className="sv-build-card">
            <div className="p-6 sm:p-8">
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#a5dcce]">
                <CircleDot size={14} /> Your starting point
              </p>
              <h2 className="mt-5 text-3xl font-semibold tracking-tight">Give your idea a name.</h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-[#c3dadd]">
                Your first chapter turns a rough idea into a concept brief. No technical background or business plan
                needed.
              </p>
              <button
                onClick={openNew}
                className="mt-5 inline-flex min-h-11 items-center gap-3 rounded-md bg-[#d4efda] px-5 text-sm font-bold text-[#143f43] hover:bg-white"
              >
                Create a product <ArrowRight size={16} />
              </button>
            </div>
            <div className="hidden self-center sm:block">
              <BuildPlate annotated={false} />
            </div>
          </section>
          <ChapterIndex />
          <div className="flex flex-wrap gap-3">
            {!me.demo && (
              <Button variant="secondary" icon={<Mic size={15} />} onClick={openVoice}>
                Use voice capture
              </Button>
            )}
            {!data.products.length && (
              <Button
                variant="secondary"
                icon={<Wand2 size={15} />}
                onClick={() => samples.mutate()}
                loading={samples.isPending}
              >
                Explore sample products
              </Button>
            )}
            {data.products.length > 0 && (
              <Link to="/products" className="sv-link text-sm">
                View archived products →
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
