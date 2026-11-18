import { sql } from 'kysely';
import {
  ACHIEVEMENTS,
  builderHistory,
  badgeProgress,
  type XpEvent,
  XP,
  costSummary,
  levelFromXp,
  productWorlds,
  isPhysicalKind,
  stampId,
  type Product,
  type World,
  type LeaderboardEntry,
  type PlayerStats,
  type StageId,
  type XpAward
} from '@sv/shared';
import type { AuthContext } from '../auth/session.js';
import type { Db } from '../db/index.js';
import { journeyFor } from './collaboration.js';
import { config } from '../config.js';
import { rewardValue } from './reward-rules.js';
import { conflict } from '../lib/http.js';
import { periodQuests, stampsFor } from './world-trail.js';
import { assertProduct } from './repo.js';

/** Collects XP earned during one request so the response can report it. */
export class XpLedger {
  readonly awards: XpAward[] = [];
  constructor(
    private db: Db,
    readonly ctx: AuthContext
  ) {}

  private before?: Product;
  private previousMargin = 0;
  private priorWorlds: World[] = [];
  private questProducts = new Set<string>();
  /** Run under the same row lock as the mutation. An edit to an unrelated field
   * must never earn somebody else's old cost, unit or checkpoint credit. */
  async observe(id: string) {
    await assertProduct(this.db, this.ctx.workspaceId, id, true);
    const { product, journey, materials } = await journeyFor(this.db, this.ctx.workspaceId, id);
    const prior = costSummary(product, materials);
    this.previousMargin = prior.totalUnitCost > 0 ? (prior.grossMargin ?? 0) : 0;
    this.before = product;
    this.priorWorlds = productWorlds(product, journey, null, await stampsFor(this.db, id));
  }
  async settleQuests() {
    for (const id of this.questProducts) {
      const p = await assertProduct(this.db, this.ctx.workspaceId, id);
      for (const q of await periodQuests(this.db, this.ctx.workspaceId, this.ctx.userId, p))
        if (q.progress >= q.target && !q.earned) {
          await this.award(
            q.period + '_quest',
            `${id}:${this.ctx.userId}:${q.period}:${q.start.slice(0, 10)}`,
            q.points,
            q.title,
            id
          );
        }
    }
  }
  private async stamp(
    id: string,
    node: string,
    earned: boolean,
    kind: string,
    ref: string,
    points: number,
    label: string
  ) {
    const r = await this.db
      .insertInto('journey_stamps')
      .values({
        product_id: id,
        node,
        actor_id: earned ? this.ctx.userId : null,
        origin: earned ? 'earned' : 'recognised'
      })
      .onConflict((oc) => oc.doNothing())
      .returning('node')
      .executeTakeFirst();
    if (r && earned) await this.award(kind, ref, points, label, id);
  }
  private async markWorld(p: Product, w: World, before: World | undefined) {
    for (const u of w.units)
      if (u.complete) {
        const changed = !before?.units.find((x) => x.id === u.id)?.complete;
        await this.stamp(
          p.id,
          stampId('unit', u.id),
          changed,
          'unit_complete',
          `${p.id}:${u.id}`,
          XP.unitComplete,
          `Unit complete: ${u.title}`
        );
      }
    if (w.ready)
      await this.stamp(
        p.id,
        stampId('checkpoint', w.stage),
        !before?.ready,
        'quest_complete',
        `${p.id}:${w.stage}`,
        XP.questComplete,
        `${w.stage} chapter complete: ${p.name}`
      );
  }
  /** Explicit pass/finish (and the legacy advance endpoint) recheck live evidence, even after an earlier receipt. */
  async checkWorld(p: Product, stage: StageId, finish: boolean) {
    const current = await journeyFor(this.db, this.ctx.workspaceId, p.id);
    const worlds = productWorlds(current.product, current.journey, null, await stampsFor(this.db, p.id)),
      w = worlds.find((x) => x.stage === stage);
    if (!w || w.lock || p.stage === 'Retired')
      throw conflict(w?.lock ?? 'Reopen this product before completing a world.');
    if (!w.ready) throw conflict(`Still needed in ${stage}: ${w.missing.join('; ')}.`);
    const before = this.priorWorlds.find((x) => x.stage === stage);
    await this.markWorld(p, w, before);
    if (finish)
      await this.stamp(
        p.id,
        stampId('world', stage),
        true,
        'world_complete',
        `${p.id}:${stage}`,
        XP.worldComplete,
        `World complete: ${stage} · ${p.name}`
      );
  }

