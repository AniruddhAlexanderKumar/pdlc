import { z } from 'zod';

export const graphIntentSchema = z.object({
  intent: z.enum(['connections', 'impact', 'unassigned', 'high_priority', 'blockers', 'disconnected', 'duplicates', 'assigned', 'unsupported']),
  person: z.string().max(80).nullable().optional()
});
export type GraphIntent = z.infer<typeof graphIntentSchema>;

/** Model output can choose only an allowlisted operation; it can never supply SQL or facts. */
export function parseGraphIntent(raw: string, question: string): GraphIntent {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const result = graphIntentSchema.safeParse(JSON.parse(cleaned));
  if (!result.success) throw new Error('Invalid intent');
  const intent = result.data;
  if (intent.person && !question.toLocaleLowerCase().includes(intent.person.toLocaleLowerCase())) return { intent: 'unsupported' };
  return intent;
}
