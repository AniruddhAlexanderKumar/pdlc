import { Receipt, Target } from 'lucide-react';
import { XP, type Material, type Product } from '@sv/shared';
import { useUpdateProduct } from '../../api/hooks';
import { productMetrics } from '../../components/ProductBits';
import { Card, CardHeader, CommitInput, cx, Field, ProgressBar } from '../../components/ui';
import { useMoney } from '../../lib/money';

export function CostsTab({ product, materials }: { product: Product; materials: Map<string, Material> }) {
  const update = useUpdateProduct(product.id);
  const { fmt, symbol } = useMoney();
  const { summary } = productMetrics(product, materials);
  const targetMarginRaw = product.answers['planning.target_margin'];
  const targetMargin = typeof targetMarginRaw === 'number' ? targetMarginRaw : null;
  const marketPrice = product.answers['research.market_price'];

  const segments = [
    { label: 'Materials', value: summary.materialsCost, color: 'bg-indigo-500' },
    { label: 'Labour', value: summary.labour, color: 'bg-sky-500' },
    { label: 'Packaging', value: summary.packaging, color: 'bg-amber-500' },
    { label: 'Overhead', value: summary.overhead, color: 'bg-rose-400' }
  ];
  const priceForTarget = targetMargin !== null && targetMargin < 100 && summary.totalUnitCost > 0 ? Math.ceil(summary.totalUnitCost / (1 - targetMargin / 100)) : null;

  return (
    <div className="grid gap-5 lg:grid-cols-12">
      <Card className="lg:col-span-7">
        <CardHeader
          icon={<Receipt className="h-4 w-4" />}
          title="Cost per unit"
          subtitle={`Fill in every cost for +${XP.costsFilled} XP. Changes save when you leave a field.`}
        />
        <div className="space-y-4 p-4">
          <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2.5 text-sm dark:bg-zinc-800/50">
            <span>
              Materials <span className="text-xs text-zinc-500">(from the bill of materials)</span>
            </span>
            <span className="font-medium tabular-nums">{fmt(summary.materialsCost)}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Labour" hint="Assembly and handling">
              <CommitInput prefix={symbol} value={product.costs.labour} ariaLabel="Labour cost" onCommit={(v) => update.mutate({ costs: { labour: v ?? 0 } })} />
            </Field>
            <Field label="Packaging" hint="Box, inserts, labels">
              <CommitInput prefix={symbol} value={product.costs.packaging} ariaLabel="Packaging cost" onCommit={(v) => update.mutate({ costs: { packaging: v ?? 0 } })} />
            </Field>
            <Field label="Overhead" hint="Rent, tools, shipping share">
              <CommitInput prefix={symbol} value={product.costs.overhead} ariaLabel="Overhead cost" onCommit={(v) => update.mutate({ costs: { overhead: v ?? 0 } })} />
            </Field>
          </div>
          <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <Field
              label="Selling price"
              hint={typeof marketPrice === 'number' ? `You noted similar products sell for about ${fmt(marketPrice)}.` : `Set a price for +${XP.priceSet} XP.`}
            >
              <CommitInput
                prefix={symbol}
                className="max-w-xs"
                allowEmpty
                placeholder="Not set"
                value={product.targetSellingPrice}
                ariaLabel="Selling price"
                onCommit={(v) => update.mutate({ targetSellingPrice: v })}
              />
            </Field>
          </div>
        </div>
      </Card>

      <div className="space-y-5 lg:col-span-5">
        <Card>
          <CardHeader icon={<Target className="h-4 w-4" />} title="What you keep" />
          <div className="p-4">
            <p className="text-xs text-zinc-500">Profit per unit</p>
            <p
              className={cx(
                'text-3xl font-bold tabular-nums tracking-tight',
                summary.grossProfit === null ? 'text-zinc-400' : summary.grossProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'
              )}
            >
              {summary.grossProfit === null ? '—' : fmt(summary.grossProfit)}
            </p>
            <p className="mt-0.5 text-sm text-zinc-500">
              {summary.grossMargin === null ? 'Set a selling price to see your margin.' : `${summary.grossMargin}% gross margin`}
              {targetMargin !== null && summary.grossMargin !== null && ` · goal ${targetMargin}%`}
            </p>
            {summary.grossMargin !== null && (
              <div className="relative mt-3">
                <ProgressBar value={Math.max(0, summary.grossMargin)} tone={targetMargin !== null && summary.grossMargin < targetMargin ? 'amber' : 'emerald'} className="h-2.5" />
                {targetMargin !== null && <div className="absolute -top-1 h-4.5 w-0.5 bg-zinc-900 dark:bg-white" style={{ left: `${Math.min(100, targetMargin)}%` }} title={`Goal ${targetMargin}%`} />}
              </div>
            )}
            {priceForTarget !== null && summary.grossMargin !== null && summary.grossMargin < (targetMargin ?? 0) && (
              <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                To hit {targetMargin}%, sell at {fmt(priceForTarget)} or cut {fmt(Math.max(0, summary.totalUnitCost - (product.targetSellingPrice ?? 0) * (1 - (targetMargin ?? 0) / 100)))} from
                your costs.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Cost breakdown" subtitle={`Unit cost ${fmt(summary.totalUnitCost)}`} />
          <div className="p-4">
            {summary.totalUnitCost > 0 ? (
              <>
                <div className="flex h-3 overflow-hidden rounded-full">
                  {segments.map((s) => (
                    <div key={s.label} className={s.color} style={{ width: `${(s.value / summary.totalUnitCost) * 100}%` }} />
                  ))}
                </div>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {segments.map((s) => (
                    <li key={s.label} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                        <span className={cx('h-2.5 w-2.5 rounded-sm', s.color)} />
                        {s.label}
                      </span>
                      <span className="tabular-nums">
                        {fmt(s.value)} <span className="text-xs text-zinc-400">({Math.round((s.value / summary.totalUnitCost) * 100)}%)</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-zinc-500">Add materials or costs to see the breakdown.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
