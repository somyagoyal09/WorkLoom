import { apiRequest } from './api.js';

export async function recommendKarigar(payload) {
  return apiRequest('/orders/recommend-karigar', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
