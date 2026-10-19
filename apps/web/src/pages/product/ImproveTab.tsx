import { AlertTriangle, ArrowRight, Bot, Lightbulb, RefreshCw, Trophy } from 'lucide-react';
import { XP, type Insight, type Product } from '@sv/shared';
import { useApplyInsight, useInsights } from '../../api/hooks';
import { Button, Card, cx, EmptyState, Spinner } from '../../components/ui';
import { useMoney } from '../../lib/money';
import type { TabId } from './ProductPage';

const toneStyle: Record<Insight['tone'], { icon: typeof Lightbulb; ring: string; iconBg: string }> = {
  warning: { icon: AlertTriangle, ring: 'border-amber-500/30', iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  tip: { icon: Lightbulb, ring: 'border-indigo-500/20', iconBg: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
  win: { icon: Trophy, ring: 'border-emerald-500/30', iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' }
};

export function ImproveTab({ product, goTab }: { product: Product; goTab: (t: TabId) => void }) {
  const insights = useInsights(product.id);
  const apply = useApplyInsight(product.id);
  const { fmt } = useMoney();

  if (insights.isLoading) return <Spinner label="Looking for improvements" />;
  const list = insights.data ?? [];
  const potential = list.reduce((sum, i) => sum + (i.action && i.action.type !== 'open_tab' ? (i.perUnitImpact ?? 0) : 0), 0);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Improve it</p>
          <h2 className="mt-0.5 text-base font-semibold">Smarter choices for {product.name}</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            {potential > 0 ? (
              <>
                Up to <span className="font-semibold text-emerald-600 dark:text-emerald-400">{fmt(potential)}</span> more profit per unit is on the table.
              </>
            ) : (
              `Apply a suggestion for +${XP.suggestionApplied} XP.`
            )}
          </p>
        </div>
        <Button variant="secondary" size="sm" icon={<RefreshCw className={cx('h-3.5 w-3.5', insights.isFetching && 'animate-spin')} />} onClick={() => insights.refetch()}>
          Refresh
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<Lightbulb className="h-6 w-6" />} title="Nothing to improve right now" body="Answer more questions and add costs. Suggestions appear as soon as there is something to act on." />
      ) : (
        <div className="space-y-3">
          {list.map((i) => {
            const s = toneStyle[i.tone];
            const canApply = i.action && i.action.type !== 'open_tab';
            return (
              <Card key={i.id} className={cx('animate-rise border p-4', s.ring)}>
                <div className="flex gap-3">
                  <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', s.iconBg)}>
                    <s.icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{i.title}</h3>
                      {i.source === 'ai' && (
                        <span className="flex items-center gap-1 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                          <Bot className="h-3 w-3" /> AI
                        </span>
                      )}
                      {i.perUnitImpact ? (
                        <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                          +{fmt(i.perUnitImpact)}/unit
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{i.detail}</p>
                    {i.action && (
                      <div className="mt-3">
                        {canApply ? (
                          <Button size="sm" loading={apply.isPending && apply.variables === i.id} onClick={() => apply.mutate(i.id)}>
                            {i.action.type === 'advance_stage' ? 'Move forward' : 'Apply'} · +{XP.suggestionApplied} XP
                          </Button>
                        ) : i.action.type === 'open_tab' ? (
                          <Button size="sm" variant="secondary" onClick={() => i.action?.type === 'open_tab' && goTab(i.action.tab)}>
                            Go there <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="border-dashed p-4">
        <div className="flex gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <Bot className="h-4.5 w-4.5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">AI research is on the way</h3>
            <p className="mt-0.5 text-sm text-zinc-500">
              Soon an AI assistant will use your answers to research market prices, find suppliers and suggest follow-up questions. Its suggestions will appear right here.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
