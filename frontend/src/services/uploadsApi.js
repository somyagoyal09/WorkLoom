import { apiRequest } from './api.js';

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api').replace(/\/api\/?$/, '');

export async function uploadDesignImage(file) {
  const formData = new FormData();
  formData.append('file', file);
  const result = await apiRequest('/uploads/design', { method: 'POST', body: formData });
  return { ...result, url: `${API_ORIGIN}${result.url}` };
}
