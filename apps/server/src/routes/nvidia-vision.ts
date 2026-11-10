import express from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { analyzeTrafficSign, analyzeWithNvidiaVision, type NvidiaVisionMessage } from '../services/nvidia-vision.js';
import { route } from '../lib/http.js';
import { logger } from '../lib/logger.js';

export const nvidiaVisionRouter = express.Router();

const trafficSignBody = z.object({
  imageUrl: z.string().min(1).describe('URL of the traffic sign image'),
  textPrompt: z.string().min(1).max(500).optional().describe('Custom prompt for the AI vision analysis'),
});

/**
 * Analyze a traffic sign from an image URL.
 * Reads the sign text and color using NVIDIA's vision model.
 */
nvidiaVisionRouter.post(
  '/traffic-sign',
  route(async (req, res) => {
    const body = trafficSignBody.parse(req.body);
    const prompt = body.textPrompt || 'Read the traffic sign in this image. What does it say, and what color is the sign?';
    
    try {
      const result = await analyzeTrafficSign(body.imageUrl, prompt);
      res.json({
        success: true,
        signText: result,
        imageUrl: body.imageUrl,
        model: config.AI_NVIDIA_MODEL || 'nvidia/nemotron-3.5-super-vl-120b-a12b'
      });
    } catch (error: any) {
      logger.debug({ error: error.message }, 'Traffic sign analysis failed');
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to analyze traffic sign'
      });
    }
  })
);

/**
 * General NVIDIA vision analysis.
 * Accepts custom messages with text and/or image URLs.
 */
nvidiaVisionRouter.post(
  '/analyze',
  route(async (req, res) => {
    const body = z.object({
      messages: z.array(
        z.object({
          type: z.enum(['text', 'image_url']),
          text: z.string().optional(),
          image_url: z.object({
            url: z.string().url()
          }).optional()
        })
      ).optional(),
      model: z.string().optional()
    }).parse(req.body);
    
    try {
      const messages: NvidiaVisionMessage[] = body.messages?.map((m: any) => ({
        type: m.type,
        text: m.text,
        image_url: m.image_url?.url ? { url: m.image_url.url } : undefined
      })) || [];
      
      const result = await analyzeWithNvidiaVision(messages, {
        model: body.model
      });
      
      res.json({
        success: true,
        result,
        model: body.model || config.AI_NVIDIA_MODEL || 'nvidia/nemotron-3.5-super-vl-120b-a12b'
      });
    } catch (error: any) {
      logger.debug({ error: error.message }, 'NVIDIA vision analysis failed');
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to perform vision analysis'
      });
    }
  })
);

/**
 * Health check for NVIDIA vision API.
 */
nvidiaVisionRouter.get(
  '/health',
  route(async (_req, res) => {
    try {
      const health = await checkNvidiaVisionHealth();
      res.json(health);
    } catch (error: any) {
      res.status(503).json({
        healthy: false,
        error: error.message || 'NVIDIA vision API unavailable'
      });
    }
  })
);

async function checkNvidiaVisionHealth(): Promise<{ healthy: boolean; model: string }> {
  const nvidiaApiKey = config.AI_NVIDIA_API_KEY || config.AI_API_KEY;
  if (!nvidiaApiKey) {
    return { healthy: false, model: config.AI_NVIDIA_MODEL || 'nvidia/nemotron-3.5-super-vl-120b-a12b' };
  }
  try {
    const apiBaseUrl = config.AI_NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
    const res = await fetch(`${apiBaseUrl}/models`, {
      headers: { Authorization: `Bearer ${nvidiaApiKey}` }
    });
    return { healthy: res.ok, model: config.AI_NVIDIA_MODEL || 'nvidia/nemotron-3.5-super-vl-120b-a12b' };
  } catch {
    return { healthy: false, model: config.AI_NVIDIA_MODEL || 'nvidia/nemotron-3.5-super-vl-120b-a12b' };
  }
}