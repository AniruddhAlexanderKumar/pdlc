import { sql } from 'kysely';
import { JOURNEY_ACTIVITY_KINDS, JOURNEY_ACTIVITY_STATUSES } from '@sv/shared';
import { db } from '../db/index.js';
import { buildJourneyView } from './journey-first.js';

/** Resolve a project by key or UUID inside the actor's workspace. */
async function resolveProject(workspaceId: string, raw: unknown) {
  const key = String(raw || '').trim();
  if (!key) return { error: 'project_key is required' };
  const project = await db
    .selectFrom('projects')
    .select(['id', 'project_key', 'name'])
    .where('workspace_id', '=', workspaceId)
    .where((eb) =>
      eb.or([
        eb('project_key', '=', key.toUpperCase()),
        eb('id', '=', key.length === 36 ? key : '00000000-0000-0000-0000-000000000000')
      ])
    )
    .executeTakeFirst();
  if (!project) return { error: `Project '${key}' was not found in this workspace.` };
  return project;
}

export interface McpToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export const ASSISTANT_MCP_TOOLS: McpToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_workspace_projects',
      description: 'List all engineering projects in the user’s current workspace with their project keys, names, and descriptions.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_project_details',
      description: 'Get detailed information, task counts by status, and recent issues for a project by key (e.g. FLOW, PROJ) or id.',
      parameters: {
        type: 'object',
        properties: {
          project_key: {
            type: 'string',
            description: 'The uppercase 2-10 letter project key (e.g. "PROJ", "FLOW") or project UUID'
          }
        },
        required: ['project_key']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_project_issues',
      description: 'List and filter tasks/issues in a project or across the workspace by project key, status, or search term.',
      parameters: {
        type: 'object',
        properties: {
          project_key: {
            type: 'string',
            description: 'Optional project key to filter issues for a specific project'
          },
          status: {
            type: 'string',
            enum: ['Open', 'In Progress', 'Done'],
            description: 'Optional issue status filter'
          },
          query: {
            type: 'string',
            description: 'Optional text keyword to search issue summaries and descriptions'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_issue_details',
      description: 'Get complete details for a specific issue/task by its key (e.g. "BUILD-1", "BOTTLE-2").',
      parameters: {
        type: 'object',
        properties: {
          issue_key: {
            type: 'string',
            description: 'The task key, e.g. "BUILD-1"'
          }
        },
        required: ['issue_key']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_issue',
      description: 'Create a new task, bug, or story in an existing project in the current workspace.',
      parameters: {
        type: 'object',
        properties: {
          project_key: {
            type: 'string',
            description: 'The project key (e.g. "BUILD", "DEMO", "BOTTLE")'
          },
          summary: {
            type: 'string',
            description: 'Brief summary or title of the task (up to 200 characters)'
          },
          description: {
            type: 'string',
            description: 'Optional detailed description of the task'
          },
          type: {
            type: 'string',
            enum: ['Task', 'Bug', 'Story'],
            description: 'The type of issue (default: Task)'
          },
          priority: {
            type: 'string',
            enum: ['Low', 'Medium', 'High', 'Critical'],
            description: 'The priority level (default: Medium)'
          }
        },
        required: ['project_key', 'summary']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_issue',
      description: 'Update an existing task or issue (such as marking status to "Open", "In Progress", or "Done", changing priority, or updating summary/description).',
      parameters: {
        type: 'object',
        properties: {
          issue_key: {
            type: 'string',
            description: 'The task key (e.g. "BUILD-1", "BOTTLE-3")'
          },
          status: {
            type: 'string',
            enum: ['Open', 'In Progress', 'Done'],
            description: 'New status for the task'
          },
          priority: {
            type: 'string',
            enum: ['Low', 'Medium', 'High', 'Critical'],
            description: 'New priority level for the task'
          },
          summary: {
            type: 'string',
            description: 'New summary/title for the task'
          },
          description: {
            type: 'string',
            description: 'New description for the task'
          }
        },
        required: ['issue_key']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_project',
      description: 'Create a new engineering project in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The name of the project'
          },
          project_key: {
            type: 'string',
            description: 'Optional uppercase 2-10 letter key (e.g. "ROBOT", "IOT"). If omitted, generated from name.'
          },
          description: {
            type: 'string',
            description: 'Optional description of the project'
          }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_project',
      description: 'Update an existing project name or description by project key.',
      parameters: {
        type: 'object',
        properties: {
          project_key: {
            type: 'string',
            description: 'The project key (e.g. "BUILD", "DEMO")'
          },
          name: {
            type: 'string',
            description: 'New project name'
          },
          description: {
            type: 'string',
            description: 'New project description'
          }
        },
        required: ['project_key']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_products',
      description: 'List hardware and software products in this workspace, their lifecycle stages, target prices, and BOM costs.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_project_journey',
      description: 'Get the development Journey for a project: stages with progress states, next action, blockers, pending approvals, upcoming milestones and every activity with its id.',
      parameters: {
        type: 'object',
        properties: {
          project_key: {
            type: 'string',
            description: 'The project key (e.g. \"BUILD\") or project UUID'
          }
        },
        required: ['project_key']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_journey_activity',
      description: 'Add an activity (requirement, milestone, deliverable, document, approval, decision or risk) to a stage of a project\'s Journey. Returns the new activity id.',
      parameters: {
        type: 'object',
        properties: {
          project_key: { type: 'string', description: 'The project key (e.g. \"BUILD\")' },
          stage_name: { type: 'string', description: 'Exact name of an existing stage in the project\'s Journey, e.g. \"Requirements & Feasibility\"' },
          kind: { type: 'string', enum: ['requirement', 'milestone', 'deliverable', 'document', 'approval', 'decision', 'risk'], description: 'What kind of work this activity represents' },
          title: { type: 'string', description: 'Short title, up to 200 characters' },
          description: { type: 'string', description: 'Optional detail, up to 4000 characters' }
        },
        required: ['project_key', 'stage_name', 'kind', 'title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_journey_activity',
      description: 'Update an activity on a project\'s Journey: change status (not_started, in_progress, blocked, in_review, completed), priority, or blocked reason. Use get_project_journey first to find activity ids.',
      parameters: {
        type: 'object',
        properties: {
          activity_id: { type: 'string', description: 'The activity UUID from get_project_journey' },
          status: { type: 'string', enum: ['not_started', 'in_progress', 'blocked', 'in_review', 'completed'], description: 'New status' },
          priority: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'], description: 'New priority' },
          blocked_reason: { type: 'string', description: 'Required when status is \"blocked\"' }
        },
        required: ['activity_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_help_centre',
      description: 'Search official Solution Velocity guides, documentation, and help articles.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query or topic to look up in the Help Centre'
          }
        },
        required: ['query']
      }
    }
  }
];

export async function executeInternalMcpTool(
  actor: { workspaceId: string; userId: string; role?: string; isAdmin?: boolean },
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  try {
    switch (name) {
      case 'list_workspace_projects': {
        const projects = await db
          .selectFrom('projects')
          .select(['id', 'project_key', 'name', 'description', 'updated_at'])
          .where('workspace_id', '=', actor.workspaceId)
          .orderBy('updated_at', 'desc')
          .limit(30)
          .execute();
        return {
          count: projects.length,
          projects: projects.map((p) => ({
            id: p.id,
            key: p.project_key,
            name: p.name,
            description: p.description
          }))
        };
      }

      case 'get_project_details': {
        const rawKey = String(args.project_key || '').trim();
        const key = rawKey.toUpperCase();
        const project = await db
          .selectFrom('projects')
          .selectAll()
          .where('workspace_id', '=', actor.workspaceId)
          .where((eb) =>
            eb.or([
              eb('project_key', '=', key),
              eb('id', '=', rawKey.length === 36 ? rawKey : '00000000-0000-0000-0000-000000000000')
            ])
          )
          .executeTakeFirst();

        if (!project) {
          return { error: `Project '${rawKey}' was not found in this workspace.` };
        }

        const counts = await sql<{ status: string; count: number }>`
          SELECT status, count(*)::int AS count
          FROM issues
          WHERE project_id = ${project.id}::uuid
          GROUP BY status
        `.execute(db);

        const issues = await db
          .selectFrom('issues')
          .select(['issue_number', 'type', 'priority', 'status', 'summary'])
          .where('project_id', '=', project.id)
          .orderBy('updated_at', 'desc')
          .limit(20)
          .execute();

        return {
          id: project.id,
          key: project.project_key,
          name: project.name,
          description: project.description,
          total_issues: issues.length,
          status_breakdown: Object.fromEntries(counts.rows.map((r) => [r.status, r.count])),
          recent_issues: issues.map((i) => ({
            key: `${project.project_key}-${i.issue_number}`,
            type: i.type,
            priority: i.priority,
            status: i.status,
            summary: i.summary
          }))
        };
      }

      case 'list_project_issues': {
        let query = db
          .selectFrom('issues as i')
          .innerJoin('projects as p', 'p.id', 'i.project_id')
          .select(['p.project_key', 'i.issue_number', 'i.type', 'i.priority', 'i.status', 'i.summary', 'i.description'])
          .where('p.workspace_id', '=', actor.workspaceId);

        if (args.project_key) {
          query = query.where('p.project_key', '=', String(args.project_key).toUpperCase().trim());
        }
        if (args.status && ['Open', 'In Progress', 'Done'].includes(String(args.status))) {
          query = query.where('i.status', '=', args.status as any);
        }
        if (args.query) {
          const s = `%${String(args.query).replace(/[\\%_]/g, '\\$&')}%`;
          query = query.where((eb) =>
            eb.or([eb('i.summary', 'ilike', s), eb('i.description', 'ilike', s)])
          );
        }

        const rows = await query.orderBy('i.updated_at', 'desc').limit(25).execute();
        return {
          count: rows.length,
          issues: rows.map((r) => ({
            key: `${r.project_key}-${r.issue_number}`,
            type: r.type,
            priority: r.priority,
            status: r.status,
            summary: r.summary,
            description: r.description
          }))
        };
      }

      case 'get_issue_details': {
        const issueKey = String(args.issue_key || '').trim().toUpperCase();
        const match = issueKey.match(/^([A-Z0-9]+)-(\d+)$/);
        if (!match) {
          return { error: `Invalid issue key format '${issueKey}'. Expected format like 'BUILD-1'.` };
        }
        const [_, projKey, numStr] = match;
        const issueNum = parseInt(numStr, 10);

        const project = await db
          .selectFrom('projects')
          .select(['id', 'project_key', 'name'])
          .where('workspace_id', '=', actor.workspaceId)
          .where('project_key', '=', projKey)
          .executeTakeFirst();

        if (!project) {
          return { error: `Project '${projKey}' not found in this workspace.` };
        }

        const issue = await db
          .selectFrom('issues')
          .selectAll()
          .where('project_id', '=', project.id)
          .where('issue_number', '=', issueNum)
          .executeTakeFirst();

        if (!issue) {
          return { error: `Issue '${issueKey}' not found in project '${projKey}'.` };
        }

        return {
          issue_key: issueKey,
          id: issue.id,
          project_key: project.project_key,
          project_name: project.name,
          type: issue.type,
          status: issue.status,
          priority: issue.priority,
          summary: issue.summary,
          description: issue.description,
          labels: issue.labels,
          created_at: issue.created_at,
          updated_at: issue.updated_at,
          url: `/projects/${project.id}/issues?issueId=${issue.id}`
        };
      }

      case 'create_issue': {
        const projectKey = String(args.project_key || '').toUpperCase().trim();
        const summary = String(args.summary || '').trim().slice(0, 200);
        if (!projectKey) return { error: 'project_key is required' };
        if (!summary) return { error: 'summary is required' };
        const issueType = ['Task', 'Bug', 'Story'].includes(String(args.type)) ? String(args.type) : 'Task';
        const priority = ['Low', 'Medium', 'High', 'Critical'].includes(String(args.priority)) ? String(args.priority) : 'Medium';
        const description = String(args.description || '').slice(0, 2000);

        return await db.transaction().execute(async (trx) => {
          const project = await trx
            .selectFrom('projects')
            .select(['id', 'project_key', 'next_issue_number'])
            .where('workspace_id', '=', actor.workspaceId)
            .where('project_key', '=', projectKey)
            .forUpdate()
            .executeTakeFirst();

          if (!project) {
            return { error: `Project '${projectKey}' was not found in this workspace.` };
          }

          const issue = await trx
            .insertInto('issues')
            .values({
              project_id: project.id,
              issue_number: project.next_issue_number,
              type: issueType as any,
              priority: priority as any,
              status: 'Open',
              summary,
              description,
              labels: [],
              reporter_id: actor.userId,
              assignee_id: null,
              updated_at: new Date()
            })
            .returning(['id', 'issue_number', 'summary', 'status', 'priority', 'type'])
            .executeTakeFirstOrThrow();

          await trx
            .updateTable('projects')
            .set({
              next_issue_number: project.next_issue_number + 1,
              updated_at: new Date()
            })
            .where('id', '=', project.id)
            .execute();

          return {
            success: true,
            issue_key: `${project.project_key}-${issue.issue_number}`,
            id: issue.id,
            summary: issue.summary,
            status: issue.status,
            priority: issue.priority,
            type: issue.type,
            url: `/projects/${project.id}/issues?issueId=${issue.id}`
          };
        });
      }

      case 'update_issue': {
        const issueKey = String(args.issue_key || '').trim().toUpperCase();
        const match = issueKey.match(/^([A-Z0-9]+)-(\d+)$/);
        if (!match) {
          return { error: `Invalid issue key format '${issueKey}'. Expected format like 'BUILD-1' or 'PROJ-5'.` };
        }
        const [_, projKey, numStr] = match;
        const issueNum = parseInt(numStr, 10);

        return await db.transaction().execute(async (trx) => {
          const project = await trx
            .selectFrom('projects')
            .select(['id', 'project_key'])
            .where('workspace_id', '=', actor.workspaceId)
            .where('project_key', '=', projKey)
            .executeTakeFirst();

          if (!project) {
            return { error: `Project '${projKey}' not found in this workspace.` };
          }

          const issue = await trx
            .selectFrom('issues')
            .select(['id', 'issue_number', 'summary', 'status', 'priority', 'description'])
            .where('project_id', '=', project.id)
            .where('issue_number', '=', issueNum)
            .forUpdate()
            .executeTakeFirst();

          if (!issue) {
            return { error: `Issue '${issueKey}' not found in project '${projKey}'.` };
          }

          const updates: Record<string, any> = { updated_at: new Date() };
          if (args.status && ['Open', 'In Progress', 'Done'].includes(String(args.status))) {
            updates.status = args.status;
          }
          if (args.priority && ['Low', 'Medium', 'High', 'Critical'].includes(String(args.priority))) {
            updates.priority = args.priority;
          }
          if (args.summary && typeof args.summary === 'string' && args.summary.trim()) {
            updates.summary = args.summary.trim().slice(0, 200);
          }
          if (args.description !== undefined && typeof args.description === 'string') {
            updates.description = args.description.slice(0, 2000);
          }

          await trx
            .updateTable('issues')
            .set(updates)
            .where('id', '=', issue.id)
            .execute();

          return {
            success: true,
            issue_key: issueKey,
            id: issue.id,
            previous: {
              status: issue.status,
              priority: issue.priority,
              summary: issue.summary
            },
            current: {
              status: updates.status || issue.status,
              priority: updates.priority || issue.priority,
              summary: updates.summary || issue.summary
            },
            url: `/projects/${project.id}/issues?issueId=${issue.id}`
          };
        });
      }

      case 'create_project': {
        if (actor.role === 'member' && !actor.isAdmin) {
          return { error: 'Only workspace owners and admins can create projects.' };
        }
        const name = String(args.name || '').trim().slice(0, 120);
        if (!name) return { error: 'Project name is required' };
        let key = args.project_key ? String(args.project_key).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) : '';
        if (!key || key.length < 2) {
          let base = name.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^[^A-Z]+/, '').slice(0, 8) || 'PR';
          if (base.length === 1) base += 'X';
          key = base;
        }

        return await db.transaction().execute(async (trx) => {
          let finalKey = key;
          for (let n = 2; n < 100; n++) {
            const existing = await trx
              .selectFrom('projects')
              .select('id')
              .where('workspace_id', '=', actor.workspaceId)
              .where('project_key', '=', finalKey)
              .executeTakeFirst();
            if (!existing) break;
            finalKey = `${key.slice(0, 6)}${n}`;
          }

          const desc = String(args.description || '').slice(0, 1000);
          const project = await trx
            .insertInto('projects')
            .values({
              workspace_id: actor.workspaceId,
              project_key: finalKey,
              name,
              description: desc,
              created_by: actor.userId,
              updated_at: new Date()
            })
            .returning(['id', 'project_key', 'name', 'description'])
            .executeTakeFirstOrThrow();

          return {
            success: true,
            id: project.id,
            project_key: project.project_key,
            name: project.name,
            description: project.description,
            url: `/projects/${project.id}/issues`
          };
        });
      }

      case 'update_project': {
        const projectKey = String(args.project_key || '').toUpperCase().trim();
        if (!projectKey) return { error: 'project_key is required' };

        return await db.transaction().execute(async (trx) => {
          const project = await trx
            .selectFrom('projects')
            .select(['id', 'name', 'description'])
            .where('workspace_id', '=', actor.workspaceId)
            .where('project_key', '=', projectKey)
            .executeTakeFirst();

          if (!project) {
            return { error: `Project '${projectKey}' not found in this workspace.` };
          }

          const updates: Record<string, any> = { updated_at: new Date() };
          if (args.name && typeof args.name === 'string' && args.name.trim()) {
            updates.name = args.name.trim().slice(0, 120);
          }
          if (args.description !== undefined && typeof args.description === 'string') {
            updates.description = args.description.slice(0, 1000);
          }

          await trx
            .updateTable('projects')
            .set(updates)
            .where('id', '=', project.id)
            .execute();

          return {
            success: true,
            project_key: projectKey,
            id: project.id,
            updated: {
              name: updates.name || project.name,
              description: updates.description ?? project.description
            },
            url: `/projects/${project.id}/issues`
          };
        });
      }

      case 'list_products': {
        const products = await db
          .selectFrom('products')
          .select(['id', 'name', 'category', 'stage', 'description', 'target_price', 'labour', 'packaging', 'overhead'])
          .where('workspace_id', '=', actor.workspaceId)
          .orderBy('updated_at', 'desc')
          .limit(20)
          .execute();
        return {
          count: products.length,
          products
        };
      }

      case 'search_help_centre': {
        const q = String(args.query || '').toLowerCase().trim();
        const docs = await db
          .selectFrom('help_articles')
          .select(['slug', 'title', 'summary', 'body', 'keywords', 'category'])
          .where('status', '=', 'published')
          .where('audience', 'in', actor.role === 'member' && !actor.isAdmin ? ['everyone'] : ['everyone', 'workspace_admin'])
          .limit(50)
          .execute();

        const matches = docs
          .filter(
            (d) =>
              d.title.toLowerCase().includes(q) ||
              d.summary.toLowerCase().includes(q) ||
              d.body.toLowerCase().includes(q) ||
              d.keywords.some((k: string) => k.toLowerCase().includes(q))
          )
          .slice(0, 3);

        return {
          matches: matches.map((m) => ({
            title: m.title,
            summary: m.summary,
            body: m.body.slice(0, 1000),
            slug: m.slug,
            category: m.category
          }))
        };
      }

      case 'get_project_journey': {
        const project = await resolveProject(actor.workspaceId, args.project_key);
        if ('error' in project) return project;
        const view = await buildJourneyView(actor.workspaceId, project.id);
        return {
          project: { key: project.project_key, name: project.name },
          journey: view.journey,
          percent: view.summary.percent,
          next_action: view.summary.nextAction,
          blockers: view.summary.blockers,
          pending_approvals: view.summary.pendingApprovals,
          upcoming_milestones: view.summary.upcomingMilestones,
          stages: view.stages.map((stage) => ({
            id: stage.id,
            name: stage.name,
            state: stage.state,
            percent: stage.percent,
            activities: stage.activities.map((a) => ({
              id: a.id,
              kind: a.kind,
              title: a.title,
              status: a.status,
              priority: a.priority,
              review_state: a.reviewState,
              due_at: a.dueAt,
              assignee: a.assigneeName,
              waiting_on: a.waitingOn.map((w) => w.title)
            })),
            tasks: stage.issues.map((i) => ({ key: i.key, summary: i.summary, status: i.status, priority: i.priority }))
          }))
        };
      }

      case 'create_journey_activity': {
        const project = await resolveProject(actor.workspaceId, args.project_key);
        if ('error' in project) return project;
        const kind = String(args.kind || '');
        if (!JOURNEY_ACTIVITY_KINDS.includes(kind as any)) return { error: `Unknown activity kind '${kind}'.` };
        const title = String(args.title || '').trim().slice(0, 200);
        if (!title) return { error: 'title is required' };
        const stageName = String(args.stage_name || '').trim().toLowerCase();
        const stages = await db.selectFrom('journey_stages').select(['id', 'name']).where('project_id', '=', project.id).execute();
        const stage = stages.find((s) => s.name.toLowerCase() === stageName);
        if (!stage) return { error: `Stage '${args.stage_name}' not found. Available stages: ${stages.map((s) => s.name).join(', ')}` };
        const positionRow = await db
          .selectFrom('journey_activities')
          .select(sql<number>`coalesce(max(position), -1) + 1`.as('next'))
          .where('stage_id', '=', stage.id)
          .executeTakeFirst();
        const inserted = await db
          .insertInto('journey_activities')
          .values({
            stage_id: stage.id,
            project_id: project.id,
            kind: kind as any,
            title,
            description: String(args.description || '').slice(0, 4000),
            position: Number(positionRow?.next ?? 0),
            created_by: actor.userId
          })
          .returning(['id', 'title'])
          .executeTakeFirstOrThrow();
        return {
          success: true,
          activity_id: inserted.id,
          title: inserted.title,
          stage: stage.name,
          url: `/?project=${project.id}`
        };
      }

      case 'update_journey_activity': {
        const activityId = String(args.activity_id || '').trim();
        if (!/^[0-9a-f-]{36}$/i.test(activityId)) return { error: 'activity_id must be a UUID from get_project_journey' };
        const activity = await db
          .selectFrom('journey_activities as a')
          .innerJoin('projects as p', 'p.id', 'a.project_id')
          .select(['a.id', 'a.status', 'a.project_id', 'p.project_key'])
          .where('a.id', '=', activityId)
          .where('p.workspace_id', '=', actor.workspaceId)
          .executeTakeFirst();
        if (!activity) return { error: 'Activity not found in this workspace.' };
        const updates: Record<string, unknown> = { updated_at: new Date() };
        const status = args.status ? String(args.status) : '';
        if (status) {
          if (!JOURNEY_ACTIVITY_STATUSES.includes(status as any)) return { error: `Unknown status '${status}'.` };
          if (status === 'blocked' && !String(args.blocked_reason || '').trim()) {
            return { error: 'blocked_reason is required when setting status to blocked' };
          }
          updates.status = status;
          updates.blocked_reason = status === 'blocked' ? String(args.blocked_reason).slice(0, 500) : '';
          if (status === 'completed') updates.completed_at = new Date();
          if (activity.status === 'completed' && status !== 'completed') updates.completed_at = null;
        }
        if (args.priority) {
          const priority = String(args.priority);
          if (!['Low', 'Medium', 'High', 'Critical'].includes(priority)) return { error: `Unknown priority '${priority}'.` };
          updates.priority = priority;
        }
        await db.updateTable('journey_activities').set(updates).where('id', '=', activityId).execute();
        return { success: true, activity_id: activityId, status: updates.status || activity.status, url: `/?project=${activity.project_id}` };
      }

      default:
        return { error: `Unknown MCP tool: ${name}` };
    }
  } catch (error) {
    return { error: (error as Error).message };
  }
}
