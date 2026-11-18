import { z } from 'zod';
const points = z.number().int().min(1).max(1000).optional();
export const rewardOverrides = z.preprocess(
  (raw) => {
    if (raw === undefined || raw === '') return {};
    if (typeof raw !== 'string') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  z
    .object({
      normalLesson: points,
      substantialLesson: points,
      deliverableLesson: points,
      unit: points,
      checkpoint: points,
      world: points,
      daily: points,
      weekly: points
    })
    .strict()
);
export function rewardValue(rules: z.output<typeof rewardOverrides>, kind: string, base: number): number {
  const byKind: Record<string, keyof typeof rules> = {
    answer: base >= 30 ? 'deliverableLesson' : base >= 15 ? 'substantialLesson' : 'normalLesson',
    unit_complete: 'unit',
    quest_complete: 'checkpoint',
    world_complete: 'world',
    daily_quest: 'daily',
    weekly_quest: 'weekly'
  };
  return rules[byKind[kind]] ?? base;
}
