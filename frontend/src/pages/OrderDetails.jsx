import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout.jsx';
import { StageBadge, PriorityTag } from '../components/StatusBadge.jsx';
import { fetchOrder, deleteOrder, toUiOrder } from '../services/ordersApi.js';
import { getCustomerWhatsAppMessage } from '../services/customerApi.js';
import { API_BASE_URL } from '../services/api.js';

export default function OrderDetails({ user, onLogout }) {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [whatsappBusy, setWhatsappBusy] = useState(false);

  useEffect(() => {
    fetchOrder(orderId).then((x) => setOrder(toUiOrder(x))).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [orderId]);

  async function sendCustomerUpdate() {
    if (!order) return;
    setWhatsappBusy(true);
    setError('');
    try {
      const type = order.stage === 'Ready for Dispatch' ? 'ready' : 'status';
      const result = await getCustomerWhatsAppMessage(order.id, type);
      if (!result.whatsapp_url) throw new Error('Customer phone number is missing.');
      window.open(result.whatsapp_url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e.message || 'Could not open WhatsApp.');
    } finally {
      setWhatsappBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${orderId}? This cannot be undone.`)) return;
    try { await deleteOrder(orderId); navigate('/owner'); }
    catch (e) { setError(e.message || 'Could not delete order.'); }
  }

  return <DashboardLayout role="owner" user={user} onLogout={onLogout} title="Order details" subtitle={order ? `${order.id} · ${order.item}` : 'View order information'}>
    {error && <div className="alert alert-danger">{error}</div>}
    {loading ? <div className="wl-card p-5 text-center text-secondary">Loading order…</div> : !order ? <div className="wl-card p-5 text-center text-secondary">Order not found.</div> : <>
      <div className="d-flex flex-wrap justify-content-between gap-2 mb-3">
        <Link to="/owner" className="btn btn-sm btn-outline-secondary"><i className="bi bi-arrow-left me-1"/> Back to Orders</Link>
        <div className="d-flex gap-2 flex-wrap"><Link to={`/owner/orders/${order.id}/edit`} className="btn btn-wl-gold btn-sm"><i className="bi bi-pencil me-1"/> Edit Order</Link><button className="btn btn-sm btn-success" onClick={sendCustomerUpdate} disabled={whatsappBusy}><i className="bi bi-whatsapp me-1"/>{whatsappBusy ? "Opening…" : order.stage === "Ready for Dispatch" ? "WhatsApp ready update" : "WhatsApp status update"}</button><button className="btn btn-sm btn-outline-danger" onClick={remove}><i className="bi bi-trash me-1"/> Delete</button></div>
      </div>
      <div className="wl-card p-3 p-md-4 mb-3">
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-3"><div><div className="d-flex gap-2 align-items-center"><h2 className="font-display h4 mb-0">{order.id}</h2><StageBadge stage={order.stage}/><PriorityTag priority={order.priority}/></div><div className="text-secondary small mt-1">Created {fmt(order.createdDate)}</div></div><div className="text-end"><div className="text-secondary small">Due date</div><strong>{fmt(order.dueDate)}</strong></div></div>
      </div>
      <div className="row g-3">
        <Section title="Overview">
          <Row l="Customer" v={order.customer}/><Row l="Phone" v={order.phone || '—'}/><Row l="Item" v={order.item}/><Row l="Material" v={order.metal}/><Row l="Weight" v={order.weight}/><Row l="Stones" v={order.stones || '—'}/><Row l="Karigar" v={order.karigar}/><Row l="Priority" v={order.priority}/>
        </Section>
        <Section title="Payment"><Row l="Estimate" v={money(order.value)}/><Row l="Advance" v={money(order.advance)}/><Row l="Remaining" v={money(Math.max(0,(Number(order.value)||0)-(Number(order.advance)||0)))}/></Section>
        <Section title="Customer Request"><p className="small text-secondary mb-0">{order.notes || 'No additional notes recorded.'}</p></Section>
        <Section title="Design"><DesignPreview order={order} /></Section>
        <div className="col-12"><div className="wl-card p-3 p-md-4"><h3 className="wl-section-title h6 mb-3">History</h3>{order.history?.length ? [...order.history].reverse().map((h,i)=><div key={i} className="d-flex gap-3 py-2 border-bottom"><i className="bi bi-clock-history text-secondary"/><div><div className="small fw-semibold">{h.event}</div><div className="small text-secondary">{h.by} · {fmtTime(h.at)}</div>{h.note&&<div className="small text-secondary">{h.note}</div>}</div></div>) : <span className="small text-secondary">No history recorded.</span>}</div></div>
      </div>
    </>}
  </DashboardLayout>;
}
function Section({title,children}){return <div className="col-md-6"><div className="wl-card p-3 p-md-4 h-100"><h3 className="wl-section-title h6 mb-3">{title}</h3>{children}</div></div>}
function Row({l,v}){return <div className="d-flex justify-content-between py-2 border-bottom small"><span className="text-secondary">{l}</span><strong>{v}</strong></div>}
function money(v){return v?`₹${Number(v).toLocaleString('en-IN')}`:'—'}
function fmt(d){return d?new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—'}
function fmtTime(d){return d?new Date(d).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—'}

function DesignPreview({ order }) {
  const refs = (order.design_reference_urls || order.designReferenceUrls || [order.design_reference_url || order.designReferenceUrl]).filter(Boolean);
  if (order.designImageUrl) return <img src={normalizeReferenceImageUrl(order.designImageUrl)} alt="Design reference" className="img-fluid rounded border" style={{ maxHeight: 360, objectFit: 'contain', width: '100%' }} />;
  if (!refs.length) return <p className="small text-secondary mb-0">No design reference uploaded.</p>;
  return <div><p className="small text-secondary mb-3">Selected design references for this order.</p><div className="row g-3">{refs.map((url, idx) => <PinterestPreview key={`${url}-${idx}`} url={url} index={idx} />)}</div></div>;
}

function PinterestPreview({ url, index }) {
  const src = `${API_BASE_URL}/voice/pinterest-preview-image?url=${encodeURIComponent(url)}`;
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="col-12"><div className="border rounded p-3"><div className="small text-secondary mb-2">Pinterest image preview is unavailable.</div><a className="btn btn-sm btn-wl-outline border" href={url} target="_blank" rel="noreferrer"><i className="bi bi-pinterest me-1" /> Open reference</a></div></div>;
  return <div className="col-md-6"><img src={src} alt={`Pinterest design reference ${index + 1}`} className="img-fluid rounded border" style={{ width: '100%', height: 260, objectFit: 'contain', background: 'var(--wl-surface)' }} onError={() => setFailed(true)} /><a className="btn btn-sm btn-wl-outline border mt-2" href={url} target="_blank" rel="noreferrer"><i className="bi bi-pinterest me-1" /> Open reference</a></div>;
}

function normalizeReferenceImageUrl(url) {
  if (!url) return url;
  if (url.startsWith('/api/')) return url;
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`;
  return url;
}
