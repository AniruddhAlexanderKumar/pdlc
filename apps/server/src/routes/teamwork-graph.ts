import { Router } from 'express';
import { sql } from 'kysely';
import { z } from 'zod';
import type { GraphEdge, GraphNode, TeamworkGraph } from '@sv/shared';
import { auth } from '../auth/session.js';
import { db } from '../db/index.js';
import { badRequest, notFound, parse, route, shortText, uuid } from '../lib/http.js';
import { param } from './util.js';

export const teamworkGraphRouter = Router();
const LIMIT = 200;
const querySchema = z.object({ projectId: uuid.optional(), focusIssueId: uuid.optional() });
const relationshipInput = z.object({ sourceId: uuid, targetId: uuid, type: z.enum(['depends_on', 'relates_to']), description: shortText(2000).default('') });
const updateInput = z.object({ description: shortText(2000) });
const nodeId = (type: string, id: string) => `${type}:${id}`;

teamworkGraphRouter.get('/', route(async (req, res) => {
  const { workspaceId } = auth(req);
  const { projectId, focusIssueId } = parse(querySchema, req.query);
  if (projectId && focusIssueId) throw badRequest('Select a project or focus an issue, not both');
  const workspace = await db.selectFrom('workspaces').selectAll().where('id', '=', workspaceId).executeTakeFirstOrThrow();
  if (projectId && !await db.selectFrom('projects').select('id').where('id', '=', projectId).where('workspace_id', '=', workspaceId).executeTakeFirst()) throw notFound('Project');
  let projectsQuery = db.selectFrom('projects').selectAll().where('workspace_id', '=', workspaceId);
  let issuesQuery = db.selectFrom('issues as i').innerJoin('projects as p', 'p.id', 'i.project_id')
    .select(['i.id', 'i.project_id', 'i.issue_number', 'i.type', 'i.status', 'i.priority', 'i.summary', 'i.description', 'i.assignee_id', 'i.created_at', 'i.updated_at', 'p.project_key'])
    .where('p.workspace_id', '=', workspaceId);
  if (projectId) { projectsQuery = projectsQuery.where('id', '=', projectId); issuesQuery = issuesQuery.where('i.project_id', '=', projectId); }
  let focusLimited = false;
  if (focusIssueId) {
    const exists = await db.selectFrom('issues as i').innerJoin('projects as p', 'p.id', 'i.project_id').select('i.id').where('p.workspace_id', '=', workspaceId).where('i.id', '=', focusIssueId).executeTakeFirst();
    if (!exists) throw notFound('Issue');
    // Explore recorded issue links in both directions. Bound depth and result size.
    const nearby = await sql<{ id: string }>`
      WITH RECURSIVE walk(id, depth) AS (
        SELECT ${focusIssueId}::uuid, 0
        UNION
        SELECT CASE WHEN r.source_issue_id = walk.id THEN r.target_issue_id ELSE r.source_issue_id END, walk.depth + 1
        FROM walk JOIN issue_relationships r ON (r.source_issue_id = walk.id OR r.target_issue_id = walk.id)
        WHERE r.workspace_id = ${workspaceId}::uuid AND walk.depth < 2
      ) SELECT id FROM walk GROUP BY id ORDER BY min(depth), id LIMIT ${LIMIT + 1}
    `.execute(db);
    focusLimited = nearby.rows.length > LIMIT;
    issuesQuery = issuesQuery.where('i.id', 'in', nearby.rows.slice(0, LIMIT).map(r => r.id));
  }
  const issues = await issuesQuery.orderBy('i.updated_at', 'desc').limit(LIMIT + 1).execute();
  if (focusIssueId) projectsQuery = projectsQuery.where('id', 'in', [...new Set(issues.map(i => i.project_id))]);
  let membersQuery = db.selectFrom('memberships as m').innerJoin('users as u', 'u.id', 'm.user_id').select(['u.id', 'u.name', 'm.role', 'm.created_at']).where('m.workspace_id', '=', workspaceId);
  if (focusIssueId) {
    const assignees = [...new Set(issues.flatMap(i => i.assignee_id ? [i.assignee_id] : []))];
    membersQuery = assignees.length ? membersQuery.where('u.id', 'in', assignees) : membersQuery.where(sql<boolean>`false`);
  }
  const [projects, members, products, tasks] = await Promise.all([
    projectsQuery.orderBy('updated_at', 'desc').limit(LIMIT + 1).execute(),
    membersQuery.orderBy('u.name').limit(LIMIT + 1).execute(),
    projectId || focusIssueId ? Promise.resolve([]) : db.selectFrom('products').selectAll().where('workspace_id', '=', workspaceId).orderBy('updated_at', 'desc').limit(LIMIT + 1).execute(),
    projectId || focusIssueId ? Promise.resolve([]) : db.selectFrom('tasks as t').innerJoin('products as p', 'p.id', 't.product_id').select(['t.id', 't.product_id', 't.title', 't.description', 't.status', 't.due_date', 't.created_at', 't.updated_at']).where('p.workspace_id', '=', workspaceId).orderBy('t.updated_at', 'desc').limit(LIMIT + 1).execute()
  ]);
  const truncated = focusLimited || [projects, issues, members, products, tasks].some(rows => rows.length > LIMIT);
  const nodes: GraphNode[] = [{ id: nodeId('workspace', workspace.id), recordId: workspace.id, type: 'workspace', title: workspace.name, url: '/settings', createdAt: workspace.created_at.toISOString() }];
  const edges: GraphEdge[] = [];
  const add = (source: string, target: string, type: GraphEdge['type']) => edges.push({ id: `${type}:${source}:${target}`, source, target, type, editable: false });
  for (const m of members.slice(0, LIMIT)) {
    const id = nodeId('member', m.id); nodes.push({ id, recordId: m.id, type: 'member', title: m.name, status: m.role, url: '/settings', createdAt: m.created_at.toISOString() }); add(id, nodes[0].id, 'member_of');
  }
  for (const p of projects.slice(0, LIMIT)) {
    const id = nodeId('project', p.id); nodes.push({ id, recordId: p.id, type: 'project', title: p.name, key: p.project_key, description: p.description, projectId: p.id, url: `/projects/${p.id}/issues`, createdAt: p.created_at.toISOString(), updatedAt: p.updated_at.toISOString() }); add(nodes[0].id, id, 'contains');
  }
  for (const i of issues.slice(0, LIMIT)) {
    const id = nodeId('issue', i.id); nodes.push({ id, recordId: i.id, type: 'issue', title: i.summary, key: `${i.project_key}-${i.issue_number}`, description: i.description, status: i.status, priority: i.priority, ownerId: i.assignee_id, projectId: i.project_id, url: `/projects/${i.project_id}/issues?issueId=${i.id}`, createdAt: i.created_at.toISOString(), updatedAt: i.updated_at.toISOString() }); add(nodeId('project', i.project_id), id, 'contains');
    if (i.assignee_id) add(nodeId('member', i.assignee_id), id, 'assigned_to');
  }
  for (const p of products.slice(0, LIMIT)) {
    const id = nodeId('product', p.id); nodes.push({ id, recordId: p.id, type: 'product', title: p.name, description: p.description, status: p.stage, url: `/products/${p.id}`, createdAt: p.created_at.toISOString(), updatedAt: p.updated_at.toISOString() }); add(nodes[0].id, id, 'contains');
  }
  for (const t of tasks.slice(0, LIMIT)) {
    const id = nodeId('task', t.id); nodes.push({ id, recordId: t.id, type: 'task', title: t.title, description: t.description, status: t.status, url: `/products/${t.product_id}/tasks`, createdAt: t.created_at.toISOString(), updatedAt: t.updated_at.toISOString() }); add(nodeId('product', t.product_id), id, 'contains');
  }
  const issueIds = issues.slice(0, LIMIT).map(i => i.id);
  if (issueIds.length) {
    const relationships = await db.selectFrom('issue_relationships').selectAll().where('workspace_id', '=', workspaceId).where('source_issue_id', 'in', issueIds).where('target_issue_id', 'in', issueIds).limit(2000).execute();
    if (relationships.length === 2000) res.setHeader('X-Graph-Relationships-Limited', 'true');
    for (const r of relationships) edges.push({ id: r.id, source: nodeId('issue', r.source_issue_id), target: nodeId('issue', r.target_issue_id), type: r.relationship_type, description: r.description, createdBy: r.created_by, createdAt: r.created_at.toISOString(), editable: true });
  }
  const ids = new Set(nodes.map(n => n.id));
  res.json({ nodes, edges: edges.filter(e => ids.has(e.source) && ids.has(e.target)), truncated: truncated || res.getHeader('X-Graph-Relationships-Limited') === 'true', generatedAt: new Date().toISOString() } satisfies TeamworkGraph);
}));

