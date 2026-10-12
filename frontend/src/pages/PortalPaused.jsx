import React from 'react';
import { PauseCircle, LogOut } from 'lucide-react';
import AmbientCursorGlow from '../components/AmbientCursorGlow';
import { useAuth } from '../contexts/AuthContext';

export default function PortalPaused({
  title = 'Portal Temporarily Paused',
  message = 'This section has been temporarily paused by the event administrator. Please check back shortly.',
}) {
  const { logout, user } = useAuth();

  return (
    <div
      className="auth-wrapper"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <AmbientCursorGlow />
      <div
        className="glass-card modal-scale-up"
        style={{
          width: '100%',
          maxWidth: '520px',
          padding: '36px',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(234, 179, 8, 0.12)',
            color: '#eab308',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px auto',
          }}
        >
          <PauseCircle size={32} />
        </div>

        <h1
          style={{
            fontSize: '1.6rem',
            fontWeight: 800,
            marginBottom: '12px',
            color: 'var(--text-main)',
          }}
        >
          {title}
        </h1>
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.92rem',
            lineHeight: '1.6',
            marginBottom: '28px',
          }}
        >
          {message}
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={logout}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              fontSize: '0.9rem',
            }}
          >
            <LogOut size={16} /> Sign Out ({user?.username || 'User'})
          </button>
        </div>
      </div>
    </div>
  );
}
