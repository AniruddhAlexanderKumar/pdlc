import { z } from "zod";

/**
 * Runtime environment schema.
 *
 * This is the single source of truth for every environment variable the
 * application depends on. Anything read via `process.env` elsewhere in the
 * codebase should instead be read from the validated `env` export below —
 * that keeps a missing or malformed variable a loud, immediate boot failure
 * instead of a silent `undefined` surfacing three layers deep at runtime.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine((value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    }, "DATABASE_URL must be a valid connection string (e.g. postgresql://user:pass@host:5432/db)"),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  /**
   * Session lifetime in days. Finite by design — sessions are never
   * open-ended, and expiry is enforced server-side against the stored
   * `expiresAt`, not by trusting the cookie.
   */
  SESSION_TTL_DAYS: z.coerce.number().int().positive().max(365).default(30),

  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("PDLC Platform"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parses and validates a raw environment source against {@link envSchema}.
 * Kept separate from the eager `env` singleton below so it can be unit
 * tested with arbitrary fixtures instead of mutating `process.env`.
 */
export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }

  return result.data;
}

/**
 * Validated, typed environment variables for the running process.
 * Import this instead of touching `process.env` directly.
 */
export const env = parseEnv();
