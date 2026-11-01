import { Router } from 'express';
import { sql, type Selectable } from 'kysely';
import { z } from 'zod';
import {
  CONTRIBUTION_CATEGORIES,
  CONTRIBUTION_DIMENSIONS,
  CONTRIBUTION_WEIGHTS,
  calculateContributionScore,
  isContributionScoringEnabled,
  type Contribution,
  type ContributionCategory,
  type ContributionDimension,
  type ContributionEvidence,
  type ContributionParticipant,
  type ContributionReview,
  type ContributionRubricConfig,
  type ContributionScoreResult,
  type ContributionStatus,
  type ContributionSummary
} from '@sv/shared';
import { auth, requireRole } from '../auth/session.js';
import { db, type Db } from '../db/index.js';
import { badRequest, conflict, forbidden, notFound, parse, route, shortText, uuid } from '../lib/http.js';
import type { ContributionEvidenceTable, ContributionsTable } from '../db/schema.js';
import { param } from './util.js';

export const contributionsRouter = Router();

const managers = requireRole('owner', 'admin');
const dimensionSchema = z.enum(CONTRIBUTION_DIMENSIONS);
const ratingSchema = z.object({
  impact: z.number().int().min(0).max(5).nullable(),
  quality: z.number().int().min(0).max(5).nullable(),
  complexity: z.number().int().min(0).max(5).nullable(),
  collaboration: z.number().int().min(0).max(5).nullable(),
  effort: z.number().int().min(0).max(5).nullable()
});
const participantInput = z.object({
  userId: uuid,
  roleDescription: shortText(1000).min(1),
  contributionDescription: shortText(5000).min(1),
  attributionShare: z.number().int().min(1).max(100)
});
const referenceInput = z.object({
  projectId: uuid.nullable().optional(),
  issueId: uuid.nullable().optional(),
  taskId: uuid.nullable().optional(),
  productId: uuid.nullable().optional()
});
const evidenceInput = z.object({
  sourceType: z.enum(['url', 'description', 'project', 'issue', 'task', 'product']),
  url: z.string().url().max(2000).nullable().optional(),
  description: shortText(2000).min(1),
  participantId: uuid.nullable().optional(),
  projectId: uuid.nullable().optional(),
  issueId: uuid.nullable().optional(),
  taskId: uuid.nullable().optional(),
  productId: uuid.nullable().optional()
});
const submissionInput = z.object({
  idempotencyKey: z.string().min(8).max(128),
  categoryKey: z.string().min(2).max(64),
  title: shortText(200).min(1),
  description: shortText(10000).min(1),
  outcome: shortText(5000).default(''),
  expectedImpact: shortText(5000).default(''),
  ...referenceInput.shape,
  participants: z.array(participantInput).min(1).max(20),
  evidence: z.array(evidenceInput).min(1).max(50)
});
const editInput = submissionInput.omit({ idempotencyKey: true, categoryKey: true }).partial().extend({
  categoryKey: z.string().min(2).max(64).optional()
});
const reviewInput = z.object({
  decision: z.enum(['revision_requested', 'approved', 'rejected']),
  notes: shortText(5000).min(1),
  scores: z
    .array(
      z.object({
        userId: uuid,
        ratings: ratingSchema,
        explanation: shortText(5000).min(1)
      })
    )
    .max(20)
    .optional()
});
const disputeInput = z.object({ reason: shortText(5000).min(1) });
const resolutionInput = z.object({
  decision: z.enum(['approved', 'revision_requested', 'rejected']),
  notes: shortText(5000).min(1),
  scores: reviewInput.shape.scores
});
const categoriesInput = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9-]{1,63}$/),
  name: shortText(120).min(1),
  description: shortText(1000).default(''),
  applicableDimensions: z.array(dimensionSchema).min(1).max(CONTRIBUTION_DIMENSIONS.length)
});
const rubricInput = z.object({
  version: z.string().trim().regex(/^[a-z0-9][a-z0-9.-]{1,63}$/),
  weights: z.object({
    impact: z.number().finite().min(0).max(100),
    quality: z.number().finite().min(0).max(100),
    complexity: z.number().finite().min(0).max(100),
    collaboration: z.number().finite().min(0).max(100),
    effort: z.number().finite().min(0).max(100)
  })
});
const listQuery = z.object({
  status: z.enum(['draft', 'submitted', 'revision_requested', 'approved', 'rejected', 'disputed']).optional(),
  category: z.string().optional(),
  days: z.coerce.number().int().min(1).max(365).default(90),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0)
});
const managementQuery = listQuery.extend({
  userId: uuid.optional(),
  projectId: uuid.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional()
});

type ContributionRecord = Selectable<ContributionsTable>;
type ContributionRow = ContributionRecord & {
  category_name: string;
  category_description: string;
  applicable_dimensions: string[];
  category_active: boolean;
};
type ParticipantRow = { contribution_id: string; user_id: string | null; name: string | null; role_description: string; contribution_description: string; attribution_share: number };
type EvidenceRow = Selectable<ContributionEvidenceTable>;
type ReviewRow = { id: string; contribution_id: string; actor_id: string | null; actor_name: string | null; decision: string; from_status: ContributionStatus | null; to_status: ContributionStatus; notes: string; created_at: Date };
type ScoreRow = {
  contribution_id: string;
  user_id: string | null;
  version: number;
  ratings: Record<string, number | null>;
  breakdown: Record<string, number | null>;
  raw_score: number;
  awarded_xp: number;
};

async function assertContributionScoringEnabled(trx: Db, workspaceId: string) {
  const { n } = await trx
    .selectFrom('memberships')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirstOrThrow();
  if (!isContributionScoringEnabled(n)) {
    throw conflict('Contribution scoring requires more than two workspace members; smaller workspaces use XP as a consistency tracker.');
  }
}

function categoryFromRow(row: ContributionRow): ContributionCategory {
  return {
    key: row.category_key,
    name: row.category_name,
    description: row.category_description,
    applicableDimensions: row.applicable_dimensions as ContributionDimension[],
    active: row.category_active
  };
}

