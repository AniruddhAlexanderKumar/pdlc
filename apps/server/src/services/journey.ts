import { sql } from 'kysely';
import {
  ALL_LESSONS,
  LESSON_BY_ID,
  WORLDS,
  buildJourneyV2,
  worldOfLesson,
  type BindTarget,
  type JourneyRecords,
  type JourneyRecordsView,
  type JourneyV2,
  type Lesson,
  type LessonProgress as SharedLessonProgress,
  type Product
} from '@sv/shared';
import type { Db } from '../db/index.js';
import { badRequest, conflict, notFound } from '../lib/http.js';
import { loadProduct } from './repo.js';

/**
 * Server side of the gamified journey.
 *
 * The engine in `@sv/shared` decides state from records; this module only reads
 * those records and writes the ones a lesson produces. Completion is never
 * written by the client — a lesson completes when the database says so.
 */

export interface JourneySnapshot {
  journey: JourneyV2;
  /** Per-lesson state for the map. */
  records: JourneyRecordsView;
  /** The product's current lifecycle stage, so the UI can say where it sits. */
  stage: string;
}

/** Reads every record the curriculum binds to, for one product. */
export async function loadJourneyRecords(
  db: Db,
  workspaceId: string,
  productId: string,
  userId: string
): Promise<{ view: JourneyRecordsView; records: JourneyRecords }> {
  const [progress, checks, checkpoints, research, requirements, tests, decisions, feedback] = await Promise.all([
    db.selectFrom('lesson_progress').select(['lesson_id', 'status']).where('product_id', '=', productId).where('user_id', '=', userId).execute(),
    db.selectFrom('lesson_checklist_items').select(['lesson_id', 'item_id']).where('product_id', '=', productId).where('user_id', '=', userId).execute(),
    db.selectFrom('journey_checkpoints').select(['checkpoint_id', 'status', 'submitted_at']).where('product_id', '=', productId).where('user_id', '=', userId).execute(),
    db.selectFrom('research_entries').select(['id', 'kind', 'title', 'detail']).where('workspace_id', '=', workspaceId).where('product_id', '=', productId).execute(),
    db.selectFrom('requirements').select(['id', 'kind', 'text', 'priority']).where('workspace_id', '=', workspaceId).where('product_id', '=', productId).execute(),
    db.selectFrom('test_results').select(['id', 'name', 'result', 'outcome']).where('workspace_id', '=', workspaceId).where('product_id', '=', productId).execute(),
    db.selectFrom('decisions').select(['id', 'kind', 'decision', 'rationale']).where('workspace_id', '=', workspaceId).where('product_id', '=', productId).execute(),
    db.selectFrom('feedback_items').select(['id', 'kind', 'body', 'severity', 'status']).where('workspace_id', '=', workspaceId).where('product_id', '=', productId).execute()
  ]);

  const submissions = new Set(progress.filter((p) => p.status === 'completed' || p.status === 'legacy').map((p) => p.lesson_id));
  for (const c of checkpoints) if (c.status === 'passed') submissions.add(c.checkpoint_id);

  const view: JourneyRecordsView = {
    submissions: [...submissions],
    checkedItems: checks.map((c) => `${c.lesson_id}:${c.item_id}`),
    checkpoints: checkpoints.map((c) => ({ id: c.checkpoint_id, status: c.status, submittedAt: new Date(c.submitted_at as unknown as string | Date).toISOString() })),
    research: research.map((r) => ({ id: r.id, kind: r.kind, title: r.title, detail: r.detail })),
    requirements: requirements.map((r) => ({ id: r.id, kind: r.kind, text: r.text, priority: r.priority })),
    tests: tests.map((t) => ({ id: t.id, name: t.name, result: t.result, outcome: t.outcome })),
    decisions: decisions.map((d) => ({ id: d.id, kind: d.kind, decision: d.decision, rationale: d.rationale })),
    feedback: feedback.map((f) => ({ id: f.id, kind: f.kind, body: f.body, severity: f.severity, status: f.status }))
  };

  return {
    view,
    records: {
      submissions,
      checkedItems: new Set(view.checkedItems),
      research: view.research,
      requirements: view.requirements,
      tests: view.tests,
      decisions: view.decisions,
      feedback: view.feedback
    }
  };
}

