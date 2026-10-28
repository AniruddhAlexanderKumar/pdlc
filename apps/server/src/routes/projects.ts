import { Router } from 'express';
import { sql } from 'kysely';
import { z } from 'zod';
import {
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  ISSUE_TYPES,
  formatIssueKey,
  type Issue,
  type Project
} from '@sv/shared';
import { auth, requireRole } from '../auth/session.js';
import { db, type Db } from '../db/index.js';
import { badRequest, notFound, parse, route, shortText, uuid } from '../lib/http.js';
import { param } from './util.js';

export const projectsRouter = Router();

const projectKey = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,9}$/, 'Use 2–10 letters or numbers, starting with a letter');
const projectInput = z.object({
  key: projectKey,
  name: shortText(120).min(1),
  description: shortText(2000).default('')
});
const issueInput = z.object({
  type: z.enum(ISSUE_TYPES).default('Task'),
  priority: z.enum(ISSUE_PRIORITIES).default('Medium'),
  summary: shortText(200).min(1),
  description: shortText(5000).default(''),
  labels: z.array(shortText(32).min(1)).max(20).default([]).refine((labels) => new Set(labels).size === labels.length, 'Labels must be unique'),
  assigneeId: uuid.nullable().optional()
});
const issueUpdate = issueInput.partial().extend({ status: z.enum(ISSUE_STATUSES).optional() });
const issueQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(ISSUE_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

async function findProject(dbOrTrx: Db, workspaceId: string, projectId: string) {
  return dbOrTrx
    .selectFrom('projects')
    .select(['id', 'workspace_id', 'project_key', 'name', 'description', 'created_at', 'updated_at'])
    .where('id', '=', projectId)
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
}

async function toIssue(dbOrTrx: Db, projectId: string, issueId: string): Promise<Issue> {
  const row = await dbOrTrx
    .selectFrom('issues as i')
    .innerJoin('projects as p', 'p.id', 'i.project_id')
    .select([
      'i.id',
      'i.project_id',
      'p.project_key',
      'i.issue_number',
      'i.type',
      'i.status',
      'i.priority',
      'i.summary',
      'i.description',
      'i.labels',
      'i.reporter_id',
      'i.assignee_id',
      'i.created_at',
      'i.updated_at'
    ])
    .where('i.project_id', '=', projectId)
    .where('i.id', '=', issueId)
    .executeTakeFirst();
  if (!row) throw notFound('Issue');
  return {
    id: row.id,
    projectId: row.project_id,
    key: formatIssueKey(row.project_key, row.issue_number),
    type: row.type,
    status: row.status,
    priority: row.priority,
    summary: row.summary,
    description: row.description,
    labels: row.labels,
    reporterId: row.reporter_id,
    assigneeId: row.assignee_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

async function assertWorkspaceAssignee(dbOrTrx: Db, workspaceId: string, assigneeId: string | null | undefined) {
  if (!assigneeId) return;
  const membership = await dbOrTrx
    .selectFrom('memberships')
    .select('user_id')
    .where('workspace_id', '=', workspaceId)
    .where('user_id', '=', assigneeId)
    .executeTakeFirst();
  if (!membership) throw badRequest('Assignee must be a member of this workspace');
}

projectsRouter.get(
  '/',
  route(async (req, res) => {
    const workspaceId = auth(req).workspaceId;
    const rows = await db
      .selectFrom('projects as p')
      .leftJoin('issues as i', 'i.project_id', 'p.id')
      .select([
        'p.id',
        'p.project_key',
        'p.name',
        'p.description',
        'p.created_at',
        'p.updated_at',
        sql<number>`count(i.id)::int`.as('issue_count')
      ])
      .where('p.workspace_id', '=', workspaceId)
      .groupBy(['p.id', 'p.project_key', 'p.name', 'p.description', 'p.created_at', 'p.updated_at'])
      .orderBy('p.updated_at', 'desc')
      .execute();

    const projects: Project[] = rows.map((row) => ({
      id: row.id,
      key: row.project_key,
      name: row.name,
      description: row.description,
      issueCount: Number(row.issue_count),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    }));
    res.json(projects);
  })
);

projectsRouter.post(
  '/',
  requireRole('owner', 'admin'),
  route(async (req, res) => {
    const body = parse(projectInput, req.body);
    const actor = auth(req);
    const row = await db
      .insertInto('projects')
      .values({
        workspace_id: actor.workspaceId,
        project_key: body.key,
        name: body.name,
        description: body.description,
        created_by: actor.userId,
        updated_at: new Date()
      })
      .returning(['id', 'project_key', 'name', 'description', 'created_at', 'updated_at'])
      .executeTakeFirstOrThrow();

    res.status(201).json({
      id: row.id,
      key: row.project_key,
      name: row.name,
      description: row.description,
      issueCount: 0,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    } satisfies Project);
  })
);

projectsRouter.get(
  '/:projectId/issues',
  route(async (req, res) => {
    const actor = auth(req);
    const projectId = parse(uuid, param(req, 'projectId'));
    const query = parse(issueQuery, req.query);
    const project = await findProject(db, actor.workspaceId, projectId);
    if (!project) throw notFound('Project');

    let rowsQuery = db
      .selectFrom('issues as i')
      .innerJoin('projects as p', 'p.id', 'i.project_id')
      .select([
        'i.id',
        'i.project_id',
        'p.project_key',
        'i.issue_number',
        'i.type',
        'i.status',
        'i.priority',
        'i.summary',
        'i.description',
        'i.labels',
        'i.reporter_id',
        'i.assignee_id',
        'i.created_at',
        'i.updated_at'
      ])
      .where('i.project_id', '=', projectId);
    let countQuery = db
      .selectFrom('issues as i')
      .select(sql<number>`count(*)::int`.as('total'))
      .where('i.project_id', '=', projectId);

    if (query.status) {
      rowsQuery = rowsQuery.where('i.status', '=', query.status);
      countQuery = countQuery.where('i.status', '=', query.status);
    }
    if (query.q) {
      const search = `%${query.q}%`;
      rowsQuery = rowsQuery.where((eb) => eb.or([eb('i.summary', 'ilike', search), eb('i.description', 'ilike', search)]));
      countQuery = countQuery.where((eb) => eb.or([eb('i.summary', 'ilike', search), eb('i.description', 'ilike', search)]));
    }

    const [rows, countRow] = await Promise.all([
      rowsQuery.orderBy('i.issue_number', 'desc').limit(query.limit).offset(query.offset).execute(),
      countQuery.executeTakeFirstOrThrow()
    ]);

    const items: Issue[] = rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      key: formatIssueKey(row.project_key, row.issue_number),
      type: row.type,
      status: row.status,
      priority: row.priority,
      summary: row.summary,
      description: row.description,
      labels: row.labels,
      reporterId: row.reporter_id,
      assigneeId: row.assignee_id,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    }));

    res.json({ items, total: Number(countRow.total), limit: query.limit, offset: query.offset });
  })
);

