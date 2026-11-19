import { useState } from 'react';
import { ArrowLeft, BadgeCheck, Check, Flag, Lock, Sparkles, X } from 'lucide-react';
import type { WorldProgress } from '@sv/shared';
import { useSubmitCheckpoint } from '../../api/journey';
import { Button, cx } from '../ui';

/**
 * Checkpoint panel.
 *
 * A checkpoint is not a quiz: it evaluates the deliverable the world promised,
 * against the records the founder actually produced. Every criterion shows its
 * evidence, and a failed attempt lists exactly what is still missing so the next
 * step is obvious rather than a shrug.
 */
export function CheckpointPanel({
  productId,
  world,
  onClose,
  onPassed
}: {
  productId: string;
  world: WorldProgress;
  onClose: () => void;
  onPassed: (nextWorldTitle: string | null) => void;
}) {
  const submit = useSubmitCheckpoint(productId, world.checkpoint.id);
  const [error, setError] = useState<string | null>(null);
  const cp = world.checkpoint;
  const canAttempt = cp.met === cp.total;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Checkpoint">
      <div className="relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-zinc-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-zinc-800">
          <div className="flex items-start gap-3">
            <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white', cp.passed ? 'bg-emerald-500' : 'bg-indigo-600')}>
              {cp.passed ? <BadgeCheck className="h-5 w-5" /> : <Flag className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-700 dark:text-indigo-400">World {world.index} checkpoint</p>
              <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-slate-900 dark:text-zinc-50">{cp.title}</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">{world.title}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close checkpoint" className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800">
              <ArrowLeft className="h-4 w-4 rotate-45" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm leading-6 text-slate-700 dark:text-zinc-300">{cp.deliverable}</p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-zinc-400">{cp.readyWhen}</p>

          <div className="mt-4 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">What this checks</h3>
            <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-bold', canAttempt ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300')}>
              {cp.met}/{cp.total} met
            </span>
          </div>

          <ul className="mt-2 space-y-2">
            {cp.results.map((result) => (
              <li
                key={result.id}
                className={cx(
                  'flex items-start gap-2.5 rounded-lg border p-2.5',
                  result.passed ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-500/5' : 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-500/5'
                )}
              >
                <span className={cx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white', result.passed ? 'bg-emerald-500' : 'bg-amber-500')}>
                  {result.passed ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-800 dark:text-zinc-200">{result.label}</span>
                  <span className={cx('mt-0.5 block break-words text-[11px]', result.passed ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-800 dark:text-amber-400')}>
                    {result.observed}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {error && (
            <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              {error}
            </p>
          )}

          {submit.data && !submit.data.passed && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Not quite there yet</p>
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">Go back and finish these, then try again. Nothing is lost — your lessons stay complete.</p>
            </div>
          )}

          {cp.passed ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                <Sparkles className="h-4 w-4" /> Checkpoint passed
              </p>
              <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">The next world is open. You can come back and re-run this check whenever the product changes.</p>
            </div>
          ) : !canAttempt ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/40">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <p className="text-xs text-slate-600 dark:text-zinc-400">
                Finish the criteria above to attempt this checkpoint. They are recorded automatically as you work through {world.title}.
              </p>
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 mt-auto border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">{cp.xp} XP when passed</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>Close</Button>
              {!cp.passed && (
                <Button
                  loading={submit.isPending}
                  disabled={!canAttempt}
                  onClick={() =>
                    submit.mutate(undefined, {
                      onSuccess: (result) => {
                        if (result.passed) {
                          const next = result.journey.worlds.find((w) => w.index === world.index);
                          onPassed(next?.title ?? null);
                        }
                      },
                      onError: (e) => setError((e as Error).message)
                    })
                  }
                >
                  Submit checkpoint
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
