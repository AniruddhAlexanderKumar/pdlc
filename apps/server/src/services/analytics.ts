import { sql } from 'kysely';
import type {
  AnalyticsEventRecord,
  AnalyticsEventStat,
  AnalyticsLoginRecord,
  AnalyticsOverview,
  AnalyticsPageViewStat,
  AnalyticsTimeSeriesPoint,
  AnalyticsUserSummary
} from '@sv/shared';
import { db, type Db } from '../db/index.js';
import { logger } from '../lib/logger.js';

export interface TrackParams {
  eventType: 'page_view' | 'login' | 'logout' | 'action' | 'interaction';
  eventName: string;
  userId?: string | null;
  workspaceId?: string | null;
  sessionId?: string | null;
  anonymousId?: string | null;
  pagePath?: string | null;
  pageTitle?: string | null;
  referrer?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function parseDevice(ua: string | null): string {
  if (!ua) return 'Desktop';
  const lower = ua.toLowerCase();
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(lower)) {
    return 'Mobile';
  }
  if (/tablet|ipad|playbook|silk/i.test(lower)) {
    return 'Tablet';
  }
  if (/bot|crawler|spider|googlebot|bingbot|yandex/i.test(lower)) {
    return 'Bot';
  }
  return 'Desktop';
}

export function parseBrowser(ua: string | null): string {
  if (!ua) return 'Other';
  const lower = ua.toLowerCase();
  if (lower.includes('edg/')) return 'Edge';
  if (lower.includes('opr/') || lower.includes('opera')) return 'Opera';
  if (lower.includes('chrome') && !lower.includes('edg') && !lower.includes('opr')) return 'Chrome';
  if (lower.includes('safari') && !lower.includes('chrome') && !lower.includes('android')) return 'Safari';
  if (lower.includes('firefox')) return 'Firefox';
  return 'Other';
}

export async function recordAnalyticsEvent(params: TrackParams, trx?: Db): Promise<void> {
  // A failed statement aborts a PostgreSQL transaction even when JS catches it.
  // Isolate best-effort analytics in a savepoint, so a telemetry failure cannot
  // silently poison the business transaction. The event commits or rolls back with it.
  if (trx) await sql`SAVEPOINT analytics_event`.execute(trx);
  try {
    const executor = trx ?? db;
    await executor
      .insertInto('analytics_events')
      .values({
        event_type: params.eventType,
        event_name: params.eventName,
        user_id: params.userId ?? null,
        workspace_id: params.workspaceId ?? null,
        session_id: params.sessionId ?? null,
        anonymous_id: params.anonymousId ?? null,
        page_path: params.pagePath?.slice(0, 500) ?? null,
        page_title: params.pageTitle?.slice(0, 300) ?? null,
        referrer: params.referrer?.slice(0, 500) ?? null,
        ip: params.ip?.slice(0, 100) ?? null,
        user_agent: params.userAgent?.slice(0, 500) ?? null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null
      })
      .execute();
  } catch (err) {
    if (trx) await sql`ROLLBACK TO SAVEPOINT analytics_event`.execute(trx);
    logger.warn({ eventName: params.eventName }, 'failed to record analytics event');
  } finally {
    if (trx) await sql`RELEASE SAVEPOINT analytics_event`.execute(trx);
  }
}

function getTimeCutoff(timeRange: '24h' | '7d' | '30d' | 'all'): Date | null {
  const now = Date.now();
  if (timeRange === '24h') return new Date(now - 24 * 3600_000);
  if (timeRange === '7d') return new Date(now - 7 * 86400_000);
  if (timeRange === '30d') return new Date(now - 30 * 86400_000);
  return null;
}

