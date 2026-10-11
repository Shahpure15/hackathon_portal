import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User, CheckCircle2, AlertCircle, Sun, Moon } from 'lucide-react';
import api from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { useTheme } from '../contexts/ThemeContext';
import IconButton from '../components/IconButton';
import AmbientCursorGlow from '../components/AmbientCursorGlow';
import logoMitIndia from '../assets/logo_mitindia.jpg';
import logoDarkMode from '../assets/logo_darkmode.png';

export default function AcceptInvite() {
  const [token, setToken] = useState('');
  const [inviteInfo, setInviteInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { addToast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    // Add no-referrer meta
    let meta = document.querySelector('meta[name="referrer"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'referrer';
      meta.content = 'no-referrer';
      document.head.appendChild(meta);
    } else {
      meta.content = 'no-referrer';
    }

    const params = new URLSearchParams(window.location.search);
    const rawToken = params.get('token') || '';
    setToken(rawToken);

    // Strip token from URL immediately for security
    if (window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (!rawToken) {
      setError('This invitation link is invalid or has expired.');
      setLoading(false);
      return;
    }

    api.get(`/auth/invite-info?token=${encodeURIComponent(rawToken)}`)
      .then((res) => {
        setInviteInfo(res.data);
      })
      .catch((err) => {
        setError(err.response?.data?.detail || 'This invitation link is invalid or has expired.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/auth/accept-invite', {
        token,
        password,
      });
      addToast('Invitation accepted successfully! You can now log in.', 'success');
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.detail || 'This invitation link is invalid or has expired.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <AmbientCursorGlow />
      <div className="glass-card" style={{ width: '100%', maxWidth: '440px', padding: '40px', position: 'relative' }}>
        <div style={{ position: 'absolute', top: '16px', right: '16px' }}>
          <IconButton
            size="34px"
            onClick={toggleTheme}
            ariaLabel="Toggle theme"
            icon={theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          />
        </div>

        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <img
            src={theme === 'dark' ? logoDarkMode : logoMitIndia}
            alt="Logo"
            style={{ maxHeight: '52px', maxWidth: '180px', marginBottom: '16px' }}
          />
          <h2 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 6px 0' }}>
            {inviteInfo ? `Welcome, ${inviteInfo.recipientName}` : 'Staff Invitation'}
          </h2>
          {inviteInfo && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
              Set your password for <strong>{inviteInfo.username}</strong>
            </p>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-secondary)' }}>
            Verifying invitation link...
          </div>
        ) : error && !inviteInfo ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ display: 'inline-flex', padding: '12px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', marginBottom: '16px' }}>
              <AlertCircle size={32} />
            </div>
            <p style={{ color: '#ef4444', fontSize: '14px', marginBottom: '20px' }}>{error}</p>
            <button
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => navigate('/login')}
            >
              Return to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '13px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                New Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input-field"
                  style={{ width: '100%', paddingLeft: '38px', paddingRight: '40px' }}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Confirm Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input-field"
                  style={{ width: '100%', paddingLeft: '38px' }}
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
              disabled={submitting}
            >
              {submitting ? 'Setting Password...' : 'Accept Invitation & Activate'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
