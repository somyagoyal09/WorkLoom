import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout.jsx';
import { StageBadge, PriorityTag } from '../components/StatusBadge.jsx';
import { ORDER_STAGES } from '../constants';
import { fetchOrders, fetchOrder, toUiOrder, updateOrder } from '../services/ordersApi.js';
import { getCustomerWhatsAppMessage } from '../services/customerApi.js';
import { API_BASE_URL } from '../services/api.js';

export default function OrderTracking({ user: sessionUser, onLogout, homePath, karigarView }) {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [activeOrder, setActiveOrder] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await fetchOrders();
      const uiOrders = data.map(toUiOrder);
      setOrders(uiOrders);
      if (orderId) {
        const selected = uiOrders.find((o) => o.id === orderId);
        setActiveOrder(selected || null);
      } else {
        setActiveOrder(uiOrders[0] || null);
      }
    } catch (err) {
      setError(err.message || 'Could not load order tracking.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [orderId, karigarView]);

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => o.id.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q) || o.item.toLowerCase().includes(q));
  }, [search, orders]);

  const user = sessionUser;
  const role = karigarView ? 'karigar' : 'owner';

  async function selectOrder(id) {
    try {
      const fresh = await fetchOrder(id);
      setActiveOrder(toUiOrder(fresh));
      navigate(`${homePath}/tracking/${id}`);
    } catch (err) {
      setError(err.message || 'Could not load this order.');
    }
  }

  async function advance() {
    if (!activeOrder) return;
    const index = ORDER_STAGES.indexOf(activeOrder.stage);
    if (index < 0 || index >= ORDER_STAGES.length - 1) return;
    try {
      const updated = await updateOrder(activeOrder.id, { stage: ORDER_STAGES[index + 1] });
      setActiveOrder(toUiOrder(updated));
      setOrders((prev) => prev.map((o) => o.id === activeOrder.id ? toUiOrder(updated) : o));
    } catch (err) {
      setError(err.message || 'Could not update the stage.');
    }
  }

  return (
    <DashboardLayout role={role} user={user} onLogout={onLogout} title="Order tracking" subtitle="Follow any order from booking to dispatch">
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="row g-3">
        <div className="col-lg-4 col-xl-3">
          <div className="wl-card p-3">
            <input type="text" className="wl-search w-100 mb-3" placeholder="Search orders…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div style={{ maxHeight: 560, overflowY: 'auto' }}>
              {loading ? <div className="text-secondary text-center py-4">Loading…</div> : filteredList.map((o) => (
                <button key={o.id} type="button" onClick={() => selectOrder(o.id)} className="btn w-100 text-start p-2 mb-2 border-0" style={{ background: activeOrder?.id === o.id ? 'var(--wl-gold-dim)' : 'transparent', borderRadius: 7 }}>
                  <div className="d-flex justify-content-between"><span className="wl-order-id" style={{ fontSize: '0.85rem' }}>{o.id}</span><PriorityTag priority={o.priority} /></div>
                  <div className="small fw-semibold text-truncate">{o.customer}</div>
                  <div className="text-secondary text-truncate" style={{ fontSize: '0.76rem' }}>{o.item}</div>
                </button>
              ))}
              {!loading && filteredList.length === 0 && <div className="text-secondary text-center py-4 small">No orders found.</div>}
            </div>
          </div>
        </div>

        <div className="col-lg-8 col-xl-9">
          {!activeOrder ? (
            <div className="wl-card p-5 text-center text-secondary">Select an order to see its progress.</div>
          ) : (
            <>
              <div className="wl-card p-3 p-md-4 mb-3">
                <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                  <div>
                    <div className="d-flex align-items-center gap-2"><h2 className="font-display h4 mb-0">{activeOrder.id}</h2><StageBadge stage={activeOrder.stage} /></div>
                    <div className="text-secondary small mt-1">{activeOrder.item} for {activeOrder.customer} · Created {formatDate(activeOrder.createdDate)}</div>
                  </div>
                  <div className="text-end"><div className="text-secondary small">Promised delivery</div><div className="fw-semibold">{formatDate(activeOrder.dueDate)}</div></div>
                </div>

                <div className="wl-stepper mt-4">
                  {ORDER_STAGES.map((stage, i) => {
                    const state = i < activeOrder.stageIndex ? 'done' : i === activeOrder.stageIndex ? 'current' : '';
                    return <div className={`wl-step ${state}`} key={stage}><span className="wl-step-line" /><span className="wl-step-dot">{i < activeOrder.stageIndex ? <i className="bi bi-check-lg" /> : i + 1}</span><span className="wl-step-label">{stage}</span></div>;
                  })}
                </div>

                {karigarView && activeOrder.stage !== 'Ready for Dispatch' && (
                  <div className="d-flex flex-wrap gap-2 mt-3">
                    <button className="btn btn-wl-outline border" onClick={async () => {
                      if (!activeOrder) return;
                      const index = ORDER_STAGES.indexOf(activeOrder.stage);
                      if (index <= 0) return;
                      try {
                        const updated = await updateOrder(activeOrder.id, { stage: ORDER_STAGES[index - 1] });
                        setActiveOrder(toUiOrder(updated));
                        setOrders((prev) => prev.map((o) => o.id === activeOrder.id ? toUiOrder(updated) : o));
                      } catch (err) {
                        setError(err.message || 'Could not move the order back.');
                      }
                    }} disabled={ORDER_STAGES.indexOf(activeOrder.stage) <= 0}>
                      <i className="bi bi-arrow-left me-1" /> Move back
                    </button>
                    <button className="btn btn-wl-gold" onClick={advance}>Advance to next stage</button>
                  </div>
                )}
                {!karigarView && activeOrder.phone && (
                  <button className="btn btn-wl-gold mt-3 ms-2" onClick={async () => {
                    try {
                      const result = await getCustomerWhatsAppMessage(activeOrder.id, activeOrder.stage === 'Ready for Dispatch' ? 'ready' : 'status');
                      if (!result.whatsapp_url) throw new Error('Customer phone number is missing.');
                      window.open(result.whatsapp_url, '_blank', 'noopener,noreferrer');
                    } catch (err) { setError(err.message || 'Could not open WhatsApp.'); }
                  }}><i className="bi bi-whatsapp me-1" /> {activeOrder.stage === 'Ready for Dispatch' ? 'Send ready update' : 'Send status update'}</button>
                )}
              </div>

              <div className="row g-3">
                <div className="col-md-5">
                  <div className="wl-card p-3 p-md-4 mb-3">
                    <h3 className="wl-section-title h6 mb-3">Order details</h3>
                    <DetailRow label="Customer" value={activeOrder.customer} />
                    {!karigarView && <DetailRow label="Phone" value={activeOrder.phone || '—'} />}
                    <DetailRow label="Metal" value={activeOrder.metal} />
                    <DetailRow label="Weight" value={activeOrder.weight} />
                    <DetailRow label="Stones" value={activeOrder.stones || '—'} />
                    <DetailRow label="Karigar" value={activeOrder.karigar} />
                    <DetailRow label="Estimated value" value={activeOrder.value ? `₹${Number(activeOrder.value).toLocaleString('en-IN')}` : '—'} />
                    <DetailRow label="Advance" value={activeOrder.advance ? `₹${Number(activeOrder.advance).toLocaleString('en-IN')}` : '—'} />
                  </div>
                  {activeOrder.notes && <div className="wl-card p-3 p-md-4"><h3 className="wl-section-title h6 mb-2">Notes</h3><p className="mb-0 text-secondary small">{activeOrder.notes}</p></div>}
                </div>

                <div className="col-md-7">
                  {(activeOrder.designImageUrl || activeOrder.designReferenceUrl || (activeOrder.design_reference_urls && activeOrder.design_reference_urls.length)) && (
                    <div className="wl-card p-3 p-md-4 mb-3">
                      <h3 className="wl-section-title h6 mb-3">Reference design</h3>
                      {activeOrder.designImageUrl ? (
                        <img
                          src={normalizeReferenceImageUrl(activeOrder.designImageUrl)}
                          alt="Jewellery design reference"
                          className="img-fluid rounded border"
                          style={{ width: '100%', maxHeight: 420, objectFit: 'contain', background: 'var(--wl-surface)' }}
                        />
                      ) : null}
                      {!activeOrder.designImageUrl && (activeOrder.design_reference_urls?.length || activeOrder.designReferenceUrl) ? (
                        <div className="mt-0">
                          <PinterestOrderPreview urls={activeOrder.design_reference_urls?.length ? activeOrder.design_reference_urls : [activeOrder.designReferenceUrl]} />
                        </div>
                      ) : null}
                      <div className="small text-secondary mt-2">Shared with the assigned karigar as the production reference.</div>
                    </div>
                  )}
                  <div className="wl-card p-3 p-md-4">
                    <h3 className="wl-section-title h6 mb-3">Activity history</h3>
                    {activeOrder.history?.length ? <div>{[...activeOrder.history].reverse().map((entry, index) => <div key={`${entry.at}-${index}`} className="d-flex gap-3 py-2" style={{ borderBottom: index === activeOrder.history.length - 1 ? 0 : '1px solid var(--wl-line)' }}><div className="wl-avatar flex-shrink-0" style={{ width: 30, height: 30, fontSize: '0.65rem' }}><i className="bi bi-clock-history" /></div><div><div className="fw-semibold small">{entry.event}</div><div className="text-secondary" style={{ fontSize: '0.75rem' }}>{entry.by} · {formatDateTime(entry.at)}</div>{entry.note && <div className="text-secondary small mt-1">{entry.note}</div>}</div></div>)}</div> : <p className="text-secondary small mb-0">No activity recorded yet.</p>}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

async function downloadCustomerImage(url, filename) {
  const resolved = resolveAssetUrl(url);
  const response = await fetch(resolved);
  if (!response.ok) throw new Error('Could not prepare the reference image.');
  const blob = await response.blob();
  if (navigator.clipboard?.write && window.ClipboardItem) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
      return;
    } catch (_) {
      // Fall back to a download when clipboard image sharing is unavailable.
    }
  }
  const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `${filename}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function resolveAssetUrl(url) {
  if (!url) return '';
  const value = String(url).trim();
  if (/^https?:\/\//i.test(value)) return value;
  const apiBase = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '');
  const origin = new URL(apiBase).origin;
  return value.startsWith('/') ? `${origin}${value}` : `${origin}/${value}`;
}

function PinterestOrderPreview({ urls }) {
  return <div className="d-flex flex-column gap-3">{urls.filter(Boolean).map((url, index) => <PinterestOrderImage key={`${url}-${index}`} url={url} index={index} />)}</div>;
}

function PinterestOrderImage({ url, index }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const src = `${API_BASE_URL}/voice/pinterest-preview-image?url=${encodeURIComponent(url)}`;
  return (
    <div className="rounded border overflow-hidden" style={{ background: 'var(--wl-surface)', minHeight: 140 }}>
      {!loaded && !failed && <div className="text-secondary small p-3">Loading design reference…</div>}
      {!failed && <img src={src} alt={`Pinterest design reference ${index + 1}`} className="img-fluid" style={{ width: '100%', maxHeight: 520, objectFit: 'contain', display: loaded ? 'block' : 'none' }} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />}
      {failed && <div className="text-secondary small p-3">Pinterest image preview is unavailable.</div>}
    </div>
  );
}

function DetailRow({ label, value }) {
  return <div className="d-flex justify-content-between py-1" style={{ fontSize: '0.85rem', borderBottom: '1px solid var(--wl-line)' }}><span className="text-secondary">{label}</span><span className="fw-semibold text-end">{value}</span></div>;
}

function formatDateTime(d) { if (!d) return '—'; return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function normalizeReferenceImageUrl(url) {
  if (!url) return '';
  let value = String(url).trim();
  if (!value) return '';
  // Older saved AI references may contain /voice/... without the /api prefix.
  // Also repair absolute URLs that point at the backend without /api.
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      if (parsed.pathname.startsWith('/voice/')) {
        parsed.pathname = `/api${parsed.pathname}`;
        return parsed.toString();
      }
    } catch (_) {
      return value;
    }
    return value;
  }
  if (value.startsWith('/voice/')) return `${API_BASE_URL}${value}`;
  if (value.startsWith('/api/')) return value;
  if (value.startsWith('/uploads/')) return value;
  if (value.startsWith('/')) return value;
  return value;
}
