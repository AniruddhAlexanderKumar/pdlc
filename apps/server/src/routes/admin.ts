import { Router } from 'express';
import { sql } from 'kysely';
import { z } from 'zod';
import {
  CURRENCIES,
  STAGES,
  type AdminOverviewStats,
  type AdminAccessRequest,
  type AdminProduct,
  type AdminUser,
  type AdminWorkspace,
  type CurrencyCode,
  type Role,
  type StageId
} from '@sv/shared';
import { hashPassword } from '../auth/crypto.js';
import { auth, requireAdmin } from '../auth/session.js';
import { db } from '../db/index.js';
import { badRequest, conflict, forbidden, notFound, parse, route, shortText, uuid } from '../lib/http.js';
import { param } from './util.js';
import { initializeContributionConfig } from '../services/contribution-config.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Enter a valid email address'));

const stageIds = STAGES.map((s) => s.id) as [StageId, ...StageId[]];
const accessRequestStatuses = ['pending', 'reviewing', 'approved', 'declined'] as const;

// ── Overview Stats ─────────────────────────────────────────────────────────

adminRouter.get(
  '/overview',
  route(async (_req, res) => {
    const totalUsersRow = await db.selectFrom('users').select(sql<number>`count(*)::int`.as('c')).executeTakeFirstOrThrow();
    const activeUsersRow = await db
      .selectFrom('users')
      .select(sql<number>`count(*)::int`.as('c'))
      .where('is_disabled', '=', false)
      .executeTakeFirstOrThrow();
    const totalWsRow = await db.selectFrom('workspaces').select(sql<number>`count(*)::int`.as('c')).executeTakeFirstOrThrow();
    const totalProdRow = await db.selectFrom('products').select(sql<number>`count(*)::int`.as('c')).executeTakeFirstOrThrow();

    const stageRows = await db
      .selectFrom('products')
      .select(['stage', sql<number>`count(*)::int`.as('count')])
      .groupBy('stage')
      .execute();

    const stageCounts: Record<string, number> = {};
    for (const s of STAGES) {
      stageCounts[s.id] = 0;
    }
    for (const r of stageRows) {
      stageCounts[r.stage] = Number(r.count);
    }

    const recentUsersRows = await db
      .selectFrom('users')
      .select(['id', 'name', 'email', 'created_at'])
      .orderBy('created_at', 'desc')
      .limit(5)
      .execute();

    const recentProductsRows = await db
      .selectFrom('products as p')
      .innerJoin('workspaces as w', 'w.id', 'p.workspace_id')
      .select(['p.id', 'p.name', 'p.stage', 'p.created_at', 'w.name as workspace_name'])
      .orderBy('p.created_at', 'desc')
      .limit(5)
      .execute();

    const stats: AdminOverviewStats = {
      totalUsers: Number(totalUsersRow.c),
      activeUsers: Number(activeUsersRow.c),
      totalWorkspaces: Number(totalWsRow.c),
      totalProducts: Number(totalProdRow.c),
      stageCounts,
      recentUsers: recentUsersRows.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        createdAt: u.created_at.toISOString()
      })),
      recentProducts: recentProductsRows.map((p) => ({
        id: p.id,
        name: p.name,
        stage: p.stage,
        workspaceName: p.workspace_name,
        createdAt: p.created_at.toISOString()
      }))
    };

    res.json(stats);
  })
);

// ── Access Requests ───────────────────────────────────────────────────────

adminRouter.get(
  '/access-requests',
  route(async (_req, res) => {
    const rows = await db
      .selectFrom('access_requests')
      .select([
        'id',
        'name',
        'email',
        'organization',
        'role',
        'industry',
        'team_size',
        'product_stage',
        'current_tools',
        'goals',
        'status',
        'review_note',
        'reviewed_at',
        'created_at'
      ])
      .orderBy('created_at', 'desc')
      .execute();

    const requests: AdminAccessRequest[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      organization: row.organization,
      role: row.role,
      industry: row.industry,
      teamSize: row.team_size,
      productStage: row.product_stage,
      currentTools: row.current_tools,
      goals: row.goals,
      status: row.status,
      reviewNote: row.review_note,
      reviewedAt: row.reviewed_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString()
    }));

    res.json(requests);
  })
);

