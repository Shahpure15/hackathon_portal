import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';

// Pages
import Login from './pages/Login';

const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminPSOverview = lazy(() => import('./pages/AdminPSOverview'));
const VolunteerDashboard = lazy(() => import('./pages/VolunteerDashboard'));
const LeaderDashboard = lazy(() => import('./pages/LeaderDashboard'));


const DashboardFallback = (
  <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-main)' }}>
    <span className="spinner" style={{ width: '40px', height: '40px' }}></span>
  </div>
);

// Guard for protected routes
const ProtectedRoute = ({ children, allowedRole }) => {
  const { user, loading } = useAuth();

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

  if (allowedRole && user.role !== allowedRole) {
    return <Navigate to="/" replace />;
  }

  return children;
};

// Home router based on user role
const Home = () => {
  const { user, loading } = useAuth();

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
      return <Navigate to="/admin" replace />;
    case 'VOLUNTEER':
      return <Navigate to="/volunteer" replace />;
    case 'LEADER':
      return <Navigate to="/leader" replace />;
    default:
      return <Navigate to="/login" replace />;
  }
};

const App = () => {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              
              {/* Dynamic Root Redirection */}
              <Route path="/" element={<Home />} />
              
              {/* Protected Role Routes */}
              <Route
                path="/admin/*"
                element={
                  <ProtectedRoute allowedRole="ADMIN">
                    <Suspense fallback={DashboardFallback}>
                      <AdminDashboard />
                    </Suspense>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/volunteer/*"
                element={
                  <ProtectedRoute allowedRole="VOLUNTEER">
                    <Suspense fallback={DashboardFallback}>
                      <VolunteerDashboard />
                    </Suspense>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/leader/*"
                element={
                  <ProtectedRoute allowedRole="LEADER">
                    <Suspense fallback={DashboardFallback}>
                      <LeaderDashboard />
                    </Suspense>
                  </ProtectedRoute>
                }
              />

              {/* Catch-all redirection */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
};

export default App;
