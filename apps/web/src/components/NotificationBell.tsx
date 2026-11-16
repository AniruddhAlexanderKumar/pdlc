import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Bell, CheckCheck, Settings2 } from 'lucide-react';
import type { Notification } from '@sv/shared';
import {
  useMarkNotificationsRead,
  useNotifications,
  useNotificationPreferences,
  useSaveNotificationPreferences
} from '../api/collaboration';
import { cx } from './ui';

const KIND_DOT: Record<Notification['kind'], string> = {
  activity_assigned: 'bg-blue-500',
  activity_reassigned: 'bg-blue-400',
  review_requested: 'bg-amber-500',
  review_approved: 'bg-emerald-500',
  review_changes_requested: 'bg-rose-500',
  blocker_resolved: 'bg-sky-500',
  stage_completed: 'bg-[#16598d]'
};

const PREF_LABELS: { key: 'assignments' | 'reviews' | 'blockers' | 'stages'; label: string; hint: string }[] = [
  { key: 'assignments', label: 'Assignments', hint: 'When work is assigned or reassigned to you.' },
  { key: 'reviews', label: 'Reviews', hint: 'When your work is submitted, approved or sent back.' },
  { key: 'blockers', label: 'Blockers', hint: 'When something blocking an activity gets resolved.' },
  { key: 'stages', label: 'Stage completion', hint: 'When a stage on your product is finished.' }
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Notifications bell.
 *
 * Deliberately quiet: a badge only when there is something unread, a short feed
 * rather than an inbox, and a link straight to the activity the notification is
 * about. Preferences live behind one small link so nobody has to configure
 * anything to use it.
 */
export function NotificationBell() {
  const { data } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const prefs = useNotificationPreferences();
  const savePrefs = useSaveNotificationPreferences();
  const [open, setOpen] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const unread = data?.unread ?? 0;
  const items = data?.notifications ?? [];

  const openNotification = (n: Notification) => {
    if (!n.readAt) markRead.mutate([n.id]);
    setOpen(false);
    if (n.productId) {
      navigate(n.activityKey ? `/products/${n.productId}/journey?activity=${encodeURIComponent(n.activityKey)}` : `/products/${n.productId}/journey`);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="animate-rise absolute right-0 top-full z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
            <p className="text-xs font-semibold">Notifications</p>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => markRead.mutate(undefined)}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <CheckCheck className="h-3 w-3" /> Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowPrefs((v) => !v)}
                aria-label="Notification preferences"
                aria-expanded={showPrefs}
                className={cx('rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800', showPrefs && 'bg-zinc-100 dark:bg-zinc-800')}
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {showPrefs && (
            <div className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
              <p className="mb-1.5 text-[11px] text-zinc-500">Choose what reaches you. Changes save immediately.</p>
              {PREF_LABELS.map((p) => (
                <label key={p.key} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 accent-[#16598d]"
                    checked={prefs.data ? prefs.data[p.key] : true}
                    disabled={!prefs.data || savePrefs.isPending}
                    onChange={(e) => savePrefs.mutate({ [p.key]: e.target.checked })}
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium">{p.label}</span>
                    <span className="block text-[10px] leading-4 text-zinc-500">{p.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className="border-b border-zinc-100 px-3 py-1.5 text-right dark:border-zinc-800">
            <Link
              to="/settings/notifications"
              onClick={() => setOpen(false)}
              className="text-[11px] font-medium text-zinc-500 hover:text-zinc-800 hover:underline dark:hover:text-zinc-200"
            >
              Notification settings
            </Link>
          </div>

          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-zinc-500">Nothing new. We only tell you when something needs you.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n)}
                    className={cx(
                      'flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60',
                      !n.readAt && 'bg-blue-500/[0.04]'
                    )}
                  >
                    <span className={cx('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', KIND_DOT[n.kind])} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className={cx('block truncate text-xs', n.readAt ? 'font-medium text-zinc-600 dark:text-zinc-300' : 'font-semibold')}>
                        {n.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-zinc-500">{n.body}</span>
                      <span className="mt-0.5 block text-[10px] text-zinc-400">{timeAgo(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
