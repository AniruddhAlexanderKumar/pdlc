import { Router } from 'express';
import { sql } from 'kysely';
import { z } from 'zod';
import {
  JOURNEY_ACTIVITY_KINDS,
  JOURNEY_ACTIVITY_STATUSES,
  ISSUE_PRIORITIES
} from '@sv/shared';
import { auth } from '../auth/session.js';
import { db } from '../db/index.js';
import { badRequest, notFound, parse, route, shortText, uuid } from '../lib/http.js';
import {
  assertWorkspaceAssignee,
  buildJourneyView,
  ensureProjectJourney,
  loadWorkspaceMembers,
  nextActivityPosition,
  nextStagePosition,
  requireActivityOfProject,
  requireProject,
  requireStageOfProject
} from '../services/journey-first.js';
import { param } from './util.js';

/**
 * Journey API: the project's operating environment.
 *
 * All routes resolve the project inside the caller's workspace first, so an
 * id from another workspace is a 404, never a leak.
 */
export const journeysRouter = Router();
journeysRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const kind = z.enum(JOURNEY_ACTIVITY_KINDS);
const status = z.enum(JOURNEY_ACTIVITY_STATUSES);
const priority = z.enum(ISSUE_PRIORITIES);

const stageInput = z.object({
  name: shortText(120).min(1),
  description: shortText(2000).default('')
});

const activityInput = z.object({
  stageId: uuid,
  kind,
  title: shortText(200).min(1),
  description: shortText(4000).default(''),
  priority: priority.default('Medium'),
  assigneeId: uuid.nullable().optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional()
});

const activityPatch = z.object({
  title: shortText(200).min(1).optional(),
  description: shortText(4000).optional(),
  status: status.optional(),
  priority: priority.optional(),
  assigneeId: uuid.nullable().optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  blockedReason: shortText(500).optional()
});

/** GET /journeys/projects/:projectId — the full derived journey view. */
journeysRouter.get(
  '/projects/:projectId',
  route(async (req, res) => {
    const actor = auth(req);
    const projectId = parse(uuid, param(req, 'projectId'));
    const project = await requireProject(actor.workspaceId, projectId);
    await ensureProjectJourney(db, project, 'general', actor.userId);
    res.json(await buildJourneyView(actor.workspaceId, project.id));
  })
);

/** Members of the workspace, for assignee pickers inside the Journey. */
journeysRouter.get(
  '/projects/:projectId/members',
  route(async (req, res) => {
    const actor = auth(req);
    const projectId = parse(uuid, param(req, 'projectId'));
    await requireProject(actor.workspaceId, projectId);
    res.json(await loadWorkspaceMembers(actor.workspaceId));
  })
);

/** POST /journeys/projects/:projectId/stages — customise the lifecycle. */
journeysRouter.post(
  '/projects/:projectId/stages',
  route(async (req, res) => {
    const actor = auth(req);
    const projectId = parse(uuid, param(req, 'projectId'));
    const body = parse(stageInput, req.body);
    const project = await requireProject(actor.workspaceId, projectId);
    const journey = await ensureProjectJourney(db, project, 'general', actor.userId);
    const stage = await db
      .insertInto('journey_stages')
      .values({
        journey_id: journey.id,
        project_id: project.id,
        name: body.name,
        description: body.description,
        position: await nextStagePosition(journey.id)
      })
      .returning(['id', 'name', 'description', 'position'])
      .executeTakeFirstOrThrow();
    res.status(201).json(stage);
  })
);

/** PATCH /journeys/stages/:stageId — rename or re-describe a stage. */
journeysRouter.patch(
  '/stages/:stageId',
  route(async (req, res) => {
    const actor = auth(req);
    const stageId = parse(uuid, param(req, 'stageId'));
    const body = parse(stageInput.partial(), req.body);
    const stage = await db
      .selectFrom('journey_stages')
      .select(['id', 'project_id'])
      .where('id', '=', stageId)
      .executeTakeFirst();
    if (!stage) throw notFound('Stage');
    await requireProject(actor.workspaceId, stage.project_id);
    const updated = await db
      .updateTable('journey_stages')
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        updated_at: new Date()
      })
      .where('id', '=', stageId)
      .returning(['id', 'name', 'description', 'position'])
      .executeTakeFirstOrThrow();
    res.json(updated);
  })
);

