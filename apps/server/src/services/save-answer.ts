import { sql } from 'kysely';
import { lessonEvidence, isAnswered, requiresApproval, type AnswerValue, type Question } from '@sv/shared';
import type { Db } from '../db/index.js';
import { conflict, forbidden } from '../lib/http.js';
import { upsertRecord } from './collaboration.js';
import { notifyUnblocked } from './notifications.js';
import { syncedProductFields } from './question-validation.js';
import { touchProduct } from './repo.js';
import type { XpLedger } from './xp.js';

/** Write one normalised answer in the caller's transaction. The caller must own
 * the workspace-scoped product lock (or have just inserted the product). Voice
 * and manual writes share sign-off invalidation, timestamps, field sync and XP. */
export async function saveAnswer(
  trx: Db,
  ledger: XpLedger,
  id: string,
  question: Question,
  value: AnswerValue,
  expected?: unknown
) {
  const ctx = ledger.ctx;
  const record = await trx
    .selectFrom('activity_records')
    .select(['assignee_id', 'started_at'])
    .where('product_id', '=', id)
    .where('activity_key', '=', question.key)
    .executeTakeFirst();
  if (ctx.role === 'member' && record?.assignee_id && record.assignee_id !== ctx.userId)
    throw forbidden('This activity is assigned to another teammate.');
  // pg has already decoded JSONB (including ordinary strings). Read BEFORE
  // writing, both for optimistic edits and prerequisite notifications.
  const row = await trx
    .selectFrom('answers')
    .select('value')
    .where('product_id', '=', id)
    .where('question_key', '=', question.key)
    .executeTakeFirst();
  const previous = (row?.value ?? null) as AnswerValue;
  const changed = JSON.stringify(value) !== JSON.stringify(previous);
  if (changed && expected !== undefined && JSON.stringify(expected) !== JSON.stringify(previous)) {
    throw conflict('This answer changed since you started. Review the latest version before replacing it.');
  }
  if (changed) {
    const now = new Date();
    const filled = isAnswered(value);
    if (filled) {
      await sql`INSERT INTO builder_activity_days(workspace_id,user_id) VALUES(${ctx.workspaceId},${ctx.userId}) ON CONFLICT DO NOTHING`.execute(
        trx
      );
      const fields = { value: JSON.stringify(value), answered_by: ctx.userId, answered_at: now };
      await trx
        .insertInto('answers')
        .values({ product_id: id, question_key: question.key, ...fields })
        .onConflict((oc) => oc.columns(['product_id', 'question_key']).doUpdateSet(fields))
        .execute();
      if (lessonEvidence(question, value) && !lessonEvidence(question, previous))
        await ledger.award(
          'answer',
          `${id}:${question.key}`,
          question.xp,
          `Recorded ${question.output.toLowerCase()}`,
          id
        );
      const synced = syncedProductFields(question, value);
      if (synced) await trx.updateTable('products').set(synced).where('id', '=', id).execute();
    } else {
      await trx
        .deleteFrom('answers')
        .where('product_id', '=', id)
        .where('question_key', '=', question.key)
        .execute();
    }
    const complete = lessonEvidence(question, value) && !requiresApproval(question.key);
    await upsertRecord(trx, id, question.key, {
      status: complete ? 'completed' : filled ? 'in_progress' : 'not_started',
      startedAt: record?.started_at ?? now,
      completedBy: complete ? ctx.userId : null,
      completedAt: complete ? now : null,
      reviewState: 'none',
      reviewRequestedAt: null,
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: ''
    });
    if (complete)
      await notifyUnblocked(trx, {
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        productId: id,
        completedKey: question.key,
        completedLabel: question.prompt,
        wasAlreadyDone: isAnswered(previous)
      });
    await touchProduct(trx, id);
  }
  await trx
    .deleteFrom('activity_drafts')
    .where('product_id', '=', id)
    .where('user_id', '=', ctx.userId)
    .where('question_key', '=', question.key)
    .execute();
}