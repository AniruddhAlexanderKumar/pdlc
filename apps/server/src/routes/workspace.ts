import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import nodemailer from 'nodemailer';
import { sql } from 'kysely';
import { z } from 'zod';
import { CURRENCIES, WORK_DOMAINS, WORK_REQUIREMENTS, NAV_FOCUS, type Invite, type Member } from '@sv/shared';
import { newToken } from '../auth/crypto.js';
import { auth, requireRole } from '../auth/session.js';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { HttpError, badRequest, conflict, forbidden, notFound, parse, route, shortText, uuid } from '../lib/http.js';
import { loadWorkspaceData } from '../services/repo.js';
import { loadSampleData } from '../services/sampleData.js';
import { leaderboard, playerStats } from '../services/xp.js';
import { loadMe } from './auth.js';
import { param } from './util.js';

export const workspaceRouter = Router();
export const gameRouter = Router();

const INVITE_DAYS = 7;
const RESET_HOURS = 24;
const admin = requireRole('owner', 'admin');

workspaceRouter.get(
  '/data',
  route(async (req, res) => {
    res.json(await loadWorkspaceData(db, auth(req).workspaceId));
  })
);

workspaceRouter.patch(
  '/',
  admin,
  route(async (req, res) => {
    const a = auth(req);
    const body = parse(z.object({ name: shortText(80).min(1), currency: z.enum(CURRENCIES) }).partial().strict(), req.body);
    if (Object.keys(body).length > 0) await db.updateTable('workspaces').set(body).where('id', '=', a.workspaceId).execute();
    res.json(await loadMe(db, a.userId, a.workspaceId));
  })
);

/** Workspace setup affects navigation emphasis, not permissions or feature availability. */
const unique = <T>(values: T[]) => new Set(values).size === values.length;
const profileInput = z.object({
  domains: z.array(z.enum(WORK_DOMAINS)).min(1).max(WORK_DOMAINS.length).refine(unique, 'Duplicate domains'),
  objective: shortText(300),
  requirements: z.array(z.enum(WORK_REQUIREMENTS)).max(WORK_REQUIREMENTS.length).refine(unique, 'Duplicate requirements'),
  navigation: z.array(z.enum(NAV_FOCUS)).max(NAV_FOCUS.length).refine(unique, 'Duplicate navigation items')
}).strict();
workspaceRouter.get('/profile', route(async (req, res) => {
  const { workspaceId } = parse(z.object({ workspaceId: uuid }).strict(), req.query);
  if (workspaceId !== auth(req).workspaceId) throw notFound('Workspace');
  const row = await db.selectFrom('workspace_profiles').select(['revision', 'profile']).where('workspace_id', '=', auth(req).workspaceId).executeTakeFirst();
  res.set('Cache-Control', 'no-store').json(row ?? { revision: 0, profile: null });
}));
workspaceRouter.put('/profile', admin, route(async (req, res) => {
  const a = auth(req);
  const input = parse(z.object({ workspaceId: uuid, revision: z.number().int().min(0), profile: profileInput }).strict(), req.body);
  if (input.workspaceId !== a.workspaceId) throw notFound('Workspace');
  const result = await db.transaction().execute(async trx => {
    // A workspace-row lock serializes both the first insert and subsequent updates.
    await trx.selectFrom('workspaces').select('id').where('id', '=', a.workspaceId).forUpdate().executeTakeFirstOrThrow();
    const existing = await trx.selectFrom('workspace_profiles').select('revision').where('workspace_id', '=', a.workspaceId).executeTakeFirst();
    if ((existing?.revision ?? 0) !== input.revision) throw conflict('Workspace setup changed. Reload before saving.');
    const next = input.revision + 1;
    if (existing) await trx.updateTable('workspace_profiles').set({ profile: JSON.stringify(input.profile), revision: next, updated_by: a.userId, updated_at: new Date() }).where('workspace_id', '=', a.workspaceId).execute();
    else await trx.insertInto('workspace_profiles').values({ workspace_id: a.workspaceId, profile: JSON.stringify(input.profile), revision: next, updated_by: a.userId }).execute();
    return { revision: next, profile: input.profile };
  });
  res.set('Cache-Control', 'no-store').json(result);
}));

/** Create a separate workspace and switch only this session into it. */
workspaceRouter.post(
  '/workspaces',
  route(async (req, res) => {
    const a = auth(req);
    const body = parse(z.object({ name: shortText(80).min(1), mode: z.enum(['solo', 'team']), currency: z.enum(CURRENCIES).default('USD') }).strict(), req.body);
    const me = await db.transaction().execute(async (trx) => {
      const ws = await trx.insertInto('workspaces').values(body).returning('id').executeTakeFirstOrThrow();
      await trx.insertInto('memberships').values({ workspace_id: ws.id, user_id: a.userId, role: 'owner' }).execute();
      await trx.updateTable('sessions').set({ workspace_id: ws.id }).where('id', '=', a.sessionId).execute();
      return loadMe(trx, a.userId, ws.id);
    });
    res.status(201).json(me);
  })
);

