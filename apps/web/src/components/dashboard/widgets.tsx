import { useState, type ComponentType, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Flame, Gauge, Rocket, Search, Sparkles, Target, Trophy } from 'lucide-react';
import { STAGES, type StageId, type WidgetId } from '@sv/shared';
import { useGame, useMoveStage } from '../../api/hooks';
import { useMoney } from '../../lib/money';
import { ProductCard, ProductThumb } from '../ProductBits';
import { Card, CardHeader, cx, GradeBadge, Input, ProgressBar, Select, StageBadge, stageStyle } from '../ui';
import { useDashboardModel } from './model';

function StatCard({ icon, label, value, hint }: { icon: ReactNode; label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card className="h-full p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </Card>
  );
}

function ProductsStat() {
  const { active, byPhase } = useDashboardModel();
  return <StatCard icon={<Rocket className="h-4 w-4" />} label="Products in flight" value={active.length} hint={byPhase.map((p) => `${p.n} ${p.label.toLowerCase()}`).join(' · ')} />;
}

function HealthStat() {
  const { avgHealth } = useDashboardModel();
  return <StatCard icon={<Gauge className="h-4 w-4" />} label="Average health" value={`${avgHealth}/100`} hint="Discovery, costs, margin and tasks" />;
}

function MarginStat() {
  const { avgMargin, margins } = useDashboardModel();
  return (
    <StatCard
      icon={<Target className="h-4 w-4" />}
      label="Average margin"
      value={avgMargin === null ? '—' : `${avgMargin}%`}
      hint={margins.length ? `Across ${margins.length} priced product${margins.length > 1 ? 's' : ''}` : 'Set prices to see margins'}
    />
  );
}

function WeekStat() {
  const game = useGame();
  return (
    <StatCard
      icon={<Flame className="h-4 w-4 text-orange-500" />}
      label="Your week"
      value={game.data ? `${game.data.weeklyXp} XP` : '—'}
      hint={game.data ? `${game.data.streakDays}-day streak · Level ${game.data.level}` : undefined}
    />
  );
}

function NextMoves() {
  const { nextMoves } = useDashboardModel();
  return (
    <Card className="h-full">
      <CardHeader icon={<Sparkles className="h-4 w-4" />} title="Next best moves" subtitle="Finish quests to unlock the next stage and earn bonus XP." />
      {nextMoves.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-zinc-500">Nothing to do right now.</p>
      ) : (
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
      )}
    </Card>
  );
}

function XpProgress() {
  const game = useGame();
  const g = game.data;
  return (
    <Card className="h-full">
      <CardHeader icon={<Trophy className="h-4 w-4" />} title="Level progress" subtitle={g ? g.levelTitle : undefined} />
      {g ? (
        <div className="space-y-3 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-semibold tabular-nums">Level {g.level}</span>
            <span className="text-xs text-zinc-500">{g.xp} XP total</span>
          </div>
          <ProgressBar value={g.xpForNextLevel > 0 ? (g.xpIntoLevel / g.xpForNextLevel) * 100 : 100} />
          <p className="text-xs text-zinc-500">
            {g.xpIntoLevel}/{g.xpForNextLevel} XP to the next level · {g.streakDays}-day streak
          </p>
        </div>
      ) : (
        <p className="px-4 py-6 text-center text-sm text-zinc-500">Loading…</p>
      )}
    </Card>
  );
}

function RecentXp() {
  const game = useGame();
  const recent = game.data?.recent.slice(0, 6) ?? [];
  return (
    <Card className="h-full">
      <CardHeader icon={<Flame className="h-4 w-4" />} title="Recent XP" />
      {recent.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-zinc-500">Complete a quest to earn your first XP.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {recent.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="truncate">{e.label}</span>
              <span className="shrink-0 text-xs font-semibold text-emerald-700 dark:text-emerald-400">+{e.points} XP</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function MarginRanking() {
  const { active, metrics } = useDashboardModel();
  const rows = active
    .map((p) => ({ p, margin: metrics.get(p.id)?.summary.grossMargin ?? null }))
    .filter((r): r is { p: typeof r.p; margin: number } => r.margin !== null)
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 6);
  return (
    <Card className="h-full">
      <CardHeader icon={<Target className="h-4 w-4" />} title="Margin by product" subtitle="Highest first" />
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-zinc-500">Set prices to see margins.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map(({ p, margin }) => (
            <li key={p.id}>
              <Link to={`/products/${p.id}/costs`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                <ProductThumb name={p.name} imageUrl={p.imageUrl} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                <ProgressBar value={margin} tone={margin < 20 ? 'rose' : margin < 40 ? 'amber' : 'emerald'} className="w-24" />
                <span className="w-12 text-right text-sm tabular-nums">{margin}%</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function HealthRanking() {
  const { active, metrics } = useDashboardModel();
  const rows = active
    .map((p) => ({ p, health: metrics.get(p.id)!.health }))
    .sort((a, b) => a.health.score - b.health.score)
    .slice(0, 6);
  return (
    <Card className="h-full">
      <CardHeader icon={<Gauge className="h-4 w-4" />} title="Health by product" subtitle="Needs attention first" />
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {rows.map(({ p, health }) => (
          <li key={p.id}>
            <Link to={`/products/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
              <ProductThumb name={p.name} imageUrl={p.imageUrl} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
              <GradeBadge grade={health.grade} score={health.score} />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SearchBox() {
  const { search, setSearch } = useDashboardModel();
  return (
    <div className="relative w-64">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
      <Input aria-label="Search products" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" className="pl-9" />
    </div>
  );
}

function Board() {
  const { filtered, materials } = useDashboardModel();
  const move = useMoveStage();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<StageId | null>(null);

  const onDrop = (stage: StageId) => {
    const p = filtered.find((x) => x.id === dragId);
    if (p && p.stage !== stage) move.mutate({ id: p.id, stage });
    setDragId(null);
    setOverStage(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Lifecycle board</h2>
        <SearchBox />
      </div>
      <div className="overflow-x-auto pb-4">
        <div className="flex min-w-max gap-3">
          {STAGES.map((s) => {
            const items = filtered.filter((p) => p.stage === s.id);
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
    </div>
  );
}

function ProductTable() {
  const { filtered, metrics } = useDashboardModel();
  const { fmt } = useMoney();
  const move = useMoveStage();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Product table</h2>
        <SearchBox />
      </div>
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
              {filtered.map((p) => {
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
    </div>
  );
}

/** One component per widget id in @sv/shared. TypeScript fails the build if a widget is missing here. */
export const WIDGET_COMPONENTS: Record<WidgetId, ComponentType> = {
  'stat-products': ProductsStat,
  'stat-health': HealthStat,
  'stat-margin': MarginStat,
  'stat-week': WeekStat,
  'next-moves': NextMoves,
  'xp-progress': XpProgress,
  'recent-xp': RecentXp,
  'margin-ranking': MarginRanking,
  'health-ranking': HealthRanking,
  board: Board,
  list: ProductTable
};