export async function getAnalyticsOverview(
  timeRange: '24h' | '7d' | '30d' | 'all' = '7d',
  workspaceId?: string
): Promise<AnalyticsOverview> {
  const cutoff = getTimeCutoff(timeRange);

  // Base query filter
  let baseQuery = db.selectFrom('analytics_events');
  if (cutoff) {
    baseQuery = baseQuery.where('created_at', '>=', cutoff);
  }
  if (workspaceId) {
    baseQuery = baseQuery.where((eb) => eb.or([eb('workspace_id', '=', workspaceId), eb('workspace_id', 'is', null)]));
  }

  // 1. Total page views
  const pageViewsRow = await baseQuery
    .select(sql<number>`count(*)::int`.as('c'))
    .where('event_type', '=', 'page_view')
    .executeTakeFirst();
  const totalPageViews = Number(pageViewsRow?.c ?? 0);

  // 2. Unique visitors
  const uniqueVisitorsRow = await baseQuery
    .select(sql<number>`count(distinct coalesce(user_id::text, anonymous_id, ip))::int`.as('c'))
    .executeTakeFirst();
  const uniqueVisitors = Number(uniqueVisitorsRow?.c ?? 0);

  // 3. Total logins
  const loginsRow = await baseQuery
    .select(sql<number>`count(*)::int`.as('c'))
    .where((eb) => eb.or([eb('event_type', '=', 'login'), eb('event_name', '=', 'auth.login')]))
    .executeTakeFirst();
  const totalLogins = Number(loginsRow?.c ?? 0);

  // 4. Total actions
  const actionsRow = await baseQuery
    .select(sql<number>`count(*)::int`.as('c'))
    .where('event_type', '=', 'action')
    .executeTakeFirst();
  const totalActions = Number(actionsRow?.c ?? 0);

  // 5. Active users today (last 24 hours)
  const oneDayAgo = new Date(Date.now() - 24 * 3600_000);
  let activeUsersQuery = db.selectFrom('analytics_events').where('created_at', '>=', oneDayAgo).where('user_id', 'is not', null);
  if (workspaceId) {
    activeUsersQuery = activeUsersQuery.where('workspace_id', '=', workspaceId);
  }
  const activeUsersRow = await activeUsersQuery.select(sql<number>`count(distinct user_id)::int`.as('c')).executeTakeFirst();
  const activeUsersToday = Number(activeUsersRow?.c ?? 0);

  // 6. Time series data
  // For 24h: bucket by hour. For 7d / 30d / all: bucket by day (YYYY-MM-DD).
  const is24h = timeRange === '24h';
  const dateFormat = is24h ? "to_char(created_at, 'YYYY-MM-DD HH24:00')" : "to_char(created_at, 'YYYY-MM-DD')";

  let timeSeriesQuery = db
    .selectFrom('analytics_events')
    .select([
      sql<string>`${sql.raw(dateFormat)}`.as('bucket'),
      sql<number>`count(*) filter (where event_type = 'page_view')::int`.as('page_views'),
      sql<number>`count(*) filter (where event_type = 'action')::int`.as('actions'),
      sql<number>`count(*) filter (where event_type = 'login' or event_name = 'auth.login')::int`.as('logins'),
      sql<number>`count(distinct user_id) filter (where user_id is not null)::int`.as('active_users')
    ])
    .groupBy(sql.raw(dateFormat))
    .orderBy(sql.raw(dateFormat), 'asc');

  if (cutoff) {
    timeSeriesQuery = timeSeriesQuery.where('created_at', '>=', cutoff);
  }
  if (workspaceId) {
    timeSeriesQuery = timeSeriesQuery.where((eb) => eb.or([eb('workspace_id', '=', workspaceId), eb('workspace_id', 'is', null)]));
  }

  const timeSeriesRows = await timeSeriesQuery.execute();
  const timeSeries: AnalyticsTimeSeriesPoint[] = timeSeriesRows.map((r) => ({
    date: r.bucket,
    pageViews: Number(r.page_views ?? 0),
    actions: Number(r.actions ?? 0),
    logins: Number(r.logins ?? 0),
    activeUsers: Number(r.active_users ?? 0)
  }));

  // 7. Top Pages
  let topPagesQuery = db
    .selectFrom('analytics_events')
    .select([
      'page_path as path',
      sql<string>`max(page_title)`.as('title'),
      sql<number>`count(*)::int`.as('views'),
      sql<number>`count(distinct coalesce(user_id::text, anonymous_id, ip))::int`.as('unique_visitors'),
      sql<number>`count(distinct user_id) filter (where user_id is not null)::int`.as('unique_users')
    ])
    .where('event_type', '=', 'page_view')
    .where('page_path', 'is not', null)
    .groupBy('page_path')
    .orderBy('views', 'desc')
    .limit(10);

  if (cutoff) {
    topPagesQuery = topPagesQuery.where('created_at', '>=', cutoff);
  }
  if (workspaceId) {
    topPagesQuery = topPagesQuery.where((eb) => eb.or([eb('workspace_id', '=', workspaceId), eb('workspace_id', 'is', null)]));
  }

  const topPagesRows = await topPagesQuery.execute();
  const topPages: AnalyticsPageViewStat[] = topPagesRows.map((r) => ({
    path: r.path ?? '/',
    title: r.title ?? null,
    views: Number(r.views ?? 0),
    uniqueVisitors: Number(r.unique_visitors ?? 0),
    uniqueUsers: Number(r.unique_users ?? 0)
  }));

  // 8. Top Events (excluding pure page_views)
  let topEventsQuery = db
    .selectFrom('analytics_events')
    .select([
      'event_name as name',
      sql<number>`count(*)::int`.as('count'),
      sql<number>`count(distinct user_id) filter (where user_id is not null)::int`.as('unique_users')
    ])
    .where('event_type', '<>', 'page_view')
    .groupBy('event_name')
    .orderBy('count', 'desc')
    .limit(10);

  if (cutoff) {
    topEventsQuery = topEventsQuery.where('created_at', '>=', cutoff);
  }
  if (workspaceId) {
    topEventsQuery = topEventsQuery.where((eb) => eb.or([eb('workspace_id', '=', workspaceId), eb('workspace_id', 'is', null)]));
  }

  const topEventsRows = await topEventsQuery.execute();
  const topEvents: AnalyticsEventStat[] = topEventsRows.map((r) => ({
    name: r.name,
    count: Number(r.count ?? 0),
    uniqueUsers: Number(r.unique_users ?? 0)
  }));

  // 9. Devices & Browsers breakdown
  let uaQuery = db
    .selectFrom('analytics_events')
    .select(['user_agent'])
    .where('user_agent', 'is not', null);

  if (cutoff) {
    uaQuery = uaQuery.where('created_at', '>=', cutoff);
  }
  if (workspaceId) {
    uaQuery = uaQuery.where((eb) => eb.or([eb('workspace_id', '=', workspaceId), eb('workspace_id', 'is', null)]));
  }

  const uaRows = await uaQuery.limit(1000).execute();
  const deviceCounts: Record<string, number> = { Desktop: 0, Mobile: 0, Tablet: 0, Bot: 0 };
  const browserCounts: Record<string, number> = { Chrome: 0, Safari: 0, Firefox: 0, Edge: 0, Opera: 0, Other: 0 };

  for (const r of uaRows) {
    const d = parseDevice(r.user_agent);
    deviceCounts[d] = (deviceCounts[d] ?? 0) + 1;
    const b = parseBrowser(r.user_agent);
    browserCounts[b] = (browserCounts[b] ?? 0) + 1;
  }

  const deviceBreakdown = Object.entries(deviceCounts)
    .filter(([_, count]) => count > 0)
    .map(([device, count]) => ({ device, count }));

  const browserBreakdown = Object.entries(browserCounts)
    .filter(([_, count]) => count > 0)
    .map(([browser, count]) => ({ browser, count }));

  return {
    totalPageViews,
    uniqueVisitors,
    totalLogins,
    totalActions,
    activeUsersToday,
    timeRange,
    timeSeries,
    topPages,
    topEvents,
    deviceBreakdown,
    browserBreakdown
  };
}

