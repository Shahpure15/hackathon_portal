import { useState, useEffect, useCallback } from 'react';
import api, { getAccessToken } from '../services/api';
import usePsWebSocket from '../hooks/usePsWebSocket';

export default function AdminPSOverview({ eventId }) {
  const [statements, setStatements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatedPsId, setUpdatedPsId] = useState(null);

  const fetchStatements = useCallback(async () => {
    try {
      const res = await api.get('/admin/problem-statements');
      setStatements(res.data);
    } catch (e) {
      console.error('Failed to fetch problem statements', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatements(); }, [fetchStatements]);

  const handleWsMessage = useCallback((data) => {
    if (data.type === 'ps_capacity_update') {
      setUpdatedPsId(data.psId);
      setStatements((prev) =>
        prev.map((s) =>
          s.id === data.psId
            ? { ...s, selectedCount: data.selectedCount, remainingCapacity: data.remainingCapacity }
            : s
        )
      );
      setTimeout(() => setUpdatedPsId(null), 800);
    }
  }, []);

  usePsWebSocket({
    eventId,
    token: getAccessToken() || localStorage.getItem('access_token'),
    onMessage: handleWsMessage,
    enabled: !!eventId,
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '40vh', alignItems: 'center', justifyContent: 'center' }}>
        <span className="spinner" style={{ width: '40px', height: '40px' }}></span>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '16px' }}>Problem Statement Capacity — Live</h2>
      <div className="glass-card" style={{ padding: '20px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid var(--border-color, #333)' }}>Code</th>
              <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid var(--border-color, #333)' }}>Title</th>
              <th style={{ textAlign: 'right', padding: '12px', borderBottom: '2px solid var(--border-color, #333)' }}>Selected</th>
              <th style={{ textAlign: 'right', padding: '12px', borderBottom: '2px solid var(--border-color, #333)' }}>Capacity</th>
              <th style={{ textAlign: 'right', padding: '12px', borderBottom: '2px solid var(--border-color, #333)' }}>Remaining</th>
            </tr>
          </thead>
          <tbody>
            {statements.map((ps) => (
              <tr
                key={ps.id}
                style={{
                  borderTop: '1px solid var(--border-color, #333)',
                  transition: 'background-color 0.6s',
                  backgroundColor: updatedPsId === ps.id ? 'var(--accent-highlight, rgba(100,180,255,0.15))' : 'transparent',
                }}
              >
                <td style={{ padding: '12px', fontWeight: 700 }}>{ps.code}</td>
                <td style={{ padding: '12px' }}>{ps.title}</td>
                <td style={{ padding: '12px', textAlign: 'right' }}>{ps.selectedCount}</td>
                <td style={{ padding: '12px', textAlign: 'right' }}>{ps.capacity}</td>
                <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: (ps.remainingCapacity ?? (ps.capacity - ps.selectedCount)) === 0 ? 'var(--danger, #ef4444)' : 'var(--text-primary)' }}>
                  {ps.remainingCapacity ?? (ps.capacity - ps.selectedCount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
