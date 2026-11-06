import { createHash } from 'node:crypto';
import { costSummary, formatMoney, type CurrencyCode, type Insight, type Material, type Product, type Supplier } from '@sv/shared';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import type { AiProvider, InsightInput } from './insights.js';

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiHealthStatus {
  healthy: boolean;
  status: 'ok' | 'unavailable';
  baseUrl: string;
  model: string;
  healthUrl: string;
  availableModels?: string[];
  error?: string;
}

/**
 * Verifies connectivity to the local model server:
 * 1. Health check endpoint (e.g. http://127.0.0.1:8091/health)
 * 2. Models endpoint (e.g. http://127.0.0.1:8091/v1/models)
 */
export async function checkAiHealth(): Promise<AiHealthStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(config.AI_TIMEOUT_MS, 5_000));

  try {
    const [healthRes, modelsRes] = await Promise.all([
      fetch(config.AI_HEALTH_URL, { signal: controller.signal }).catch((err) => {
        logger.debug({ err }, 'AI health probe failed');
        return null;
      }),
      fetch(`${config.aiBaseUrl}/models`, {
        signal: controller.signal,
        headers: config.AI_API_KEY ? { Authorization: `Bearer ${config.AI_API_KEY}` } : {}
      }).catch((err) => {
        logger.debug({ err }, 'AI models probe failed');
        return null;
      })
    ]);

    clearTimeout(timer);

    const isHealthy = healthRes?.ok === true;
    let availableModels: string[] = [];

    if (modelsRes?.ok) {
      try {
        const data = (await modelsRes.json()) as any;
        if (Array.isArray(data?.data)) {
          availableModels = data.data.flatMap((m: any) => [m.id, ...(m.aliases ?? [])]).filter(Boolean);
        } else if (Array.isArray(data?.models)) {
          availableModels = data.models.map((m: any) => m.name || m.id).filter(Boolean);
        }
      } catch {
        // Ignored; models list parsing failure is non-fatal if health is ok
      }
    }

    return {
      healthy: isHealthy,
      status: isHealthy ? 'ok' : 'unavailable',
      baseUrl: config.aiBaseUrl,
      model: config.AI_MODEL,
      healthUrl: config.AI_HEALTH_URL,
      availableModels
    };
  } catch (err: any) {
    clearTimeout(timer);
    return {
      healthy: false,
      status: 'unavailable',
      baseUrl: config.aiBaseUrl,
      model: config.AI_MODEL,
      healthUrl: config.AI_HEALTH_URL,
      error: err?.message || 'Connection failed'
    };
  }
}

/**
 * Fetch available models from the local model server.
 */
export async function listAiModels(): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${config.aiBaseUrl}/models`, {
      signal: controller.signal,
      headers: config.AI_API_KEY ? { Authorization: `Bearer ${config.AI_API_KEY}` } : {}
    });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`Models endpoint responded with status ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Chat completion call against the local OpenAI-compatible endpoint.
 */
