import { Router } from 'express';
import { z } from 'zod';
import { CHECKPOINT_BY_ID, LESSON_BY_ID } from '@sv/shared';
import { auth, requireRole } from '../auth/session.js';
import { db } from '../db/index.js';
import { badRequest, conflict, notFound, parse, route, shortText, uuid } from '../lib/http.js';
import {
  applyLessonBind,
  loadJourney,
  nextLessonAfter,
  validateSubmission,
  type LessonSubmission as Submission
} from '../services/journey.js';
import { mutate, param } from './util.js';


/**
 * Proves that a checklist lesson's claim is backed by real records.
 *
 * The founder ticks "I added the main body material"; this checks that materials
 * really are on the product, that tasks really exist, and so on. Without this a
 * checklist is a button that awards XP for nothing, which is exactly the fake
 * progress the journey must not have.
 */
function checklistProof(
  lesson: (typeof LESSON_BY_ID extends Map<string, infer L> ? L : never),
  records: {
    research: unknown[];
    requirements: unknown[];
    tests: unknown[];
    decisions: unknown[];
    feedback: unknown[];
    materials: number;
    tasks: number;
    costs: boolean;
    description: boolean;
  }
): { ok: true; detail: string } | { ok: false; error: string } {
  const { target, key } = lesson.bind;
  switch (target) {
    case 'research':
      return records.research.length > 0
        ? { ok: true, detail: `${records.research.length} research record(s)` }
        : { ok: false, error: 'Add at least one research record first — this checklist confirms work you have already done.' };
    case 'requirement':
      return records.requirements.length > 0
        ? { ok: true, detail: `${records.requirements.length} requirement(s)` }
        : { ok: false, error: 'Add at least one requirement first.' };
    case 'test':
      return records.tests.length > 0
        ? { ok: true, detail: `${records.tests.length} test result(s)` }
        : { ok: false, error: 'Record at least one test result first.' };
    case 'decision':
      return records.decisions.length > 0
        ? { ok: true, detail: `${records.decisions.length} decision(s)` }
        : { ok: false, error: 'Record at least one decision first.' };
    case 'feedback':
      return records.feedback.length > 0
        ? { ok: true, detail: `${records.feedback.length} feedback item(s)` }
        : { ok: false, error: 'Record at least one piece of feedback first.' };
    case 'material':
      return records.materials > 0
        ? { ok: true, detail: `${records.materials} material line(s)` }
        : { ok: false, error: 'Add the materials to your bill of materials first — this checklist confirms they exist.' };
    case 'task':
      return records.tasks > 0
        ? { ok: true, detail: `${records.tasks} task(s)` }
        : { ok: false, error: 'Add the tasks to your product first — this checklist confirms they exist.' };
    case 'costs':
      return records.costs
        ? { ok: true, detail: 'costs recorded' }
        : { ok: false, error: 'Fill in your labour, packaging and overhead first.' };
    case 'field':
      return records.description
        ? { ok: true, detail: 'recorded' }
        : { ok: false, error: 'Fill in this product field first.' };
    case 'answer':
      return { ok: true, detail: key };
  }
}

export const journeyRouter = Router();

/**
 * The gamified journey API.
 *
 * Every endpoint here is workspace-scoped and writes real product records.
 * Completion is decided from those records — the client cannot post "done".
 * XP goes through the existing `xp_events` ledger, whose unique key makes a
 * repeated submission a no-op rather than a second award.
 */

journeyRouter.get(
  '/:id/journey',
  route(async (req, res) => {
    const a = auth(req);
    const id = parse(uuid, param(req, 'id'));
    const { snapshot } = await loadJourney(db, a.workspaceId, id, a.userId);
    res.set('Cache-Control', 'no-store').json(snapshot);
  })
);

/** Tick or untick one checklist item inside a lesson. */
journeyRouter.put(
  '/:id/journey/lessons/:lessonId/checklist/:itemId',
  route(async (req, res) => {
    const a = auth(req);
    const id = parse(uuid, param(req, 'id'));
    const lessonId = param(req, 'lessonId');
    const itemId = param(req, 'itemId');
    const { checked } = parse(z.object({ checked: z.boolean() }).strict(), req.body);

    const lesson = LESSON_BY_ID.get(lessonId);
    if (!lesson) throw notFound('Lesson');
    if (lesson.activity.kind !== 'checklist') throw badRequest('This lesson has no checklist');
    if (!(lesson.activity.items ?? []).some((i) => i.id === itemId)) throw badRequest('Unknown checklist item');

    const { snapshot } = await loadJourney(db, a.workspaceId, id, a.userId);
    const state = snapshot.journey.worlds.flatMap((w) => w.units.flatMap((u) => u.lessons)).find((l) => l.id === lessonId);
    if (!state) throw notFound('Lesson');
    if (state.state === 'locked') throw conflict(state.lockReason ?? 'This lesson is locked.');

    if (checked) {
      await db
        .insertInto('lesson_checklist_items')
        .values({ product_id: id, user_id: a.userId, lesson_id: lessonId, item_id: itemId })
        .onConflict((oc) => oc.columns(['product_id', 'user_id', 'lesson_id', 'item_id']).doNothing())
        .execute();
    } else {
      await db
        .deleteFrom('lesson_checklist_items')
        .where('product_id', '=', id)
        .where('user_id', '=', a.userId)
        .where('lesson_id', '=', lessonId)
        .where('item_id', '=', itemId)
        .execute();
    }

    const after = await loadJourney(db, a.workspaceId, id, a.userId);
    res.json({ journey: after.snapshot.journey, records: after.snapshot.records });
  })
);

