import { Router } from 'express';
import { sql } from 'kysely';
import { z } from 'zod';
import type { GraphAnswer, GraphFinding } from '@sv/shared';
import { auth } from '../auth/session.js';
import { db } from '../db/index.js';
import { badRequest, HttpError, notFound, parse, route, uuid } from '../lib/http.js';
import { classifyGraphQuestion } from '../services/graph-intelligence.js';

export const graphIntelligenceRouter = Router();
const questionInput = z.object({ question: z.string().trim().min(3).max(500), projectId: uuid.optional(), selectedIssueId: uuid.optional() });
type Row = { id: string; project_id: string; project_key: string; issue_number: number; summary: string; status: string; priority: string; reason: string; support_id?: string; support_project_id?: string; support_key?: string; support_title?: string };
const limit = 50;

graphIntelligenceRouter.post('/ask', route(async (req, res) => {
  const actor = auth(req); const body = parse(questionInput, req.body);
  if (body.projectId && !await db.selectFrom('projects').select('id').where('id', '=', body.projectId).where('workspace_id', '=', actor.workspaceId).executeTakeFirst()) throw notFound('Project');
  let parsed: Awaited<ReturnType<typeof classifyGraphQuestion>>;
  try { parsed = await classifyGraphQuestion(body.question); }
  catch { throw new HttpError(503, 'Graph assistant is unavailable or returned an invalid response. Check the configured AI server and try again.', 'graph_ai_unavailable'); }
  const project = body.projectId ?? null; const workspace = actor.workspaceId;
  let rows: Row[] = []; let explanation = '';
  if (parsed.intent === 'connections' || parsed.intent === 'impact') {
    const key = body.question.match(/\b([A-Za-z][A-Za-z0-9]{1,9})-([1-9][0-9]*)\b/);
    let issueQuery = db.selectFrom('issues as i').innerJoin('projects as p', 'p.id', 'i.project_id').select(['i.id', 'i.summary', 'p.id as project_id', 'p.project_key', 'i.issue_number']).where('p.workspace_id', '=', workspace);
    if (key && (!Number.isSafeInteger(Number(key[2])) || Number(key[2]) > 2147483647)) throw notFound('Issue');
    if (key) issueQuery = issueQuery.where('p.project_key', '=', key[1].toUpperCase()).where('i.issue_number', '=', Number(key[2]));
    else if (body.selectedIssueId) issueQuery = issueQuery.where('i.id', '=', body.selectedIssueId);
    else throw badRequest('Select an issue or include an issue key such as TEAM-12 in your question.');
    if (project) issueQuery = issueQuery.where('p.id', '=', project);
    const selected = await issueQuery.executeTakeFirst();
    if (!selected) throw notFound('Issue');
    if (parsed.intent === 'connections') {
      const result = await sql<Row>`SELECT i.id, p.id AS project_id, p.project_key, i.issue_number, i.summary, i.status, i.priority,
        CASE WHEN r.source_issue_id = ${selected.id}::uuid THEN 'Outgoing ' || r.relationship_type ELSE 'Incoming ' || r.relationship_type END AS reason
        FROM issue_relationships r JOIN issues i ON i.id = CASE WHEN r.source_issue_id = ${selected.id}::uuid THEN r.target_issue_id ELSE r.source_issue_id END
        JOIN projects p ON p.id = i.project_id
        WHERE r.workspace_id = ${workspace}::uuid AND p.workspace_id = ${workspace}::uuid AND (r.source_issue_id = ${selected.id}::uuid OR r.target_issue_id = ${selected.id}::uuid)
        ORDER BY p.project_key, i.issue_number LIMIT ${limit + 1}`.execute(db);
      rows = result.rows; explanation = `Recorded issue-to-issue links to ${selected.project_key}-${selected.issue_number}. Project containment and assignment appear in the graph.`;
    } else {
      const result = await sql<Row>`WITH RECURSIVE walk(id, depth) AS (
        SELECT ${selected.id}::uuid, 0 UNION
        SELECT r.source_issue_id, walk.depth + 1 FROM walk JOIN issue_relationships r ON r.target_issue_id = walk.id
        WHERE r.workspace_id = ${workspace}::uuid AND r.relationship_type = 'depends_on' AND walk.depth < 5
      ) SELECT i.id, p.id AS project_id, p.project_key, i.issue_number, i.summary, i.status, i.priority,
        CASE WHEN min(walk.depth) = 1 THEN 'Direct dependent' ELSE 'Indirect dependent (' || min(walk.depth)::text || ' levels)' END AS reason
        FROM walk JOIN issues i ON i.id = walk.id JOIN projects p ON p.id = i.project_id
        WHERE walk.id <> ${selected.id}::uuid AND p.workspace_id = ${workspace}::uuid
        GROUP BY i.id, p.id ORDER BY min(walk.depth), p.project_key, i.issue_number LIMIT ${limit + 1}`.execute(db);
      rows = result.rows; explanation = `Recorded downstream dependents of ${selected.project_key}-${selected.issue_number}, up to five levels. These links do not establish an engineering consequence.`;
    }
    rows = rows.map(row => ({ ...row, support_id: selected.id, support_project_id: selected.project_id, support_key: `${selected.project_key}-${selected.issue_number}`, support_title: selected.summary }));
  } else if (parsed.intent === 'unsupported') {
    explanation = 'This question is not supported by the available issue, assignment and dependency records. Requirements, documents, tests and releases are not currently modeled.';
  } else if (parsed.intent === 'blockers') {
    explanation = 'Unresolved prerequisite issues for unresolved work, based only on recorded dependencies.';
    const result = await sql<Row>`SELECT i.id, p.id AS project_id, p.project_key, i.issue_number, i.summary, i.status, i.priority,
        'Unresolved prerequisite for ' || dp.project_key || '-' || dependent.issue_number::text AS reason,
        dependent.id AS support_id, dp.id AS support_project_id, dp.project_key || '-' || dependent.issue_number::text AS support_key, dependent.summary AS support_title
      FROM issue_relationships r JOIN issues i ON i.id = r.target_issue_id JOIN projects p ON p.id = i.project_id
      JOIN issues dependent ON dependent.id = r.source_issue_id JOIN projects dp ON dp.id = dependent.project_id
      WHERE r.workspace_id = ${workspace}::uuid AND p.workspace_id = ${workspace}::uuid AND dp.workspace_id = ${workspace}::uuid
        AND (${project}::uuid IS NULL OR dp.id = ${project}::uuid) AND r.relationship_type = 'depends_on' AND i.status <> 'Done' AND dependent.status <> 'Done'
      ORDER BY dependent.updated_at DESC, i.id LIMIT ${limit + 1}`.execute(db);
    rows = result.rows;
  } else if (parsed.intent === 'duplicates') {
    explanation = 'Identical summaries are possible duplicates, not confirmed duplicates.';
    const result = await sql<Row>`SELECT i.id, p.id AS project_id, p.project_key, i.issue_number, i.summary, i.status, i.priority,
        'Identical summary; review for possible duplication'::text AS reason,
        other.id AS support_id, op.id AS support_project_id, op.project_key || '-' || other.issue_number::text AS support_key, other.summary AS support_title
      FROM issues i JOIN projects p ON p.id = i.project_id
      JOIN LATERAL (SELECT oi.* FROM issues oi JOIN projects po ON po.id = oi.project_id WHERE po.workspace_id = ${workspace}::uuid AND oi.id <> i.id AND lower(trim(oi.summary)) = lower(trim(i.summary)) ORDER BY oi.id LIMIT 1) other ON true
      JOIN projects op ON op.id = other.project_id
      WHERE p.workspace_id = ${workspace}::uuid AND (${project}::uuid IS NULL OR p.id = ${project}::uuid)
      ORDER BY i.updated_at DESC, i.id LIMIT ${limit + 1}`.execute(db);
    rows = result.rows;
  } else {
    let personId: string | null = null;
    if (parsed.intent === 'assigned') {
      if (!parsed.person) throw badRequest('Include the exact name of a workspace member in your question.');
      const people = await db.selectFrom('memberships as m').innerJoin('users as u', 'u.id', 'm.user_id').select('u.id').where('m.workspace_id', '=', workspace).where(sql<boolean>`lower(u.name) = lower(${parsed.person})`).limit(2).execute();
      if (people.length !== 1) throw badRequest('No unique workspace member matches that name. Use the exact member name.');
      personId = people[0].id;
    }
    const reason: Record<string, string> = { unassigned: 'No assignee', high_priority: 'Open high-priority issue', blockers: 'Unresolved prerequisite', disconnected: 'No explicit issue relationships', duplicates: 'Identical summary to another issue; review for possible duplication', assigned: 'Assigned to the named member' };
    explanation = { unassigned: 'Issues without an assignee.', high_priority: 'Unresolved high or critical priority issues.', blockers: 'Unresolved prerequisite issues for unresolved work, based only on recorded dependencies.', disconnected: 'Issues without explicit issue-to-issue relationships. They may still belong to a project or have an assignee.', duplicates: 'Identical summaries are possible duplicates, not confirmed duplicates.', assigned: `Issues assigned to ${parsed.person}.` }[parsed.intent] ?? '';
    const result = await sql<Row>`SELECT i.id, p.id AS project_id, p.project_key, i.issue_number, i.summary, i.status, i.priority, ${reason[parsed.intent]}::text AS reason
      FROM issues i JOIN projects p ON p.id = i.project_id
      WHERE p.workspace_id = ${workspace}::uuid AND (${project}::uuid IS NULL OR p.id = ${project}::uuid)
      AND CASE ${parsed.intent}
        WHEN 'unassigned' THEN i.assignee_id IS NULL
        WHEN 'high_priority' THEN i.priority IN ('High', 'Critical') AND i.status <> 'Done'
        WHEN 'assigned' THEN i.assignee_id = ${personId}::uuid
        WHEN 'blockers' THEN i.status <> 'Done' AND EXISTS (SELECT 1 FROM issue_relationships r JOIN issues dependent ON dependent.id = r.source_issue_id WHERE r.workspace_id = ${workspace}::uuid AND r.relationship_type = 'depends_on' AND r.target_issue_id = i.id AND dependent.status <> 'Done')
        WHEN 'disconnected' THEN NOT EXISTS (SELECT 1 FROM issue_relationships r WHERE r.workspace_id = ${workspace}::uuid AND (r.source_issue_id = i.id OR r.target_issue_id = i.id))
        WHEN 'duplicates' THEN EXISTS (SELECT 1 FROM issues other JOIN projects op ON op.id = other.project_id WHERE op.workspace_id = ${workspace}::uuid AND other.id <> i.id AND lower(trim(other.summary)) = lower(trim(i.summary)))
        ELSE false END
      ORDER BY i.updated_at DESC, i.id LIMIT ${limit + 1}`.execute(db);
    rows = result.rows;
  }
  const findings: GraphFinding[] = rows.slice(0, limit).map(r => ({ id: r.id, projectId: r.project_id, key: `${r.project_key}-${r.issue_number}`, title: r.summary, status: r.status, priority: r.priority, reason: r.reason, url: `/projects/${r.project_id}/issues?issueId=${r.id}`, ...(r.support_id && r.support_project_id && r.support_key && r.support_title ? { supporting: { id: r.support_id, key: r.support_key, title: r.support_title, url: `/projects/${r.support_project_id}/issues?issueId=${r.support_id}` } } : {}) }));
  res.json({ intent: parsed.intent, explanation, findings, truncated: rows.length > limit } satisfies GraphAnswer);
}));
