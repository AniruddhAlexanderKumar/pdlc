import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Circle, Gauge, Rocket, StickyNote } from 'lucide-react';
import { getStage, nextStage, XP, type Material, type Product } from '@sv/shared';
import { useUpdateProduct } from '../../api/hooks';
import { productMetrics } from '../../components/ProductBits';
import { Button, Card, CardHeader, cx, ProgressBar, Textarea } from '../../components/ui';
import { useMoney } from '../../lib/money';
import type { TabId } from './ProductPage';

function AutoSaveText({ label, value, onSave, placeholder, rows = 4 }: { label: string; value: string; onSave: (v: string) => void; placeholder: string; rows?: number }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-zinc-500">{label}</label>
      <Textarea rows={rows} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== value && onSave(draft)} />
    </div>
  );
}

export function OverviewTab({ product, materials, goTab }: { product: Product; materials: Map<string, Material>; goTab: (t: TabId) => void }) {
  const update = useUpdateProduct(product.id);
  const { fmt } = useMoney();
  const { summary, health, quest } = productMetrics(product, materials);
  const next = nextStage(product.stage);
  const stage = getStage(product.stage);

  const parts = [
    { label: 'Discovery', value: health.parts.discovery, hint: 'Questions answered so far' },
    { label: 'Costs', value: health.parts.costs, hint: 'Materials, other costs and a price' },
    { label: 'Margin', value: health.parts.margin, hint: 'Full marks at a 50% margin' },
    { label: 'Tasks', value: health.parts.tasks, hint: 'Share of tasks done' }
  ];

  const costRows = [
    { label: 'Materials', value: summary.materialsCost, color: 'bg-indigo-500' },
    { label: 'Labour', value: summary.labour, color: 'bg-sky-500' },
    { label: 'Packaging', value: summary.packaging, color: 'bg-amber-500' },
    { label: 'Overhead', value: summary.overhead, color: 'bg-rose-400' }
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-4 text-white">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-100">Current quest</p>
                <h2 className="mt-0.5 text-lg font-semibold">
                  {stage.emoji} {stage.label}
                </h2>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold tabular-nums">{quest.progress}%</p>
                <p className="text-[11px] text-indigo-100">
                  {quest.done} of {quest.total} done
                </p>
              </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${quest.progress}%` }} />
            </div>
          </div>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {quest.items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => goTab(item.tab === 'overview' ? 'overview' : item.tab)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                >
                  {item.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" /> : <Circle className="h-5 w-5 shrink-0 text-zinc-300 dark:text-zinc-600" />}
                  <span className={cx('flex-1 text-sm', item.done && 'text-zinc-400 line-through')}>{item.label}</span>
                  {!item.done && <ArrowRight className="h-4 w-4 text-zinc-400" />}
                </button>
              </li>
            ))}
            {quest.items.length === 0 && <li className="px-4 py-3 text-sm text-zinc-500">No quest for this stage.</li>}
          </ul>
          {next && (
            <div className="flex flex-col gap-2 border-t border-zinc-100 bg-zinc-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs text-zinc-500">
                {quest.complete ? `Quest complete. Move to ${next} to earn +${XP.stageAdvanced} XP.` : `Complete the quest for +${XP.questComplete} XP, then move to ${next}.`}
              </p>
              <Button
                size="sm"
                variant={quest.complete ? 'primary' : 'secondary'}
                icon={<Rocket className="h-3.5 w-3.5" />}
                loading={update.isPending}
                onClick={() => update.mutate({ stage: next })}
              >
                Move to {next}
              </Button>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader icon={<StickyNote className="h-4 w-4" />} title="About this product" />
          <div className="space-y-4 p-4">
            <AutoSaveText
              label="Description"
              value={product.description}
              rows={3}
              placeholder="What is it, in a sentence or two?"
              onSave={(description) => update.mutate({ description })}
            />
            <AutoSaveText
              label="Notes"
              value={product.notes}
              rows={5}
              placeholder="Test results, decisions, open questions… Saved when you click away."
              onSave={(notes) => update.mutate({ notes })}
            />
          </div>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader icon={<Gauge className="h-4 w-4" />} title="Product health" subtitle="One score for how well-understood and profitable this product is." />
          <div className="p-4">
            <div className="flex items-center gap-4">
              <div
                className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full"
                style={{ background: `conic-gradient(rgb(99 102 241) ${health.score * 3.6}deg, rgb(228 228 231 / 0.5) 0deg)` }}
              >
                <div className="flex h-16 w-16 flex-col items-center justify-center rounded-full bg-white dark:bg-zinc-900">
                  <span className="text-xl font-bold tabular-nums">{health.score}</span>
                  <span className="text-[10px] text-zinc-500">grade {health.grade}</span>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                {parts.map((p) => (
                  <div key={p.label} title={p.hint}>
                    <div className="mb-0.5 flex justify-between text-[11px]">
                      <span className="text-zinc-500">{p.label}</span>
                      <span className="tabular-nums">{p.value}%</span>
                    </div>
                    <ProgressBar value={p.value} tone={p.value >= 70 ? 'emerald' : p.value >= 40 ? 'indigo' : 'amber'} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Where the money goes" subtitle="Per unit" action={<Button size="sm" variant="ghost" onClick={() => goTab('costs')}>Details</Button>} />
          <div className="p-4">
            {summary.totalUnitCost > 0 && (
              <div className="mb-3 flex h-2.5 overflow-hidden rounded-full">
                {costRows.map((r) => (
                  <div key={r.label} className={r.color} style={{ width: `${(r.value / summary.totalUnitCost) * 100}%` }} title={`${r.label} ${fmt(r.value)}`} />
                ))}
              </div>
            )}
            <dl className="space-y-1.5 text-sm">
              {costRows.map((r) => (
                <div key={r.label} className="flex justify-between">
                  <dt className="flex items-center gap-2 text-zinc-500">
                    <span className={cx('h-2 w-2 rounded-full', r.color)} />
                    {r.label}
                  </dt>
                  <dd className="tabular-nums">{fmt(r.value)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-zinc-100 pt-1.5 font-medium dark:border-zinc-800">
                <dt>Unit cost</dt>
                <dd className="tabular-nums">{fmt(summary.totalUnitCost)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>Profit per unit</dt>
                <dd className={cx('tabular-nums', (summary.grossProfit ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600')}>
                  {summary.grossProfit === null ? 'Set a price' : fmt(summary.grossProfit)}
                </dd>
              </div>
            </dl>
          </div>
        </Card>
      </div>
    </div>
  );
}
