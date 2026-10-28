import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@sv/shared';
import { config } from '../config.js';
import { db, type Db } from '../db/index.js';
import { forbidden, unauthorized } from '../lib/http.js';
import { hashToken, newToken } from './crypto.js';

export const SESSION_COOKIE = config.secureCookies ? '__Host-sv_session' : 'sv_session';
const DAY = 24 * 60 * 60 * 1000;
/** Only push expiry forward (a DB write) at most this often per session. */
const SLIDE_EVERY = 60 * 60 * 1000;

export interface AuthContext {
  sessionId: string;
  userId: string;
  name: string;
  email: string;
  workspaceId: string;
  role: Role;
  isAdmin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'lax' as const,
    path: '/',
    expires
  };
}

export async function startSession(trx: Db, req: Request, res: Response, userId: string, workspaceId: string) {
  const { token, hash } = newToken();
  const expires = new Date(Date.now() + config.SESSION_TTL_DAYS * DAY);
  await trx
    .insertInto('sessions')
    .values({
      id: hash,
      user_id: userId,
      workspace_id: workspaceId,
      expires_at: expires,
      last_seen_at: new Date(),
      user_agent: req.get('user-agent')?.slice(0, 300) ?? null,
      ip: req.ip ?? null
    })
    .execute();
  res.cookie(SESSION_COOKIE, token, cookieOptions(expires));
}

// Browsers ignore a __Host- cookie (even an expiring one) unless it is Secure, so clear with the same flags.
const clearOptions = { path: '/', httpOnly: true, secure: config.secureCookies, sameSite: 'lax' as const };

export async function endSession(req: Request, res: Response) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === 'string' && token) {
    await db.deleteFrom('sessions').where('id', '=', hashToken(token)).execute();
  }
  res.clearCookie(SESSION_COOKIE, clearOptions);
}

/** Loads the session (if any) onto req.auth. Never rejects the request by itself. */
export async function loadSession(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return next();
    const id = hashToken(token);
    const row = await db
      .selectFrom('sessions as s')
      .innerJoin('users as u', 'u.id', 's.user_id')
      .leftJoin('memberships as m', (j) => j.onRef('m.user_id', '=', 's.user_id').onRef('m.workspace_id', '=', 's.workspace_id'))
      .select(['s.id', 's.user_id', 's.workspace_id', 's.expires_at', 's.last_seen_at', 'u.name', 'u.email', 'u.is_admin', 'u.is_disabled', 'm.role'])
      .where('s.id', '=', id)
      .executeTakeFirst();

    if (!row || row.expires_at.getTime() < Date.now() || row.is_disabled || !row.role) {
      if (row) await db.deleteFrom('sessions').where('id', '=', id).execute();
      res.clearCookie(SESSION_COOKIE, clearOptions);
      return next();
    }

    if (Date.now() - row.last_seen_at.getTime() > SLIDE_EVERY) {
      const expires = new Date(Date.now() + config.SESSION_TTL_DAYS * DAY);
      await db.updateTable('sessions').set({ last_seen_at: new Date(), expires_at: expires }).where('id', '=', id).execute();
      res.cookie(SESSION_COOKIE, token, cookieOptions(expires));
    }

    req.auth = {
      sessionId: id,
      userId: row.user_id,
      name: row.name,
      email: row.email,
      workspaceId: row.workspace_id,
      role: row.role,
      isAdmin: row.is_admin
    };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(unauthorized());
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(unauthorized());
  if (!req.auth.isAdmin) return next(forbidden('Admin privileges required'));
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!roles.includes(req.auth.role)) return next(forbidden());
    next();
  };
}

/** Narrowing helper for handlers that run behind requireAuth. */
export function auth(req: Request): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

/**
 * CSRF defence for cookie-authenticated, state-changing requests: the browser's
 * Origin (or Referer) must match APP_URL. Combined with SameSite=Lax cookies and
 * JSON-only bodies this blocks cross-site form posts.
 */
export function verifyOrigin(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin') ?? (req.get('referer') ? safeOrigin(req.get('referer')!) : null);
  if (origin && origin === config.appOrigin) return next();
  // Non-browser clients (curl, scripts) send neither header; they also cannot hold a victim's cookie.
  if (!origin && !req.get('sec-fetch-site')) return next();
  next(forbidden('Cross-origin request blocked'));
}

function safeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}
