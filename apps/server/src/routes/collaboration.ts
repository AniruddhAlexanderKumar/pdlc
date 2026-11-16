import { Router } from 'express';
import { z } from 'zod';
import {
  ACTIVITY_STATUSES,
  buildJourney,
  blockersFor,
  indexActivityStages,
  recommendNextActions,
  requiresApproval,
  type ActivityStatus,
  type StageId
} from '@sv/shared';
import { auth } from '../auth/session.js';
import { db } from '../db/index.js';
import { badRequest, conflict, forbidden, notFound, parse, route, uuid } from '../lib/http.js';
import { recordAnalyticsEvent } from '../services/analytics.js';
import {
  isWorkspaceMember,
  loadCollaboration,
  teamContribution,
  upsertRecord
} from '../services/collaboration.js';
import { loadMaterials, loadProduct } from '../services/repo.js';
import { notify, loadPreferences, savePreferences } from '../services/notifications.js';
import { mutate, param } from './util.js';
import { XpLedger } from '../services/xp.js';

/**
 * Activity collaboration endpoints.
 *
 * Two invariants this file exists to protect:
 *  1. Permissions are enforced here, not in the client. Only owners and admins
 *     may review, reassign, or set an activity to completed on someone's behalf.
 *  2. Completion stays `stageQuest()`'s business. Nothing here writes a
 *     completion flag that could disagree with it; approval state only gates
 *     whether a stage may advance.
 */
export const collaborationRouter = Router();

/** Rebuilds the journey with collaboration data so routes can validate keys. */
async function journeyFor(trx: Parameters<typeof loadCollaboration>[0], workspaceId: string, productId: string) {
  const [product, collab] = await Promise.all([
    loadProduct(trx, workspaceId, productId),
    loadCollaboration(trx, productId)
  ]);
  const materials = new Map(
    (await loadMaterials(trx, workspaceId, product.materials.map((m) => m.materialId))).map((m) => [m.id, m])
  );
  // Blockers are resolved through the same pure helper the recommendations use,
  // so a blocked activity is blocked everywhere or nowhere.
  const journey = buildJourney(product, {
    materials,
    collaboration: {
      records: collab.records,
      commentCounts: collab.commentCounts,
      blockersFor: (key, all, records) =>
        blockersFor(key, collab.dependencies, all, records)
    }
  });
  return { product, journey, collab, materials };
}

function assertActivity(journey: ReturnType<typeof buildJourney>, key: string) {
  const activity = journey.stages.flatMap((s) => s.activities).find((a) => a.id === key);
  if (!activity) throw badRequest('That is not an activity on this product.');
  return activity;
}

async function membersOf(trx: Parameters<typeof loadCollaboration>[0], workspaceId: string) {
  return trx
    .selectFrom('memberships as m')
    .innerJoin('users as u', 'u.id', 'm.user_id')
    .select(['u.id', 'u.name', 'm.role'])
    .where('m.workspace_id', '=', workspaceId)
    .orderBy('u.name')
    .execute();
}

// ── Read the collaboration view of a product ──────────────────────────────

collaborationRouter.get(
  '/:id/activities',
  route(async (req, res) => {
    const ctx = auth(req);
    const id = parse(uuid, param(req, 'id'));
    const [loaded, team] = await Promise.all([
      journeyFor(db, ctx.workspaceId, id),
      teamContribution(db, ctx.workspaceId, id)
    ]);
    const { product, journey, collab, materials } = loaded;
    // Ranked on the server so every client sees the same "next action".
    const recommendations = recommendNextActions({
      product,
      journey,
      materials,
      records: collab.records,
      dependencies: collab.dependencies
    });
    res.json({
      journey,
      records: collab.records,
      dependencies: collab.dependencies,
      commentCounts: collab.commentCounts,
      team,
      recommendations
    });
  })
);

collaborationRouter.get(
  '/:id/team',
  route(async (req, res) => {
    const ctx = auth(req);
    const id = parse(uuid, param(req, 'id'));
    await loadProduct(db, ctx.workspaceId, id);
    res.json(await teamContribution(db, ctx.workspaceId, id));
  })
);

// ── Comments ──────────────────────────────────────────────────────────────

