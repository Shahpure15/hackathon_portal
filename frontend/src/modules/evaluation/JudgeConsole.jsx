import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Award, CheckCircle, Clock, ChevronRight, ChevronLeft, ArrowLeft,
  Save, Send, ExternalLink, Code, FileText, AlertCircle, CheckCircle2,
  Lock, RefreshCw, Search, Sparkles, HelpCircle, AlertTriangle, Shield
} from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { judgeTotalPct } from './score';
import Modal from '../../components/Modal';

export default function JudgeConsole() {
  const { addToast } = useToast();

  // Navigation state
  const [level, setLevel] = useState(1); // 1: rounds list, 2: teams list, 3: scoring
  const [selectedRound, setSelectedRound] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);

  // Level 1: Rounds
  const [rounds, setRounds] = useState([]);
  const [roundsLoading, setRoundsLoading] = useState(true);

  // Level 2: Teams
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');

  // Level 3: Scoring Details
  const [teamDetail, setTeamDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [scores, setScores] = useState({});
  const [texts, setTexts] = useState({});
  const [concurrencyToken, setConcurrencyToken] = useState(null);
  const [evalStatus, setEvalStatus] = useState('not_started'); // not_started | draft | submitted

  // Autosave & Submit states
  const [saveStatus, setSaveStatus] = useState('saved'); // saved | saving | error | offline
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const autosaveTimeoutRef = useRef(null);
  const isInitialMountRef = useRef(true);

  // 1. Fetch Assigned Rounds
  const fetchRounds = useCallback(async () => {
    setRoundsLoading(true);
    try {
      const res = await api.get('/judge/rounds');
      setRounds(res.data || []);
      // If only 1 round available, auto-select it
      if (res.data?.length === 1 && level === 1) {
        selectRound(res.data[0]);
      }
    } catch (err) {
      console.error('Failed to load assigned rounds', err);
      addToast('Failed to load your assigned rounds', 'error');
    } finally {
      setRoundsLoading(false);
    }
  }, [addToast, level]);

  useEffect(() => {
    fetchRounds();
  }, [fetchRounds]);

  // 2. Select Round & Fetch Teams
  const selectRound = async (round) => {
    setSelectedRound(round);
    setLevel(2);
    setTeamsLoading(true);
    try {
      const res = await api.get(`/judge/rounds/${round.id}/teams`);
      setTeams(res.data || []);
    } catch (err) {
      console.error('Failed to fetch assigned teams', err);
      addToast('Failed to load teams for this round', 'error');
    } finally {
      setTeamsLoading(false);
    }
  };

  // 3. Select Team & Fetch Detail
  const selectTeam = async (team) => {
    setSelectedTeam(team);
    setLevel(3);
    setDetailLoading(true);
    isInitialMountRef.current = true;
    try {
      const res = await api.get(`/judge/rounds/${selectedRound.id}/teams/${team.teamId}`);
      const data = res.data;
      setTeamDetail(data);

      const mine = data.mine || {};
      setEvalStatus(mine.status || 'not_started');
      setConcurrencyToken(mine.token || null);

      // Check local storage backup if not submitted
      const storageKey = `judge_draft_${selectedRound.id}_${team.teamId}`;
      let initialScores = mine.scores || {};
      let initialTexts = mine.texts || {};

      if (mine.status !== 'submitted') {
        try {
          const cached = localStorage.getItem(storageKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.scores) initialScores = { ...initialScores, ...parsed.scores };
            if (parsed.texts) initialTexts = { ...initialTexts, ...parsed.texts };
          }
        } catch (e) {
          // ignore cache error
        }
      }

      setScores(initialScores);
      setTexts(initialTexts);
      setSaveStatus('saved');
    } catch (err) {
      console.error('Failed to fetch team scoring sheet', err);
      addToast('Failed to load scoring sheet', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  // Autosave logic
  const triggerAutosave = useCallback(
    (newScores, newTexts) => {
      if (!selectedRound || !selectedTeam || evalStatus === 'submitted') return;

      // Save immediately to localStorage safety copy
      const storageKey = `judge_draft_${selectedRound.id}_${selectedTeam.teamId}`;
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            scores: newScores,
            texts: newTexts,
            timestamp: Date.now(),
          })
        );
      } catch (e) {
        // storage quota exceeded or disabled
      }

      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }

      setSaveStatus('saving');

      autosaveTimeoutRef.current = setTimeout(async () => {
        try {
          const res = await api.put(
            `/judge/rounds/${selectedRound.id}/teams/${selectedTeam.teamId}/draft`,
            {
              scores: newScores,
              texts: newTexts,
              token: concurrencyToken,
            }
          );
          if (res.data?.token) {
            setConcurrencyToken(res.data.token);
          }
          setSaveStatus('saved');
          setEvalStatus('draft');
        } catch (err) {
          if (err.response?.status === 409) {
            setSaveStatus('conflict');
            addToast('Evaluation was updated in another session or window.', 'error');
          } else {
            setSaveStatus('offline');
          }
        }
      }, 800);
    },
    [selectedRound, selectedTeam, evalStatus, concurrencyToken, addToast]
  );

  const handleScoreChange = (fieldId, val, maxMarks) => {
    if (evalStatus === 'submitted') return;
    let numVal = val === '' ? null : Number(val);
    if (numVal !== null && !isNaN(numVal)) {
      if (numVal < 0) numVal = 0;
      if (numVal > maxMarks) numVal = maxMarks;
    }
    const updated = { ...scores, [fieldId]: numVal };
    setScores(updated);
    triggerAutosave(updated, texts);
  };

  const handleTextChange = (fieldId, val, maxLength) => {
    if (evalStatus === 'submitted') return;
    let strVal = val;
    if (maxLength && strVal.length > maxLength) {
      strVal = strVal.slice(0, maxLength);
    }
    const updated = { ...texts, [fieldId]: strVal };
    setTexts(updated);
    triggerAutosave(scores, updated);
  };

  // Submit Final Evaluation
  const handleSubmitEvaluation = async () => {
    if (!selectedRound || !selectedTeam) return;

    // Validate that all required numeric criteria have scores
    const numericFields = (teamDetail?.rubric?.fields || []).filter((f) => f.type === 'numeric');
    for (const f of numericFields) {
      const v = scores[f.id];
      if (v === undefined || v === null || v === '' || isNaN(v)) {
        addToast(`Please score criterion: "${f.label}"`, 'error');
        setSubmitConfirmOpen(false);
        return;
      }
    }

    // Validate required text criteria
    const textFields = (teamDetail?.rubric?.fields || []).filter((f) => f.type === 'text' && f.isRequired);
    for (const f of textFields) {
      const t = (texts[f.id] || '').trim();
      if (!t) {
        addToast(`Feedback for "${f.label}" is required.`, 'error');
        setSubmitConfirmOpen(false);
        return;
      }
    }

    setSubmitting(true);
    try {
      // First ensure latest draft is pushed
      await api.put(`/judge/rounds/${selectedRound.id}/teams/${selectedTeam.teamId}/draft`, {
        scores,
        texts,
        token: concurrencyToken,
      });

      // Submit
      const res = await api.post(
        `/judge/rounds/${selectedRound.id}/teams/${selectedTeam.teamId}/submit`,
        {
          token: concurrencyToken,
        }
      );

      setEvalStatus('submitted');
      setSubmitConfirmOpen(false);
      addToast(`Evaluation submitted successfully! Final score: ${res.data.totalPct}%`, 'success');

      // Clear local draft safety copy
      const storageKey = `judge_draft_${selectedRound.id}_${selectedTeam.teamId}`;
      localStorage.removeItem(storageKey);

      // Refresh team detail
      const refreshed = await api.get(`/judge/rounds/${selectedRound.id}/teams/${selectedTeam.teamId}`);
      setTeamDetail(refreshed.data);
      if (refreshed.data?.mine) {
        setConcurrencyToken(refreshed.data.mine.token);
      }
    } catch (err) {
      const d = err.response?.data?.detail;
      const msg = typeof d === 'string' ? d : d?.message || 'Failed to submit evaluation';
      addToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Compute live score using score.js
  const liveTotalScore = (() => {
    if (!teamDetail?.rubric?.fields) return null;
    const numericFields = teamDetail.rubric.fields.filter((f) => f.type === 'numeric');
    if (numericFields.length === 0) return null;

    try {
      const cleanMarks = {};
      let allFilled = true;
      for (const f of numericFields) {
        const v = scores[f.id];
        if (v === undefined || v === null || v === '' || isNaN(v)) {
          allFilled = false;
        } else {
          cleanMarks[f.id] = Number(v);
        }
      }
      if (allFilled) {
        return judgeTotalPct(numericFields, cleanMarks);
      }
    } catch (e) {
      return null;
    }
    return null;
  })();

  // ----------------------------------------------------
  // LEVEL 1: ROUNDS VIEW
  // ----------------------------------------------------
  if (level === 1) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="glass-card" style={{ padding: '20px 24px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Award size={22} style={{ color: 'var(--primary)' }} />
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Assigned Evaluation Rounds</h3>
          </div>
          <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Select an active evaluation round to review submissions and score your assigned teams.
          </p>
        </div>

        {roundsLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <RefreshCw size={24} className="spin" style={{ marginBottom: '8px' }} />
            <div>Loading your assigned rounds...</div>
          </div>
        ) : rounds.length === 0 ? (
          <div className="glass-panel" style={{ padding: '36px', textAlign: 'center', borderRadius: '12px' }}>
            <AlertCircle size={32} style={{ color: 'var(--text-muted)', marginBottom: '10px' }} />
            <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem' }}>No Active Rounds Assigned</h4>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
              You do not have any active team judging assignments for live rounds right now. Please check with an event administrator.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {rounds.map((r) => {
              const assigned = r.assigned || 0;
              const submitted = r.submitted || 0;
              const pct = assigned > 0 ? Math.round((submitted / assigned) * 100) : 0;
              const isDone = assigned > 0 && submitted >= assigned;

              return (
                <div
                  key={r.id}
                  className="glass-card"
                  style={{
                    padding: '20px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                  }}
                  onClick={() => selectRound(r)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{r.name}</h4>
                      {r.description && (
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {r.description}
                        </p>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: isDone ? 'rgba(34, 197, 94, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                        color: isDone ? '#22c55e' : 'var(--primary)',
                      }}
                    >
                      {submitted} / {assigned} Complete
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
                        background: isDone ? '#22c55e' : 'var(--primary)',
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.8rem',
                      color: 'var(--primary)',
                      fontWeight: 600,
                      marginTop: '4px',
                    }}
                  >
                    <span>View Assigned Teams ({assigned})</span>
                    <ChevronRight size={16} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ----------------------------------------------------
  // LEVEL 2: TEAMS VIEW FOR SELECTED ROUND
  // ----------------------------------------------------
  if (level === 2) {
    const filteredTeams = teams.filter((t) => {
      const q = teamSearch.toLowerCase();
      const n = (t.name || '').toLowerCase();
      const r = (t.registrationId || '').toLowerCase();
      const ps = (t.psTitle || '').toLowerCase();
      return n.includes(q) || r.includes(q) || ps.includes(q);
    });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Top Breadcrumb & Nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <button
            type="button"
            onClick={() => setLevel(1)}
            className="btn btn-secondary"
            style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowLeft size={14} /> Back to Rounds
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{selectedRound.name}</span>
            <span
              style={{
                fontSize: '0.75rem',
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(59, 130, 246, 0.1)',
                color: 'var(--primary)',
                fontWeight: 700,
              }}
            >
              {teams.filter((t) => t.status === 'submitted').length} / {teams.length} Scored
            </span>
          </div>
        </div>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '380px' }}>
            <Search
              size={16}
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY-50%', color: 'var(--text-secondary)' }}
            />
            <input
              type="text"
              placeholder="Search team name, registration ID, or problem..."
              value={teamSearch}
              onChange={(e) => setTeamSearch(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '32px', fontSize: '0.85rem' }}
            />
          </div>
        </div>

        {teamsLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <RefreshCw size={24} className="spin" style={{ marginBottom: '8px' }} />
            <div>Loading assigned teams...</div>
          </div>
        ) : filteredTeams.length === 0 ? (
          <div className="glass-panel" style={{ padding: '30px', textAlign: 'center', borderRadius: '12px' }}>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>No teams found matching your search filter.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
            {filteredTeams.map((t) => {
              const statusColors = {
                not_started: { bg: 'rgba(156, 163, 175, 0.1)', fg: 'var(--text-muted)', label: 'Not Started' },
                draft: { bg: 'rgba(245, 158, 11, 0.1)', fg: '#f59e0b', label: 'In Draft' },
                submitted: { bg: 'rgba(34, 197, 94, 0.1)', fg: '#22c55e', label: 'Submitted' },
              };
              const sc = statusColors[t.status] || statusColors.not_started;

              return (
                <div
                  key={t.teamId}
                  className="glass-card"
                  style={{
                    padding: '16px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                  onClick={() => selectTeam(t)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.96rem' }}>{t.name}</div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                        {t.registrationId ? `ID: ${t.registrationId}` : ''}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: sc.bg,
                        color: sc.fg,
                      }}
                    >
                      {sc.label}
                    </span>
                  </div>

                  {t.psTitle && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      <strong>PS:</strong> {t.psTitle}
                    </div>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.78rem',
                      color: 'var(--primary)',
                      marginTop: '4px',
                    }}
                  >
                    <span>
                      {t.status === 'submitted' && t.myTotalPct !== null ? (
                        <strong style={{ color: '#22c55e' }}>Score: {t.myTotalPct}%</strong>
                      ) : (
                        'Score this team'
                      )}
                    </span>
                    <ChevronRight size={14} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ----------------------------------------------------
  // LEVEL 3: SCORING SCREEN FOR SELECTED TEAM
  // ----------------------------------------------------
  if (detailLoading && !teamDetail) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <RefreshCw size={24} className="spin" style={{ marginBottom: '8px' }} />
        <div>Loading rubric and evaluation sheet...</div>
      </div>
    );
  }

  const isLocked = evalStatus === 'submitted';
  const rubricFields = teamDetail?.rubric?.fields || [];
  const numericFields = rubricFields.filter((f) => f.type === 'numeric');
  const textFields = rubricFields.filter((f) => f.type === 'text');
  const submission = teamDetail?.submission || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '90px' }}>
      {/* Top Header & Breadcrumb */}
      <div
        className="glass-card"
        style={{
          padding: '16px 20px',
          borderRadius: '12px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            type="button"
            onClick={() => setLevel(2)}
            className="btn btn-secondary"
            style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowLeft size={14} /> Back to Teams
          </button>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>{teamDetail?.name}</h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {teamDetail?.registrationId ? `Registration: ${teamDetail.registrationId}` : ''}
              {teamDetail?.psTitle ? ` · ${teamDetail.psTitle}` : ''}
            </span>
          </div>
        </div>

        {/* Status & Autosave Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isLocked ? (
            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '6px',
                background: 'rgba(34, 197, 94, 0.1)',
                color: '#22c55e',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Lock size={14} /> Submitted & Locked
            </span>
          ) : (
            <span
              style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                color:
                  saveStatus === 'saving'
                    ? '#f59e0b'
                    : saveStatus === 'conflict'
                    ? '#ef4444'
                    : saveStatus === 'offline'
                    ? '#f59e0b'
                    : 'var(--text-secondary)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {saveStatus === 'saving' && <RefreshCw size={12} className="spin" />}
              {saveStatus === 'saved' && <CheckCircle size={12} style={{ color: '#22c55e' }} />}
              {saveStatus === 'conflict' && <AlertTriangle size={12} style={{ color: '#ef4444' }} />}
              {saveStatus === 'offline' && <AlertCircle size={12} style={{ color: '#f59e0b' }} />}
              {saveStatus === 'saving'
                ? 'Autosaving...'
                : saveStatus === 'conflict'
                ? 'Edit conflict'
                : saveStatus === 'offline'
                ? 'Offline backup saved'
                : 'All changes saved'}
            </span>
          )}
        </div>
      </div>

      {/* Locked Evaluation Notification */}
      {isLocked && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            background: 'rgba(34, 197, 94, 0.08)',
            border: '1px solid rgba(34, 197, 94, 0.25)',
            color: '#22c55e',
            fontSize: '0.84rem',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
          <div>
            <strong>Evaluation submitted and finalized.</strong> Your scores are saved in the competition records. If you need to make changes, please request an administrator to unlock this team for revision.
          </div>
        </div>
      )}

      {/* Submission Materials Accordion / Links */}
      {(submission.githubLink || submission.driveLink || submission.answers) && (
        <div
          className="glass-panel"
          style={{
            padding: '16px 20px',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '0.88rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={16} color="var(--primary)" /> Team Submission Deliverables
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {submission.githubLink && (
              <a
                href={submission.githubLink}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Code size={14} /> Repository Link <ExternalLink size={12} />
              </a>
            )}

            {submission.driveLink && (
              <a
                href={submission.driveLink}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <ExternalLink size={14} /> Presentation / Drive Link
              </a>
            )}
          </div>

          {submission.answers && Object.keys(submission.answers).length > 0 && (
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {Object.entries(submission.answers).map(([key, val]) => (
                <div key={key} style={{ fontSize: '0.8rem' }}>
                  <strong style={{ color: 'var(--text-secondary)' }}>{key}: </strong>
                  <span>{String(val)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Scoring Section: Numeric Criteria */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={16} color="var(--primary)" /> Numeric Scoring Criteria
        </h4>

        {numericFields.map((field, idx) => {
          const val = scores[field.id];
          const maxMarks = Number(field.maxMarks) || 10;
          const weight = Number(field.weight) || 0;
          const anchors = Array.isArray(field.anchors) ? field.anchors : [];

          return (
            <div
              key={field.id}
              className="glass-card"
              style={{
                padding: '18px 20px',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.98rem' }}>
                    {idx + 1}. {field.label}
                  </div>
                  {field.description && (
                    <p style={{ margin: '3px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      {field.description}
                    </p>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: 'rgba(59, 130, 246, 0.1)',
                      color: 'var(--primary)',
                      fontWeight: 700,
                    }}
                  >
                    Weight: {weight}%
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Max: {maxMarks}
                  </span>
                </div>
              </div>

              {/* Stepper & Number Input */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    disabled={isLocked || val === 0}
                    onClick={() => handleScoreChange(field.id, Math.max(0, (Number(val) || 0) - 1), maxMarks)}
                    className="btn btn-secondary"
                    style={{ width: '36px', height: '36px', padding: 0, fontSize: '1.2rem', fontWeight: 700 }}
                  >
                    -
                  </button>

                  <input
                    type="number"
                    min="0"
                    max={maxMarks}
                    step="0.5"
                    disabled={isLocked}
                    value={val !== null && val !== undefined ? val : ''}
                    onChange={(e) => handleScoreChange(field.id, e.target.value, maxMarks)}
                    className="form-input"
                    placeholder="0"
                    style={{
                      width: '80px',
                      textAlign: 'center',
                      fontSize: '1.1rem',
                      fontWeight: 800,
                      color: 'var(--primary)',
                    }}
                  />

                  <button
                    type="button"
                    disabled={isLocked || val === maxMarks}
                    onClick={() => handleScoreChange(field.id, Math.min(maxMarks, (Number(val) || 0) + 1), maxMarks)}
                    className="btn btn-secondary"
                    style={{ width: '36px', height: '36px', padding: 0, fontSize: '1.2rem', fontWeight: 700 }}
                  >
                    +
                  </button>
                </div>

                {/* Quick Benchmark Anchors */}
                {anchors.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginLeft: 'auto' }}>
                    {anchors.map((anc, aIdx) => {
                      const targetScore = anc.to !== undefined ? anc.to : anc.score;
                      return (
                        <button
                          key={aIdx}
                          type="button"
                          disabled={isLocked}
                          onClick={() => handleScoreChange(field.id, targetScore, maxMarks)}
                          style={{
                            fontSize: '0.74rem',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            background:
                              Number(val) === Number(targetScore)
                                ? 'var(--primary)'
                                : 'rgba(255, 255, 255, 0.03)',
                            color:
                              Number(val) === Number(targetScore)
                                ? '#ffffff'
                                : 'var(--text-secondary)',
                            cursor: isLocked ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          {anc.label} ({targetScore})
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scoring Section: Text Qualitative Criteria */}
      {textFields.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={16} color="var(--primary)" /> Written Feedback & Observations
          </h4>

          {textFields.map((field) => {
            const val = texts[field.id] || '';
            const maxLength = field.maxLength || 500;
            const isStaffOnly = field.audience === 'staff';

            return (
              <div
                key={field.id}
                className="glass-card"
                style={{
                  padding: '18px 20px',
                  borderRadius: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                      {field.label} {field.isRequired && <span style={{ color: '#ef4444' }}>*</span>}
                    </div>
                    {field.description && (
                      <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {field.description}
                      </p>
                    )}
                  </div>

                  <span
                    style={{
                      fontSize: '0.72rem',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: isStaffOnly ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                      color: isStaffOnly ? '#ef4444' : 'var(--primary)',
                      fontWeight: 700,
                    }}
                  >
                    {isStaffOnly ? 'Internal Staff Only' : 'Shared with Participants'}
                  </span>
                </div>

                <textarea
                  rows={3}
                  disabled={isLocked}
                  maxLength={maxLength}
                  value={val}
                  onChange={(e) => handleTextChange(field.id, e.target.value, maxLength)}
                  placeholder="Enter comments and observations..."
                  className="form-input"
                  style={{ fontSize: '0.88rem' }}
                />

                <div style={{ textAlign: 'right', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {val.length} / {maxLength} characters
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sticky Bottom Actions Bar */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--border-color)',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 100,
          boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>
              Calculated Total
            </span>
            <span style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--primary)' }}>
              {liveTotalScore !== null ? `${liveTotalScore}%` : isLocked && teamDetail?.mine?.totalPct ? `${teamDetail.mine.totalPct}%` : '--'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {!isLocked && (
            <button
              type="button"
              onClick={() => setSubmitConfirmOpen(true)}
              disabled={submitting}
              className="btn btn-primary"
              style={{
                fontSize: '0.9rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 22px',
              }}
            >
              <Send size={16} /> Submit Evaluation
            </button>
          )}

          {isLocked && (
            <span style={{ fontSize: '0.82rem', color: '#22c55e', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={16} /> Finalized
            </span>
          )}
        </div>
      </div>

      {/* Submit Confirmation Modal */}
      {submitConfirmOpen && (
        <Modal
          isOpen={true}
          onClose={() => setSubmitConfirmOpen(false)}
          title="Submit Final Evaluation"
          maxWidth="460px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '8px',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                color: 'var(--primary)',
                fontSize: '0.84rem',
                display: 'flex',
                gap: '10px',
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                Submitting locks your evaluation for <strong>{teamDetail?.name}</strong>. After submitting, scores can only be edited if an administrator unlocks them.
              </div>
            </div>

            {liveTotalScore !== null && (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block' }}>
                  Total Evaluation Score
                </span>
                <span style={{ fontSize: '2rem', fontWeight: 800, color: '#22c55e' }}>
                  {liveTotalScore}%
                </span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSubmitConfirmOpen(false)}
              >
                Continue Editing
              </button>
              <button
                type="button"
                disabled={submitting}
                className="btn btn-primary"
                onClick={handleSubmitEvaluation}
                style={{ background: '#22c55e', borderColor: '#22c55e' }}
              >
                {submitting ? 'Submitting...' : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