/** One-click example content for an empty workspace. */
workspaceRouter.post(
  '/sample-data',
  route(async (req, res) => {
    const a = auth(req);
    await db.transaction().execute(async (trx) => {
      // Lock the workspace row so two clicks cannot load the samples twice.
      await trx.selectFrom('workspaces').select('id').where('id', '=', a.workspaceId).forUpdate().executeTakeFirst();
      const { n } = await trx.selectFrom('products').select(sql<number>`count(*)::int`.as('n')).where('workspace_id', '=', a.workspaceId).executeTakeFirstOrThrow();
      if (n > 0) throw conflict('Sample data can only be added to an empty workspace');
      await loadSampleData(trx, a.workspaceId, a.userId, { omitExternalImages: a.isDemo });
    });
    res.status(201).json(await loadWorkspaceData(db, a.workspaceId));
  })
);

// ── Members ────────────────────────────────────────────────────────────────

workspaceRouter.get(
  '/members',
  route(async (req, res) => {
    const rows = await db
      .selectFrom('memberships as m')
      .innerJoin('users as u', 'u.id', 'm.user_id')
      .select(['u.id', 'u.name', 'u.email', 'm.role', 'm.created_at'])
      .where('m.workspace_id', '=', auth(req).workspaceId)
      .orderBy('m.created_at')
      .execute();
    const members: Member[] = rows.map((r) => ({ userId: r.id, name: r.name, email: r.email, role: r.role, joinedAt: r.created_at.toISOString() }));
    res.json(members);
  })
);

workspaceRouter.patch(
  '/members/:userId',
  admin,
  route(async (req, res) => {
    const a = auth(req);
    const userId = parse(uuid, param(req, 'userId'));
    const { role } = parse(z.object({ role: z.enum(['owner', 'admin', 'member']) }), req.body);
    await db.transaction().execute(async (trx) => {
      const target = await trx
        .selectFrom('memberships')
        .select('role')
        .where('workspace_id', '=', a.workspaceId)
        .where('user_id', '=', userId)
        .forUpdate()
        .executeTakeFirst();
      if (!target) throw notFound('Member');
      // Only owners can create owners or change another owner.
      if ((role === 'owner' || target.role === 'owner') && a.role !== 'owner') throw forbidden('Only an owner can change ownership');
      if (target.role === 'owner' && role !== 'owner') {
        const { n } = await trx
          .selectFrom('memberships')
          .select(sql<number>`count(*)::int`.as('n'))
          .where('workspace_id', '=', a.workspaceId)
          .where('role', '=', 'owner')
          .executeTakeFirstOrThrow();
        if (n <= 1) throw conflict('A workspace needs at least one owner');
      }
      await trx.updateTable('memberships').set({ role }).where('workspace_id', '=', a.workspaceId).where('user_id', '=', userId).execute();
    });
    res.status(204).end();
  })
);

workspaceRouter.delete(
  '/members/:userId',
  route(async (req, res) => {
    const a = auth(req);
    const userId = parse(uuid, param(req, 'userId'));
    const leavingSelf = userId === a.userId;
    if (!leavingSelf && a.role === 'member') throw forbidden();
    await db.transaction().execute(async (trx) => {
      const target = await trx
        .selectFrom('memberships')
        .select('role')
        .where('workspace_id', '=', a.workspaceId)
        .where('user_id', '=', userId)
        .forUpdate()
        .executeTakeFirst();
      if (!target) throw notFound('Member');
      if (target.role === 'owner') {
        if (!leavingSelf && a.role !== 'owner') throw forbidden('Only an owner can remove an owner');
        const { n } = await trx
          .selectFrom('memberships')
          .select(sql<number>`count(*)::int`.as('n'))
          .where('workspace_id', '=', a.workspaceId)
          .where('role', '=', 'owner')
          .executeTakeFirstOrThrow();
        if (n <= 1) throw conflict('Make someone else an owner first');
      }
      await trx.deleteFrom('memberships').where('workspace_id', '=', a.workspaceId).where('user_id', '=', userId).execute();
      await trx.deleteFrom('sessions').where('workspace_id', '=', a.workspaceId).where('user_id', '=', userId).execute();
    });
    res.status(204).end();
  })
);

