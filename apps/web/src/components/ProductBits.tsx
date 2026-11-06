import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, Package } from 'lucide-react';
import { costSummary, productHealth, stageQuest, STAGES, type Material, type Product, type StageId } from '@sv/shared';
import { useMoney } from '../lib/money';
import { cx, GradeBadge, ProgressBar, StageBadge } from './ui';

export function useMaterialsMap(materials: Material[] | undefined) {
  return useMemo(() => new Map((materials ?? []).map((m) => [m.id, m])), [materials]);
}

export function productMetrics(product: Product, materials: Map<string, Material>) {
  return {
    summary: costSummary(product, materials),
    health: productHealth(product, materials),
    quest: stageQuest(product, materials)
  };
}

export function ProductThumb({ name, imageUrl, size = 'md' }: { name: string; imageUrl: string; size?: 'sm' | 'md' | 'lg' }) {
  const [broken, setBroken] = useState(false);
  const dim = size === 'sm' ? 'h-8 w-8 text-[11px]' : size === 'lg' ? 'h-14 w-14 text-base' : 'h-10 w-10 text-xs';
  if (imageUrl && !broken) {
    return <img src={imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={cx(dim, 'shrink-0 rounded-lg object-cover')} />;
  }
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className={cx(dim, 'flex shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-500/10 font-semibold text-blue-700 dark:text-blue-300')}>
      {initials || <Package className="h-4 w-4" />}
    </div>
  );
}

export function ProductCard({
  product,
  materials,
  draggable,
  onDragStart,
  compact
}: {
  product: Product;
  materials: Map<string, Material>;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  compact?: boolean;
}) {
  const { fmt } = useMoney();
  const { summary, health, quest } = productMetrics(product, materials);
  const doneTasks = product.tasks.filter((t) => t.status === 'done').length;

  return (
    <Link
      to={`/products/${product.id}`}
      draggable={draggable}
      onDragStart={onDragStart}
      className="group block rounded-xl border border-zinc-200 bg-white p-3 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-blue-500/40"
    >
      <div className="flex items-start gap-2.5">
        <ProductThumb name={product.name} imageUrl={product.imageUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium group-hover:text-blue-600 dark:group-hover:text-blue-400">{product.name}</p>
          <p className="truncate text-[11px] text-zinc-500">{product.category}</p>
        </div>
        <GradeBadge grade={health.grade} score={health.score} />
      </div>
      {!compact && (
        <>
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-500">
              <span className="flex items-center gap-1">
                {quest.complete ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : null}
                {product.stage} progress
              </span>
              <span className="tabular-nums">
                {quest.done}/{quest.total}
              </span>
            </div>
            <ProgressBar value={quest.progress} tone={quest.complete ? 'emerald' : 'indigo'} />
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-2 text-[11px] dark:border-zinc-800">
            <span className="text-zinc-500">
              Cost <span className="font-medium text-zinc-700 tabular-nums dark:text-zinc-300">{fmt(summary.totalUnitCost)}</span>
            </span>
            {summary.grossMargin !== null ? (
              <span className={cx('font-semibold tabular-nums', summary.grossMargin >= 30 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
                {summary.grossMargin}% margin
              </span>
            ) : (
              <span className="text-zinc-400">No price</span>
            )}
            <span className="text-zinc-500 tabular-nums">
              {doneTasks}/{product.tasks.length} tasks
            </span>
          </div>
        </>
      )}
    </Link>
  );
}

export function StagePills({ value, onChange, counts }: { value: StageId | 'ALL'; onChange: (v: StageId | 'ALL') => void; counts: Record<string, number> }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {(['ALL', ...STAGES.map((s) => s.id)] as const).map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={cx(
            'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            value === s
              ? 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300'
              : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-700'
          )}
        >
          {s === 'ALL' ? 'All' : s} <span className="ml-0.5 tabular-nums opacity-60">{s === 'ALL' ? Object.values(counts).reduce((a, b) => a + b, 0) : (counts[s] ?? 0)}</span>
        </button>
      ))}
    </div>
  );
}

export { StageBadge };
