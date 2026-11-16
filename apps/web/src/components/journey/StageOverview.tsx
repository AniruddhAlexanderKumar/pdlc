import { ArrowRight, Check, Circle, Info, Lightbulb, Lock, Play, Sparkles } from 'lucide-react';
import { STAGE_GUIDES, activityHref, getStage, stageStateLabel, type JourneyStage, type Material, type Product, type StageId } from '@sv/shared';

const nextStageGuidePurpose = (id: StageId) => STAGE_GUIDES[id].purpose;
import { Button, cx } from '../ui';

/**
 * The focused stage overview.
 *
 * Answers, in order, the five questions a first-time user has: what is this
 * stage, what do I need to do, why does it matter, how much is left, and what
 * happens next. Every action deep links to the tab that completes it, so nobody
 * has to hunt through menus.
 */
export function StageOverview({
  product,
  materials,
  stage,
  nextStageId,
  isCurrent,
  onGoTab,
  onAdvance,
  advancing
}: {
  product: Product;
  materials: Map<string, Material>;
  stage: JourneyStage;
  nextStageId: StageId | null;
  isCurrent: boolean;
  onGoTab: (href: string) => void;
  onAdvance: (to: StageId) => void;
  advancing: boolean;
}) {
  const locked = stage.state === 'locked';
  const required = stage.activities.filter((a) => a.required);
  const done = required.filter((a) => a.done).length;
  const nextStage = nextStageId ? getStage(nextStageId) : null;

  return (
    <section aria-label={`${stage.label} overview`} className="space-y-4">
      {/* What is this stage / why it matters */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{stageStateLabel(stage.state)}</p>
            <h2 className="mt-0.5 text-lg font-semibold">{stage.label}</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{stage.guide.purpose}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-bold tabular-nums">{stage.progress}%</p>
            <p className="text-[11px] text-zinc-500">
              {done} of {required.length} done
            </p>
          </div>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800">
          <div
            className={cx('h-full rounded-full transition-all duration-500', stage.complete ? 'bg-emerald-500' : 'bg-[#16598d]')}
            style={{ width: `${stage.progress}%` }}
          />
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
          <span>
            <span className="font-medium text-zinc-700 dark:text-zinc-200">Why this matters: </span>
            {stage.guide.why}
          </span>
        </p>
      </div>

      {/* What do I need to do */}
      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <h3 className="text-sm font-semibold">What you need to do</h3>
          <p className="mt-0.5 text-xs text-zinc-500">Tap a step to go straight to it. Your answers save as you go.</p>
        </div>
        {locked ? (
          <p className="flex items-start gap-2 px-4 py-4 text-sm text-zinc-500">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {stage.lockReason}
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {stage.activities.map((activity, index) => (
              <li key={activity.id}>
                <button
                  type="button"
                  onClick={() => onGoTab(activityHref(product.id, stage.id, activity))}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                >
                  {activity.done ? (
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white" aria-hidden="true">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  ) : (
                    <Circle className={cx('mt-0.5 h-5 w-5 shrink-0', activity.required ? 'text-zinc-300 dark:text-zinc-600' : 'text-zinc-200 dark:text-zinc-700')} aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={cx('block text-sm', activity.done ? 'text-zinc-400 line-through' : 'font-medium')}>
                      {activity.label}
                      {!activity.required && <span className="ml-1.5 text-[11px] font-normal text-zinc-400">optional</span>}
                    </span>
                    {!activity.done && <span className="mt-0.5 block text-xs leading-5 text-zinc-500">{activity.why}</span>}
                  </span>
                  <span className="mt-0.5 flex shrink-0 items-center gap-1.5">
                    {!activity.done && activity.xp > 0 && (
                      <span className="rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-400">+{activity.xp} XP</span>
                    )}
                    {!activity.done && <ArrowRight className="h-4 w-4 text-zinc-400" aria-hidden="true" />}
                  </span>
                </button>
              </li>
            ))}
            {stage.activities.length === 0 && <li className="px-4 py-4 text-sm text-zinc-500">Nothing to do here yet.</li>}
          </ul>
        )}
      </div>

      {/* What happens next */}
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h3 className="text-sm font-semibold">What happens next</h3>
        {!nextStage ? (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            {stage.id === 'Improvement'
              ? 'This is the last stage on the journey. Keep improving the product, or retire it when you stop making it.'
              : 'There is nothing further on the main journey.'}
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              {stage.complete
                ? `Nice work — ${stage.label} is complete. Next is ${nextStage.label}.`
                : `Finish the steps above to unlock ${nextStage.label}.`}{' '}
              <span className="text-zinc-500">{nextStageGuidePurpose(nextStage.id)}</span>
            </p>
            {isCurrent && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => onAdvance(nextStage.id)}
                  loading={advancing}
                  disabled={!stage.complete}
                  icon={<Play className="h-3.5 w-3.5" />}
                >
                  Continue to {nextStage.label}
                </Button>
                {!stage.complete && (
                  <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <Info className="h-3.5 w-3.5" aria-hidden="true" />
                    Complete the steps to unlock this button.
                  </span>
                )}
              </div>
            )}
            {!stage.complete && isCurrent && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                Completing the stage earns bonus XP, and so does moving on.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
