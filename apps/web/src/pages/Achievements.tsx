import { Link } from 'react-router';
import { Crown, Flame, History, Lock, Medal, Trophy } from 'lucide-react';
import { ACHIEVEMENTS, LEVEL_TITLES, xpForLevel } from '@sv/shared';
import { useGame, useLeaderboard, useSession } from '../api/hooks';
import { Card, CardHeader, cx, PageHeader, ProgressBar, Spinner } from '../components/ui';

function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function AchievementsPage() {
  const me = useSession();
  const game = useGame();
  const board = useLeaderboard();
  if (!game.data) return <Spinner />;
  const g = game.data;
  const unlocked = new Set(g.achievements.filter((a) => a.unlocked).map((a) => a.id));

  return (
    <>
      <PageHeader title="Achievements" subtitle="Earn XP by learning about your products, tracking costs and making them better." />
      <div className="grid gap-5 px-4 py-5 md:px-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="bg-[#174e78] p-5 text-white">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-100">Level {g.level}</p>
                  <h2 className="text-2xl font-bold">{g.levelTitle}</h2>
                  <p className="mt-1 text-sm text-blue-100">{g.xp.toLocaleString()} XP total</p>
                </div>
                <div className="text-right">
                  <p className="flex items-center justify-end gap-1 text-2xl font-bold">
                    <Flame className="h-6 w-6 text-orange-300" />
                    {g.streakDays}
                  </p>
                  <p className="text-xs text-blue-100">day streak</p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-white transition-all duration-700" style={{ width: `${(g.xpIntoLevel / g.xpForNextLevel) * 100}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-blue-100">
                {g.xpForNextLevel - g.xpIntoLevel} XP to level {g.level + 1} · {LEVEL_TITLES[Math.min(g.level, LEVEL_TITLES.length - 1)]}
              </p>
            </div>
            <div className="grid grid-cols-4 divide-x divide-zinc-100 text-center dark:divide-zinc-800">
              {LEVEL_TITLES.slice(0, 4).map((t, i) => (
                <div key={t} className={cx('px-2 py-3', g.level >= i + 1 ? '' : 'opacity-40')}>
                  <p className="text-xs font-semibold">Lv {i + 1}</p>
                  <p className="truncate text-[11px] text-zinc-500">{t}</p>
                  <p className="text-[10px] tabular-nums text-zinc-400">{xpForLevel(i + 1)} XP</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader icon={<Trophy className="h-4 w-4" />} title="Badges" subtitle={`${unlocked.size} of ${ACHIEVEMENTS.length} unlocked`} />
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {ACHIEVEMENTS.map((a) => {
                const on = unlocked.has(a.id);
                return (
                  <div
                    key={a.id}
                    className={cx(
                      'flex items-center gap-3 rounded-xl border p-3 transition-colors',
                      on ? 'border-amber-400/40 bg-amber-500/5' : 'border-zinc-200 dark:border-zinc-800'
                    )}
                  >
                    <div className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl', on ? 'bg-amber-500/10' : 'bg-zinc-100 grayscale dark:bg-zinc-800')}>
                      {on ? <Trophy className="h-5 w-5 text-amber-700 dark:text-amber-400" aria-hidden="true" /> : <Lock className="h-4 w-4 text-zinc-400" />}
                    </div>
                    <div className="min-w-0">
                      <p className={cx('text-sm font-semibold', !on && 'text-zinc-500')}>{a.title}</p>
                      <p className="text-xs text-zinc-500">{a.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader icon={<Medal className="h-4 w-4" />} title="Team leaderboard" subtitle="XP earned in the last 7 days" />
            {board.isLoading ? (
              <Spinner />
            ) : (
              <ol className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {(board.data ?? []).map((e, i) => (
                  <li key={e.userId} className={cx('flex items-center gap-3 px-4 py-2.5', e.userId === me.user.id && 'bg-blue-500/5')}>
                    <span className="w-5 text-center text-sm font-semibold tabular-nums text-zinc-400">{i === 0 ? <Crown className="h-4 w-4 text-amber-500" /> : i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {e.name}
                        {e.userId === me.user.id && <span className="ml-1 text-xs text-zinc-400">(you)</span>}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        Level {e.level} · {e.xp.toLocaleString()} XP total
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{e.weeklyXp}</span>
                  </li>
                ))}
              </ol>
            )}
            {(board.data?.length ?? 0) <= 1 && (
              <p className="border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500 dark:border-zinc-800">
                Invite your team from{' '}
                <Link to="/settings" className="font-medium text-blue-600 dark:text-blue-400">
                  Settings
                </Link>{' '}
                to compete.
              </p>
            )}
          </Card>

          <Card>
            <CardHeader icon={<History className="h-4 w-4" />} title="Recent XP" />
            {g.recent.length === 0 ? (
              <p className="px-4 py-4 text-sm text-zinc-500">Nothing yet. Answer a question to get started!</p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {g.recent.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 px-4 py-2.5">
                    <span className="mt-0.5 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-blue-700 dark:text-blue-300">+{r.points}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{r.label}</p>
                      <p className="text-[11px] text-zinc-400">{timeAgo(r.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
              <ProgressBar value={(g.weeklyXp / Math.max(200, g.weeklyXp)) * 100} />
              <p className="mt-1.5 text-[11px] text-zinc-500">{g.weeklyXp} XP this week · aim for 200</p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