async function loadMany(dbOrTrx: Db, rows: ContributionRow[]): Promise<Contribution[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [participants, evidence, reviews, scores] = await Promise.all([
    dbOrTrx
      .selectFrom('contribution_participants as p')
      .leftJoin('users as u', 'u.id', 'p.user_id')
      .select(['p.contribution_id', 'p.user_id', 'u.name', 'p.role_description', 'p.contribution_description', 'p.attribution_share'])
      .where('p.contribution_id', 'in', ids)
      .execute() as Promise<ParticipantRow[]>,
    dbOrTrx.selectFrom('contribution_evidence').selectAll().where('contribution_id', 'in', ids).where('removed_at', 'is', null).orderBy('created_at').execute() as Promise<EvidenceRow[]>,
    dbOrTrx
      .selectFrom('contribution_reviews as r')
      .leftJoin('users as u', 'u.id', 'r.actor_id')
      .select(['r.id', 'r.contribution_id', 'r.actor_id', 'u.name as actor_name', 'r.decision', 'r.from_status', 'r.to_status', 'r.notes', 'r.created_at'])
      .where('r.contribution_id', 'in', ids)
      .orderBy('r.created_at')
      .execute() as Promise<ReviewRow[]>,
    dbOrTrx.selectFrom('contribution_scores').selectAll().where('contribution_id', 'in', ids).orderBy('version', 'desc').execute() as Promise<ScoreRow[]>
  ]);
  const byContribution = <T extends { contribution_id: string }>(items: T[]) => {
    const map = new Map<string, T[]>();
    for (const item of items) map.set(item.contribution_id, [...(map.get(item.contribution_id) ?? []), item]);
    return map;
  };
  const participantsById = byContribution(participants);
  const evidenceById = byContribution(evidence);
  const reviewsById = byContribution(reviews);
  const scoresById = byContribution(scores);

  return rows.map((row) => {
    const latestScores = new Map<string, ScoreRow>();
    for (const score of scoresById.get(row.id) ?? []) {
      if (score.user_id && !latestScores.has(score.user_id)) latestScores.set(score.user_id, score);
    }
    const contributionParticipants: ContributionParticipant[] = (participantsById.get(row.id) ?? []).map((p) => {
      const score = p.user_id ? latestScores.get(p.user_id) : undefined;
      return {
        userId: p.user_id,
        name: p.name,
        roleDescription: p.role_description,
        contributionDescription: p.contribution_description,
        attributionShare: p.attribution_share,
        score: score?.raw_score ?? null,
        awardedXp: score?.awarded_xp ?? null,
        ratings: (score?.ratings as ContributionParticipant['ratings']) ?? null,
        breakdown: (score?.breakdown as ContributionParticipant['breakdown']) ?? null
      };
    });
    const contributionEvidence: ContributionEvidence[] = (evidenceById.get(row.id) ?? []).map((e) => ({
      id: e.id,
      sourceType: e.source_type,
      url: e.url,
      description: e.description,
      projectId: e.project_id,
      issueId: e.issue_id,
      taskId: e.task_id,
      productId: e.product_id,
      participantId: e.participant_id,
      verifiedBy: e.verified_by,
      verifiedAt: e.verified_at?.toISOString() ?? null
    }));
    const contributionReviews: ContributionReview[] = (reviewsById.get(row.id) ?? []).map((r) => ({
      id: r.id,
      reviewerId: r.actor_id,
      reviewerName: r.actor_name,
      decision: r.decision,
      fromStatus: r.from_status,
      toStatus: r.to_status,
      notes: r.notes,
      createdAt: r.created_at.toISOString()
    }));
    return {
      id: row.id,
      category: categoryFromRow(row),
      title: row.title,
      description: row.description,
      outcome: row.outcome,
      expectedImpact: row.expected_impact,
      status: row.status,
      projectId: row.project_id,
      issueId: row.issue_id,
      taskId: row.task_id,
      productId: row.product_id,
      submittedBy: row.submitted_by,
      participants: contributionParticipants,
      evidence: contributionEvidence,
      reviews: contributionReviews,
      createdAt: row.created_at.toISOString(),
      submittedAt: row.submitted_at?.toISOString() ?? null,
      updatedAt: row.updated_at.toISOString()
    };
  });
}

async function fetchRows(dbOrTrx: Db, workspaceId: string, ids: string[]): Promise<ContributionRow[]> {
  if (ids.length === 0) return [];
  return (await dbOrTrx
    .selectFrom('contributions as c')
    .innerJoin('contribution_categories as cat', (join) => join.onRef('cat.key', '=', 'c.category_key').onRef('cat.workspace_id', '=', 'c.workspace_id'))
    .select([
      'c.id',
      'c.workspace_id',
      'c.submitted_by',
      'c.idempotency_key',
      'c.category_key',
      'c.title',
      'c.description',
      'c.outcome',
      'c.expected_impact',
      'c.project_id',
      'c.issue_id',
      'c.task_id',
      'c.product_id',
      'c.status',
      'c.disputed_from_status',
      'c.submitted_at',
      'c.created_at',
      'c.updated_at',
      'cat.name as category_name',
      'cat.description as category_description',
      'cat.applicable_dimensions',
      'cat.active as category_active'
    ])
    .whereRef('cat.workspace_id', '=', 'c.workspace_id')
    .where('c.workspace_id', '=', workspaceId)
    .where('c.id', 'in', ids)
    .execute()) as ContributionRow[];
}

async function loadContribution(dbOrTrx: Db, workspaceId: string, id: string): Promise<ContributionRow | undefined> {
  const rows = await fetchRows(dbOrTrx, workspaceId, [id]);
  return rows[0];
}

async function assertReferences(dbOrTrx: Db, workspaceId: string, refs: z.infer<typeof referenceInput>) {
  let projectId = refs.projectId ?? null;
  if (refs.projectId) {
    const project = await dbOrTrx.selectFrom('projects').select('id').where('id', '=', refs.projectId).where('workspace_id', '=', workspaceId).executeTakeFirst();
    if (!project) throw badRequest('Project must belong to this workspace');
  }
  if (refs.issueId) {
    const issue = await dbOrTrx
      .selectFrom('issues as i')
      .innerJoin('projects as p', 'p.id', 'i.project_id')
      .select(['i.id', 'i.project_id'])
      .where('i.id', '=', refs.issueId)
      .where('p.workspace_id', '=', workspaceId)
      .executeTakeFirst();
    if (!issue) throw badRequest('Issue must belong to this workspace');
    if (projectId && projectId !== issue.project_id) throw badRequest('Issue does not belong to the selected project');
    projectId = issue.project_id;
  }
  if (refs.productId) {
    const product = await dbOrTrx.selectFrom('products').select('id').where('id', '=', refs.productId).where('workspace_id', '=', workspaceId).executeTakeFirst();
    if (!product) throw badRequest('Product must belong to this workspace');
  }
  if (refs.taskId) {
    const task = await dbOrTrx
      .selectFrom('tasks as t')
      .innerJoin('products as p', 'p.id', 't.product_id')
      .select(['t.id', 't.product_id'])
      .where('t.id', '=', refs.taskId)
      .where('p.workspace_id', '=', workspaceId)
      .executeTakeFirst();
    if (!task) throw badRequest('Task must belong to this workspace');
    if (refs.productId && refs.productId !== task.product_id) throw badRequest('Task does not belong to the selected product');
  }
  return projectId;
}

