export default function StatCard({ label, value, icon, tone = 'gold', delta, deltaTone = 'emerald' }) {
  return (
    <div className="wl-stat-card h-100">
      <div className="d-flex align-items-start justify-content-between">
        <div className="wl-stat-label">{label}</div>
        <span className={`wl-stat-icon wl-badge-${tone}`}>
          <i className={`bi ${icon}`} />
        </span>
      </div>
      <div className="wl-stat-value mt-2">{value}</div>
      {delta && (
        <div className={`wl-stat-delta mt-1 wl-priority-${deltaTone === 'emerald' ? 'low' : 'high'}`} style={deltaTone === 'emerald' ? { color: 'var(--wl-emerald)' } : undefined}>
          {delta}
        </div>
      )}
    </div>
  );
}
