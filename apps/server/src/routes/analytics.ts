import { Router } from 'express';
import { z } from 'zod';
import { auth, requireAdmin } from '../auth/session.js';
import { badRequest, parse, route } from '../lib/http.js';
import {
  getAnalyticsActivity,
  getAnalyticsLogins,
  getAnalyticsOverview,
  getAnalyticsUserSummaries,
  recordAnalyticsEvent
} from '../services/analytics.js';

export const analyticsRouter = Router();

const singleEventSchema = z.object({
  type: z.enum(['page_view', 'login', 'logout', 'action', 'interaction']),
  name: z.string().min(1).max(100),
  pagePath: z.string().max(500).optional(),
  pageTitle: z.string().max(300).optional(),
  referrer: z.string().max(500).optional(),
  anonymousId: z.string().max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const trackSchema = z.union([
  singleEventSchema,
  z.object({
    events: z.array(singleEventSchema).min(1).max(50)
  })
]);

// ── Ingestion Endpoint ──────────────────────────────────────────────────────
// Does not require authentication so anonymous visits before login are tracked.
// If user has an active session cookie, req.auth is populated automatically by loadSession.
analyticsRouter.post(
  '/track',
  route(async (req, res) => {
    const body = parse(trackSchema, req.body);
    const events = 'events' in body ? body.events : [body];

    const userId = req.auth?.userId ?? null;
    const workspaceId = req.auth?.workspaceId ?? null;
    const sessionId = req.auth?.sessionId ?? null;
    const ip = req.ip ?? null;
    const userAgent = req.get('user-agent') ?? null;

    let count = 0;
    for (const ev of events) {
      await recordAnalyticsEvent({
        eventType: ev.type,
        eventName: ev.name,
        userId,
        workspaceId,
        sessionId,
        anonymousId: ev.anonymousId ?? null,
        pagePath: ev.pagePath ?? null,
        pageTitle: ev.pageTitle ?? null,
        referrer: ev.referrer ?? null,
        ip,
        userAgent,
        metadata: ev.metadata ?? null
      });
      count++;
    }

    res.json({ ok: true, count });
  })
);

// ── Admin-Only Analytics Query Endpoints ────────────────────────────────────
// Only administrators can view analytics data across users and workspaces.

analyticsRouter.get(
  '/overview',
  requireAdmin,
  route(async (req, res) => {
    const timeRangeParam = (req.query.timeRange as string) || '7d';
    const timeRange = ['24h', '7d', '30d', 'all'].includes(timeRangeParam)
      ? (timeRangeParam as '24h' | '7d' | '30d' | 'all')
      : '7d';

    const workspaceId = typeof req.query.workspaceId === 'string' && req.query.workspaceId ? req.query.workspaceId : undefined;
    const overview = await getAnalyticsOverview(timeRange, workspaceId);
    res.json(overview);
  })
);

analyticsRouter.get(
  '/logins',
  requireAdmin,
  route(async (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const workspaceId = typeof req.query.workspaceId === 'string' && req.query.workspaceId ? req.query.workspaceId : undefined;

    const result = await getAnalyticsLogins(limit, offset, search, workspaceId);
    res.json(result);
  })
);

analyticsRouter.get(
  '/activity',
  requireAdmin,
  route(async (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const workspaceId = typeof req.query.workspaceId === 'string' && req.query.workspaceId ? req.query.workspaceId : undefined;

    const result = await getAnalyticsActivity(limit, offset, type, userId, search, workspaceId);
    res.json(result);
  })
);

analyticsRouter.get(
  '/users',
  requireAdmin,
  route(async (req, res) => {
    const workspaceId = typeof req.query.workspaceId === 'string' && req.query.workspaceId ? req.query.workspaceId : undefined;
    const summaries = await getAnalyticsUserSummaries(workspaceId);
    res.json(summaries);
  })
);