adminRouter.patch(
  '/access-requests/:id',
  route(async (req, res) => {
    const requestId = parse(uuid, param(req, 'id'));
    const body = parse(
      z.object({
        status: z.enum(accessRequestStatuses),
        reviewNote: shortText(1000).optional()
      }),
      req.body
    );

    const updated = await db
      .updateTable('access_requests')
      .set({
        status: body.status,
        ...(body.reviewNote !== undefined ? { review_note: body.reviewNote } : {}),
        reviewed_by: auth(req).userId,
        reviewed_at: new Date(),
        updated_at: new Date()
      })
      .where('id', '=', requestId)
      .returning(['id', 'status', 'review_note', 'reviewed_at'])
      .executeTakeFirst();

    if (!updated) throw notFound('Access request');
    res.json({
      id: updated.id,
      status: updated.status,
      reviewNote: updated.review_note,
      reviewedAt: updated.reviewed_at?.toISOString() ?? null
    });
  })
);

// ── Users Management ───────────────────────────────────────────────────────

adminRouter.get(
  '/users',
  route(async (_req, res) => {
    const users = await db
      .selectFrom('users')
      .select(['id', 'email', 'name', 'is_admin', 'is_disabled', 'failed_logins', 'last_login_at', 'created_at'])
      .orderBy('created_at', 'desc')
      .execute();

    const memberships = await db
      .selectFrom('memberships as m')
      .innerJoin('workspaces as w', 'w.id', 'm.workspace_id')
      .select(['m.user_id', 'w.id as workspace_id', 'w.name as workspace_name', 'm.role'])
      .execute();

    const productCounts = await db
      .selectFrom('products')
      .select(['created_by', sql<number>`count(*)::int`.as('count')])
      .where('created_by', 'is not', null)
      .groupBy('created_by')
      .execute();

    const userMap = new Map<string, AdminUser>();
    for (const u of users) {
      userMap.set(u.id, {
        id: u.id,
        email: u.email,
        name: u.name,
        isAdmin: u.is_admin,
        isDisabled: u.is_disabled,
        failedLogins: u.failed_logins,
        lastLoginAt: u.last_login_at ? u.last_login_at.toISOString() : null,
        createdAt: u.created_at.toISOString(),
        workspaces: [],
        productCount: 0
      });
    }

    for (const m of memberships) {
      const u = userMap.get(m.user_id);
      if (u) {
        u.workspaces.push({ id: m.workspace_id, name: m.workspace_name, role: m.role });
      }
    }

    for (const p of productCounts) {
      if (p.created_by) {
        const u = userMap.get(p.created_by);
        if (u) u.productCount = Number(p.count);
      }
    }

    res.json(Array.from(userMap.values()));
  })
);

adminRouter.post(
  '/users',
  route(async (req, res) => {
    const body = parse(
      z.object({
        name: shortText(80).min(1, 'Name is required'),
        email: emailSchema,
        password: z.string().min(5, 'Password must be at least 5 characters').max(200),
        workspaceId: uuid.optional(),
        role: z.enum(['owner', 'admin', 'member']).optional()
      }),
      req.body
    );

    const existing = await db.selectFrom('users').select('id').where('email', '=', body.email).executeTakeFirst();
    if (existing) throw conflict('A user with this email already exists.');

    const hash = await hashPassword(body.password);

    const user = await db.transaction().execute(async (trx) => {
      const newUser = await trx
        .insertInto('users')
        .values({
          email: body.email,
          name: body.name,
          password_hash: hash,
          last_login_at: null
        })
        .returning(['id', 'email', 'name', 'is_admin', 'is_disabled', 'failed_logins', 'last_login_at', 'created_at'])
        .executeTakeFirstOrThrow();

      let targetWsId = body.workspaceId;
      let targetRole = body.role || 'member';

      if (targetWsId) {
        const ws = await trx.selectFrom('workspaces').select('id').where('id', '=', targetWsId).executeTakeFirst();
        if (!ws) throw notFound('Workspace');
        await trx.insertInto('memberships').values({ workspace_id: targetWsId, user_id: newUser.id, role: targetRole }).execute();
      } else {
        const ws = await trx
          .insertInto('workspaces')
          .values({ name: `${body.name.split(' ')[0]}'s Workspace`, currency: 'USD' })
          .returning('id')
          .executeTakeFirstOrThrow();
        await trx.insertInto('memberships').values({ workspace_id: ws.id, user_id: newUser.id, role: 'owner' }).execute();
        await initializeContributionConfig(trx, ws.id, newUser.id);
      }

      return newUser;
    });

    res.status(201).json(user);
  })
);

