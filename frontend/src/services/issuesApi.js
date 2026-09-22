import { apiRequest } from './api.js';

export async function fetchIssues() { return apiRequest('/issues'); }
export async function createIssue(orderId, message) { return apiRequest('/issues', { method: 'POST', body: JSON.stringify({ order_id: orderId, message }) }); }
export async function respondToIssue(issueId, response) { return apiRequest(`/issues/${encodeURIComponent(issueId)}/respond`, { method: 'PATCH', body: JSON.stringify({ response }) }); }
