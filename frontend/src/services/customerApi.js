import { apiRequest } from './api.js';
export function getCustomerWhatsAppMessage(orderId, type = 'status') {
  return apiRequest(`/customer/${encodeURIComponent(orderId)}/whatsapp-message?message_type=${encodeURIComponent(type)}`);
}
export function getReadyMessage(orderId) { return getCustomerWhatsAppMessage(orderId, 'ready'); }
