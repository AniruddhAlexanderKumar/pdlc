import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import type { XpAward } from '@sv/shared';
import { useGame } from '../api/hooks';
import { Button } from './ui';

const Ctx = createContext<((awards: XpAward[]) => void) | null>(null);

interface Pop extends XpAward {
  id: number;
}

/** Floating "+15 XP" pops whenever the server reports XP earned. */
export function CelebrateProvider({ children }: { children: ReactNode }) {
  const [pops, setPops] = useState<Pop[]>([]);
  const celebrate = useCallback((awards: XpAward[]) => {
    awards.forEach((a, i) => {
      setTimeout(() => {
        const id = Date.now() + Math.random();
        setPops((p) => [...p.slice(-4), { ...a, id }]);
        setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 2700);
      }, i * 350);
    });
  }, []);

  return (
    <Ctx.Provider value={celebrate}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 md:bottom-8" aria-live="polite">
        {pops.map((p) => (
          <div
            key={p.id}
            className="animate-xp-pop flex max-w-[90vw] items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-600/30"
          >
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold tabular-nums">+{p.points} XP</span>
            <span className="truncate">{p.label}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useCelebrate() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCelebrate outside CelebrateProvider');
  return ctx;
}

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#0ea5e9', '#f43f5e'];

export function Burst() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {Array.from({ length: 28 }, (_, i) => {
        const angle = (i / 28) * Math.PI * 2;
        const dist = 90 + (i % 4) * 30;
        return (
          <span
            key={i}
            className="burst-piece absolute left-1/2 top-1/3 h-2 w-2 rounded-sm"
            style={
              {
                background: COLORS[i % COLORS.length],
                '--dx': `${Math.cos(angle) * dist}px`,
                '--dy': `${Math.sin(angle) * dist}px`,
                animationDelay: `${(i % 5) * 40}ms`
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
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

  if (!shown) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="animate-rise relative w-full max-w-sm overflow-hidden rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <Burst />
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
          <Sparkles className="h-8 w-8" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Level up</p>
        <h2 className="mt-1 text-2xl font-bold">Level {shown.level}</h2>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">You are now a {shown.title}.</p>
        <Button className="mt-6 w-full" onClick={() => setShown(null)}>
          Keep going
        </Button>
      </div>
    </div>
  );
}
