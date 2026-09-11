/**
 * Minimal in-process throttle for failed sign-in attempts.
 *
 * ⚠ Scope: this is a single-process, in-memory counter. It raises the cost of
 * casual password guessing against one running instance and nothing more —
 * it does not survive a restart and is not shared between instances, so a
 * multi-instance deployment must put a real rate-limiting layer (reverse
 * proxy, WAF, or a shared store) in front of the sign-in endpoint. That is a
 * deployment requirement, recorded in ARCHITECTURE.md, not something this
 * module pretends to solve.
 *
 * No Redis or other infrastructure is introduced for it.
 */

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
/** Bounded so a flood of distinct keys cannot grow the map without limit. */
const MAX_TRACKED_KEYS = 10_000;

interface AttemptRecord {
  count: number;
  firstAttemptAt: number;
}

const attempts = new Map<string, AttemptRecord>();

function prune(now: number): void {
  for (const [key, record] of attempts) {
    if (now - record.firstAttemptAt > WINDOW_MS) {
      attempts.delete(key);
    }
  }
}

/** True when the key has exceeded its failure budget for the current window. */
export function isRateLimited(key: string, now: number = Date.now()): boolean {
  const record = attempts.get(key);
  if (!record) return false;

  if (now - record.firstAttemptAt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }

  return record.count >= MAX_ATTEMPTS;
}

/** Records a failed attempt. Only failures count, so normal use is unaffected. */
export function recordFailedAttempt(key: string, now: number = Date.now()): void {
  const record = attempts.get(key);

  if (!record || now - record.firstAttemptAt > WINDOW_MS) {
    if (attempts.size >= MAX_TRACKED_KEYS) prune(now);
    attempts.set(key, { count: 1, firstAttemptAt: now });
    return;
  }

  record.count += 1;
}

/** Clears the counter after a successful sign-in. */
export function clearAttempts(key: string): void {
  attempts.delete(key);
}

/** Test helper — drops all tracked state. */
export function resetRateLimiter(): void {
  attempts.clear();
}
