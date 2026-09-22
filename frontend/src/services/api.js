export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '');

function formatApiDetail(detail) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const loc = Array.isArray(item.loc) ? item.loc.filter(Boolean).join(' → ') : '';
        const msg = item.msg || item.message;
        return loc && msg ? `${loc}: ${msg}` : msg || JSON.stringify(item);
      }
      return String(item);
    }).filter(Boolean);
    return messages.join('\n') || 'The request could not be completed.';
  }
  if (detail && typeof detail === 'object') return detail.message || detail.msg || JSON.stringify(detail);
  return 'The request could not be completed.';
}

export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

export async function apiRequest(path, options = {}) {
  let token = '';
  try {
    const session = JSON.parse(localStorage.getItem('workloom_auth_v2') || 'null');
    token = session?.access_token || '';
  } catch {
    token = '';
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      // Let the browser set multipart/form-data + boundary for FormData.
      // Setting application/json here breaks file uploads.
      ...(!(options.body instanceof FormData) && options.body
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const detail = typeof payload === 'object' && payload?.detail
      ? payload.detail
      : `Request failed with status ${response.status}`;
    throw new ApiError(formatApiDetail(detail), response.status, detail);
  }

  return payload;
}