export async function getAnalyticsLogins(
  limit: number = 50,
  offset: number = 0,
  search?: string,
  workspaceId?: string
): Promise<{ items: AnalyticsLoginRecord[]; total: number }> {
  let query = db
    .selectFrom('analytics_events as a')
    .leftJoin('users as u', 'u.id', 'a.user_id')
    .leftJoin('workspaces as w', 'w.id', 'a.workspace_id')
    .where((eb) => eb.or([eb('a.event_type', '=', 'login'), eb('a.event_name', '=', 'auth.login')]));

  if (workspaceId) {
    query = query.where('a.workspace_id', '=', workspaceId);
  }

  if (search && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    query = query.where(sql<boolean>`(lower(u.name) like ${q} or lower(u.email) like ${q} or lower(a.ip) like ${q})`);
  }

  const totalRow = await query.select(sql<number>`count(*)::int`.as('c')).executeTakeFirst();
  const total = Number(totalRow?.c ?? 0);

  const rows = await query
    .select([
      'a.id',
      'a.user_id',
      'u.name as user_name',
      'u.email as user_email',
      'a.workspace_id',
      'w.name as workspace_name',
      'a.ip',
      'a.user_agent',
      'a.created_at'
    ])
    .orderBy('a.created_at', 'desc')
    .limit(limit)
    .offset(offset)
    .execute();

  const items: AnalyticsLoginRecord[] = rows.map((r) => ({
    id: r.id,
    userId: r.user_id ?? 'unknown',
    userName: r.user_name ?? 'Guest / Deleted User',
    userEmail: r.user_email ?? 'Unknown',
    workspaceId: r.workspace_id,
    workspaceName: r.workspace_name,
    ip: r.ip,
    userAgent: r.user_agent,
    createdAt: r.created_at.toISOString()
  }));

  return { items, total };
}