  /** Awards points once per (workspace, kind, ref). Returns true when newly awarded. */
  async award(
    kind: string,
    ref: string,
    points: number,
    label: string,
    productId: string | null = null
  ): Promise<boolean> {
    points = rewardValue(config.BUILDER_XP_RULES, kind, points);
    if (points <= 0) return false;
    if (kind === 'answer' && productId) {
      const historical = await this.db
        .selectFrom('journey_upgrades')
        .select('product_id')
        .where('product_id', '=', productId)
        .where(sql<boolean>`${ref.slice(productId.length + 1)} = ANY(known_keys)`)
        .executeTakeFirst();
      if (historical) return false;
    }
    const inserted = await this.db
      .insertInto('xp_events')
      .values({
        workspace_id: this.ctx.workspaceId,
        user_id: this.ctx.userId,
        product_id: productId,
        kind,
        ref,
        points,
        label
      })
      .onConflict((oc) => oc.doNothing())
      .returning('id')
      .executeTakeFirst();
    if (inserted && productId && ['answer', 'unit_complete', 'quest_complete', 'task_done'].includes(kind))
      this.questProducts.add(productId);
    if (inserted) this.awards.push({ points, label });
    return Boolean(inserted);
  }

  /**
   * Checks milestone awards that depend on the whole product: stage quest completion,
   * costs filled in, a price set. Called after any change to a product.
   */
  async evaluateProduct(productId: string, touchedStage?: StageId | StageId[]) {
    const { product, journey, materials } = await journeyFor(this.db, this.ctx.workspaceId, productId);
    const before = this.before;
    if (product.targetSellingPrice !== null && before?.targetSellingPrice == null)
      await this.award('price_set', productId, XP.priceSet, `Set a price for ${product.name}`, productId);
    const filled = (p: Product) => {
      const { labour, packaging, overhead } = p.costs;
      return (
        (typeof p.answers['prototype.overhead'] === 'number' &&
          p.targetSellingPrice !== null &&
          (!isPhysicalKind(p.productKind) || p.materials.length > 0)) ||
        (labour > 0 && packaging > 0 && overhead > 0)
      );
    };
    if (filled(product) && (!before || !filled(before)))
      await this.award(
        'costs_filled',
        productId,
        XP.costsFilled,
        `Completed the cost sheet for ${product.name}`,
        productId
      );
    const summary = costSummary(product, materials);
    if (summary.totalUnitCost > 0 && (summary.grossMargin ?? 0) >= 50 && this.previousMargin < 50)
      await this.db
        .insertInto('builder_badges')
        .values({
          workspace_id: this.ctx.workspaceId,
          user_id: this.ctx.userId,
          badge: 'margin_master',
          origin: 'earned'
        })
        .onConflict((oc) => oc.doNothing())
        .execute();
    const old = this.priorWorlds;
    const touched = new Set([
      product.stage,
      ...(Array.isArray(touchedStage) ? touchedStage : touchedStage ? [touchedStage] : [])
    ]);
    for (const w of productWorlds(product, journey, null, await stampsFor(this.db, productId)))
      if (
        !w.lock &&
        (touched.has(w.stage) || (w.ready && !old.find((x) => x.stage === w.stage)?.ready)) &&
        product.stage !== 'Retired'
      )
        await this.markWorld(
          product,
          w,
          old.find((x) => x.stage === w.stage)
        );
    return { product, materials, summary: costSummary(product, materials) };
  }
}

