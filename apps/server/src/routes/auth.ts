import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { sql } from 'kysely';
import { z } from 'zod';
import {
  CURRENCIES,
  ONBOARDING_STARTING_POINTS,
  STARTING_POINT_STAGES,
  accessStatusFor,
  planOnboarding,
  type Me,
  type OnboardingState,
  type OnboardingStartingPoint,
  type Role,
  type Workspace,
  type CurrencyCode
} from '@sv/shared';
import { config } from '../config.js';
import { db, type Db } from '../db/index.js';
import { getDummyHash, hashPassword, hashToken, verifyPassword } from '../auth/crypto.js';
import { auth, endSession, requireAuth, startSession } from '../auth/session.js';
import { HttpError, badRequest, conflict, forbidden, parse, route, shortText, unauthorized } from '../lib/http.js';
import { mailConfigured } from '../lib/mailer.js';
import { recordAnalyticsEvent } from '../services/analytics.js';
import { sendPasswordReset, recoveryConfigured } from '../services/account-recovery.js';
import { deliverVerificationEmail, emailVerificationEnforced, issueEmailVerification, redeemEmailVerification, sendEmailVerification } from '../services/email-verification.js';
import { applyOnboarding, onboardingFor, type OnboardingResult } from '../services/onboarding.js';
import { loadSampleData } from '../services/sampleData.js';

export const authRouter = Router();

const MAX_FAILED_LOGINS = 8;
const LOCK_MINUTES = 15;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Enter a valid email address'));
const password = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(200, 'Use at most 200 characters')
  .refine((p) => /[a-zA-Z]/.test(p) && /[^a-zA-Z]/.test(p), 'Mix letters with numbers or symbols');

// Per IP. Generous enough for a whole office behind one NAT address; per-account
// lockout (MAX_FAILED_LOGINS) is what stops password guessing against one user.
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.NODE_ENV === 'test' ? 1000 : 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' }
});

// ── Helpers ────────────────────────────────────────────────────────────────

export async function loadMe(trx: Db, userId: string, workspaceId: string): Promise<Me> {
  const user = await trx.selectFrom('users').select(['id', 'email', 'name', 'is_admin', 'created_at', 'email_verified_at']).where('id', '=', userId).executeTakeFirstOrThrow();
  const rows = await trx
    .selectFrom('memberships as m')
    .innerJoin('workspaces as w', 'w.id', 'm.workspace_id')
    .select(['w.id', 'w.name', 'w.currency', 'w.mode', 'm.role'])
    .where('m.user_id', '=', userId)
    .orderBy('w.created_at')
    .execute();
  const workspaces: Workspace[] = rows.map((r) => ({ id: r.id, name: r.name, currency: r.currency as CurrencyCode, mode: r.mode, role: r.role }));
  const demo = await trx.selectFrom('demo_guests').select('expires_at').where('user_id', '=', userId).executeTakeFirst();
  const workspace = workspaces.find((w) => w.id === workspaceId) || workspaces[0];
  if (!workspace) throw unauthorized();
  const onboarding = demo ? null : await onboardingFor(trx, workspace.id);
  // The access block describes what this account may use right now. A demo
  // guest is a separate, temporary product; real accounts report the operator's
  // policy and whether their email is confirmed.
  const access = demo
    ? undefined
    : {
        policy: config.accessPolicy,
        standardAccess: accessStatusFor(config.accessPolicy).standardAccess,
        emailVerified: Boolean(user.email_verified_at),
        emailVerificationRequired: emailVerificationEnforced()
      };
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.created_at.toISOString(),
      isAdmin: user.is_admin,
      emailVerifiedAt: user.email_verified_at ? user.email_verified_at.toISOString() : null
    },
    workspace,
    workspaces,
    ...(demo ? { demo: { expiresAt: demo.expires_at.toISOString() } } : {}),
    ...(access ? { access } : {}),
    ...(onboarding ? { onboarding } : {})
  };
}