collaborationRouter.get(
  '/:id/activities/:key/comments',
  route(async (req, res) => {
    const ctx = auth(req);
    const id = parse(uuid, param(req, 'id'));
    const key = param(req, 'key');
    await loadProduct(db, ctx.workspaceId, id);
    const rows = await db
      .selectFrom('activity_comments as c')
      .leftJoin('users as u', 'u.id', 'c.user_id')
      .select(['c.id', 'c.activity_key', 'c.user_id', 'u.name', 'c.body', 'c.created_at'])
      .where('c.product_id', '=', id)
      .where('c.activity_key', '=', key)
      .orderBy('c.created_at')
      .execute();
    res.json(
      rows.map((r) => ({
        id: r.id,
        activityKey: r.activity_key,
        userId: r.user_id,
        userName: r.name ?? null,
        body: r.body,
        createdAt: r.created_at.toISOString()
      }))
    );
  })
);

collaborationRouter.post(
  '/:id/activities/:key/comments',
  route(async (req, res) => {
    const ctx = auth(req);
    const id = parse(uuid, param(req, 'id'));
    const key = param(req, 'key');
    const body = parse(z.object({ body: z.string().trim().min(1).max(2000) }), req.body);
    const result = await mutate(req, async (trx) => {
      const { journey } = await journeyFor(trx, ctx.workspaceId, id);
      assertActivity(journey, key);
      const row = await trx
        .insertInto('activity_comments')
        .values({ product_id: id, activity_key: key, user_id: ctx.userId, body: body.body })
        .returning(['id', 'created_at'])
        .executeTakeFirstOrThrow();
      return {
        id: row.id,
        activityKey: key,
        userId: ctx.userId,
        userName: ctx.name,
        body: body.body,
        createdAt: row.created_at.toISOString()
      };
    });
    res.status(201).json(result);
  })
);

// ── Assignment and status ─────────────────────────────────────────────────

const assignSchema = z.object({ assigneeId: z.string().uuid().nullable() });
const statusSchema = z.object({ status: z.enum(ACTIVITY_STATUSES) });

collaborationRouter.patch(
  '/:id/activities/:key/assignee',
  route(async (req, res) => {
    const ctx = auth(req);
    const id = parse(uuid, param(req, 'id'));
    const key = param(req, 'key');
    const body = parse(assignSchema, req.body);

    const result = await mutate(req, async (trx) => {
      const { journey, collab } = await journeyFor(trx, ctx.workspaceId, id);
      assertActivity(journey, key);

      if (body.assigneeId && !(await isWorkspaceMember(trx, ctx.workspaceId, body.assigneeId))) {
        throw badRequest('You can only assign work to a member of this workspace.');
      }
      // Members may claim work for themselves; moving someone else's work is an
      // owner/admin action so accountability cannot be shuffled away.
      const isSelf = body.assigneeId === ctx.userId;
      const existing = collab.records[key];
      const isReleasing = !body.assigneeId && existing?.assigneeId === ctx.userId;
      if (ctx.role === 'member' && !isSelf && !isReleasing) {
        throw forbidden('Ask an owner or admin to assign work to someone else.');
      }

      await upsertRecord(trx, id, key, { assigneeId: body.assigneeId });

      const wasAssigned = Boolean(existing?.assigneeId);
      if (body.assigneeId) {
        await notify(trx, {
          workspaceId: ctx.workspaceId,
          recipientIds: [body.assigneeId],
          actorId: ctx.userId,
          kind: wasAssigned ? 'activity_reassigned' : 'activity_assigned',
          title: wasAssigned ? 'Your activity was reassigned' : 'New activity assigned',
          body: journey.stages.flatMap((s) => s.activities).find((a) => a.id === key)?.label ?? key,
          productId: id,
          activityKey: key
        });
      }
      return { ok: true };
    });
    res.json(result);
  })
);

