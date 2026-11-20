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
  isDemo: boolean;
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

export async function startSession(trx: Db, req: Request, res: Response, userId: string, workspaceId: string, expiresAt?: Date) {
  const { token, hash } = newToken();
  const expires = expiresAt ?? new Date(Date.now() + config.SESSION_TTL_DAYS * DAY);
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
      .leftJoin('demo_guests as d', 'd.user_id', 's.user_id')
      .select(['s.id', 's.user_id', 's.workspace_id', 's.expires_at', 's.last_seen_at', 'u.name', 'u.email', 'u.is_admin', 'u.is_disabled', 'm.role', 'd.workspace_id as demo_workspace_id', 'd.expires_at as demo_expires_at'])
      .where('s.id', '=', id)
      .executeTakeFirst();

    if (!row || row.expires_at.getTime() <= Date.now() || row.is_disabled || !row.role || (row.demo_expires_at && (row.demo_expires_at.getTime() <= Date.now() || row.demo_workspace_id !== row.workspace_id))) {
      if (row) await db.deleteFrom('sessions').where('id', '=', id).execute();
      res.clearCookie(SESSION_COOKIE, clearOptions);
      return next();
    }

    if (!row.demo_expires_at && Date.now() - row.last_seen_at.getTime() > SLIDE_EVERY) {
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
      isAdmin: row.is_admin,
      isDemo: !!row.demo_expires_at
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
 * CSRF defence for cookie-authenticated, state-changing requests.
 *
 * A request is accepted when it is same-origin as the deployment from the
 * browser's point of view, established two ways:
 *
 *  1. The browser's `Origin` (or `Referer`) equals `APP_URL`. This is the
 *     canonical public address.
 *  2. The browser reports the request as same-origin (`Sec-Fetch-Site:
 *     same-origin`) and the `Origin` host is the host the request was
 *     delivered for. Both `Host` and `Sec-Fetch-Site` are set by the browser
 *     and cannot be overridden by a page on another site, so a cross-site
 *     request can match neither: its `Origin` is the attacker's site, and
 *     `Sec-Fetch-Site` says `cross-site` or `same-site`.
 *
 * Rule 2 exists because `APP_URL` is a single address while a deployment is
 * routinely reachable on several — a reverse proxy, an alternate hostname,
 * the Vite dev server, a container preview URL — and locking login to one
 * exact string is what turns a working deployment into "Cross-origin request
 * blocked" the moment the address in the browser differs by a port, a
 * subdomain, or a preview host. Comparing against the address the request
 * was actually served for is the same model Django's `CSRF_TRUSTED_ORIGINS`
 * and Rails' `check_origin` use.
 *
 * Combined with SameSite=Lax cookies and JSON-only bodies this blocks
 * cross-site form posts. Anything that matches neither rule is rejected, and
 * a state-changing request that identifies itself as a browser (it sends
 * `Sec-Fetch-Site`) but carries no usable `Origin` is rejected too.
 */
export function verifyOrigin(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const fromOrigin = req.get('origin');
  const fromReferer = fromOrigin ? null : (req.get('referer') ?? null);
  const origin = fromOrigin ?? (fromReferer ? safeOrigin(fromReferer) : null);

  if (origin) {
    if (origin === config.appOrigin) return next();
    const secFetchSite = req.get('sec-fetch-site')?.toLowerCase();
    if (secFetchSite === 'same-origin' && sameHost(origin, deliveredHost(req))) return next();
  }

  // Non-browser clients (curl, scripts) send neither Origin nor Sec-Fetch-Site;
  // they also cannot hold a victim's cookie, so they are not a CSRF vector.
  if (!origin && !req.get('sec-fetch-site')) return next();

  next(forbidden('Cross-origin request blocked'));
}

/** The `Host` the request was delivered for. */
function deliveredHost(req: Request): string | null {
  return req.get('host')?.toLowerCase() ?? null;
}

/**
 * Whether an origin URL points at exactly this host and port. An explicit
 * port must match; when the origin omits it, the browser's default (443 for
 * https, 80 for http) is what it actually used, so `https://a.example` and a
 * delivered `a.example:443` are the same thing. http and https are different
 * origins even on the same host, so the scheme must agree too.
 */
function sameHost(origin: string, host: string | null): boolean {
  if (!host) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const [hostname, port] = splitHost(host);
  const defaultPort = url.protocol === 'https:' ? '443' : url.protocol === 'http:' ? '80' : '';
  return url.hostname.toLowerCase() === hostname && (url.port || defaultPort) === (port || defaultPort);
}

/** Splits `host[:port]`, keeping IPv6 literals like `[::1]:5173` intact. */
function splitHost(value: string): [hostname: string, port: string] {
  const match = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(value.trim());
  if (!match) return [value.trim().toLowerCase(), ''];
  return [match[1].replace(/^\[|\]$/g, '').toLowerCase(), match[2] ?? ''];
}

function safeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}