async function findInvite(trx: Db, token: string) {
  const invite = await trx
    .selectFrom('invites as i')
    .innerJoin('workspaces as w', 'w.id', 'i.workspace_id')
    .select(['i.id', 'i.workspace_id', 'i.role', 'i.expires_at', 'i.used_at', 'w.name as workspace_name', 'w.mode as workspace_mode'])
    .where('i.token_hash', '=', hashToken(token))
    .executeTakeFirst();
  if (!invite || invite.workspace_mode !== 'team' || invite.used_at || invite.expires_at.getTime() < Date.now()) {
    throw new HttpError(410, 'This invite link is invalid or has expired. Ask your admin for a new one.', 'invite_invalid');
  }
  return invite;
}

async function consumeInvite(trx: Db, inviteId: string, userId: string) {
  // Conditional update so two people cannot redeem the same single-use link.
  const used = await trx
    .updateTable('invites')
    .set({ used_at: new Date(), used_by: userId })
    .where('id', '=', inviteId)
    .where('used_at', 'is', null)
    .executeTakeFirst();
  if (Number(used.numUpdatedRows) !== 1) throw new HttpError(410, 'This invite link has already been used.', 'invite_invalid');
}

// ── Routes ─────────────────────────────────────────────────────────────────

authRouter.get(
  '/config',
  route(async (_req, res) => {
    const { count } = await db.selectFrom('users').select(sql<number>`count(*)`.as('count')).where('id', 'not in', db.selectFrom('demo_guests').select('user_id')).executeTakeFirstOrThrow();
    const status = accessStatusFor(config.accessPolicy);
    // The very first account can always be created, so a fresh install is never
    // locked out even under an invite-only policy.
    const firstAccount = count === 0;
    res.set('Cache-Control', 'no-store').json({
      allowSignup: status.openRegistration || firstAccount,
      policy: status.policy,
      openRegistration: status.openRegistration || firstAccount,
      paymentRequired: status.paymentRequired,
      launchPeriod: status.launchPeriod,
      summary: status.summary,
      // Reported truthfully so the UI never promises an email that cannot be sent.
      emailVerification: {
        required: emailVerificationEnforced(),
        available: mailConfigured()
      },
      passwordRecovery: { available: recoveryConfigured() }
    });
  })
);

// Each visitor gets an isolated, fixed lifetime workspace. Never replace a real session.
const demoLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: config.NODE_ENV === 'test' ? 1000 : 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many demo sessions. Please try again later.' } });
authRouter.post('/demo', demoLimiter, route(async (req, res) => {
  if (req.auth) {
    if (!req.auth.isDemo) throw conflict('You are already signed in. Sign out before starting a guest demo.');
    res.json(await loadMe(db, req.auth.userId, req.auth.workspaceId));
    return;
  }
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const me = await db.transaction().execute(async (trx) => {
    // Serialize the capacity check across application replicas.
    await sql`SELECT pg_advisory_xact_lock(78642391)`.execute(trx);
    const { count } = await trx.selectFrom('demo_guests').select(sql<number>`count(*)`.as('count')).where('expires_at', '>', new Date()).executeTakeFirstOrThrow();
    if (count >= 200) throw new HttpError(503, 'Demo capacity is currently full. Please try again later.', 'demo_capacity');
    const user = await trx.insertInto('users').values({ email: `demo-${randomUUID()}@example.invalid`, name: 'Demo guest', password_hash: '!', last_login_at: new Date() }).returning('id').executeTakeFirstOrThrow();
    const ws = await trx.insertInto('workspaces').values({ name: 'Sample workspace', currency: 'USD', mode: 'solo' }).returning('id').executeTakeFirstOrThrow();
    await trx.insertInto('memberships').values({ workspace_id: ws.id, user_id: user.id, role: 'owner' }).execute();
    await trx.insertInto('demo_guests').values({ user_id: user.id, workspace_id: ws.id, expires_at: expiresAt }).execute();
    await loadSampleData(trx, ws.id, user.id, { omitExternalImages: true });
    await startSession(trx, req, res, user.id, ws.id, expiresAt);
    return loadMe(trx, user.id, ws.id);
  });
  res.status(201).json(me);
}));