async function assertParticipants(dbOrTrx: Db, workspaceId: string, participants: z.infer<typeof participantInput>[], actorId: string) {
  const ids = participants.map((participant) => participant.userId);
  if (new Set(ids).size !== ids.length) throw badRequest('Each contributor can only be listed once');
  if (!ids.includes(actorId)) throw badRequest('The submitter must be listed as a contributor');
  if (participants.reduce((sum, participant) => sum + participant.attributionShare, 0) !== 100) {
    throw badRequest('Contributor attribution shares must total 100');
  }
  const memberships = await dbOrTrx.selectFrom('memberships').select('user_id').where('workspace_id', '=', workspaceId).where('user_id', 'in', ids).execute();
  if (memberships.length !== ids.length) throw badRequest('All contributors must be members of this workspace');
}

async function insertEvidence(dbOrTrx: Db, contributionId: string, workspaceId: string, evidence: z.infer<typeof evidenceInput>[]) {
  for (const item of evidence) {
    if (item.participantId) {
      const participant = await dbOrTrx
        .selectFrom('contribution_participants')
        .select('id')
        .where('contribution_id', '=', contributionId)
        .where('user_id', '=', item.participantId)
        .executeTakeFirst();
      if (!participant) throw badRequest('Evidence contributor must be listed on the contribution');
    }
    const references = {
      projectId: item.projectId ?? null,
      issueId: item.issueId ?? null,
      taskId: item.taskId ?? null,
      productId: item.productId ?? null
    };
    const refCount = Object.values(references).filter(Boolean).length;
    if (item.sourceType === 'url') {
      if (!item.url || !/^https?:\/\//i.test(item.url) || refCount > 0) throw badRequest('URL evidence requires one HTTP or HTTPS URL and no in-product reference');
    } else if (item.sourceType === 'description') {
      if (item.url || refCount > 0) throw badRequest('Description evidence cannot include a separate reference');
    } else {
      const expectedField = `${item.sourceType}Id` as keyof typeof references;
      if (refCount !== 1 || !references[expectedField]) throw badRequest(`${item.sourceType} evidence requires only its matching in-product reference`);
      await assertReferences(dbOrTrx, workspaceId, references);
    }
    await dbOrTrx
      .insertInto('contribution_evidence')
      .values({
        contribution_id: contributionId,
        participant_id: item.participantId ?? null,
        source_type: item.sourceType,
        url: item.sourceType === 'url' ? item.url! : null,
        description: item.description,
        project_id: item.sourceType === 'project' ? item.projectId ?? null : null,
        issue_id: item.sourceType === 'issue' ? item.issueId ?? null : null,
        task_id: item.sourceType === 'task' ? item.taskId ?? null : null,
        product_id: item.sourceType === 'product' ? item.productId ?? null : null
      })
      .execute();
  }
}

async function writeHistory(
  dbOrTrx: Db,
  input: { contributionId: string; workspaceId: string; actorId: string; action: string; before?: unknown; after?: unknown; reason?: string }
) {
  await dbOrTrx
    .insertInto('contribution_history')
    .values({
      contribution_id: input.contributionId,
      workspace_id: input.workspaceId,
      actor_id: input.actorId,
      action: input.action,
      before_data: input.before ? JSON.stringify(input.before) : null,
      after_data: input.after ? JSON.stringify(input.after) : null,
      reason: input.reason ?? ''
    })
    .execute();
}

function canView(actorId: string, isManager: boolean, row: Contribution): boolean {
  return isManager || row.submittedBy === actorId || row.participants.some((participant) => participant.userId === actorId);
}

async function ensureRelatedMembers(dbOrTrx: Db, workspaceId: string, projectId: string | null, categoryKey?: string) {
  if (categoryKey) {
    const category = await dbOrTrx.selectFrom('contribution_categories').select(['key', 'active']).where('key', '=', categoryKey).executeTakeFirst();
    if (!category || !category.active) throw badRequest('Choose an active contribution category');
  }
  if (projectId) {
    const project = await dbOrTrx.selectFrom('projects').select('id').where('id', '=', projectId).where('workspace_id', '=', workspaceId).executeTakeFirst();
    if (!project) throw badRequest('Project must belong to this workspace');
  }
}

function scoresForApproval(contribution: Contribution, submittedScores: z.infer<typeof reviewInput>['scores']) {
  if (!submittedScores || submittedScores.length !== contribution.participants.length) throw badRequest('Provide a score and explanation for every contributor');
  const scoredIds = submittedScores.map((score) => score.userId);
  if (new Set(scoredIds).size !== scoredIds.length || contribution.participants.some((p) => !p.userId || !scoredIds.includes(p.userId))) {
    throw badRequest('Scores must match every listed contributor exactly once');
  }
  return submittedScores;
}

async function recordReview(
  trx: Db,
  actorId: string,
  row: ContributionRecord,
  decision: 'submitted' | 'revision_requested' | 'approved' | 'rejected' | 'disputed' | 'dispute_resolved',
  nextStatus: ContributionStatus,
  notes: string
) {
  const review = await trx.insertInto('contribution_reviews').values({
    contribution_id: row.id,
    actor_id: actorId,
    decision,
    from_status: row.status,
    to_status: nextStatus,
    notes
  }).returning('id').executeTakeFirstOrThrow();
  await trx
    .updateTable('contributions')
    .set({
      status: nextStatus,
      disputed_from_status: nextStatus === 'disputed' ? (row.status === 'approved' ? 'approved' : 'rejected') : null,
      updated_at: new Date()
    })
    .where('id', '=', row.id)
    .execute();
  await writeHistory(trx, {
    contributionId: row.id,
    workspaceId: row.workspace_id,
    actorId,
    action: decision,
    before: { status: row.status },
    after: { status: nextStatus },
    reason: notes
  });
  return review.id;
}

async function persistScores(
  trx: Db,
  actorId: string,
  row: ContributionRecord,
  contribution: Contribution,
  scoreInputs: z.infer<typeof reviewInput>['scores'],
  notes: string
) {
  const submittedScores = scoresForApproval(contribution, scoreInputs);
  const rubric = await trx.selectFrom('contribution_rubrics').selectAll().where('workspace_id', '=', row.workspace_id).where('active', '=', true).executeTakeFirst();
  if (!rubric) throw conflict('No contribution scoring rubric is active');
  const weights = rubric.weights as typeof CONTRIBUTION_WEIGHTS;
  const snapshots = [];
  for (const scoreInput of submittedScores) {
    const participant = contribution.participants.find((p) => p.userId === scoreInput.userId)!;
    let result: ContributionScoreResult;
    try {
      result = calculateContributionScore({
        ratings: scoreInput.ratings,
        applicableDimensions: contribution.category.applicableDimensions,
        attributionShare: participant.attributionShare,
        weights
      });
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : 'Invalid contribution score');
    }
    if (scoreInput.ratings.impact !== null && scoreInput.ratings.impact >= 4) {
      const verifiedEvidence = await trx
        .selectFrom('contribution_evidence')
        .select('id')
        .where('contribution_id', '=', row.id)
        .where('removed_at', 'is', null)
        .where('verified_at', 'is not', null)
        .where((eb) => eb.or([eb('participant_id', 'is', null), eb('participant_id', '=', scoreInput.userId)]))
        .executeTakeFirst();
      if (!verifiedEvidence) throw badRequest('Impact ratings of 4 or 5 require reviewer-verified evidence for that contributor');
    }
    const previous = await trx
      .selectFrom('contribution_scores')
      .select(['id', 'version'])
      .where('contribution_id', '=', row.id)
      .where('user_id', '=', scoreInput.userId)
      .orderBy('version', 'desc')
      .executeTakeFirst();
    const score = await trx
      .insertInto('contribution_scores')
      .values({
        workspace_id: row.workspace_id,
        contribution_id: row.id,
        user_id: scoreInput.userId,
        version: (previous?.version ?? 0) + 1,
        rubric_version: rubric.version,
        ratings: JSON.stringify(scoreInput.ratings),
        breakdown: JSON.stringify(result.breakdown),
        raw_score: result.score,
        attribution_share: participant.attributionShare,
        awarded_xp: result.awardedXp,
        explanation: scoreInput.explanation,
        scored_by: actorId,
        supersedes_score_id: previous?.id ?? null
      })
      .returning(['id', 'awarded_xp', 'user_id'])
      .executeTakeFirstOrThrow();
    const priorTotal = await trx
      .selectFrom('contribution_awards')
      .select(sql<number>`coalesce(sum(points), 0)::int`.as('points'))
      .where('contribution_id', '=', row.id)
      .where('user_id', '=', scoreInput.userId)
      .executeTakeFirstOrThrow();
    const delta = result.awardedXp - priorTotal.points;
    if (delta !== 0) {
      await trx
        .insertInto('contribution_awards')
        .values({
          workspace_id: row.workspace_id,
          contribution_id: row.id,
          user_id: scoreInput.userId,
          score_id: score.id,
          idempotency_key: `score:${score.id}`,
          points: delta,
          explanation: scoreInput.explanation,
          created_by: actorId
        })
        .onConflict((oc) => oc.columns(['workspace_id', 'idempotency_key']).doNothing())
        .execute();
    }
    snapshots.push({ userId: scoreInput.userId, rawScore: result.score, awardedXp: result.awardedXp, breakdown: result.breakdown });
  }
  await writeHistory(trx, {
    contributionId: row.id,
    workspaceId: row.workspace_id,
    actorId,
    action: 'score_recorded',
    after: snapshots,
    reason: notes
  });
}

