import { useEffect, useRef, useState } from 'react';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from '../services/notificationsApi.js';

export default function NotificationBell({ role, userName }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  async function load() {
    try {
      setLoading(true);
      const data = await fetchNotifications(role, userName);
      setNotifications(data);
    } catch {
      // The notification UI should not block the rest of the dashboard.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
  }, [role, userName]);

  useEffect(() => {
    function handleOutside(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  async function handleRead(notification) {
    if (notification.is_read) return;
    try {
      await markNotificationRead(notification.notification_id);
      setNotifications((prev) => prev.map((n) => n.notification_id === notification.notification_id ? { ...n, is_read: true } : n));
    } catch {
      // Keep the notification visible if marking it read fails.
    }
  }

  async function handleReadAll() {
    try {
      await markAllNotificationsRead(role, userName);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      // Ignore a read-state failure; the next refresh will retry.
    }
  }

  return (
    <div className="dropdown position-relative" ref={ref}>
      <button
        type="button"
        className="btn btn-wl-outline border position-relative d-flex align-items-center justify-content-center"
        style={{ width: 38, height: 38 }}
        onClick={() => setOpen((value) => !value)}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
      >
        <i className="bi bi-bell" />
        {unreadCount > 0 && (
          <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style={{ fontSize: '0.62rem' }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="dropdown-menu dropdown-menu-end show shadow-sm p-0" style={{ width: 350, maxWidth: 'calc(100vw - 24px)', top: 'calc(100% + 8px)', right: 0 }}>
          <div className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
            <div className="fw-semibold">Notifications</div>
            {unreadCount > 0 && <button className="btn btn-link btn-sm p-0 text-decoration-none" onClick={handleReadAll}>Mark all read</button>}
          </div>

          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {loading && notifications.length === 0 && <div className="text-secondary small text-center py-4">Loading notifications…</div>}
            {!loading && notifications.length === 0 && <div className="text-secondary small text-center py-4 px-3">No notifications yet.</div>}
            {notifications.map((notification) => (
              <button
                key={notification.notification_id}
                type="button"
                className="w-100 text-start border-0 bg-transparent px-3 py-3"
                style={{ borderBottom: '1px solid var(--wl-line)', background: notification.is_read ? 'transparent' : 'rgba(217,185,104,0.08)' }}
                onClick={() => handleRead(notification)}
              >
                <div className="d-flex gap-2">
                  <span className={`rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 ${notification.type === 'completion' ? 'bg-success-subtle text-success' : 'bg-warning-subtle text-warning-emphasis'}`} style={{ width: 32, height: 32 }}>
                    <i className={`bi ${notification.type === 'completion' ? 'bi-check2-circle' : 'bi-briefcase'}`} />
                  </span>
                  <div className="min-w-0">
                    <div className="d-flex justify-content-between gap-2">
                      <span className="fw-semibold small">{notification.title}</span>
                      {!notification.is_read && <span className="rounded-circle bg-danger flex-shrink-0" style={{ width: 7, height: 7, marginTop: 5 }} />}
                    </div>
                    <div className="text-secondary" style={{ fontSize: '0.78rem' }}>{notification.message}</div>
                    <div className="text-secondary mt-1" style={{ fontSize: '0.68rem' }}>{formatRelative(notification.created_at)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatRelative(value) {
  if (!value) return '';
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