authRouter.post(
  '/register',
  strictLimiter,
  route(async (req, res) => {
    const body = parse(
      z.object({
        name: shortText(80).min(1, 'Tell us your name'),
        email,
        password,
        workspaceName: shortText(80).optional(),
        workspaceMode: z.enum(['solo', 'team']).default('team'),
        currency: z.enum(CURRENCIES).optional(),
        inviteToken: z.string().max(200).optional(),
        // Registration itself must state that the terms were accepted. The
        // server records it; the client can never imply consent on its own.
        acceptedTerms: z.literal(true, { message: 'Accept the Terms of Service and Privacy Policy to continue' }),
        // Post-registration onboarding, asked as two questions on the sign-up form.
        onboarding: z
          .object({
            building: shortText(120).min(1, 'Tell us what you are building'),
            startingPoint: z.enum(ONBOARDING_STARTING_POINTS),
            category: shortText(60).optional()
          })
          .optional()
      }),
      req.body
    );

    const status = accessStatusFor(config.accessPolicy);
    // Enforcement is decided from configuration, never from whether an
    // individual message happened to be delivered: a transient SMTP failure
    // must not silently downgrade a security setting, and it must not create
    // an account the user cannot activate either — see `sendEmailVerification`.
    const enforcement = emailVerificationEnforced();
    let registered: {
      me: Me;
      userId: string;
      issued: { token: string; expiresInHours: number } | null;
      blocked: boolean;
      onboarding: OnboardingResult | null;
    };
    try {
      registered = await db.transaction().execute(async (trx) => {
        const existing = await trx.selectFrom('users').select('id').where('email', '=', body.email).executeTakeFirst();
        if (existing) throw conflict('An account with this email already exists. Try signing in.');

        const invite = body.inviteToken ? await findInvite(trx, body.inviteToken) : null;
        if (!invite && !status.openRegistration) {
          const { count } = await trx.selectFrom('users').select(sql<number>`count(*)`.as('count')).where('id', 'not in', trx.selectFrom('demo_guests').select('user_id')).executeTakeFirstOrThrow();
          if (count > 0) throw forbidden('Sign-up is invite-only. Ask an admin for an invite link.');
        }

        const user = await trx
          .insertInto('users')
          .values({
            email: body.email,
            name: body.name,
            password_hash: await hashPassword(body.password),
            last_login_at: new Date(),
            terms_accepted_at: new Date()
          })
          .returning('id')
          .executeTakeFirstOrThrow();

        let workspaceId: string;
        if (invite) {
          await consumeInvite(trx, invite.id, user.id);
          await trx.insertInto('memberships').values({ workspace_id: invite.workspace_id, user_id: user.id, role: invite.role }).execute();
          workspaceId = invite.workspace_id;
        } else {
          const ws = await trx
            .insertInto('workspaces')
            .values({ name: body.workspaceName || `${body.name.split(' ')[0]}'s workspace`, currency: body.currency ?? 'USD', mode: body.workspaceMode })
            .returning('id')
            .executeTakeFirstOrThrow();
          await trx.insertInto('memberships').values({ workspace_id: ws.id, user_id: user.id, role: 'owner' }).execute();
          workspaceId = ws.id;
        }

        // Onboarding runs inside the same transaction: if it fails, the account
        // is not created rather than half-initialised.
        const onboarding = body.onboarding && !invite
          ? await applyOnboarding(trx, { workspaceId, userId: user.id, name: body.name, answers: body.onboarding })
          : null;

        // The verification token is written inside the transaction; the message
        // itself is sent after it commits, so a delivery failure can never leave
        // an account without a usable token.
        const issued = enforcement ? await issueEmailVerification(trx, user.id) : null;
        const me = await loadMe(trx, user.id, workspaceId);
        return { me, userId: user.id, issued, blocked: Boolean(enforcement), onboarding };
      });
    } catch (error) {
      // Two concurrent sign-ups for one address: the database unique index is
      // the real guard; give the second request the same answer as a serial one.
      if ((error as { code?: string }).code === '23505') {
        throw conflict('An account with this email already exists. Try signing in.');
      }
      throw error;
    }

    // Outside the transaction: deliver the verification message, if enforcing.
    let emailDelivery: 'sent' | 'unavailable' | 'failed' | 'not_required' = 'not_required';
    let blocked = registered.blocked;
    if (registered.issued) {
      emailDelivery = await deliverVerificationEmail(registered.me.user.email, registered.me.user.name, registered.issued.token);
      if (emailDelivery !== 'sent') {
        // Nothing to verify with, so do not hold the account hostage to it.
        await db.deleteFrom('email_verifications').where('user_id', '=', registered.userId).where('used_at', 'is', null).execute();
        blocked = false;
        req.log.warn({ userId: registered.userId, emailDelivery }, 'verification email not delivered; issuing a session');
      }
    }
    if (!blocked) {
      await db.transaction().execute(async (trx) => {
        // Re-resolve the membership: an invite-based registration has its own workspace.
        const membership = await trx.selectFrom('memberships').select('workspace_id').where('user_id', '=', registered.userId).orderBy('created_at').executeTakeFirstOrThrow();
        await startSession(trx, req, res, registered.userId, membership.workspace_id);
      });
    }

    req.log.info({ userId: registered.me.user.id, emailDelivery }, 'user registered');
    await recordAnalyticsEvent({
      eventType: 'action',
      eventName: 'auth.register',
      userId: registered.me.user.id,
      workspaceId: registered.me.workspace.id,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      metadata: {
        email: registered.me.user.email,
        name: registered.me.user.name,
        policy: status.policy,
        emailDelivery
      }
    });

    if (blocked) {
      // No session, no workspace data: only the fact that a verification email
      // is on its way. The account exists but cannot be used until confirmed.
      res.status(202).json({
        verificationRequired: true,
        email: registered.me.user.email,
        emailDelivery: 'sent'
      });
      return;
    }
    res.status(201).json({
      ...registered.me,
      // Reported so the UI can say "check your inbox" without blocking access.
      emailDelivery,
      // Where onboarding put this founder, when they answered the questions.
      onboardedProductId: registered.onboarding?.productId ?? null
    });
  })
);

