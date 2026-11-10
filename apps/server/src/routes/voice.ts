import express, { Router } from 'express';
import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { z } from 'zod';
import {
  QUESTIONS_BY_KEY,
  XP,
  isAnswered,
  type VoiceImportResult
} from '@sv/shared';
import { auth, requireRole } from '../auth/session.js';
import { badRequest, conflict, HttpError, parse, route, uuid } from '../lib/http.js';
import { loadProduct } from '../services/repo.js';
import { validateVoiceDraft } from '../services/voice-validation.js';
import { processVoiceTranscript } from '../services/qwen.js';
import { transcribeAudioOnServer } from '../services/stt.js';
import { recordAnalyticsEvent } from '../services/analytics.js';
import { mutate } from './util.js';

export const voiceRouter = Router();

const processInput = z.object({
  transcript: z.string().trim().min(5, 'Spoken transcript must have at least 5 characters').max(12000)
});


const rawAudioParser = express.raw({
  type: ['audio/*', 'application/octet-stream'],
  limit: '25mb'
});

/**
 * Transcribes audio on the server via Whisper STT.
 */
voiceRouter.post(
  '/transcribe',
  rawAudioParser,
  route(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw badRequest('No audio data received. Please record or upload an audio file.');
    }
    const mimeType = req.headers['content-type'] || 'audio/webm';
    const stt = await transcribeAudioOnServer(req.body, mimeType);
    res.json(stt);
  })
);

/**
 * Full server pipeline:
 * Audio buffer -> Server Whisper STT (text) -> Server Qwen LLM (Jira JSON)
 */
voiceRouter.post(
  '/process-audio',
  rawAudioParser,
  route(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw badRequest('No audio data received. Please record or upload an audio file.');
    }
    const mimeType = req.headers['content-type'] || 'audio/webm';
    const stt = await transcribeAudioOnServer(req.body, mimeType);
    const llm = await processVoiceTranscript(stt.text);
    res.json({
      transcript: stt.text,
      data: llm.data,
      provider: `${stt.provider} + ${llm.provider}`
    });
  })
);

voiceRouter.post(
  '/process',
  route(async (req, res) => {
    const { transcript } = parse(processInput, req.body);
    const result = await processVoiceTranscript(transcript);
    try { res.json({ ...result, data: validateVoiceDraft(result.data) }); }
    catch (err) {
      if (err instanceof HttpError && err.status === 400) throw badRequest(`The generated draft is invalid: ${err.message}. Revise the transcript and try again.`);
      throw err;
    }
  })
);