/** The full journey for a product, ready for the client. */
export async function loadJourney(db: Db, workspaceId: string, productId: string, userId: string): Promise<{ product: Product; snapshot: JourneySnapshot }> {
  const product = await loadProduct(db, workspaceId, productId);
  const { view, records } = await loadJourneyRecords(db, workspaceId, productId, userId);
  return {
    product,
    snapshot: {
      journey: buildJourneyV2(product, records),
      records: view,
      stage: product.stage
    }
  };
}

/** The lesson a founder is allowed to work on right now. */
function editableLesson(snapshot: JourneySnapshot, lessonId: string): SharedLessonProgress {
  const found = snapshot.journey.worlds
    .flatMap((w) => w.units.flatMap((u) => u.lessons))
    .find((l) => l.id === lessonId);
  if (!found) throw notFound('Lesson');
  if (found.state === 'locked') throw conflict(found.lockReason ?? 'This lesson is locked.');
  return found;
}

export interface LessonSubmission {
  /** Free text for `write` activities. */
  text?: string;
  /** Chosen option id for `choice` activities. */
  optionId?: string;
  /** Field values for `form` activities. */
  fields?: Record<string, string>;
  /** Ordered item ids for `priority` activities. */
  order?: string[];
}

/** Validates a submission against the lesson's own activity definition. */
export function validateSubmission(lesson: Lesson, input: LessonSubmission): { ok: true; evidence: string } | { ok: false; error: string } {
  const { activity } = lesson;
  switch (activity.kind) {
    case 'write': {
      const text = (input.text ?? '').trim();
      const min = activity.minLength ?? 20;
      if (text.length < min) {
        return { ok: false, error: `Write at least ${min} characters — that is about one honest sentence.` };
      }
      return { ok: true, evidence: text };
    }
    case 'choice': {
      const option = activity.options?.find((o) => o.id === input.optionId);
      if (!option) return { ok: false, error: 'Choose one of the options.' };
      return { ok: true, evidence: option.label };
    }
    case 'form': {
      const fields = activity.fields ?? [];
      for (const field of fields.filter((f) => f.required)) {
        const value = (input.fields?.[field.id] ?? '').trim();
        if (!value) return { ok: false, error: `${field.label} is required.` };
        if (field.type === 'money' || field.type === 'number') {
          const n = Number(value.replace(/[^0-9.\-]/g, ''));
          if (!Number.isFinite(n) || n < 0) return { ok: false, error: `${field.label} must be a number of zero or more.` };
        }
      }
      const summary = fields
        .map((f) => `${f.label}: ${(input.fields?.[f.id] ?? '').trim()}`)
        .filter((line) => !line.endsWith(': '))
        .join('; ');
      return { ok: true, evidence: summary };
    }
    case 'priority': {
      const items = activity.priorities ?? [];
      const order = input.order ?? [];
      if (order.length !== items.length || new Set(order).size !== items.length) {
        return { ok: false, error: 'Rank every item once.' };
      }
      for (const id of order) if (!items.some((i) => i.id === id)) return { ok: false, error: 'Unknown item in the ranking.' };
      return { ok: true, evidence: order.map((id) => items.find((i) => i.id === id)!.label).join(' → ') };
    }
    case 'checklist': {
      // Checklist completion is proved by the ticked items, not by this call.
      return { ok: true, evidence: 'Checklist confirmed' };
    }
  }
}