// Search the database, not just nodes currently on the canvas.
teamworkGraphRouter.get('/search', route(async (req, res) => {
  const workspaceId = auth(req).workspaceId;
  const { q, projectId } = parse(z.object({ q: z.string().trim().min(2).max(100), projectId: uuid.optional() }), req.query);
  if (projectId && !await db.selectFrom('projects').select('id').where('id', '=', projectId).where('workspace_id', '=', workspaceId).executeTakeFirst()) throw notFound('Project');
  const term = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  let iq = db.selectFrom('issues as i').innerJoin('projects as p', 'p.id', 'i.project_id').select(['i.id', 'i.summary', 'i.description', 'i.status', 'i.priority', 'i.assignee_id', 'i.project_id', 'i.issue_number', 'p.project_key', 'i.created_at', 'i.updated_at']).where('p.workspace_id', '=', workspaceId)
    .where(eb => eb.or([eb('i.summary', 'ilike', term), sql<boolean>`(p.project_key || '-' || i.issue_number::text) ILIKE ${term}`, sql<boolean>`i.id::text ILIKE ${term}`]));
  if (projectId) iq = iq.where('i.project_id', '=', projectId);
  const [issues, projects, products, tasks, members] = await Promise.all([
    iq.orderBy(sql`CASE WHEN lower(p.project_key || '-' || i.issue_number::text) = lower(${q}) OR i.id::text = ${q} THEN 0 ELSE 1 END`).orderBy('i.updated_at', 'desc').limit(21).execute(),
    db.selectFrom('projects').selectAll().where('workspace_id', '=', workspaceId).$if(!!projectId, qb => qb.where('id', '=', projectId!)).where(eb => eb.or([eb('name', 'ilike', term), eb('project_key', 'ilike', term), sql<boolean>`id::text ILIKE ${term}`])).orderBy('updated_at', 'desc').limit(21).execute(),
    projectId ? Promise.resolve([]) : db.selectFrom('products').selectAll().where('workspace_id', '=', workspaceId).where(eb => eb.or([eb('name', 'ilike', term), sql<boolean>`id::text ILIKE ${term}`])).orderBy('updated_at', 'desc').limit(21).execute(),
    projectId ? Promise.resolve([]) : db.selectFrom('tasks as t').innerJoin('products as p', 'p.id', 't.product_id').select(['t.id', 't.title', 't.description', 't.status', 't.product_id', 't.created_at', 't.updated_at']).where('p.workspace_id', '=', workspaceId).where(eb => eb.or([eb('t.title', 'ilike', term), sql<boolean>`t.id::text ILIKE ${term}`])).orderBy('t.updated_at', 'desc').limit(21).execute(),
    projectId ? Promise.resolve([]) : db.selectFrom('memberships as m').innerJoin('users as u', 'u.id', 'm.user_id').select(['u.id', 'u.name', 'm.role', 'm.created_at']).where('m.workspace_id', '=', workspaceId).where(eb => eb.or([eb('u.name', 'ilike', term), sql<boolean>`u.id::text ILIKE ${term}`])).orderBy('u.name').limit(21).execute()
  ]);
  const nodes: GraphNode[] = [
    ...issues.slice(0,20).map(i => ({ id: nodeId('issue', i.id), recordId: i.id, type: 'issue' as const, title: i.summary, key: `${i.project_key}-${i.issue_number}`, description: i.description, status: i.status, priority: i.priority, ownerId: i.assignee_id, projectId: i.project_id, url: `/projects/${i.project_id}/issues?issueId=${i.id}`, createdAt: i.created_at.toISOString(), updatedAt: i.updated_at.toISOString() })),
    ...projects.slice(0,20).map(p => ({ id: nodeId('project', p.id), recordId: p.id, type: 'project' as const, title: p.name, key: p.project_key, description: p.description, projectId: p.id, url: `/projects/${p.id}/issues` })),
    ...products.slice(0,20).map(p => ({ id: nodeId('product', p.id), recordId: p.id, type: 'product' as const, title: p.name, status: p.stage, url: `/products/${p.id}` })),
    ...tasks.slice(0,20).map(t => ({ id: nodeId('task', t.id), recordId: t.id, type: 'task' as const, title: t.title, status: t.status, url: `/products/${t.product_id}/tasks` })),
    ...members.slice(0,20).map(m => ({ id: nodeId('member', m.id), recordId: m.id, type: 'member' as const, title: m.name, status: m.role, url: '/settings' }))
  ];
  res.json({ nodes, truncated: [issues, projects, products, tasks, members].some(rows => rows.length > 20) });
}));

