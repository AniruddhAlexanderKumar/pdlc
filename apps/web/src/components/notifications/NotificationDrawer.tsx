import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  category: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab?: (tab: string) => void;
  onNotificationsChanged?: () => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
  onNotificationsChanged,
}) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const data = await api.getNotifications();
      setNotifications(data || []);
      if (onNotificationsChanged) onNotificationsChanged();
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      if (onNotificationsChanged) onNotificationsChanged();
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const unreadList = notifications.filter((n) => !n.isRead);
      await Promise.all(unreadList.map((n) => api.markNotificationRead(n.id)));
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      if (onNotificationsChanged) onNotificationsChanged();
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleItemClick = (n: NotificationItem) => {
    if (!n.isRead) {
      handleMarkAsRead(n.id);
    }
    if (n.link && onNavigateTab) {
      // Map potential link paths e.g. /reqs, /change, /verify to tabs
      const cleanTab = n.link.replace('/', '').toLowerCase();
      onNavigateTab(cleanTab);
      onClose();
    }
  };

  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const filteredList = filter === 'unread'
    ? notifications.filter((n) => !n.isRead)
    : notifications;

  const getCategoryBadge = (cat: string) => {
    switch (cat.toUpperCase()) {
      case 'CHANGE':
      case 'CCB':
        return 'bg-purple-900/50 text-purple-300 border-purple-700/50';
      case 'VERIFICATION':
      case 'TEST':
        return 'bg-cyan-900/50 text-cyan-300 border-cyan-700/50';
      case 'APPROVAL':
      case 'GATE':
        return 'bg-amber-900/50 text-amber-300 border-amber-700/50';
      case 'QUALITY':
      case 'NONCONFORMANCE':
        return 'bg-red-900/50 text-red-300 border-red-700/50';
      case 'SECURITY':
      case 'AUTH':
        return 'bg-rose-900/50 text-rose-300 border-rose-700/50';
      default:
        return 'bg-surface-800 text-surface-300 border-surface-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end">
      {/* Backdrop overlay dismiss */}
      <div className="flex-1" onClick={onClose} />

      {/* Drawer Container */}
      <div className="w-full max-w-md bg-[#0a0a0a] border-l border-surface-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-surface-800 bg-[#0d0d0d] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-brand animate-pulse rounded-full" />
            <h2 className="font-mono font-bold text-white text-xs uppercase tracking-widest">
              MISSION TELEMETRY NOTIFICATIONS
            </h2>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 bg-brand/20 border border-brand/50 text-brand text-[9px] font-mono font-bold rounded">
                {unreadCount} NEW
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-surface-500 hover:text-white font-mono text-sm px-2 py-1"
          >
            ✕
          </button>
        </div>

        {/* Filter & Action Toolbar */}
        <div className="px-4 py-2.5 border-b border-surface-800 bg-[#121212] flex items-center justify-between text-[10px] font-mono">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-2 py-1 rounded transition-colors ${
                filter === 'all'
                  ? 'bg-brand/20 text-brand font-bold border border-brand/40'
                  : 'text-surface-400 hover:text-white'
              }`}
            >
              ALL ({notifications.length})
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-2 py-1 rounded transition-colors ${
                filter === 'unread'
                  ? 'bg-brand/20 text-brand font-bold border border-brand/40'
                  : 'text-surface-400 hover:text-white'
              }`}
            >
              UNREAD ({unreadCount})
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-surface-400 hover:text-brand underline uppercase tracking-wider text-[9px]"
            >
              Mark all read
            </button>
          )}
        </div>

        {/* Notification Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <div className="text-center py-8 text-surface-500 font-mono text-xs">
              Synchronizing event queue from PostgreSQL...
            </div>
          )}

          {!loading && filteredList.length === 0 && (
            <div className="text-center py-16 px-4">
              <div className="w-12 h-12 border border-surface-700 bg-surface-900 mx-auto mb-3 flex items-center justify-center text-surface-500 font-mono text-lg">
                ✓
              </div>
              <p className="font-mono text-xs text-surface-300 font-bold uppercase tracking-wider">
                Telemetry Log Nominal
              </p>
              <p className="text-[11px] text-surface-500 mt-1 max-w-xs mx-auto">
                No unread engineering notifications, change order alerts, or verification gate requests.
              </p>
            </div>
          )}

          {!loading &&
            filteredList.map((n) => (
              <div
                key={n.id}
                onClick={() => handleItemClick(n)}
                className={`p-3 rounded border transition-all cursor-pointer relative ${
                  n.isRead
                    ? 'bg-surface-950/60 border-surface-850 hover:border-surface-700 opacity-75'
                    : 'bg-[#141414] border-brand/40 hover:border-brand shadow-sm shadow-brand/5'
                }`}
              >
                {!n.isRead && (
                  <span className="absolute top-3 right-3 w-2 h-2 bg-brand rounded-full ring-2 ring-brand/30 animate-pulse" />
                )}

                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider font-bold rounded border ${getCategoryBadge(
                      n.category
                    )}`}
                  >
                    {n.category}
                  </span>
                  <span className="text-[9px] font-mono text-surface-500">
                    {new Date(n.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    • {new Date(n.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </span>
                </div>

                <h3 className="font-mono font-bold text-xs text-white mb-1 leading-snug">
                  {n.title}
                </h3>
                <p className="text-[11px] text-surface-300 leading-relaxed font-sans mb-2">
                  {n.message}
                </p>

                <div className="flex items-center justify-between pt-2 border-t border-surface-800/80 text-[9px] font-mono">
                  {n.link ? (
                    <span className="text-brand flex items-center gap-1 font-bold">
                      Open Record →
                    </span>
                  ) : (
                    <span className="text-surface-500">System Record</span>
                  )}

                  {!n.isRead && (
                    <button
                      onClick={(e) => handleMarkAsRead(n.id, e)}
                      className="text-surface-400 hover:text-white underline"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-surface-800 bg-[#0d0d0d] text-[9px] font-mono text-surface-500 flex items-center justify-between">
          <span>AES-256 Audit Synchronized</span>
          <span>PostgreSQL 17 Events</span>
        </div>
      </div>
    </div>
  );
};
