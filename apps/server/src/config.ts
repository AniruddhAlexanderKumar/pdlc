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
  /** Preserve legacy automatic migrations by default. Controlled deployments may disable them. */
  MIGRATIONS_ON_STARTUP: bool.default(true),
  /** Session lifetime in days. Sessions slide forward while in use. */
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** When false, people can only join with an invite link from an admin. */
  ALLOW_SIGNUP: bool.default(true),
  /** Trust X-Forwarded-* headers from this many proxies (set to 1 behind nginx/Caddy). */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  RESET_SMTP_HOST: z.string().default(''),
  RESET_SMTP_FROM: z.string().default(''),
  RESET_SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  RESET_SMTP_SECURE: bool.default(false),
  RESET_SMTP_USER: z.string().default(''),
  RESET_SMTP_PASSWORD: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Insight provider: "rules" (built in) or "ai" once an AI provider is configured. */
  INSIGHTS_PROVIDER: z.enum(['rules', 'ai']).default('rules'),
  /** Optional help article ranking; only a user question and permitted published help text are sent to the AI provider. */
  HELP_AI_ENABLED: bool.default(false),
  /** Internal, opt-in API for the unfinished native sketch work. No product UI yet. */
  CAD_NATIVE_EXPERIMENTAL: bool.default(false),
  /** Local-only founder lifecycle testing. Never enabled in production. */
  FOUNDER_AUTH_EXPERIMENTAL: bool.default(false),
  /** Additional opt-in for an unfinished local-only founder customer dashboard. */
  FOUNDER_MANAGEMENT_EXPERIMENTAL: bool.default(false),
  SV_FOUNDER_TOTP_KEY: z.string().default(''),
  SV_FOUNDER_RATE_LIMIT_KEY: z.string().default(''),
  AI_BASE_URL: z.string().default('http://127.0.0.1:8091/v1'),
  AI_MODEL: z.string().default('qwen2.5-14b-instruct'),
  AI_API_KEY: z.string().optional().default(''),
  AI_NVIDIA_API_KEY: z.string().optional().default(''),
  AI_NVIDIA_BASE_URL: z.string().default('https://integrate.api.nvidia.com/v1'),
  AI_NVIDIA_MODEL: z.string().default('nvidia/nemotron-3.5-super-vl-120b-a12b'),
  AI_HEALTH_URL: z.string().default('http://127.0.0.1:8091/health'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  /** Host endpoint for llama.cpp server, e.g. http://127.0.0.1:8091 */
  LLAMA_CPP_URL: z.string().default('http://127.0.0.1:8091'),
  /** Host endpoint for local/server Ollama inference, e.g. http://127.0.0.1:11434 */
  OLLAMA_HOST: z.string().default('http://127.0.0.1:11434'),
  /** Qwen model tag to run on Ollama, e.g. qwen2.5:latest, qwen2.5:7b, qwen2.5:14b */
  QWEN_MODEL: z.string().default('qwen2.5:latest')
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
  aiBaseUrl: (parsed.data.AI_BASE_URL || 'http://127.0.0.1:8091/v1').replace(/\/+$/, ''),
  nvidiaBaseUrl: (parsed.data.AI_NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, ''),
  nvidiaModel: parsed.data.AI_NVIDIA_MODEL || 'nvidia/nemotron-3.5-super-vl-120b-a12b'
};