voiceRouter.post(
  '/import',
  requireRole('owner', 'admin'),
  route(async (req, res) => {
    if (!req.body?.requestId || !req.body?.draft) throw badRequest('Refresh the application before importing: a draft and retry-safe request ID are required.');
    const input = parse(z.object({ requestId: uuid, draft: z.unknown() }).strict(), req.body);
    const payload = validateVoiceDraft(input.draft);
    const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const result = await mutate<VoiceImportResult>(req, async (trx, ledger, ctx) => {
      // Serialize same-key retries and project-key allocation. Receipts survive record deletion
      // so a retry cannot silently recreate work that was deliberately removed.
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${ctx.workspaceId}:${ctx.userId}:${input.requestId}`}, 0))`.execute(trx);
      const receipt = await trx.selectFrom('voice_import_receipts').selectAll().where('workspace_id', '=', ctx.workspaceId).where('user_id', '=', ctx.userId).where('request_id', '=', input.requestId).executeTakeFirst();
      if (receipt) {
        if (receipt.payload_hash !== payloadHash) throw conflict('This import request ID was already used for a different draft.');
        if (!receipt.product_id || !receipt.project_id) throw new HttpError(410, 'This import was already completed, but its product or project was deleted. It will not be recreated.', 'import_deleted');
        const project = await trx.selectFrom('projects').select('project_key').where('id', '=', receipt.project_id).where('workspace_id', '=', ctx.workspaceId).executeTakeFirst();
        if (!project) throw new HttpError(410, 'The imported project was deleted. It will not be recreated.', 'import_deleted');
        return { productId: receipt.product_id, projectId: receipt.project_id, projectKey: project.project_key, product: await loadProduct(trx, ctx.workspaceId, receipt.product_id) };
      }
      await trx.selectFrom('workspaces').select('id').where('id', '=', ctx.workspaceId).forUpdate().executeTakeFirstOrThrow();
      // 1. Ensure unique project key in workspace
      let key = payload.project.project_key;
      let counter = 1;
      while (true) {
        const existing = await trx
          .selectFrom('projects')
          .select('id')
          .where('workspace_id', '=', ctx.workspaceId)
          .where('project_key', '=', key)
          .executeTakeFirst();
        if (!existing) break;
        counter++;
        const suffix = String(counter);
        if (suffix.length >= 10) throw conflict('Unable to allocate a project key');
        key = `${payload.project.project_key.slice(0, 10 - suffix.length)}${suffix}`;
      }

      // 2. Create Project
      const projectRow = await trx
        .insertInto('projects')
        .values({
          workspace_id: ctx.workspaceId,
          project_key: key,
          name: payload.project.name,
          description: payload.project.description,
          next_issue_number: 1,
          created_by: ctx.userId,
          updated_at: new Date()
        })
        .returning(['id', 'project_key'])
        .executeTakeFirstOrThrow();

      // 3. Create Product
      const productRow = await trx
        .insertInto('products')
        .values({
          workspace_id: ctx.workspaceId,
          name: payload.product.name,
          category: payload.product.category || 'General',
          stage: payload.product.stage,
          description: payload.product.description,
          target_price: payload.product.target_price,
          labour: payload.product.labour,
          packaging: payload.product.packaging,
          overhead: payload.product.overhead,
          created_by: ctx.userId,
          updated_at: new Date()
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      const productId = productRow.id;

      // 4. Initial stage history
      await trx
        .insertInto('stage_history')
        .values({ product_id: productId, from_stage: null, to_stage: payload.product.stage, user_id: ctx.userId })
        .execute();

      // 5. Award product creation XP
      await ledger.award('product_created', productId, XP.productCreated, `Created ${payload.product.name} via voice dictation`, productId);

      // 6. Insert answers validated and normalised by the same question rules as manual entry.
      for (const ans of payload.answers) {
        const q = QUESTIONS_BY_KEY.get(ans.question_key);
        if (q && !q.retired && isAnswered(ans.value)) {
          await trx
            .insertInto('answers')
            .values({
              product_id: productId,
              question_key: q.key,
              value: JSON.stringify(ans.value),
              answered_by: ctx.userId,
              answered_at: new Date()
            })
            .onConflict((oc) =>
              oc.columns(['product_id', 'question_key']).doUpdateSet({
                value: JSON.stringify(ans.value),
                answered_by: ctx.userId,
                answered_at: new Date()
              })
            )
            .execute();

          await ledger.award('answer', `${productId}:${q.key}`, q.xp, `Answered “${q.prompt}”`, productId);

          if (q.syncsTo === 'targetSellingPrice' && typeof ans.value === 'number') {
            await trx.updateTable('products').set({ target_price: ans.value }).where('id', '=', productId).execute();
          } else if (q.syncsTo === 'description' && typeof ans.value === 'string') {
            await trx.updateTable('products').set({ description: ans.value }).where('id', '=', productId).execute();
          } else if (q.syncsTo === 'category' && typeof ans.value === 'string') {
            await trx.updateTable('products').set({ category: ans.value }).where('id', '=', productId).execute();
          }
        }
      }

      // 7. Insert Materials & BOM
      for (let pos = 0; pos < payload.materials.length; pos++) {
        const mat = payload.materials[pos];
        const matRow = await trx
          .insertInto('materials')
          .values({
            workspace_id: ctx.workspaceId,
            name: mat.name,
            category: mat.category || 'General',
            unit: mat.unit || 'pcs',
            unit_price: mat.unit_price || 0,
            description: 'Extracted from voice dictation',
            updated_at: new Date()
          })
          .returning('id')
          .executeTakeFirstOrThrow();

        await trx
          .insertInto('product_materials')
          .values({
            product_id: productId,
            material_id: matRow.id,
            quantity: mat.quantity || 1,
            position: pos
          })
          .execute();

        await ledger.award('material_added', `${productId}:${matRow.id}`, XP.materialAdded, 'Added material from voice dictation', productId);
      }

      // 8. Insert Issues and Product Tasks
      let currentIssueNumber = 1;
      for (let i = 0; i < payload.issues.length; i++) {
        const issue = payload.issues[i];
        const issueNumber = currentIssueNumber++;

        // Create explicitly linked project issue and product task.
        const issueRow = await trx
          .insertInto('issues')
          .values({
            project_id: projectRow.id,
            issue_number: issueNumber,
            type: issue.type,
            status: issue.status,
            priority: issue.priority,
            summary: issue.summary,
            description: issue.description,
            labels: issue.labels,
            reporter_id: ctx.userId,
            updated_at: new Date()
          })
          .returning('id')
          .executeTakeFirstOrThrow();

        const taskStatus = { Open: 'todo', 'In Progress': 'in_progress', Done: 'done' } as const;
        const taskRow = await trx
          .insertInto('tasks')
          .values({
            product_id: productId,
            title: issue.summary,
            description: issue.description,
            status: taskStatus[issue.status],
            completed_at: issue.status === 'Done' ? new Date() : null,
            position: i,
            updated_at: new Date()
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await trx.insertInto('voice_import_work_items').values({ task_id: taskRow.id, issue_id: issueRow.id, workspace_id: ctx.workspaceId }).execute();
      }

      await trx
        .updateTable('projects')
        .set({ next_issue_number: currentIssueNumber, updated_at: new Date() })
        .where('id', '=', projectRow.id)
        .execute();

      await trx.insertInto('voice_import_receipts').values({ workspace_id: ctx.workspaceId, user_id: ctx.userId, request_id: input.requestId, payload_hash: payloadHash, product_id: productId, project_id: projectRow.id }).execute();

      // Record analytics
      await recordAnalyticsEvent({
        eventType: 'action',
        eventName: 'product.voice_import',
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        metadata: {
          productId,
          projectId: projectRow.id,
          projectKey: projectRow.project_key,
          issuesCount: payload.issues.length,
          materialsCount: payload.materials.length
        }
      }, trx);

      const evaluated = await ledger.evaluateProduct(productId);
      return {
        productId,
        projectId: projectRow.id,
        projectKey: projectRow.project_key,
        product: evaluated.product
      };
    });

    res.status(201).json(result);
  })
);
