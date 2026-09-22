import { apiRequest } from './api.js';

export async function fetchTeam() {
  return apiRequest('/team');
}

export async function addKarigar(payload) {
  return apiRequest('/team', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateKarigar(userId, changes) {
  return apiRequest(`/team/${encodeURIComponent(userId)}`, { method: 'PUT', body: JSON.stringify(changes) });
}

export async function deactivateKarigar(userId) {
  return apiRequest(`/team/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}
