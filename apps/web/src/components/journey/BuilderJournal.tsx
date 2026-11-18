import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { PlayerStats, XpEvent } from '@sv/shared';
import { get } from '../../api/client';
import { useSession } from '../../api/hooks';
import { Button, Card, CardHeader } from '../ui';

export function BuilderJournal({ stats: g }: { stats: PlayerStats }) {
  const me = useSession(),
    [open, setOpen] = useState(false);
  const journal = useInfiniteQuery({
    queryKey: ['xp-history', me.workspace.id, me.user.id],
    initialPageParam: null as string | null,
    enabled: open,
    queryFn: ({ pageParam }) =>
      get<{ rows: XpEvent[]; next: string | null }>(
        '/game/history' + (pageParam ? '?after=' + encodeURIComponent(pageParam) : '')
      ),
    getNextPageParam: (page) => page.next ?? undefined
  });
  return (
    <Card>
      <CardHeader title="Builder journal" subtitle="Your activity in this workspace · UTC dates" />
      <div className="space-y-4 p-4">
        {me.user.showStreak && (
          <>
            <h3 className="font-semibold text-sm">Activity calendar · last five weeks</h3>
            <ol className="grid grid-cols-7 gap-1" aria-label="Daily activity calendar">
              {g.calendar.map((d) => (
                <li
                  key={d.day}
                  title={`${d.day} · ${d.active ? 'Recorded work' : 'No recorded work'} · ${d.xp} XP`}
                  className={`rounded border p-1 text-center text-xs tabular-nums ${d.active ? 'border-teal-600 bg-teal-700 font-bold text-white' : 'border-zinc-300 dark:border-zinc-600'}`}
                >
                  <time dateTime={d.day}>{d.day.slice(8)}</time>
                  <span className="sr-only">
                    {' '}
                    {d.day}, {d.active ? 'recorded work' : 'no recorded work'}
                  </span>
                  {d.active ? ' ✓' : ''}
                </li>
              ))}
            </ol>
            <p className="text-xs">
              Current {g.streakDays} days · longest {g.longestStreak} days · a gap never takes away XP.
            </p>
            <details>
              <summary className="sv-link cursor-pointer text-sm">Streak history</summary>
              <ul className="max-h-40 overflow-auto text-xs">
                {g.streakHistory.map((r) => (
                  <li key={r.from}>
                    {r.from} — {r.to} · {r.days} {r.days === 1 ? 'day' : 'days'}
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
        <details>
          <summary className="sv-link cursor-pointer text-sm">Level history</summary>
          <p className="mt-2 text-xs">
            Level 1 starts at 0 XP. Later levels use the date your recorded total crossed the threshold.
          </p>
          <ol className="mt-1 max-h-40 overflow-auto text-sm">
            {g.levelHistory.map((l) => (
              <li key={l.level}>
                Level {l.level} · {l.day}
              </li>
            ))}
          </ol>
        </details>
        <Button size="sm" variant="secondary" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Close transaction history' : 'View all XP transactions'}
        </Button>
        {open && (
          <div>
            {journal.isLoading && <p role="status">Loading history…</p>}
            {journal.isError && (
              <button className="sv-link" onClick={() => journal.refetch()}>
                Could not load history. Retry
              </button>
            )}
            <ol className="divide-y divide-zinc-200 text-xs dark:divide-zinc-700">
              {journal.data?.pages
                .flatMap((page) => page.rows)
                .map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-2 py-2">
                    <span>
                      <strong>{e.label}</strong>
                      <br />
                      {e.createdAt.slice(0, 10)} · {e.origin === 'legacy' ? 'Pre-upgrade credit' : 'Earned credit'}
                    </span>
                    <span className="shrink-0">+{e.points} XP</span>
                  </li>
                ))}
            </ol>
            {journal.data?.pages[0]?.rows.length === 0 && <p className="text-xs">No recorded transactions yet.</p>}
            {journal.hasNextPage && (
              <Button
                size="sm"
                variant="secondary"
                loading={journal.isFetchingNextPage}
                onClick={() => journal.fetchNextPage()}
              >
                Load older transactions
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