/** Resends the verification email for the signed-in account. */
authRouter.post(
  '/verify-email/resend',
  requireAuth,
  strictLimiter,
  route(async (req, res) => {
    const a = auth(req);
    const user = await db.selectFrom('users').select(['id', 'email', 'name', 'email_verified_at']).where('id', '=', a.userId).executeTakeFirstOrThrow();
    if (user.email_verified_at) {
      res.json({ alreadyVerified: true });
      return;
    }
    const result = await sendEmailVerification(db, user);
    if (result.mail === 'unavailable') throw new HttpError(503, 'Email delivery is not configured on this server.', 'email_unavailable');
    if (result.mail === 'failed') throw new HttpError(502, 'Could not send the verification email. Try again shortly.', 'email_failed');
    res.status(202).json({ sent: true, expiresInHours: 24 });
  })
);

/** Redeems an emailed verification token. Idempotent for an already-verified address. */
authRouter.post(
  '/verify-email',
  strictLimiter,
  route(async (req, res) => {
    const { token } = parse(z.object({ token: z.string().min(20).max(200) }).strict(), req.body);
    const redeemed = await redeemEmailVerification(db, token);
    if (!redeemed) throw new HttpError(410, 'This verification link is invalid or has expired.', 'verification_invalid');
    // A verified user who has not signed in yet may now do so; anyone already
    // holding a session simply sees their account marked verified.
    const membership = req.auth?.userId === redeemed.userId
      ? null
      : await db.selectFrom('memberships').select('workspace_id').where('user_id', '=', redeemed.userId).orderBy('created_at').executeTakeFirst();
    if (!req.auth && membership) {
      await db.transaction().execute(async (trx) => {
        await startSession(trx, req, res, redeemed.userId, membership.workspace_id);
      });
    }
    res.set('Cache-Control', 'no-store').json({ verified: true, signedIn: Boolean(req.auth) || Boolean(membership) });
  })
);

