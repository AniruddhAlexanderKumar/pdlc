import { cheaperQuote, costSummary } from './costing.js';
import { stageQuest } from './gamification.js';
import { isAnswered, questionsForStage } from './questions.js';
import { nextStage } from './stages.js';
import type { Material, Product, Supplier } from './types.js';

/**
 * "Improve it" suggestions. The rule engine below runs everywhere; the server can
 * merge in suggestions from an AI provider (source: 'ai') using the same shape.
 */

export type InsightAction =
  | { type: 'switch_supplier'; materialId: string; supplierId: string; price: number }
  | { type: 'set_price'; price: number }
  | { type: 'open_tab'; tab: 'discover' | 'materials' | 'costs' | 'tasks' | 'overview' }
  | { type: 'advance_stage' };

export interface Insight {
  /** Stable for the same underlying situation, so applying it can be rewarded once. */
  id: string;
  kind: 'supplier' | 'pricing' | 'margin' | 'discovery' | 'tasks' | 'costs' | 'stage';
  tone: 'win' | 'tip' | 'warning';
  title: string;
  detail: string;
  /** Extra profit per unit if applied. */
  perUnitImpact?: number;
  action?: InsightAction;
  source: 'rules' | 'ai';
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function ruleInsights(
  product: Product,
  materials: Map<string, Material>,
  suppliers: Map<string, Supplier>,
  fmt: (n: number) => string
): Insight[] {
  const out: Insight[] = [];
  const summary = costSummary(product, materials);
  const targetMarginRaw = product.answers['planning.target_margin'];
  const targetMargin = typeof targetMarginRaw === 'number' ? targetMarginRaw : 40;

  // Cheaper supplier quotes for materials in the BOM.
  for (const line of summary.lines) {
    if (!line.material) continue;
    const quote = cheaperQuote(line.material);
    if (!quote) continue;
    const supplier = suppliers.get(quote.supplierId);
    const perUnit = round2(quote.saving * line.quantity);
    if (perUnit <= 0) continue;
    out.push({
      id: `supplier:${line.materialId}:${quote.supplierId}:${quote.quotedPrice}`,
      kind: 'supplier',
      tone: 'tip',
      title: `Switch ${line.material.name} to ${supplier?.name ?? 'a cheaper supplier'}`,
      detail: `${fmt(line.material.unitPrice)} → ${fmt(quote.quotedPrice)} per ${line.material.unit}${quote.moq ? ` (MOQ ${quote.moq})` : ''}. Saves ${fmt(perUnit)} on every unit. This updates the material price everywhere it is used.`,
      perUnitImpact: perUnit,
      action: { type: 'switch_supplier', materialId: line.materialId, supplierId: quote.supplierId, price: quote.quotedPrice },
      source: 'rules'
    });
  }

  // Pricing vs. target margin.
  if (summary.targetPrice === null) {
    if (summary.totalUnitCost > 0) {
      const suggested = Math.ceil(summary.totalUnitCost / (1 - targetMargin / 100));
      out.push({
        id: `price:none:${suggested}`,
        kind: 'pricing',
        tone: 'warning',
        title: 'Set a selling price',
        detail: `It costs ${fmt(summary.totalUnitCost)} to make. Selling at ${fmt(suggested)} gives you a ${targetMargin}% margin.`,
        action: { type: 'set_price', price: suggested },
        source: 'rules'
      });
    }
  } else if (summary.grossMargin !== null && summary.grossMargin < targetMargin && summary.totalUnitCost > 0 && targetMargin < 95) {
    const suggested = Math.ceil(summary.totalUnitCost / (1 - targetMargin / 100));
    const market = product.answers['research.market_price'];
    const aboveMarket = typeof market === 'number' && suggested > market * 1.15;
    out.push({
      id: `price:${summary.targetPrice}:${suggested}`,
      kind: 'margin',
      tone: 'warning',
      title: `Margin is ${summary.grossMargin}%, below your ${targetMargin}% goal`,
      detail: aboveMarket
        ? `Raising the price to ${fmt(suggested)} would hit your goal, but that is well above the market price you noted (${fmt(market as number)}). Look at cutting costs first.`
        : `Raising the price to ${fmt(suggested)} hits your goal and adds ${fmt(round2(suggested - summary.targetPrice))} profit per unit.`,
      perUnitImpact: aboveMarket ? undefined : round2(suggested - summary.targetPrice),
      action: aboveMarket ? { type: 'open_tab', tab: 'costs' } : { type: 'set_price', price: suggested },
      source: 'rules'
    });
  } else if (summary.grossMargin !== null && summary.grossMargin >= targetMargin) {
    out.push({
      id: `margin:healthy`,
      kind: 'margin',
      tone: 'win',
      title: `Healthy ${summary.grossMargin}% margin`,
      detail: `You keep ${fmt(summary.grossProfit ?? 0)} on every sale, at or above your ${targetMargin}% goal.`,
      source: 'rules'
    });
  }

  // Biggest cost driver.
  if (summary.totalUnitCost > 0) {
    const biggest = [...summary.lines].sort((a, b) => b.lineCost - a.lineCost)[0];
    if (biggest?.material && biggest.lineCost / summary.totalUnitCost >= 0.35) {
      out.push({
        id: `driver:${biggest.materialId}`,
        kind: 'costs',
        tone: 'tip',
        title: `${biggest.material.name} is ${Math.round((biggest.lineCost / summary.totalUnitCost) * 100)}% of your cost`,
        detail: 'Getting a second supplier quote for this material is the fastest way to improve your margin.',
        action: { type: 'open_tab', tab: 'materials' },
        source: 'rules'
      });
    }
  }

  // Missing information.
  const unanswered = questionsForStage(product.stage).filter((q) => q.required && !isAnswered(product.answers[q.key]));
  if (unanswered.length > 0) {
    out.push({
      id: `discover:${product.stage}:${unanswered.length}`,
      kind: 'discovery',
      tone: 'tip',
      title: `${unanswered.length} ${product.stage} question${unanswered.length > 1 ? 's' : ''} to answer`,
      detail: `Start with: “${unanswered[0].prompt}”`,
      action: { type: 'open_tab', tab: 'discover' },
      source: 'rules'
    });
  }
  if (product.materials.length === 0 && ['Design', 'Prototype', 'Testing', 'Launch', 'Improvement'].includes(product.stage)) {
    out.push({
      id: 'bom:empty',
      kind: 'costs',
      tone: 'warning',
      title: 'No materials yet',
      detail: 'Add what goes into the product so you can see exactly where the money goes.',
      action: { type: 'open_tab', tab: 'materials' },
      source: 'rules'
    });
  }

  // Overdue tasks.
  const today = new Date().toISOString().slice(0, 10);
  const overdue = product.tasks.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < today);
  if (overdue.length > 0) {
    out.push({
      id: `tasks:overdue:${overdue.length}`,
      kind: 'tasks',
      tone: 'warning',
      title: `${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}`,
      detail: overdue.slice(0, 3).map((t) => t.title).join(' · '),
      action: { type: 'open_tab', tab: 'tasks' },
      source: 'rules'
    });
  }

  // Ready to level up.
  const quest = stageQuest(product, materials);
  const next = nextStage(product.stage);
  if (quest.complete && next) {
    out.push({
      id: `stage:${product.stage}`,
      kind: 'stage',
      tone: 'win',
      title: `Ready for ${next}`,
      detail: `You completed the ${product.stage} quest. Move the product forward to earn bonus XP.`,
      action: { type: 'advance_stage' },
      source: 'rules'
    });
  }

  const order = { warning: 0, tip: 1, win: 2 } as const;
  return out.sort((a, b) => order[a.tone] - order[b.tone] || (b.perUnitImpact ?? 0) - (a.perUnitImpact ?? 0));
}