adminRouter.patch(
  '/users/:id',
  route(async (req, res) => {
    const userId = parse(uuid, param(req, 'id'));
    const body = parse(
      z.object({
        name: shortText(80).min(1).optional(),
        email: emailSchema.optional(),
        isDisabled: z.boolean().optional(),
        password: z.string().min(4).max(200).optional()
      }),
      req.body
    );

    const target = await db.selectFrom('users').select(['id', 'is_admin']).where('id', '=', userId).executeTakeFirst();
    if (!target) throw notFound('User');

    if (body.isDisabled && target.is_admin) {
      throw forbidden('System admin accounts cannot be disabled from user management');
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.email !== undefined) {
      const exists = await db.selectFrom('users').select('id').where('email', '=', body.email).where('id', '!=', userId).executeTakeFirst();
      if (exists) throw conflict('Email is already taken by another account');
      updates.email = body.email;
    }
    if (body.isDisabled !== undefined) {
      updates.is_disabled = body.isDisabled;
      if (body.isDisabled) {
        // Kick active sessions
        await db.deleteFrom('sessions').where('user_id', '=', userId).execute();
      }
    }
    if (body.password) {
      updates.password_hash = await hashPassword(body.password);
      updates.failed_logins = 0;
      updates.locked_until = null;
    }

    if (Object.keys(updates).length > 0) {
      await db.updateTable('users').set(updates).where('id', '=', userId).execute();
    }

    const updated = await db
      .selectFrom('users')
      .select(['id', 'email', 'name', 'is_admin', 'is_disabled', 'failed_logins', 'last_login_at', 'created_at'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();

    res.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      isAdmin: updated.is_admin,
      isDisabled: updated.is_disabled,
      failedLogins: updated.failed_logins,
      lastLoginAt: updated.last_login_at ? updated.last_login_at.toISOString() : null,
      createdAt: updated.created_at.toISOString()
    });
  })
);

adminRouter.delete(
  '/users/:id',
  route(async (req, res) => {
    const currentAdmin = auth(req);
    const userId = parse(uuid, param(req, 'id'));
    const target = await db.selectFrom('users').select(['id', 'is_admin']).where('id', '=', userId).executeTakeFirst();
    if (!target) throw notFound('User');

    if (target.is_admin || target.id === currentAdmin.userId) {
      throw forbidden('Cannot delete a system admin account or your active account');
    }

    await db.deleteFrom('users').where('id', '=', userId).execute();
    res.status(204).end();
  })
);

// ── Organizations / Workspaces Management ──────────────────────────────────

adminRouter.get(
  '/workspaces',
  route(async (_req, res) => {
    const workspaces = await db
      .selectFrom('workspaces')
      .select(['id', 'name', 'currency', 'created_at'])
      .orderBy('created_at', 'desc')
      .execute();

    const members = await db
      .selectFrom('memberships as m')
      .innerJoin('users as u', 'u.id', 'm.user_id')
      .select(['m.workspace_id', 'u.id as user_id', 'u.name', 'u.email', 'm.role', 'm.created_at'])
      .orderBy('m.created_at', 'asc')
      .execute();

    const prodCounts = await db
      .selectFrom('products')
      .select(['workspace_id', sql<number>`count(*)::int`.as('count')])
      .groupBy('workspace_id')
      .execute();

    const matCounts = await db
      .selectFrom('materials')
      .select(['workspace_id', sql<number>`count(*)::int`.as('count')])
      .groupBy('workspace_id')
      .execute();

    const supCounts = await db
      .selectFrom('suppliers')
      .select(['workspace_id', sql<number>`count(*)::int`.as('count')])
      .groupBy('workspace_id')
      .execute();

    const map = new Map<string, AdminWorkspace>();
    for (const w of workspaces) {
      map.set(w.id, {
        id: w.id,
        name: w.name,
        currency: w.currency as CurrencyCode,
        createdAt: w.created_at.toISOString(),
        memberCount: 0,
        members: [],
        productCount: 0,
        materialCount: 0,
        supplierCount: 0
      });
    }

    for (const m of members) {
      const w = map.get(m.workspace_id);
      if (w) {
        w.members.push({
          userId: m.user_id,
          name: m.name,
          email: m.email,
          role: m.role,
          joinedAt: m.created_at.toISOString()
        });
        w.memberCount = w.members.length;
      }
    }

    for (const p of prodCounts) {
      const w = map.get(p.workspace_id);
      if (w) w.productCount = Number(p.count);
    }
    for (const m of matCounts) {
      const w = map.get(m.workspace_id);
      if (w) w.materialCount = Number(m.count);
    }
    for (const s of supCounts) {
      const w = map.get(s.workspace_id);
      if (w) w.supplierCount = Number(s.count);
    }

    res.json(Array.from(map.values()));
  })
);