/** POST /journeys/projects/:projectId/activities — add work to a stage. */
journeysRouter.post(
  '/projects/:projectId/activities',
  route(async (req, res) => {
    const actor = auth(req);
    const projectId = parse(uuid, param(req, 'projectId'));
    const body = parse(activityInput, req.body);
    const project = await requireProject(actor.workspaceId, projectId);
    await ensureProjectJourney(db, project, 'general', actor.userId);
    await requireStageOfProject(body.stageId, project.id);
    await assertWorkspaceAssignee(actor.workspaceId, body.assigneeId);
    const activity = await db
      .insertInto('journey_activities')
      .values({
        stage_id: body.stageId,
        project_id: project.id,
        kind: body.kind,
        title: body.title,
        description: body.description,
        priority: body.priority,
        assignee_id: body.assigneeId ?? null,
        due_at: body.dueAt ? new Date(body.dueAt) : null,
        position: await nextActivityPosition(body.stageId),
        created_by: actor.userId
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    res.status(201).json({ id: activity.id });
  })
);

/** PATCH /journeys/activities/:activityId — status, assignment, dates, blockers. */
journeysRouter.patch(
  '/activities/:activityId',
  route(async (req, res) => {
    const actor = auth(req);
    const activityId = parse(uuid, param(req, 'activityId'));
    const body = parse(activityPatch, req.body);
    // The activity's project must belong to this workspace before anything else.
    const activity = await db
      .selectFrom('journey_activities as a')
      .innerJoin('projects as p', 'p.id', 'a.project_id')
      .select(['a.id', 'a.status', 'p.workspace_id'])
      .where('a.id', '=', activityId)
      .executeTakeFirst();
    if (!activity || activity.workspace_id !== actor.workspaceId) throw notFound('Activity');
    if (body.assigneeId !== undefined) await assertWorkspaceAssignee(actor.workspaceId, body.assigneeId);
    if (body.blockedReason !== undefined && body.status === 'blocked' && !body.blockedReason.trim()) {
      throw badRequest('A blocked activity needs a reason so the team knows what to fix');
    }

    const now = new Date();
    const completed = body.status === 'completed' && activity.status !== 'completed';
    const reopened = body.status !== undefined && body.status !== 'completed' && activity.status === 'completed';
    const updated = await db
      .updateTable('journey_activities')
      .set({
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.assigneeId !== undefined ? { assignee_id: body.assigneeId } : {}),
        ...(body.dueAt !== undefined ? { due_at: body.dueAt ? new Date(body.dueAt) : null } : {}),
        ...(body.blockedReason !== undefined ? { blocked_reason: body.blockedReason } : {}),
        ...(body.status !== undefined && body.status !== 'blocked' ? { blocked_reason: '' } : {}),
        ...(completed ? { completed_at: now } : {}),
        ...(reopened ? { completed_at: null } : {}),
        updated_at: now
      })
      .where('id', '=', activityId)
      .returning('id')
      .executeTakeFirstOrThrow();
    res.json({ id: updated.id });
  })
);

/** DELETE /journeys/activities/:activityId — remove an activity and its links. */
journeysRouter.delete(
  '/activities/:activityId',
  route(async (req, res) => {
    const actor = auth(req);
    const activityId = parse(uuid, param(req, 'activityId'));
    const activity = await db
      .selectFrom('journey_activities as a')
      .innerJoin('projects as p', 'p.id', 'a.project_id')
      .select('p.workspace_id')
      .where('a.id', '=', activityId)
      .executeTakeFirst();
    if (!activity || activity.workspace_id !== actor.workspaceId) throw notFound('Activity');
    await db.deleteFrom('journey_activities').where('id', '=', activityId).execute();
    res.status(204).end();
  })
);

/**
 * POST /journeys/activities/:activityId/review — the approval workflow.
 * `request` proposes a review, `approve` / `changes` record the decision.
 * Approving an approval-kind activity completes it.
 */
journeysRouter.post(
  '/activities/:activityId/review',
  route(async (req, res) => {
    const actor = auth(req);
    const activityId = parse(uuid, param(req, 'activityId'));
    const body = parse(
      z.object({ action: z.enum(['request', 'approve', 'changes']), note: shortText(1000).default('') }),
      req.body
    );
    const activity = await db
      .selectFrom('journey_activities as a')
      .innerJoin('projects as p', 'p.id', 'a.project_id')
      .select(['a.id', 'a.kind', 'a.status', 'a.review_state', 'p.workspace_id'])
      .where('a.id', '=', activityId)
      .executeTakeFirst();
    if (!activity || activity.workspace_id !== actor.workspaceId) throw notFound('Activity');
    if (body.action === 'request' && activity.review_state === 'approved') {
      throw badRequest('This activity is already approved');
    }

    const now = new Date();
    if (body.action === 'request') {
      await db
        .updateTable('journey_activities')
        .set({ review_state: 'pending', review_note: '', reviewed_by: null, reviewed_at: null, updated_at: now })
        .where('id', '=', activityId)
        .execute();
    } else if (body.action === 'approve') {
      await db
        .updateTable('journey_activities')
        .set({
          review_state: 'approved',
          reviewed_by: actor.userId,
          reviewed_at: now,
          review_note: body.note,
          ...(activity.kind === 'approval' && activity.status !== 'completed'
            ? { status: 'completed', completed_at: now }
            : {}),
          updated_at: now
        })
        .where('id', '=', activityId)
        .execute();
    } else {
      await db
        .updateTable('journey_activities')
        .set({
          review_state: 'changes_requested',
          reviewed_by: actor.userId,
          reviewed_at: now,
          review_note: body.note,
          ...(activity.status === 'completed' ? { status: 'in_progress', completed_at: null } : {}),
          updated_at: now
        })
        .where('id', '=', activityId)
        .execute();
    }
    res.json({ id: activityId, reviewState: body.action === 'request' ? 'pending' : body.action === 'approve' ? 'approved' : 'changes_requested' });
  })
);

/** POST /journeys/activities/:activityId/dependencies — block on another activity. */
journeysRouter.post(
  '/activities/:activityId/dependencies',
  route(async (req, res) => {
    const actor = auth(req);
    const activityId = parse(uuid, param(req, 'activityId'));
    const body = parse(z.object({ dependsOnId: uuid }), req.body);
    if (body.dependsOnId === activityId) throw badRequest('An activity cannot depend on itself');
    const activity = await db
      .selectFrom('journey_activities as a')
      .innerJoin('projects as p', 'p.id', 'a.project_id')
      .select(['a.id', 'a.project_id', 'p.workspace_id'])
      .where('a.id', '=', activityId)
      .executeTakeFirst();
    if (!activity || activity.workspace_id !== actor.workspaceId) throw notFound('Activity');
    const target = await db
      .selectFrom('journey_activities')
      .select('id')
      .where('id', '=', body.dependsOnId)
      .where('project_id', '=', activity.project_id)
      .executeTakeFirst();
    if (!target) throw notFound('Activity to depend on');
    await db
      .insertInto('journey_dependencies')
      .values({ project_id: activity.project_id, activity_id: activityId, depends_on_id: body.dependsOnId, created_by: actor.userId })
      .onConflict((oc) => oc.columns(['activity_id', 'depends_on_id']).doNothing())
      .execute();
    res.status(201).json({ ok: true });
  })
);

/** DELETE /journeys/activities/:activityId/dependencies/:depId — lift a dependency. */
journeysRouter.delete(
  '/activities/:activityId/dependencies/:depId',
  route(async (req, res) => {
    const actor = auth(req);
    const activityId = parse(uuid, param(req, 'activityId'));
    const dependsOnId = parse(uuid, param(req, 'depId'));
    const activity = await db
      .selectFrom('journey_activities as a')
      .innerJoin('projects as p', 'p.id', 'a.project_id')
      .select('p.workspace_id')
      .where('a.id', '=', activityId)
      .executeTakeFirst();
    if (!activity || activity.workspace_id !== actor.workspaceId) throw notFound('Activity');
    await db
      .deleteFrom('journey_dependencies')
      .where('activity_id', '=', activityId)
      .where('depends_on_id', '=', dependsOnId)
      .execute();
    res.status(204).end();
  })
);

/**
 * POST /journeys/activities/:activityId/link — attach a Design Studio artefact
 * (diagram or sketch) to this activity so Journey shows it in context.
 */
journeysRouter.post(
  '/activities/:activityId/link',
  route(async (req, res) => {
    const actor = auth(req);
    const activityId = parse(uuid, param(req, 'activityId'));
    const body = parse(z.object({ artifactType: z.enum(['diagram', 'sketch']), artifactId: uuid }), req.body);
    const activity = await db
      .selectFrom('journey_activities as a')
      .innerJoin('projects as p', 'p.id', 'a.project_id')
      .select(['a.id', 'a.project_id', 'p.workspace_id'])
      .where('a.id', '=', activityId)
      .executeTakeFirst();
    if (!activity || activity.workspace_id !== actor.workspaceId) throw notFound('Activity');
    const table = body.artifactType === 'diagram' ? 'design_documents' : 'cad_documents';
    const updated = await sql`
      UPDATE ${sql.table(table)}
      SET journey_activity_id = ${activityId}::uuid, project_id = ${activity.project_id}::uuid, updated_at = now()
      WHERE id = ${body.artifactId}::uuid AND workspace_id = ${actor.workspaceId}::uuid
      RETURNING id`.execute(db);
    if (!updated.rows.length) throw notFound(body.artifactType === 'diagram' ? 'Diagram' : 'Sketch');
    res.status(201).json({ ok: true });
  })
);

/** Unlink removes the journey association but keeps the artefact and project. */
journeysRouter.post(
  '/activities/:activityId/unlink',
  route(async (req, res) => {
    const actor = auth(req);
    const activityId = parse(uuid, param(req, 'activityId'));
    const body = parse(z.object({ artifactType: z.enum(['diagram', 'sketch']), artifactId: uuid }), req.body);
    const activity = await db
      .selectFrom('journey_activities as a')
      .innerJoin('projects as p', 'p.id', 'a.project_id')
      .select('p.workspace_id')
      .where('a.id', '=', activityId)
      .executeTakeFirst();
    if (!activity || activity.workspace_id !== actor.workspaceId) throw notFound('Activity');
    const table = body.artifactType === 'diagram' ? 'design_documents' : 'cad_documents';
    await sql`
      UPDATE ${sql.table(table)}
      SET journey_activity_id = NULL, updated_at = now()
      WHERE id = ${body.artifactId}::uuid AND workspace_id = ${actor.workspaceId}::uuid
        AND journey_activity_id = ${activityId}::uuid`.execute(db);
    res.status(204).end();
  })
);
