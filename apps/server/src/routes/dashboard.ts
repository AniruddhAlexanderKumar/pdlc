import { Router } from 'express';
import { sql } from 'kysely';
import { z } from 'zod';
import { APP_NAVIGATION_STYLES, PRESET_IDS, WIDGETS, resolveAppLayout, resolveLayout, type DashboardSettings, type WidgetId } from '@sv/shared';
import { auth } from '../auth/session.js';
import { db } from '../db/index.js';
import { parse, route } from '../lib/http.js';

export const dashboardRouter = Router();

const layoutInput = z
  .object({
    preset: z.enum(PRESET_IDS).nullable(),
    items: z
      .array(z.object({ widget: z.string(), span: z.number().int() }).strict())
      .max(Object.keys(WIDGETS).length)
      .optional(),
    density: z.enum(['compact', 'expanded']).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.preset === null && (!value.items || value.items.length === 0))
      ctx.addIssue({ code: 'custom', message: 'A custom layout requires widgets' });
    const seen = new Set<string>();
    for (const item of value.items ?? []) {
      if (
        !Object.hasOwn(WIDGETS, item.widget) ||
        seen.has(item.widget) ||
        !(WIDGETS[item.widget as WidgetId]?.spans as readonly number[] | undefined)?.includes(item.span)
      ) {
        ctx.addIssue({ code: 'custom', message: 'Invalid or duplicate widget or width' });
      }
      seen.add(item.widget);
    }
  });

dashboardRouter.get(
  '/',
  route(async (req, res) => {
    const actor = auth(req);
    const row = await db.selectFrom('users').select('dashboard_layout').where('id', '=', actor.userId).executeTakeFirstOrThrow();
    if (row.dashboard_layout == null) {
      const layout = resolveLayout({ preset: actor.role === 'member' ? 'personal' : 'executive' });
      return void res.json({ ...layout, isDefault: true });
    }
    res.json(resolveLayout(row.dashboard_layout));
  }),
);

dashboardRouter.put(
  '/',
  route(async (req, res) => {
    const input = parse(layoutInput, req.body);
    const settings: DashboardSettings = { ...input, items: input.items as DashboardSettings['items'], updatedAt: new Date().toISOString() };
    await db
      .updateTable('users')
      .set({ dashboard_layout: JSON.stringify(settings) })
      .where('id', '=', auth(req).userId)
      .execute();
    res.json(resolveLayout(settings));
  }),
);

/** Separate from dashboard preferences; only the authenticated account can read or update it. */
dashboardRouter.get(
  '/app-layout',
  route(async (req, res) => {
    const row = await db.selectFrom('users').select('app_layout').where('id', '=', auth(req).userId).executeTakeFirstOrThrow();
    res.json(resolveAppLayout(row.app_layout));
  }),
);

dashboardRouter.put(
  '/app-layout',
  route(async (req, res) => {
    const settings = parse(
      z.object({ navigation: z.enum(APP_NAVIGATION_STYLES), contentWidth: z.enum(['full', 'constrained']) }).strict(),
      req.body,
    );
    await db
      .updateTable('users')
      .set({ app_layout: JSON.stringify(settings) })
      .where('id', '=', auth(req).userId)
      .execute();
    res.json(settings);
  }),
);

