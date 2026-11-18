import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Circle, Gauge, StickyNote, Target } from 'lucide-react';
import { activityHref, getStage, type Journey, type nextWork, type Material, type Product } from '@sv/shared';
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

/**
 * The product dashboard, journey-first.
 *
 * The journey is the primary surface: overall completion, the current stage, the
 * single next activity and a Continue action. Cost and health detail is kept but
 * pushed below and collapsed in importance, so the page answers "where am I and
 * what do I do next" before it shows any numbers.
 */
export function OverviewTab({ product, materials, goTab, openHref, journey, work }: { journey: Journey; work: ReturnType<typeof nextWork>; product: Product; materials: Map<string, Material>; goTab: (t: TabId) => void; openHref: (href: string) => void }) {
  const update = useUpdateProduct(product.id);
  const { fmt } = useMoney();
  const { summary, health } = productMetrics(product, materials);
  const stage = getStage(product.stage);

  const parts = [
    { label: 'Discovery', value: health.parts.discovery, hint: 'Questions answered so far' },
    { label: 'Costs', value: health.parts.costs, hint: 'Recorded cost inputs and selling price; materials for physical products' },
    { label: 'Margin', value: health.parts.margin, hint: 'Estimated margin relative to 50%; no credit without a recorded cost' },
    { label: 'Tasks', value: health.parts.tasks, hint: 'Share of tasks done' }
  ];

  const costRows = [
    { label: 'Materials', value: summary.materialsCost, color: 'bg-blue-500' },
    { label: 'Labour', value: summary.labour, color: 'bg-sky-500' },
    { label: 'Packaging', value: summary.packaging, color: 'bg-amber-500' },
    { label: 'Overhead', value: summary.overhead, color: 'bg-rose-400' }
  ];

  const outstanding = journey.path.reduce((n, s) => n + (s.total - s.done), 0);

  return (
    <div className="space-y-5">
      {/* ── The journey is the headline ─────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="bg-[#16598d] px-5 py-5 text-white">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-100">
                {stage.id === 'Retired' ? 'Archived product' : `Chapter ${journey.currentIndex + 1} of ${journey.totalCount} · ${stage.label}`}
              </p>
              <h2 className="mt-1 text-xl font-semibold">{journey.current.guide.purpose}</h2>
              <p className="mt-1 max-w-lg text-sm text-blue-100">
                {journey.completedCount} of {journey.totalCount} stages done
                {outstanding > 0 ? ` · ${outstanding} step${outstanding === 1 ? '' : 's'} left in total` : ' · nothing outstanding'}
              </p>
            </div>
            <div className="shrink-0 text-left sm:text-right">
              <p className="text-3xl font-bold tabular-nums">{journey.overallPercent}%</p>
              <p className="text-[11px] text-blue-100">of the whole journey</p>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-white transition-all duration-700" style={{ width: `${journey.overallPercent}%` }} />
          </div>
        </div>

        {/* One obvious next action. */}
        <div className="flex flex-col gap-3 border-t border-zinc-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
          <div className="flex min-w-0 items-start gap-3"><Target size={18} className="mt-1 shrink-0 text-teal-700"/><div><p className="sv-kicker">Continue building</p><p className="mt-1 text-sm font-semibold">{work.title}</p><p className="mt-1 text-xs leading-5 text-zinc-500">{work.reason}</p></div></div>
          <Button onClick={() => openHref(work.href)} icon={<ArrowRight size={16}/>} className="shrink-0">{work.action}
          </Button>
        </div>

        {/* This stage's steps, directly actionable. */}
        <div className="border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center justify-between px-5 py-2.5">
            <p className="text-xs font-semibold text-zinc-500">{stage.label} steps</p>
            <p className="text-xs tabular-nums text-zinc-500">
              {journey.current.done}/{journey.current.total} done
            </p>
          </div>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {journey.current.activities.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => openHref(activityHref(product.id, stage.id, item))}
                  className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                >
                  {item.done ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden="true" />
                  ) : (
                    <Circle className="h-5 w-5 shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden="true" />
                  )}
                  <span className={cx('flex-1 text-sm', item.done && 'text-zinc-400 line-through')}>{item.label}</span>
                  {!item.done && <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
        </div>

      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
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
            <CardHeader icon={<Gauge className="h-4 w-4" />} title="Product health" subtitle="Recorded work and estimated unit economics, not proof of demand or profitability." />
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
    </div>
  );
}
