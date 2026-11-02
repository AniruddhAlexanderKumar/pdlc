import { Router } from 'express';
import { sql } from 'kysely';
import { z } from 'zod';
import { CURRENCIES, type Invite, type Member } from '@sv/shared';
import { newToken } from '../auth/crypto.js';
import { auth, requireRole } from '../auth/session.js';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { badRequest, conflict, forbidden, notFound, parse, route, shortText, uuid } from '../lib/http.js';
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

/** Admins create a one-time password reset link for a member (no email server needed). */
workspaceRouter.post(
  '/members/:userId/reset-link',
  admin,
  route(async (req, res) => {
    const a = auth(req);
    const userId = parse(uuid, param(req, 'userId'));
    const target = await db
      .selectFrom('memberships')
      .select('role')
      .where('workspace_id', '=', a.workspaceId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (!target) throw notFound('Member');
    if (target.role === 'owner' && a.role !== 'owner') throw forbidden('Only an owner can reset an owner’s password');
    if (userId === a.userId) throw badRequest('Use “Change password” for your own account');
    const { token, hash } = newToken();
    await db
      .insertInto('password_resets')
      .values({ user_id: userId, token_hash: hash, created_by: a.userId, expires_at: new Date(Date.now() + RESET_HOURS * 3600_000) })
      .execute();
    req.log.info({ by: a.userId, userId }, 'password reset link created');
    res.status(201).json({ url: `${config.APP_URL}/reset/${token}`, expiresInHours: RESET_HOURS });
  })
);

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