collaborationRouter.patch(
  '/:id/activities/:key/status',
  route(async (req, res) => {
    const ctx = auth(req);
    const id = parse(uuid, param(req, 'id'));
    const key = param(req, 'key');
    const body = parse(statusSchema, req.body);

    const result = await mutate(req, async (trx, ledger) => {
      const { journey, collab } = await journeyFor(trx, ctx.workspaceId, id);
      const activity = assertActivity(journey, key);
      const existing = collab.records[key];

      // A member may only change work assigned to them, or unassigned work.
      // This stops a member silently marking someone else's activity complete.
      if (ctx.role === 'member' && existing?.assigneeId && existing.assigneeId !== ctx.userId) {
        throw forbidden('This activity is assigned to someone else.');
      }

      const status = body.status as ActivityStatus;
      // Completed is only a claim about intent; actual completion is decided by
      // the activity's real data (answers/quest items) plus approval.
      if (status === 'completed') {
        if (requiresApproval(key) && existing?.reviewState !== 'approved') {
          throw conflict('This activity needs approval before it can be completed. Submit it for review instead.');
        }
        if (!activity.done) {
          throw conflict('Finish this activity’s information before marking it complete.');
        }
      }
      if (status === 'needs_review') {
        throw badRequest('Submit the activity for review instead of setting this status directly.');
      }
      if (status === 'blocked' && existing?.reviewState === 'pending') {
        throw conflict('This activity is awaiting review. A reviewer must respond first.');
      }

      const now = new Date();
      await upsertRecord(trx, id, key, {
        status,
        startedAt: status === 'in_progress' ? (existing?.startedAt ? new Date(existing.startedAt) : now) : existing?.startedAt ? new Date(existing.startedAt) : null,
        completedAt: status === 'completed' ? now : null,
        completedBy: status === 'completed' ? ctx.userId : null
      });

      // If this activity was a prerequisite for someone else's work, tell them
      // it is now satisfied. The activity's real completion (answers/quest item)
      // is what matters here, not the reported status.
      if (activity.done) {
        await notifyUnblocked(trx, {
          workspaceId: ctx.workspaceId,
          actorId: ctx.userId,
          productId: id,
          completedKey: key,
          completedLabel: activity.label,
          wasAlreadyDone: existing?.status === 'completed'
        });
      }

      await recordAnalyticsEvent(
        {
          eventType: 'action',
          eventName: 'activity.status',
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
          metadata: { productId: id, activityKey: key, status }
        },
        trx
      );
      return (await ledger.evaluateProduct(id)).product;
    });
    res.json(result);
  })
);

// ── Review and approval ───────────────────────────────────────────────────

const reviewSchema = z.object({
  decision: z.enum(['approve', 'request_changes']),
  note: z.string().trim().max(2000).optional()
});

collaborationRouter.post(
  '/:id/activities/:key/submit-review',
  route(async (req, res) => {
    const ctx = auth(req);
    const id = parse(uuid, param(req, 'id'));
    const key = param(req, 'key');

    const result = await mutate(req, async (trx) => {
      const { journey, collab } = await journeyFor(trx, ctx.workspaceId, id);
      const activity = assertActivity(journey, key);
      if (!requiresApproval(key)) throw badRequest('This activity does not need approval.');

      const existing = collab.records[key];
      if (ctx.role === 'member' && existing?.assigneeId && existing.assigneeId !== ctx.userId) {
        throw forbidden('Only the person this activity is assigned to can submit it.');
      }
      if (!activity.done) throw conflict('Fill in this activity before submitting it for review.');
      if (existing?.reviewState === 'pending') throw conflict('This activity is already awaiting review.');

      await upsertRecord(trx, id, key, {
        status: 'needs_review',
        reviewState: 'pending',
        reviewRequestedAt: new Date(),
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: ''
      });

      // Notify owners/admins other than the submitter.
      const members = await membersOf(trx, ctx.workspaceId);
      const reviewers = members.filter((m) => (m.role === 'owner' || m.role === 'admin') && m.id !== ctx.userId).map((m) => m.id);
      await notify(trx, {
        workspaceId: ctx.workspaceId,
        recipientIds: reviewers,
        actorId: ctx.userId,
        kind: 'review_requested',
        title: 'An activity needs your review',
        body: activity.label,
        productId: id,
        activityKey: key
      });
      return { ok: true };
    });
    res.json(result);
  })
);