adminRouter.post(
  '/workspaces',
  route(async (req, res) => {
    const currentAdmin = auth(req);
    const body = parse(
      z.object({
        name: shortText(80).min(1, 'Organization name is required'),
        currency: z.enum(CURRENCIES).default('USD'),
        ownerUserId: uuid.optional()
      }),
      req.body
    );

    const ownerId = body.ownerUserId || currentAdmin.userId;
    const user = await db.selectFrom('users').select('id').where('id', '=', ownerId).executeTakeFirst();
    if (!user) throw notFound('Owner user');

    const ws = await db.transaction().execute(async (trx) => {
      const inserted = await trx
        .insertInto('workspaces')
        .values({ name: body.name, currency: body.currency })
        .returning(['id', 'name', 'currency', 'created_at'])
        .executeTakeFirstOrThrow();

      await trx.insertInto('memberships').values({ workspace_id: inserted.id, user_id: ownerId, role: 'owner' }).execute();
      await initializeContributionConfig(trx, inserted.id, ownerId);

      return inserted;
    });

    res.status(201).json(ws);
  })
);

adminRouter.patch(
  '/workspaces/:id',
  route(async (req, res) => {
    const wsId = parse(uuid, param(req, 'id'));
    const body = parse(
      z.object({
        name: shortText(80).min(1).optional(),
        currency: z.enum(CURRENCIES).optional()
      }),
      req.body
    );

    const ws = await db.selectFrom('workspaces').select('id').where('id', '=', wsId).executeTakeFirst();
    if (!ws) throw notFound('Workspace');

    if (Object.keys(body).length > 0) {
      await db.updateTable('workspaces').set(body).where('id', '=', wsId).execute();
    }

    const updated = await db.selectFrom('workspaces').select(['id', 'name', 'currency', 'created_at']).where('id', '=', wsId).executeTakeFirstOrThrow();
    res.json(updated);
  })
);

adminRouter.delete(
  '/workspaces/:id',
  route(async (req, res) => {
    const wsId = parse(uuid, param(req, 'id'));
    const ws = await db.selectFrom('workspaces').select('id').where('id', '=', wsId).executeTakeFirst();
    if (!ws) throw notFound('Workspace');

    await db.deleteFrom('workspaces').where('id', '=', wsId).execute();
    res.status(204).end();
  })
);

// ── Workspace Members ──────────────────────────────────────────────────────

adminRouter.post(
  '/workspaces/:id/members',
  route(async (req, res) => {
    const wsId = parse(uuid, param(req, 'id'));
    const body = parse(
      z.object({
        userId: uuid,
        role: z.enum(['owner', 'admin', 'member'])
      }),
      req.body
    );

    const ws = await db.selectFrom('workspaces').select('id').where('id', '=', wsId).executeTakeFirst();
    if (!ws) throw notFound('Workspace');

    const user = await db.selectFrom('users').select('id').where('id', '=', body.userId).executeTakeFirst();
    if (!user) throw notFound('User');

    const existing = await db
      .selectFrom('memberships')
      .select('role')
      .where('workspace_id', '=', wsId)
      .where('user_id', '=', body.userId)
      .executeTakeFirst();
    if (existing) throw conflict('User is already a member of this workspace');

    await db.insertInto('memberships').values({ workspace_id: wsId, user_id: body.userId, role: body.role }).execute();
    res.status(201).json({ success: true });
  })
);

