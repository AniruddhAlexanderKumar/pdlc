import { Router } from 'express';
import { sql } from 'kysely';
import { z } from 'zod';
import {
  QUESTIONS_BY_KEY,
  STAGE_IDS,
  TASK_STATUSES,
  XP,
  isAnswered,
  nextStage,
  normaliseAnswer,
  stageIndex,
  type CurrencyCode,
  type StageId
} from '@sv/shared';
import { auth } from '../auth/session.js';
import { db, type Db } from '../db/index.js';
import { badRequest, conflict, money, notFound, parse, route, shortText, url, uuid } from '../lib/http.js';
import { insightsFor, rulesFor } from '../services/insights.js';
import { assertMaterial, assertProduct, loadMaterials, loadProduct, loadSuppliers, touchProduct } from '../services/repo.js';
import type { XpLedger } from '../services/xp.js';
import { recordAnalyticsEvent } from '../services/analytics.js';
import { mutate, param } from './util.js';

export const productsRouter = Router();

const productFields = z.object({
  name: shortText(120).min(1, 'Give the product a name'),
  category: shortText(60),
  description: shortText(2000),
  imageUrl: url,
  notes: shortText(10000),
  targetSellingPrice: money.nullable(),
  costs: z.object({ labour: money, packaging: money, overhead: money }).partial(),
  stage: z.enum(STAGE_IDS)
});

async function changeStage(trx: Db, ledger: XpLedger, productId: string, name: string, from: StageId, to: StageId) {
  if (from === to) return;
  await trx.updateTable('products').set({ stage: to, updated_at: new Date() }).where('id', '=', productId).execute();
  await trx.insertInto('stage_history').values({ product_id: productId, from_stage: from, to_stage: to, user_id: ledger.ctx.userId }).execute();
  if (stageIndex(to) > stageIndex(from) && to !== 'Retired') {
    await ledger.award('stage_advanced', `${productId}:${to}`, XP.stageAdvanced, `${name} moved to ${to}`, productId);
  }
}

