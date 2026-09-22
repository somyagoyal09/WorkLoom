import { apiRequest } from './api.js';

export async function fetchNotifications(_role, _name, unreadOnly = false) {
  const params = new URLSearchParams();
  if (unreadOnly) params.set('unread_only', 'true');
  return apiRequest(`/notifications${params.toString() ? `?${params.toString()}` : ''}`);
}

export async function markNotificationRead(notificationId) {
  return apiRequest(`/notifications/${encodeURIComponent(notificationId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_read: true }),
  });
}

export async function markAllNotificationsRead(role, name) {
  return apiRequest('/notifications/read-all', {
    method: 'POST',
  });
}
