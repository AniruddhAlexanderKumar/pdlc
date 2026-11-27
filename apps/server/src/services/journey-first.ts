import { sql } from 'kysely';
import {
  deriveJourneyView,
  journeyTemplate,
  type JourneyActivityKind,
  type JourneyActivityStatus,
  type IssuePriority,
  type JourneyActivity,
  type JourneyArtifact,
  type JourneyIssue,
  type JourneyWaitingOn,
  type JourneyTemplateId,
  type ProjectJourneyView,
  type JourneyReviewState
} from '@sv/shared';
import { db, type Db } from '../db/index.js';
import { badRequest, notFound } from '../lib/http.js';

/**
 * Journey-first core: creates a project's journey on demand and builds the
 * derived view the Journey workspace, AI Assistant and tests all consume.
 *
 * Every query is scoped by workspace through the project join, so a journey
 * can never leak across workspaces regardless of which route asks for it.
 */

interface ProjectRow {
  id: string;
  workspace_id: string;
  project_key: string;
  name: string;
  description: string;
}

export async function findProject(workspaceId: string, projectId: string): Promise<ProjectRow | undefined> {
  return db
    .selectFrom('projects')
    .select(['id', 'workspace_id', 'project_key', 'name', 'description'])
    .where('id', '=', projectId)
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
}

export async function requireProject(workspaceId: string, projectId: string): Promise<ProjectRow> {
  const project = await findProject(workspaceId, projectId);
  if (!project) throw notFound('Project');
  return project;
}

/**
 * Guarantees the project has a journey seeded from its template. Existing
 * journeys are never reseeded; an empty one (created by an interrupted first
 * open) is filled in. Safe to call on every request.
 */
export async function ensureProjectJourney(
  executor: Db,
  project: { id: string; created_by?: string | null },
  template: JourneyTemplateId,
  userId: string | null
): Promise<{ id: string; template: JourneyTemplateId }> {
  const existing = await executor
    .selectFrom('project_journeys')
    .select(['id', 'template'])
    .where('project_id', '=', project.id)
    .executeTakeFirst();
  if (existing) {
    const stageCount = await executor
      .selectFrom('journey_stages')
      .select(sql<number>`count(*)::int`.as('count'))
      .where('journey_id', '=', existing.id)
      .executeTakeFirst();
    if (Number(stageCount?.count ?? 0) > 0) return { id: existing.id, template: existing.template as JourneyTemplateId };
    await seedStages(executor, existing.id, project.id, existing.template as JourneyTemplateId);
    return { id: existing.id, template: existing.template as JourneyTemplateId };
  }

  const def = journeyTemplate(template);
  const journey = await executor
    .insertInto('project_journeys')
    .values({ project_id: project.id, template: def.id, created_by: userId })
    .returning(['id', 'template'])
    .executeTakeFirstOrThrow();
  await seedStages(executor, journey.id, project.id, def.id);
  return { id: journey.id, template: journey.template as JourneyTemplateId };
}

async function seedStages(
  executor: Db,
  journeyId: string,
  projectId: string,
  templateId: JourneyTemplateId
): Promise<void> {
  const def = journeyTemplate(templateId);
  for (const [index, stage] of def.stages.entries()) {
    const inserted = await executor
      .insertInto('journey_stages')
      .values({ journey_id: journeyId, project_id: projectId, name: stage.name, description: stage.description, position: index })
      .returning('id')
      .executeTakeFirstOrThrow();
    for (const [position, activity] of stage.activities.entries()) {
      await executor
        .insertInto('journey_activities')
        .values({
          stage_id: inserted.id,
          project_id: projectId,
          kind: activity.kind,
          title: activity.title,
          description: activity.description,
          position
        })
        .execute();
    }
  }
}

async function memberNames(workspaceId: string): Promise<Map<string, string>> {
  const rows = await sql<{ id: string; name: string }>`
    SELECT u.id, u.name FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.workspace_id = ${workspaceId}::uuid`.execute(db);
  return new Map(rows.rows.map((r) => [r.id, r.name]));
}

