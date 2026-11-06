import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Kysely, Transaction } from 'kysely';
import type { Database, FounderRole } from '../db/schema.js';
import { db } from '../db/index.js';
import { hashToken } from './crypto.js';
import { founderHasPermission, type FounderPermission } from './founder-permissions.js';

const IDLE_MS = 30 * 60_000;
export const FOUNDER_COOKIE_PRODUCTION = '__Host-sv_founder_session';
export const FOUNDER_COOKIE_DEVELOPMENT = 'sv_founder_session';

export interface FounderActor { id: string; name: string; role: FounderRole }

/**
 * Call inside the SAME transaction as an authorized service action. Locking both
 * session and account prevents suspension/revocation/role changes from racing the
 * action. Only a validated, fully active, MFA-enrolled founder can be returned.
 */
export async function authorizeFounderInTransaction(trx: Transaction<Database>, token: string, permission: FounderPermission, now = new Date()): Promise<FounderActor | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const session = await trx.selectFrom('founder_sessions as s').innerJoin('founder_accounts as f', 'f.id', 's.founder_id')
    .select(['s.token_hash', 's.session_version as session_version', 's.idle_expires_at', 's.absolute_expires_at', 'f.id', 'f.name', 'f.role', 'f.status', 'f.mfa_enrolled_at', 'f.totp_ciphertext', 'f.password_rotation_required', 'f.session_version as current_version'])
    .where('s.token_hash', '=', hashToken(token)).forUpdate().executeTakeFirst();
  if (!session || session.status !== 'active' || !session.mfa_enrolled_at || !session.totp_ciphertext || session.password_rotation_required || session.session_version !== session.current_version || session.idle_expires_at <= now || session.absolute_expires_at <= now || !founderHasPermission(session.role, permission)) return null;
  const idleExpiry = new Date(Math.min(now.getTime() + IDLE_MS, session.absolute_expires_at.getTime()));
  await trx.updateTable('founder_sessions').set({ last_seen_at: now, idle_expires_at: idleExpiry }).where('token_hash', '=', session.token_hash).execute();
  return { id: session.id, name: session.name, role: session.role };
}

/** Service entry point for read-only uses; mutations must use the transaction variant. */
export async function authorizeFounder(database: Kysely<Database>, token: string, permission: FounderPermission): Promise<FounderActor | null> {
  return database.transaction().execute((trx) => authorizeFounderInTransaction(trx, token, permission));
}

/**
 * Founder middleware is deliberately not mounted while authentication is incomplete.
 * It does not use req.auth, ordinary sessions, or frontend claims. Every service
 * action must authorize again inside its own transaction to prevent TOCTOU races.
 */
export function requireFounderPermission(permission: FounderPermission, secureCookies: boolean): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const cookieName = secureCookies ? FOUNDER_COOKIE_PRODUCTION : FOUNDER_COOKIE_DEVELOPMENT;
    const token = req.cookies?.[cookieName];
    if (typeof token !== 'string') { res.status(401).json({ error: 'Founder authentication required' }); return; }
    authorizeFounder(db, token, permission).then((actor) => {
      if (!actor) { res.status(403).json({ error: 'Founder access denied' }); return; }
      res.locals.founder = actor;
      next();
    }).catch(next);
  };
}
