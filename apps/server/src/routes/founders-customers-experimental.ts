// Explicitly opt-in, non-production customer-management slice. Not a release API.
import { Router } from 'express';
import { z } from 'zod';
import { sql } from 'kysely';
import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { hashPassword, newToken } from '../auth/crypto.js';
import { authorizeFounderInTransaction, FOUNDER_COOKIE_DEVELOPMENT, FOUNDER_COOKIE_PRODUCTION } from '../auth/founder-session.js';

const customer = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  workspaceName: z.string().trim().min(1).max(80),
  mode: z.enum(['solo', 'team'])
}).strict();
const uuid = z.uuid();

export function createFounderCustomersExperimentalRouter() {
  const router = Router();
  const cookieName = config.secureCookies ? FOUNDER_COOKIE_PRODUCTION : FOUNDER_COOKIE_DEVELOPMENT;
  const token = (req: { cookies?: Record<string, unknown> }) => typeof req.cookies?.[cookieName] === 'string' ? req.cookies[cookieName] as string : '';

  router.get('/customers', async (req, res, next) => {
    try {
      const result = await db.transaction().execute(async (trx) => {
        const actor = await authorizeFounderInTransaction(trx, token(req), 'platform.operations.read');
        if (!actor) return null;
        const users = await trx.selectFrom('users as u').leftJoin('demo_guests as d', 'd.user_id', 'u.id')
          .select(['u.id', 'u.name', 'u.email', 'u.is_disabled', 'u.is_admin', 'u.created_at'])
          .where('d.user_id', 'is', null).orderBy('u.created_at', 'desc').limit(100).execute();
        return { items: users, canManage: actor.role === 'owner' || actor.role === 'admin' };
      });
      if (!result) { res.status(403).json({ error: 'Founder access denied' }); return; }
      res.json(result);
    } catch (error) { next(error); }
  });

  router.get('/organizations', async (req, res, next) => {
    try {
      const result = await db.transaction().execute(async (trx) => {
        const actor = await authorizeFounderInTransaction(trx, token(req), 'platform.operations.read');
        if (!actor) return null;
        const items = await trx.selectFrom('workspaces as w').leftJoin('demo_guests as d', 'd.workspace_id', 'w.id')
          .select(['w.id', 'w.name', 'w.mode', 'w.created_at'])
          .select(sql<number>`(select count(*)::int from memberships m where m.workspace_id = w.id)`.as('member_count'))
          .where('d.workspace_id', 'is', null).orderBy('w.created_at', 'desc').limit(100).execute();
        return { items };
      });
      if (!result) { res.status(403).json({ error: 'Founder access denied' }); return; }
      res.json(result);
    } catch (error) { next(error); }
  });

  router.post('/customers', async (req, res, next) => {
    const body = customer.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: 'Check the customer details and try again.' }); return; }
    try {
      const result = await db.transaction().execute(async (trx) => {
        const actor = await authorizeFounderInTransaction(trx, token(req), 'platform.accounts.manage');
        if (!actor) return { kind: 'denied' as const };
        if (await trx.selectFrom('users').select('id').where('email', '=', body.data.email).executeTakeFirst()) return { kind: 'exists' as const };
        if (await trx.selectFrom('founder_accounts').select('id').where('email', '=', body.data.email).executeTakeFirst()) return { kind: 'exists' as const };
        // A random unusable-to-the-recipient initial password; the recipient
        // chooses their own password using an expiring, single-use reset token.
        const unusablePassword = randomBytes(32).toString('base64url');
        const user = await trx.insertInto('users').values({ name: body.data.name, email: body.data.email, password_hash: await hashPassword(unusablePassword), last_login_at: null, locked_until: null }).returning(['id', 'email', 'name']).executeTakeFirstOrThrow();
        const workspace = await trx.insertInto('workspaces').values({ name: body.data.workspaceName, mode: body.data.mode, currency: 'USD' }).returning('id').executeTakeFirstOrThrow();
        await trx.insertInto('memberships').values({ workspace_id: workspace.id, user_id: user.id, role: 'owner' }).execute();
        const setup = newToken();
        await trx.insertInto('password_resets').values({ user_id: user.id, token_hash: setup.hash, created_by: null, expires_at: new Date(Date.now() + 60 * 60_000), used_at: null }).execute();
        await trx.insertInto('founder_security_audit').values({ event_type: 'customer_created', actor_id: actor.id, actor_role: actor.role, target_id: user.id, outcome: 'success', request_id: res.locals.founderRequestId }).execute();
        return { kind: 'created' as const, user, workspaceId: workspace.id, setupToken: setup.token };
      });
      if (result.kind === 'denied') { res.status(403).json({ error: 'Founder access denied' }); return; }
      if (result.kind === 'exists') { res.status(409).json({ error: 'An account with that email already exists.' }); return; }
      res.status(201).json({ user: result.user, workspaceId: result.workspaceId, setupUrl: `${config.appOrigin}/reset#${result.setupToken}`, expiresInMinutes: 60 });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') { res.status(409).json({ error: 'An account with that email already exists.' }); return; }
      next(error);
    }
  });

  router.patch('/customers/:id/status', async (req, res, next) => {
    const id = uuid.safeParse(req.params.id);
    const body = z.object({ disabled: z.boolean() }).strict().safeParse(req.body);
    if (!id.success || !body.success) { res.status(400).json({ error: 'Invalid request.' }); return; }
    try {
      const result = await db.transaction().execute(async (trx) => {
        const actor = await authorizeFounderInTransaction(trx, token(req), 'platform.accounts.manage');
        if (!actor) return 'denied';
        const target = await trx.selectFrom('users as u').leftJoin('demo_guests as d', 'd.user_id', 'u.id')
          .select(['u.id', 'u.is_admin', 'u.is_disabled', 'd.user_id as guest_id']).where('u.id', '=', id.data).forUpdate('u').executeTakeFirst();
        if (!target || target.is_admin || target.guest_id) return 'missing';
        if (target.is_disabled === body.data.disabled) return 'unchanged';
        await trx.updateTable('users').set({ is_disabled: body.data.disabled }).where('id', '=', id.data).execute();
        if (body.data.disabled) {
          await trx.deleteFrom('sessions').where('user_id', '=', id.data).execute();
          await trx.updateTable('password_resets').set({ used_at: new Date() }).where('user_id', '=', id.data).where('used_at', 'is', null).execute();
        }
        await trx.insertInto('founder_security_audit').values({ event_type: body.data.disabled ? 'customer_suspended' : 'customer_reactivated', actor_id: actor.id, actor_role: actor.role, target_id: id.data, outcome: 'success', request_id: res.locals.founderRequestId }).execute();
        return 'updated';
      });
      if (result === 'denied') { res.status(403).json({ error: 'Founder access denied' }); return; }
      if (result === 'missing') { res.status(404).json({ error: 'Customer not found.' }); return; }
      res.json({ disabled: body.data.disabled, changed: result === 'updated' });
    } catch (error) { next(error); }
  });
  return router;
}
