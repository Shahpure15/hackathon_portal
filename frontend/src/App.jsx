import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';

import Login from './pages/Login';
import AcceptInvite from './pages/AcceptInvite';
import EventConcluded from './pages/EventConcluded';
import PortalPaused from './pages/PortalPaused';
import NoAccess from './pages/NoAccess';

const ADMIN_ROUTE_PATH = '/admin';

// Helper to auto-retry dynamic module imports if a deployment updated JS chunk hashes
const lazyWithRetry = (componentImport) =>
  lazy(async () => {
    const isReloaded = sessionStorage.getItem('chunk_reloaded') === 'true';
    try {
      const component = await componentImport();
      sessionStorage.removeItem('chunk_reloaded');
      return component;
    } catch (error) {
      if (!isReloaded) {
        sessionStorage.setItem('chunk_reloaded', 'true');
        window.location.reload(true);
      }
      throw error;
    }
  });

const AdminDashboard = lazyWithRetry(() => import('./pages/AdminDashboard'));
const VolunteerDashboard = lazyWithRetry(() => import('./pages/VolunteerDashboard'));
const JudgeDashboard = lazyWithRetry(() => import('./pages/JudgeDashboard'));
const LeaderDashboard = lazyWithRetry(() => import('./pages/LeaderDashboard'));

const DashboardFallback = (
  <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-main)' }}>
    <span className="spinner" style={{ width: '40px', height: '40px' }}></span>
  </div>
);

// Guard for protected routes with dynamic RBAC & portal toggles
const ProtectedRoute = ({ children, portalKey, allowedRole }) => {
  const { user, access, features, can, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-main)' }}>
        <span className="spinner" style={{ width: '40px', height: '40px' }}></span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isAdmin = user.role === 'ADMIN' || access?.isAdmin;

  // 1. Admin Portal Gate
  if (portalKey === 'admin') {
    const staffAccessEnabled = features?.staff_admin_portal !== false;
    const isStaffOrAdminLanding = ['admin', 'staff'].includes(access?.landing);

    if (isAdmin || (staffAccessEnabled && isStaffOrAdminLanding && user.role !== 'VOLUNTEER')) {
      return children;
    }
    return <Navigate to="/" replace />;
  }

  // 2. Judge Portal Gate
  if (portalKey === 'judge') {
    if (features?.evaluation === false && !isAdmin) {
      return (
        <PortalPaused
          title="Judge Portal Paused"
          message="The evaluation portal is currently paused by the event administrator. Please check back shortly."
        />
      );
    }
    const isJudgeAccess = isAdmin || access?.landing === 'judge' || can('evaluation.score');
    if (isJudgeAccess) {
      return children;
    }
    return <Navigate to="/" replace />;
  }

  // 3. Volunteer / Staff Portal Gate
  if (portalKey === 'volunteer') {
    // If user is exclusively a judge, forward them directly to the judge portal
    if (access?.landing === 'judge' || (can('evaluation.score') && !can('team.view') && !can('attendance.mark') && !can('checkpoint.view'))) {
      return <Navigate to="/judge" replace />;
    }

    if (features?.volunteer_portal === false && !isAdmin) {
      return (
        <PortalPaused
          title="Volunteer Portal Paused"
          message="The volunteer check-in and evaluation portal is currently paused by the event administrator. Please check back shortly."
        />
      );
    }
    const isVolunteerAccess =
      isAdmin ||
      user.role === 'VOLUNTEER' ||
      can('attendance.mark') ||
      can('checkpoint.view') ||
      can('team.view') ||
      can('people.view') ||
      can('people.checkin');

    if (isVolunteerAccess) {
      return children;
    }
    return <Navigate to="/" replace />;
  }

  // 4. Leader Portal Gate
  if (portalKey === 'leader') {
    if (features?.leader_portal === false && !isAdmin) {
      return (
        <PortalPaused
          title="Participant Portal Paused"
          message="The participant portal is currently paused for event processing. Please contact your coordinator or check back shortly."
        />
      );
    }
    if (user.role === 'LEADER' || isAdmin || access?.landing === 'leader') {
      return children;
    }
    return <Navigate to="/" replace />;
  }

  // Legacy fallback if allowedRole provided
  if (allowedRole && user.role !== allowedRole) {
    return <Navigate to="/" replace />;
  }

  return children;
};

