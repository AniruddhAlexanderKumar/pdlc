import { sql } from 'kysely';
import {
  ACHIEVEMENTS,
  XP,
  costSummary,
  levelFromXp,
  stageQuest,
  type LeaderboardEntry,
  type PlayerStats,
  type XpAward
} from '@sv/shared';
import type { AuthContext } from '../auth/session.js';
import type { Db } from '../db/index.js';
import { loadMaterials, loadProduct } from './repo.js';

/** Collects XP earned during one request so the response can report it. */
export class XpLedger {
  readonly awards: XpAward[] = [];
  constructor(
    private db: Db,
    readonly ctx: AuthContext
  ) {}

  /** Awards points once per (user, kind, ref). Returns true when newly awarded. */
  async award(kind: string, ref: string, points: number, label: string, productId: string | null = null): Promise<boolean> {
    if (points <= 0) return false;
    const inserted = await this.db
      .insertInto('xp_events')
      .values({ workspace_id: this.ctx.workspaceId, user_id: this.ctx.userId, product_id: productId, kind, ref, points, label })
      .onConflict((oc) => oc.columns(['workspace_id', 'user_id', 'kind', 'ref']).doNothing())
      .returning('id')
      .executeTakeFirst();
    if (inserted) this.awards.push({ points, label });
    return Boolean(inserted);
  }

