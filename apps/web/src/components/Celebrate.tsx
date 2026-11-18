import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Award, X } from 'lucide-react';
import type { XpAward } from '@sv/shared';
import { useGame } from '../api/hooks';

const Ctx = createContext<((awards: XpAward[]) => void) | null>(null);

/** One quiet receipt per transaction, including multi-award milestones. The
 * itemised ledger remains available in Achievements. No client-issued credit. */
export function CelebrateProvider({ children }: { children: ReactNode }) {
  const [receipt, setReceipt] = useState<{ label: string; points: number } | null>(null);
  const celebrate = useCallback((awards: XpAward[]) => {
    if (awards.length)
      setReceipt({ label: awards.at(-1)!.label, points: awards.reduce((sum, a) => sum + a.points, 0) });
  }, []);
  useEffect(() => {
    if (!receipt) return;
    const timer = window.setTimeout(() => setReceipt(null), 2800);
    return () => window.clearTimeout(timer);
  }, [receipt]);
  return (
    <Ctx.Provider value={celebrate}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex justify-center md:bottom-6"
      >
        {receipt && (
          <div className="flex max-w-[90vw] items-center gap-3 rounded-lg border border-teal-200 bg-white px-4 py-2.5 text-sm shadow-md dark:border-zinc-700 dark:bg-zinc-900">
            <span className="truncate">{receipt.label}</span>
            <strong className="whitespace-nowrap text-xs tabular-nums text-teal-700 dark:text-teal-300">
              +{receipt.points} XP
            </strong>
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export function useCelebrate() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCelebrate outside CelebrateProvider');
  return ctx;
}

/** Watches the player's level and shows a level-up moment when it increases. */
export function LevelUpWatcher() {
  const { data } = useGame();
  const prev = useRef<number | null>(null);
  const [shown, setShown] = useState<{ level: number; title: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    if (prev.current !== null && data.level > prev.current) setShown({ level: data.level, title: data.levelTitle });
    prev.current = data.level;
  }, [data]);

  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), 6000);
    return () => window.clearTimeout(timer);
  }, [shown]);

  if (!shown) return null;
  return (
    <div
      className="fixed right-4 top-4 z-[80] flex w-[calc(100%-2rem)] max-w-sm items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
      role="status"
      aria-live="polite"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
        <Award className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Level {shown.level} reached</p>
        <p className="mt-1 text-xs text-zinc-500">{shown.title}</p>
      </div>
      <button
        type="button"
        onClick={() => setShown(null)}
        aria-label="Dismiss level notification"
        className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