async function reverseAwards(trx: Db, actorId: string, row: ContributionRecord, reviewId: string, notes: string) {
  const totals = await trx
    .selectFrom('contribution_awards')
    .select(['user_id', sql<number>`coalesce(sum(points), 0)::int`.as('points')])
    .where('contribution_id', '=', row.id)
    .groupBy('user_id')
    .execute();
  for (const total of totals) {
    if (!total.user_id || total.points === 0) continue;
    await trx
      .insertInto('contribution_awards')
      .values({
        workspace_id: row.workspace_id,
        contribution_id: row.id,
        user_id: total.user_id,
        score_id: null,
        idempotency_key: `reversal:${reviewId}:${total.user_id}`,
        points: -total.points,
        explanation: notes,
        created_by: actorId
      })
      .onConflict((oc) => oc.columns(['workspace_id', 'idempotency_key']).doNothing())
      .execute();
  }
}

contributionsRouter.get(
  '/categories',
  route(async (req, res) => {
    const workspaceId = auth(req).workspaceId;
    const rows = await db.selectFrom('contribution_categories').selectAll().where('workspace_id', '=', workspaceId).where('active', '=', true).orderBy('name').execute();
    res.json(rows.map((row) => ({
      key: row.key,
      name: row.name,
      description: row.description,
      applicableDimensions: row.applicable_dimensions as ContributionDimension[],
      active: row.active
    } satisfies ContributionCategory)));
  })
);

contributionsRouter.post(
  '/categories',
  managers,
  route(async (req, res) => {
    const actor = auth(req);
    const body = parse(categoriesInput, req.body);
    const row = await db.transaction().execute(async (trx) => {
      const created = await trx.insertInto('contribution_categories').values({
        workspace_id: actor.workspaceId,
        key: body.key,
        name: body.name,
        description: body.description,
        applicable_dimensions: JSON.stringify(Array.from(new Set(body.applicableDimensions))),
        created_by: actor.userId,
        updated_at: new Date()
      }).returningAll().executeTakeFirstOrThrow();
      await trx.insertInto('contribution_history').values({
        contribution_id: null,
        workspace_id: actor.workspaceId,
        actor_id: actor.userId,
        action: 'category_created',
        before_data: null,
        after_data: JSON.stringify({ key: created.key, name: created.name, description: created.description, applicableDimensions: created.applicable_dimensions }),
        reason: 'Workspace contribution category created'
      }).execute();
      return created;
    });
    res.status(201).json({
      key: row.key,
      name: row.name,
      description: row.description,
      applicableDimensions: row.applicable_dimensions as ContributionDimension[],
      active: row.active
    } satisfies ContributionCategory);
  })
);

