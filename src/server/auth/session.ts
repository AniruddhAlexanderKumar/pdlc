import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/config/env";
import type { DbClient } from "@/lib/db";
import * as sessionRepository from "@/server/repositories/session.repository";
import type { SessionWithPrincipal } from "@/server/repositories/session.repository";

/**
 * Session tokens. Server-only.
 *
 * A session token is 32 bytes of CSPRNG output — not a UUID, timestamp or
 * anything derived from user data. The database stores only its SHA-256
 * hash, so a leaked dump yields no usable cookies. SHA-256 (not Argon2) is
 * correct here: the token is already full-entropy random, so there is nothing
 * to brute-force, and session lookup happens on every request.
 */

const SESSION_TOKEN_BYTES = 32;

/** How stale `lastSeenAt` may get before we spend a write updating it. */
const TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function sessionTtlMs(ttlDays: number = env.SESSION_TTL_DAYS): number {
  return ttlDays * 24 * 60 * 60 * 1000;
}

/** Cryptographically secure, URL-safe opaque token. */
export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
}

/** Deterministic hash of a token — the only form ever persisted or logged. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison, for callers comparing hashes directly. */
export function sessionTokenHashEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export interface IssuedSession {
  token: string;
  expiresAt: Date;
  sessionId: string;
}

/**
 * Issues a new session for a user.
 *
 * Returns the raw token exactly once, for the caller to put in a cookie; it
 * is never retrievable again.
 */
export async function createSessionForUser(
  userId: string,
  options: { now?: Date; ttlDays?: number; client?: DbClient } = {},
): Promise<IssuedSession> {
  const now = options.now ?? new Date();
  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + sessionTtlMs(options.ttlDays));

  const session = await sessionRepository.createSession(
    { userId, tokenHash: hashSessionToken(token), expiresAt },
    options.client,
  );

  return { token, expiresAt: session.expiresAt, sessionId: session.id };
}

/**
 * Resolves a raw token to its session, or null.
 *
 * Expiry is enforced here, server-side, against the stored `expiresAt` —
 * cookie lifetime is a browser convenience and is never trusted. An expired
 * session is deleted on sight so it cannot linger.
 */
export async function resolveSession(
  token: string | undefined | null,
  options: { now?: Date } = {},
): Promise<SessionWithPrincipal | null> {
  if (!token) return null;

  const now = options.now ?? new Date();
  const tokenHash = hashSessionToken(token);
  const session = await sessionRepository.findSessionByTokenHash(tokenHash);

  if (!session) return null;

  if (session.expiresAt.getTime() <= now.getTime()) {
    await sessionRepository.deleteSessionByTokenHash(tokenHash);
    return null;
  }

  if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await sessionRepository.touchSession(session.id, now);
  }

  return session;
}

/** Invalidates a session server-side. Idempotent. */
export async function invalidateSession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await sessionRepository.deleteSessionByTokenHash(hashSessionToken(token));
}
