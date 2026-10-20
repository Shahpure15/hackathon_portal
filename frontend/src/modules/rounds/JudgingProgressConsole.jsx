import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Users, Award, CheckCircle, Clock, AlertCircle,
  Eye, EyeOff, Lock, Unlock, ChevronRight, X, Search, Shield,
  ArrowRight, FileText, CheckCircle2, AlertTriangle
} from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../../components/Modal';

export default function JudgingProgressConsole({ roundId, roundName }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [progressData, setProgressData] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [assignableTeams, setAssignableTeams] = useState([]);
  const [staffList, setStaffList] = useState([]);

  // Search & filter
  const [teamSearch, setTeamSearch] = useState('');
  const [judgeSearch, setJudgeSearch] = useState('');
  const [activeTab, setActiveTab] = useState('judges'); // judges | teams

  // Drawer / Detail for a team
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [trailLoading, setTrailLoading] = useState(false);
  const [trailData, setTrailData] = useState(null);

  // Unlock modal
  const [unlockModal, setUnlockModal] = useState(null); // { evaluationId, judgeName, teamName }
  const [unlockReason, setUnlockReason] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  // Moderation state
  const [moderatingKey, setModeratingKey] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [progRes, assignRes, teamsRes, staffRes] = await Promise.all([
        api.get(`/admin/rounds/${roundId}/progress`),
        api.get(`/admin/rounds/${roundId}/assignments`),
        api.get(`/admin/rounds/${roundId}/assignable-teams`),
        api.get('/admin/staff/access').catch(() => ({ data: [] })),
      ]);
      setProgressData(progRes.data);
      setAssignments(assignRes.data || []);
      setAssignableTeams(teamsRes.data || []);
      setStaffList(staffRes.data || []);
    } catch (err) {
      console.error('Failed to load judging progress', err);
      addToast('Failed to load judging progress data', 'error');
    } finally {
      setLoading(false);
    }
  }, [roundId, addToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Load team trail
  const openTeamTrail = async (team) => {
    setSelectedTeam(team);
    setTrailLoading(true);
    try {
      const res = await api.get(`/admin/evaluations/team/${team.id}`);
      setTrailData(res.data);
    } catch (err) {
      console.error('Failed to fetch team trail', err);
      addToast('Failed to fetch team evaluation history', 'error');
      setTrailData(null);
    } finally {
      setTrailLoading(false);
    }
  };

  const handleUnlock = async (e) => {
    e.preventDefault();
    if (!unlockReason.trim()) {
      addToast('Mandatory unlock reason is required', 'error');
      return;
    }
    setUnlocking(true);
    try {
      await api.post(`/admin/evaluations/${unlockModal.evaluationId}/unlock`, {
        reason: unlockReason.trim(),
      });
      addToast('Evaluation successfully unlocked! Judge can now submit a revised draft.', 'success');
      setUnlockModal(null);
      setUnlockReason('');
      fetchData();
      if (selectedTeam) {
        openTeamTrail(selectedTeam);
      }
    } catch (err) {
      const d = err.response?.data?.detail;
      const msg = typeof d === 'string' ? d : d?.message || 'Failed to unlock evaluation';
      addToast(msg, 'error');
    } finally {
      setUnlocking(false);
    }
  };

  const handleToggleHideText = async (versionId, fieldId, currentlyHidden) => {
    const key = `${versionId}:${fieldId}`;
    setModeratingKey(key);
    try {
      const endpoint = currentlyHidden ? 'unhide' : 'hide';
      await api.post(`/admin/evaluation-texts/${versionId}/${fieldId}/${endpoint}`);
      addToast(currentlyHidden ? 'Comment unhidden from team' : 'Comment hidden from team', 'success');
      // Refresh trail
      if (selectedTeam) {
        const res = await api.get(`/admin/evaluations/team/${selectedTeam.id}`);
        setTrailData(res.data);
      }
    } catch (err) {
      addToast('Failed to toggle comment visibility', 'error');
    } finally {
      setModeratingKey(null);
    }
  };

  // Maps for quick lookup
  const staffById = {};
  staffList.forEach((s) => {
    const sId = s.volunteerId || s.id;
    if (sId) staffById[sId] = s;
  });
  const judgeNameFromAssignments = {};
  assignments.forEach((a) => {
    if (a.judgeVolunteerId && a.judgeName) {
      judgeNameFromAssignments[a.judgeVolunteerId] = a.judgeName;
    }
  });
  const teamById = {};
  assignableTeams.forEach((t) => {
    teamById[t.id] = t;
  });

  const perJudge = progressData?.perJudge || {};
  const perTeam = progressData?.perTeam || {};

  // Filtered judges
  const judgeIds = Object.keys(perJudge);
  const filteredJudgeIds = judgeIds.filter((jId) => {
    const name = perJudge[jId]?.name || staffById[jId]?.name || judgeNameFromAssignments[jId] || 'Judge';
    return name.toLowerCase().includes(judgeSearch.toLowerCase());
  });

  // Filtered teams
  const teamIds = Object.keys(perTeam);
  const filteredTeamIds = teamIds.filter((tId) => {
    const t = teamById[tId];
    const name = t?.name || 'Unknown Team';
    const reg = t?.registrationId || '';
    const q = teamSearch.toLowerCase();
    return name.toLowerCase().includes(q) || reg.toLowerCase().includes(q);
  });

  if (loading && !progressData) {
    return (
      <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <RefreshCw size={24} className="spin" style={{ marginBottom: '8px' }} />
        <div>Loading judging progress console...</div>
      </div>
    );
  }

  const overallPct = progressData?.overallPercentage || 0;
  const totalAssigned = progressData?.totalAssigned || 0;
  const totalSubmitted = progressData?.totalSubmitted || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner & KPI Metrics */}
      <div
        className="glass-card"
        style={{
          padding: '20px 24px',
          borderRadius: '12px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '20px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Judging Progress Console</h3>
            <span
              style={{
                fontSize: '0.75rem',
                padding: '3px 8px',
                borderRadius: '6px',
                background: 'rgba(59, 130, 246, 0.1)',
                color: 'var(--primary)',
                fontWeight: 700,
              }}
            >
              Live Monitor
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Track submissions, inspect revision trails, and unlock completed evaluations.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--primary)' }}>
              {overallPct}%
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {totalSubmitted} / {totalAssigned} Submissions
            </div>
          </div>

          <div
            style={{
              width: '120px',
              height: '8px',
              borderRadius: '4px',
              background: 'var(--border-color)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.min(overallPct, 100)}%`,
                height: '100%',
                background: overallPct === 100 ? '#22c55e' : 'var(--primary)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>

          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Tabs: By Judges vs By Teams */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-color)',
          gap: '8px',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('judges')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'transparent',
            fontSize: '0.88rem',
            fontWeight: 700,
            cursor: 'pointer',
            borderBottom: activeTab === 'judges' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'judges' ? 'var(--primary)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Award size={16} /> Progress by Judge ({judgeIds.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('teams')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'transparent',
            fontSize: '0.88rem',
            fontWeight: 700,
            cursor: 'pointer',
            borderBottom: activeTab === 'teams' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'teams' ? 'var(--primary)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Users size={16} /> Progress by Team ({teamIds.length})
        </button>
      </div>

      {/* Tab: By Judge */}
      {activeTab === 'judges' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: '340px' }}>
              <Search
                size={16}
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}
              />
              <input
                type="text"
                placeholder="Search judge by name..."
                value={judgeSearch}
                onChange={(e) => setJudgeSearch(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '32px', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          {filteredJudgeIds.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No judges found matching criteria.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
              {filteredJudgeIds.map((jId) => {
                const jStats = perJudge[jId];
                const judge = staffById[jId];
                const name = jStats?.name || judge?.name || judgeNameFromAssignments[jId] || 'Judge';
                const role = judge?.peopleRoles?.join(', ') || jStats?.type || judge?.type || 'Judge';
                const total = jStats.assigned || 0;
                const finals = jStats.finals || 0;
                const drafts = jStats.drafts || 0;
                const notStarted = jStats.notStarted || 0;
                const pct = total > 0 ? Math.round((finals / total) * 100) : 0;

                return (
                  <div
                    key={jId}
                    className="glass-card"
                    style={{
                      padding: '16px',
                      borderRadius: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{role}</div>
                      </div>
                      <span
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 800,
                          color: pct === 100 ? '#22c55e' : 'var(--primary)',
                        }}
                      >
                        {finals} / {total} ({pct}%)
                      </span>
                    </div>

                    {/* Multi-segment progress bar */}
                    <div
                      style={{
                        width: '100%',
                        height: '8px',
                        borderRadius: '4px',
                        background: 'var(--border-color)',
                        overflow: 'hidden',
                        display: 'flex',
                      }}
                    >
                      <div
                        title={`Completed: ${finals}`}
                        style={{
                          width: `${total > 0 ? (finals / total) * 100 : 0}%`,
                          background: '#22c55e',
                          height: '100%',
                        }}
                      />
                      <div
                        title={`In Draft: ${drafts}`}
                        style={{
                          width: `${total > 0 ? (drafts / total) * 100 : 0}%`,
                          background: '#f59e0b',
                          height: '100%',
                        }}
                      />
                      <div
                        title={`Not Started: ${notStarted}`}
                        style={{
                          width: `${total > 0 ? (notStarted / total) * 100 : 0}%`,
                          background: 'transparent',
                          height: '100%',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }} />
                        Final: {finals}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} />
                        Draft: {drafts}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-muted)' }} />
                        Pending: {notStarted}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: By Teams */}
      {activeTab === 'teams' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: '340px' }}>
              <Search
                size={16}
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}
              />
              <input
                type="text"
                placeholder="Search team by name or registration ID..."
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '32px', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          {filteredTeamIds.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No teams assigned in this round.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
              {filteredTeamIds.map((tId) => {
                const tStats = perTeam[tId];
                const team = teamById[tId] || { id: tId, name: 'Team ' + tId };
                const needed = tStats.needed || 0;
                const submitted = tStats.submitted || 0;
                const pct = needed > 0 ? Math.round((submitted / needed) * 100) : 0;
                const isComplete = needed > 0 && submitted >= needed;

                return (
                  <div
                    key={tId}
                    className="glass-card"
                    style={{
                      padding: '16px',
                      borderRadius: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      cursor: 'pointer',
                      border: selectedTeam?.id === tId ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                    }}
                    onClick={() => openTeamTrail(team)}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{team.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {team.registrationId ? `ID: ${team.registrationId}` : ''}
                          {team.podName ? ` · Pod: ${team.podName}` : ''}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: isComplete ? 'rgba(34, 197, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                          color: isComplete ? '#22c55e' : '#f59e0b',
                        }}
                      >
                        {submitted} / {needed} Judged
                      </span>
                    </div>

                    <div
                      style={{
                        width: '100%',
                        height: '6px',
                        borderRadius: '3px',
                        background: 'var(--border-color)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: isComplete ? '#22c55e' : 'var(--primary)',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--primary)' }}>
                      <span>Click to view evaluations & history</span>
                      <ChevronRight size={14} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Drawer / Evaluation History Modal for Selected Team */}
      {selectedTeam && (
        <Modal
          isOpen={true}
          onClose={() => {
            setSelectedTeam(null);
            setTrailData(null);
          }}
          title={`Evaluation Trail: ${selectedTeam.name}`}
          maxWidth="840px"
        >
          {trailLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <RefreshCw size={24} className="spin" style={{ marginBottom: '10px' }} />
              <div>Loading evaluation versions...</div>
            </div>
          ) : !trailData || trailData.evaluations?.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No evaluations started for this team yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {trailData.evaluations.map((ev) => {
                const latestVersion = ev.versions[ev.versions.length - 1];
                const hasFinal = ev.versions.some((v) => v.status === 'final');
                const hasDraft = ev.versions.some((v) => v.status === 'draft');
                const canUnlock = hasFinal && !hasDraft;

                return (
                  <div
                    key={ev.evaluationId}
                    className="glass-panel"
                    style={{
                      padding: '18px',
                      borderRadius: '12px',
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

                      {canUnlock && (
                        <button
                          type="button"
                          onClick={() =>
                            setUnlockModal({
                              evaluationId: ev.evaluationId,
                              judgeName: ev.judgeName,
                              teamName: selectedTeam.name,
                            })
                          }
                          className="btn btn-secondary"
                          style={{
                            fontSize: '0.78rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            color: '#f59e0b',
                            borderColor: 'rgba(245, 158, 11, 0.4)',
                          }}
                        >
                          <Unlock size={14} /> Unlock for Re-evaluation
                        </button>
                      )}
                    </div>

                    {/* Versions Timeline */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                              background: 'rgba(255, 255, 255, 0.03)',
                              border: '1px solid var(--border-color)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                                  Version {ver.version}
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
                                {ver.totalPct && (
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
                              <div style={{ marginTop: '6px' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                  Numeric Scores
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

                            {/* Diff Table: Texts & Moderation */}
                            {ver.diff?.texts && ver.diff.texts.length > 0 && (
                              <div style={{ marginTop: '8px' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                  Written Feedback & Comments
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  {ver.diff.texts.map((txtItem) => {
                                    const isStaffOnly = txtItem.audience === 'staff_only';
                                    const isHidden = Boolean(txtItem.hiddenByAdmin);
                                    const modKey = `${ver.id}:${txtItem.fieldId}`;

                                    return (
                                      <div
                                        key={txtItem.fieldId}
                                        style={{
                                          padding: '8px 12px',
                                          borderRadius: '6px',
                                          background: 'rgba(0,0,0,0.15)',
                                          border: '1px solid var(--border-color)',
                                          display: 'flex',
                                          alignItems: 'flex-start',
                                          justifyContent: 'space-between',
                                          gap: '12px',
                                        }}
                                      >
                                        <div style={{ flex: 1 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{txtItem.label}</span>
                                            <span
                                              style={{
                                                fontSize: '0.68rem',
                                                padding: '1px 6px',
                                                borderRadius: '4px',
                                                background: isStaffOnly ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                                                color: isStaffOnly ? '#ef4444' : 'var(--primary)',
                                              }}
                                            >
                                              {isStaffOnly ? 'Staff Only' : 'Participant Visible'}
                                            </span>
                                            {isHidden && (
                                              <span
                                                style={{
                                                  fontSize: '0.68rem',
                                                  padding: '1px 6px',
                                                  borderRadius: '4px',
                                                  background: 'rgba(239, 68, 68, 0.2)',
                                                  color: '#ef4444',
                                                  fontWeight: 700,
                                                }}
                                              >
                                                Hidden by Admin
                                              </span>
                                            )}
                                          </div>
                                          <p style={{ margin: 0, fontSize: '0.82rem', whiteSpace: 'pre-wrap', color: isHidden ? 'var(--text-muted)' : 'var(--text-main)' }}>
                                            {txtItem.after || <em>No feedback entered</em>}
                                          </p>
                                        </div>

                                        {/* Admin moderation eye toggle */}
                                        <button
                                          type="button"
                                          title={isHidden ? 'Unhide comment' : 'Hide comment from participants'}
                                          disabled={moderatingKey === modKey}
                                          onClick={() => handleToggleHideText(ver.id, txtItem.fieldId, isHidden)}
                                          className="btn btn-icon"
                                          style={{
                                            padding: '4px',
                                            color: isHidden ? '#ef4444' : 'var(--text-secondary)',
                                          }}
                                        >
                                          {isHidden ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                      </div>
                                    );
                                  })}
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
      )}

      {/* Unlock Confirmation Modal */}
      {unlockModal && (
        <Modal
          isOpen={true}
          onClose={() => {
            setUnlockModal(null);
            setUnlockReason('');
          }}
          title="Unlock Evaluation for Revision"
          maxWidth="480px"
        >
          <form onSubmit={handleUnlock} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '8px',
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                color: '#f59e0b',
                fontSize: '0.82rem',
                display: 'flex',
                gap: '10px',
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                Unlocking creates a new pre-filled draft version (v+1) for judge <strong>{unlockModal.judgeName}</strong> on team <strong>{unlockModal.teamName}</strong>. The existing submission stays counted in standings until the new version is submitted.
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                Reason for Unlock * <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(Audited)</span>
              </label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="e.g. Judge requested score correction for presentation marks."
                value={unlockReason}
                onChange={(e) => setUnlockReason(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setUnlockModal(null);
                  setUnlockReason('');
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={unlocking || !unlockReason.trim()}
                className="btn btn-primary"
                style={{ background: '#f59e0b', borderColor: '#f59e0b' }}
              >
                {unlocking ? 'Unlocking...' : 'Confirm & Unlock'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