/** Writes a lesson's activity to the record the curriculum binds it to. */
export async function applyLessonBind(
  trx: Db,
  workspaceId: string,
  productId: string,
  userId: string,
  lesson: Lesson,
  submission: LessonSubmission,
  evidence: string
): Promise<void> {
  const { target, key } = lesson.bind;
  const text = (submission.text ?? '').trim();
  const now = new Date();

  switch (target) {
    case 'answer': {
      // Stored exactly like the existing discovery answers so they read the
      // same in the Tell us tab and in the journey question cards.
      const chosen = lesson.activity.options?.find((o) => o.id === submission.optionId);
      const ranked = (submission.order ?? [])
        .map((id) => lesson.activity.priorities?.find((p) => p.id === id)?.label ?? id)
        .join(' → ');
      const formSummary = Object.entries(submission.fields ?? {})
        .map(([, v]) => (v ?? '').trim())
        .filter((v) => v.length > 0)
        .join('; ');
      const value =
        lesson.activity.kind === 'choice'
          ? chosen?.label ?? submission.optionId ?? ''
          : lesson.activity.kind === 'priority'
            ? ranked
            : lesson.activity.kind === 'form'
              ? formSummary
              : text;
      if (!value) return;
      // Choices may be numeric scales (how painful is the problem? 1–5).
      const numeric = Number(value);
      const stored = lesson.activity.kind === 'choice' && Number.isFinite(numeric) && value.trim() !== '' ? numeric : value;
      await trx
        .insertInto('answers')
        .values({ product_id: productId, question_key: key, value: JSON.stringify(stored), answered_by: userId, answered_at: now })
        .onConflict((oc) => oc.columns(['product_id', 'question_key']).doUpdateSet({ value: JSON.stringify(stored), answered_by: userId, answered_at: now }))
        .execute();
      return;
    }
    case 'field': {
      const chosen = lesson.activity.options?.find((o) => o.id === submission.optionId);
      const value = lesson.activity.kind === 'choice' ? (chosen?.label ?? submission.optionId ?? '') : text;
      if (key === 'targetSellingPrice') {
        const raw = String(submission.fields?.price ?? value ?? '');
        const n = Number(raw.replace(/[^0-9.]/g, ''));
        if (Number.isFinite(n) && n > 0) {
          await trx.updateTable('products').set({ target_price: n, updated_at: now }).where('id', '=', productId).where('workspace_id', '=', workspaceId).execute();
        }
        return;
      }
      if (!value) return;
      const column = key === 'description' ? 'description' : key === 'name' ? 'name' : key === 'notes' ? 'notes' : key === 'category' ? 'category' : null;
      if (!column) return;
      // The product stores the human label ("Electronics"), never the option id.
      const stored = key === 'category' ? (chosen?.label ?? value) : value;
      await trx
        .updateTable('products')
        .set({ [column]: stored, updated_at: now } as never)
        .where('id', '=', productId)
        .where('workspace_id', '=', workspaceId)
        .execute();
      return;
    }
    case 'costs': {
      const read = (id: string) => {
        const raw = (submission.fields?.[id] ?? '').toString().replace(/[^0-9.]/g, '');
        const n = Number(raw);
        return Number.isFinite(n) && n >= 0 ? n : null;
      };
      const labour = read('labour');
      const packaging = read('packaging');
      const overhead = read('overhead');
      const patch: Record<string, number> = {};
      if (labour !== null) patch.labour = labour;
      if (packaging !== null) patch.packaging = packaging;
      if (overhead !== null) patch.overhead = overhead;
      if (Object.keys(patch).length > 0) {
        await trx.updateTable('products').set({ ...patch, updated_at: now }).where('id', '=', productId).where('workspace_id', '=', workspaceId).execute();
      }
      return;
    }
    case 'research': {
      // A form with several numbered fields is several findings, not one blob:
      // "competitor_1" and "competitor_2" become two rows, which is what the
      // checkpoint counts.
      const entries = Object.entries(submission.fields ?? {})
        .map(([fieldId, value]) => ({ fieldId, value: (value ?? '').trim() }))
        .filter((e) => e.value.length > 0)
        .map((e) => ({
          workspace_id: workspaceId,
          product_id: productId,
          kind: key,
          title: e.value.slice(0, 200),
          detail: e.value,
          created_by: userId
        }));
      if (entries.length > 0) {
        await trx.insertInto('research_entries').values(entries).execute();
      } else {
        await trx
          .insertInto('research_entries')
          .values({ workspace_id: workspaceId, product_id: productId, kind: key, title: evidence.slice(0, 200), detail: evidence, created_by: userId })
          .execute();
      }
      return;
    }
    case 'requirement': {
      // One requirement per filled field, so "feature_1" and "feature_2" are two
      // rows and a checkpoint counting requirements sees real work.
      const rows = Object.entries(submission.fields ?? {})
        .map(([, value]) => (value ?? '').trim())
        .filter((value) => value.length > 0)
        .map((value) => {
          // "Leak-proof lid — must" carries its own priority; respect it.
          const priority: 'must' | 'should' | 'could' = /\bmust\b/i.test(value) ? 'must' : /\bcould\b/i.test(value) ? 'could' : 'should';
          return { workspace_id: workspaceId, product_id: productId, kind: key, text: value.slice(0, 400), priority };
        });
      if (rows.length > 0) await trx.insertInto('requirements').values(rows).execute();
      else
        await trx
          .insertInto('requirements')
          .values({ workspace_id: workspaceId, product_id: productId, kind: key, text: evidence.slice(0, 400), created_by: userId })
          .execute();
      return;
    }
    case 'test': {
      const fields = submission.fields ?? {};
      const name = (fields.test_name ?? 'Test').trim();
      // A test form may record several observations (test_1, test_2, …); each is
      // its own result, which is what a "two test results" criterion counts.
      const observations = Object.entries(fields)
        .filter(([fieldId]) => fieldId !== 'test_name' && fieldId !== 'test_result')
        .map(([, value]) => (value ?? '').trim())
        .filter((value) => value.length > 0);
      const results = observations.length > 0 ? observations : [(fields.test_result ?? evidence).trim()];
      await trx
        .insertInto('test_results')
        .values(
          results.map((result) => ({
            workspace_id: workspaceId,
            product_id: productId,
            name: name.slice(0, 200),
            result: result.slice(0, 2000),
            outcome: /fail/i.test(result) ? 'fail' : 'pass',
            created_by: userId
          }))
        )
        .execute();
      return;
    }
    case 'decision': {
      await trx
        .insertInto('decisions')
        .values({ workspace_id: workspaceId, product_id: productId, kind: key, decision: evidence.slice(0, 400), rationale: evidence.slice(0, 2000), created_by: userId })
        .execute();
      return;
    }
    case 'feedback': {
      const bodies = Object.entries(submission.fields ?? {})
        .map(([, value]) => (value ?? '').trim())
        .filter((value) => value.length > 0);
      const rows = (bodies.length > 0 ? bodies : [evidence])
        .map((body) => ({ workspace_id: workspaceId, product_id: productId, kind: key, body: body.slice(0, 2000), created_by: userId }));
      await trx.insertInto('feedback_items').values(rows).execute();
      return;
    }
    case 'material': {
      // A bill-of-materials form creates real material lines, so the constraint
      // is satisfied by data rather than by a tick.
      const lines = Object.entries(submission.fields ?? {})
        .map(([, value]) => (value ?? '').trim())
        .filter((value) => value.length > 0);
      for (const line of lines) {
        const materialId = await ensureMaterial(trx, workspaceId, line, productId, userId);
        const existing = await trx
          .selectFrom('product_materials')
          .select(['material_id'])
          .where('product_id', '=', productId)
          .where('material_id', '=', materialId)
          .executeTakeFirst();
        if (!existing) {
          await trx.insertInto('product_materials').values({ product_id: productId, material_id: materialId, quantity: 1 }).execute();
        }
      }
      return;
    }
    case 'task': {
      const entries = Object.entries(submission.fields ?? {})
        .map(([fieldId, value]) => ({ fieldId, value: (value ?? '').trim() }))
        .filter((e) => e.value.length >= 3);

      // A "mark done" lesson names tasks that already exist; it closes them
      // rather than creating duplicates.
      if (entries.some((e) => e.fieldId.startsWith('done_'))) {
        for (const e of entries) {
          await trx
            .updateTable('tasks')
            .set({ status: 'done', completed_at: now, updated_at: now })
            .where('product_id', '=', productId)
            .where((eb) => eb.fn('lower', ['title']), '=', e.value.toLowerCase())
            .execute();
        }
        return;
      }

      const titles = entries.map((e) => e.value);
      if (titles.length === 0) return;
      const { max } = await trx
        .selectFrom('tasks')
        .select((eb) => eb.fn.max('position').as('max'))
        .where('product_id', '=', productId)
        .executeTakeFirst()
        .then((r) => ({ max: Number(r?.max ?? 0) }));
      await trx
        .insertInto('tasks')
        .values(
          titles.map((title, i) => ({
            product_id: productId,
            title: title.slice(0, 200),
            description: '',
            status: 'todo' as const,
            due_date: null,
            position: max + 1 + i,
            completed_at: null
          }))
        )
        .execute();
      return;
    }
  }
}

