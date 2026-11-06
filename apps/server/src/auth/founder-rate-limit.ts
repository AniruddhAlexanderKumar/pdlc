import { createHmac } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../db/schema.js';

export type FounderRateAction = 'login' | 'mfa_setup' | 'mfa_verify' | 'password_rotate' | 'password_recovery' | 'mfa_reset' | 'bootstrap';
export interface RatePolicy { freeAttempts: number; windowSeconds: number; firstDelaySeconds: number; maxDelaySeconds: number }
export interface RateDecision { allowed: boolean; retryAfterSeconds: number; attempts: number }

/** No plaintext IP, email, flow token or account identifier is stored as a key. */
export function founderRateKey(key: Buffer, action: FounderRateAction, scope: 'ip' | 'account_ip' | 'bootstrap', identity: string): string {
  if (key.length !== 32 || identity.length === 0 || identity.length > 1024) throw new Error('Invalid founder rate-limit input');
  return createHmac('sha256', key).update(JSON.stringify(['sv-founder-rate-v1', action, scope, identity])).digest('hex');
}

/**
 * One atomic upsert against the shared database, using its clock rather than
 * process clocks. Cooldowns grow exponentially up to a cap and do not extend
 * while blocked. Never treat a database error as permission to proceed.
 */
export async function consumeFounderBucket(database: Kysely<Database>, bucketKey: string, policy: RatePolicy): Promise<RateDecision> {
  const { freeAttempts: limit, windowSeconds: window, firstDelaySeconds: delay, maxDelaySeconds: cap } = policy;
  if (!/^[a-f0-9]{64}$/.test(bucketKey) || !Number.isInteger(limit) || limit < 1 || limit > 10000 || !Number.isInteger(window) || window < 1 || window > 86400 || !Number.isInteger(delay) || delay < 1 || !Number.isInteger(cap) || cap < delay || cap > window) throw new Error('Invalid founder rate-limit policy');
  const rows = await sql<{ attempts: number; retry_after: number }>`
    INSERT INTO founder_rate_limits AS bucket (bucket_key, window_started_at, attempts, blocked_until, updated_at)
      VALUES (${bucketKey}, clock_timestamp(), 1, NULL, clock_timestamp())
    ON CONFLICT (bucket_key) DO UPDATE SET
      window_started_at = CASE WHEN bucket.window_started_at + make_interval(secs => ${window}) <= clock_timestamp() THEN clock_timestamp() ELSE bucket.window_started_at END,
      attempts = CASE WHEN bucket.window_started_at + make_interval(secs => ${window}) <= clock_timestamp() THEN 1
        WHEN bucket.blocked_until > clock_timestamp() THEN bucket.attempts ELSE bucket.attempts + 1 END,
      blocked_until = CASE WHEN bucket.window_started_at + make_interval(secs => ${window}) <= clock_timestamp() THEN NULL
        WHEN bucket.blocked_until > clock_timestamp() THEN bucket.blocked_until
        WHEN bucket.attempts + 1 > ${limit} THEN clock_timestamp() + make_interval(secs => LEAST(${cap}, ${delay} * power(2, LEAST(12, bucket.attempts - ${limit}))))
        ELSE NULL END,
      updated_at = clock_timestamp()
    RETURNING attempts, GREATEST(0, CEIL(EXTRACT(EPOCH FROM blocked_until - clock_timestamp())))::int AS retry_after
  `.execute(database);
  const row = rows.rows[0];
  // PostgreSQL GREATEST ignores NULL arguments, so an unblocked row returns 0.
  return { allowed: row.retry_after === 0, retryAfterSeconds: row.retry_after, attempts: row.attempts };
}

/** Bounded concurrent-safe cleanup. Two days exceeds the maximum allowed
 * bucket window; never delete an active cooldown, even with corrupt timestamps. */
export async function cleanupFounderRateBuckets(database: Kysely<Database>): Promise<number> {
  const result = await sql<{ bucket_key: string }>`
    DELETE FROM founder_rate_limits WHERE bucket_key IN (
      SELECT bucket_key FROM founder_rate_limits
      WHERE updated_at < clock_timestamp() - interval '2 days'
        AND window_started_at < clock_timestamp() - interval '2 days'
        AND (blocked_until IS NULL OR blocked_until < clock_timestamp())
      ORDER BY updated_at LIMIT 1000 FOR UPDATE SKIP LOCKED
    ) RETURNING bucket_key
  `.execute(database);
  return result.rows.length;
}
