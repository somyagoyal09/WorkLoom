import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout.jsx';
import StatCard from '../components/StatCard.jsx';
import { StageBadge, PriorityTag } from '../components/StatusBadge.jsx';
import { ORDER_STAGES } from '../constants';
import { fetchTeam } from '../services/teamApi.js';
import { fetchIssues, respondToIssue } from '../services/issuesApi.js';
import { fetchAnalytics } from '../services/analyticsApi.js';
import { getCustomerWhatsAppMessage } from '../services/customerApi.js';
import { deleteOrder, fetchOrders, toUiOrder } from '../services/ordersApi.js';

const STAGE_FILTERS = ['All', ...ORDER_STAGES];

export default function OwnerDashboard({ user, onLogout }) {
  const [orders, setOrders] = useState([]);
  const [stageFilter, setStageFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [messageBusy, setMessageBusy] = useState('');
  const [team, setTeam] = useState([]);
  const [issues, setIssues] = useState([]);
  const [issueResponse, setIssueResponse] = useState({});
  const [issueBusy, setIssueBusy] = useState('');

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchOrders();
      setOrders(data.map(toUiOrder));
    } catch (err) {
      setError(err.message || 'Could not load orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);
  useEffect(() => { fetchAnalytics().then(setAnalytics).catch(() => {}); fetchTeam().then(setTeam).catch(() => {}); fetchIssues().then(setIssues).catch(() => {}); }, [orders.length]);

  async function handleDelete(orderId) {
    if (!window.confirm(`Delete ${orderId}? This cannot be undone.`)) return;
    try {
      await deleteOrder(orderId);
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch (err) {
      setError(err.message || 'Could not delete the order.');
    }
  }

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const matchesStage = stageFilter === 'All' || o.stage === stageFilter;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        o.id.toLowerCase().includes(q) ||
        o.customer.toLowerCase().includes(q) ||
        o.item.toLowerCase().includes(q) ||
        o.karigar.toLowerCase().includes(q);
      return matchesStage && matchesSearch;
    });
  }, [orders, stageFilter, search]);

  const readyCount = orders.filter((o) => o.stage === 'Ready for Dispatch').length;
  const activeOrders = orders.filter((o) => o.stage !== 'Ready for Dispatch');
  const activeCount = activeOrders.length;
  const totalValue = activeOrders.reduce((sum, o) => sum + (Number(o.value) || 0), 0);
  const dueSoon = activeOrders.filter((o) => {
    const due = new Date(o.dueDate);
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const fiveDays = new Date(todayStart);
    fiveDays.setDate(todayStart.getDate() + 5);
    return !Number.isNaN(due.getTime()) && due >= todayStart && due <= fiveDays;
  }).length;

  async function shareReadyMessage(order) {
    setMessageBusy(order.id);
    setError('');
    try {
      const result = await getCustomerWhatsAppMessage(order.id, order.stage === 'Ready for Dispatch' ? 'ready' : 'status');
      if (!result.whatsapp_url) throw new Error('Customer phone number is missing.');
      window.open(result.whatsapp_url, '_blank', 'noopener,noreferrer');
    } catch (err) { setError(err.message || 'Could not open the WhatsApp message.'); }
    finally { setMessageBusy(''); }
  }

  async function handleIssueResponse(issue) {
    const response = (issueResponse[issue.issue_id] || '').trim();
    if (!response) return;
    setIssueBusy(issue.issue_id);
    try {
      const updated = await respondToIssue(issue.issue_id, response);
      setIssues((prev) => prev.map((item) => item.issue_id === issue.issue_id ? updated : item));
      setIssueResponse((prev) => ({ ...prev, [issue.issue_id]: '' }));
    } catch (err) { setError(err.message || 'Could not respond to the Karigar.'); }
    finally { setIssueBusy(''); }
  }

  return (
    <DashboardLayout
      role="owner"
      user={user}
      onLogout={onLogout}
      title="Workshop overview"
      subtitle="Live workshop order data"
      topbarChildren={
        <div className="d-flex align-items-center gap-2">
          <Link to="/owner/karigars" className="btn btn-wl-outline border btn-sm d-none d-md-inline-flex align-items-center gap-1">
            <i className="bi bi-people" /> Karigars
          </Link>
          <Link to="/owner/create-order" className="btn btn-wl-gold btn-sm d-inline-flex align-items-center gap-1">
            <i className="bi bi-plus-lg" /> New order
          </Link>
        </div>
      }
    >
      <div className="row g-3 mb-4">
        <div className="col-6 col-lg-3"><StatCard label="Active orders" value={activeCount} icon="bi-box-seam" tone="gold" /></div>
        <div className="col-6 col-lg-3"><StatCard label="Order book value" value={formatInr(totalValue)} icon="bi-currency-rupee" tone="emerald" /></div>
        <div className="col-6 col-lg-3"><StatCard label="Due within 5 days" value={dueSoon} icon="bi-clock-history" tone="copper" delta={dueSoon > 0 ? "Needs attention" : "All on track"} deltaTone={dueSoon > 0 ? "rose" : "emerald"} /></div>
        <div className="col-6 col-lg-3"><StatCard label="Ready for dispatch" value={readyCount} icon="bi-check2-circle" tone="emerald" delta="Awaiting pickup" deltaTone="emerald" /></div>
      </div>

      {error && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center">
          <span>{error}</span>
          <button className="btn btn-sm btn-outline-danger" onClick={loadOrders}>Retry</button>
        </div>
      )}

      <div className="wl-card p-3 p-md-4 mb-3">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3"><div><h2 className="wl-section-title h6 mb-1">Workshop analytics</h2><div className="small text-secondary">Calculated from live workshop orders</div></div><span className="badge rounded-pill" style={{ background: 'var(--wl-gold-dim)', color: 'var(--wl-ink)' }}>{analytics ? `${analytics.total_orders} total orders` : 'Loading…'}</span></div>
        <div className="row g-2">
          <Metric label="Active" value={analytics?.active_orders ?? activeCount} />
          <Metric label="Ready" value={analytics?.ready_orders ?? readyCount} />
          <Metric label="High priority" value={analytics?.high_priority ?? activeOrders.filter(o => o.priority === 'High').length} />
          <Metric label="Due soon" value={analytics?.due_soon ?? dueSoon} />
          <Metric label="Avg completion" value={analytics?.avg_completion_days != null ? `${analytics.avg_completion_days}d` : "—"} />
        </div>
      </div>

      <div className="row g-3">
        <div className="col-lg-8">
          <div className="wl-card p-3 p-md-4">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <h2 className="wl-section-title h5 mb-0">Order book</h2>
              <div className="d-flex flex-wrap gap-2">
                <input type="text" className="wl-search" placeholder="Search order, customer, karigar…" value={search} onChange={(e) => setSearch(e.target.value)} />
                <select className="form-select form-select-sm wl-search" style={{ minWidth: 170 }} value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
                  {STAGE_FILTERS.map((s) => <option key={s} value={s}>{s === 'All' ? 'All stages' : s}</option>)}
                </select>
                <button className="btn btn-sm btn-wl-outline border" onClick={loadOrders} disabled={loading} title="Refresh">
                  <i className="bi bi-arrow-clockwise" />
                </button>
              </div>
            </div>

            <div className="table-responsive">
              <table className="table wl-table mb-0">
                <thead><tr><th>Order</th><th>Customer</th><th>Item</th><th>Karigar</th><th>Stage</th><th>Priority</th><th>Due</th><th></th></tr></thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="text-center text-secondary py-4">Loading orders…</td></tr>
                  ) : filtered.map((o) => (
                    <tr key={o.id}>
                      <td><span className="wl-order-id">{o.id}</span></td>
                      <td>{o.customer}</td>
                      <td>{o.item}<div className="text-secondary" style={{ fontSize: '0.76rem' }}>{o.metal} · {o.weight}</div></td>
                      <td>{o.karigar}</td>
                      <td><StageBadge stage={o.stage} /></td>
                      <td><PriorityTag priority={o.priority} /></td>
                      <td>{formatDate(o.dueDate)}</td>
                      <td className="text-end">
                        <div className="d-flex gap-1 justify-content-end">
                          <Link to={`/owner/tracking/${o.id}`} className="btn btn-sm btn-wl-outline border">Track</Link>
                          <Link to={`/owner/orders/${o.id}/edit`} className="btn btn-sm btn-wl-outline border" title="Edit order"><i className="bi bi-pencil" /></Link>
                          <button className="btn btn-sm btn-wl-outline border" onClick={() => shareReadyMessage(o)} disabled={messageBusy === o.id} title={o.stage === 'Ready for Dispatch' ? 'Send ready update on WhatsApp' : 'Send current status on WhatsApp'}><i className="bi bi-whatsapp" /></button>
                          <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(o.id)} title="Delete order">
                            <i className="bi bi-trash3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loading && filtered.length === 0 && (
                    <tr><td colSpan={8} className="text-center text-secondary py-4">No orders found. Create your first order to see it here.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="wl-card p-3 p-md-4 mb-3">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <h2 className="wl-section-title h6 mb-0">Karigar requests</h2>
              {issues.filter((i) => i.status === 'open').length > 0 && <span className="badge rounded-pill bg-danger-subtle text-danger">{issues.filter((i) => i.status === 'open').length} awaiting response</span>}
            </div>
            {issues.length === 0 ? <div className="text-secondary small">No questions raised by Karigars.</div> : issues.slice(0, 4).map((issue) => (
              <div key={issue.issue_id} className="py-2" style={{ borderBottom: '1px solid var(--wl-line)' }}>
                <div className="d-flex justify-content-between gap-2"><div className="fw-semibold small">{issue.karigar_name}</div><span className={`badge rounded-pill ${issue.status === 'open' ? 'bg-warning-subtle text-dark' : 'bg-success-subtle text-success'}`}>{issue.status}</span></div>
                <div className="text-secondary" style={{ fontSize: '0.76rem' }}>{issue.order_id}</div>
                <div className="small mt-1">{issue.message}</div>
                {issue.status === 'open' && <div className="d-flex gap-2 mt-2"><input className="form-control form-control-sm" placeholder="Reply to Karigar…" value={issueResponse[issue.issue_id] || ''} onChange={(e) => setIssueResponse((prev) => ({ ...prev, [issue.issue_id]: e.target.value }))} /><button className="btn btn-sm btn-wl-gold" onClick={() => handleIssueResponse(issue)} disabled={issueBusy === issue.issue_id}>Reply</button></div>}
                {issue.response && <div className="small mt-2 text-success"><strong>Owner:</strong> {issue.response}</div>}
              </div>
            ))}
          </div>

          <div className="wl-card p-3 p-md-4">
            <h2 className="wl-section-title h6 mb-3">Stage breakdown</h2>
            {ORDER_STAGES.map((stage) => {
              const count = orders.filter((o) => o.stage === stage).length;
              const pct = orders.length ? Math.round((count / orders.length) * 100) : 0;
              return (
                <div key={stage} className="mb-2">
                  <div className="d-flex justify-content-between small mb-1"><span className="text-secondary">{stage}</span><span className="fw-semibold">{count}</span></div>
                  <div className="progress" style={{ height: 6 }}><div className="progress-bar" role="progressbar" style={{ width: `${pct}%`, backgroundColor: 'var(--wl-gold)' }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Metric({ label, value }) { return <div className="col-6 col-md-3"><div className="border rounded p-2 h-100"><div className="fw-semibold fs-5">{value}</div><div className="small text-secondary">{label}</div></div></div>; }

function formatInr(value) {
  const amount = Number(value) || 0;
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}


function resolveAssetUrl(url) {
  if (!url) return '';
  const value = String(url).trim();
  if (/^https?:\/\//i.test(value)) return value;
  const apiBase = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '');
  const origin = new URL(apiBase).origin;
  return value.startsWith('/') ? `${origin}${value}` : `${origin}/${value}`;
}