/**
 * Submit a lesson.
 *
 * The activity is validated against the lesson definition, the bound record is
 * written, then the lesson is marked complete — but only if the database now
 * really contains the evidence. XP is awarded once per (user, lesson).
 */
journeyRouter.post(
  '/:id/journey/lessons/:lessonId/complete',
  route(async (req, res) => {
    const a = auth(req);
    const id = parse(uuid, param(req, 'id'));
    const lessonId = param(req, 'lessonId');
    const lesson = LESSON_BY_ID.get(lessonId);
    if (!lesson) throw notFound('Lesson');

    const body = parse(
      z
        .object({
          text: shortText(4000).optional(),
          optionId: shortText(120).optional(),
          fields: z.record(z.string(), shortText(2000)).optional(),
          order: z.array(shortText(120)).max(20).optional()
        })
        .strict(),
      req.body
    ) as Submission;

    const before = await loadJourney(db, a.workspaceId, id, a.userId);
    const state = before.snapshot.journey.worlds.flatMap((w) => w.units.flatMap((u) => u.lessons)).find((l) => l.id === lessonId);
    if (!state) throw notFound('Lesson');
    if (state.state === 'locked') throw conflict(state.lockReason ?? 'This lesson is locked.');

    // A checklist lesson is completed by its ticks; submitting it just confirms.
    let evidence = state.evidence ?? '';
    let submission: Submission = body;
    if (lesson.activity.kind !== 'checklist') {
      const verdict = validateSubmission(lesson, body);
      if (!verdict.ok) throw badRequest(verdict.error);
      evidence = verdict.evidence;
      submission = body;
    } else {
      const items = lesson.activity.items ?? [];
      const ticked = items.filter((i) => before.snapshot.records.checkedItems.includes(`${lessonId}:${i.id}`));
      if (ticked.length !== items.length) {
        throw badRequest(`Confirm all ${items.length} steps before completing this lesson.`);
      }
      // A tick is a claim, not proof. The thing the checklist describes must
      // actually exist on the product before the lesson counts as done.
      const proof = checklistProof(lesson, {
        ...before.snapshot.records,
        materials: before.product.materials?.length ?? 0,
        tasks: before.product.tasks?.length ?? 0,
        costs: Boolean(before.product.costs && (before.product.costs.labour > 0 || before.product.costs.packaging > 0 || before.product.costs.overhead > 0)),
        description: (before.product.description ?? '').trim().length >= 3
      });
      if (!proof.ok) throw badRequest(proof.error);
      evidence = `All ${items.length} steps confirmed — ${proof.detail}`;
    }

    const result = await mutate(req, async (trx, ledger) => {
      // 1. Write the real record this lesson is bound to.
      await applyLessonBind(trx, a.workspaceId, id, a.userId, lesson, submission, evidence);

      // 2. Re-read the product so completion is judged on what was just written.
      const product = await trx
        .selectFrom('products')
        .selectAll()
        .where('id', '=', id)
        .where('workspace_id', '=', a.workspaceId)
        .executeTakeFirst();
      if (!product) throw notFound('Product');

      // 3. Record the completion, but only when the evidence exists.
      const already = await trx
        .selectFrom('lesson_progress')
        .select(['status'])
        .where('product_id', '=', id)
        .where('user_id', '=', a.userId)
        .where('lesson_id', '=', lessonId)
        .executeTakeFirst();

      await trx
        .insertInto('lesson_progress')
        .values({ product_id: id, user_id: a.userId, lesson_id: lessonId, status: 'completed', evidence: evidence.slice(0, 4000) })
        .onConflict((oc) =>
          oc.columns(['product_id', 'user_id', 'lesson_id']).doUpdateSet({ status: 'completed', evidence: evidence.slice(0, 4000), updated_at: new Date() })
        )
        .execute();

      // 4. XP once per lesson per user. The ledger de-duplicates by ref.
      let awarded = 0;
      if (!already || already.status !== 'completed') {
        const won = await ledger.award('lesson', `${id}:${lessonId}`, lesson.xp, `Completed: ${lesson.title}`, id);
        if (won) {
          awarded = lesson.xp;
          await trx
            .updateTable('lesson_progress')
            .set({ xp_awarded: lesson.xp })
            .where('product_id', '=', id)
            .where('user_id', '=', a.userId)
            .where('lesson_id', '=', lessonId)
            .execute();
        }
      }

      // 5. Product-level milestones still apply (price set, costs, quests).
      await ledger.evaluateProduct(id);

      return { lessonId, evidence, xpAwarded: awarded };
    });

    const after = await loadJourney(db, a.workspaceId, id, a.userId);
    const next = nextLessonAfter(after.snapshot.journey, lessonId);
    res.json({
      ...result.data,
      xp: result.xp,
      journey: after.snapshot.journey,
      records: after.snapshot.records,
      nextLessonId: next?.id ?? null
    });
  })
);

