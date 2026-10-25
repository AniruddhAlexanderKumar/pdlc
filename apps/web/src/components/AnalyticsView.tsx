import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  Globe,
  KeyRound,
  Laptop,
  Layers,
  MousePointerClick,
  RefreshCw,
  Search,
  Smartphone,
  Tablet,
  UserCheck,
  Users
} from 'lucide-react';
import type {
  AnalyticsEventRecord,
  AnalyticsLoginRecord,
  AnalyticsOverview,
  AnalyticsUserSummary
} from '@sv/shared';
import { get } from '../api/client';
import { Button, Card, CardHeader, EmptyState, Input, ProgressBar, Spinner, cx } from './ui';

interface AnalyticsViewProps {
  isAdmin?: boolean;
  workspaceId?: string;
  title?: string;
  subtitle?: string;
}

export function AnalyticsView({ isAdmin, workspaceId, title, subtitle }: AnalyticsViewProps) {
  const qc = useQueryClient();
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'logins' | 'pages' | 'activity' | 'users'>('overview');

  // Search & Filter states
  const [loginSearch, setLoginSearch] = useState('');
  const [activitySearch, setActivitySearch] = useState('');
  const [activityType, setActivityType] = useState<string>('all');

  const baseEndpoint = '/analytics';
  const wsParam = workspaceId ? `&workspaceId=${workspaceId}` : '';

  // 1. Overview Query
  const overviewQuery = useQuery({
    queryKey: ['analytics-overview', timeRange, workspaceId],
    queryFn: () => get<AnalyticsOverview>(`${baseEndpoint}/overview?timeRange=${timeRange}${wsParam}`)
  });

  // 2. Logins Query
  const loginsQuery = useQuery({
    queryKey: ['analytics-logins', loginSearch, workspaceId],
    queryFn: () =>
      get<{ items: AnalyticsLoginRecord[]; total: number }>(
        `${baseEndpoint}/logins?limit=100&search=${encodeURIComponent(loginSearch)}${wsParam}`
      )
  });

  // 3. Activity Feed Query
  const activityQuery = useQuery({
    queryKey: ['analytics-activity', activityType, activitySearch, workspaceId],
    queryFn: () =>
      get<{ items: AnalyticsEventRecord[]; total: number }>(
        `${baseEndpoint}/activity?limit=100&type=${activityType}&search=${encodeURIComponent(activitySearch)}${wsParam}`
      )
  });

  // 4. Users Query
  const usersQuery = useQuery({
    queryKey: ['analytics-users', workspaceId],
    queryFn: () => get<AnalyticsUserSummary[]>(`${baseEndpoint}/users?${wsParam.slice(1)}`)
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['analytics-overview'] });
    qc.invalidateQueries({ queryKey: ['analytics-logins'] });
    qc.invalidateQueries({ queryKey: ['analytics-activity'] });
    qc.invalidateQueries({ queryKey: ['analytics-users'] });
  };

  const overview = overviewQuery.data;

  // Format relative time helper
  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
      if (diffSec < 60) return `${diffSec}s ago`;
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Top Bar: Title & Controls ────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {title && <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{title}</h2>}
          {subtitle && <p className="text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Time range pills */}
          <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-100/80 p-0.5 text-xs dark:border-zinc-800 dark:bg-zinc-800/80">
            {(['24h', '7d', '30d', 'all'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setTimeRange(r)}
                className={cx(
                  'rounded-md px-2.5 py-1 font-medium transition-colors',
                  timeRange === r
                    ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                )}
              >
                {r === '24h' ? '24 Hours' : r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : 'All Time'}
              </button>
            ))}
          </div>

          <Button
            size="sm"
            variant="secondary"
            icon={<RefreshCw className={cx('h-3.5 w-3.5', overviewQuery.isFetching && 'animate-spin')} />}
            onClick={refreshAll}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* ── KPI Stat Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Page Views */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Page Views</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
              <Eye className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
            {overview ? overview.totalPageViews.toLocaleString() : '—'}
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {overview ? `${overview.uniqueVisitors.toLocaleString()} unique visitors` : 'Loading...'}
          </p>
        </Card>

        {/* Total Logins */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Who Logged In</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
              <KeyRound className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
            {overview ? overview.totalLogins.toLocaleString() : '—'}
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {overview ? `${overview.activeUsersToday} active in last 24h` : 'Loading...'}
          </p>
        </Card>

        {/* User Actions */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">What They Did</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
              <MousePointerClick className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
            {overview ? overview.totalActions.toLocaleString() : '—'}
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Platform actions & events</p>
        </Card>

        {/* Total Events */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Active Users</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
            {overview ? overview.activeUsersToday.toLocaleString() : '—'}
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Active team members today</p>
        </Card>
      </div>

      {/* ── Interactive Activity Trend Chart ────────────────────────────── */}
      {overview && overview.timeSeries.length > 0 && (
        <Card className="p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Traffic & Activity Trend</h3>
              <p className="text-xs text-zinc-500">Page views, user actions, and logins over the selected period</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" /> Page views
              </span>
              <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Actions
              </span>
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Logins
              </span>
            </div>
          </div>

          <div className="mt-3 h-48 w-full">
            <ActivityTrendSvg points={overview.timeSeries} />
          </div>
        </Card>
      )}

      {/* ── Sub Navigation Tabs ──────────────────────────────────────────── */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex gap-1 overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview & Breakdown', icon: BarChart3 },
            { id: 'logins', label: 'Who Logged In', icon: KeyRound, count: loginsQuery.data?.total },
            { id: 'pages', label: 'What Pages They Used', icon: Eye, count: overview?.topPages.length },
            { id: 'activity', label: 'What They Did (Activity Log)', icon: Activity, count: activityQuery.data?.total },
            { id: 'users', label: 'User Summaries', icon: Users, count: usersQuery.data?.length }
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={cx(
                  'flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-medium transition-colors whitespace-nowrap',
                  active
                    ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                    : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-200'
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {typeof tab.count === 'number' && (
                  <span
                    className={cx(
                      'ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-semibold',
                      active ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                    )}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab Content ─────────────────────────────────────────────────── */}

      {/* 1. OVERVIEW SUBTAB */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Top Pages */}
            <Card>
              <CardHeader title="Most Visited Pages" subtitle="Top pages and routes browsed by users" />
              {overview?.topPages.length ? (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {overview.topPages.slice(0, 7).map((p) => {
                    const max = overview.topPages[0]?.views || 1;
                    const pct = Math.round((p.views / max) * 100);
                    return (
                      <div key={p.path} className="p-3.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[240px]">
                            {p.path}
                          </span>
                          <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                            {p.views.toLocaleString()} <span className="text-zinc-400 font-normal">views</span>
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] text-zinc-400 tabular-nums">
                            {p.uniqueVisitors} unique
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState icon={<Eye className="h-6 w-6" />} title="No page views yet" body="Page visits will show up here as users navigate." />
              )}
            </Card>

            {/* Top Actions */}
            <Card>
              <CardHeader title="Most Common Actions" subtitle="Top user actions performed across the workspace" />
              {overview?.topEvents.length ? (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {overview.topEvents.slice(0, 7).map((ev) => {
                    const max = overview.topEvents[0]?.count || 1;
                    const pct = Math.round((ev.count / max) * 100);
                    return (
                      <div key={ev.name} className="p-3.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="inline-flex items-center gap-1.5 font-medium text-zinc-800 dark:text-zinc-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            {ev.name}
                          </span>
                          <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                            {ev.count.toLocaleString()} <span className="text-zinc-400 font-normal">times</span>
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                            <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] text-zinc-400 tabular-nums">
                            {ev.uniqueUsers} users
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState icon={<Activity className="h-6 w-6" />} title="No actions recorded yet" body="User actions (creates, updates, logins) will be logged here." />
              )}
            </Card>
          </div>

          {/* Device & Browser Distribution */}
          <div className="grid gap-6 sm:grid-cols-2">
            <Card className="p-4">
              <CardHeader title="Device Breakdown" subtitle="Distribution of user devices accessing the server" />
              <div className="mt-3 space-y-2.5">
                {(overview?.deviceBreakdown ?? []).map((d) => {
                  const total = overview?.deviceBreakdown.reduce((sum, item) => sum + item.count, 0) || 1;
                  const pct = Math.round((d.count / total) * 100);
                  const Icon = d.device === 'Mobile' ? Smartphone : d.device === 'Tablet' ? Tablet : Laptop;
                  return (
                    <div key={d.device} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                          <Icon className="h-3.5 w-3.5 text-zinc-400" />
                          {d.device}
                        </span>
                        <span className="tabular-nums text-zinc-500">
                          {d.count} ({pct}%)
                        </span>
                      </div>
                      <ProgressBar value={pct} />
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="p-4">
              <CardHeader title="Browser Breakdown" subtitle="Browsers used by visitors" />
              <div className="mt-3 space-y-2.5">
                {(overview?.browserBreakdown ?? []).map((b) => {
                  const total = overview?.browserBreakdown.reduce((sum, item) => sum + item.count, 0) || 1;
                  const pct = Math.round((b.count / total) * 100);
                  return (
                    <div key={b.browser} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                          <Globe className="h-3.5 w-3.5 text-zinc-400" />
                          {b.browser}
                        </span>
                        <span className="tabular-nums text-zinc-500">
                          {b.count} ({pct}%)
                        </span>
                      </div>
                      <ProgressBar value={pct} />
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* 2. WHO LOGGED IN SUBTAB */}
      {activeSubTab === 'logins' && (
        <Card>
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 dark:border-zinc-800">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Login History ("Who Logged In")</h3>
              <p className="text-xs text-zinc-500">Audit trail of authenticated sessions and login events</p>
            </div>
            <div className="w-full sm:w-64">
              <Input
                placeholder="Search user, email or IP..."
                value={loginSearch}
                onChange={(e) => setLoginSearch(e.target.value)}
              />
            </div>
          </div>

          {loginsQuery.isLoading ? (
            <div className="p-8"><Spinner /></div>
          ) : loginsQuery.data?.items.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-100 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/40">
                  <tr>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Workspace</th>
                    <th className="px-4 py-3 font-medium">IP Address</th>
                    <th className="px-4 py-3 font-medium">Device & Browser</th>
                    <th className="px-4 py-3 font-medium">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {loginsQuery.data.items.map((log) => (
                    <tr key={log.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            {log.userName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-zinc-900 dark:text-zinc-100">{log.userName}</p>
                            <p className="text-[11px] text-zinc-500">{log.userEmail}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                        {log.workspaceName || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                        {log.ip || '127.0.0.1'}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                        <span className="truncate max-w-[200px] block" title={log.userAgent ?? ''}>
                          {log.userAgent ? log.userAgent.split(' ')[0] : 'Browser client'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                        <span title={new Date(log.createdAt).toLocaleString()}>
                          {formatTime(log.createdAt)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={<KeyRound className="h-6 w-6" />} title="No login events found" body="Logins will be recorded whenever users sign in." />
          )}
        </Card>
      )}

      {/* 3. WHAT PAGES THEY USED SUBTAB */}
      {activeSubTab === 'pages' && (
        <Card>
          <CardHeader
            title="Page Views & Navigation"
            subtitle="Breakdown of all pages visited on this server"
          />
          {overview?.topPages.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-100 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/40">
                  <tr>
                    <th className="px-4 py-3 font-medium">Page Route</th>
                    <th className="px-4 py-3 font-medium">Page Title</th>
                    <th className="px-4 py-3 font-medium text-right">Total Views</th>
                    <th className="px-4 py-3 font-medium text-right">Unique Visitors</th>
                    <th className="px-4 py-3 font-medium text-right">Logged-in Users</th>
                    <th className="px-4 py-3 font-medium">Share of Traffic</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {overview.topPages.map((p) => {
                    const totalAll = overview.totalPageViews || 1;
                    const pct = Math.round((p.views / totalAll) * 100);
                    return (
                      <tr key={p.path} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                        <td className="px-4 py-3 font-mono font-medium text-indigo-600 dark:text-indigo-400">
                          {p.path}
                        </td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                          {p.title || 'Solution Velocity'}
                        </td>
                        <td className="px-4 py-3 font-semibold tabular-nums text-right text-zinc-900 dark:text-zinc-100">
                          {p.views.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-right text-zinc-600 dark:text-zinc-400">
                          {p.uniqueVisitors.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-right text-zinc-600 dark:text-zinc-400">
                          {p.uniqueUsers.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 w-40">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                              <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[11px] text-zinc-400 tabular-nums w-8 text-right">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={<Eye className="h-6 w-6" />} title="No page views recorded" body="Page navigation events will appear here." />
          )}
        </Card>
      )}

      {/* 4. WHAT THEY DID (ACTIVITY AUDIT TRAIL) */}
      {activeSubTab === 'activity' && (
        <Card>
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 dark:border-zinc-800">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Audit Trail ("What They Did")</h3>
              <p className="text-xs text-zinc-500">Live chronological stream of actions, changes, and user events</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 text-xs dark:border-zinc-800 dark:bg-zinc-800">
                {(['all', 'action', 'login', 'page_view'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setActivityType(t)}
                    className={cx(
                      'rounded-md px-2.5 py-1 font-medium capitalize transition-colors',
                      activityType === t
                        ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100'
                        : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                    )}
                  >
                    {t === 'all' ? 'All' : t === 'action' ? 'Actions' : t === 'login' ? 'Logins' : 'Page Views'}
                  </button>
                ))}
              </div>
              <div className="w-full sm:w-48">
                <Input
                  placeholder="Filter activity..."
                  value={activitySearch}
                  onChange={(e) => setActivitySearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          {activityQuery.isLoading ? (
            <div className="p-8"><Spinner /></div>
          ) : activityQuery.data?.items.length ? (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {activityQuery.data.items.map((ev) => (
                <div key={ev.id} className="p-4 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 flex items-start gap-3.5">
                  <div
                    className={cx(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold',
                      ev.eventType === 'login'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : ev.eventType === 'page_view'
                        ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    )}
                  >
                    {ev.eventType === 'login' ? (
                      <KeyRound className="h-4 w-4" />
                    ) : ev.eventType === 'page_view' ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <MousePointerClick className="h-4 w-4" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                          {ev.userName || 'Anonymous Visitor'}
                        </span>
                        {ev.userEmail && (
                          <span className="text-[11px] text-zinc-400">({ev.userEmail})</span>
                        )}
                        <span
                          className={cx(
                            'rounded-full px-2 py-0.5 text-[10px] font-medium font-mono',
                            ev.eventType === 'login'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : ev.eventType === 'page_view'
                              ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                          )}
                        >
                          {ev.eventName}
                        </span>
                      </div>
                      <span className="text-[11px] text-zinc-400 tabular-nums">
                        {formatTime(ev.createdAt)}
                      </span>
                    </div>

                    {/* Metadata details or path */}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                      {ev.pagePath && (
                        <span className="font-mono text-[11px] bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                          {ev.pagePath}
                        </span>
                      )}
                      {ev.workspaceName && (
                        <span>in {ev.workspaceName}</span>
                      )}
                      {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                        <span className="text-[11px] text-zinc-400 font-mono">
                          {JSON.stringify(ev.metadata)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Activity className="h-6 w-6" />} title="No activity recorded" body="Events and actions will show up here as users interact with the app." />
          )}
        </Card>
      )}

      {/* 5. USER SUMMARIES SUBTAB */}
      {activeSubTab === 'users' && (
        <Card>
          <CardHeader
            title="User Engagement & Activity"
            subtitle="Aggregated activity breakdown per team member"
          />
          {usersQuery.isLoading ? (
            <div className="p-8"><Spinner /></div>
          ) : usersQuery.data?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-100 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/40">
                  <tr>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium text-right">Logins</th>
                    <th className="px-4 py-3 font-medium text-right">Page Views</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                    <th className="px-4 py-3 font-medium">Top Visited Pages</th>
                    <th className="px-4 py-3 font-medium">Last Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {usersQuery.data.map((u) => (
                    <tr key={u.userId} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500/10 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                            {u.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-zinc-900 dark:text-zinc-100">{u.name}</p>
                            <p className="text-[11px] text-zinc-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums text-right text-zinc-900 dark:text-zinc-100">
                        {u.totalLogins}
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums text-right text-zinc-900 dark:text-zinc-100">
                        {u.totalPageViews}
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums text-right text-zinc-900 dark:text-zinc-100">
                        {u.totalActions}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[280px]">
                          {u.topPages.length > 0 ? (
                            u.topPages.map((path) => (
                              <span
                                key={path}
                                className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                              >
                                {path}
                              </span>
                            ))
                          ) : (
                            <span className="text-zinc-400 text-[11px]">No pages recorded</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                        {u.lastActiveAt ? formatTime(u.lastActiveAt) : 'Never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={<Users className="h-6 w-6" />} title="No user activity found" body="Team members will show up here once they perform actions." />
          )}
        </Card>
      )}
    </div>
  );
}

// ── SVG Trend Chart Component ──────────────────────────────────────────────
function ActivityTrendSvg({ points }: { points: { date: string; pageViews: number; actions: number; logins: number }[] }) {
  if (!points || points.length === 0) return null;

  const width = 800;
  const height = 180;
  const paddingX = 40;
  const paddingY = 25;

  const maxVal = Math.max(
    1,
    ...points.map((p) => Math.max(p.pageViews, p.actions, p.logins))
  );

  const innerW = width - paddingX * 2;
  const innerH = height - paddingY * 2;

  const getX = (index: number) => {
    if (points.length <= 1) return paddingX + innerW / 2;
    return paddingX + (index / (points.length - 1)) * innerW;
  };

  const getY = (val: number) => {
    return height - paddingY - (val / maxVal) * innerH;
  };

  // Generate SVG path strings
  const pvPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.pageViews)}`).join(' ');
  const actPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.actions)}`).join(' ');
  const loginPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.logins)}`).join(' ');

  // Area path for pageviews
  const pvArea = `${pvPath} L ${getX(points.length - 1)} ${height - paddingY} L ${getX(0)} ${height - paddingY} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
      <defs>
        <linearGradient id="pvGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" strokeWidth="1" />
      <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" strokeWidth="1" strokeDasharray="3 3" />

      {/* Page view area fill */}
      <path d={pvArea} fill="url(#pvGrad)" />

      {/* Lines */}
      <path d={pvPath} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d={actPath} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d={loginPath} fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 2" />

      {/* Points */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={getX(i)} cy={getY(p.pageViews)} r="3.5" fill="#6366f1" className="hover:r-5 transition-all" />
          <circle cx={getX(i)} cy={getY(p.actions)} r="3" fill="#f59e0b" />
          <text
            x={getX(i)}
            y={height - 6}
            textAnchor="middle"
            className="text-[10px] fill-zinc-400 font-medium"
          >
            {p.date.length > 10 ? p.date.slice(11, 16) : p.date.slice(5)}
          </text>
        </g>
      ))}
    </svg>
  );
}