/** Send reset links only to the member's registered email; never expose the token to the requesting admin. */
const resetMailLimiter = rateLimit({ windowMs: 3600_000, limit: config.NODE_ENV === 'test' ? 1000 : 10, keyGenerator: req => auth(req).userId, standardHeaders: 'draft-8', legacyHeaders: false });
workspaceRouter.post('/members/:userId/reset-link', admin, resetMailLimiter, route(async (req, res) => {
  const a = auth(req);
  const userId = parse(uuid, param(req, 'userId'));
  const target = await db.selectFrom('memberships as m').innerJoin('users as u', 'u.id', 'm.user_id')
    .select(['m.role', 'u.email', 'u.is_disabled'])
    .where('m.workspace_id', '=', a.workspaceId).where('m.user_id', '=', userId).executeTakeFirst();
  if (!target) throw notFound('Member');
  if (target.role === 'owner' && a.role !== 'owner') throw forbidden('Only an owner can send a reset link to an owner');
  if (userId === a.userId) throw badRequest('Use “Change password” for your own account');
  if (target.is_disabled) throw badRequest('This account is disabled');
  const { RESET_SMTP_HOST: host, RESET_SMTP_FROM: from, RESET_SMTP_PORT: port, RESET_SMTP_SECURE: secure, RESET_SMTP_USER: user, RESET_SMTP_PASSWORD: pass } = config;
  if (!host || !from || (!!user !== !!pass)) throw new HttpError(503, 'Password reset email is not configured. Contact your system administrator.', 'reset_email_unavailable');
  const { token, hash } = newToken();
  await db.insertInto('password_resets').values({ user_id: userId, token_hash: hash, created_by: a.userId, expires_at: new Date(Date.now() + RESET_HOURS * 3600_000) }).execute();
  const transport = nodemailer.createTransport({ host, port, secure, requireTLS: config.NODE_ENV !== 'test' && !secure, auth: user && pass ? { user, pass } : undefined, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
  try {
    const url = `${config.appOrigin}/reset#${token}`;
    const delivery = await transport.sendMail({ from, to: target.email, subject: 'Reset your Solution Velocity password', text: `A workspace administrator requested a password reset for your account.\n\nUse this link to choose a new password: ${url}\n\nThis link can be used once and expires in ${RESET_HOURS} hours. If you did not expect this message, ignore it and contact your workspace administrator.` });
    if (!delivery.accepted.length) throw new Error('Recipient was not accepted');
  } catch {
    await db.deleteFrom('password_resets').where('token_hash', '=', hash).where('used_at', 'is', null).execute();
    req.log.warn({ by: a.userId, userId }, 'password reset email could not be sent');
    throw new HttpError(502, 'Could not send the reset email. Please try again or contact your system administrator.', 'reset_email_failed');
  } finally { transport.close(); }
  req.log.info({ by: a.userId, userId }, 'password reset email sent');
  res.set('Cache-Control', 'no-store').status(201).json({ sent: true, expiresInHours: RESET_HOURS });
}));

// ── Invites ────────────────────────────────────────────────────────────────

workspaceRouter.get(
  '/invites',
  admin,
  route(async (req, res) => {
    const rows = await db
      .selectFrom('invites as i')
      .innerJoin('users as u', 'u.id', 'i.created_by')
      .select(['i.id', 'i.role', 'i.created_at', 'i.expires_at', 'u.name'])
      .where('i.workspace_id', '=', auth(req).workspaceId)
      .where('i.used_at', 'is', null)
      .where('i.expires_at', '>', new Date())
      .orderBy('i.created_at', 'desc')
      .execute();
    const invites: Invite[] = rows.map((r) => ({
      id: r.id,
      role: r.role,
      createdAt: r.created_at.toISOString(),
      expiresAt: r.expires_at.toISOString(),
      createdBy: r.name
    }));
    res.json(invites);
  })
);

workspaceRouter.post(
  '/invites',
  admin,
  route(async (req, res) => {
    const a = auth(req);
    const { role } = parse(z.object({ role: z.enum(['admin', 'member']).default('member') }), req.body ?? {});
    const workspace = await db.selectFrom('workspaces').select('mode').where('id', '=', a.workspaceId).executeTakeFirstOrThrow();
    if (workspace.mode === 'solo') throw forbidden('Personal workspaces cannot invite members. Create a separate team workspace.');
    const { token, hash } = newToken();
    const row = await db
      .insertInto('invites')
      .values({ workspace_id: a.workspaceId, token_hash: hash, role, created_by: a.userId, expires_at: new Date(Date.now() + INVITE_DAYS * 86400_000) })
      .returning(['id', 'role', 'created_at', 'expires_at'])
      .executeTakeFirstOrThrow();
    const invite: Invite = {
      id: row.id,
      role: row.role,
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      createdBy: a.name,
      url: `${config.APP_URL}/join/${token}`
    };
    res.status(201).json(invite);
  })
);

workspaceRouter.delete(
  '/invites/:id',
  admin,
  route(async (req, res) => {
    const id = parse(uuid, param(req, 'id'));
    await db.deleteFrom('invites').where('id', '=', id).where('workspace_id', '=', auth(req).workspaceId).execute();
    res.status(204).end();
  })
);

// ── Game ───────────────────────────────────────────────────────────────────

gameRouter.get(
  '/me',
  route(async (req, res) => {
    const a = auth(req);
    res.json(await playerStats(db, a.workspaceId, a.userId));
  })
);

gameRouter.get(
  '/leaderboard',
  route(async (req, res) => {
    res.json(await leaderboard(db, auth(req).workspaceId));
  })
);
