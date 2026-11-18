import { rewardValue } from './reward-rules.js';
import { config } from '../config.js';
import { sql } from 'kysely';
import {
  currentLesson,
  periodBounds,
  productWorlds,
  QUESTIONS_BY_KEY,
  XP,
  type PeriodQuest,
  type ProductUpgrade,
  type WorkSource,
  type Trail,
  type Journey,
  type Product,
  type StageId
} from '@sv/shared';
import type { Db } from '../db/index.js';

export async function workSources(db: Db, workspaceId: string, p: Product): Promise<WorkSource[]> {
  const [designs, model] = await Promise.all([
    sql<{
      id: string;
      title: string;
      revision: number;
      summary: string;
      labels: string[];
    }>`SELECT d.id,d.title,d.head_revision AS revision,r.summary,
      ARRAY(SELECT left(n->>'label',120) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.source->'nodes')='array' THEN r.source->'nodes' ELSE '[]'::jsonb END) n WHERE n->>'label' IS NOT NULL LIMIT 8) AS labels
      FROM design_documents d JOIN design_revisions r ON r.document_id=d.id AND r.revision=d.head_revision WHERE d.workspace_id=${workspaceId} AND d.product_id=${p.id} ORDER BY d.updated_at DESC LIMIT 12`.execute(
      db
    ),
    db
      .selectFrom('product_cad_models')
      .select(['filename', 'head_revision'])
      .where('workspace_id', '=', workspaceId)
      .where('product_id', '=', p.id)
      .executeTakeFirst()
  ]);
  const sources: WorkSource[] = designs.rows.map((d) => ({
    id: d.id,
    label: d.title,
    excerpt: `Diagram revision ${d.revision}: ${[...d.labels, d.summary].filter(Boolean).join(' · ')}`.slice(
      0,
      900
    ),
    keys: ['design.journey', 'design.behaviour', 'design.decision', 'design.interfaces', 'design.architecture'],
    href: `/designs/${d.id}`
  }));
  if (model)
    sources.push({
      id: 'cad',
      label: model.filename,
      excerpt: `Product CAD model, revision ${model.head_revision}. The file alone does not prove a physical trial.`,
      keys: ['design.interfaces', 'prototype.artifact', 'prototype.learnings'],
      href: `/products/${p.id}/cad`
    });
  if (p.notes.trim())
    sources.push({
      id: 'notes',
      label: 'Product notebook',
      excerpt: p.notes.slice(0, 1500),
      keys: ['idea.problem', 'planning.roadmap', 'research.finding', 'testing.results', 'improve.feedback'],
      href: `/products/${p.id}/overview`
    });
  if (p.description.trim())
    sources.push({
      id: 'concept',
      label: 'Product description',
      excerpt: p.description.slice(0, 1500),
      keys: ['idea.oneliner']
    });
  if (p.materials.length)
    sources.push({
      id: 'bom',
      label: 'Bill of materials',
      excerpt: `${p.materials.length} recorded material lines. Review the live quantities and costs before citing them.`,
      keys: ['prototype.resources', 'design.materials_chosen'],
      href: `/products/${p.id}/materials`
    });
  if (p.targetSellingPrice !== null)
    sources.push({
      id: 'price',
      label: 'Current cost sheet',
      excerpt: String(p.targetSellingPrice),
      keys: ['launch.price', 'planning.target_price'],
      href: `/products/${p.id}/costs`
    });
  for (const t of p.tasks.filter((t) => t.chapter).slice(0, 12))
    sources.push({
      id: t.id,
      label: t.title,
      excerpt: `${t.status} · ${t.description || t.title}`.slice(0, 900),
      keys: [...QUESTIONS_BY_KEY.values()]
        .filter((q) => q.stage === t.chapter && q.type === 'longtext')
        .map((q) => q.key),
      href: `/products/${p.id}/tasks?stage=${t.chapter}`
    });
  return sources;
}
export async function upgradeFor(db: Db, id: string): Promise<ProductUpgrade | null> {
  const u = await db.selectFrom('journey_upgrades').selectAll().where('product_id', '=', id).executeTakeFirst();
  return u
    ? {
        needsPlacement: u.needs_placement,
        originalStage: u.original_stage,
        through: u.through_stage,
        knownKeys: u.known_keys,
        importedKeys: u.imported_keys,
        counts: u.counts
      }
    : null;
}
export async function stampsFor(db: Db, id: string) {
  return new Set(
    (await db.selectFrom('journey_stamps').select('node').where('product_id', '=', id).execute()).map(
      (r) => r.node
    )
  );
}
// Personal quests have a fixed scope, focus and ref for their entire UTC period. No login/view rewards.
export async function periodQuests(
  db: Db,
  ws: string,
  user: string,
  p: { id: string; stage: StageId }
): Promise<PeriodQuest[]> {
  if (p.stage === 'Retired') return [];
  const now = (await sql<{ t: Date }>`SELECT transaction_timestamp() AS t`.execute(db)).rows[0].t;
  const { day, week } = periodBounds(now);
  const h =
    (await db
      .selectFrom('stage_history')
      .select('to_stage')
      .where('product_id', '=', p.id)
      .where('created_at', '<=', day)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(1)
      .executeTakeFirst()) ??
    (await db
      .selectFrom('stage_history')
      .select('to_stage')
      .where('product_id', '=', p.id)
      .orderBy('created_at')
      .orderBy('id')
      .limit(1)
      .executeTakeFirst());
  // The focus is anchored to the day boundary (or initial placement). Changing stages cannot reroll a quest.
  const curricula: Record<string, [title: string, keys: string[]]> = {
    research: ['Document a comparison or a sourced finding', ['research.comparison', 'research.finding']],
    planning: [
      'Define the MVP, a priority list or a roadmap',
      ['planning.mvp', 'planning.priorities', 'planning.roadmap']
    ],
    design: [
      'Document a user journey or a design specification',
      [
        'design.journey',
        'design.must_haves',
        'design.behaviour',
        'design.interfaces',
        'design.architecture',
        'design.delivery',
        'design.unpack'
      ]
    ],
    prototype: [
      'Record a build trial or a working-version update',
      ['prototype.learnings', 'prototype.artifact', 'prototype.version']
    ],
    testing: [
      'Record a test scenario, result or issue list',
      ['testing.scenario', 'testing.results', 'testing.issues']
    ],
    launch: [
      'Record release readiness, pricing or a launch plan',
      ['launch.readiness', 'launch.price', 'launch.plan']
    ],
    improve: [
      'Turn feedback into a backlog or iteration brief',
      ['improve.feedback', 'improve.backlog', 'improve.next']
    ]
  };
  const prefixOf = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/^improvement$/, 'improve');
  const prior = prefixOf(h?.to_stage ?? '');
  const prefix = prior === 'idea' || Object.hasOwn(curricula, prior) ? prior : prefixOf(p.stage);
  const focusQuest = Object.hasOwn(curricula, prefix) ? curricula[prefix] : undefined,
    dailyGoal = focusQuest ? 1 : 2;
  const refs = ['daily', 'weekly'].map(
    (period, i) => `${p.id}:${user}:${period}:${(i === 0 ? day : week).toISOString().slice(0, 10)}`
  );
  const r = (
    await sql<{
      daily: number;
      weekly: number;
      tasks: number;
      got_daily: boolean;
      got_weekly: boolean;
    }>`SELECT count(*) FILTER(WHERE kind='answer' AND created_at>=${day} AND created_at<${new Date(+day + 86400000)} AND ${focusQuest ? sql`ref=ANY(${focusQuest[1].map((k) => p.id + ':' + k)}::text[])` : sql`starts_with(ref,${p.id + ':' + prefix + '.'})`})::int AS daily,
    count(*) FILTER(WHERE kind IN ('unit_complete','quest_complete'))::int AS weekly,count(*) FILTER(WHERE kind='task_done')::int AS tasks,
    coalesce(bool_or(kind='daily_quest' AND ref=${refs[0]}),false) AS got_daily, coalesce(bool_or(kind='weekly_quest' AND ref=${refs[1]}),false) AS got_weekly
    FROM xp_events WHERE workspace_id=${ws} AND user_id=${user} AND product_id=${p.id} AND origin='earned' AND created_at>=${week} AND created_at<${new Date(+week + 7 * 86400000)}`.execute(
      db
    )
  ).rows[0];
  return [
    {
      period: 'daily',
      title: focusQuest?.[0] ?? 'Record two Idea lesson outputs',
      start: day.toISOString(),
      end: new Date(+day + 86400000).toISOString(),
      progress: Math.min(dailyGoal, r.daily),
      target: dailyGoal,
      points: rewardValue(config.BUILDER_XP_RULES, 'daily_quest', XP.dailyQuest),
      earned: r.got_daily
    },
    {
      period: 'weekly',
      title: 'Finish a unit, pass a checkpoint or close two product tasks',
      start: week.toISOString(),
      end: new Date(+week + 7 * 86400000).toISOString(),
      progress: Math.min(2, r.weekly ? 2 : r.tasks),
      target: 2,
      points: rewardValue(config.BUILDER_XP_RULES, 'weekly_quest', XP.weeklyQuest),
      earned: r.got_weekly
    }
  ];
}
export async function readTrail(db: Db, ws: string, user: string, p: Product, journey: Journey): Promise<Trail> {
  const [upgrade, stamps, sources, quests, drafts] = await Promise.all([
    upgradeFor(db, p.id),
    stampsFor(db, p.id),
    workSources(db, ws, p),
    periodQuests(db, ws, user, p),
    db
      .selectFrom('activity_drafts')
      .select('question_key')
      .where('product_id', '=', p.id)
      .where('user_id', '=', user)
      .execute()
  ]);
  const worlds = productWorlds(p, journey, upgrade, stamps, sources, new Set(drafts.map((d) => d.question_key)));
  const rules = config.BUILDER_XP_RULES;
  for (const l of worlds.flatMap((w) => w.units.flatMap((u) => u.lessons)))
    if (l.credit) l.credit = rewardValue(rules, 'answer', l.credit);
  return {
    rewards: {
      unit: rules.unit ?? XP.unitComplete,
      checkpoint: rules.checkpoint ?? XP.questComplete,
      world: rules.world ?? XP.worldComplete
    },
    worlds,
    upgrade,
    sources,
    quests,
    next: currentLesson(worlds.find((w) => w.stage === p.stage))
  };
}
