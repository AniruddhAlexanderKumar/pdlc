import type { ReactNode } from 'react';
import { ArrowRight, Check, Circle, Info, Lightbulb, Lock, Play, ShieldCheck, Sparkles } from 'lucide-react';
import { CHAPTER_BRIEFS, STAGE_GUIDES, XP, activityHref, getStage, stageIndex, stageStateLabel, type JourneyStage, type Product, type StageId } from '@sv/shared';

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
  stage,
  nextStageId,
  isCurrent,
  onGoTab,
  onAdvance,
  advancing,
  renderActivities,
  extra
}: {
  product: Product;
  stage: JourneyStage;
  nextStageId: StageId | null;
  isCurrent: boolean;
  onGoTab: (href: string) => void;
  onAdvance: (to: StageId) => void;
  advancing: boolean;
  /**
   * Optional collaborative renderer for the activity list. Left undefined, the
   * overview keeps its original, purely-navigational checklist, so this
   * component still works without any collaboration data.
   */
  renderActivities?: () => ReactNode;
  /** Contextual detail shown under the activity list (e.g. comments). */
  extra?: ReactNode;
}) {
  const archive = stage.id === 'Retired';
  const locked = stage.state === 'locked' && !archive;
  const required = stage.activities.filter((a) => a.required);
  const done = stage.done;
  const nextStage = nextStageId ? getStage(nextStageId) : null;
  const canContinue = stage.complete || !!(nextStageId && product.legacyStage && stageIndex(nextStageId) <= stageIndex(product.legacyStage));

  return (
    <section aria-label={`${stage.label} overview`} className="space-y-4">
      {/* What is this stage / why it matters */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{archive ? 'Off the main path' : stage.state === 'completed' && !stage.complete ? 'Earlier chapter' : stageStateLabel(stage.state)}</p>
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

      <div className="sv-inset flex flex-wrap items-center justify-between gap-3 p-4">
        <div><p className="sv-kicker">Chapter deliverable</p><p className="mt-1 font-semibold">{CHAPTER_BRIEFS[stage.id]}</p></div>
        <button className="sv-link text-sm" onClick={() => onGoTab(`/products/${product.id}/discover?stage=${stage.id}&view=brief`)}>Read or revise brief →</button>
      </div>
      {/* What do I need to do */}
      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <h3 className="text-sm font-semibold">What you need to do</h3>
          <p className="mt-0.5 text-xs text-zinc-500">Open an activity to work on it. Save a private draft or add the result to your brief.</p>
        </div>
        {locked && (
          <p className="flex items-start gap-2 px-4 py-4 text-sm text-zinc-500">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {stage.lockReason} You can still read, draft and review work here without moving your product.
          </p>
        )}
        {renderActivities ? (
          renderActivities()
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {stage.activities.map((activity) => (
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

        {/* Filled in but unsigned: say exactly why the step does not count yet. */}
        {(stage.pendingApproval?.length ?? 0) > 0 && (
          <p className="flex items-start gap-1.5 border-t border-amber-100 bg-amber-50/60 px-4 py-2.5 text-xs leading-5 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {stage.pendingApproval!.length === 1 ? 'One step is' : `${stage.pendingApproval!.length} steps are`} waiting on
              approval, so {stage.pendingApproval!.length === 1 ? 'it does' : 'they do'} not count towards this stage yet.
            </span>
          </p>
        )}

        {extra && <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">{extra}</div>}
      </div>

      {/* What happens next */}
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h3 className="text-sm font-semibold">What happens next</h3>
        {stage.id === 'Improvement' && isCurrent && <div className="my-3 flex flex-wrap gap-2">{(['Research','Planning','Design','Prototype','Testing'] as const).filter(s => !product.answers['improve.return'] || s === product.answers['improve.return']).map(s => <Button key={s} size="sm" variant="secondary" loading={advancing} onClick={() => onAdvance(s)}>Start next cycle in {s} →</Button>)}</div>}
        {!isCurrent && !locked && <div className="my-3"><Button size="sm" variant="secondary" loading={advancing} onClick={() => onAdvance(stage.id)}>{archive ? 'Archive product' : `Make ${stage.label} the current chapter`}</Button></div>}
        {!nextStage ? (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            {stage.id === 'Improvement'
              ? 'Start another cycle from what you learned. Earlier briefs, tasks and earned XP stay in place.'
              : 'Revisit this chapter’s brief whenever you learn something new.'}
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              {stage.complete
                ? `Nice work — ${stage.label} is complete. Next is ${nextStage.label}.`
                : canContinue ? `You can return to ${nextStage.label} without finishing this chapter again.` : `Finish the steps above to unlock ${nextStage.label}.`}{' '}
              <span className="text-zinc-500">{STAGE_GUIDES[nextStage.id].purpose}</span>
            </p>
            {isCurrent && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => onAdvance(nextStage.id)}
                  loading={advancing}
                  disabled={!canContinue}
                  icon={<Play className="h-3.5 w-3.5" />}
                >
                  Continue to {nextStage.label}
                </Button>
                {!canContinue && (
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
                First completion of this chapter: {XP.questComplete} XP. First move to its next chapter after completion: {XP.stageAdvanced} XP.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
