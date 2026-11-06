import express from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { parse, route } from '../lib/http.js';
import { checkAiHealth, chatCompletion, listAiModels, type AiChatMessage } from '../services/ai.js';

export const aiRouter = express.Router();

/**
 * Public health check for the local AI model.
 * Verifies both the health probe and models listing on 127.0.0.1:8091.
 */
aiRouter.get(
  '/health',
  route(async (_req, res) => {
    const health = await checkAiHealth();
    res.status(health.healthy ? 200 : 503).json(health);
  })
);

/**
 * Lists available models from the local AI server.
 */
aiRouter.get(
  '/models',
  route(async (_req, res) => {
    const models = await listAiModels();
    res.json(models);
  })
);

const chatBody = z.object({
  prompt: z.string().min(1).max(4000).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string().min(1).max(8000)
      })
    )
    .optional(),
  maxTokens: z.number().int().positive().max(2048).optional(),
  temperature: z.number().min(0).max(1).optional()
});

/**
 * Chat completion using the local AI model.
 */
aiRouter.post(
  '/chat',
  route(async (req, res) => {
    const body = parse(chatBody, req.body);
    let messages: AiChatMessage[] = [];

    if (body.messages && body.messages.length > 0) {
      messages = body.messages;
    } else if (body.prompt) {
      messages = [{ role: 'user', content: body.prompt }];
    } else {
      res.status(400).json({ error: 'Either prompt or messages must be provided' });
      return;
    }

    const reply = await chatCompletion(messages, {
      maxTokens: body.maxTokens,
      temperature: body.temperature
    });

    res.json({
      model: config.AI_MODEL,
      message: {
        role: 'assistant',
        content: reply
      }
    });
  })
);