export async function getAnalyticsActivity(
  limit: number = 50,
  offset: number = 0,
  type?: string,
  userId?: string,
  search?: string,
  workspaceId?: string
): Promise<{ items: AnalyticsEventRecord[]; total: number }> {
  let query = db
    .selectFrom('analytics_events as a')
    .leftJoin('users as u', 'u.id', 'a.user_id')
    .leftJoin('workspaces as w', 'w.id', 'a.workspace_id');

  if (workspaceId) {
    query = query.where((eb) => eb.or([eb('a.workspace_id', '=', workspaceId), eb('a.workspace_id', 'is', null)]));
  }

  if (type && type !== 'all') {
    query = query.where('a.event_type', '=', type);
  }

  if (userId) {
    query = query.where('a.user_id', '=', userId);
  }

  if (search && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    query = query.where(
      sql<boolean>`(lower(a.event_name) like ${q} or lower(a.page_path) like ${q} or lower(u.name) like ${q} or lower(u.email) like ${q})`
    );
  }

  const totalRow = await query.select(sql<number>`count(*)::int`.as('c')).executeTakeFirst();
  const total = Number(totalRow?.c ?? 0);

  const rows = await query
    .select([
      'a.id',
      'a.event_type',
      'a.event_name',
      'a.user_id',
      'u.name as user_name',
      'u.email as user_email',
      'a.workspace_id',
      'w.name as workspace_name',
      'a.page_path',
      'a.page_title',
      'a.referrer',
      'a.ip',
      'a.user_agent',
      'a.metadata',
      'a.created_at'
    ])
    .orderBy('a.created_at', 'desc')
    .limit(limit)
    .offset(offset)
    .execute();

  const items: AnalyticsEventRecord[] = rows.map((r) => {
    let parsedMeta: Record<string, unknown> | null = null;
    if (r.metadata) {
      if (typeof r.metadata === 'string') {
        try {
          parsedMeta = JSON.parse(r.metadata);
        } catch {
          parsedMeta = null;
        }
      } else if (typeof r.metadata === 'object') {
        parsedMeta = r.metadata as Record<string, unknown>;
      }
    }

    return {
      id: r.id,
      eventType: r.event_type as any,
      eventName: r.event_name,
      userId: r.user_id,
      userName: r.user_name,
      userEmail: r.user_email,
      workspaceId: r.workspace_id,
      workspaceName: r.workspace_name,
      pagePath: r.page_path,
      pageTitle: r.page_title,
      referrer: r.referrer,
      ip: r.ip,
      userAgent: r.user_agent,
      metadata: parsedMeta,
      createdAt: r.created_at.toISOString()
    };
  });

  return { items, total };
}

export async function getAnalyticsUserSummaries(workspaceId?: string): Promise<AnalyticsUserSummary[]> {
  let userQuery = db.selectFrom('users').select(['id', 'name', 'email']);
  if (workspaceId) {
    userQuery = userQuery
      .innerJoin('memberships as m', 'm.user_id', 'users.id')
      .where('m.workspace_id', '=', workspaceId);
  }
  const users = await userQuery.execute();

  const summaries: AnalyticsUserSummary[] = [];

  for (const u of users) {
    // 1. Total logins & last login
    const loginStats = await db
      .selectFrom('analytics_events')
      .select([
        sql<number>`count(*)::int`.as('c'),
        sql<Date>`max(created_at)`.as('last_login')
      ])
      .where('user_id', '=', u.id)
      .where((eb) => eb.or([eb('event_type', '=', 'login'), eb('event_name', '=', 'auth.login')]))
      .executeTakeFirst();

    // 2. Total pageviews & actions & last active
    const eventStats = await db
      .selectFrom('analytics_events')
      .select([
        sql<number>`count(*) filter (where event_type = 'page_view')::int`.as('page_views'),
        sql<number>`count(*) filter (where event_type = 'action')::int`.as('actions'),
        sql<Date>`max(created_at)`.as('last_active')
      ])
      .where('user_id', '=', u.id)
      .executeTakeFirst();

    // 3. Top 3 pages
    const topPages = await db
      .selectFrom('analytics_events')
      .select(['page_path', sql<number>`count(*)::int`.as('c')])
      .where('user_id', '=', u.id)
      .where('event_type', '=', 'page_view')
      .where('page_path', 'is not', null)
      .groupBy('page_path')
      .orderBy('c', 'desc')
      .limit(3)
      .execute();

    // 4. Recent events
    const recentEvents = await db
      .selectFrom('analytics_events')
      .select(['event_name', 'event_type', 'created_at'])
      .where('user_id', '=', u.id)
      .orderBy('created_at', 'desc')
      .limit(3)
      .execute();

    summaries.push({
      userId: u.id,
      name: u.name,
      email: u.email,
      totalLogins: Number(loginStats?.c ?? 0),
      lastLoginAt: loginStats?.last_login ? loginStats.last_login.toISOString() : null,
      totalPageViews: Number(eventStats?.page_views ?? 0),
      totalActions: Number(eventStats?.actions ?? 0),
      lastActiveAt: eventStats?.last_active ? eventStats.last_active.toISOString() : null,
      topPages: topPages.map((p) => p.page_path ?? '').filter(Boolean),
      recentEvents: recentEvents.map((e) => ({
        name: e.event_name,
        type: e.event_type,
        createdAt: e.created_at.toISOString()
      }))
    });
  }

  // Sort by most active users first
  summaries.sort((a, b) => b.totalActions + b.totalPageViews - (a.totalActions + a.totalPageViews));
  return summaries;
}