contributionsRouter.patch(
  '/categories/:key',
  managers,
  route(async (req, res) => {
    const key = param(req, 'key');
    const body = parse(categoriesInput.omit({ key: true }).partial().extend({ active: z.boolean().optional() }), req.body);
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.name !== undefined) update.name = body.name;
    if (body.description !== undefined) update.description = body.description;
    if (body.applicableDimensions !== undefined) update.applicable_dimensions = JSON.stringify(Array.from(new Set(body.applicableDimensions)));
    if (body.active !== undefined) update.active = body.active;
    const actor = auth(req);
    const row = await db.transaction().execute(async (trx) => {
      const before = await trx.selectFrom('contribution_categories').selectAll()
        .where('workspace_id', '=', actor.workspaceId).where('key', '=', key).forUpdate().executeTakeFirst();
      if (!before) throw notFound('Contribution category');
      const updated = await trx.updateTable('contribution_categories').set(update)
        .where('workspace_id', '=', actor.workspaceId).where('key', '=', key).returningAll().executeTakeFirstOrThrow();
      await trx.insertInto('contribution_history').values({
        contribution_id: null,
        workspace_id: actor.workspaceId,
        actor_id: actor.userId,
        action: 'category_updated',
        before_data: JSON.stringify({ name: before.name, description: before.description, applicableDimensions: before.applicable_dimensions, active: before.active }),
        after_data: JSON.stringify({ name: updated.name, description: updated.description, applicableDimensions: updated.applicable_dimensions, active: updated.active }),
        reason: 'Workspace contribution category updated'
      }).execute();
      return updated;
    });
    res.json({
      key: row.key,
      name: row.name,
      description: row.description,
      applicableDimensions: row.applicable_dimensions as ContributionDimension[],
      active: row.active
    } satisfies ContributionCategory);
  })
);

contributionsRouter.get(
  '/rubric',
  route(async (req, res) => {
    const row = await db.selectFrom('contribution_rubrics').selectAll().where('workspace_id', '=', auth(req).workspaceId).where('active', '=', true).executeTakeFirst();
    if (!row) throw conflict('No contribution scoring rubric is active');
    const rubric: ContributionRubricConfig = {
      version: row.version,
      weights: row.weights as ContributionRubricConfig['weights'],
      conversion: row.conversion,
      scale: {
        impact: ['No demonstrated outcome', 'Very limited', 'Limited', 'Meaningful', 'High', 'Exceptional, evidenced value'],
        quality: ['Not accepted', 'Major defects', 'Substantial rework', 'Meets core needs', 'Strong and reliable', 'Exceptional and durable'],
        complexity: ['Routine', 'Straightforward', 'Some uncertainty', 'Several dependencies', 'High uncertainty', 'Novel or unusually difficult'],
        collaboration: ['No evidenced collaboration', 'Limited handoff', 'Helpful coordination', 'Useful support', 'Unblocked or enabled others', 'Broad, sustained knowledge sharing'],
        effort: ['Minimal scope', 'Small', 'Moderate', 'Substantial', 'Large and sustained', 'Exceptional scope (not hours alone)']
      }
    };
    res.json(rubric);
  })
);

contributionsRouter.post(
  '/rubric',
  managers,
  route(async (req, res) => {
    const actor = auth(req);
    const body = parse(rubricInput, req.body);
    const total = Object.values(body.weights).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(total - 100) > 0.0001) throw badRequest('Rubric weights must total 100');
    const rubric = await db.transaction().execute(async (trx) => {
      const active = await trx.selectFrom('contribution_rubrics').select('version').where('workspace_id', '=', actor.workspaceId).where('active', '=', true).forUpdate().executeTakeFirst();
      await trx.updateTable('contribution_rubrics').set({ active: false }).where('workspace_id', '=', actor.workspaceId).where('active', '=', true).execute();
      const row = await trx.insertInto('contribution_rubrics').values({
        workspace_id: actor.workspaceId,
        version: body.version,
        weights: JSON.stringify(body.weights),
        conversion: 'one_point_per_score_point',
        active: true,
        created_by: actor.userId,
        activated_by: actor.userId,
        activated_at: new Date()
      }).returningAll().executeTakeFirstOrThrow();
      await trx.insertInto('contribution_history').values({
        contribution_id: null,
        workspace_id: actor.workspaceId,
        actor_id: actor.userId,
        action: 'rubric_activated',
        before_data: active ? JSON.stringify({ version: active.version }) : null,
        after_data: JSON.stringify({ version: row.version, weights: body.weights }),
        reason: 'Workspace rubric configuration activated'
      }).execute();
      return row;
    });
    res.status(201).json({ version: rubric.version, weights: rubric.weights, conversion: rubric.conversion });
  })
);

contributionsRouter.get(
  '/summary',
  route(async (req, res) => {
    const actor = auth(req);
    const query = parse(listQuery.pick({ days: true }), req.query);
    const since = new Date(Date.now() - query.days * 86400_000);
    const activeStates = ['approved', 'disputed'] as const;
    const [totals, counts, categories, trends] = await Promise.all([
      db.selectFrom('contribution_awards as a')
        .innerJoin('contributions as c', 'c.id', 'a.contribution_id')
        .select(sql<number>`coalesce(sum(a.points), 0)::int`.as('xp'))
        .where('a.workspace_id', '=', actor.workspaceId)
        .where('a.user_id', '=', actor.userId)
        .where('c.status', 'in', activeStates)
        .where((eb) => eb.or([eb('c.status', '=', 'approved'), eb.and([eb('c.status', '=', 'disputed'), eb('c.disputed_from_status', '=', 'approved')])]))
        .executeTakeFirstOrThrow(),
      db.selectFrom('contributions as c')
        .innerJoin('contribution_participants as p', 'p.contribution_id', 'c.id')
        .select([
          sql<number>`count(distinct c.id) filter (where c.status = 'approved')::int`.as('approved'),
          sql<number>`count(distinct c.id) filter (where c.status in ('submitted', 'revision_requested', 'disputed'))::int`.as('pending')
        ])
        .where('c.workspace_id', '=', actor.workspaceId)
        .where('p.user_id', '=', actor.userId)
        .executeTakeFirstOrThrow(),
      db.selectFrom('contribution_awards as a')
        .innerJoin('contributions as c', 'c.id', 'a.contribution_id')
        .innerJoin('contribution_categories as cat', (join) => join.onRef('cat.key', '=', 'c.category_key').onRef('cat.workspace_id', '=', 'c.workspace_id'))
        .select(['cat.key', 'cat.name', sql<number>`coalesce(sum(a.points), 0)::int`.as('xp'), sql<number>`count(distinct c.id)::int`.as('count')])
        .where('a.workspace_id', '=', actor.workspaceId)
        .where('a.user_id', '=', actor.userId)
        .where('c.status', '=', 'approved')
        .groupBy(['cat.key', 'cat.name'])
        .orderBy('cat.name')
        .execute(),
      db.selectFrom('contribution_awards as a')
        .innerJoin('contributions as c', 'c.id', 'a.contribution_id')
        .select([sql<string>`to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD')`.as('date'), sql<number>`sum(a.points)::int`.as('xp')])
        .where('a.workspace_id', '=', actor.workspaceId)
        .where('a.user_id', '=', actor.userId)
        .where('c.status', '=', 'approved')
        .where('a.created_at', '>=', since)
        .groupBy(sql`to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD')`)
        .execute()
    ]);
    const summary: ContributionSummary = {
      approvedXp: totals.xp,
      approvedCount: counts.approved,
      pendingCount: counts.pending,
      byCategory: categories.map((item) => ({ key: item.key, name: item.name, xp: item.xp, count: item.count })),
      trend: trends.map((item) => ({ date: item.date, xp: item.xp }))
    };
    res.json(summary);
  })
);

