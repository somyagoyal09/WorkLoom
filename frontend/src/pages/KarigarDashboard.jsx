import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout.jsx';
import StatCard from '../components/StatCard.jsx';
import { PriorityTag } from '../components/StatusBadge.jsx';
import { ORDER_STAGES } from '../constants';
import { fetchOrders, toUiOrder, updateOrder } from '../services/ordersApi.js';
import { createIssue } from '../services/issuesApi.js';
import { apiRequest } from '../services/api.js';

const BOARD_COLUMNS = ['Design Approved', 'Casting', 'Filing', 'Setting', 'Polishing', 'Quality Check'];

export default function KarigarDashboard({ user, onLogout, ownerView = false }) {
  const [myOrders, setMyOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [issueOrder, setIssueOrder] = useState(null);
  const [issueText, setIssueText] = useState('');
  const [issueBusy, setIssueBusy] = useState(false);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchOrders();
      const mapped = data.map(toUiOrder);
      setMyOrders(mapped);
    } catch (err) {
      setError(err.message || 'Could not load your orders.');
    } finally {
      setLoading(false);
    }
  }, [ownerView, user?.name]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  async function advanceStage(orderId, currentStage) {
    const currentIndex = ORDER_STAGES.indexOf(currentStage);
    const nextIndex = Math.min(currentIndex + 1, ORDER_STAGES.length - 1);
    if (nextIndex === currentIndex) return;

    try {
      const updated = await updateOrder(orderId, { stage: ORDER_STAGES[nextIndex] });
      setMyOrders((prev) => prev.map((o) => o.id === orderId ? toUiOrder(updated) : o));
    } catch (err) {
      setError(err.message || 'Could not advance the order.');
    }
  }

  async function submitIssue() {
    const message = issueText.trim();
    if (!issueOrder || message.length < 3) return;
    setError('');
    setIssueBusy(true);
    try { await createIssue(issueOrder.id, message); setIssueOrder(null); setIssueText(''); }
    catch (err) { setError(err.message || 'Could not send the question.'); }
    finally { setIssueBusy(false); }
  }

  const completedToday = 0;
  const dueThisWeek = myOrders.filter((o) => {
    const due = new Date(o.dueDate);
    const now = new Date();
    const week = new Date(now);
    week.setDate(now.getDate() + 7);
    return due >= now && due <= week;
  }).length;

  return (
    <DashboardLayout role={ownerView ? 'owner' : 'karigar'} user={user} onLogout={onLogout} title={ownerView ? 'Karigar workboard' : 'My workboard'} subtitle={ownerView ? 'Owner view · monitor workshop assignments' : `Assignments for ${user?.workshop || 'your workshop'}`}>
      {ownerView && <div className="alert alert-light border d-flex align-items-center gap-2 mb-3"><i className="bi bi-eye" /><span>Owner view: you can monitor every Karigar's work here. Production updates are made from the assigned Karigar account.</span></div>}
      {error && <div className="alert alert-danger d-flex justify-content-between"><span>{error}</span><button className="btn btn-sm btn-outline-danger" onClick={loadOrders}>Retry</button></div>}

      <div className="row g-3 mb-4">
        <div className="col-6 col-lg-3"><StatCard label={ownerView ? "Assigned orders" : "Assigned to me"} value={myOrders.length} icon="bi-briefcase" tone="gold" /></div>
        <div className="col-6 col-lg-3"><StatCard label="Due this week" value={dueThisWeek} icon="bi-calendar-week" tone="copper" delta="Plan ahead" deltaTone="rose" /></div>
        <div className="col-6 col-lg-3"><StatCard label="Completed today" value={completedToday} icon="bi-check2-circle" tone="emerald" /></div>
        <div className="col-6 col-lg-3"><StatCard label="On-time rate" value="—" icon="bi-graph-up" tone="emerald" delta="Workshop metric" deltaTone="emerald" /></div>
      </div>

      <div className="wl-card p-3 p-md-4">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h2 className="wl-section-title h5 mb-0">Work in progress</h2>
          <button className="btn btn-sm btn-wl-outline border" onClick={loadOrders} disabled={loading}><i className="bi bi-arrow-clockwise" /> Refresh</button>
        </div>

        {loading ? <div className="text-secondary text-center py-5">Loading assignments…</div> : (
          <div className="row g-3 flex-nowrap overflow-auto pb-2">
            {BOARD_COLUMNS.map((stage) => {
              const items = myOrders.filter((o) => o.stage === stage);
              return (
                <div className="col-10 col-sm-6 col-lg-3" style={{ minWidth: 250 }} key={stage}>
                  <div className="wl-kanban-col h-100">
                    <div className="wl-kanban-col-title"><span>{stage}</span><span className="badge rounded-pill" style={{ background: 'var(--wl-line)', color: 'var(--wl-text-muted)' }}>{items.length}</span></div>
                    {items.map((o) => (
                      <div className="wl-task-card" key={o.id}>
                        <div className="d-flex justify-content-between align-items-start"><span className="wl-order-id" style={{ fontSize: '0.92rem' }}>{o.id}</span><PriorityTag priority={o.priority} /></div>
                        <div className="fw-semibold small mt-1">{o.item}</div>
                        <div className="text-secondary" style={{ fontSize: '0.76rem' }}>Customer: {o.customer}</div>
                        <div className="text-secondary" style={{ fontSize: '0.76rem' }}>{o.metal}</div>
                        <div className="text-secondary" style={{ fontSize: '0.76rem' }}>Due {formatDate(o.dueDate)}</div>
                        {o.designImageUrl && <img src={o.designImageUrl} alt="Design reference" className="rounded border mt-2" style={{ width: '100%', height: 110, objectFit: 'cover' }} />}
                        {!o.designImageUrl && (o.design_reference_urls || o.designReferenceUrls || o.designReferenceUrl) && <div className="mt-2">{(o.design_reference_urls || o.designReferenceUrls || [o.designReferenceUrl]).filter(Boolean).map((url, idx) => <PinterestPreview key={url} url={url} index={idx} />)}</div>}
                        <div className="d-flex gap-2 mt-2">
                          <Link to={`${ownerView ? '/owner/tracking' : '/karigar/tracking'}/${o.id}`} className="btn btn-sm btn-wl-outline border flex-fill">Details</Link>
                          {!ownerView && <button type="button" className="btn btn-sm btn-wl-outline border" onClick={() => { setError(''); setIssueOrder(o); }} title="Ask owner about this order"><i className="bi bi-chat-left-text" /></button>}
                          {!ownerView && <button type="button" className="btn btn-sm btn-wl-gold flex-fill" onClick={() => advanceStage(o.id, o.stage)} disabled={o.stage === 'Quality Check'}>Advance</button>}
                        </div>
                      </div>
                    ))}
                    {items.length === 0 && <div className="text-secondary text-center py-3" style={{ fontSize: '0.78rem' }}>Nothing here</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {issueOrder && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ background: 'rgba(0,0,0,.35)', zIndex: 1000 }} onClick={() => !issueBusy && setIssueOrder(null)}>
          <div className="wl-card p-4" style={{ width: 'min(520px, calc(100% - 2rem))' }} onClick={(e) => e.stopPropagation()}>
            <h2 className="wl-section-title h5 mb-1">Ask the owner</h2>
            <div className="text-secondary small mb-3">{issueOrder.id} · {issueOrder.item}</div>
            <textarea className="form-control" rows="4" placeholder="What do you need clarified? (minimum 3 characters)" value={issueText} onChange={(e) => { setIssueText(e.target.value); setError(''); }} />
            <div className="d-flex justify-content-end gap-2 mt-3"><button className="btn btn-wl-outline border" onClick={() => setIssueOrder(null)} disabled={issueBusy}>Cancel</button><button className="btn btn-wl-gold" onClick={submitIssue} disabled={issueBusy || issueText.trim().length < 3}>{issueBusy ? 'Sending…' : 'Send question'}</button></div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function PinterestPreview({ url, index }) {
  const [imageUrl, setImageUrl] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    apiRequest(`/voice/pinterest-preview?url=${encodeURIComponent(url)}`)
      .then((data) => { if (alive) setImageUrl(data.image_url || ''); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [url]);

  if (failed || !imageUrl) return null;
  return <img src={imageUrl} alt={`Pinterest design reference ${index + 1}`} className="rounded border mt-2" style={{ width: '100%', height: 110, objectFit: 'cover' }} />;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
