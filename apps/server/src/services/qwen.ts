import { STAGE_IDS, type VoiceImportPayload, type VoiceProcessResult } from '@sv/shared';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

const QWEN_SYSTEM_PROMPT = `You are the Lead Product Architect and Agile Coach for "Jira for Beginners" inside Solution Velocity.
Your job is to analyze a creator's spoken voice notes about their product and transform them into an actionable, beginner-friendly product roadmap and database import payload.

### CORE OBJECTIVES
1. DISTILL VERBAL RAMBLING: Filter out speech disfluencies, stuttering, filler words ("um", "like", "you know"), and acoustic glitches.
2. JIRA FOR BEGINNERS:
   - No confusing agile bureaucracy (no story points, no burn-down charts, no sprint ceremonies).
   - Milestones: Intuitive, plain-English human goals (e.g. "Build Working Prototype", "Launch Pre-Order Site").
   - User Stories: Clear, beginner-friendly format ("As a [User], I want [Feature] so that [Benefit]").
   - Actionable Tasks: Bite-sized tasks with a concrete "Definition of Done" checklist (2-3 checkbox items: - [ ] item).
   - Priority: 'Low', 'Medium', 'High', 'Critical'.
3. AUTO-ANSWER DISCOVERY QUESTIONS:
   The app normally asks tedious form questions. Deduce answers directly from what was spoken so the creator can skip manual forms:
   - idea.problem: The core problem solved in customer terms.
   - idea.customer: Specific target persona.
   - idea.oneliner: One-sentence elevator pitch.
   - idea.category: Primary category (e.g. "Electronics", "Hardware", "Consumer Goods", "Software").
   - idea.pricing: Target retail price (number).
   - research.competitors: Alternative products or competitors mentioned.
   - research.unique: Why this product is different/better.
   - planning.target_date: Target launch/prototype date (YYYY-MM-DD or null).
4. HARDWARE & BILL OF MATERIALS (BOM):
   Extract physical components, materials, packaging, and tools with estimated unit price and quantities.

### OUTPUT FORMAT
Output ONLY a single valid JSON object with no markdown fences, no explanatory text before or after. Strictly adhere to this JSON structure:
{
  "product": {
    "name": string,
    "category": string,
    "stage": "Idea" | "Research" | "Planning" | "Design" | "Prototype" | "Testing" | "Launch" | "Improvement",
    "description": string,
    "target_price": number | null,
    "labour": number,
    "packaging": number,
    "overhead": number
  },
  "answers": [
    { "question_key": string, "value": string | number | boolean }
  ],
  "materials": [
    { "name": string, "category": string, "unit": string, "unit_price": number, "quantity": number }
  ],
  "project": {
    "project_key": string, // 2-5 uppercase letters, e.g. "FLOW", "VENT"
    "name": string,
    "description": string
  },
  "issues": [
    {
      "type": "Story" | "Task" | "Bug",
      "status": "Open",
      "priority": "Low" | "Medium" | "High" | "Critical",
      "summary": string,
      "description": string,
      "labels": string[],
      "milestone_tag": string
    }
  ]
}`;

function cleanJsonString(str: string): string {
  // Strip reasoning / CoT thinking blocks (e.g. <think>...</think> from Qwen3 / DeepSeek / QwQ)
  let cleaned = str.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // If model was cut off mid-thought or output raw thoughts without closing tag
  if (cleaned.includes('<think>')) {
    cleaned = cleaned.replace(/<think>[\s\S]*/gi, '').trim();
  }
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();
  // Look for first '{' and last '}' to cleanly extract JSON payload
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return cleaned.slice(firstBrace, lastBrace + 1).trim();
  }
  return cleaned;
}

function repairTruncatedJson(str: string): string {
  let inString = false;
  let escape = false;
  const stack: string[] = [];

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === '{') stack.push('}');
      else if (ch === '[') stack.push(']');
      else if (ch === '}' || ch === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === ch) {
          stack.pop();
        }
      }
    }
  }

  let result = str;
  if (inString) {
    result += '"';
  }
  result = result.replace(/,\s*$/, '');
  while (stack.length > 0) {
    result += stack.pop();
  }
  return result;
}

function safeParseJson(raw: string): any {
  const cleaned = cleanJsonString(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    const repaired = repairTruncatedJson(cleaned);
    return JSON.parse(repaired);
  }
}

