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

const ADMIN_SUFFIX = import.meta.env.VITE_ADMIN_PATH_SUFFIX || 'k9v4m8q2x7p1w5r3y9z0b6c2';
const ADMIN_ROUTE_PATH = `/portal-admin-${ADMIN_SUFFIX}`;

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
const LeaderDashboard = lazyWithRetry(() => import('./pages/LeaderDashboard'));

const DashboardFallback = (
  <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-main)' }}>
    <span className="spinner" style={{ width: '40px', height: '40px' }}></span>
  </div>
);

// Guard for protected routes with dynamic RBAC & portal toggles
const ProtectedRoute = ({ children, portalKey, allowedRole }) => {
  const { user, access, features, loading } = useAuth();

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

  // 1. Admin Portal Gate
  if (portalKey === 'admin') {
    const isAdmin = user.role === 'ADMIN' || access?.isAdmin;
    const staffAccessEnabled = features?.staff_admin_portal !== false;
    const hasPermissions = access?.permissions && access.permissions.size > 0;

    if (isAdmin || (staffAccessEnabled && hasPermissions)) {
      return children;
    }
    return <Navigate to="/" replace />;
  }

  // 2. Volunteer / Staff Portal Gate
  if (portalKey === 'volunteer') {
    if (features?.volunteer_portal === false && user.role !== 'ADMIN' && !access?.isAdmin) {
      return (
        <PortalPaused
          title="Volunteer Portal Paused"
          message="The volunteer check-in and evaluation portal is currently paused by the event administrator. Please check back shortly."
        />
      );
    }
    if (user.role === 'ADMIN' || user.role === 'VOLUNTEER' || access?.isAdmin) {
      return children;
    }
    return <Navigate to="/" replace />;
  }

  // 3. Leader Portal Gate
  if (portalKey === 'leader') {
    if (features?.leader_portal === false && user.role !== 'ADMIN' && !access?.isAdmin) {
      return (
        <PortalPaused
          title="Participant Portal Paused"
          message="The participant portal is currently paused for event processing. Please contact your coordinator or check back shortly."
        />
      );
    }
    if (user.role === 'LEADER' || user.role === 'ADMIN' || access?.isAdmin) {
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

// Home router based on user role and granular permissions
const Home = () => {
  const { user, access, features, loading } = useAuth();

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

  switch (user.role) {
    case 'ADMIN':
      return <Navigate to={ADMIN_ROUTE_PATH} replace />;
    case 'VOLUNTEER': {
      // Check if staff has admin-level permissions and staff_admin_portal is enabled
      const hasAdminTabPerms = access?.permissions && [
        'team.view', 'team.manage', 'staff.view', 'staff.manage',
        'round.view', 'round.manage', 'evaluation.view_all',
        'evaluation.release', 'email.send', 'config.view', 'role.manage'
      ].some((p) => access.permissions.has(p));

      if (features?.staff_admin_portal !== false && hasAdminTabPerms) {
        return <Navigate to={ADMIN_ROUTE_PATH} replace />;
      }
      return <Navigate to="/volunteer" replace />;
    }
    case 'LEADER':
      return <Navigate to="/leader" replace />;
    default:
      return <Navigate to="/login" replace />;
  }
};

const App = () => {
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
                
                {/* Dynamic Root Redirection */}
                <Route path="/" element={<Home />} />
                
                {/* Obfuscated Admin Route */}
                <Route
                  path={`${ADMIN_ROUTE_PATH}/*`}
                  element={
                    <ProtectedRoute portalKey="admin">
                      <Suspense fallback={DashboardFallback}>
                        <AdminDashboard />
                      </Suspense>
                    </ProtectedRoute>
                  }
                />

                {/* Old Admin Path Redirection to Event Concluded */}
                <Route path="/admin/*" element={<Navigate to="/event-concluded" replace />} />
                <Route path="/admin" element={<Navigate to="/event-concluded" replace />} />

                {/* Protected Role Routes */}
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
