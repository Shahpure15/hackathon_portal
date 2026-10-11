import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { setAccessToken } from '../services/api';

const AuthContext = createContext(null);

const SEEDED_VOLUNTEER_PERMS = [
  'team.view',
  'team.checkin',
  'people.view',
  'ps.view',
  'ps.select',
  'checkpoint.view',
  'checkpoint.log',
  'qr.scan',
  'announcement.view',
];

const buildFallbackAccess = (role) => {
  const normalizedRole = (role || '').toUpperCase();
  const isAdmin = normalizedRole === 'ADMIN';
  const isVolunteer = normalizedRole === 'VOLUNTEER';
  const perms = isVolunteer ? new Set(SEEDED_VOLUNTEER_PERMS) : new Set();

  return {
    permissions: perms,
    isAdmin,
    scope: isVolunteer ? 'all' : null,
    features: {},
    roleNames: role ? [role] : [],
    moduleGates: {},
  };
};

const fetchAccess = async (role) => {
  try {
    const response = await api.get('/auth/me');
    const data = response.data;
    return {
      permissions: new Set(data.permissions || []),
      isAdmin: Boolean(data.isAdmin),
      scope: data.scope || null,
      features: data.features || {},
      roleNames: data.roleNames || [],
      moduleGates: data.moduleGates || {},
    };
  } catch (err) {
    console.warn('Failed to fetch /auth/me, falling back to role-based access:', err);
    return buildFallbackAccess(role);
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(true);

  const login = async (username, password) => {
    try {
      const response = await api.post('/auth/login', { username, password });
      const { access_token, role, eventId, teamId, username: responseUsername } = response.data;
      
      setAccessToken(access_token);
      setUser({ username: responseUsername, role, eventId, teamId });
      localStorage.setItem('has_session', 'true');

      const userAccess = await fetchAccess(role);
      setAccess(userAccess);

      return { success: true };
    } catch (error) {
      if (error.response?.status === 410) {
        return { success: false, status: 410, error: error.response?.data?.detail || 'This event has concluded. The portal is now read-only.' };
      }
      if (error.response?.status === 429) {
        return { success: false, error: 'Too many attempts. Please try again in a few minutes.' };
      }
      const message = error.response?.data?.detail || 'Invalid username or password';
      return { success: false, error: message };
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      // silent
    } finally {
      localStorage.removeItem('has_session');
      localStorage.removeItem('adminActiveTab');
      localStorage.removeItem('leaderActiveTab');
      setAccessToken(null);
      setUser(null);
      setAccess(null);
    }
  };

  // Attempt silent refresh on startup ONLY if user previously logged in
  const checkAuth = async () => {
    if (localStorage.getItem('has_session') !== 'true') {
      setLoading(false);
      return;
    }

    try {
      const response = await api.post('/auth/refresh');
      const { access_token, role, eventId, teamId, username } = response.data;
      setAccessToken(access_token);
      setUser({ username, role, eventId, teamId });
      localStorage.setItem('has_session', 'true');

      const userAccess = await fetchAccess(role);
      setAccess(userAccess);
    } catch (error) {
      // Refresh token invalid or expired, clear session
      localStorage.removeItem('has_session');
      localStorage.removeItem('adminActiveTab');
      localStorage.removeItem('leaderActiveTab');
      setAccessToken(null);
      setUser(null);
      setAccess(null);
    } finally {
      setLoading(false);
    }
  };

  const can = useCallback((key) => {
    if (!access) return false;
    if (access.isAdmin) return true;
    return Boolean(access.permissions?.has(key));
  }, [access]);

  const canAny = useCallback((keys) => {
    if (!access) return false;
    if (access.isAdmin) return true;
    return (keys || []).some((k) => Boolean(access.permissions?.has(k)));
  }, [access]);

  const features = access?.features || {};

  useEffect(() => {
    checkAuth();

    // Listen to global logout event triggered by Axios interceptor
    const handleGlobalLogout = () => {
      localStorage.removeItem('has_session');
      setUser(null);
      setAccess(null);
    };

    window.addEventListener('auth-logout', handleGlobalLogout);
    return () => {
      window.removeEventListener('auth-logout', handleGlobalLogout);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, access, can, canAny, features, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
