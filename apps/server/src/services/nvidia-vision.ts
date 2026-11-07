import { config } from '../config.js';
import { logger } from '../lib/logger.js';

export interface NvidiaVisionMessage {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
  };
}

export interface NvidiaVisionResponse {
  role: 'assistant';
  content: string;
  image?: string;
  width?: number;
  height?: number;
}

/**
 * Analyze with NVIDIA vision model
 */
export async function analyzeWithNvidiaVision(
  messages: NvidiaVisionMessage[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  }
): Promise<string> {
  // Use configured NVIDIA model with fallback
  const model = options?.model || (config.AI_NVIDIA_MODEL || 'nvidia/nemotron-3.5-super-vl-120b-a12b');
  const temperature = options?.temperature ?? 0.3;
  const maxTokens = options?.maxTokens ?? 16384;
  const timeoutMs = options?.timeoutMs ?? 60_000;

  // Check if NVIDIA API key is configured
  const nvidiaApiKey = config.AI_NVIDIA_API_KEY || config.AI_API_KEY;
  if (!nvidiaApiKey) {
    throw new Error('NVIDIA_API_KEY or AI_API_KEY not configured');
  }

  const apiBaseUrl = config.AI_NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const formattedMessages = messages.map(msg => {
      const base: any = {
        role: 'user' as const,
        content: []
      };

      if (msg.type === 'text' && msg.text) {
        base.content.push({ type: 'text', text: msg.text });
      }

      if (msg.type === 'image_url' && msg.image_url?.url) {
        base.content.push({
          type: 'image_url' as const,
          image_url: { url: msg.image_url.url }
        });
      }

      return base;
    });

    const controller2 = new AbortController();
    const timer2 = setTimeout(() => controller2.abort(), timeoutMs);

    const res = await fetch(`${apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${nvidiaApiKey}`
      },
      signal: controller2.signal,
      body: JSON.stringify({
        model,
        messages: formattedMessages,
        temperature,
        max_tokens: maxTokens
      })
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errTxt = await res.text();
      logger.debug({ status: res.status, error: errTxt }, 'NVIDIA vision API error');
      throw new Error(`NVIDIA vision API failed HTTP ${res.status}: ${errTxt}`);
    }

    const data = (await res.json()) as any;
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('NVIDIA vision response did not contain message content');
    }
    return content;
  } catch (err: any) {
    clearTimeout(timer);
    logger.error({ err: err.message, model }, 'NVIDIA vision analysis failed');
    throw err;
  }
}

/**
 * Analyze a traffic sign from an image URL
 */
export async function analyzeTrafficSign(
  imageUrl: string,
  textPrompt: string = 'Read the traffic sign in this image. What does it says, and what color is the sign?'
): Promise<string> {
  const messages: NvidiaVisionMessage[] = [
    { type: 'text', text: textPrompt },
    { type: 'image_url', image_url: { url: imageUrl } }
  ];

  return analyzeWithNvidiaVision(messages);
}

/**
 * General chat with vision support
 */
export async function chatWithVision(
  text: string,
  imageUrl: string,
  systemPrompt?: string
): Promise<string> {
  const messages: NvidiaVisionMessage[] = [
    { type: 'text', text: systemPrompt || 'You are a helpful assistant.' },
    { type: 'text', text: text },
    { type: 'image_url', image_url: { url: imageUrl } }
  ];

  return analyzeWithNvidiaVision(messages as any);
}

export default {
  analyzeWithNvidiaVision,
  analyzeTrafficSign,
  chatWithVision,
  checkHealth: async (): Promise<{ healthy: boolean; model: string }> => {
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
};