/** Public "forgot password" request. Always answers the same way. */
authRouter.post(
  '/forgot-password',
  strictLimiter,
  route(async (req, res) => {
    const { email: address } = parse(z.object({ email }).strict(), req.body);
    const user = await db.selectFrom('users').select(['id', 'email', 'name', 'is_disabled']).where('email', '=', address).executeTakeFirst();
    let delivered = false;
    if (user && !user.is_disabled) delivered = await sendPasswordReset(db, user);
    req.log.info({ found: Boolean(user), delivered }, 'password reset requested');
    // One response for every outcome: no account enumeration, and no hint about
    // whether SMTP is configured on this deployment.
    res.set('Cache-Control', 'no-store').status(202).json({
      accepted: true,
      message: 'If an account exists for that address, a reset link is on its way.'
    });
  })
);

authRouter.post(
  '/login',
  strictLimiter,
  route(async (req, res) => {
    const body = parse(z.object({ email, password: z.string().min(1).max(200) }), req.body);
    let user = await db
      .selectFrom('users')
      .select(['id', 'password_hash', 'is_disabled', 'failed_logins', 'locked_until'])
      .where('email', '=', body.email)
      .executeTakeFirst();

    const invalid = () => unauthorized('Email or password is incorrect');
    if (!user) {
      await verifyPassword(body.password, await getDummyHash());
      throw invalid();
    }
    const targetUser = user;
    if (targetUser.locked_until && targetUser.locked_until.getTime() > Date.now()) {
      throw new HttpError(429, `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes or ask an admin to reset your password.`, 'locked');
    }

    const ok = await verifyPassword(body.password, targetUser.password_hash);
    if (!ok || targetUser.is_disabled) {
      const failed = targetUser.failed_logins + 1;
      await db
        .updateTable('users')
        .set({
          failed_logins: failed >= MAX_FAILED_LOGINS ? 0 : failed,
          locked_until: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null
        })
        .where('id', '=', targetUser.id)
        .execute();
      req.log.warn({ userId: targetUser.id }, 'failed login');
      throw invalid();
    }

    const me = await db.transaction().execute(async (trx) => {
      await trx.updateTable('users').set({ failed_logins: 0, locked_until: null, last_login_at: new Date() }).where('id', '=', targetUser.id).execute();
      const membership = await trx
        .selectFrom('memberships')
        .select('workspace_id')
        .where('user_id', '=', targetUser.id)
        .orderBy('created_at')
        .executeTakeFirst();
      if (!membership) throw forbidden('Your account is not part of any workspace. Ask an admin for an invite.');
      await startSession(trx, req, res, targetUser.id, membership.workspace_id);
      return loadMe(trx, targetUser.id, membership.workspace_id);
    });
    await recordAnalyticsEvent({
      eventType: 'login',
      eventName: 'auth.login',
      userId: targetUser.id,
      workspaceId: me.workspace.id,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      metadata: { email: body.email }
    });
    res.json(me);
  })
);

authRouter.post(
  '/logout',
  route(async (req, res) => {
    if (req.auth) {
      await recordAnalyticsEvent({
        eventType: 'logout',
        eventName: 'auth.logout',
        userId: req.auth.userId,
        workspaceId: req.auth.workspaceId,
        sessionId: req.auth.sessionId,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null
      });
    }
    await endSession(req, res);
    res.status(204).end();
  })
);

authRouter.get(
  '/me',
  requireAuth,
  route(async (req, res) => {
    const a = auth(req);
    res.json(await loadMe(db, a.userId, a.workspaceId));
  })
);

