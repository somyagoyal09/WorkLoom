import { apiRequest } from './api.js';
export function fetchAnalytics() { return apiRequest('/analytics/summary'); }