projectsRouter.post(
  '/:projectId/issues',
  route(async (req, res) => {
    const actor = auth(req);
    const projectId = parse(uuid, param(req, 'projectId'));
    const body = parse(issueInput, req.body);
    const issueId = await db.transaction().execute(async (trx) => {
      const project = await trx
        .selectFrom('projects')
        .select(['id', 'workspace_id', 'project_key', 'next_issue_number'])
        .where('id', '=', projectId)
        .where('workspace_id', '=', actor.workspaceId)
        .forUpdate()
        .executeTakeFirst();
      if (!project) throw notFound('Project');
      await assertWorkspaceAssignee(trx, actor.workspaceId, body.assigneeId);
      const issue = await trx
        .insertInto('issues')
        .values({
          project_id: projectId,
          issue_number: project.next_issue_number,
          type: body.type,
          priority: body.priority,
          summary: body.summary,
          description: body.description,
          labels: body.labels,
          reporter_id: actor.userId,
          assignee_id: body.assigneeId ?? null,
          updated_at: new Date()
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await trx
        .updateTable('projects')
        .set({ next_issue_number: project.next_issue_number + 1, updated_at: new Date() })
        .where('id', '=', projectId)
        .execute();
      return issue.id;
    });

    res.status(201).json(await toIssue(db, projectId, issueId));
  })
);

projectsRouter.patch(
  '/:projectId/issues/:issueId',
  route(async (req, res) => {
    const actor = auth(req);
    const projectId = parse(uuid, param(req, 'projectId'));
    const issueId = parse(uuid, param(req, 'issueId'));
    const body = parse(issueUpdate, req.body);
    const project = await findProject(db, actor.workspaceId, projectId);
    if (!project) throw notFound('Project');
    await assertWorkspaceAssignee(db, actor.workspaceId, body.assigneeId);

    const updates = {
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
      ...(body.summary !== undefined ? { summary: body.summary } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.labels !== undefined ? { labels: body.labels } : {}),
      ...(body.assigneeId !== undefined ? { assignee_id: body.assigneeId } : {})
    };
    const updated = await db
      .updateTable('issues')
      .set({ ...updates, updated_at: new Date() })
      .where('id', '=', issueId)
      .where('project_id', '=', projectId)
      .returning('id')
      .executeTakeFirst();
    if (!updated) throw notFound('Issue');
    res.json(await toIssue(db, projectId, updated.id));
  })
);