contributionsRouter.get(
  '/management',
  managers,
  route(async (req, res) => {
    const actor = auth(req);
    const query = parse(managementQuery, req.query);
    let rowsQuery = db
      .selectFrom('contributions as c')
      .innerJoin('contribution_participants as cp', 'cp.contribution_id', 'c.id')
      .innerJoin('users as u', 'u.id', 'cp.user_id')
      .innerJoin('contribution_categories as cat', (join) => join.onRef('cat.key', '=', 'c.category_key').onRef('cat.workspace_id', '=', 'c.workspace_id'))
      .select(['c.id', 'c.title', 'c.status', 'c.project_id', 'c.created_at', 'cp.user_id', 'u.name', 'cat.key as category_key', 'cat.name as category_name'])
      .where('c.workspace_id', '=', actor.workspaceId);
    if (query.userId) rowsQuery = rowsQuery.where('cp.user_id', '=', query.userId);
    if (query.projectId) rowsQuery = rowsQuery.where('c.project_id', '=', query.projectId);
    if (query.category) rowsQuery = rowsQuery.where('cat.key', '=', query.category);
    if (query.status) rowsQuery = rowsQuery.where('c.status', '=', query.status);
    if (query.from) rowsQuery = rowsQuery.where('c.created_at', '>=', new Date(`${query.from}T00:00:00.000Z`));
    if (query.to) rowsQuery = rowsQuery.where('c.created_at', '<', new Date(new Date(`${query.to}T00:00:00.000Z`).getTime() + 86400_000));
    const rows = await rowsQuery.orderBy('c.created_at', 'desc').limit(query.limit).offset(query.offset).execute();
    const contributionRows = await fetchRows(db, actor.workspaceId, Array.from(new Set(rows.map((row) => row.id))));
    res.json(await loadMany(db, contributionRows));
  })
);

contributionsRouter.get(
  '/',
  route(async (req, res) => {
    const actor = auth(req);
    const query = parse(listQuery, req.query);
    let rowsQuery = db
      .selectFrom('contributions as c')
      .innerJoin('contribution_participants as cp', 'cp.contribution_id', 'c.id')
      .innerJoin('contribution_categories as cat', (join) => join.onRef('cat.key', '=', 'c.category_key').onRef('cat.workspace_id', '=', 'c.workspace_id'))
      .select(['c.id', 'c.created_at'])
      .where('c.workspace_id', '=', actor.workspaceId)
      .where((eb) => eb.or([eb('c.submitted_by', '=', actor.userId), eb('cp.user_id', '=', actor.userId)]));
    if (query.status) rowsQuery = rowsQuery.where('c.status', '=', query.status);
    if (query.category) rowsQuery = rowsQuery.where('cat.key', '=', query.category);
    const rows = await rowsQuery.distinct().orderBy('c.created_at', 'desc').limit(query.limit).offset(query.offset).execute();
    const contributions = await loadMany(db, await fetchRows(db, actor.workspaceId, rows.map((row) => row.id)));
    res.json(contributions);
  })
);

contributionsRouter.post(
  '/',
  route(async (req, res) => {
    const actor = auth(req);
    const body = parse(submissionInput, req.body);
    const result = await db.transaction().execute(async (trx) => {
      await trx.selectFrom('workspaces').select('id').where('id', '=', actor.workspaceId).forUpdate().executeTakeFirstOrThrow();
      const prior = await trx.selectFrom('contributions').select('id').where('workspace_id', '=', actor.workspaceId)
        .where('submitted_by', '=', actor.userId).where('idempotency_key', '=', body.idempotencyKey).executeTakeFirst();
      if (prior) return { id: prior.id, created: false };
      await assertContributionScoringEnabled(trx, actor.workspaceId);
      await assertParticipants(trx, actor.workspaceId, body.participants, actor.userId);
      const projectId = await assertReferences(trx, actor.workspaceId, body);
      await ensureRelatedMembers(trx, actor.workspaceId, projectId, body.categoryKey);
      const titleNormalized = body.title.trim().toLowerCase();
      const duplicate = await trx.selectFrom('contributions')
        .select('id')
        .where('workspace_id', '=', actor.workspaceId)
        .where('category_key', '=', body.categoryKey)
        .where(sql<boolean>`lower(title) = ${titleNormalized}`)
        .where('status', 'in', ['draft', 'submitted', 'revision_requested', 'approved', 'disputed'])
        .where((eb) => {
          if (body.issueId) return eb('issue_id', '=', body.issueId);
          if (body.taskId) return eb('task_id', '=', body.taskId);
          if (body.productId) return eb('product_id', '=', body.productId);
          if (body.projectId) return eb('project_id', '=', body.projectId);
          return eb('id', 'is not', null);
        })
        .executeTakeFirst();
      if (duplicate) throw conflict(`A similar contribution already exists (${duplicate.id}); revise it or clarify the distinct outcome`);
      const inserted = await trx.insertInto('contributions').values({
        workspace_id: actor.workspaceId,
        submitted_by: actor.userId,
        idempotency_key: body.idempotencyKey,
        category_key: body.categoryKey,
        title: body.title,
        description: body.description,
        outcome: body.outcome,
        expected_impact: body.expectedImpact,
        project_id: projectId,
        issue_id: body.issueId ?? null,
        task_id: body.taskId ?? null,
        product_id: body.productId ?? null
      }).returning('id').executeTakeFirstOrThrow();
      await trx.insertInto('contribution_participants').values(body.participants.map((p) => ({
        contribution_id: inserted.id,
        user_id: p.userId,
        role_description: p.roleDescription,
        contribution_description: p.contributionDescription,
        attribution_share: p.attributionShare
      }))).execute();
      await insertEvidence(trx, inserted.id, actor.workspaceId, body.evidence);
      await writeHistory(trx, {
        contributionId: inserted.id,
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        action: 'created',
        after: { title: body.title, categoryKey: body.categoryKey, status: 'draft' }
      });
      return { id: inserted.id, created: true };
    });
    const row = await loadContribution(db, actor.workspaceId, result.id);
    if (!row) throw notFound('Contribution');
    const [contribution] = await loadMany(db, [row]);
    res.status(result.created ? 201 : 200).json(contribution);
  })
);