interface ActivityRow {
  id: string;
  stage_id: string;
  kind: JourneyActivityKind;
  title: string;
  description: string;
  status: JourneyActivityStatus;
  priority: IssuePriority;
  assignee_id: string | null;
  due_at: Date | null;
  position: number;
  blocked_reason: string;
  review_state: JourneyReviewState;
  reviewed_by: string | null;
  review_note: string;
  completed_at: Date | null;
  skipped_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

async function loadArtifacts(activityIds: string[]): Promise<Map<string, JourneyArtifact[]>> {
  const map = new Map<string, JourneyArtifact[]>();
  if (!activityIds.length) return map;
  const diagrams = await sql<{ id: string; title: string; kind: 'diagram' | 'model'; journey_activity_id: string }>`
    SELECT id, title, kind, journey_activity_id FROM design_documents
    WHERE journey_activity_id = ANY(${activityIds}::uuid[])`.execute(db);
  const sketches = await sql<{ id: string; name: string; journey_activity_id: string }>`
    SELECT id, name, journey_activity_id FROM cad_documents
    WHERE journey_activity_id = ANY(${activityIds}::uuid[])`.execute(db);
  for (const row of diagrams.rows) {
    const list = map.get(row.journey_activity_id) ?? [];
    list.push({ type: row.kind, id: row.id, title: row.title, url: `/designs/${row.id}` });
    map.set(row.journey_activity_id, list);
  }
  for (const row of sketches.rows) {
    const list = map.get(row.journey_activity_id) ?? [];
    list.push({ type: 'sketch', id: row.id, title: row.name, url: `/designs/cad/${row.id}` });
    map.set(row.journey_activity_id, list);
  }
  return map;
}

/**
 * Builds the full derived journey view for a project. This is the single
 * source of truth for Journey progress, the AI Assistant's project context,
 * and every journey API response.
 */
export async function buildJourneyView(workspaceId: string, projectId: string): Promise<ProjectJourneyView> {
  const project = await requireProject(workspaceId, projectId);
  const journeyRow = await db
    .selectFrom('project_journeys')
    .select(['id', 'name', 'template'])
    .where('project_id', '=', project.id)
    .executeTakeFirst();
  if (!journeyRow) throw notFound('Journey');

  const [stageRows, activityRows, issueRows, names] = await Promise.all([
    db
      .selectFrom('journey_stages')
      .select(['id', 'name', 'description', 'position'])
      .where('journey_id', '=', journeyRow.id)
      .orderBy('position')
      .execute(),
    db
      .selectFrom('journey_activities')
      .select([
        'id',
        'stage_id',
        'kind',
        'title',
        'description',
        'status',
        'priority',
        'assignee_id',
        'due_at',
        'position',
        'blocked_reason',
        'review_state',
        'reviewed_by',
        'review_note',
        'completed_at',
        'skipped_at',
        'created_at',
        'updated_at'
      ])
      .where('project_id', '=', project.id)
      .execute(),
    db
      .selectFrom('issues as i')
      .leftJoin('users as u', 'u.id', 'i.assignee_id')
      .select(['i.id', 'i.stage_id', 'i.issue_number', 'i.summary', 'i.status', 'i.priority', 'u.name as assignee_name'])
      .where('i.project_id', '=', project.id)
      .where('i.stage_id', 'is not', null)
      .execute(),
    memberNames(workspaceId)
  ]);

  const deps = await db
    .selectFrom('journey_dependencies')
    .select(['activity_id', 'depends_on_id'])
    .where('project_id', '=', project.id)
    .execute();

  const activityById = new Map(activityRows.map((a) => [a.id, a]));
  const artifacts = await loadArtifacts(activityRows.map((a) => a.id));

  const activities: JourneyActivity[] = activityRows.map((row) => {
    const waitingOn: JourneyWaitingOn[] = [];
    for (const dep of deps) {
      if (dep.activity_id !== row.id) continue;
      const target = activityById.get(dep.depends_on_id);
      if (target && target.status !== 'completed') waitingOn.push({ id: target.id, title: target.title, status: target.status });
    }
    return {
      id: row.id,
      stageId: row.stage_id,
      kind: row.kind,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      assigneeId: row.assignee_id,
      assigneeName: row.assignee_id ? names.get(row.assignee_id) ?? null : null,
      dueAt: row.due_at ? row.due_at.toISOString() : null,
      position: row.position,
      blockedReason: row.blocked_reason,
      reviewState: row.review_state,
      reviewedByName: row.reviewed_by ? names.get(row.reviewed_by) ?? null : null,
      reviewNote: row.review_note,
      skipped: Boolean(row.skipped_at),
      completedAt: row.completed_at ? row.completed_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      waitingOn,
      artifacts: artifacts.get(row.id) ?? []
    };
  });

  const issues: JourneyIssue[] = issueRows.map((row) => ({
    id: row.id,
    stageId: row.stage_id!,
    key: `${project.project_key}-${row.issue_number}`,
    summary: row.summary,
    status: row.status,
    priority: row.priority,
    assigneeName: row.assignee_name
  }));

  return deriveJourneyView({
    journey: { id: journeyRow.id, projectId: project.id, name: journeyRow.name, template: journeyRow.template as JourneyTemplateId },
    stages: stageRows.map((s) => ({ id: s.id, name: s.name, description: s.description, position: s.position })),
    activities,
    issues
  });
}

/** Compact journey context for the AI Assistant — no per-activity detail. */
export async function journeyContextForProject(workspaceId: string, projectId: string) {
  try {
    const view = await buildJourneyView(workspaceId, projectId);
    return {
      template: view.journey.templateLabel,
      percent: view.summary.percent,
      stages: view.stages.map((s) => ({ name: s.name, state: s.state, percent: s.percent })),
      nextAction: view.summary.nextAction
        ? { stage: view.summary.nextAction.stageName, title: view.summary.nextAction.title, kind: view.summary.nextAction.kind }
        : null,
      blockers: view.stages.flatMap((s) => s.activities.filter((a) => a.status === 'blocked').map((a) => `${s.name}: ${a.title}`)),
      pendingApprovals: view.stages
        .flatMap((s) => s.activities.filter((a) => a.reviewState === 'pending').map((a) => `${s.name}: ${a.title}`)),
      upcomingMilestones: view.summary.upcomingMilestones.map((m) => ({ title: m.title, dueAt: m.dueAt }))
    };
  } catch {
    return null;
  }
}

export async function loadWorkspaceMembers(workspaceId: string) {
  const rows = await sql<{ id: string; name: string }>`
    SELECT u.id, u.name FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.workspace_id = ${workspaceId}::uuid ORDER BY u.name`.execute(db);
  return rows.rows;
}

export async function requireStageOfProject(stageId: string, projectId: string): Promise<{ id: string; position: number; name: string }> {
  const stage = await db
    .selectFrom('journey_stages')
    .select(['id', 'position', 'name'])
    .where('id', '=', stageId)
    .where('project_id', '=', projectId)
    .executeTakeFirst();
  if (!stage) throw notFound('Stage');
  return stage;
}

export async function requireActivityOfProject(activityId: string, projectId: string) {
  const activity = await db
    .selectFrom('journey_activities')
    .select(['id', 'stage_id', 'kind', 'title', 'status', 'review_state', 'position', 'project_id'])
    .where('id', '=', activityId)
    .where('project_id', '=', projectId)
    .executeTakeFirst();
  if (!activity) throw notFound('Activity');
  return activity;
}

export async function assertWorkspaceAssignee(workspaceId: string, assigneeId: string | null | undefined) {
  if (!assigneeId) return;
  const membership = await db
    .selectFrom('memberships')
    .select('user_id')
    .where('workspace_id', '=', workspaceId)
    .where('user_id', '=', assigneeId)
    .executeTakeFirst();
  if (!membership) throw badRequest('Assignee must be a member of this workspace');
}

export async function nextStagePosition(journeyId: string): Promise<number> {
  const row = await db
    .selectFrom('journey_stages')
    .select(sql<number>`coalesce(max(position), -1) + 1`.as('next'))
    .where('journey_id', '=', journeyId)
    .executeTakeFirst();
  return Number(row?.next ?? 0);
}

export async function nextActivityPosition(stageId: string): Promise<number> {
  const row = await db
    .selectFrom('journey_activities')
    .select(sql<number>`coalesce(max(position), -1) + 1`.as('next'))
    .where('stage_id', '=', stageId)
    .executeTakeFirst();
  return Number(row?.next ?? 0);
}
