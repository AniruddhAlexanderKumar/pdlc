import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Flame, Gauge, LayoutGrid, List, Plus, Rocket, Search, Sparkles, Target, Wand2 } from 'lucide-react';
import { getStage, nextStage, PHASES, STAGES, type Product, type StageId } from '@sv/shared';
import { useGame, useLoadSamples, useMoveStage, useSession, useWorkspaceData } from '../api/hooks';
import { useNewProduct } from '../components/Layout';
import { ProductCard, productMetrics, ProductThumb, useMaterialsMap } from '../components/ProductBits';
import { Button, Card, CardHeader, cx, GradeBadge, Input, ProgressBar, Select, Spinner, StageBadge, stageStyle } from '../components/ui';
import { useMoney } from '../lib/money';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function Onboarding() {
  const openNew = useNewProduct();
  const samples = useLoadSamples();
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:px-6">
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/30">
          <Rocket className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Let’s get your first product moving</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
          Every product goes through three steps. Answer a few questions, track your costs, and level it up with suggestions. You earn XP along the way.
        </p>
      </div>
      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        {PHASES.map((p, i) => (
          <Card key={p.id} className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Step {i + 1}</p>
            <p className="mt-1 font-semibold">{p.label}</p>
            <p className="mt-1 text-sm text-zinc-500">{p.blurb}</p>
          </Card>
        ))}
      </div>
      <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
        <Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>
          Create my first product
        </Button>
        <Button variant="secondary" icon={<Wand2 className="h-4 w-4" />} loading={samples.isPending} onClick={() => samples.mutate()}>
          Explore with sample products
        </Button>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </Card>
  );
}