function sanitizeKey(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean || !/^[A-Z]/.test(clean)) return 'PROJ';
  return clean.slice(0, 5);
}

/**
 * Intelligent server-side heuristic fallback when Ollama is not active on the host,
 * ensuring users can always test the end-to-end voice onboarding flow smoothly.
 */
function heuristicFallback(transcript: string): VoiceImportPayload {
  const lower = transcript.toLowerCase();

  // Deduce product title
  let name = 'New Innovative Product';
  const nameMatch = transcript.match(/(?:building|making|creating|called|named|product is|idea is)\s+(?:a|an|the)?\s*([A-Za-z0-9\s-]{3,40}?)(?=[.,\n]|for|that|which|to)/i);
  if (nameMatch && nameMatch[1].trim().length > 2) {
    name = nameMatch[1].trim();
  } else {
    const firstWords = transcript.split(/\s+/).slice(0, 5).join(' ');
    if (firstWords.length > 5) name = firstWords.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  }

  // Deduce price
  let targetPrice: number | null = null;
  const priceMatch = transcript.match(/\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:dollars|bucks|retail|sell for|price)/i) || transcript.match(/(?:retail|sell for|price of)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i);
  if (priceMatch) {
    targetPrice = parseFloat(priceMatch[1]);
  }

  const projectKey = sanitizeKey(name.split(/\s+/)[0] || 'PROJ');

  return {
    product: {
      name: name.charAt(0).toUpperCase() + name.slice(1),
      category: lower.includes('software') || lower.includes('app') ? 'Software' : 'Hardware & Electronics',
      stage: 'Prototype',
      description: transcript.length > 300 ? transcript.slice(0, 300).trim() + '…' : transcript.trim(),
      target_price: targetPrice || 49.0,
      labour: 5.0,
      packaging: 2.5,
      overhead: 2.0
    },
    answers: [
      {
        question_key: 'idea.problem',
        value: transcript.length > 40 ? transcript.slice(0, 150) : 'Existing products are inconvenient, overpriced, or lack proper ergonomic design.'
      },
      {
        question_key: 'idea.customer',
        value: 'Builders, makers, and enthusiasts who value high craftsmanship.'
      },
      {
        question_key: 'idea.oneliner',
        value: `${name} — built for creators looking for reliable, high-performance daily gear.`
      },
      {
        question_key: 'idea.category',
        value: lower.includes('software') ? 'Software' : 'Hardware'
      },
      {
        question_key: 'idea.pricing',
        value: targetPrice || 49.0
      },
      {
        question_key: 'research.unique',
        value: 'Custom tuned design with premium materials and zero unnecessary bulk.'
      }
    ],
    materials: [
      {
        name: 'Custom Machined / 3D Printed Housing',
        category: 'Enclosure',
        unit: 'pcs',
        unit_price: 6.5,
        quantity: 1
      },
      {
        name: 'Internal Core Assembly & PCB Module',
        category: 'Electronics',
        unit: 'pcs',
        unit_price: 8.2,
        quantity: 1
      },
      {
        name: 'Recycled Kraft Packaging Box',
        category: 'Packaging',
        unit: 'pcs',
        unit_price: 1.8,
        quantity: 1
      }
    ],
    project: {
      project_key: projectKey,
      name: `${name} Project`,
      description: `Hands-free beginner roadmap to build, validate, and ship ${name}.`
    },
    issues: [
      {
        type: 'Story',
        status: 'Open',
        priority: 'High',
        summary: `As an early user, I want a reliable ${name} prototype so I can test its core functionality`,
        description: `Context: First tangible functional build based on creator dictation.\n\nDefinition of Done:\n- [ ] Assemble alpha test bench unit\n- [ ] Validate basic power and mechanical fit\n- [ ] Log test observations and user feedback`,
        labels: ['v1-mvp', 'prototype', 'must-have'],
        milestone_tag: 'M1: Alpha Prototype'
      },
      {
        type: 'Task',
        status: 'Open',
        priority: 'Critical',
        summary: 'Source core components and compare 3 vendor quotes',
        description: `Context: Verify lead times and pricing for baseline production run.\n\nDefinition of Done:\n- [ ] Contact at least 2 potential suppliers\n- [ ] Verify MOQ (Minimum Order Quantity) under 100 units\n- [ ] Record unit prices in the Bill of Materials`,
        labels: ['sourcing', 'quick-win'],
        milestone_tag: 'M1: Alpha Prototype'
      },
      {
        type: 'Task',
        status: 'Open',
        priority: 'Medium',
        summary: 'Create landing page with waitlist signup',
        description: `Context: Collect email signups before full manufacturing commitment.\n\nDefinition of Done:\n- [ ] Draft 1-page site with product value proposition\n- [ ] Connect email capture form\n- [ ] Share with 10 community members for early interest`,
        labels: ['launch', 'marketing'],
        milestone_tag: 'M2: Pre-Launch'
      }
    ]
  };
}

