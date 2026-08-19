import { useState } from 'react';
import { 
  QrCode, Search, Users, Layers, FileText, CheckCircle, Edit2, Key, RefreshCw, AlertCircle
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../contexts/ToastContext';
import QRScanner from './QRScanner';

export default function AdminQRScannerView({ onOpenEditModal, onResetPassword }) {
  const { addToast } = useToast();
  const [teamIdInput, setTeamIdInput] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannedTeam, setScannedTeam] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTeamDetails = async (teamId) => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/admin/teams/${teamId}`);
      setScannedTeam(res.data);
      addToast(`Loaded roster for ${res.data.name}`, 'success');
    } catch (err) {
      console.error('Failed to load team by ID:', err);
      const msg = err.response?.data?.detail || 'Team not found or invalid event ID';
      setError(msg);
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleQrScan = (teamId) => {
    setScannerOpen(false);
    fetchTeamDetails(teamId);
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (teamIdInput.trim()) {
      fetchTeamDetails(teamIdInput.trim());
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Action & Search Banner */}
      <div className="glass-card" style={{ padding: '24px', background: 'rgba(185, 111, 56, 0.05)', border: '1px solid rgba(185, 111, 56, 0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <QrCode style={{ color: 'var(--primary)' }} size={26} />
              QR Team Lookup & Roster Inspector
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '4px', fontSize: '0.9rem' }}>
              Scan a team leader's QR code or enter Team ID to load full team roster, venue assignment, and attendance history.
            </p>
          </div>

          <button
            className="btn btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 24px',
              fontSize: '1rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, var(--primary) 0%, #e07a38 100%)',
              boxShadow: '0 4px 16px rgba(185, 111, 56, 0.4)',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer'
            }}
            onClick={() => setScannerOpen(true)}
          >
            <QrCode size={22} />
            Launch Camera Scanner
          </button>
        </div>

        {/* Manual Lookup Form */}
        <form onSubmit={handleManualSubmit} style={{ marginTop: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', maxWidth: '600px' }}>
          <div style={{ position: 'relative', flex: '1 1 240px' }}>
            <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Enter Team ID or Registration Code..."
              className="form-input"
              style={{ paddingLeft: '48px', width: '100%' }}
              value={teamIdInput}
              onChange={(e) => setTeamIdInput(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-secondary" disabled={loading} style={{ padding: '10px 20px', whiteSpace: 'nowrap' }}>
            {loading ? <span className="spinner"></span> : 'Lookup Team'}
          </button>
        </form>
      </div>

      {error && (
        <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Scanned Team Roster & Details Section */}
      {scannedTeam ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }} className="fade-in-up">
          {/* Header Card */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: '1.8rem', fontWeight: 800 }}>{scannedTeam.name}</h2>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', background: 'rgba(6, 182, 212, 0.15)', color: 'var(--accent-blue)', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
                    Code: {scannedTeam.registrationId}
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', background: 'rgba(185, 111, 56, 0.15)', color: 'var(--primary)', border: '1px solid rgba(185, 111, 56, 0.3)' }}>
                    {scannedTeam.category || 'ENGINEERING'}
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                    {scannedTeam.status}
                  </span>
                </div>
                <p style={{ color: 'var(--text-secondary)', marginTop: '6px', fontSize: '0.95rem' }}>
                  College: <strong style={{ color: 'var(--text-primary)' }}>{scannedTeam.collegeName}</strong>
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  className="btn btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 14px', whiteSpace: 'nowrap' }}
                  onClick={() => onResetPassword && onResetPassword(scannedTeam.id, scannedTeam.name)}
                >
                  <Key size={14} /> Reset Password
                </button>
                <button
                  className="btn btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 14px', whiteSpace: 'nowrap' }}
                  onClick={() => onOpenEditModal && onOpenEditModal(scannedTeam)}
                >
                  <Edit2 size={14} /> Full Edit
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 14px', whiteSpace: 'nowrap' }}
                  onClick={() => { setScannedTeam(null); setTeamIdInput(''); }}
                >
                  <RefreshCw size={14} /> Clear
                </button>
              </div>
            </div>


            {/* 4 Summary Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
              {/* Leader Card */}
              <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                  Team Leader
                </div>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{scannedTeam.leaderName}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{scannedTeam.leaderEmail}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{scannedTeam.leaderPhone}</div>
              </div>

              {/* Venue & POD Card */}
              <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                  Venue Location & POD
                </div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--primary)' }}>
                  POD: {scannedTeam.pod?.name || 'Not assigned'}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--success)', fontWeight: 600, marginTop: '4px' }}>
                  Desk Number: {scannedTeam.deskNumber || 'Unassigned'}
                </div>
              </div>

              {/* Problem Statement Card */}
              <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                  Selected Topic
                </div>
                {scannedTeam.psSelection ? (
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--success)' }}>
                      [{scannedTeam.psSelection.code || scannedTeam.psSelection.problemStatement?.code}]
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {scannedTeam.psSelection.problemStatement?.title || scannedTeam.psSelection.title}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.9rem', color: 'var(--warning)', fontWeight: 600 }}>
                    Pending Selection
                  </div>
                )}
              </div>

              {/* Roster Attendance Card */}
              <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                  Check-in Status
                </div>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                  {scannedTeam.members?.filter(m => m.idVerified).length || 0} / {scannedTeam.members?.length || 0} Members Verified
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Total Team Members: {scannedTeam.members?.length || 0}
                </div>
              </div>
            </div>
          </div>

          {/* Roster Members Table Card */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={20} style={{ color: 'var(--primary)' }} />
              Team Members Roster ({scannedTeam.members?.length || 0})
            </h3>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color, #333)', textAlign: 'left' }}>
                    <th style={{ padding: '12px' }}>Member Name</th>
                    <th style={{ padding: '12px' }}>Role</th>
                    <th style={{ padding: '12px' }}>Email & Phone</th>
                    <th style={{ padding: '12px' }}>ID Verification</th>
                  </tr>
                </thead>
                <tbody>
                  {(scannedTeam.members || []).map((m) => (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '12px', fontWeight: 600 }}>{m.name}</td>
                      <td style={{ padding: '12px' }}>
                        {m.isLeader ? (
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: 'rgba(185, 111, 56, 0.15)', color: 'var(--primary)' }}>
                            Leader
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Member</span>
                        )}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div>{m.email}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{m.phone}</div>
                      </td>
                      <td style={{ padding: '12px' }}>
                        {m.idVerified ? (
                          <span style={{ color: 'var(--success)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 10px', borderRadius: '6px' }}>
                            <CheckCircle size={14} /> Verified
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', background: 'rgba(255, 255, 255, 0.05)', padding: '4px 10px', borderRadius: '6px' }}>
                            Pending Check-in
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Empty State Hero Banner */
        <div className="glass-card" style={{ padding: '48px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '20px', borderRadius: '50%', background: 'rgba(185, 111, 56, 0.1)', color: 'var(--primary)', display: 'inline-flex' }}>
            <QrCode size={48} />
          </div>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Ready to Scan Team QR Code</h3>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '500px', margin: '0 auto', fontSize: '0.95rem' }}>
            Click the button below to launch your device camera and scan any team leader's QR code.
          </p>
          <button
            className="btn btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '14px 28px',
              fontSize: '1.05rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, var(--primary) 0%, #e07a38 100%)',
              boxShadow: '0 4px 18px rgba(185, 111, 56, 0.45)',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              marginTop: '12px'
            }}
            onClick={() => setScannerOpen(true)}
          >
            <QrCode size={24} />
            Launch Live Camera Scanner
          </button>
        </div>
      )}

      {/* QR Scanner Overlay Modal */}
      {scannerOpen && (
        <QRScanner
          onScan={handleQrScan}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </div>
  );
}
