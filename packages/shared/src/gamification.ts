import { costSummary } from './costing.js';
import { isAnswered, questionsForStage } from './questions.js';
import { STAGE_IDS, stageIndex, type StageId } from './stages.js';
import type { Material, Product } from './types.js';

/**
 * Gamification rules. Points are awarded server-side (see apps/server/src/services/xp.ts)
 * with a unique reference per award, so repeating an action never earns XP twice.
 */

export const XP = {
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

  const required = questionsForStage(stage).filter((q) => q.required);
  const answered = required.filter((q) => isAnswered(product.answers[q.key])).length;
  if (required.length > 0) {
    items.push({
      id: 'questions',
      label: `Answer the ${stage} questions (${answered}/${required.length})`,
      done: answered === required.length,
      tab: 'discover'
    });
  }

  const tasks = product.tasks;
  const doneTasks = tasks.filter((t) => t.status === 'done').length;
  const summary = costSummary(product, materials);
  const costsFilled = product.costs.labour > 0 || product.costs.packaging > 0 || product.costs.overhead > 0;

  switch (stage) {
    case 'Idea':
      items.push({ id: 'description', label: 'Describe the product', done: product.description.trim().length > 0, tab: 'overview' });
      break;
    case 'Research':
      items.push({ id: 'task', label: 'Plan at least one research task', done: tasks.length > 0, tab: 'tasks' });
      break;
    case 'Planning':
      items.push({ id: 'price', label: 'Set a target selling price', done: product.targetSellingPrice !== null, tab: 'costs' });
      items.push({ id: 'tasks', label: 'Break the work into 3+ tasks', done: tasks.length >= 3, tab: 'tasks' });
      break;
    case 'Design':
      items.push({ id: 'bom', label: 'Add 2+ materials to the bill of materials', done: product.materials.length >= 2, tab: 'materials' });
      break;
    case 'Prototype':
      items.push({ id: 'costs', label: 'Fill in labour, packaging and overhead', done: costsFilled, tab: 'costs' });
      items.push({ id: 'bom', label: 'Bill of materials has 3+ lines', done: product.materials.length >= 3, tab: 'materials' });
      break;
    case 'Testing':
      items.push({
        id: 'tasks',
        label: 'Finish 80% of tasks',
        done: tasks.length > 0 && doneTasks / tasks.length >= 0.8,
        tab: 'tasks'
      });
      break;
    case 'Launch':
      items.push({
        id: 'margin',
        label: 'Reach a healthy margin (30%+)',
        done: summary.grossMargin !== null && summary.grossMargin >= 30,
        tab: 'costs'
      });
      items.push({ id: 'tasks', label: 'Close every launch task', done: tasks.length > 0 && doneTasks === tasks.length, tab: 'tasks' });
      break;
    case 'Improvement':
      items.push({
        id: 'margin',
        label: 'Push margin to 40%+',
        done: summary.grossMargin !== null && summary.grossMargin >= 40,
        tab: 'costs'
      });
      break;
    case 'Retired':
      break;
  }

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
  const required = upto.flatMap((s) => questionsForStage(s).filter((q) => q.required));
  const discovery = required.length === 0 ? 1 : required.filter((q) => isAnswered(product.answers[q.key])).length / required.length;

  const summary = costSummary(product, materials);
  const costParts = [product.materials.length > 0, product.costs.labour > 0 || product.costs.packaging > 0 || product.costs.overhead > 0, product.targetSellingPrice !== null];
  const costs = costParts.filter(Boolean).length / costParts.length;

  const margin = summary.grossMargin === null ? 0 : Math.max(0, Math.min(1, summary.grossMargin / 50));

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