/** Finishes onboarding for an account that registered without answering the two questions. */
authRouter.post(
  '/onboarding',
  requireAuth,
  route(async (req, res) => {
    const a = auth(req);
    if (a.isDemo) throw forbidden('Onboarding is not available in the temporary demo.');
    const body = parse(
      z.object({
        building: shortText(120).min(1, 'Tell us what you are building'),
        startingPoint: z.enum(ONBOARDING_STARTING_POINTS),
        category: shortText(60).optional()
      }).strict(),
      req.body
    );
    const existing = await onboardingFor(db, a.workspaceId);
    if (existing) {
      // Idempotent: repeating the request never creates a second product.
      res.json({ onboarding: existing, productId: null });
      return;
    }
    const result = await db.transaction().execute(async (trx) => {
      const applied = await applyOnboarding(trx, { workspaceId: a.workspaceId, userId: a.userId, name: a.name, answers: body });
      const me = await loadMe(trx, a.userId, a.workspaceId);
      return { ...applied, me };
    });
    await recordAnalyticsEvent({
      eventType: 'action',
      eventName: 'auth.onboarding',
      userId: a.userId,
      workspaceId: a.workspaceId,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      metadata: { startingPoint: result.state.startingPoint, startingStage: result.state.startingStage, productId: result.productId }
    });
    res.status(201).json({ onboarding: result.state, productId: result.productId, me: result.me });
  })
);

authRouter.post(
  '/switch-workspace',
  requireAuth,
  route(async (req, res) => {
    const a = auth(req);
    const { workspaceId } = parse(z.object({ workspaceId: z.uuid() }), req.body);
    const member = await db
      .selectFrom('memberships')
      .select('role')
      .where('user_id', '=', a.userId)
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirst();
    if (!member) throw forbidden();
    await db.updateTable('sessions').set({ workspace_id: workspaceId }).where('id', '=', a.sessionId).execute();
    await recordAnalyticsEvent({
      eventType: 'action',
      eventName: 'workspace.switch',
      userId: a.userId,
      workspaceId,
      sessionId: a.sessionId,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null
    });
    res.json(await loadMe(db, a.userId, workspaceId));
  })
);

authRouter.patch(
  '/profile',
  requireAuth,
  route(async (req, res) => {
    const a = auth(req);
    const body = parse(z.object({ name: shortText(80).min(1) }), req.body);
    await db.updateTable('users').set({ name: body.name }).where('id', '=', a.userId).execute();
    res.json(await loadMe(db, a.userId, a.workspaceId));
  })
);

authRouter.post(
  '/password',
  requireAuth,
  strictLimiter,
  route(async (req, res) => {
    const a = auth(req);
    const body = parse(z.object({ currentPassword: z.string().min(1).max(200), newPassword: password }), req.body);
    const user = await db.selectFrom('users').select('password_hash').where('id', '=', a.userId).executeTakeFirstOrThrow();
    if (!(await verifyPassword(body.currentPassword, user.password_hash))) throw badRequest('Current password is incorrect');
    await db.transaction().execute(async (trx) => {
      await trx.updateTable('users').set({ password_hash: await hashPassword(body.newPassword) }).where('id', '=', a.userId).execute();
      await trx.updateTable('password_resets').set({ used_at: new Date() }).where('user_id', '=', a.userId).where('used_at', 'is', null).execute();
      // Sign out every other device.
      await trx.deleteFrom('sessions').where('user_id', '=', a.userId).where('id', '!=', a.sessionId).execute();
    });
    res.status(204).end();
  })
);

authRouter.get(
  '/invite/:token',
  strictLimiter,
  route(async (req, res) => {
    const invite = await findInvite(db, String(req.params.token));
    res.json({ workspaceName: invite.workspace_name, role: invite.role as Role });
  })
);

