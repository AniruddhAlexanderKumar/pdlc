import { requiresApproval } from './activity.js';
import { costSummary } from './costing.js';
import { isPhysicalKind, lessonEvidence, isAnswered, questionsForStage } from './questions.js';
import { STAGE_IDS, stageIndex, type StageId } from './stages.js';
import type { Material, Product } from './types.js';

/**
 * Gamification rules. Points are awarded server-side (see apps/server/src/services/xp.ts)
 * with a unique reference per award, so repeating an action never earns XP twice.
 */

export const XP = {
  unitComplete: 50,
  worldComplete: 200,
  dailyQuest: 20,
  weeklyQuest: 75,
  productCreated: 20,
  taskCompleted: 15,
  materialAdded: 5,
  costsFilled: 20,
  priceSet: 10,
  stageAdvanced: 50,
  questComplete: 100,
  suggestionApplied: 25,
  supplierAdded: 10,
  materialCreated: 5
} as const;

export const LEVEL_TITLES = [
  'Spark',
  'Tinkerer',
  'Maker',
  'Builder',
  'Shipper',
  'Product Pro',
  'Velocity Captain',
  'Lifecycle Legend'
];

/** Total XP needed to reach a level. L1 = 0, L2 = 100, L3 = 300, L4 = 600, L5 = 1000… */
export function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export function levelFromXp(xp: number) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return {
    level,
    title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
    xpIntoLevel: xp - base,
    xpForNextLevel: next - base
  };
}

// ── Stage quests ──────────────────────────────────────────────────────────

export interface QuestItem {
  id: string;
  label: string;
  done: boolean;
  /** Where in the product workspace the user can complete this item. */
  tab: 'discover' | 'materials' | 'costs' | 'tasks' | 'overview';
}

export interface StageQuest {
  stage: StageId;
  items: QuestItem[];
  done: number;
  total: number;
  /** 0–100 */
  progress: number;
  complete: boolean;
}

export function stageQuest(product: Product, materials: Map<string, Material>, stage: StageId = product.stage): StageQuest {
  const items: QuestItem[] = [];

  const required = questionsForStage(stage, product.productKind).filter((q) => q.required);
  const answered = required.filter(
    (q) =>
      lessonEvidence(q, product.answers[q.key]) &&
      (!product.approvalStates || !requiresApproval(q.key) || product.approvalStates[q.key] === 'approved')
  ).length;
  if (required.length > 0) {
    items.push({
      id: 'questions',
      label: `Finish the ${stage} activities (${answered}/${required.length})`,
      done: answered === required.length,
      tab: 'discover'
    });
  }

  // Practical work is checked against its real record, never a minimum margin,
  // arbitrary task quota or a physical-materials requirement for every product.
  if (stage === 'Idea') items.push({ id: 'description', label: 'Describe the product', done: !!product.description.trim(), tab: 'overview' });
  if (stage === 'Research') items.push({ id: 'task', label: 'Schedule your next research task', done: product.tasks.some(t => t.chapter === stage), tab: 'tasks' });
  if (stage === 'Prototype') items.push({ id: 'tasks', label: 'Add your next build task', done: product.tasks.some(t => t.chapter === stage), tab: 'tasks' });
  if (stage === 'Launch') items.push({ id: 'price', label: 'Set a selling price in the cost sheet', done: product.targetSellingPrice !== null, tab: 'costs' });
  if (stage === 'Retired') items.push({ id: 'retire_reason', label: 'Record the reason for archiving', done: isAnswered(product.answers['retired.reason']), tab: 'discover' });

  const done = items.filter((i) => i.done).length;
  const total = items.length;
  return {
    stage,
    items,
    done,
    total,
    progress: total === 0 ? 100 : Math.round((done / total) * 100),
    complete: total > 0 && done === total
  };
}

// ── Product health ────────────────────────────────────────────────────────

export interface ProductHealth {
  /** 0–100 */
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  parts: { discovery: number; costs: number; margin: number; tasks: number };
}

/** A single number that tells you how well-understood and how healthy a product is. */
export function productHealth(product: Product, materials: Map<string, Material>): ProductHealth {
  const upto = STAGE_IDS.slice(0, Math.max(stageIndex(product.stage), 0) + 1);
  const required = upto.flatMap((s) => questionsForStage(s, product.productKind).filter((q) => q.required));
  const discovery = required.length === 0 ? 1 : required.filter((q) => isAnswered(product.answers[q.key])).length / required.length;

  const summary = costSummary(product, materials);
  const costParts = [product.costs.labour > 0 || product.costs.packaging > 0 || product.costs.overhead > 0 || isAnswered(product.answers['prototype.overhead']), product.targetSellingPrice !== null];
  if (isPhysicalKind(product.productKind) || !product.productKind) costParts.push(product.materials.length > 0);
  const costs = costParts.filter(Boolean).length / costParts.length;

  const margin = summary.grossMargin === null || summary.totalUnitCost <= 0 ? 0 : Math.max(0, Math.min(1, summary.grossMargin / 50));

  const tasks = product.tasks.length === 0 ? 0.5 : product.tasks.filter((t) => t.status === 'done').length / product.tasks.length;

  const score = Math.round(discovery * 35 + costs * 25 + margin * 25 + tasks * 15);
  const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';
  return {
    score,
    grade,
    parts: {
      discovery: Math.round(discovery * 100),
      costs: Math.round(costs * 100),
      margin: Math.round(margin * 100),
      tasks: Math.round(tasks * 100)
    }
  };
}

