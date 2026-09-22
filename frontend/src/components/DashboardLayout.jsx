import { useState } from 'react';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

export default function DashboardLayout({ role, user, onLogout, title, subtitle, topbarChildren, children }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="wl-shell">
      <Sidebar role={role} user={user} open={menuOpen} onClose={() => setMenuOpen(false)} />
      {menuOpen && (
        <div
          className="d-lg-none position-fixed top-0 start-0 w-100 h-100"
          style={{ background: 'rgba(0,0,0,0.35)', zIndex: 30 }}
          onClick={() => setMenuOpen(false)}
        />
      )}
      <div className="wl-main">
        <Topbar
          title={title}
          subtitle={subtitle}
          user={user}
          role={role}
          onLogout={onLogout}
          onMenuClick={() => setMenuOpen(true)}
        >
          {topbarChildren}
        </Topbar>
        <div className="wl-content">{children}</div>
      </div>
    </div>
  );
}
