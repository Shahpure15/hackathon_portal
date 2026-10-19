import React from 'react';
import { ShieldAlert, LogOut } from 'lucide-react';
import AmbientCursorGlow from '../components/AmbientCursorGlow';
import { useAuth } from '../contexts/AuthContext';

export default function NoAccess() {
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
        backgroundColor: 'var(--bg-main)',
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
            background: 'rgba(239, 68, 68, 0.12)',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px auto',
          }}
        >
          <ShieldAlert size={32} />
        </div>

        <h1
          style={{
            fontSize: '1.6rem',
            fontWeight: 800,
            marginBottom: '12px',
            color: 'var(--text-main)',
          }}
        >
          No access assigned
        </h1>
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.95rem',
            lineHeight: '1.6',
            marginBottom: '28px',
          }}
        >
          Your account is active but has no role for this event yet. Please contact the organizers.
        </p>

        {user && (
          <p
            style={{
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              marginBottom: '20px',
            }}
          >
            Signed in as <strong>{user.username}</strong>
          </p>
        )}

        <button
          type="button"
          onClick={logout}
          className="btn btn-secondary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '10px 24px',
            margin: '0 auto',
          }}
        >
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
