import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { Layers, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import Modal from '../components/Modal';

export default function AdminPSOverview() {
  const { addToast } = useToast();
  const [statements, setStatements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const fetchStatements = useCallback(async () => {
    try {
      const res = await api.get('/admin/problem-statements');
      setStatements(res.data || []);
    } catch (e) {
      // Silent catch
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatements();
    const interval = setInterval(fetchStatements, 10000);
    return () => clearInterval(interval);
  }, [fetchStatements]);

  const handleClearAllSelections = async () => {
    setIsClearing(true);
    try {
      const res = await api.post('/admin/problem-statements/clear-selections');
      addToast(res.data.message || 'Successfully cleared all team problem statement selections!', 'success');
      setShowClearConfirm(false);
      fetchStatements();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to clear problem statement selections', 'error');
    } finally {
      setIsClearing(false);
    }
  };

  const totalCapacity = statements.reduce((sum, s) => sum + (s.capacity || 0), 0);
  const totalSelected = statements.reduce((sum, s) => sum + (s.selectedCount || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="glass-card" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Layers style={{ color: 'var(--primary)' }} size={26} />
            Live Problem Statement Capacity
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px', fontSize: '0.9rem' }}>
            Real-time live problem statement allocations across all participating teams.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ textAlign: 'right', marginRight: '8px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Selected</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)' }}>
              {totalSelected} / {totalCapacity}
            </div>
          </div>

          <button
            onClick={() => setShowClearConfirm(true)}
            className="btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              fontSize: '0.85rem',
              background: 'rgba(239, 68, 68, 0.12)',
              color: 'var(--danger)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              fontWeight: 600
            }}
            title="Reset & clear all team leader problem statement selections"
          >
            <Trash2 size={15} /> Clear All Leader Selections
          </button>

          <button
            onClick={fetchStatements}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '0.85rem' }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Clearing All PS Selections */}
      <Modal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        title="Clear All Leader PS Selections?"
        maxWidth="480px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', background: 'rgba(239, 68, 68, 0.08)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
            <AlertTriangle size={24} style={{ color: 'var(--danger)', shrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              <strong>Warning:</strong> You are about to clear <strong>ALL team problem statement selections</strong> across the entire hackathon.
              <ul style={{ marginTop: '8px', paddingLeft: '18px', color: 'var(--text-secondary)' }}>
                <li>Resets all locked selections back to 0.</li>
                <li>Frees up problem statement capacity slots for all teams.</li>
                <li>All team leaders will be able to select a new problem statement.</li>
              </ul>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
            <button
              onClick={() => setShowClearConfirm(false)}
              className="btn btn-secondary"
              disabled={isClearing}
            >
              Cancel
            </button>
            <button
              onClick={handleClearAllSelections}
              className="btn"
              style={{ background: 'var(--danger)', color: '#fff', fontWeight: 700 }}
              disabled={isClearing}
            >
              {isClearing ? <span className="spinner spinner-white"></span> : 'Yes, Clear All Selections'}
            </button>
          </div>
        </div>
      </Modal>

      <div className="glass-card" style={{ padding: '20px' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading live statement counts...
          </div>
        ) : statements.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No problem statements found.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '12px 16px' }}>Code</th>
                  <th style={{ textAlign: 'left', padding: '12px 16px' }}>Title</th>
                  <th style={{ textAlign: 'left', padding: '12px 16px' }}>Discipline</th>
                  <th style={{ textAlign: 'center', padding: '12px 16px' }}>Capacity</th>
                  <th style={{ textAlign: 'center', padding: '12px 16px' }}>Selected</th>
                  <th style={{ textAlign: 'center', padding: '12px 16px' }}>Remaining</th>
                  <th style={{ textAlign: 'left', padding: '12px 16px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {statements.map((s) => {
                  const remaining = s.remainingCapacity !== undefined ? s.remainingCapacity : Math.max((s.capacity || 0) - (s.selectedCount || 0), 0);
                  const isFull = remaining === 0;
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--primary)' }}>{s.code}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>{s.title}</td>
                      <td style={{ padding: '12px 16px', fontSize: '0.85rem' }}>{s.discipline || 'BOTH'}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600 }}>{s.capacity}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: 'var(--accent-blue)' }}>{s.selectedCount || 0}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: isFull ? 'var(--danger)' : 'var(--success)' }}>
                        {remaining}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {isFull ? (
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)' }}>
                            FULL
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)' }}>
                            AVAILABLE
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