// Dynamic Home router based on user role, landing, and granular permissions
const Home = () => {
  const { user, access, features, can, loading, refreshAccess, logout } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-main)' }}>
        <span className="spinner" style={{ width: '40px', height: '40px' }}></span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (access?.loadFailed) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-main)', padding: '20px' }}>
        <div className="glass-card modal-scale-up" style={{ maxWidth: '420px', width: '100%', textAlign: 'center', padding: '32px' }}>
          <h3 style={{ marginBottom: '12px', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>We couldn't load your access</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.9rem' }}>
            There was a problem loading your event permissions.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button type="button" className="btn btn-primary" onClick={refreshAccess}>
              Retry
            </button>
            <button type="button" className="btn btn-secondary" onClick={logout}>
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Dynamic Routing based completely on user role, landing, and permissions
  if (user.role === 'ADMIN' || access?.isAdmin || access?.landing === 'admin') {
    return <Navigate to={ADMIN_ROUTE_PATH} replace />;
  }

  if (access?.landing === 'volunteer' || user.role === 'VOLUNTEER') {
    return <Navigate to="/volunteer" replace />;
  }

  if (access?.landing === 'staff') {
    if (features?.staff_admin_portal === false) {
      return <Navigate to="/volunteer" replace />;
    }
    return <Navigate to={ADMIN_ROUTE_PATH} replace />;
  }

  if (access?.landing === 'judge' || (can('evaluation.score') && !can('team.view') && !can('attendance.mark') && !can('checkpoint.view'))) {
    return <Navigate to="/judge" replace />;
  }

  if (access?.landing === 'leader' || user.role === 'LEADER') {
    return <Navigate to="/leader" replace />;
  }

  if (can('attendance.mark') || can('checkpoint.view') || can('team.view') || can('people.view') || can('people.checkin')) {
    return <Navigate to="/volunteer" replace />;
  }

  if (can('evaluation.score')) {
    return <Navigate to="/judge" replace />;
  }

  return <Navigate to="/no-access" replace />;
};

const App = () => {
  // Global Escape key handler to close topmost open popup/modal/drawer across all views
  React.useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        const openOverlays = document.querySelectorAll(
          '.modal-overlay-fade, .detail-drawer-overlay, [role="dialog"], .drawer-overlay'
        );
        if (openOverlays.length > 0) {
          const topOverlay = openOverlays[openOverlays.length - 1];
          const closeBtn = topOverlay.querySelector(
            'button[aria-label="Close modal"], button[aria-label="Close"], button[title="Close"], button.modal-close, button.drawer-close-btn'
          );
          if (closeBtn) {
            closeBtn.click();
          } else {
            topOverlay.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          }
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/accept-invite" element={<AcceptInvite />} />
                <Route path="/event-concluded" element={<EventConcluded />} />
                <Route path="/no-access" element={<NoAccess />} />
                
                {/* Dynamic Root Redirection */}
                <Route path="/" element={<Home />} />
                
                {/* Admin Routes */}
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute portalKey="admin">
                      <Suspense fallback={DashboardFallback}>
                        <AdminDashboard />
                      </Suspense>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/*"
                  element={
                    <ProtectedRoute portalKey="admin">
                      <Suspense fallback={DashboardFallback}>
                        <AdminDashboard />
                      </Suspense>
                    </ProtectedRoute>
                  }
                />

                {/* Protected Role Routes */}
                <Route
                  path="/judge"
                  element={
                    <ProtectedRoute portalKey="judge">
                      <Suspense fallback={DashboardFallback}>
                        <JudgeDashboard />
                      </Suspense>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/judge/*"
                  element={
                    <ProtectedRoute portalKey="judge">
                      <Suspense fallback={DashboardFallback}>
                        <JudgeDashboard />
                      </Suspense>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/volunteer"
                  element={
                    <ProtectedRoute portalKey="volunteer">
                      <Suspense fallback={DashboardFallback}>
                        <VolunteerDashboard />
                      </Suspense>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/volunteer/*"
                  element={
                    <ProtectedRoute portalKey="volunteer">
                      <Suspense fallback={DashboardFallback}>
                        <VolunteerDashboard />
                      </Suspense>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/leader"
                  element={
                    <ProtectedRoute portalKey="leader">
                      <Suspense fallback={DashboardFallback}>
                        <LeaderDashboard />
                      </Suspense>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/leader/*"
                  element={
                    <ProtectedRoute portalKey="leader">
                      <Suspense fallback={DashboardFallback}>
                        <LeaderDashboard />
                      </Suspense>
                    </ProtectedRoute>
                  }
                />

                {/* Catch-all route to Event Concluded page */}
                <Route path="*" element={<EventConcluded />} />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
