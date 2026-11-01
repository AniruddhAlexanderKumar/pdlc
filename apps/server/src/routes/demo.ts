import { createHmac } from 'node:crypto';
import { Router, type Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { newToken, hashToken } from '../auth/crypto.js';
import { HttpError, badRequest, route } from '../lib/http.js';

export const demoRouter = Router();

const DEMO_COOKIE = 'sv_demo_session';
const DEMO_DURATION_MS = 15 * 60 * 1000;

const startLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many demo access attempts. Try again later.' }
});

function ipFingerprint(ip: string): string {
  const normalized = ip.toLowerCase().replace(/^::ffff:/, '');
  return createHmac('sha256', config.demoIpHashSecret).update(normalized).digest('hex');
}

function requestIp(req: Request): string {
  const ip = req.ip || req.socket.remoteAddress;
  if (!ip) throw badRequest('Could not determine the network address for this demo request');
  return ipFingerprint(ip);
}

demoRouter.post(
  '/access',
  startLimit,
  route(async (req, res) => {
    const fingerprint = requestIp(req);
    const presentedToken = req.cookies?.[DEMO_COOKIE];

    const result = await db.transaction().execute(async (trx) => {
      const current = await trx.selectFrom('demo_access').selectAll().where('ip_hash', '=', fingerprint).executeTakeFirst();
      if (current) {
        if (
          typeof presentedToken === 'string' &&
          hashToken(presentedToken) === current.token_hash &&
          current.expires_at.getTime() > Date.now()
        ) {
          return { token: presentedToken, expiresAt: current.expires_at, resumed: true };
        }
        throw new HttpError(410, 'This network has already used its one-time demo access.', 'demo_already_used');
      }

      const { token, hash } = newToken();
      const expiresAt = new Date(Date.now() + DEMO_DURATION_MS);
      const inserted = await trx
        .insertInto('demo_access')
        .values({ ip_hash: fingerprint, token_hash: hash, expires_at: expiresAt })
        .onConflict((conflict) => conflict.column('ip_hash').doNothing())
        .returning('ip_hash')
        .executeTakeFirst();
      if (!inserted) {
        const existing = await trx.selectFrom('demo_access').selectAll().where('ip_hash', '=', fingerprint).executeTakeFirst();
        if (
          existing &&
          typeof presentedToken === 'string' &&
          hashToken(presentedToken) === existing.token_hash &&
          existing.expires_at.getTime() > Date.now()
        ) {
          return { token: presentedToken, expiresAt: existing.expires_at, resumed: true };
        }
        throw new HttpError(410, 'This network has already used its one-time demo access.', 'demo_already_used');
      }
      return { token, expiresAt, resumed: false };
    });

    const maxAge = Math.max(0, result.expiresAt.getTime() - Date.now());
    res.cookie(DEMO_COOKIE, result.token, {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: 'strict',
      path: '/api/demo',
      expires: result.expiresAt,
      maxAge
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ expiresAt: result.expiresAt.toISOString(), resumed: result.resumed });
  })
);

demoRouter.get(
  '/data',
  route(async (req, res) => {
    const token = req.cookies?.[DEMO_COOKIE];
    if (typeof token !== 'string') throw new HttpError(410, 'Demo access has expired or was not started.', 'demo_expired');
    const access = await db.selectFrom('demo_access').select('expires_at')
      .where('ip_hash', '=', requestIp(req))
      .where('token_hash', '=', hashToken(token))
      .executeTakeFirst();
    if (!access || access.expires_at.getTime() <= Date.now()) {
      throw new HttpError(410, 'Demo access has expired or was not started.', 'demo_expired');
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      workspaceName: 'Northstar Product Studio',
      metrics: [
        { label: 'Active products', value: '12', note: '+2 moved forward this month', icon: 'products' },
        { label: 'Projects in progress', value: '4', note: '3 milestones this week', icon: 'projects' },
        { label: 'Open issues', value: '28', note: '5 high priority', icon: 'issues' },
        { label: 'Portfolio health', value: '91%', note: 'Based on sample delivery data', icon: 'health' }
      ],
      products: [
        { name: 'AeroBottle', category: 'Outdoor hydration', stage: 'Validation', completion: 78, health: 'On track', color: 'bg-indigo-500' },
        { name: 'LumaDesk', category: 'Workspace accessories', stage: 'Development', completion: 54, health: 'On track', color: 'bg-cyan-500' },
        { name: 'FieldKit Mini', category: 'Portable equipment', stage: 'Research', completion: 31, health: 'Needs review', color: 'bg-amber-500' }
      ],
      issues: [
        { key: 'AERO-24', title: 'Validate lid seal under pressure', type: 'Test', priority: 'High', status: 'In Progress', owner: 'Maya Chen' },
        { key: 'AERO-23', title: 'Update recycled-material specification', type: 'Story', priority: 'Medium', status: 'Done', owner: 'Jon Bell' },
        { key: 'AERO-22', title: 'Resolve cap thread tolerance defect', type: 'Bug', priority: 'Critical', status: 'Done', owner: 'Priya Shah' },
        { key: 'AERO-21', title: 'Prepare pilot batch review', type: 'Task', priority: 'Low', status: 'Open', owner: 'Maya Chen' }
      ],
      contributions: [
        { name: 'Seal tolerance redesign', category: 'Engineering', score: 82, dimensions: 'Impact 4 · Quality 5 · Complexity 4' },
        { name: 'Pilot test plan and handoff', category: 'Quality', score: 71, dimensions: 'Impact 3 · Quality 5 · Collaboration 4' },
        { name: 'Supplier material review', category: 'Research', score: 64, dimensions: 'Impact 4 · Quality 3 · Effort 3' }
      ],
      activity: [
        { name: 'Maya Chen', action: 'advanced AeroBottle validation', when: '18 min ago' },
        { name: 'Priya Shah', action: 'resolved a critical tolerance defect', when: '2 hours ago' },
        { name: 'Jon Bell', action: 'completed material review', when: 'Yesterday' }
      ]
    });
  })
);
