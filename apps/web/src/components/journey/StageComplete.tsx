import { PartyPopper, ArrowRight } from 'lucide-react';
import { STAGE_GUIDES, type StageId } from '@sv/shared';
import { Button } from '../ui';

/**
 * Shown briefly when a stage becomes complete. Concise by design: one
 * congratulation, one sentence of context, one button onward.
 */
export function StageComplete({
  stage,
  nextStageId,
  onContinue,
  onDismiss
}: {
  stage: StageId;
  nextStageId: StageId | null;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="stage-complete-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onDismiss}
    >
      <div
        className="animate-rise w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
          <PartyPopper className="h-7 w-7" aria-hidden="true" />
        </div>
        <h2 id="stage-complete-title" className="mt-4 text-xl font-semibold">
          {stage} completed!
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          {STAGE_GUIDES[stage].purpose} You have everything this stage needs.
        </p>
        {nextStageId && (
          <p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-200">Next up: {nextStageId}.</p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {nextStageId ? (
            <Button onClick={onContinue} icon={<ArrowRight className="h-4 w-4" />}>
              Continue to {nextStageId}
            </Button>
          ) : (
            <Button onClick={onDismiss}>Back to the product</Button>
          )}
          <Button variant="secondary" onClick={onDismiss}>
            Stay here
          </Button>
        </div>
      </div>
    </div>
  );
}