export function DashboardPage() {
  const me = useSession();
  const { data, isLoading } = useWorkspaceData();
  const game = useGame();
  const { fmt } = useMoney();
  const move = useMoveStage();
  const materials = useMaterialsMap(data?.materials);
  const [view, setView] = useState<'board' | 'list'>('board');
  const [search, setSearch] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<StageId | null>(null);

  const products = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.products ?? []).filter((p) => !q || `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(q));
  }, [data, search]);

  const metrics = useMemo(() => new Map(products.map((p) => [p.id, productMetrics(p, materials)])), [products, materials]);

  const nextMoves = useMemo(() => {
    const moves: { product: Product; label: string; tab: string; ready?: boolean }[] = [];
    for (const p of products) {
      if (p.stage === 'Retired') continue;
      const { quest } = metrics.get(p.id)!;
      if (quest.complete && nextStage(p.stage)) moves.push({ product: p, label: `Ready to move to ${nextStage(p.stage)}`, tab: 'overview', ready: true });
      else {
        const item = quest.items.find((i) => !i.done);
        if (item) moves.push({ product: p, label: item.label, tab: item.tab });
      }
    }
    return moves.sort((a, b) => Number(Boolean(b.ready)) - Number(Boolean(a.ready))).slice(0, 5);
  }, [products, metrics]);

  if (isLoading || !data) return <Spinner />;
  if (data.products.length === 0) return <Onboarding />;

  const active = data.products.filter((p) => p.stage !== 'Retired');
  const margins = active.map((p) => metrics.get(p.id)?.summary.grossMargin).filter((m): m is number => m !== null && m !== undefined);
  const avgMargin = margins.length ? Math.round((margins.reduce((a, b) => a + b, 0) / margins.length) * 10) / 10 : null;
  const avgHealth = active.length ? Math.round(active.reduce((a, p) => a + (metrics.get(p.id)?.health.score ?? 0), 0) / active.length) : 0;
  const byPhase = PHASES.map((ph) => ({ ...ph, n: active.filter((p) => getStage(p.stage).phase === ph.id).length }));

  const onDrop = (stage: StageId) => {
    if (dragId) {
      const p = data.products.find((x) => x.id === dragId);
      if (p && p.stage !== stage) move.mutate({ id: dragId, stage });
    }
    setDragId(null);
    setOverStage(null);
  };

  return (
    <div className="space-y-6 px-4 py-6 md:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">
          {greeting()}, {me.user.name.split(' ')[0]}
        </h1>
        <p className="text-sm text-zinc-500">Here’s where your products stand and what to do next.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<Rocket className="h-4 w-4" />}
          label="Products in flight"
          value={active.length}
          hint={byPhase.map((p) => `${p.n} ${p.label.toLowerCase()}`).join(' · ')}
        />
        <StatCard icon={<Gauge className="h-4 w-4" />} label="Average health" value={`${avgHealth}/100`} hint="Discovery, costs, margin and tasks" />
        <StatCard
          icon={<Target className="h-4 w-4" />}
          label="Average margin"
          value={avgMargin === null ? '—' : `${avgMargin}%`}
          hint={margins.length ? `Across ${margins.length} priced product${margins.length > 1 ? 's' : ''}` : 'Set prices to see margins'}
        />
        <StatCard
          icon={<Flame className="h-4 w-4 text-orange-500" />}
          label="Your week"
          value={game.data ? `${game.data.weeklyXp} XP` : '—'}
          hint={game.data ? `${game.data.streakDays}-day streak · Level ${game.data.level}` : undefined}
        />
      </div>

      {nextMoves.length > 0 && (
        <Card>
          <CardHeader icon={<Sparkles className="h-4 w-4" />} title="Next best moves" subtitle="Finish quests to unlock the next stage and earn bonus XP." />
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {nextMoves.map((m) => (
              <li key={m.product.id}>
                <Link to={`/products/${m.product.id}/${m.tab}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                  <ProductThumb name={m.product.name} imageUrl={m.product.imageUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.label}</p>
                    <p className="truncate text-xs text-zinc-500">{m.product.name}</p>
                  </div>
                  {m.ready ? (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">+50 XP</span>
                  ) : (
                    <StageBadge stage={m.product.stage} />
                  )}
                  <ArrowRight className="h-4 w-4 text-zinc-400" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold">Lifecycle board</h2>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input aria-label="Search products" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" className="pl-9" />
          </div>
          <div className="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-800">
            {(['board', 'list'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={cx('rounded-md p-1.5', view === v ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white' : 'text-zinc-500')}
                aria-label={`${v} view`}
              >
                {v === 'board' ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === 'board' ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-6 md:px-6">
          <div className="flex min-w-max gap-3">
            {STAGES.map((s) => {
              const items = products.filter((p) => p.stage === s.id);
              return (
                <section
                  key={s.id}
                  aria-label={`${s.label} column`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverStage(s.id);
                  }}
                  onDragLeave={() => setOverStage((o) => (o === s.id ? null : o))}
                  onDrop={() => onDrop(s.id)}
                  className={cx(
                    'flex w-64 flex-col rounded-xl border bg-zinc-100/60 p-2 transition-colors dark:bg-zinc-900/40',
                    overStage === s.id ? 'border-indigo-400 bg-indigo-500/5' : 'border-transparent'
                  )}
                >
                  <div className="mb-2 flex items-center justify-between px-1.5 pt-1">
                    <span className="flex items-center gap-2 text-xs font-semibold">
                      <span className={cx('h-2 w-2 rounded-full', stageStyle(s.id).dot)} />
                      {s.label}
                    </span>
                    <span className="text-[11px] tabular-nums text-zinc-400">{items.length}</span>
                  </div>
                  <div className="flex min-h-[80px] flex-col gap-2">
                    {items.map((p) => (
                      <div key={p.id} className={cx(dragId === p.id && 'opacity-40')}>
                        <ProductCard
                          product={p}
                          materials={materials}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move';
                            setDragId(p.id);
                          }}
                        />
                      </div>
                    ))}
                    {items.length === 0 && <p className="px-2 py-6 text-center text-[11px] text-zinc-400">Drop a product here</p>}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium">Stage</th>
                  <th className="px-4 py-2.5 font-medium">Health</th>
                  <th className="px-4 py-2.5 font-medium">Quest</th>
                  <th className="px-4 py-2.5 text-right font-medium">Unit cost</th>
                  <th className="px-4 py-2.5 text-right font-medium">Price</th>
                  <th className="px-4 py-2.5 text-right font-medium">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {products.map((p) => {
                  const m = metrics.get(p.id)!;
                  return (
                    <tr key={p.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                      <td className="px-4 py-2.5">
                        <Link to={`/products/${p.id}`} className="flex items-center gap-2.5 font-medium hover:text-indigo-600">
                          <ProductThumb name={p.name} imageUrl={p.imageUrl} size="sm" />
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <Select
                          aria-label={`Stage for ${p.name}`}
                          className="w-36 py-1 text-xs"
                          value={p.stage}
                          onChange={(e) => move.mutate({ id: p.id, stage: e.target.value as StageId })}
                        >
                          {STAGES.map((s) => (
                            <option key={s.id}>{s.id}</option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-4 py-2.5">
                        <GradeBadge grade={m.health.grade} score={m.health.score} />
                      </td>
                      <td className="w-40 px-4 py-2.5">
                        <ProgressBar value={m.quest.progress} tone={m.quest.complete ? 'emerald' : 'indigo'} />
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmt(m.summary.totalUnitCost)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmt(p.targetSellingPrice)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{m.summary.grossMargin === null ? '—' : `${m.summary.grossMargin}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
