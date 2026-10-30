import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  /** Public URL users open in the browser, e.g. https://velocity.example.com. Used for invite links and the CSRF origin check. */
  APP_URL: z.string().url().default('http://localhost:5173'),
  /** postgres://user:pass@host:5432/db — append ?sslmode=require for TLS to a remote database. */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  /** Session lifetime in days. Sessions slide forward while in use. */
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** When false, people can only join with an invite link from an admin. */
  ALLOW_SIGNUP: bool.default(true),
  /** Trust X-Forwarded-* headers from this many proxies (set to 1 behind nginx/Caddy). */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Insight provider: "rules" (built in) or "ai" once an AI provider is configured. */
  INSIGHTS_PROVIDER: z.enum(['rules', 'ai']).default('rules'),
  AI_BASE_URL: z.string().default('http://127.0.0.1:8091/v1'),
  AI_MODEL: z.string().default('qwen2.5-14b-instruct'),
  AI_API_KEY: z.string().optional().default(''),
  AI_HEALTH_URL: z.string().default('http://127.0.0.1:8091/health'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  /** Host endpoint for llama.cpp server, e.g. http://127.0.0.1:8080 */
  LLAMA_CPP_URL: z.string().default('http://127.0.0.1:8080'),
  /** Host endpoint for local/server Ollama inference, e.g. http://127.0.0.1:11434 */
  OLLAMA_HOST: z.string().default('http://127.0.0.1:11434'),
  /** Qwen model tag to run on Ollama, e.g. qwen2.5:latest, qwen2.5:7b, qwen2.5:14b */
  QWEN_MODEL: z.string().default('qwen2.5:latest'),
  /** Host endpoint for local Whisper STT server (OpenAI /v1/audio/transcriptions format) */
  WHISPER_URL: z.string().default('http://127.0.0.1:8081/v1/audio/transcriptions'),
  /** Whisper model tag if required by the server */
  WHISPER_MODEL: z.string().default('whisper-1')
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  appOrigin: new URL(parsed.data.APP_URL).origin,
  secureCookies: new URL(parsed.data.APP_URL).protocol === 'https:',
  aiBaseUrl: (parsed.data.AI_BASE_URL || 'http://127.0.0.1:8091/v1').replace(/\/+$/, '')
};
