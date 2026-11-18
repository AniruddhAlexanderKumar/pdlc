import { levelFromXp } from './gamification.js';
/** UTC activity dates derived from the member's ledger + substantive saved revisions, never visits. */
export function builderHistory(days: { day: string; xp: number }[], now = new Date()) {
  const today = now.toISOString().slice(0, 10),
    yesterday = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
  const runs: { from: string; to: string; days: number }[] = [],
    levels: { level: number; day: string }[] = [];
  let total = 0,
    level = 1;
  for (const row of [...days].sort((a, b) => a.day.localeCompare(b.day))) {
    const prev = runs.at(-1);
    if (prev && Date.parse(row.day) - Date.parse(prev.to) === 86400000) {
      prev.to = row.day;
      prev.days++;
    } else runs.push({ from: row.day, to: row.day, days: 1 });
    total += row.xp;
    const next = levelFromXp(total).level;
    while (level < next) levels.push({ level: ++level, day: row.day });
  }
  const last = runs.at(-1),
    map = new Map(days.map((d) => [d.day, d.xp]));
  return {
    streakDays: last && (last.to === today || last.to === yesterday) ? last.days : 0,
    longestStreak: runs.reduce((a, r) => Math.max(a, r.days), 0),
    streakHistory: runs.reverse(),
    levelHistory: levels.reverse(),
    calendar: Array.from({ length: 35 }, (_, i) => {
      const day = new Date(Date.parse(today) - (34 - i) * 86400000).toISOString().slice(0, 10);
      return { day, active: map.has(day), xp: map.get(day) ?? 0 };
    })
  };
}

/** UTC day start and the Monday that anchors its (half-open) quest week. */
export function periodBounds(now: Date) {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
    week = new Date(+day - ((day.getUTCDay() + 6) % 7) * 86400000);
  return { day, week };
}