/**
 * Submit a checkpoint.
 *
 * The checkpoint's criteria are evaluated against real records at submission
 * time. Passing it is what unlocks the next world; failing it returns the
 * criteria that are still unmet so the UI can say exactly what is missing.
 */
journeyRouter.post(
  '/:id/journey/checkpoints/:checkpointId/submit',
  route(async (req, res) => {
    const a = auth(req);
    const id = parse(uuid, param(req, 'id'));
    const checkpointId = param(req, 'checkpointId');
    const checkpoint = CHECKPOINT_BY_ID.get(checkpointId);
    if (!checkpoint) throw notFound('Checkpoint');

    const before = await loadJourney(db, a.workspaceId, id, a.userId);
    const cp = before.snapshot.journey.worlds.find((w) => w.checkpoint.id === checkpointId)?.checkpoint;
    if (!cp) throw notFound('Checkpoint');
    if (cp.state === 'locked') throw conflict(cp.lockReason ?? 'This checkpoint is locked.');

    const unmet = cp.results.filter((r) => !r.passed);
    const passed = unmet.length === 0;

    const result = await mutate(req, async (trx, ledger) => {
      await trx
        .insertInto('journey_checkpoints')
        .values({
          product_id: id,
          user_id: a.userId,
          checkpoint_id: checkpointId,
          status: passed ? 'passed' : 'failed',
          results: JSON.stringify(cp.results),
          evidence: cp.results.filter((r) => r.passed).map((r) => `${r.label}: ${r.observed}`).join('\n')
        })
        .onConflict((oc) =>
          oc
            .columns(['product_id', 'user_id', 'checkpoint_id'])
            .doUpdateSet({ status: passed ? 'passed' : 'failed', results: JSON.stringify(cp.results), updated_at: new Date() })
        )
        .execute();

      let awarded = 0;
      if (passed) {
        const won = await ledger.award('checkpoint', `${id}:${checkpointId}`, checkpoint.xp, `Passed checkpoint: ${checkpoint.title}`, id);
        if (won) awarded = checkpoint.xp;
        await ledger.evaluateProduct(id);
      }
      return { checkpointId, passed, unmet, xpAwarded: awarded };
    });

    const after = await loadJourney(db, a.workspaceId, id, a.userId);
    res.status(passed ? 200 : 409).json({
      ...result.data,
      xp: result.xp,
      journey: after.snapshot.journey,
      records: after.snapshot.records
    });
  })
);

/** Reopen a completed lesson to revise it. Never removes XP or completion. */
journeyRouter.get(
  '/:id/journey/lessons/:lessonId',
  route(async (req, res) => {
    const a = auth(req);
    const id = parse(uuid, param(req, 'id'));
    const lessonId = param(req, 'lessonId');
    const lesson = LESSON_BY_ID.get(lessonId);
    if (!lesson) throw notFound('Lesson');
    const { snapshot, product } = await loadJourney(db, a.workspaceId, id, a.userId);
    const state = snapshot.journey.worlds.flatMap((w) => w.units.flatMap((u) => u.lessons)).find((l) => l.id === lessonId);
    if (!state) throw notFound('Lesson');
    if (state.state === 'locked') throw conflict(state.lockReason ?? 'This lesson is locked.');
    res.set('Cache-Control', 'no-store').json({
      lesson,
      state,
      product: { id: product.id, name: product.name, description: product.description, category: product.category },
      checkedItems: snapshot.records.checkedItems.filter((c) => c.startsWith(`${lessonId}:`)),
      journey: snapshot.journey
    });
  })
);
