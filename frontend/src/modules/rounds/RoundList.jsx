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
  Trophy,
  Award,
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
  onAssignJudges,
  onViewProgress,
  onViewLeaderboard,
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
            className="glass-card round-card-clickable"
            onClick={() => onEditRound(round)}
            style={{
              padding: '24px',
              borderRadius: '16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '16px',
              border: '1px solid var(--border-color)',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary)';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 10px 28px rgba(0, 0, 0, 0.18)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-color)';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
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
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteRound(round);
                    }}
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
                {(() => {
                  let subLabel = 'Submissions Disabled';
                  let subBg = 'rgba(255, 255, 255, 0.05)';
                  let subColor = 'var(--text-muted)';
                  if (isSubEnabled) {
                    if (round.status === 'draft') {
                      subLabel = 'Submissions: In Setup (Draft)';
                      subBg = 'rgba(234, 179, 8, 0.12)';
                      subColor = '#eab308';
                    } else if (round.status === 'closed') {
                      subLabel = 'Submissions: Closed';
                      subBg = 'rgba(239, 68, 68, 0.1)';
                      subColor = '#ef4444';
                    } else if (isOpen) {
                      subLabel = 'Submissions: Open';
                      subBg = 'rgba(34, 197, 94, 0.12)';
                      subColor = '#22c55e';
                    } else {
                      subLabel = 'Submissions: Paused';
                      subBg = 'rgba(148, 163, 184, 0.1)';
                      subColor = '#94a3b8';
                    }
                  }

                  let evalLabel = 'Judging Disabled';
                  let evalBg = 'rgba(255, 255, 255, 0.05)';
                  let evalColor = 'var(--text-muted)';
                  if (isEvalEnabled) {
                    if (round.status === 'draft') {
                      evalLabel = rubricSummary.published ? 'Judging: Ready (Draft)' : 'Judging: Draft Rubric';
                      evalBg = 'rgba(234, 179, 8, 0.12)';
                      evalColor = '#eab308';
                    } else if (round.status === 'closed') {
                      evalLabel = 'Judging: Closed';
                      evalBg = 'rgba(239, 68, 68, 0.1)';
                      evalColor = '#ef4444';
                    } else if (round.status === 'live') {
                      if (rubricSummary.published) {
                        evalLabel = 'Judging: Live';
                        evalBg = 'rgba(99, 102, 241, 0.14)';
                        evalColor = 'var(--primary)';
                      } else {
                        evalLabel = 'Judging: Unreleased Rubric';
                        evalBg = 'rgba(234, 179, 8, 0.12)';
                        evalColor = '#eab308';
                      }
                    }
                  }

                  return (
                    <>
                      <span
                        style={{
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          padding: '4px 10px',
                          borderRadius: '20px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: subBg,
                          color: subColor,
                        }}
                      >
                        <FileText size={13} />
                        {subLabel}
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
                          background: evalBg,
                          color: evalColor,
                        }}
                      >
                        <Scale size={13} />
                        {evalLabel}
                      </span>
                    </>
                  );
                })()}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
              {isEvalEnabled && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {onAssignJudges && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAssignJudges(round);
                      }}
                      className="btn btn-primary touch-target"
                      style={{ flex: 1, minWidth: '130px', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Users size={14} /> Assign Judges
                    </button>
                  )}
                  {onViewLeaderboard && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewLeaderboard(round);
                      }}
                      className="btn btn-secondary touch-target"
                      style={{ flex: 1, minWidth: '110px', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Trophy size={14} /> Leaderboard
                    </button>
                  )}
                  {onViewProgress && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewProgress(round);
                      }}
                      className="btn btn-secondary touch-target"
                      style={{ padding: '0 10px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      title="View Judging Progress"
                    >
                      <Award size={14} /> Progress
                    </button>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditRound(round);
                  }}
                  className="btn btn-secondary touch-target"
                  style={{ flex: 1, minWidth: '100px', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Edit2 size={14} /> Setup & Rubric
                </button>

                {isSubEnabled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSubmission(round.id, isOpen);
                    }}
                    className={`btn ${isOpen ? 'btn-secondary' : 'btn-primary'} touch-target`}
                    style={{ flex: 1, minWidth: '110px', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    {isOpen ? <Lock size={14} /> : <Unlock size={14} />}
                    {isOpen ? 'Close Gate' : 'Open Gate'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExportSubmissions(round.id, round.name);
                  }}
                  className="btn btn-secondary touch-target"
                  title="Download Submissions Excel"
                  style={{ padding: '0 12px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Download size={14} />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default RoundList;