/** Lessons whose bound record is created by the lesson itself. */
export function lessonCreatesRecord(lesson: Lesson): boolean {
  const creating: BindTarget[] = ['research', 'requirement', 'test', 'decision', 'feedback'];
  return creating.includes(lesson.bind.target) || (lesson.bind.target === 'field' && lesson.bind.key !== 'targetSellingPrice');
}


/**
 * Finds or creates a workspace material for a free-text bill-of-materials line.
 *
 * Lessons write lines like "Aluminium tube — 2 m — ₹180". The workspace material
 * library is the shared catalogue, so we reuse a row with the same name rather
 * than creating duplicates every time a founder revises the lesson.
 */
async function ensureMaterial(trx: Db, workspaceId: string, line: string, productId: string, userId: string): Promise<string> {
  void productId;
  void userId;
  const name = line.split(/[—–\-|,]/)[0]!.trim().slice(0, 120) || line.slice(0, 120);
  const existing = await trx
    .selectFrom('materials')
    .select(['id'])
    .where('workspace_id', '=', workspaceId)
    .where((eb) => eb.fn('lower', ['name']), '=', name.toLowerCase())
    .executeTakeFirst();
  if (existing) return existing.id;
  const created = await trx
    .insertInto('materials')
    .values({ workspace_id: workspaceId, name, category: 'Other', unit: 'pcs', unit_price: 0, description: line.slice(0, 500) })
    .returning('id')
    .executeTakeFirstOrThrow();
  return created.id;
}

/** The next lesson after this one, across the whole journey. */
export function nextLessonAfter(journey: JourneyV2, lessonId: string): SharedLessonProgress | null {
  const flat = journey.worlds.filter((w) => w.state !== 'locked').flatMap((w) => w.units.flatMap((u) => u.lessons));
  const idx = flat.findIndex((l) => l.id === lessonId);
  if (idx < 0) return null;
  return flat.slice(idx + 1).find((l) => l.state !== 'locked') ?? null;
}

/** Sanity check used by tests and the seed script: every world must have lessons. */
export function assertCurriculumWellFormed(): void {
  for (const world of WORLDS) {
    const lessons = world.units.flatMap((u) => u.lessons);
    if (lessons.length === 0) throw new Error(`${world.id} has no lessons`);
    for (const lesson of lessons) {
      if (!LESSON_BY_ID.has(lesson.id)) throw badRequest(`Unknown lesson ${lesson.id}`);
      if (worldOfLesson(lesson.id)?.id !== world.id) throw badRequest(`Lesson ${lesson.id} is in the wrong world`);
    }
  }
  if (ALL_LESSONS.length === 0) throw new Error('No lessons defined');
}