contributionsRouter.get(
  '/:id',
  route(async (req, res) => {
    const actor = auth(req);
    const id = parse(uuid, param(req, 'id'));
    const row = await loadContribution(db, actor.workspaceId, id);
    if (!row) throw notFound('Contribution');
    const [contribution] = await loadMany(db, [row]);
    const manager = actor.role === 'owner' || actor.role === 'admin';
    if (!canView(actor.userId, manager, contribution)) throw forbidden();
    res.json(contribution);
  })
);

contributionsRouter.post(
  '/:id/evidence/:evidenceId/verify',
  managers,
  route(async (req, res) => {
    const actor = auth(req);
    const id = parse(uuid, param(req, 'id'));
    const evidenceId = parse(uuid, param(req, 'evidenceId'));
    await db.transaction().execute(async (trx) => {
      const contribution = await trx
        .selectFrom('contributions')
        .selectAll()
        .where('id', '=', id)
        .where('workspace_id', '=', actor.workspaceId)
        .forUpdate()
        .executeTakeFirst();
      if (!contribution) throw notFound('Contribution');
      if (['approved', 'rejected'].includes(contribution.status)) throw conflict('Evidence cannot be changed after a final decision; request a correction instead');
      const evidence = await trx.selectFrom('contribution_evidence').selectAll()
        .where('id', '=', evidenceId).where('contribution_id', '=', id).where('removed_at', 'is', null).forUpdate().executeTakeFirst();
      if (!evidence) throw notFound('Contribution evidence');
      if (evidence.verified_at) throw conflict('Evidence has already been verified');
      const isParticipant = await trx.selectFrom('contribution_participants').select('id')
        .where('contribution_id', '=', id).where('user_id', '=', actor.userId).executeTakeFirst();
      if (isParticipant) throw forbidden('Contributors cannot verify evidence for their own contribution');
      await trx.updateTable('contribution_evidence')
        .set({ verified_by: actor.userId, verified_at: new Date() })
        .where('id', '=', evidenceId)
        .execute();
      await writeHistory(trx, {
        contributionId: id,
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        action: 'evidence_verified',
        before: { evidenceId, verifiedBy: evidence.verified_by, verifiedAt: null },
        after: { evidenceId, verifiedBy: actor.userId, verifiedAt: new Date().toISOString() }
      });
    });
    const row = await loadContribution(db, actor.workspaceId, id);
    if (!row) throw notFound('Contribution');
    const [contribution] = await loadMany(db, [row]);
    res.json(contribution);
  })
);

contributionsRouter.patch(
  '/:id',
  route(async (req, res) => {
    const actor = auth(req);
    const id = parse(uuid, param(req, 'id'));
    const body = parse(editInput, req.body);
    const row = await db.transaction().execute(async (trx) => {
      const current = await trx.selectFrom('contributions').selectAll().where('id', '=', id).where('workspace_id', '=', actor.workspaceId).forUpdate().executeTakeFirst();
      if (!current) throw notFound('Contribution');
      if (current.submitted_by !== actor.userId) throw forbidden('Only the submitter can revise this contribution');
      if (!['draft', 'revision_requested'].includes(current.status)) throw conflict('Only drafts and requested revisions can be edited');
      const beforeParticipants = await trx.selectFrom('contribution_participants').selectAll().where('contribution_id', '=', id).orderBy('created_at').execute();
      const beforeEvidence = await trx.selectFrom('contribution_evidence').selectAll().where('contribution_id', '=', id).where('removed_at', 'is', null).orderBy('created_at').execute();
      if (body.participants) await assertParticipants(trx, actor.workspaceId, body.participants, actor.userId);
      const refs = {
        projectId: body.projectId === undefined ? current.project_id : body.projectId,
        issueId: body.issueId === undefined ? current.issue_id : body.issueId,
        taskId: body.taskId === undefined ? current.task_id : body.taskId,
        productId: body.productId === undefined ? current.product_id : body.productId
      };
      const projectId = await assertReferences(trx, actor.workspaceId, refs);
      await ensureRelatedMembers(trx, actor.workspaceId, projectId, body.categoryKey ?? current.category_key);
      await trx.updateTable('contributions').set({
        title: body.title ?? current.title,
        description: body.description ?? current.description,
        outcome: body.outcome ?? current.outcome,
        expected_impact: body.expectedImpact ?? current.expected_impact,
        category_key: body.categoryKey ?? current.category_key,
        project_id: projectId,
        issue_id: refs.issueId,
        task_id: refs.taskId,
        product_id: refs.productId,
        updated_at: new Date()
      }).where('id', '=', id).execute();
      if (body.participants) {
        await trx.deleteFrom('contribution_participants').where('contribution_id', '=', id).execute();
        await trx.insertInto('contribution_participants').values(body.participants.map((p) => ({
          contribution_id: id,
          user_id: p.userId,
          role_description: p.roleDescription,
          contribution_description: p.contributionDescription,
          attribution_share: p.attributionShare
        }))).execute();
      }
      if (body.evidence) {
        await trx.updateTable('contribution_evidence').set({ removed_at: new Date() })
          .where('contribution_id', '=', id).where('removed_at', 'is', null).execute();
        await insertEvidence(trx, id, actor.workspaceId, body.evidence);
      }
      const afterParticipants = await trx.selectFrom('contribution_participants').selectAll().where('contribution_id', '=', id).orderBy('created_at').execute();
      const afterEvidence = await trx.selectFrom('contribution_evidence').selectAll().where('contribution_id', '=', id).where('removed_at', 'is', null).orderBy('created_at').execute();
      await writeHistory(trx, {
        contributionId: id,
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        action: 'edited',
        before: {
          title: current.title,
          description: current.description,
          outcome: current.outcome,
          expectedImpact: current.expected_impact,
          categoryKey: current.category_key,
          projectId: current.project_id,
          issueId: current.issue_id,
          taskId: current.task_id,
          productId: current.product_id,
          participants: beforeParticipants,
          evidence: beforeEvidence
        },
        after: {
          title: body.title ?? current.title,
          description: body.description ?? current.description,
          outcome: body.outcome ?? current.outcome,
          expectedImpact: body.expectedImpact ?? current.expected_impact,
          categoryKey: body.categoryKey ?? current.category_key,
          projectId,
          issueId: refs.issueId,
          taskId: refs.taskId,
          productId: refs.productId,
          participants: afterParticipants,
          evidence: afterEvidence
        }
      });
      return current;
    });
    const updated = await loadContribution(db, actor.workspaceId, row.id);
    if (!updated) throw notFound('Contribution');
    const [contribution] = await loadMany(db, [updated]);
    res.json(contribution);
  })
);

