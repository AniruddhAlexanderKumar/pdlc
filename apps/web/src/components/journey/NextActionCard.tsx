import { ArrowRight, Compass, PartyPopper, UserRound } from 'lucide-react';
import type { Recommendation } from '@sv/shared';
import { Button, cx } from '../ui';

/** Small label describing *why* this action is the one being shown. */
const REASON_LABEL: Record<Recommendation['reason'], string> = {
  blocked_task: 'Blocked task',
  overdue_task: 'Overdue',
  awaiting_changes: 'Changes requested',
  needs_review: 'Waiting on review',
  blocked_activity: 'Blocked',
  dependency_blocked: 'Waiting on a prerequisite',
  required_incomplete: 'Next required step',
  optional_incomplete: 'Optional extra'
};

/**
 * The single recommended next action.
 *
 * Deliberately one card, not a list: the brief asks for one clearly prioritised
 * action, and the journey already shows everything else.
 */
export function NextActionCard({
  recommendation,
  isComplete,
  onDo
}: {
  recommendation: Recommendation | null;
  isComplete: boolean;
  onDo: () => void;
}) {
  if (!recommendation) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
        <PartyPopper className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
            {isComplete ? 'Every stage is complete.' : 'Nothing is outstanding right now.'}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-emerald-800 dark:text-emerald-300">
            {isComplete
              ? 'Keep improving the product, or retire it when you stop making it.'
              : 'You have no required work left in the stages you can reach.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#16598d]/25 bg-[#16598d]/5 p-4 dark:border-blue-800/60 dark:bg-blue-950/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#16598d] dark:text-blue-300">
            <Compass className="h-3.5 w-3.5" aria-hidden="true" />
            Do this next
            <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-bold text-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-300">
              {REASON_LABEL[recommendation.reason]}
            </span>
          </p>
          <p className="mt-1 text-sm font-semibold leading-snug">{recommendation.label}</p>
          <p className="mt-0.5 text-xs leading-5 text-zinc-600 dark:text-zinc-300">{recommendation.why}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
            <span>{recommendation.stageLabel} stage</span>
            {recommendation.assigneeName && (
              <span className="inline-flex items-center gap-1">
                <UserRound className="h-3 w-3" aria-hidden="true" />
                {recommendation.assigneeName}
              </span>
            )}
            {recommendation.awaitingApproval && <span className="text-amber-600 dark:text-amber-400">Needs approval</span>}
          </div>
        </div>
        <Button onClick={onDo} icon={<ArrowRight className="h-4 w-4" />} className="shrink-0">
          Start
        </Button>
      </div>
      <p className={cx('mt-2 text-[11px] italic text-zinc-500')}>{recommendation.because}</p>
    </div>
  );
}