/** An already signed-in user joins another workspace with an invite link. */
authRouter.post(
  '/accept-invite',
  requireAuth,
  route(async (req, res) => {
    const a = auth(req);
    const { token } = parse(z.object({ token: z.string().min(1).max(200) }), req.body);
    const me = await db.transaction().execute(async (trx) => {
      const invite = await findInvite(trx, token);
      const existing = await trx
        .selectFrom('memberships')
        .select('role')
        .where('workspace_id', '=', invite.workspace_id)
        .where('user_id', '=', a.userId)
        .executeTakeFirst();
      if (!existing) {
        await consumeInvite(trx, invite.id, a.userId);
        await trx.insertInto('memberships').values({ workspace_id: invite.workspace_id, user_id: a.userId, role: invite.role }).execute();
      }
      await trx.updateTable('sessions').set({ workspace_id: invite.workspace_id }).where('id', '=', a.sessionId).execute();
      return loadMe(trx, a.userId, invite.workspace_id);
    });
    res.json(me);
  })
);

async function resetInfo(token: string) {
  const row = await db.selectFrom('password_resets as r').innerJoin('users as u', 'u.id', 'r.user_id')
    .select(['u.email', 'u.is_disabled', 'r.expires_at', 'r.used_at'])
    .where('r.token_hash', '=', hashToken(token)).executeTakeFirst();
  if (!row || row.is_disabled || row.used_at || row.expires_at.getTime() <= Date.now()) throw new HttpError(410, 'This reset link is invalid or has expired.', 'reset_invalid');
  return { email: row.email };
}
// POST keeps new reset tokens out of URLs and proxy logs. GET remains for older clients.
authRouter.post('/reset/validate', strictLimiter, route(async (req, res) => {
  const { token } = parse(z.object({ token: z.string().min(1).max(200) }).strict(), req.body);
  res.set('Cache-Control', 'no-store').json(await resetInfo(token));
}));
authRouter.get('/reset/:token', strictLimiter, route(async (req, res) => {
  res.set('Cache-Control', 'no-store').json(await resetInfo(String(req.params.token)));
}));

authRouter.post(
  '/reset',
  strictLimiter,
  route(async (req, res) => {
    const body = parse(z.object({ token: z.string().min(1).max(200), newPassword: password }), req.body);
    const me = await db.transaction().execute(async (trx) => {
      const candidate = await trx.selectFrom('password_resets').select('user_id').where('token_hash', '=', hashToken(body.token)).executeTakeFirst();
      if (!candidate) throw new HttpError(410, 'This reset link is invalid or has expired.', 'reset_invalid');
      const user = await trx.selectFrom('users').select('id').where('id', '=', candidate.user_id).where('is_disabled', '=', false).forUpdate().executeTakeFirst();
      if (!user) throw new HttpError(410, 'This reset link is invalid or has expired.', 'reset_invalid');
      const reset = await trx
        .updateTable('password_resets')
        .set({ used_at: new Date() })
        .where('token_hash', '=', hashToken(body.token))
        .where('used_at', 'is', null)
        .where('expires_at', '>', new Date())
        .returning('user_id')
        .executeTakeFirst();
      if (!reset) throw new HttpError(410, 'This reset link is invalid or has expired.', 'reset_invalid');
      await trx.updateTable('password_resets').set({ used_at: new Date() }).where('user_id', '=', reset.user_id).where('used_at', 'is', null).execute();
      await trx
        .updateTable('users')
        .set({ password_hash: await hashPassword(body.newPassword), failed_logins: 0, locked_until: null })
        .where('id', '=', reset.user_id)
        .execute();
      await trx.deleteFrom('sessions').where('user_id', '=', reset.user_id).execute();
      const membership = await trx
        .selectFrom('memberships')
        .select('workspace_id')
        .where('user_id', '=', reset.user_id)
        .orderBy('created_at')
        .executeTakeFirst();
      if (!membership) return null;
      await startSession(trx, req, res, reset.user_id, membership.workspace_id);
      return loadMe(trx, reset.user_id, membership.workspace_id);
    });
    res.set('Cache-Control', 'no-store');
    if (!me) return res.status(204).end();
    res.json(me);
  })
);
