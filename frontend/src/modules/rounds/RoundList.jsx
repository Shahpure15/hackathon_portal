import React from 'react';
import {
  FileText,
  Sliders,
  Calendar,
  Clock,
  Download,
  Trash2,
  Edit2,
  Lock,
  Unlock,
  CheckCircle2,
  Scale,
  Users,
  AlertCircle,
  Plus,
} from 'lucide-react';
import Skeleton from '../../components/Skeleton';

export const RoundList = ({
  rounds = [],
  loading = false,
  onEditRound,
  onDeleteRound,
  onToggleSubmission,
  onExportSubmissions,
  onAddRound,
}) => {
  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
        {[1, 2, 3].map((n) => (
          <div key={n} className="glass-card" style={{ padding: '24px', borderRadius: '16px' }}>
            <Skeleton height={24} width="40%" style={{ marginBottom: '12px' }} />
            <Skeleton height={18} width="80%" style={{ marginBottom: '8px' }} />
            <Skeleton height={14} width="60%" style={{ marginBottom: '16px' }} />
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <Skeleton height={26} width={80} />
              <Skeleton height={26} width={80} />
            </div>
            <Skeleton height={38} width="100%" />
          </div>
        ))}
      </div>
    );
  }

  if (rounds.length === 0) {
    return (
      <div
        className="glass-panel"
        style={{
          padding: '60px 24px',
          textAlign: 'center',
          borderRadius: '16px',
          color: 'var(--text-muted)',
        }}
      >
        <FileText size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-main)' }}>
          No competition rounds created yet
        </h3>
        <p style={{ margin: '0 0 20px 0', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
          Get started by defining Round 1 for participant submissions and judging evaluations.
        </p>
        <button
          type="button"
          onClick={onAddRound}
          className="btn btn-primary touch-target"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={16} /> Create First Round
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
      {rounds.map((round) => {
        const isSubEnabled = Boolean(round.submissionEnabled);
        const isEvalEnabled = Boolean(round.evaluationEnabled);
        const isOpen = Boolean(round.isSubmissionOpen);
        const rubricSummary = round.rubricSummary || {};

        return (
          <div
            key={round.id}
            className="glass-card"
            style={{
              padding: '24px',
              borderRadius: '16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '16px',
              border: '1px solid var(--border-color)',
            }}
          >
            <div>
              {/* Header: Number Badge and Status */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: '3px 10px',
                    borderRadius: '6px',
                    background: 'rgba(99, 102, 241, 0.12)',
                    color: 'var(--primary)',
                  }}
                >
                  Round #{round.number}
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: '6px',
                      textTransform: 'capitalize',
                      background:
                        round.status === 'live'
                          ? 'rgba(34, 197, 94, 0.12)'
                          : round.status === 'closed'
                          ? 'rgba(239, 68, 68, 0.12)'
                          : 'rgba(156, 163, 175, 0.12)',
                      color:
                        round.status === 'live'
                          ? '#22c55e'
                          : round.status === 'closed'
                          ? '#ef4444'
                          : 'var(--text-muted)',
                    }}
                  >
                    {round.status}
                  </span>

                  <button
                    type="button"
                    onClick={() => onDeleteRound(round)}
                    className="btn btn-icon touch-target"
                    title="Delete Round"
                    style={{ color: '#ef4444', padding: '4px' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Title & Description */}
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 6px 0', color: 'var(--text-main)' }}>
                {round.name}
              </h3>
              {round.description && (
                <p
                  style={{
                    fontSize: '0.84rem',
                    color: 'var(--text-secondary)',
                    margin: '0 0 14px 0',
                    lineHeight: 1.4,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {round.description}
                </p>
              )}

              {/* Feature Chips */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                <span
                  style={{
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: '20px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: isSubEnabled ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                    color: isSubEnabled ? '#22c55e' : 'var(--text-muted)',
                  }}
                >
                  <FileText size={13} />
                  {isSubEnabled ? (isOpen ? 'Submissions: Open' : 'Submissions: Closed') : 'Submissions Disabled'}
                </span>

                <span
                  style={{
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: '20px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: isEvalEnabled ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                    color: isEvalEnabled ? 'var(--primary)' : 'var(--text-muted)',
                  }}
                >
                  <Scale size={13} />
                  {isEvalEnabled ? (rubricSummary.published ? 'Judging: Live' : 'Judging: Draft Rubric') : 'Judging Disabled'}
                </span>
              </div>

              {/* Stats & Schedule */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  paddingTop: '10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Users size={14} /> Total Submissions:
                  </span>
                  <strong style={{ color: 'var(--text-main)' }}>{round.submissionCount} teams</strong>
                </div>

                {isEvalEnabled && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Scale size={14} /> Rubric Version:
                    </span>
                    <strong style={{ color: 'var(--text-main)' }}>
                      v{rubricSummary.version || 1} ({rubricSummary.fieldCount || 0} criteria)
                    </strong>
                  </div>
                )}

                {(round.opensAt || round.closesAt) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={14} /> Schedule:
                    </span>
                    <span>
                      {round.opensAt ? new Date(round.opensAt).toLocaleDateString() : 'Immediate'} -{' '}
                      {round.closesAt ? new Date(round.closesAt).toLocaleDateString() : 'Open'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '8px', paddingTop: '10px', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => onEditRound(round)}
                className="btn btn-secondary touch-target"
                style={{ flex: 1, minWidth: '110px', justifyContent: 'center', fontSize: '0.82rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Edit2 size={15} /> Edit Config
              </button>

              {isSubEnabled && (
                <button
                  type="button"
                  onClick={() => onToggleSubmission(round.id, isOpen)}
                  className={`btn ${isOpen ? 'btn-secondary' : 'btn-primary'} touch-target`}
                  style={{ flex: 1, minWidth: '110px', justifyContent: 'center', fontSize: '0.82rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  {isOpen ? <Lock size={15} /> : <Unlock size={15} />}
                  {isOpen ? 'Close Window' : 'Open Window'}
                </button>
              )}

              <button
                type="button"
                onClick={() => onExportSubmissions(round.id, round.name)}
                className="btn btn-secondary touch-target"
                title="Download Submissions Excel"
                style={{ padding: '0 12px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Download size={15} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default RoundList;