collaborationRouter.post(
  '/:id/activities/:key/review',
  route(async (req, res) => {
    const ctx = auth(req);
    if (ctx.role === 'member') throw forbidden('Only owners and admins can review activities.');
    const id = parse(uuid, param(req, 'id'));
    const key = param(req, 'key');
    const body = parse(reviewSchema, req.body);

    const result = await mutate(req, async (trx, ledger) => {
      const { journey, collab } = await journeyFor(trx, ctx.workspaceId, id);
      const activity = assertActivity(journey, key);
      const existing = collab.records[key];
      if (existing?.reviewState !== 'pending') throw conflict('This activity is not awaiting review.');

      const approve = body.decision === 'approve';
      await upsertRecord(trx, id, key, {
        status: approve ? 'completed' : 'in_progress',
        reviewState: approve ? 'approved' : 'changes_requested',
        reviewedBy: ctx.userId,
        reviewedAt: new Date(),
        reviewNote: body.note ?? '',
        completedAt: approve ? new Date() : null,
        completedBy: approve ? ctx.userId : null
      });

      const recipients = existing.assigneeId ? [existing.assigneeId] : [];
      await notify(trx, {
        workspaceId: ctx.workspaceId,
        recipientIds: recipients,
        actorId: ctx.userId,
        kind: approve ? 'review_approved' : 'review_changes_requested',
        title: approve ? 'Your activity was approved' : 'Changes requested on your activity',
        body: body.note?.trim() ? body.note.trim() : activity.label,
        productId: id,
        activityKey: key
      });

      // Approving a sign-off can be what unlocks the stage's completion, so XP
      // is evaluated through the normal ledger rather than awarded here.
      return (await ledger.evaluateProduct(id)).product;
    });
    res.json(result);
  })
);

// ── Dependencies ──────────────────────────────────────────────────────────

const dependencySchema = z.object({ dependsOnKey: z.string().trim().min(1).max(120) });

collaborationRouter.post(
  '/:id/activities/:key/dependencies',
  route(async (req, res) => {
    const ctx = auth(req);
    const id = parse(uuid, param(req, 'id'));
    const key = param(req, 'key');
    const body = parse(dependencySchema, req.body);

    const result = await mutate(req, async (trx) => {
      const { journey } = await journeyFor(trx, ctx.workspaceId, id);
      assertActivity(journey, key);
      const prerequisite = assertActivity(journey, body.dependsOnKey);
      if (body.dependsOnKey === key) throw badRequest('An activity cannot depend on itself.');

      const existing = await trx
        .selectFrom('activity_dependencies')
        .select(['id'])
        .where('product_id', '=', id)
        .where('activity_key', '=', key)
        .where('depends_on_key', '=', body.dependsOnKey)
        .executeTakeFirst();
      if (existing) throw conflict('That dependency already exists.');

      // Reject cycles. A dependency loop would silently deadlock two activities.
      const all = await trx
        .selectFrom('activity_dependencies')
        .select(['activity_key', 'depends_on_key'])
        .where('product_id', '=', id)
        .execute();
      const edges = new Map<string, string[]>();
      for (const d of all) (edges.get(d.activity_key) ?? edges.set(d.activity_key, []).get(d.activity_key)!).push(d.depends_on_key);
      (edges.get(key) ?? edges.set(key, []).get(key)!).push(body.dependsOnKey);
      if (reaches(edges, body.dependsOnKey, key)) {
        throw conflict(`“${prerequisite.label}” already depends on this activity, so this would create a loop.`);
      }

      await trx
        .insertInto('activity_dependencies')
        .values({ product_id: id, activity_key: key, depends_on_key: body.dependsOnKey, created_by: ctx.userId })
        .execute();
      return { ok: true };
    });
    res.json(result);
  })
);

collaborationRouter.delete(
  '/:id/activities/:key/dependencies/:dependsOnKey',
  route(async (req, res) => {
    const ctx = auth(req);
    const id = parse(uuid, param(req, 'id'));
    const key = param(req, 'key');
    const dependsOn = param(req, 'dependsOnKey');
    const result = await mutate(req, async (trx) => {
      await loadProduct(trx, ctx.workspaceId, id);
      const r = await trx
        .deleteFrom('activity_dependencies')
        .where('product_id', '=', id)
        .where('activity_key', '=', key)
        .where('depends_on_key', '=', dependsOn)
        .executeTakeFirst();
      if (Number(r.numDeletedRows) === 0) throw notFound('Dependency');
      return { ok: true };
    });
    res.json(result);
  })
);

/** Depth-first reachability, used to keep the dependency graph acyclic. */
function reaches(edges: Map<string, string[]>, from: string, target: string, seen = new Set<string>()): boolean {
  if (from === target) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  return (edges.get(from) ?? []).some((next) => reaches(edges, next, target, seen));
}


/**
 * Tells whoever was waiting on a prerequisite that it is now satisfied.
 *
 * Derived entirely from the dependency rows: if activity B depends on A and A
 * has just become done, B's owner is notified once. Nothing is sent when A was
 * already done, so a repeated status change cannot spam the team.
 */