productsRouter.post(
  '/',
  route(async (req, res) => {
    const body = parse(
      productFields.pick({ name: true, category: true, description: true, imageUrl: true, targetSellingPrice: true }).partial({
        category: true,
        description: true,
        imageUrl: true,
        targetSellingPrice: true
      }),
      req.body
    );
    const result = await mutate(req, async (trx, ledger, ctx) => {
      const row = await trx
        .insertInto('products')
        .values({
          workspace_id: ctx.workspaceId,
          name: body.name,
          category: body.category || 'General',
          description: body.description ?? '',
          image_url: body.imageUrl ?? '',
          target_price: body.targetSellingPrice ?? null,
          stage: 'Idea',
          created_by: ctx.userId,
          updated_at: new Date()
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await trx.insertInto('stage_history').values({ product_id: row.id, from_stage: null, to_stage: 'Idea', user_id: ctx.userId }).execute();
      await ledger.award('product_created', row.id, XP.productCreated, `Created ${body.name}`, row.id);
      await recordAnalyticsEvent({
        eventType: 'action',
        eventName: 'product.create',
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        metadata: { productId: row.id, name: body.name, category: body.category || 'General' }
      });
      return (await ledger.evaluateProduct(row.id)).product;
    });
    res.status(201).json(result);
  })
);

productsRouter.patch(
  '/:id',
  route(async (req, res) => {
    const id = parse(uuid, param(req, 'id'));
    const body = parse(productFields.partial(), req.body);
    const result = await mutate(req, async (trx, ledger, ctx) => {
      const current = await trx
        .selectFrom('products')
        .select(['id', 'name', 'stage'])
        .where('id', '=', id)
        .where('workspace_id', '=', ctx.workspaceId)
        .forUpdate()
        .executeTakeFirst();
      if (!current) throw notFound('Product');

      const set: Record<string, unknown> = {};
      if (body.name !== undefined) set.name = body.name;
      if (body.category !== undefined) set.category = body.category || 'General';
      if (body.description !== undefined) set.description = body.description;
      if (body.imageUrl !== undefined) set.image_url = body.imageUrl;
      if (body.notes !== undefined) set.notes = body.notes;
      if (body.targetSellingPrice !== undefined) set.target_price = body.targetSellingPrice;
      if (body.costs?.labour !== undefined) set.labour = body.costs.labour;
      if (body.costs?.packaging !== undefined) set.packaging = body.costs.packaging;
      if (body.costs?.overhead !== undefined) set.overhead = body.costs.overhead;
      if (Object.keys(set).length > 0) {
        await trx
          .updateTable('products')
          .set({ ...set, updated_at: new Date() })
          .where('id', '=', id)
          .execute();
      }
      if (body.stage) await changeStage(trx, ledger, id, body.name ?? current.name, current.stage, body.stage);
      await recordAnalyticsEvent({
        eventType: 'action',
        eventName: body.stage && body.stage !== current.stage ? 'product.stage_transition' : 'product.update',
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        metadata: {
          productId: id,
          name: body.name ?? current.name,
          fromStage: current.stage,
          toStage: body.stage ?? current.stage
        }
      });
      return (await ledger.evaluateProduct(id)).product;
    });
    res.json(result);
  })
);

productsRouter.delete(
  '/:id',
  route(async (req, res) => {
    const a = auth(req);
    const id = parse(uuid, param(req, 'id'));
    const r = await db.deleteFrom('products').where('id', '=', id).where('workspace_id', '=', a.workspaceId).executeTakeFirst();
    if (Number(r.numDeletedRows) === 0) throw notFound('Product');
    res.status(204).end();
  })
);

// ── Discovery answers ──────────────────────────────────────────────────────

productsRouter.put(
  '/:id/answers/:key',
  route(async (req, res) => {
    const id = parse(uuid, param(req, 'id'));
    const question = QUESTIONS_BY_KEY.get(param(req, 'key'));
    if (!question || question.retired) throw notFound('Question');
    const normalised = normaliseAnswer(question, (req.body as { value?: unknown })?.value);
    if ('error' in normalised) throw badRequest(normalised.error);
    const { value } = normalised;

    const result = await mutate(req, async (trx, ledger, ctx) => {
      const product = await assertProduct(trx, ctx.workspaceId, id);
      if (isAnswered(value)) {
        await trx
          .insertInto('answers')
          .values({ product_id: id, question_key: question.key, value: JSON.stringify(value), answered_by: ctx.userId, answered_at: new Date() })
          .onConflict((oc) =>
            oc.columns(['product_id', 'question_key']).doUpdateSet({ value: JSON.stringify(value), answered_by: ctx.userId, answered_at: new Date() })
          )
          .execute();
        await ledger.award('answer', `${id}:${question.key}`, question.xp, `Answered “${question.prompt}”`, product.id);

        if (question.syncsTo === 'targetSellingPrice' && typeof value === 'number') {
          await trx.updateTable('products').set({ target_price: value }).where('id', '=', id).execute();
        } else if (question.syncsTo === 'description' && typeof value === 'string') {
          await trx.updateTable('products').set({ description: value }).where('id', '=', id).execute();
        } else if (question.syncsTo === 'category' && typeof value === 'string') {
          await trx.updateTable('products').set({ category: value }).where('id', '=', id).execute();
        }
      } else {
        await trx.deleteFrom('answers').where('product_id', '=', id).where('question_key', '=', question.key).execute();
      }
      await touchProduct(trx, id);
      return (await ledger.evaluateProduct(id)).product;
    });
    res.json(result);
  })
);

// ── Bill of materials ──────────────────────────────────────────────────────

productsRouter.put(
  '/:id/materials/:materialId',
  route(async (req, res) => {
    const id = parse(uuid, param(req, 'id'));
    const materialId = parse(uuid, param(req, 'materialId'));
    const { quantity } = parse(z.object({ quantity: z.coerce.number().positive('Quantity must be more than 0').max(1e6) }), req.body);
    const result = await mutate(req, async (trx, ledger, ctx) => {
      const product = await assertProduct(trx, ctx.workspaceId, id);
      await assertMaterial(trx, ctx.workspaceId, materialId);
      const { next } = await trx
        .selectFrom('product_materials')
        .select(sql<number>`coalesce(max(position), -1) + 1`.as('next'))
        .where('product_id', '=', id)
        .executeTakeFirstOrThrow();
      await trx
        .insertInto('product_materials')
        .values({ product_id: id, material_id: materialId, quantity, position: next })
        .onConflict((oc) => oc.columns(['product_id', 'material_id']).doUpdateSet({ quantity }))
        .execute();
      await ledger.award('material_added', `${id}:${materialId}`, XP.materialAdded, 'Added a material to the bill of materials', product.id);
      await touchProduct(trx, id);
      return (await ledger.evaluateProduct(id)).product;
    });
    res.json(result);
  })
);

productsRouter.delete(
  '/:id/materials/:materialId',
  route(async (req, res) => {
    const id = parse(uuid, param(req, 'id'));
    const materialId = parse(uuid, param(req, 'materialId'));
    const result = await mutate(req, async (trx, ledger, ctx) => {
      await assertProduct(trx, ctx.workspaceId, id);
      await trx.deleteFrom('product_materials').where('product_id', '=', id).where('material_id', '=', materialId).execute();
      await touchProduct(trx, id);
      return (await ledger.evaluateProduct(id)).product;
    });
    res.json(result);
  })
);

// ── Tasks ──────────────────────────────────────────────────────────────────

const taskFields = z.object({
  title: shortText(200).min(1, 'Give the task a title'),
  description: shortText(4000),
  status: z.enum(TASK_STATUSES),
  dueDate: z.iso.date().nullable(),
  position: z.number().finite()
});

productsRouter.post(
  '/:id/tasks',
  route(async (req, res) => {
    const id = parse(uuid, param(req, 'id'));
    const body = parse(taskFields.partial({ description: true, status: true, dueDate: true, position: true }), req.body);
    const result = await mutate(req, async (trx, ledger, ctx) => {
      const product = await assertProduct(trx, ctx.workspaceId, id);
      const { count } = await trx
        .selectFrom('tasks')
        .select(sql<number>`count(*)::int`.as('count'))
        .where('product_id', '=', id)
        .executeTakeFirstOrThrow();
      if (count >= 500) throw conflict('This product already has 500 tasks');
      const { next } = await trx
        .selectFrom('tasks')
        .select(sql<number>`coalesce(max(position), 0) + 1`.as('next'))
        .where('product_id', '=', id)
        .executeTakeFirstOrThrow();
      const status = body.status ?? 'todo';
      const task = await trx
        .insertInto('tasks')
        .values({
          product_id: id,
          title: body.title,
          description: body.description ?? '',
          status,
          due_date: body.dueDate ?? null,
          position: body.position ?? next,
          completed_at: status === 'done' ? new Date() : null,
          updated_at: new Date()
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      if (status === 'done') await ledger.award('task_done', task.id, XP.taskCompleted, `Completed “${body.title}”`, product.id);
      await recordAnalyticsEvent({
        eventType: 'action',
        eventName: status === 'done' ? 'task.complete' : 'task.create',
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        metadata: { productId: id, taskId: task.id, title: body.title, status }
      });
      await touchProduct(trx, id);
      return (await ledger.evaluateProduct(id)).product;
    });
    res.status(201).json(result);
  })
);

productsRouter.patch(
  '/:id/tasks/:taskId',
  route(async (req, res) => {
    const id = parse(uuid, param(req, 'id'));
    const taskId = parse(uuid, param(req, 'taskId'));
    const body = parse(taskFields.partial(), req.body);
    const result = await mutate(req, async (trx, ledger, ctx) => {
      await assertProduct(trx, ctx.workspaceId, id);
      const task = await trx.selectFrom('tasks').select(['id', 'title', 'status']).where('id', '=', taskId).where('product_id', '=', id).executeTakeFirst();
      if (!task) throw notFound('Task');
      const set: Record<string, unknown> = { updated_at: new Date() };
      if (body.title !== undefined) set.title = body.title;
      if (body.description !== undefined) set.description = body.description;
      if (body.dueDate !== undefined) set.due_date = body.dueDate;
      if (body.position !== undefined) set.position = body.position;
      if (body.status !== undefined && body.status !== task.status) {
        set.status = body.status;
        set.completed_at = body.status === 'done' ? new Date() : null;
        if (body.status === 'done') {
          await ledger.award('task_done', taskId, XP.taskCompleted, `Completed “${body.title ?? task.title}”`, id);
        }
        await recordAnalyticsEvent({
          eventType: 'action',
          eventName: body.status === 'done' ? 'task.complete' : 'task.update',
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
          metadata: { productId: id, taskId, title: task.title, status: body.status }
        });
      }
      await trx.updateTable('tasks').set(set).where('id', '=', taskId).execute();
      await touchProduct(trx, id);
      return (await ledger.evaluateProduct(id)).product;
    });
    res.json(result);
  })
);

productsRouter.delete(
  '/:id/tasks/:taskId',
  route(async (req, res) => {
    const id = parse(uuid, param(req, 'id'));
    const taskId = parse(uuid, param(req, 'taskId'));
    const result = await mutate(req, async (trx, ledger, ctx) => {
      await assertProduct(trx, ctx.workspaceId, id);
      const r = await trx.deleteFrom('tasks').where('id', '=', taskId).where('product_id', '=', id).executeTakeFirst();
      if (Number(r.numDeletedRows) === 0) throw notFound('Task');
      await touchProduct(trx, id);
      return (await ledger.evaluateProduct(id)).product;
    });
    res.json(result);
  })
);

// ── Insights ("Improve it") ────────────────────────────────────────────────

async function insightInput(trx: Db, workspaceId: string, productId: string) {
  const [product, materials, suppliers, ws] = await Promise.all([
    loadProduct(trx, workspaceId, productId),
    loadMaterials(trx, workspaceId),
    loadSuppliers(trx, workspaceId),
    trx.selectFrom('workspaces').select('currency').where('id', '=', workspaceId).executeTakeFirstOrThrow()
  ]);
  return {
    product,
    materials: new Map(materials.map((m) => [m.id, m])),
    suppliers: new Map(suppliers.map((s) => [s.id, s])),
    currency: ws.currency as CurrencyCode
  };
}

productsRouter.get(
  '/:id/insights',
  route(async (req, res) => {
    const a = auth(req);
    const id = parse(uuid, param(req, 'id'));
    res.json(await insightsFor(await insightInput(db, a.workspaceId, id)));
  })
);

productsRouter.post(
  '/:id/insights/apply',
  route(async (req, res) => {
    const id = parse(uuid, param(req, 'id'));
    const { insightId } = parse(z.object({ insightId: z.string().min(1).max(300) }), req.body);
    const result = await mutate(req, async (trx, ledger, ctx) => {
      const input = await insightInput(trx, ctx.workspaceId, id);
      // Re-derive suggestions server-side; never trust an action sent by the client.
      const insight = rulesFor(input).find((i) => i.id === insightId);
      if (!insight?.action) throw conflict('This suggestion is out of date. Refresh to see the latest ones.');
      const { action } = insight;
      if (action.type === 'switch_supplier') {
        await trx
          .updateTable('materials')
          .set({ unit_price: action.price, updated_at: new Date() })
          .where('id', '=', action.materialId)
          .where('workspace_id', '=', ctx.workspaceId)
          .execute();
      } else if (action.type === 'set_price') {
        await trx.updateTable('products').set({ target_price: action.price, updated_at: new Date() }).where('id', '=', id).execute();
      } else if (action.type === 'advance_stage') {
        const to = nextStage(input.product.stage);
        if (!to) throw conflict('This product is already at its final stage');
        await changeStage(trx, ledger, id, input.product.name, input.product.stage, to);
      } else {
        throw badRequest('This suggestion has nothing to apply');
      }
      await ledger.award('suggestion_applied', `${id}:${insight.id}`, XP.suggestionApplied, `Applied: ${insight.title}`, id);
      return (await ledger.evaluateProduct(id)).product;
    });
    res.json(result);
  })
);
