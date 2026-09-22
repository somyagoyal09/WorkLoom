import { useEffect, useRef, useState } from 'react';
import NotificationBell from './NotificationBell.jsx';

export default function Topbar({ title, subtitle, user, role, onLogout, onMenuClick, children }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    function handleOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) setProfileOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  function handleLogout() {
    setProfileOpen(false);
    onLogout();
  }

  return (
    <header className="wl-topbar">
      <div className="d-flex align-items-center gap-3">
        <button
          type="button"
          className="btn btn-sm btn-wl-outline border d-lg-none"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <i className="bi bi-list" />
        </button>
        <div>
          <div className="wl-topbar-title">{title}</div>
          {subtitle && <div className="wl-topbar-sub">{subtitle}</div>}
        </div>
      </div>

      <div className="d-flex align-items-center gap-3">
        {children}
        <NotificationBell role={role} userName={user.name} />
        <div className="position-relative" ref={profileRef}>
          <button
            type="button"
            className="btn btn-link p-0 border-0 d-flex align-items-center gap-2 text-decoration-none"
            onClick={() => setProfileOpen((open) => !open)}
            aria-expanded={profileOpen}
            aria-haspopup="menu"
          >
            <div className="wl-avatar">{user.initials}</div>
            <div className="d-none d-md-block text-start">
              <div className="fw-semibold small text-dark lh-sm">{user.name}</div>
              <div className="text-secondary" style={{ fontSize: '0.74rem' }}>{user.role}</div>
            </div>
            <i className={`bi ${profileOpen ? 'bi-chevron-up' : 'bi-chevron-down'} text-secondary small d-none d-md-inline`} />
          </button>
          {profileOpen && (
            <div className="wl-profile-menu position-absolute end-0 mt-2 shadow-sm" role="menu">
              <div className="px-3 py-2 border-bottom">
                <div className="fw-semibold small">{user.name}</div>
                <div className="text-secondary" style={{ fontSize: '0.74rem' }}>{user.workshop}</div>
              </div>
              <button className="wl-profile-logout" type="button" onClick={handleLogout}>
                <i className="bi bi-box-arrow-right me-2" />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
