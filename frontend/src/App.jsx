import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import RegisterOwner from './pages/RegisterOwner.jsx';
import Contact from './pages/Contact.jsx';
import OwnerDashboard from './pages/OwnerDashboard.jsx';
import CreateOrder from './pages/CreateOrder.jsx';
import KarigarDashboard from './pages/KarigarDashboard.jsx';
import OrderTracking from './pages/OrderTracking.jsx';
import OrderDetails from './pages/OrderDetails.jsx';
import EditOrder from './pages/EditOrder.jsx';
import WorkshopTeam from './pages/WorkshopTeam.jsx';
import { clearSession, getSession, validateSession } from './services/authApi.js';

export default function App() {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let active = true;
    const saved = getSession();

    // Do not trust localStorage blindly. Validate the token with the backend.
    if (!saved?.access_token) {
      setSession(null);
      setBooting(false);
      return;
    }

    const bootTimeout = setTimeout(() => {
      if (!active) return;
      clearSession();
      setSession(null);
      setBooting(false);
    }, 6000);

    validateSession(saved)
      .then((validSession) => {
        if (!active) return;
        if (validSession) {
          setSession(validSession);
        } else {
          clearSession();
          setSession(null);
        }
      })
      .catch(() => {
        if (!active) return;
        clearSession();
        setSession(null);
      })
      .finally(() => {
        clearTimeout(bootTimeout);
        if (active) setBooting(false);
      });

    return () => {
      active = false;
      clearTimeout(bootTimeout);
    };
  }, []);

  function handleLogin(result) {
    setSession(result);
  }

  function handleLogout() {
    clearSession();
    setSession(null);
  }

  if (booting) {
    return (
      <div className="wl-boot">
        <div className="wl-boot-mark"><img src="/logo-mark.png" alt="Workloom" /></div>
        <div className="font-display h4 mb-1">Workloom</div>
        <div className="small text-secondary">Preparing your workspace…</div>
      </div>
    );
  }

  return (
    <HashRouter>
      <Routes>
        {/* Public homepage must ALWAYS be the landing page. */}
        <Route path="/" element={<Landing />} />
        <Route path="/contact" element={<Contact />} />

        {/* Authentication pages stay directly accessible. A saved session must
            not hide the sign-in or workspace-setup screens. Successful auth
            navigates to the appropriate workspace from the auth page itself. */}
        <Route path="/login" element={<Login onLogin={handleLogin} />} />
        <Route path="/register-owner" element={<RegisterOwner onLogin={handleLogin} />} />

        <Route
          path="/owner"
          element={
            <Guard session={session} role="owner">
              <OwnerDashboard user={session?.user} onLogout={handleLogout} />
            </Guard>
          }
        />
        <Route
          path="/owner/create-order"
          element={
            <Guard session={session} role="owner">
              <CreateOrder user={session?.user} onLogout={handleLogout} />
            </Guard>
          }
        />
        <Route
          path="/owner/tracking/:orderId?"
          element={
            <Guard session={session} role="owner">
              <OrderTracking user={session?.user} onLogout={handleLogout} homePath="/owner" />
            </Guard>
          }
        />
        <Route
          path="/owner/orders/:orderId"
          element={
            <Guard session={session} role="owner">
              <OrderDetails user={session?.user} onLogout={handleLogout} />
            </Guard>
          }
        />
        <Route
          path="/owner/orders/:orderId/edit"
          element={
            <Guard session={session} role="owner">
              <EditOrder user={session?.user} onLogout={handleLogout} />
            </Guard>
          }
        />

        <Route
          path="/owner/karigar-workboard"
          element={
            <Guard session={session} role="owner">
              <KarigarDashboard user={session?.user} onLogout={handleLogout} ownerView />
            </Guard>
          }
        />
        <Route
          path="/owner/karigars"
          element={
            <Guard session={session} role="owner">
              <WorkshopTeam user={session?.user} onLogout={handleLogout} />
            </Guard>
          }
        />

        <Route
          path="/karigar"
          element={
            <Guard session={session} role="karigar">
              <KarigarDashboard user={session?.user} onLogout={handleLogout} />
            </Guard>
          }
        />
        <Route
          path="/karigar/tracking/:orderId?"
          element={
            <Guard session={session} role="karigar">
              <OrderTracking user={session?.user} onLogout={handleLogout} homePath="/karigar" karigarView />
            </Guard>
          }
        />

        {/* Unknown URLs return to the public landing page, not a dashboard. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

function Guard({ session, role, children }) {
  if (!session) return <Navigate to="/login" replace />;
  if (session.user?.role !== role) {
    return <Navigate to={session.user?.role === 'owner' ? '/owner' : '/karigar'} replace />;
  }
  return children;
}