contributionsRouter.post(
  '/:id/submit',
  route(async (req, res) => {
    const actor = auth(req);
    const id = parse(uuid, param(req, 'id'));
    const contribution = await db.transaction().execute(async (trx) => {
      const row = await trx.selectFrom('contributions').selectAll().where('id', '=', id).where('workspace_id', '=', actor.workspaceId).forUpdate().executeTakeFirst();
      if (!row) throw notFound('Contribution');
      if (row.submitted_by !== actor.userId) throw forbidden();
      if (row.status !== 'draft' && row.status !== 'revision_requested') throw conflict('Only drafts or requested revisions can be submitted');
      await assertContributionScoringEnabled(trx, actor.workspaceId);
      const evidence = await trx.selectFrom('contribution_evidence').select('id').where('contribution_id', '=', id).where('removed_at', 'is', null).execute();
      const participants = await trx.selectFrom('contribution_participants').select(['user_id', 'attribution_share']).where('contribution_id', '=', id).execute();
      if (evidence.length === 0) throw badRequest('Add at least one evidence reference before submitting');
      if (participants.length === 0 || participants.some((p) => !p.user_id) || participants.reduce((n, p) => n + p.attribution_share, 0) !== 100) {
        throw badRequest('Confirm contributor attribution before submitting');
      }
      const full = await loadContribution(trx, actor.workspaceId, id);
      const [loaded] = await loadMany(trx, full ? [full] : []);
      if (!loaded?.category.active) throw badRequest('This contribution category is no longer active');
      await trx.updateTable('contributions').set({ status: 'submitted', submitted_at: new Date(), updated_at: new Date() }).where('id', '=', id).execute();
      await trx.insertInto('contribution_reviews').values({
        contribution_id: id,
        actor_id: actor.userId,
        decision: 'submitted',
        from_status: row.status,
        to_status: 'submitted',
        notes: ''
      }).execute();
      await writeHistory(trx, { contributionId: id, workspaceId: actor.workspaceId, actorId: actor.userId, action: 'submitted', before: { status: row.status }, after: { status: 'submitted' } });
      return id;
    });
    const refreshed = await loadContribution(db, actor.workspaceId, contribution);
    if (!refreshed) throw notFound('Contribution');
    const [result] = await loadMany(db, [refreshed]);
    res.json(result);
  })
);

contributionsRouter.post(
  '/:id/review',
  managers,
  route(async (req, res) => {
    const actor = auth(req);
    const id = parse(uuid, param(req, 'id'));
    const body = parse(reviewInput, req.body);
    const result = await db.transaction().execute(async (trx) => {
      const row = await trx.selectFrom('contributions').selectAll().where('id', '=', id).where('workspace_id', '=', actor.workspaceId).forUpdate().executeTakeFirst();
      if (!row) throw notFound('Contribution');
      if (row.status !== 'submitted') throw conflict('Only submitted contributions can be reviewed');
      const full = await loadContribution(trx, actor.workspaceId, id);
      const [contribution] = await loadMany(trx, full ? [full] : []);
      if (!contribution) throw notFound('Contribution');
      if (contribution.participants.some((participant) => participant.userId === actor.userId)) throw forbidden('Contributors cannot review their own contribution');
      const nextStatus: ContributionStatus = body.decision;
      if (body.decision === 'approved') {
        await assertContributionScoringEnabled(trx, actor.workspaceId);
        await persistScores(trx, actor.userId, row, contribution, body.scores, body.notes);
      }
      await recordReview(trx, actor.userId, row, body.decision, nextStatus, body.notes);
      return id;
    });
    const updated = await loadContribution(db, actor.workspaceId, result);
    if (!updated) throw notFound('Contribution');
    const [contribution] = await loadMany(db, [updated]);
    res.json(contribution);
  })
);

contributionsRouter.post(
  '/:id/dispute',
  route(async (req, res) => {
    const actor = auth(req);
    const id = parse(uuid, param(req, 'id'));
    const { reason } = parse(disputeInput, req.body);
    await db.transaction().execute(async (trx) => {
      const row = await trx.selectFrom('contributions').selectAll().where('id', '=', id).where('workspace_id', '=', actor.workspaceId).forUpdate().executeTakeFirst();
      if (!row) throw notFound('Contribution');
      if (!['approved', 'rejected'].includes(row.status)) throw conflict('Only an approved or rejected contribution can be disputed');
      const member = await trx.selectFrom('contribution_participants').select('user_id').where('contribution_id', '=', id).where('user_id', '=', actor.userId).executeTakeFirst();
      if (row.submitted_by !== actor.userId && !member) throw forbidden();
      await recordReview(trx, actor.userId, row, 'disputed', 'disputed', reason);
    });
    const row = await loadContribution(db, actor.workspaceId, id);
    if (!row) throw notFound('Contribution');
    const [contribution] = await loadMany(db, [row]);
    res.json(contribution);
  })
);

contributionsRouter.post(
  '/:id/resolve',
  managers,
  route(async (req, res) => {
    const actor = auth(req);
    const id = parse(uuid, param(req, 'id'));
    const body = parse(resolutionInput, req.body);
    await db.transaction().execute(async (trx) => {
      const row = await trx.selectFrom('contributions').selectAll().where('id', '=', id).where('workspace_id', '=', actor.workspaceId).forUpdate().executeTakeFirst();
      if (!row) throw notFound('Contribution');
      if (row.status !== 'disputed') throw conflict('Only disputed contributions can be resolved');
      const previousDecision = await trx.selectFrom('contribution_reviews').select('actor_id')
        .where('contribution_id', '=', id).where('decision', 'in', ['approved', 'rejected', 'dispute_resolved']).orderBy('created_at', 'desc').executeTakeFirst();
      if (previousDecision?.actor_id === actor.userId) throw forbidden('A different reviewer must resolve this dispute');
      const full = await loadContribution(trx, actor.workspaceId, id);
      const [contribution] = await loadMany(trx, full ? [full] : []);
      if (!contribution) throw notFound('Contribution');
      if (contribution.participants.some((participant) => participant.userId === actor.userId)) throw forbidden('Contributors cannot resolve their own dispute');
      if (body.decision === 'approved') {
        await assertContributionScoringEnabled(trx, actor.workspaceId);
        await persistScores(trx, actor.userId, row, contribution, body.scores, body.notes);
      }
      const reviewId = await recordReview(trx, actor.userId, row, 'dispute_resolved', body.decision, body.notes);
      if (body.decision !== 'approved' && row.disputed_from_status === 'approved') await reverseAwards(trx, actor.userId, row, reviewId, body.notes);
    });
    const row = await loadContribution(db, actor.workspaceId, id);
    if (!row) throw notFound('Contribution');
    const [contribution] = await loadMany(db, [row]);
    res.json(contribution);
  })
);
