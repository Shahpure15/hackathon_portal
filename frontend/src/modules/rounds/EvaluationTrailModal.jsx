import React, { useState, useEffect } from 'react';
import { Award, RefreshCw, Eye, EyeOff, Unlock, Clock, FileText } from 'lucide-react';
import api from '../../services/api';
import Modal from '../../components/Modal';
import { useToast } from '../../contexts/ToastContext';

export const EvaluationTrailModal = ({ roundId, team, onClose }) => {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [trailData, setTrailData] = useState(null);

  useEffect(() => {
    if (!roundId || !team?.id) return;

    let isMounted = true;
    const fetchTrail = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/admin/rounds/${roundId}/evaluations/trail?teamId=${team.id}`);
        if (isMounted) {
          setTrailData(res.data);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Failed to load evaluation trail', err);
          addToast('Failed to load evaluation trail for team', 'error');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchTrail();

    return () => {
      isMounted = false;
    };
  }, [roundId, team?.id]);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`Evaluation Trail: ${team.name} (${team.registrationId || ''})`}
      maxWidth="860px"
    >
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <RefreshCw size={24} className="spin" style={{ marginBottom: '10px' }} />
          <div>Loading evaluation trail and scoring versions...</div>
        </div>
      ) : !trailData || !trailData.evaluations || trailData.evaluations.length === 0 ? (
        <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No evaluations recorded for this team yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {trailData.evaluations.map((ev) => (
            <div
              key={ev.evaluationId}
              className="glass-panel"
              style={{
                padding: '18px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              {/* Header per judge */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Award size={18} style={{ color: 'var(--primary)' }} />
                    <strong style={{ fontSize: '1rem' }}>{ev.judgeName}</strong>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Round: {ev.roundName}
                  </span>
                </div>
              </div>

              {/* Versions Timeline */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {ev.versions.map((ver) => {
                  const statusColors = {
                    draft: { bg: 'rgba(245, 158, 11, 0.1)', fg: '#f59e0b' },
                    final: { bg: 'rgba(34, 197, 94, 0.1)', fg: '#22c55e' },
                    superseded: { bg: 'rgba(156, 163, 175, 0.1)', fg: '#9ca3af' },
                    discarded: { bg: 'rgba(239, 68, 68, 0.1)', fg: '#ef4444' },
                  };
                  const sc = statusColors[ver.status] || statusColors.draft;

                  return (
                    <div
                      key={ver.id}
                      style={{
                        padding: '14px',
                        borderRadius: '8px',
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid var(--border-light)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                            Version #{ver.version}
                          </span>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: sc.bg,
                              color: sc.fg,
                              textTransform: 'uppercase',
                            }}
                          >
                            {ver.status}
                          </span>
                          {ver.totalPct !== null && ver.totalPct !== undefined && (
                            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--primary)' }}>
                              {ver.totalPct}%
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {ver.submittedAt
                            ? `Submitted: ${new Date(ver.submittedAt).toLocaleString()}`
                            : 'Draft / Unsubmitted'}
                          {ver.supersededReason && ` (${ver.supersededReason})`}
                        </div>
                      </div>

                      {/* Diff Table: Scores */}
                      {ver.diff?.scores && ver.diff.scores.length > 0 && (
                        <div style={{ marginTop: '4px' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                            Numeric Scores Breakdown
                          </div>
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                                  <th style={{ padding: '4px 8px' }}>Criterion</th>
                                  {ver.version > 1 && <th style={{ padding: '4px 8px' }}>Previous</th>}
                                  <th style={{ padding: '4px 8px' }}>Assigned Marks</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ver.diff.scores.map((scItem) => (
                                  <tr key={scItem.fieldId} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td style={{ padding: '6px 8px' }}>{scItem.label}</td>
                                    {ver.version > 1 && (
                                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>
                                        {scItem.before ?? '-'}
                                      </td>
                                    )}
                                    <td style={{ padding: '6px 8px', fontWeight: 700, color: 'var(--primary)' }}>
                                      {scItem.after ?? '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Diff: Text / Feedback */}
                      {ver.diff?.texts && ver.diff.texts.length > 0 && (
                        <div style={{ marginTop: '6px' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                            Judge Feedback & Comments
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {ver.diff.texts.map((txItem) => (
                              <div
                                key={txItem.fieldId}
                                style={{
                                  padding: '8px 10px',
                                  borderRadius: '6px',
                                  background: 'rgba(0,0,0,0.02)',
                                  border: '1px solid var(--border-light)',
                                  fontSize: '0.78rem',
                                }}
                              >
                                <strong>{txItem.label}:</strong> {txItem.after || <span style={{ color: 'var(--text-muted)' }}>No feedback entered</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};

export default EvaluationTrailModal;