export async function notifyUnblocked(
  trx: Parameters<typeof loadPreferences>[0],
  input: {
    workspaceId: string;
    actorId: string;
    productId: string;
    completedKey: string;
    completedLabel: string;
    /** True when the prerequisite was already complete, so nothing is sent. */
    wasAlreadyDone: boolean;
  }
): Promise<void> {
  if (input.wasAlreadyDone) return;
  const dependents = await trx
    .selectFrom('activity_dependencies as d')
    .leftJoin('activity_records as r', (join) =>
      join.onRef('r.activity_key', '=', 'd.activity_key').onRef('r.product_id', '=', 'd.product_id')
    )
    .select(['d.activity_key', 'r.assignee_id'])
    .where('d.product_id', '=', input.productId)
    .where('d.depends_on_key', '=', input.completedKey)
    .execute();
  const recipients = dependents.map((d) => d.assignee_id).filter((id): id is string => Boolean(id));
  if (recipients.length === 0) return;
  // One notification per dependent activity, so the body names what is unblocked.
  for (const dependent of dependents) {
    if (!dependent.assignee_id) continue;
    await notify(trx, {
      workspaceId: input.workspaceId,
      recipientIds: [dependent.assignee_id],
      actorId: input.actorId,
      kind: 'blocker_resolved',
      title: 'You are unblocked',
      body: `“${input.completedLabel}” is done, so you can continue.`,
      productId: input.productId,
      activityKey: dependent.activity_key
    });
  }
}

// ── Notifications ─────────────────────────────────────────────────────────

export const notificationsRouter = Router();

notificationsRouter.get(
  '/',
  route(async (req, res) => {
    const ctx = auth(req);
    const limit = Math.min(Number(req.query.limit ?? 30) || 30, 100);
    const rows = await db
      .selectFrom('notifications')
      .select(['id', 'kind', 'title', 'body', 'product_id', 'activity_key', 'created_at', 'read_at'])
      .where('user_id', '=', ctx.userId)
      .where('workspace_id', '=', ctx.workspaceId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();
    const unread = await db
      .selectFrom('notifications')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('user_id', '=', ctx.userId)
      .where('workspace_id', '=', ctx.workspaceId)
      .where('read_at', 'is', null)
      .executeTakeFirst();
    res.json({
      unread: Number(unread?.n ?? 0),
      notifications: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        body: r.body,
        productId: r.product_id,
        activityKey: r.activity_key,
        createdAt: r.created_at.toISOString(),
        readAt: r.read_at ? r.read_at.toISOString() : null
      }))
    });
  })
);

notificationsRouter.post(
  '/read',
  route(async (req, res) => {
    const ctx = auth(req);
    const body = parse(z.object({ ids: z.array(z.string().uuid()).max(100).optional() }), req.body ?? {});
    let q = db
      .updateTable('notifications')
      .set({ read_at: new Date() })
      .where('user_id', '=', ctx.userId)
      .where('workspace_id', '=', ctx.workspaceId)
      .where('read_at', 'is', null);
    if (body.ids?.length) q = q.where('id', 'in', body.ids);
    await q.execute();
    res.json({ ok: true });
  })
);

notificationsRouter.get(
  '/preferences',
  route(async (req, res) => {
    res.json(await loadPreferences(db, auth(req).userId));
  })
);

notificationsRouter.patch(
  '/preferences',
  route(async (req, res) => {
    const ctx = auth(req);
    const body = parse(
      z.object({
        assignments: z.boolean().optional(),
        reviews: z.boolean().optional(),
        blockers: z.boolean().optional(),
        stages: z.boolean().optional()
      }),
      req.body
    );
    const current = await loadPreferences(db, ctx.userId);
    const next = { ...current, ...body };
    await savePreferences(db, ctx.userId, next);
    res.json(next);
  })
);

/**
 * Notifies the team when a stage completes. Exported for the product route so
 * the transition and the notification happen in the same transaction.
 */
export async function notifyStageCompleted(
  trx: Parameters<typeof loadPreferences>[0],
  input: { workspaceId: string; actorId: string; productId: string; productName: string; stage: StageId }
): Promise<void> {
  const members = await trx
    .selectFrom('memberships')
    .select(['user_id'])
    .where('workspace_id', '=', input.workspaceId)
    .execute();
  await notify(trx, {
    workspaceId: input.workspaceId,
    recipientIds: members.map((m) => m.user_id),
    actorId: input.actorId,
    kind: 'stage_completed',
    title: `${input.stage} completed`,
    body: `${input.productName} moved past ${input.stage}.`,
    productId: input.productId
  });
}
