import React, { createContext, useContext, useState, useEffect } from 'react';
import api, { setAccessToken } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const login = async (username, password) => {
    try {
      const response = await api.post('/auth/login', { username, password });
      const { access_token, role, eventId, teamId, username: responseUsername } = response.data;
      
      setAccessToken(access_token);
      setUser({ username: responseUsername, role, eventId, teamId });
      localStorage.setItem('has_session', 'true');
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
    } catch (error) {
      // Refresh token invalid or expired, clear session
      localStorage.removeItem('has_session');
      localStorage.removeItem('adminActiveTab');
      localStorage.removeItem('leaderActiveTab');
      setAccessToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();

    // Listen to global logout event triggered by Axios interceptor
    const handleGlobalLogout = () => {
      localStorage.removeItem('has_session');
      setUser(null);
    };

    window.addEventListener('auth-logout', handleGlobalLogout);
    return () => {
      window.removeEventListener('auth-logout', handleGlobalLogout);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
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