adminRouter.patch(
  '/workspaces/:id/members/:userId',
  route(async (req, res) => {
    const wsId = parse(uuid, param(req, 'id'));
    const userId = parse(uuid, param(req, 'userId'));
    const { role } = parse(z.object({ role: z.enum(['owner', 'admin', 'member']) }), req.body);

    const mem = await db
      .selectFrom('memberships')
      .select('role')
      .where('workspace_id', '=', wsId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (!mem) throw notFound('Membership');

    await db.updateTable('memberships').set({ role }).where('workspace_id', '=', wsId).where('user_id', '=', userId).execute();
    res.json({ success: true, role });
  })
);

adminRouter.delete(
  '/workspaces/:id/members/:userId',
  route(async (req, res) => {
    const wsId = parse(uuid, param(req, 'id'));
    const userId = parse(uuid, param(req, 'userId'));

    const mem = await db
      .selectFrom('memberships')
      .select('role')
      .where('workspace_id', '=', wsId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (!mem) throw notFound('Membership');

    await db.deleteFrom('memberships').where('workspace_id', '=', wsId).where('user_id', '=', userId).execute();
    res.status(204).end();
  })
);

// ── Products Management ────────────────────────────────────────────────────

adminRouter.get(
  '/products',
  route(async (_req, res) => {
    const products = await db
      .selectFrom('products as p')
      .innerJoin('workspaces as w', 'w.id', 'p.workspace_id')
      .leftJoin('users as u', 'u.id', 'p.created_by')
      .select([
        'p.id',
        'p.name',
        'p.category',
        'p.stage',
        'p.image_url',
        'p.description',
        'p.target_price',
        'p.workspace_id',
        'w.name as workspace_name',
        'p.created_by',
        'u.name as creator_name',
        'u.email as creator_email',
        'p.created_at',
        'p.updated_at'
      ])
      .orderBy('p.created_at', 'desc')
      .execute();

    const taskCounts = await db
      .selectFrom('tasks')
      .select(['product_id', sql<number>`count(*)::int`.as('count')])
      .groupBy('product_id')
      .execute();

    const materialCounts = await db
      .selectFrom('product_materials')
      .select(['product_id', sql<number>`count(*)::int`.as('count')])
      .groupBy('product_id')
      .execute();

    const taskMap = new Map<string, number>();
    for (const t of taskCounts) taskMap.set(t.product_id, Number(t.count));

    const matMap = new Map<string, number>();
    for (const m of materialCounts) matMap.set(m.product_id, Number(m.count));

    const list: AdminProduct[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      stage: p.stage as StageId,
      imageUrl: p.image_url,
      description: p.description,
      targetSellingPrice: p.target_price !== null ? Number(p.target_price) : null,
      workspaceId: p.workspace_id,
      workspaceName: p.workspace_name,
      createdBy: p.created_by,
      creatorName: p.creator_name,
      creatorEmail: p.creator_email,
      materialsCount: matMap.get(p.id) ?? 0,
      tasksCount: taskMap.get(p.id) ?? 0,
      createdAt: p.created_at.toISOString(),
      updatedAt: p.updated_at.toISOString()
    }));

    res.json(list);
  })
);

adminRouter.patch(
  '/products/:id',
  route(async (req, res) => {
    const prodId = parse(uuid, param(req, 'id'));
    const body = parse(
      z.object({
        name: shortText(80).min(1).optional(),
        category: shortText(40).optional(),
        stage: z.enum(stageIds).optional(),
        targetSellingPrice: z.number().nonnegative().nullable().optional(),
        workspaceId: uuid.optional()
      }),
      req.body
    );

    const product = await db.selectFrom('products').select('id').where('id', '=', prodId).executeTakeFirst();
    if (!product) throw notFound('Product');

    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.category !== undefined) updates.category = body.category;
    if (body.stage !== undefined) updates.stage = body.stage;
    if (body.targetSellingPrice !== undefined) updates.target_price = body.targetSellingPrice;
    if (body.workspaceId !== undefined) {
      const ws = await db.selectFrom('workspaces').select('id').where('id', '=', body.workspaceId).executeTakeFirst();
      if (!ws) throw notFound('Destination Workspace');
      updates.workspace_id = body.workspaceId;
    }

    await db.updateTable('products').set(updates).where('id', '=', prodId).execute();
    res.json({ success: true });
  })
);

adminRouter.delete(
  '/products/:id',
  route(async (req, res) => {
    const prodId = parse(uuid, param(req, 'id'));
    const product = await db.selectFrom('products').select('id').where('id', '=', prodId).executeTakeFirst();
    if (!product) throw notFound('Product');

    await db.deleteFrom('products').where('id', '=', prodId).execute();
    res.status(204).end();
  })
);
