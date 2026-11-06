// Local-only integration harness. Never mounted in production and incomplete:
// recovery delivery, an exposed MFA reset and production-ready throttling remain blocked.
import { Router } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { hashToken } from '../auth/crypto.js';
import { founderEncryptionKey } from '../auth/founder-mfa.js';
import { founderEnrollment, founderFirstPasswordRotation, founderMfaStep, founderPasswordStep } from '../auth/founder-auth.js';
import { FOUNDER_COOKIE_DEVELOPMENT, FOUNDER_COOKIE_PRODUCTION, requireFounderPermission } from '../auth/founder-session.js';
import { consumeFounderBucket, founderRateKey, type FounderRateAction } from '../auth/founder-rate-limit.js';
import { createFounderCustomersExperimentalRouter } from './founders-customers-experimental.js';

export function createFoundersExperimentalRouter() {
  const foundersExperimentalRouter = Router();
  const secure = config.secureCookies;
  const flowCookie = secure ? '__Host-sv_founder_flow' : 'sv_founder_flow';
  const sessionCookie = secure ? FOUNDER_COOKIE_PRODUCTION : FOUNDER_COOKIE_DEVELOPMENT;
  const options = { httpOnly: true, secure, sameSite: 'strict' as const, path: '/' };
  const flowOptions = { ...options, maxAge: 5 * 60_000 };
  const sessionOptions = { ...options, maxAge: 8 * 60 * 60_000 };
  const key = founderEncryptionKey(config.SV_FOUNDER_TOTP_KEY);
  const rateKey = founderEncryptionKey(config.SV_FOUNDER_RATE_LIMIT_KEY);
  const denied = { error: 'Authentication could not be completed.' };
  const limiter = (action: FounderRateAction): RequestHandler => async (req, res, next) => {
    try {
      if (!req.ip) { res.status(503).json({ error: 'Founder authentication unavailable' }); return; }
      const ip = ipKeyGenerator(req.ip);
      const ipPolicy = { freeAttempts: 30, windowSeconds: 900, firstDelaySeconds: 5, maxDelaySeconds: 300 };
      const pairPolicy = { freeAttempts: 8, windowSeconds: 900, firstDelaySeconds: 5, maxDelaySeconds: 300 };
      const ipDecision = await consumeFounderBucket(db, founderRateKey(rateKey, action, 'ip', ip), ipPolicy);
      if (!ipDecision.allowed) { res.setHeader('Retry-After', String(ipDecision.retryAfterSeconds)); res.status(429).json({ error: 'Too many requests. Try again later.' }); return; }
      let account = '';
      if (action === 'login' && typeof req.body?.email === 'string') account = req.body.email.trim().toLowerCase().slice(0, 254);
      else if (typeof req.cookies?.[flowCookie] === 'string' && /^[A-Za-z0-9_-]{43}$/.test(req.cookies[flowCookie])) {
        const flow = await db.selectFrom('founder_auth_flows').select('founder_id').where('token_hash', '=', hashToken(req.cookies[flowCookie])).executeTakeFirst();
        account = flow?.founder_id ?? '';
      }
      if (account) {
        const decision = await consumeFounderBucket(db, founderRateKey(rateKey, action, 'account_ip', JSON.stringify([ip, account])), pairPolicy);
        if (!decision.allowed) { res.setHeader('Retry-After', String(decision.retryAfterSeconds)); res.status(429).json({ error: 'Too many requests. Try again later.' }); return; }
      }
      next();
    } catch (error) { next(error); }
  };

  foundersExperimentalRouter.post('/login', limiter('login'), async (req, res, next) => {
    try {
      const body = z.object({ email: z.string().trim().max(254).pipe(z.email()), password: z.string().min(1).max(200) }).strict().safeParse(req.body);
      if (!body.success) { res.status(401).json(denied); return; }
      const result = await founderPasswordStep(db, body.data.email, body.data.password);
      if (!result) { res.status(401).json(denied); return; }
      res.clearCookie(sessionCookie, options);
      res.cookie(flowCookie, result.token, flowOptions).json({ step: result.stage });
    } catch (error) { next(error); }
  });
  foundersExperimentalRouter.post('/mfa/setup', limiter('mfa_setup'), async (req, res, next) => {
    try {
      const token = req.cookies?.[flowCookie];
      const result = typeof token === 'string' ? await founderEnrollment(db, token, key) : null;
      if (!result) { res.status(401).json(denied); return; }
      res.json(result);
    } catch (error) { next(error); }
  });
  foundersExperimentalRouter.post('/mfa/verify', limiter('mfa_verify'), async (req, res, next) => {
    try {
      const body = z.object({ code: z.string().min(1).max(64) }).strict().safeParse(req.body);
      const token = req.cookies?.[flowCookie];
      const result = body.success && typeof token === 'string' ? await founderMfaStep(db, token, body.data.code, key) : null;
      if (!result) { res.status(401).json(denied); return; }
      res.clearCookie(flowCookie, options);
      if (result.kind === 'rotate') {
        res.cookie(flowCookie, result.flowToken, flowOptions).json({ step: 'rotate', ...(result.recoveryCodes ? { recoveryCodes: result.recoveryCodes } : {}) });
      } else {
        res.cookie(sessionCookie, result.sessionToken, sessionOptions).json({ step: 'authenticated' });
      }
    } catch (error) { next(error); }
  });
  foundersExperimentalRouter.post('/password/rotate', limiter('password_rotate'), async (req, res, next) => {
    try {
      const body = z.object({ password: z.string().min(14).max(200) }).strict().safeParse(req.body);
      const token = req.cookies?.[flowCookie];
      const session = body.success && typeof token === 'string' ? await founderFirstPasswordRotation(db, token, body.data.password) : null;
      if (!session) { res.status(401).json(denied); return; }
      res.clearCookie(flowCookie, options);
      res.cookie(sessionCookie, session, sessionOptions).json({ step: 'authenticated' });
    } catch (error) { next(error); }
  });
  foundersExperimentalRouter.get('/me', requireFounderPermission('platform.operations.read', secure), (_req, res) => {
    res.json({ founder: res.locals.founder, scope: 'authentication-only', experimental: true });
  });
  foundersExperimentalRouter.post('/logout', async (req, res, next) => {
    try {
      const token = req.cookies?.[sessionCookie];
      const flowToken = req.cookies?.[flowCookie];
      await db.transaction().execute(async (trx) => {
        if (typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token)) {
          const session = await trx.deleteFrom('founder_sessions').where('token_hash', '=', hashToken(token)).returning('founder_id').executeTakeFirst();
          if (session) {
            const founder = await trx.selectFrom('founder_accounts').select('role').where('id', '=', session.founder_id).executeTakeFirstOrThrow();
            await trx.insertInto('founder_security_audit').values({ event_type: 'logout', actor_id: session.founder_id, actor_role: founder.role, target_id: session.founder_id, outcome: 'success', request_id: randomUUID() }).execute();
          }
        }
        if (typeof flowToken === 'string' && /^[A-Za-z0-9_-]{43}$/.test(flowToken)) await trx.deleteFrom('founder_auth_flows').where('token_hash', '=', hashToken(flowToken)).execute();
      });
      res.clearCookie(flowCookie, options); res.clearCookie(sessionCookie, options); res.status(204).end();
    } catch (error) { next(error); }
  });
  if (config.FOUNDER_MANAGEMENT_EXPERIMENTAL && config.NODE_ENV !== 'production') foundersExperimentalRouter.use(createFounderCustomersExperimentalRouter());
  return foundersExperimentalRouter;
}
