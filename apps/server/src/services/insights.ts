import { formatMoney, ruleInsights, type CurrencyCode, type Insight, type Material, type Product, type Supplier } from '@sv/shared';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

/**
 * Insight providers turn what we know about a product into "Improve it" suggestions.
 *
 * Today: the built-in rule engine (packages/shared/src/insights.ts).
 * Later: an AI provider. Implement `AiProvider` below, return it from `aiProvider()`,
 * and set INSIGHTS_PROVIDER=ai. AI suggestions are merged after the rule-based ones.
 * Give them `source: 'ai'` and leave `action` empty or use `open_tab`; the server only
 * applies actions that the rule engine can re-derive and verify.
 */

export interface InsightInput {
  product: Product;
  materials: Map<string, Material>;
  suppliers: Map<string, Supplier>;
  currency: CurrencyCode;
}

export interface AiProvider {
  name: string;
  /** Extra suggestions, e.g. market research, supplier discovery, pricing advice. */
  insights(input: InsightInput): Promise<Insight[]>;
  /** Follow-up discovery questions tailored to the product's answers so far. */
  followUpQuestions?(input: InsightInput): Promise<{ prompt: string; why: string }[]>;
}

let warned = false;
function aiProvider(): AiProvider | null {
  if (config.INSIGHTS_PROVIDER !== 'ai') return null;
  // Plug a real provider in here, configured from config.AI_API_KEY and config.AI_MODEL.
  if (!warned) {
    logger.warn('INSIGHTS_PROVIDER=ai but no AI provider is implemented yet; using rules only');
    warned = true;
  }
  return null;
}

export function rulesFor(input: InsightInput): Insight[] {
  return ruleInsights(input.product, input.materials, input.suppliers, (n) => formatMoney(n, input.currency));
}

export async function insightsFor(input: InsightInput): Promise<Insight[]> {
  const rules = rulesFor(input);
  const ai = aiProvider();
  if (!ai) return rules;
  try {
    const extra = await Promise.race([
      ai.insights(input),
      new Promise<Insight[]>((_, reject) => setTimeout(() => reject(new Error('AI provider timed out')), 15_000))
    ]);
    return [...rules, ...extra.map((i) => ({ ...i, source: 'ai' as const }))];
  } catch (err) {
    logger.error({ err, provider: ai.name }, 'AI insights failed; falling back to rules');
    return rules;
  }
}