export async function chatCompletion(
  messages: AiChatMessage[],
  options?: { model?: string; maxTokens?: number; temperature?: number; timeoutMs?: number }
): Promise<string> {
  const model = options?.model || config.AI_MODEL;
  const timeoutMs = options?.timeoutMs || config.AI_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (config.AI_API_KEY) {
    headers['Authorization'] = `Bearer ${config.AI_API_KEY}`;
  }

  try {
    const res = await fetch(`${config.aiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        max_tokens: options?.maxTokens ?? 350,
        temperature: options?.temperature ?? 0.3
      })
    });

    if (!res.ok) {
      throw new Error(`AI chat completion failed HTTP ${res.status}`);
    }

    const data = (await res.json()) as any;
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('AI response did not contain message content');
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Builds a prompt summarizing product, BOM, lifecycle stage, and cost structure.
 */
function buildProductPrompt(product: Product, materials: Map<string, Material>, currency: CurrencyCode): string {
  const summary = costSummary(product, materials);
  const fmt = (n: number) => formatMoney(n, currency);

  const bomDetails = summary.lines
    .filter((l) => l.material)
    .map((l) => `- ${l.material!.name}: ${l.quantity} ${l.material!.unit} @ ${fmt(l.unitPrice)} each = ${fmt(l.lineCost)}`)
    .join('\n');

  const answersList = Object.entries(product.answers)
    .slice(0, 8)
    .map(([k, v]) => `- ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join('\n');

  return [
    `Product Name: ${product.name}`,
    `Lifecycle Stage: ${product.stage}`,
    product.category ? `Category: ${product.category}` : null,
    product.description ? `Description: ${product.description}` : null,
    `Total Unit Cost: ${fmt(summary.totalUnitCost)} (Materials: ${fmt(summary.materialsCost)}, Labour: ${fmt(summary.labour)}, Packaging: ${fmt(summary.packaging)}, Overhead: ${fmt(summary.overhead)})`,
    summary.targetPrice ? `Target Price: ${fmt(summary.targetPrice)}` : 'Target Price: Not set',
    summary.grossMargin !== null ? `Current Gross Margin: ${summary.grossMargin}%` : null,
    bomDetails ? `Bill of Materials:\n${bomDetails}` : null,
    answersList ? `Key Discovery Answers:\n${answersList}` : null
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Extracts and parses a JSON array of suggestions from model output.
 */
function parseAiInsightsJson(raw: string, productId: string): Insight[] {
  // Strip markdown code fences if present (e.g. ```json ... ```)
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // If wrapping text was included, try extracting the substring from first '[' to last ']'
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start !== -1 && end > start) {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } else {
      throw new Error('Failed to parse AI response as JSON array');
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error('AI response JSON was not an array');
  }

  const allowedKinds = new Set<Insight['kind']>(['discovery', 'pricing', 'margin', 'tasks', 'costs', 'supplier', 'stage']);
  const allowedTones = new Set<Insight['tone']>(['tip', 'win', 'warning']);
  const allowedTabs = new Set(['discover', 'materials', 'costs', 'tasks', 'overview'] as const);

  const insights: Insight[] = [];

  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const title = typeof item.title === 'string' ? item.title.trim().slice(0, 120) : '';
    const detail = typeof item.detail === 'string' ? item.detail.trim().slice(0, 400) : '';
    if (!title || !detail) continue;

    const kind: Insight['kind'] = allowedKinds.has(item.kind) ? item.kind : 'discovery';
    const tone: Insight['tone'] = allowedTones.has(item.tone) ? item.tone : 'tip';

    // Compute a stable ID for idempotent rendering
    const hash = createHash('sha256').update(`${title}:${detail}`).digest('hex').slice(0, 12);
    const id = `ai:${productId}:${hash}`;

    const action =
      typeof item.tab === 'string' && allowedTabs.has(item.tab as any)
        ? { type: 'open_tab' as const, tab: item.tab as 'discover' | 'materials' | 'costs' | 'tasks' | 'overview' }
        : undefined;

    insights.push({
      id,
      kind,
      tone,
      title,
      detail,
      action,
      source: 'ai'
    });
  }

  return insights;
}

/**
 * Local AI Provider implementation for Solution Velocity.
 * Powered by local llama.cpp server with Qwen 2.5 14B Instruct.
 */
export const localAiProvider: AiProvider = {
  name: 'local-qwen2.5-14b',

  async insights(input: InsightInput): Promise<Insight[]> {
    const productInfo = buildProductPrompt(input.product, input.materials, input.currency);

    const systemPrompt = [
      'You are a senior Product Development Lifecycle (PDLC) advisor analyzing hardware and software products.',
      'Analyze the product state (lifecycle stage, bill of materials, cost breakdown, discovery answers).',
      'Provide 2 to 3 concise, highly actionable, strategic improvements or risk warnings.',
      'Respond strictly with a JSON array of objects with keys:',
      '- "kind": "discovery" | "pricing" | "margin" | "tasks" | "costs" | "supplier" | "stage"',
      '- "tone": "tip" | "win" | "warning"',
      '- "title": short, punchy recommendation (max 50 characters)',
      '- "detail": practical advice in 1-2 sentences',
      '- "tab": optional string ("discover" | "materials" | "costs" | "tasks" | "overview")',
      'Return ONLY the JSON array. Do not include markdown formatting or commentary outside the JSON array.'
    ].join('\n');

    const rawResponse = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Here is the current product information:\n\n${productInfo}` }
    ], {
      maxTokens: 350,
      temperature: 0.3
    });

    return parseAiInsightsJson(rawResponse, input.product.id);
  },

  async followUpQuestions(input: InsightInput): Promise<{ prompt: string; why: string }[]> {
    const productInfo = buildProductPrompt(input.product, input.materials, input.currency);

    const systemPrompt = [
      'You are an expert product development interrogator.',
      'Based on the product details and answered discovery questions, generate 2 follow-up discovery questions that uncover critical assumptions, market viability, or engineering bottlenecks.',
      'Respond strictly with a JSON array of objects with keys:',
      '- "prompt": the follow-up question',
      '- "why": concise explanation of why this question is crucial at this stage',
      'Return ONLY the JSON array.'
    ].join('\n');

    const raw = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: productInfo }
    ], {
      maxTokens: 300,
      temperature: 0.3
    });

    try {
      const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const list = JSON.parse(cleaned);
      if (Array.isArray(list)) {
        return list
          .filter((item) => item?.prompt && item?.why)
          .map((item) => ({ prompt: String(item.prompt).slice(0, 200), why: String(item.why).slice(0, 250) }));
      }
    } catch (err) {
      logger.debug({ err }, 'Failed to parse AI follow-up questions');
    }
    return [];
  }
};
