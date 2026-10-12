import React from 'react';
import { Award, Trophy, CheckCircle2, XCircle, Clock, MessageSquare, Sparkles } from 'lucide-react';
import Skeleton from '../../components/Skeleton';

/**
 * Shared ParticipantResultCard component used in both participant dashboard
 * and admin preview modal. Renders score, rank, advancement status, criteria progress,
 * and anonymous judge feedback.
 */
export const ParticipantResultCard = ({
  result,
  loading = false,
  isUpdated = false,
  preview = false,
  teamName = null,
}) => {
  if (loading) {
    return (
      <div
        className="glass-card"
        style={{
          padding: '24px',
          borderRadius: '16px',
          border: '1px solid var(--border-light)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Skeleton variant="text" width="40%" height="28px" />
          <Skeleton variant="badge" width="80px" height="24px" />
        </div>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginTop: '12px' }}>
          <Skeleton variant="circle" width="80px" height="80px" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Skeleton variant="text" width="60%" height="20px" />
            <Skeleton variant="text" width="90%" height="16px" />
          </div>
        </div>
        <Skeleton variant="card" count={2} height="40px" />
      </div>
    );
  }

  if (!result) {
    return null;
  }

  const {
    score,
    totalScale = 100,
    scale = 'percent',
    rank,
    advancement,
    criteria = [],
    comments = [],
    releaseNo,
    releasedAt,
  } = result;

  // Format score based on scale type
  const formatScoreDisplay = () => {
    if (score === null || score === undefined) return null;
    const num = Number(score);
    if (Number.isNaN(num)) return null;

    if (scale === 'percent') {
      return `${num.toFixed(1)}%`;
    }
    if (scale === 'target') {
      return `${num.toFixed(1)} / ${totalScale}`;
    }
    return num.toFixed(2);
  };

  const formattedScore = formatScoreDisplay();

  return (
    <div
      className="glass-card"
      style={{
        padding: '24px',
        borderRadius: '16px',
        border: '1px solid var(--border-light)',
        background: 'var(--surface-ground, rgba(255, 255, 255, 0.03))',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle decorative gradient blob */}
      <div
        style={{
          position: 'absolute',
          top: '-40px',
          right: '-40px',
          width: '140px',
          height: '140px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, var(--primary-glow) 0%, transparent 70%)',
          pointerEvents: 'none',
          opacity: 0.6,
        }}
      />

      {/* Header bar with badges */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          marginBottom: '20px',
          borderBottom: '1px solid var(--border-light)',
          paddingBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Award size={20} style={{ color: 'var(--primary)' }} />
          <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
            {preview && teamName ? `Participant View: ${teamName}` : 'Official Evaluation Results'}
          </h4>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {isUpdated && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.74rem',
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: '999px',
                background: 'rgba(59, 130, 246, 0.18)',
                color: '#3b82f6',
                border: '1px solid rgba(59, 130, 246, 0.35)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              <Sparkles size={12} /> Updated
            </span>
          )}

          {releaseNo && (
            <span
              style={{
                fontSize: '0.74rem',
                color: 'var(--text-secondary)',
                background: 'rgba(0,0,0,0.04)',
                padding: '3px 8px',
                borderRadius: '6px',
                border: '1px solid var(--border-light)',
              }}
            >
              Release #{releaseNo}
            </span>
          )}
        </div>
      </div>

      {/* Top Banner: Big Score, Rank & Advancement */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        {/* Score Tile */}
        {formattedScore !== null && (
          <div
            style={{
              padding: '16px 20px',
              borderRadius: '12px',
              background: 'rgba(0,0,0,0.02)',
              border: '1px solid var(--border-light)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>
              Final Evaluated Score
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
              <span style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                {formattedScore}
              </span>
              {scale === 'percent' && (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>percentile base</span>
              )}
            </div>
          </div>
        )}

        {/* Rank Tile */}
        {rank !== null && rank !== undefined && (
          <div
            style={{
              padding: '16px 20px',
              borderRadius: '12px',
              background: 'rgba(0,0,0,0.02)',
              border: '1px solid var(--border-light)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>
              Round Standing
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <Trophy size={26} style={{ color: rank <= 3 ? '#eab308' : 'var(--primary)' }} />
              <span style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                Rank #{rank}
              </span>
            </div>
          </div>
        )}

        {/* Advancement Status Tile */}
        {advancement && (
          <div
            style={{
              padding: '16px 20px',
              borderRadius: '12px',
              background: 'rgba(0,0,0,0.02)',
              border: '1px solid var(--border-light)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>
              Progression Status
            </span>
            <div style={{ marginTop: '8px' }}>
              {advancement === 'advanced' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    padding: '6px 14px',
                    borderRadius: '8px',
                    background: 'rgba(34, 197, 94, 0.12)',
                    color: '#16a34a',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                  }}
                >
                  <CheckCircle2 size={16} /> Advanced to Next Round
                </span>
              )}

              {advancement === 'not_advanced' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    padding: '6px 14px',
                    borderRadius: '8px',
                    background: 'rgba(148, 163, 184, 0.12)',
                    color: 'var(--text-secondary)',
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                  }}
                >
                  <Clock size={16} /> Did not advance
                </span>
              )}

              {advancement === 'provisional' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    padding: '6px 14px',
                    borderRadius: '8px',
                    background: 'rgba(234, 179, 8, 0.12)',
                    color: '#ca8a04',
                    border: '1px solid rgba(234, 179, 8, 0.3)',
                  }}
                >
                  <Clock size={16} /> Provisional Evaluation
                </span>
              )}

              {advancement === 'eligible' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    padding: '6px 14px',
                    borderRadius: '8px',
                    background: 'rgba(59, 130, 246, 0.12)',
                    color: '#3b82f6',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                  }}
                >
                  Eligible
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Criteria Breakdown Section */}
      {criteria && criteria.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h5
            style={{
              fontSize: '0.92rem',
              fontWeight: 700,
              marginBottom: '12px',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Criterion Breakdown
          </h5>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {criteria.map((c, idx) => {
              const avg = Number(c.avgMarks || 0);
              const max = Number(c.maxMarks || 10);
              const pct = max > 0 ? Math.min(100, Math.max(0, (avg / max) * 100)) : 0;

              return (
                <div
                  key={idx}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '10px',
                    background: 'rgba(0,0,0,0.015)',
                    border: '1px solid var(--border-light)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '6px',
                    }}
                  >
                    <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {c.label}
                    </span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {avg.toFixed(1)} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/ {max}</span>
                    </span>
                  </div>

                  {/* Sleek Progress bar */}
                  <div
                    style={{
                      width: '100%',
                      height: '7px',
                      borderRadius: '999px',
                      background: 'rgba(0,0,0,0.06)',
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        borderRadius: '999px',
                        background: 'linear-gradient(90deg, var(--primary) 0%, #38bdf8 100%)',
                        transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Anonymous Suggestions from the judges Section */}
      {comments && comments.length > 0 && (
        <div>
          <h5
            style={{
              fontSize: '0.92rem',
              fontWeight: 700,
              marginBottom: '12px',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <MessageSquare size={16} style={{ color: 'var(--primary)' }} />
            Suggestions from the judges
          </h5>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {comments.map((cg, gIdx) => (
              <div key={gIdx} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {cg.label && (
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    {cg.label}
                  </span>
                )}
                {cg.items && cg.items.length > 0 ? (
                  cg.items.map((item, iIdx) => (
                    <div
                      key={iIdx}
                      style={{
                        padding: '12px 16px',
                        borderRadius: '10px',
                        background: 'rgba(0,0,0,0.02)',
                        border: '1px solid var(--border-light)',
                        fontSize: '0.88rem',
                        lineHeight: '1.5',
                        color: 'var(--text-secondary)',
                        fontStyle: 'normal',
                      }}
                    >
                      "{item}"
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    No comments recorded for this section.
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {releasedAt && (
        <div style={{ marginTop: '20px', textAlign: 'right', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Published: {new Date(releasedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
};

export default ParticipantResultCard;