  /**
   * Checks milestone awards that depend on the whole product: stage quest completion,
   * costs filled in, a price set. Called after any change to a product.
   */
  async evaluateProduct(productId: string) {
    const product = await loadProduct(this.db, this.ctx.workspaceId, productId);
    const materials = new Map((await loadMaterials(this.db, this.ctx.workspaceId, product.materials.map((m) => m.materialId))).map((m) => [m.id, m]));

    if (product.targetSellingPrice !== null) {
      await this.award('price_set', productId, XP.priceSet, `Set a price for ${product.name}`, productId);
    }
    const { labour, packaging, overhead } = product.costs;
    if (labour > 0 && packaging > 0 && overhead > 0) {
      await this.award('costs_filled', productId, XP.costsFilled, `Completed the cost sheet for ${product.name}`, productId);
    }
    const quest = stageQuest(product, materials);
    if (quest.complete) {
      await this.award('quest_complete', `${productId}:${product.stage}`, XP.questComplete, `${product.stage} quest complete: ${product.name}`, productId);
    }
    return { product, materials, summary: costSummary(product, materials) };
  }
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

function streakFromDays(days: string[]): number {
  const set = new Set(days);
  const cursor = new Date();
  // A streak survives until the end of the next day.
  if (!set.has(dayKey(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (set.has(dayKey(cursor))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export async function playerStats(db: Db, workspaceId: string, userId: string): Promise<PlayerStats> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totals, byKind, days, recent, products, suppliers, launches] = await Promise.all([
    db
      .selectFrom('xp_events')
      .select([
        sql<number>`coalesce(sum(points), 0)::int`.as('xp'),
        sql<number>`coalesce(sum(points) filter (where created_at >= ${weekAgo}), 0)::int`.as('weekly')
      ])
      .where('workspace_id', '=', workspaceId)
      .where('user_id', '=', userId)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('xp_events')
      .select(['kind', sql<number>`count(*)::int`.as('n')])
      .where('workspace_id', '=', workspaceId)
      .where('user_id', '=', userId)
      .groupBy('kind')
      .execute(),
    db
      .selectFrom('xp_events')
      .select(sql<string>`to_char(created_at at time zone 'UTC', 'YYYY-MM-DD')`.as('day'))
      .distinct()
      .where('workspace_id', '=', workspaceId)
      .where('user_id', '=', userId)
      .where('created_at', '>=', new Date(Date.now() - 400 * 24 * 60 * 60 * 1000))
      .execute(),
    db
      .selectFrom('xp_events')
      .select(['id', 'kind', 'points', 'label', 'product_id', 'created_at'])
      .where('workspace_id', '=', workspaceId)
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .limit(15)
      .execute(),
    db
      .selectFrom('products')
      .select(['id', 'stage', 'target_price', 'labour', 'packaging', 'overhead'])
      .where('workspace_id', '=', workspaceId)
      .execute(),
    db
      .selectFrom('suppliers')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirstOrThrow(),
    // Products this player personally moved into Launch.
    db
      .selectFrom('xp_events')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('workspace_id', '=', workspaceId)
      .where('user_id', '=', userId)
      .where('kind', '=', 'stage_advanced')
      .where('ref', 'like', '%:Launch')
      .executeTakeFirstOrThrow()
  ]);

  const kinds = Object.fromEntries(byKind.map((k) => [k.kind, k.n]));
  const streakDays = streakFromDays(days.map((d) => d.day));

  // Best margin across the workspace, for the Margin Master badge.
  let bestMargin: number | null = null;
  if (products.length > 0) {
    const bom = await db
      .selectFrom('product_materials as pm')
      .innerJoin('materials as m', 'm.id', 'pm.material_id')
      .select(['pm.product_id', sql<number>`sum(pm.quantity * m.unit_price)::float8`.as('cost')])
      .where(
        'pm.product_id',
        'in',
        products.map((p) => p.id)
      )
      .groupBy('pm.product_id')
      .execute();
    const bomCost = new Map(bom.map((b) => [b.product_id, b.cost]));
    for (const p of products) {
      if (!p.target_price) continue;
      const cost = (bomCost.get(p.id) ?? 0) + p.labour + p.packaging + p.overhead;
      const margin = ((p.target_price - cost) / p.target_price) * 100;
      bestMargin = bestMargin === null ? margin : Math.max(bestMargin, margin);
    }
  }

  const ctx = {
    productsCreated: kinds.product_created ?? 0,
    questionsAnswered: kinds.answer ?? 0,
    tasksCompleted: kinds.task_done ?? 0,
    suggestionsApplied: kinds.suggestion_applied ?? 0,
    stagesAdvanced: kinds.stage_advanced ?? 0,
    questsCompleted: kinds.quest_complete ?? 0,
    launchedProducts: launches.n,
    bestMargin,
    suppliers: suppliers.n,
    streakDays
  };

  const lvl = levelFromXp(totals.xp);
  return {
    xp: totals.xp,
    level: lvl.level,
    levelTitle: lvl.title,
    xpIntoLevel: lvl.xpIntoLevel,
    xpForNextLevel: lvl.xpForNextLevel,
    streakDays,
    weeklyXp: totals.weekly,
    achievements: ACHIEVEMENTS.map((a) => ({ id: a.id, unlocked: a.test(ctx) })),
    recent: recent.map((r) => ({
      id: r.id,
      kind: r.kind,
      points: r.points,
      label: r.label,
      productId: r.product_id,
      createdAt: r.created_at.toISOString()
    }))
  };
}

export async function leaderboard(db: Db, workspaceId: string): Promise<LeaderboardEntry[]> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .selectFrom('memberships as m')
    .innerJoin('users as u', 'u.id', 'm.user_id')
    .leftJoin('xp_events as x', (j) => j.onRef('x.user_id', '=', 'm.user_id').onRef('x.workspace_id', '=', 'm.workspace_id'))
    .select([
      'u.id',
      'u.name',
      sql<number>`coalesce(sum(x.points), 0)::int`.as('xp'),
      sql<number>`coalesce(sum(x.points) filter (where x.created_at >= ${weekAgo}), 0)::int`.as('weekly')
    ])
    .where('m.workspace_id', '=', workspaceId)
    .groupBy(['u.id', 'u.name'])
    .orderBy('weekly', 'desc')
    .orderBy('xp', 'desc')
    .execute();
  return rows.map((r) => ({ userId: r.id, name: r.name, xp: r.xp, weeklyXp: r.weekly, level: levelFromXp(r.xp).level }));
}
