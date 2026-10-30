import express, { Router } from 'express';
import { sql } from 'kysely';
import { z } from 'zod';
import {
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  ISSUE_TYPES,
  QUESTIONS_BY_KEY,
  STAGE_IDS,
  XP,
  formatIssueKey,
  isAnswered,
  type VoiceImportPayload,
  type VoiceImportResult
} from '@sv/shared';
import { auth } from '../auth/session.js';
import { badRequest, parse, route, shortText } from '../lib/http.js';
import { processVoiceTranscript } from '../services/qwen.js';
import { transcribeAudioOnServer } from '../services/stt.js';
import { recordAnalyticsEvent } from '../services/analytics.js';
import { mutate } from './util.js';

export const voiceRouter = Router();

const processInput = z.object({
  transcript: z.string().min(5, 'Spoken transcript must have at least 5 characters')
});

const voiceImportSchema = z.object({
  product: z.object({
    name: shortText(120).min(1, 'Product name is required'),
    category: shortText(60).default('General'),
    stage: z.enum(STAGE_IDS).default('Prototype'),
    description: shortText(2000).default(''),
    target_price: z.number().nullable().default(null),
    labour: z.number().min(0).default(0),
    packaging: z.number().min(0).default(0),
    overhead: z.number().min(0).default(0)
  }),
  answers: z.array(
    z.object({
      question_key: z.string(),
      value: z.union([z.string(), z.number(), z.boolean()])
    })
  ).default([]),
  materials: z.array(
    z.object({
      name: shortText(120).min(1),
      category: shortText(60).default('General'),
      unit: shortText(20).default('pcs'),
      unit_price: z.number().min(0).default(0),
      quantity: z.number().positive().default(1)
    })
  ).default([]),
  project: z.object({
    project_key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,9}$/, 'Project key must be 2-10 alphanumeric characters'),
    name: shortText(120).min(1),
    description: shortText(2000).default('')
  }),
  issues: z.array(
    z.object({
      type: z.enum(ISSUE_TYPES).default('Task'),
      status: z.enum(ISSUE_STATUSES).default('Open'),
      priority: z.enum(ISSUE_PRIORITIES).default('Medium'),
      summary: shortText(200).min(1),
      description: shortText(5000).default(''),
      labels: z.array(shortText(32)).default([]),
      milestone_tag: shortText(60).optional()
    })
  ).default([])
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
    res.json(result);
  })
);

voiceRouter.post(
  '/import',
  route(async (req, res) => {
    const payload = parse(voiceImportSchema, req.body);
    const result = await mutate<VoiceImportResult>(req, async (trx, ledger, ctx) => {
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
        key = `${payload.project.project_key.slice(0, 7)}${counter}`;
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

      // 6. Insert Discovery Answers (Bypassing manual forms!)
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

        // Add to Jira issues
        await trx
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
          .execute();

        // Also add to Product Tasks so tasks appear on the product page
        await trx
          .insertInto('tasks')
          .values({
            product_id: productId,
            title: issue.summary,
            description: issue.description,
            status: 'todo',
            position: i,
            updated_at: new Date()
          })
          .execute();
      }

      await trx
        .updateTable('projects')
        .set({ next_issue_number: currentIssueNumber, updated_at: new Date() })
        .where('id', '=', projectRow.id)
        .execute();

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
      });

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