/** All queries are workspace-scoped. Lists are capped; totals are computed independently. */
dashboardRouter.get(
  '/summary',
  route(async (req, res) => {
    const actor = auth(req);
    const base = () =>
      db.selectFrom('issues as i').innerJoin('projects as p', 'p.id', 'i.project_id').where('p.workspace_id', '=', actor.workspaceId);
    const issueFields = [
      'i.id',
      'i.project_id',
      'p.project_key',
      'i.issue_number',
      'i.summary',
      'i.status',
      'i.priority',
      'i.updated_at',
    ] as const;
    const [projectCount, totals, projects, assigned, priority, recent, workload, dependencies] = await Promise.all([
      db
        .selectFrom('projects')
        .select(sql<number>`count(*)::int`.as('count'))
        .where('workspace_id', '=', actor.workspaceId)
        .executeTakeFirstOrThrow(),
      base()
        .select([
          sql<number>`count(*)::int`.as('total'),
          sql<number>`count(*) filter (where i.status = 'Done')::int`.as('done'),
          sql<number>`count(*) filter (where i.status <> 'Done')::int`.as('open'),
        ])
        .executeTakeFirstOrThrow(),
      db
        .selectFrom('projects as p')
        .leftJoin('issues as i', 'i.project_id', 'p.id')
        .select([
          'p.id',
          'p.project_key',
          'p.name',
          sql<number>`count(i.id)::int`.as('total'),
          sql<number>`count(i.id) filter (where i.status = 'Done')::int`.as('done'),
        ])
        .where('p.workspace_id', '=', actor.workspaceId)
        .groupBy(['p.id', 'p.project_key', 'p.name', 'p.updated_at'])
        .orderBy('p.updated_at', 'desc')
        .limit(6)
        .execute(),
      base()
        .select(issueFields)
        .where('i.assignee_id', '=', actor.userId)
        .where('i.status', '!=', 'Done')
        .orderBy('i.updated_at', 'desc')
        .limit(6)
        .execute(),
      base()
        .select(issueFields)
        .where('i.priority', 'in', ['High', 'Critical'])
        .where('i.status', '!=', 'Done')
        .orderBy('i.updated_at', 'desc')
        .limit(6)
        .execute(),
      base().select(issueFields).orderBy('i.updated_at', 'desc').limit(6).execute(),
      db
        .selectFrom('memberships as m')
        .innerJoin('users as u', 'u.id', 'm.user_id')
        .leftJoin('issues as i', 'i.assignee_id', 'u.id')
        .leftJoin('projects as p', (join) => join.onRef('p.id', '=', 'i.project_id').on('p.workspace_id', '=', actor.workspaceId))
        .select(['u.id', 'u.name', sql<number>`count(i.id) filter (where p.id is not null and i.status <> 'Done')::int`.as('open')])
        .where('m.workspace_id', '=', actor.workspaceId)
        .groupBy(['u.id', 'u.name'])
        .orderBy('open', 'desc')
        .orderBy('u.name')
        .limit(6)
        .execute(),
      db
        .selectFrom('issue_relationships as r')
        .innerJoin('issues as source', 'source.id', 'r.source_issue_id')
        .innerJoin('projects as p', 'p.id', 'source.project_id')
        .innerJoin('issues as target', 'target.id', 'r.target_issue_id')
        .innerJoin('projects as target_project', 'target_project.id', 'target.project_id')
        .select([
          'source.id',
          'source.project_id',
          'p.project_key',
          'source.issue_number',
          'source.summary',
          'source.status',
          'source.priority',
          'source.updated_at',
        ])
        .where('r.workspace_id', '=', actor.workspaceId)
        .where('p.workspace_id', '=', actor.workspaceId)
        .where('target_project.workspace_id', '=', actor.workspaceId)
        .where('r.relationship_type', '=', 'depends_on')
        .where('source.status', '!=', 'Done')
        .where('target.status', '!=', 'Done')
        .distinct()
        .orderBy('source.updated_at', 'desc')
        .limit(6)
        .execute(),
    ]);
    const mapIssue = (rows: typeof assigned) =>
      rows.map((r) => ({
        id: r.id,
        projectId: r.project_id,
        key: `${r.project_key}-${r.issue_number}`,
        summary: r.summary,
        status: r.status,
        priority: r.priority,
        updatedAt: r.updated_at.toISOString(),
      }));
    res.json({
      projectCount: Number(projectCount.count),
      total: Number(totals.total),
      done: Number(totals.done),
      open: Number(totals.open),
      projects: projects.map((p) => ({ id: p.id, key: p.project_key, name: p.name, total: Number(p.total), done: Number(p.done) })),
      assigned: mapIssue(assigned),
      priority: mapIssue(priority),
      recent: mapIssue(recent),
      dependencies: mapIssue(dependencies),
      workload: workload.map((w) => ({ id: w.id, name: w.name, open: Number(w.open) })),
    });
  }),
);
