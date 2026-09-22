import { NavLink } from 'react-router-dom';

const OWNER_LINKS = [
  { to: '/owner', icon: 'bi-grid-1x2', label: 'Dashboard', end: true },
  { to: '/owner/create-order', icon: 'bi-plus-circle', label: 'Create Order' },
  { to: '/owner/tracking', icon: 'bi-signpost-split', label: 'Order Tracking' },
  { to: '/owner/karigar-workboard', icon: 'bi-kanban', label: 'Karigar Workboard' },
  { to: '/owner/karigars', icon: 'bi-people', label: 'Manage Karigars' },
];

const KARIGAR_LINKS = [
  { to: '/karigar', icon: 'bi-hammer', label: 'My Workboard', end: true },
  { to: '/karigar/tracking', icon: 'bi-signpost-split', label: 'Order Tracking' },
];

export default function Sidebar({ role, user, open, onClose }) {
  const links = role === 'owner' ? OWNER_LINKS : KARIGAR_LINKS;

  return (
    <aside className={`wl-sidebar ${open ? 'wl-sidebar-open' : ''}`}>
      <div className="wl-sidebar-brand">
        <div className="wl-brand-mark">
          <img src="/logo-mark.png" alt="Workloom" className="wl-sidebar-logo-mark" />
          <span className="wl-brand-word">Workloom</span>
        </div>
        <div className="wl-brand-sub">Jewellery workshop management</div>
      </div>

      <nav className="wl-nav">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            onClick={onClose}
            className={({ isActive }) => `wl-nav-link ${isActive ? 'active' : ''}`}
          >
            <i className={`bi ${link.icon}`} />
            <span>{link.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="wl-sidebar-foot">
        <strong className="d-block text-white">{user?.workshop || 'Your workshop'}</strong>
        <span style={{ fontSize: '0.72rem' }}>Workloom workspace</span>
      </div>
    </aside>
  );
}