export async function processVoiceTranscript(transcript: string): Promise<VoiceProcessResult> {
  const trimmed = transcript.trim();
  if (!trimmed) {
    throw new Error('Transcript cannot be empty');
  }

  // 1. Attempt llama.cpp server (OpenAI-compatible /v1/chat/completions)
  try {
    const controller = new AbortController();
    // Allow up to 120s in case CPU-only inference takes extra time
    const timeoutId = setTimeout(() => controller.abort(), 120_000);

    let baseUrl = config.LLAMA_CPP_URL || 'http://127.0.0.1:8091';
    if (baseUrl.includes('8080') && config.AI_BASE_URL) {
      baseUrl = config.aiBaseUrl;
    }
    const endpoint = baseUrl.endsWith('/chat/completions')
      ? baseUrl
      : baseUrl.endsWith('/v1')
      ? `${baseUrl}/chat/completions`
      : `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
    logger.info({ url: endpoint }, 'Attempting server-side Qwen inference via llama.cpp / local AI server');

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.AI_API_KEY) {
      headers['Authorization'] = `Bearer ${config.AI_API_KEY}`;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.AI_MODEL || 'qwen2.5-14b-instruct',
        messages: [
          { role: 'system', content: QWEN_SYSTEM_PROMPT },
          { role: 'user', content: `Spoken Voice Transcription:\n${trimmed}\n\nJSON Output:` }
        ],
        temperature: 0.2,
        max_tokens: 1200,
        response_format: { type: 'json_object' }
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        const parsed = safeParseJson(content) as VoiceImportPayload;
        if (parsed.product && parsed.project && Array.isArray(parsed.issues)) {
          if (!STAGE_IDS.includes(parsed.product.stage as any)) {
            parsed.product.stage = 'Prototype';
          }
          parsed.project.project_key = sanitizeKey(parsed.project.project_key || 'PROJ');
          logger.info({ projectKey: parsed.project.project_key }, 'Successfully synthesized with llama.cpp Qwen');
          return { data: parsed, provider: 'llama-cpp' };
        }
      }
    }
  } catch (err: any) {
    logger.info({ err: err?.message }, 'llama.cpp not reachable or timed out; checking Ollama');
  }

  // 2. Attempt Server-side Ollama running Qwen 2.5
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25_000);

    const ollamaUrl = `${config.OLLAMA_HOST.replace(/\/$/, '')}/api/generate`;
    logger.info({ host: config.OLLAMA_HOST, model: config.QWEN_MODEL }, 'Attempting server-side Qwen inference via Ollama');

    const res = await fetch(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.QWEN_MODEL,
        prompt: `${QWEN_SYSTEM_PROMPT}\n\nSpoken Voice Transcription:\n${trimmed}\n\nJSON Output:`,
        stream: false,
        format: 'json'
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = (await res.json()) as { response?: string };
      if (data.response) {
        const parsed = JSON.parse(cleanJsonString(data.response)) as VoiceImportPayload;
        if (parsed.product && parsed.project && Array.isArray(parsed.issues)) {
          // Validate stage
          if (!STAGE_IDS.includes(parsed.product.stage as any)) {
            parsed.product.stage = 'Prototype';
          }
          parsed.project.project_key = sanitizeKey(parsed.project.project_key || 'PROJ');
          logger.info({ projectKey: parsed.project.project_key }, 'Successfully synthesized with server Qwen');
          return { data: parsed, provider: 'qwen' };
        }
      }
    }
  } catch (err: any) {
    logger.warn({ err: err?.message }, 'Server Ollama Qwen not reachable or timed out; evaluating fallback');
  }

  // 3. Fallback: Intelligent server heuristic generator
  logger.info('Using server fallback engine to structure voice transcript');
  const fallbackData = heuristicFallback(trimmed);
  return { data: fallbackData, provider: 'server_fallback' };
}