// ── Achievements ──────────────────────────────────────────────────────────

export interface AchievementContext {
  productsCreated: number;
  questionsAnswered: number;
  tasksCompleted: number;
  suggestionsApplied: number;
  stagesAdvanced: number;
  questsCompleted: number;
  launchedProducts: number;
  bestMargin: number | null;
  suppliers: number;
  streakDays: number;
  units?: number;
  worlds?: Record<string, number>;
}

export const ACHIEVEMENTS: { id: string; title: string; description: string; test: (c: AchievementContext) => boolean }[] = [
  { id: 'first_product', title: 'Day One', description: 'Create your first product', test: (c) => c.productsCreated >= 1 },
  { id: 'curious', title: 'Curious Mind', description: 'Answer 10 discovery questions', test: (c) => c.questionsAnswered >= 10 },
  { id: 'deep_diver', title: 'Deep Diver', description: 'Answer 50 discovery questions', test: (c) => c.questionsAnswered >= 50 },
  { id: 'closer', title: 'Closer', description: 'Complete 10 tasks', test: (c) => c.tasksCompleted >= 10 },
  { id: 'quest_master', title: 'Quest Master', description: 'Complete 3 stage quests', test: (c) => c.questsCompleted >= 3 },
  { id: 'momentum', title: 'Momentum', description: 'Move products forward 5 stages', test: (c) => c.stagesAdvanced >= 5 },
  { id: 'ship_it', title: 'Ship It', description: 'Take a product to Launch', test: (c) => c.launchedProducts >= 1 },
  { id: 'margin_master', title: 'Margin Master', description: 'Get a product to a 50% margin', test: (c) => (c.bestMargin ?? 0) >= 50 },
  { id: 'optimizer', title: 'Optimizer', description: 'Apply 3 improvement suggestions', test: (c) => c.suggestionsApplied >= 3 },
  { id: 'scout', title: 'Supplier Scout', description: 'Add 3 suppliers', test: (c) => c.suppliers >= 3 },
  { id: 'on_fire', title: 'On Fire', description: 'Keep a 5-day streak', test: (c) => c.streakDays >= 5 }
];

/** Badges are durable honours, not a second payment for an already rewarded milestone. */
const worldTitles = [
  'Idea Founder',
  'Market Explorer',
  'Master Planner',
  'Design Thinker',
  'First Build',
  'Quality Seeker',
  'Ready for Launch',
  'Continuous Innovator'
];
for (const [i, world] of STAGE_IDS.slice(0, 8).entries())
  ACHIEVEMENTS.push({
    id: 'world_' + world,
    title: worldTitles[i],
    description: `Personally finish the ${world} world checkpoint and close that world.`,
    test: (c) => (c.worlds?.[world] ?? 0) > 0
  });
ACHIEVEMENTS.push(
  {
    id: 'first_steps',
    title: 'First Steps',
    description: 'Record your first lesson output.',
    test: (c) => c.questionsAnswered >= 1
  },
  {
    id: 'unit_maker',
    title: 'Milestone Maker',
    description: 'Complete your first unit.',
    test: (c) => (c.units ?? 0) >= 1
  },
  ...([7, 30] as const).map((n) => ({
    id: 'streak_' + n,
    title: n === 7 ? 'Seven-Day Consistency' : 'Month of Making',
    description: `Record meaningful work on ${n} consecutive UTC days.`,
    test: (c: AchievementContext) => c.streakDays >= n
  }))
);
export function badgeProgress(id: string, c: AchievementContext): [number, number] {
  const m: Record<string, [number, number]> = {
    first_product: [c.productsCreated, 1],
    curious: [c.questionsAnswered, 10],
    deep_diver: [c.questionsAnswered, 50],
    closer: [c.tasksCompleted, 10],
    quest_master: [c.questsCompleted, 3],
    momentum: [c.stagesAdvanced, 5],
    ship_it: [c.launchedProducts, 1],
    margin_master: [c.bestMargin ?? 0, 50],
    optimizer: [c.suggestionsApplied, 3],
    scout: [c.suppliers, 3],
    on_fire: [c.streakDays, 5],
    first_steps: [c.questionsAnswered, 1],
    unit_maker: [c.units ?? 0, 1],
    streak_7: [c.streakDays, 7],
    streak_30: [c.streakDays, 30]
  };
  return m[id] ?? [c.worlds?.[id.replace('world_', '')] ?? 0, 1];
}
