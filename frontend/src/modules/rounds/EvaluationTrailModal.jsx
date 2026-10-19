import React, { useState, useEffect } from 'react';
import { Award, RefreshCw, RotateCcw, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import api from '../../services/api';
import Modal from '../../components/Modal';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';

export const EvaluationTrailModal = ({ roundId, team, teamId, teamName, onClose, onEvaluationCleared }) => {
  const { addToast } = useToast();
  const { can } = useAuth();
  const [loading, setLoading] = useState(true);
  const [trailData, setTrailData] = useState(null);

  const effectiveTeamId = team?.id || team?.teamId || teamId;
  const effectiveTeamName = team?.name || team?.teamName || teamName || 'Team';
  const effectiveRegId = team?.registrationId || team?.teamRegistrationId || '';

  // Confirm clear modal state
  const [clearTarget, setClearTarget] = useState(null); // { type: 'single' | 'all', id?: string, judgeName?: string }
  const [clearing, setClearing] = useState(false);
  const [clearReason, setClearReason] = useState('Admin reset evaluation for re-evaluation');

  const fetchTrail = async () => {
    if (!roundId || !effectiveTeamId) return;
    setLoading(true);
    try {
      const res = await api.get(`/admin/rounds/${roundId}/evaluations/trail?teamId=${effectiveTeamId}`);
      setTrailData(res.data);
    } catch (err) {
      console.error('Failed to load evaluation trail', err);
      addToast('Failed to load evaluation trail for team', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrail();
  }, [roundId, effectiveTeamId]);

  const handleConfirmClear = async () => {
    if (!clearTarget) return;
    setClearing(true);
    try {
      if (clearTarget.type === 'single') {
        const res = await api.post(`/admin/evaluations/${clearTarget.id}/clear`, {
          reason: clearReason,
        });
        addToast(res.data?.message || 'Evaluation archived. Team can now be re-evaluated.', 'success');
      } else {
        const res = await api.post(`/admin/rounds/${roundId}/teams/${effectiveTeamId}/clear-evaluations`, {
          reason: clearReason,
        });
        addToast(res.data?.message || 'All evaluations for team cleared and archived.', 'success');
      }
      setClearTarget(null);
      await fetchTrail();
      if (onEvaluationCleared) {
        onEvaluationCleared();
      }
    } catch (err) {
      console.error('Failed to clear evaluation', err);
      const detail = err.response?.data?.detail || 'Failed to clear evaluation';
      addToast(typeof detail === 'string' ? detail : JSON.stringify(detail), 'error');
    } finally {
      setClearing(false);
    }
  };

  const canClear = can('evaluation.unlock') || can('round.manage');

  return (
    <>
      <Modal
        isOpen={true}
        onClose={onClose}
        title={`Evaluation Trail: ${effectiveTeamName} ${effectiveRegId ? `(${effectiveRegId})` : ''}`}
        maxWidth="900px"
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Top Toolbar */}
            {canClear && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.05)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                }}
              >
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Need to re-evaluate this team? You can archive the evaluation history and reset scores.
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    setClearTarget({
                      type: 'all',
                    })
                  }
                  style={{
                    fontSize: '0.8rem',
                    color: '#ef4444',
                    borderColor: 'rgba(239, 68, 68, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <RotateCcw size={14} />
                  <span>Clear All for Team</span>
                </button>
              </div>
            )}

            {trailData.evaluations.map((ev) => {
              const hasActiveVersion = ev.versions?.some((v) => v.status === 'draft' || v.status === 'final');

              return (
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
                        <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>{ev.judgeName}</strong>
                      </div>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        Round: {ev.roundName}
                      </span>
                    </div>

                    {canClear && hasActiveVersion && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() =>
                          setClearTarget({
                            type: 'single',
                            id: ev.evaluationId,
                            judgeName: ev.judgeName,
                          })
                        }
                        style={{
                          fontSize: '0.78rem',
                          color: '#ef4444',
                          borderColor: 'rgba(239, 68, 68, 0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <RotateCcw size={13} />
                        <span>Clear & Re-evaluate</span>
                      </button>
                    )}
                  </div>

                  {/* Versions Timeline */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {ev.versions.map((ver) => {
                      const statusColors = {
                        draft: { bg: 'rgba(245, 158, 11, 0.1)', fg: '#f59e0b' },
                        final: { bg: 'rgba(34, 197, 94, 0.1)', fg: '#22c55e' },
                        superseded: { bg: 'rgba(156, 163, 175, 0.15)', fg: '#9ca3af' },
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
                              {ver.supersededReason && ` (Reason: ${ver.supersededReason})`}
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
              );
            })}
          </div>
        )}
      </Modal>

      {/* Confirmation Modal for Clearing & Re-evaluation */}
      {clearTarget && (
        <Modal
          isOpen={true}
          onClose={() => setClearTarget(null)}
          title="Archive & Reset Evaluation"
          maxWidth="520px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#f59e0b' }}>
              <AlertTriangle size={24} />
              <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>
                {clearTarget.type === 'single'
                  ? `Reset evaluation by ${clearTarget.judgeName}?`
                  : `Reset all evaluations for ${effectiveTeamName}?`}
              </strong>
            </div>

            <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
              All current scores and comments will be <strong>safely archived into historical versions</strong> (nothing will be deleted). 
              The evaluation state will be reset to <em>Not Started</em> so the judge can re-evaluate the team from scratch.
            </p>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                Reason for re-evaluation:
              </label>
              <input
                type="text"
                className="input-field"
                value={clearReason}
                onChange={(e) => setClearReason(e.target.value)}
                placeholder="e.g. Technical demo re-run, judging discrepancy resolved"
                style={{ width: '100%', fontSize: '0.85rem' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setClearTarget(null)}
                disabled={clearing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmClear}
                disabled={clearing}
                style={{ background: '#ef4444', borderColor: '#ef4444', color: '#fff' }}
              >
                {clearing ? 'Archiving...' : 'Confirm & Allow Re-evaluation'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

export default EvaluationTrailModal;
