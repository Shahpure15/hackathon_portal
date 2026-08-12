import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';

// Pages
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import VolunteerDashboard from './pages/VolunteerDashboard';
import LeaderDashboard from './pages/LeaderDashboard';

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
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/volunteer/*"
                element={
                  <ProtectedRoute allowedRole="VOLUNTEER">
                    <VolunteerDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/leader/*"
                element={
                  <ProtectedRoute allowedRole="LEADER">
                    <LeaderDashboard />
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