teamworkGraphRouter.post('/relationships', route(async (req, res) => {
  const actor = auth(req); const body = parse(relationshipInput, req.body);
  if (body.sourceId === body.targetId) throw badRequest('An issue cannot be related to itself');
  const result = await db.transaction().execute(async trx => {
    const issues = await trx.selectFrom('issues as i').innerJoin('projects as p', 'p.id', 'i.project_id').select('i.id').where('p.workspace_id', '=', actor.workspaceId).where('i.id', 'in', [body.sourceId, body.targetId]).execute();
    if (issues.length !== 2) throw notFound('Issue');
    if (body.type === 'depends_on') {
      // Serialize dependency edits per workspace so concurrent requests cannot create a cycle.
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${actor.workspaceId}, 0))`.execute(trx);
      const cycle = await sql<{ cycle: boolean }>`
        WITH RECURSIVE reachable(id) AS (
          SELECT ${body.targetId}::uuid
          UNION
          SELECT r.target_issue_id FROM issue_relationships r
          JOIN reachable w ON w.id = r.source_issue_id
          WHERE r.workspace_id = ${actor.workspaceId}::uuid AND r.relationship_type = 'depends_on'
        ) SELECT EXISTS(SELECT 1 FROM reachable WHERE id = ${body.sourceId}::uuid) AS cycle
      `.execute(trx);
      if (cycle.rows[0]?.cycle) throw badRequest('This dependency would create a cycle');
    }
    const r = await trx.insertInto('issue_relationships').values({ workspace_id: actor.workspaceId, source_issue_id: body.sourceId, target_issue_id: body.targetId, relationship_type: body.type, description: body.description, created_by: actor.userId }).returningAll().executeTakeFirstOrThrow();
    await trx.insertInto('issue_relationship_events').values({ workspace_id: actor.workspaceId, relationship_id: r.id, source_issue_id: r.source_issue_id, target_issue_id: r.target_issue_id, relationship_type: r.relationship_type, description: r.description, action: 'created', actor_id: actor.userId }).execute();
    return r;
  });
  res.status(201).json(result);
}));

teamworkGraphRouter.patch('/relationships/:id', route(async (req, res) => {
  const actor = auth(req); const id = parse(uuid, param(req, 'id')); const body = parse(updateInput, req.body);
  const r = await db.transaction().execute(async trx => {
    const updated = await trx.updateTable('issue_relationships').set({ description: body.description }).where('id', '=', id).where('workspace_id', '=', actor.workspaceId).returningAll().executeTakeFirst();
    if (!updated) throw notFound('Relationship');
    await trx.insertInto('issue_relationship_events').values({ workspace_id: actor.workspaceId, relationship_id: id, source_issue_id: updated.source_issue_id, target_issue_id: updated.target_issue_id, relationship_type: updated.relationship_type, description: updated.description, action: 'updated', actor_id: actor.userId }).execute();
    return updated;
  }); res.json(r);
}));
teamworkGraphRouter.delete('/relationships/:id', route(async (req, res) => {
  const actor = auth(req); const id = parse(uuid, param(req, 'id'));
  await db.transaction().execute(async trx => {
    const r = await trx.deleteFrom('issue_relationships').where('id', '=', id).where('workspace_id', '=', actor.workspaceId).returningAll().executeTakeFirst();
    if (!r) throw notFound('Relationship');
    await trx.insertInto('issue_relationship_events').values({ workspace_id: actor.workspaceId, relationship_id: id, source_issue_id: r.source_issue_id, target_issue_id: r.target_issue_id, relationship_type: r.relationship_type, description: r.description, action: 'deleted', actor_id: actor.userId }).execute();
  }); res.status(204).end();
}));
teamworkGraphRouter.get('/relationships/:id/history', route(async (req, res) => {
  const actor = auth(req); const id = parse(uuid, param(req, 'id'));
  const events = await db.selectFrom('issue_relationship_events as e').leftJoin('users as u', 'u.id', 'e.actor_id').select(['e.action', 'e.description', 'e.created_at', 'u.name as actor']).where('e.workspace_id', '=', actor.workspaceId).where('e.relationship_id', '=', id).orderBy('e.created_at', 'desc').limit(100).execute();
  res.json(events);
}));
