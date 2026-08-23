import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, CheckCircle, ArrowRight, ShieldAlert } from 'lucide-react';
import AmbientCursorGlow from '../components/AmbientCursorGlow';
import logoMitIndia from '../assets/logo_mitindia.jpg';
import logoDarkMode from '../assets/logo_darkmode.png';
import { useTheme } from '../contexts/ThemeContext';

const EventConcluded = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();

  return (
    <div className="auth-wrapper" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <AmbientCursorGlow />
      <div className="glass-card modal-scale-up" style={{ width: '100%', maxWidth: '580px', padding: '40px', textAlign: 'center', position: 'relative' }}>
        
        {/* Header Logo */}
        <div style={{ marginBottom: '24px' }}>
          <img 
            src={theme === 'dark' ? logoDarkMode : logoMitIndia} 
            alt="MIT India Hackathon Logo" 
            style={{ height: '65px', objectFit: 'contain', marginBottom: '16px', borderRadius: '4px' }}
          />
        </div>

        {/* Status Badge */}
        <div style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '8px', 
          padding: '6px 16px', 
          borderRadius: '999px', 
          background: 'rgba(99, 102, 241, 0.12)', 
          border: '1px solid rgba(99, 102, 241, 0.3)', 
          color: 'var(--primary)', 
          fontSize: '0.85rem', 
          fontWeight: 700, 
          marginBottom: '20px' 
        }}>
          <CheckCircle size={16} /> Pune Qualifier 2026 — Concluded
        </div>

        {/* Title & Message */}
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '12px', color: 'var(--text-main)' }}>
          Thank You For Participating!
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '28px' }}>
          The <strong>Pune Qualifier phase</strong> of the MIT India Hackathon 2026 has successfully concluded. 
          Evaluation rounds, problem statement selections, and check-ins for this event are now frozen and read-only.
        </p>

        {/* Informational Cards */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', 
          gap: '14px', 
          textAlign: 'left', 
          marginBottom: '32px' 
        }}>
          <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)', borderRadius: '12px' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-main)' }}>
              <Award size={16} color="var(--primary)" /> Certificate Access
            </h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
              Participating leaders can log in to view and download their official participation certificates.
            </p>
          </div>

          <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)', borderRadius: '12px' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-main)' }}>
              <ShieldAlert size={16} color="#eab308" /> Multi-Phase Portal
            </h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
              Future qualifiers (e.g. Delhi Phase) will open on their scheduled dates under their dedicated event portals.
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button 
            onClick={() => navigate('/login')} 
            className="btn btn-primary touch-target" 
            style={{ padding: '12px 24px', fontSize: '0.9rem', fontWeight: 600, borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            Go to Portal Login <ArrowRight size={16} />
          </button>
        </div>

      </div>
    </div>
  );
};

export default EventConcluded;