/** Keyset cursor uses the DB timestamp of the cursor row, retaining PostgreSQL microseconds. */
export async function xpHistory(db: Db, ws: string, user: string, after?: string) {
  const result =
    await sql<XpEvent>`SELECT id,kind,points,label,product_id AS "productId",origin,created_at AS "createdAt" FROM xp_events x WHERE workspace_id=${ws} AND user_id=${user}
 ${after ? sql`AND (x.created_at,x.id)<(SELECT created_at,id FROM xp_events WHERE id=${after}::uuid AND workspace_id=${ws} AND user_id=${user})` : sql``}
 ORDER BY created_at DESC,id DESC LIMIT 31`.execute(db);
  const rows = result.rows.slice(0, 30);
  return { rows, next: result.rows.length > 30 ? rows.at(-1)!.id : null };
}
export async function playerStats(db: Db, workspaceId: string, userId: string): Promise<PlayerStats> {
  const scoped = () =>
    db.selectFrom('xp_events').where('workspace_id', '=', workspaceId).where('user_id', '=', userId);
  const [totals, byKind, days, recent, worlds, launches, badges] = await Promise.all([
    scoped()
      .select([
        sql<number>`coalesce(sum(points),0)::int`.as('xp'),
        sql<number>`coalesce(sum(points) filter(where created_at>=now()-interval '7 days'),0)::int`.as('weekly')
      ])
      .executeTakeFirstOrThrow(),
    scoped()
      .select(['kind', sql<number>`count(*)::int`.as('n')])
      .groupBy('kind')
      .execute(),
    sql<{
      day: string;
      xp: number;
    }>`SELECT day,sum(xp)::int AS xp FROM (SELECT to_char(created_at at time zone 'UTC','YYYY-MM-DD') AS day,points AS xp FROM xp_events WHERE workspace_id=${workspaceId} AND user_id=${userId} UNION ALL SELECT to_char(day,'YYYY-MM-DD'),0 FROM builder_activity_days WHERE workspace_id=${workspaceId} AND user_id=${userId}) t GROUP BY day ORDER BY day`.execute(
      db
    ),
    xpHistory(db, workspaceId, userId),
    scoped()
      .select([sql<string>`split_part(ref,':',2)`.as('world'), sql<number>`count(*)::int`.as('n')])
      .where('kind', '=', 'world_complete')
      .groupBy(sql`split_part(ref,':',2)`)
      .execute(),
    scoped()
      .select(sql<number>`count(*)::int`.as('n'))
      .where('kind', '=', 'stage_advanced')
      .where('ref', 'like', '%:Launch')
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('builder_badges')
      .select(['badge', 'origin'])
      .where('workspace_id', '=', workspaceId)
      .where('user_id', '=', userId)
      .execute()
  ]);
  const kinds = Object.fromEntries(byKind.map((k) => [k.kind, k.n])),
    history = builderHistory(days.rows),
    stored = new Map(badges.map((b) => [b.badge, b.origin]));
  const ctx = {
    productsCreated: kinds.product_created ?? 0,
    questionsAnswered: kinds.answer ?? 0,
    tasksCompleted: kinds.task_done ?? 0,
    suggestionsApplied: kinds.suggestion_applied ?? 0,
    stagesAdvanced: kinds.stage_advanced ?? 0,
    questsCompleted: kinds.quest_complete ?? 0,
    launchedProducts: launches.n,
    bestMargin: stored.has('margin_master') ? 50 : null,
    suppliers: kinds.supplier_added ?? 0,
    streakDays: history.longestStreak,
    units: kinds.unit_complete ?? 0,
    worlds: Object.fromEntries(worlds.map((w) => [w.world, w.n]))
  };
  const lvl = levelFromXp(totals.xp);
  return {
    xp: totals.xp,
    weeklyXp: totals.weekly,
    level: lvl.level,
    levelTitle: lvl.title,
    xpIntoLevel: lvl.xpIntoLevel,
    xpForNextLevel: lvl.xpForNextLevel,
    ...history,
    achievements: ACHIEVEMENTS.map((a) => {
      const [count, target] = badgeProgress(a.id, ctx);
      return {
        id: a.id,
        unlocked: a.test(ctx) || stored.has(a.id),
        progress: stored.has(a.id) ? target : Math.min(count, target),
        target,
        legacyTeam: stored.get(a.id) === 'legacy_team'
      };
    }),
    recent: recent.rows.slice(0, 15)
  };
}

export async function leaderboard(db: Db, workspaceId: string): Promise<LeaderboardEntry[]> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .selectFrom('memberships as m')
    .innerJoin('users as u', 'u.id', 'm.user_id')
    .leftJoin('xp_events as x', (j) =>
      j.onRef('x.user_id', '=', 'm.user_id').onRef('x.workspace_id', '=', 'm.workspace_id')
    )
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
  return rows.map((r) => ({
    userId: r.id,
    name: r.name,
    xp: r.xp,
    weeklyXp: r.weekly,
    level: levelFromXp(r.xp).level
  }));
}
