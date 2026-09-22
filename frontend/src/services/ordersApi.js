import { apiRequest } from './api.js';

export async function fetchOrders(filters = {}) {
  const params = new URLSearchParams();
  if (filters.stage && filters.stage !== 'All') params.set('stage', filters.stage);
  if (filters.priority && filters.priority !== 'All') params.set('priority', filters.priority);
  if (filters.karigar) params.set('karigar', filters.karigar);

  const query = params.toString();
  return apiRequest(`/orders${query ? `?${query}` : ''}`);
}

export async function fetchOrder(orderId) {
  return apiRequest(`/orders/${encodeURIComponent(orderId)}`);
}

export async function createOrder(order) {
  return apiRequest('/orders', {
    method: 'POST',
    body: JSON.stringify(order),
  });
}

export async function updateOrder(orderId, changes) {
  return apiRequest(`/orders/${encodeURIComponent(orderId)}`, {
    method: 'PUT',
    body: JSON.stringify(changes),
  });
}

export async function deleteOrder(orderId) {
  return apiRequest(`/orders/${encodeURIComponent(orderId)}`, {
    method: 'DELETE',
  });
}

// Adapter: backend field names -> the existing UI field names.
export function toUiOrder(order) {
  const stageIndex = [
    'Design Approved',
    'Casting',
    'Filing',
    'Setting',
    'Polishing',
    'Quality Check',
    'Ready for Dispatch',
  ].indexOf(order.stage);

  return {
    ...order,
    id: order.order_id,
    customer: order.customer_name,
    metal: order.material,
    karigarId: order.karigar_user_id ?? null,
    karigarUserId: order.karigar_user_id ?? null,
    stageIndex: stageIndex < 0 ? 0 : stageIndex,
    createdDate: order.created_at,
    dueDate: order.due_date,
    value: order.estimate_value ?? 0,
    estimateValue: order.estimate_value ?? 0,
    phone: order.phone ?? '',
    stones: order.stones ?? 'None',
    advance: order.advance ?? 0,
    notes: order.notes ?? '',
    designImageUrl: order.design_image_url ?? '',
    designReferenceUrl: order.design_reference_url ?? '',
  };
}
