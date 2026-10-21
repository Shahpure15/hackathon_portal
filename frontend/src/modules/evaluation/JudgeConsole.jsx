import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Award, CheckCircle, Clock, ChevronRight, ChevronLeft, ArrowLeft,
  Save, Send, ExternalLink, Code, FileText, AlertCircle, CheckCircle2,
  Lock, RefreshCw, Search, Sparkles, HelpCircle, AlertTriangle, Shield,
  Target, Layers
} from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { judgeTotalPct } from './score';
import Modal from '../../components/Modal';

function formatPsBadge(psCode) {
  if (!psCode) return '';
  const match = String(psCode).match(/\d+/);
  const num = match ? parseInt(match[0], 10) : '';
  return num ? `PS ${num} (${psCode})` : psCode;
}

export default function JudgeConsole() {
  const { addToast } = useToast();

  // Navigation state
  const [level, setLevel] = useState(1); // 1: rounds list, 2: teams list, 3: scoring
  const [selectedRound, setSelectedRound] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);

  // Mobile states
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  const [mobileStep, setMobileStep] = useState('overview'); // 'overview' | 'secA' | 'secB' | 'review' | 'all'

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Level 1: Rounds
  const [rounds, setRounds] = useState([]);
  const [roundsLoading, setRoundsLoading] = useState(true);

  // Level 2: Teams
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');

  // Level 3: Scoring Details
  const [teamDetail, setTeamDetail] = useState(null);
  const [teamError, setTeamError] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [scores, setScores] = useState({});
  const [texts, setTexts] = useState({});
  const [concurrencyToken, setConcurrencyToken] = useState(null);
  const concurrencyTokenRef = useRef(null);
  const [evalStatus, setEvalStatus] = useState('not_started'); // not_started | draft | submitted

  const updateConcurrencyToken = (token) => {
    concurrencyTokenRef.current = token;
    setConcurrencyToken(token);
  };

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
      if (err.response?.status === 403) {
        setRounds([]);
      } else {
        addToast('Failed to load your assigned rounds', 'error');
      }
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
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }
    setSelectedTeam(team);
    setLevel(3);
    setMobileStep('overview');
    setDetailLoading(true);
    setTeamDetail(null);
    setScores({});
    setTexts({});
    setTeamError(null);
    isInitialMountRef.current = true;
    try {
      const res = await api.get(`/judge/rounds/${selectedRound.id}/teams/${team.teamId}`);
      const data = res.data;
      setTeamDetail(data);

      const mine = data.mine || {};
      setEvalStatus(mine.status || 'not_started');
      updateConcurrencyToken(mine.token || null);

      // Check local storage backup if not submitted
      const storageKey = `judge_draft_${selectedRound.id}_${team.teamId}`;
      let initialScores = mine.scores || {};
      let initialTexts = mine.texts || {};

      let restoredFromCache = false;
      if (mine.status !== 'submitted') {
        try {
          const cached = localStorage.getItem(storageKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.scores && Object.keys(parsed.scores).length > 0) {
              initialScores = { ...initialScores, ...parsed.scores };
              restoredFromCache = true;
            }
            if (parsed.texts && Object.keys(parsed.texts).length > 0) {
              initialTexts = { ...initialTexts, ...parsed.texts };
              restoredFromCache = true;
            }
          }
        } catch (e) {
          // ignore cache error
        }
      }

      setScores(initialScores);
      setTexts(initialTexts);
      setSaveStatus('saved');
      if (restoredFromCache) {
        addToast('Restored draft scores from local safety backup.', 'info');
      }
    } catch (err) {
      console.error('Failed to fetch team scoring sheet', err);
      if (err.response?.status === 409) {
        setTeamError(err.response?.data?.detail || 'This team has no problem statement assigned.');
      } else {
        addToast('Failed to load scoring sheet', 'error');
      }
    } finally {
      setDetailLoading(false);
    }
  };

  // Return to Level 2 (Teams List) with fresh updated data from server
  const returnToTeams = async () => {
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }
    setLevel(2);
    setSelectedTeam(null);
    setTeamDetail(null);
    setTeamError(null);
    setScores({});
    setTexts({});
    if (selectedRound?.id) {
      setTeamsLoading(true);
      try {
        const res = await api.get(`/judge/rounds/${selectedRound.id}/teams`);
        setTeams(res.data || []);
      } catch (err) {
        console.error('Failed to refresh assigned teams', err);
      } finally {
        setTeamsLoading(false);
      }
    }
  };

  // Return to Level 1 (Rounds List) with fresh updated data from server
  const returnToRounds = async () => {
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }
    setLevel(1);
    setSelectedRound(null);
    setSelectedTeam(null);
    setTeamDetail(null);
    setTeamError(null);
    setTeams([]);
    setScores({});
    setTexts({});
    fetchRounds();
  };

  // Manual refresh for current teams list
  const refreshTeams = async () => {
    if (!selectedRound?.id) return;
    setTeamsLoading(true);
    try {
      const res = await api.get(`/judge/rounds/${selectedRound.id}/teams`);
      setTeams(res.data || []);
      addToast('Teams list refreshed', 'info');
    } catch (err) {
      console.error('Failed to refresh assigned teams', err);
      addToast('Failed to refresh teams list', 'error');
    } finally {
      setTeamsLoading(false);
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
              token: concurrencyTokenRef.current,
            }
          );
          if (res.data?.token) {
            updateConcurrencyToken(res.data.token);
          }
          setSaveStatus('saved');
          setEvalStatus('draft');
        } catch (err) {
          if (err.response?.status === 409) {
            setSaveStatus('conflict');
            // Recover latest token from server
            try {
              const latest = await api.get(`/judge/rounds/${selectedRound.id}/teams/${selectedTeam.teamId}`);
              if (latest.data?.mine?.token) {
                updateConcurrencyToken(latest.data.mine.token);
              }
            } catch (syncErr) {
              // ignore
            }
            addToast('Draft synchronized with server.', 'info');
          } else {
            setSaveStatus('offline');
          }
        }
      }, 800);
    },
    [selectedRound, selectedTeam, evalStatus, addToast]
  );

  const handleManualSync = async () => {
    if (!selectedRound || !selectedTeam || evalStatus === 'submitted') return;
    setSaveStatus('saving');
    try {
      let tokenToUse = concurrencyTokenRef.current;
      if (!tokenToUse) {
        try {
          const check = await api.get(`/judge/rounds/${selectedRound.id}/teams/${selectedTeam.teamId}`);
          if (check.data?.mine?.token) {
            tokenToUse = check.data.mine.token;
            updateConcurrencyToken(tokenToUse);
          }
        } catch (e) {}
      }
      const res = await api.put(
        `/judge/rounds/${selectedRound.id}/teams/${selectedTeam.teamId}/draft`,
        {
          scores,
          texts,
          token: tokenToUse,
        }
      );
      if (res.data?.token) {
        updateConcurrencyToken(res.data.token);
      }
      setSaveStatus('saved');
      setEvalStatus('draft');
      addToast('Draft synchronized and stored safely on server!', 'success');
    } catch (err) {
      if (err.response?.status === 409) {
        setSaveStatus('conflict');
        try {
          const latest = await api.get(`/judge/rounds/${selectedRound.id}/teams/${selectedTeam.teamId}`);
          if (latest.data?.mine?.token) {
            updateConcurrencyToken(latest.data.mine.token);
          }
        } catch (syncErr) {}
        addToast('Draft synchronized with server.', 'info');
      } else {
        setSaveStatus('offline');
        addToast('Offline: Scores are securely preserved in your browser draft.', 'warning');
      }
    }
  };

  const handleScoreChange = (fieldId, val, maxMarks) => {
    if (evalStatus === 'submitted') return;
    let numVal = val === '' ? null : Math.round(Number(val));
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
      const draftRes = await api.put(`/judge/rounds/${selectedRound.id}/teams/${selectedTeam.teamId}/draft`, {
        scores,
        texts,
        token: concurrencyTokenRef.current,
      });

      const nextToken = draftRes.data?.token || concurrencyTokenRef.current;
      updateConcurrencyToken(nextToken);

      // Submit with the fresh token returned by draft
      const res = await api.post(
        `/judge/rounds/${selectedRound.id}/teams/${selectedTeam.teamId}/submit`,
        {
          token: nextToken,
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
        updateConcurrencyToken(refreshed.data.mine.token);
      }

      // Optimistically update teams list and background refresh
      setTeams((prev) =>
        prev.map((t) =>
          t.teamId === selectedTeam.teamId
            ? { ...t, status: 'submitted', totalPct: res.data?.totalPct }
            : t
        )
      );
      if (selectedRound?.id) {
        api.get(`/judge/rounds/${selectedRound.id}/teams`).then((r) => setTeams(r.data || [])).catch(() => {});
      }
    } catch (err) {
      if (err.response?.status === 409) {
        try {
          const latest = await api.get(`/judge/rounds/${selectedRound.id}/teams/${selectedTeam.teamId}`);
          if (latest.data?.mine?.token) {
            updateConcurrencyToken(latest.data.mine.token);
          }
        } catch (syncErr) {
          // ignore
        }
      }
      const d = err.response?.data?.detail;
      const msg = typeof d === 'string' ? d : d?.message || 'Failed to submit evaluation';
      addToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Group criteria and compute live subtotals
  const secAFields = useMemo(() => {
    return (teamDetail?.rubric?.fields || []).filter(
      (f) => f.type === 'numeric' && (f.section === 'A' || f.problemStatementId != null)
    );
  }, [teamDetail]);

  const secBFields = useMemo(() => {
    return (teamDetail?.rubric?.fields || []).filter(
      (f) => f.type === 'numeric' && (f.section === 'B' || !f.problemStatementId)
    );
  }, [teamDetail]);

  const hasMultiPsSections = secAFields.length > 0;

  const {
    secASubtotal,
    secBSubtotal,
    secAScoredCount,
    secBScoredCount,
    secATotalCount,
    secBTotalCount,
    liveTotalScore,
    allFilled,
  } = useMemo(() => {
    if (!teamDetail?.rubric?.fields) {
      return {
        secASubtotal: 0,
        secBSubtotal: 0,
        secAScoredCount: 0,
        secBScoredCount: 0,
        secATotalCount: 0,
        secBTotalCount: 0,
        liveTotalScore: null,
        allFilled: false,
      };
    }
    const numFields = teamDetail.rubric.fields.filter((f) => f.type === 'numeric');
    if (numFields.length === 0) {
      return {
        secASubtotal: 0,
        secBSubtotal: 0,
        secAScoredCount: 0,
        secBScoredCount: 0,
        secATotalCount: 0,
        secBTotalCount: 0,
        liveTotalScore: null,
        allFilled: false,
      };
    }

    let aSub = 0;
    let bSub = 0;
    let aScored = 0;
    let bScored = 0;
    let aTotal = 0;
    let bTotal = 0;
    const cleanMarks = {};
    let filled = true;

    for (const f of numFields) {
      const isSecA = f.section === 'A' || f.problemStatementId != null;
      if (isSecA) aTotal++;
      else bTotal++;

      const v = scores[f.id];
      if (v === undefined || v === null || v === '' || isNaN(v)) {
        filled = false;
      } else {
        const valNum = Number(v);
        cleanMarks[f.id] = valNum;
        if (isSecA) {
          aSub += valNum;
          aScored++;
        } else {
          bSub += valNum;
          bScored++;
        }
      }
    }

    let total = null;
    if (filled) {
      try {
        total = judgeTotalPct(numFields, cleanMarks);
      } catch (e) {
        total = null;
      }
    }
    return {
      secASubtotal: aSub,
      secBSubtotal: bSub,
      secAScoredCount: aScored,
      secBScoredCount: bScored,
      secATotalCount: aTotal,
      secBTotalCount: bTotal,
      liveTotalScore: total,
      allFilled: filled,
    };
  }, [teamDetail, scores]);

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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '16px' }}>
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
            onClick={returnToRounds}
            className="btn btn-secondary touch-target"
            style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowLeft size={14} /> Back to Rounds
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>{selectedRound.name}</span>
            <span
              style={{
                fontSize: '0.75rem',
                padding: '3px 10px',
                borderRadius: '6px',
                background: 'rgba(59, 130, 246, 0.12)',
                color: 'var(--primary)',
                fontWeight: 700,
              }}
            >
              {teams.filter((t) => t.status === 'submitted').length} / {teams.length} Scored
            </span>
            <button
              type="button"
              onClick={refreshTeams}
              disabled={teamsLoading}
              className="btn btn-secondary touch-target"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '4px 10px' }}
              title="Refresh Teams List"
            >
              <RefreshCw size={13} className={teamsLoading ? 'spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '440px', width: '100%' }}>
            <Search
              size={16}
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: '14px' }}>
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
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  }}
                  onClick={() => selectTeam(t)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.98rem' }}>{t.name}</div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
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
                        flexShrink: 0,
                      }}
                    >
                      {sc.label}
                    </span>
                  </div>

                  {(t.psCode || t.psTitle) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {t.psCode && (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              padding: '2px 7px',
                              borderRadius: '4px',
                              background: 'rgba(217, 119, 6, 0.12)',
                              color: '#b45309',
                              border: '1px solid rgba(217, 119, 6, 0.25)',
                              letterSpacing: '0.02em',
                            }}
                          >
                            {formatPsBadge(t.psCode)}
                          </span>
                        )}
                        {t.psTitle && (
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {t.psTitle}
                          </span>
                        )}
                      </div>
                      {t.psDescription && (
                        <div
                          style={{
                            fontSize: '0.76rem',
                            color: 'var(--text-secondary)',
                            lineHeight: 1.4,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {t.psDescription}
                        </div>
                      )}
                    </div>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.78rem',
                      color: 'var(--primary)',
                      marginTop: 'auto',
                      paddingTop: '6px',
                      borderTop: '1px solid var(--border-color)',
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
  if (teamError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '40px' }}>
        <button
          type="button"
          onClick={returnToTeams}
          className="btn btn-secondary"
          style={{ width: 'fit-content', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <ArrowLeft size={14} /> Back to Teams
        </button>

        <div
          className="glass-card"
          style={{
            padding: '24px',
            borderRadius: '12px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '14px',
          }}
        >
          <AlertCircle size={24} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Cannot Load Rubric for this Team</h4>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
              {teamError}
            </p>
            <p style={{ margin: '8px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Multi-PS evaluation requires each team to be linked to a Problem Statement. Please notify an administrator or event lead to assign the problem statement in the admin panel.
            </p>
          </div>
        </div>
      </div>
    );
  }

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
  const textFields = rubricFields.filter((f) => f.type === 'text');
  const submission = teamDetail?.submission || {};

  const showOverview = !isMobile || !hasMultiPsSections || mobileStep === 'overview' || mobileStep === 'all';
  const showSecA = !isMobile || (hasMultiPsSections && (mobileStep === 'secA' || mobileStep === 'all'));
  const showSecB = !isMobile || (hasMultiPsSections && (mobileStep === 'secB' || mobileStep === 'all'));
  const showFeedback = !isMobile || !hasMultiPsSections || mobileStep === 'review' || mobileStep === 'all';

  const renderCriterionCard = (field, idx) => {
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
            <div style={{ fontWeight: 700, fontSize: '0.98rem', display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
              <span style={{ color: '#ef4444', fontWeight: 800, fontSize: '1.05rem', lineHeight: 1 }} title="Required">*</span>
              <span>{idx + 1}. {field.label}</span>
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
                background: field.problemStatementId ? 'rgba(217, 119, 6, 0.12)' : 'rgba(59, 130, 246, 0.1)',
                color: field.problemStatementId ? '#b45309' : 'var(--primary)',
                border: field.problemStatementId ? '1px solid rgba(217, 119, 6, 0.25)' : '1px solid rgba(59, 130, 246, 0.25)',
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
              className="btn btn-secondary touch-target"
              style={{ width: '42px', height: '42px', minWidth: '42px', padding: 0, fontSize: '1.25rem', fontWeight: 700, touchAction: 'manipulation' }}
            >
              -
            </button>

            <input
              type="number"
              min="0"
              max={maxMarks}
              step="1"
              disabled={isLocked}
              value={val !== null && val !== undefined ? val : ''}
              onChange={(e) => handleScoreChange(field.id, e.target.value, maxMarks)}
              className="form-input"
              placeholder="0"
              style={{
                width: '74px',
                height: '42px',
                textAlign: 'center',
                fontSize: '1.15rem',
                fontWeight: 800,
                color: 'var(--primary)',
              }}
            />

            <button
              type="button"
              disabled={isLocked || val === maxMarks}
              onClick={() => handleScoreChange(field.id, Math.min(maxMarks, (Number(val) || 0) + 1), maxMarks)}
              className="btn btn-secondary touch-target"
              style={{ width: '42px', height: '42px', minWidth: '42px', padding: 0, fontSize: '1.25rem', fontWeight: 700, touchAction: 'manipulation' }}
            >
              +
            </button>
          </div>

          {/* Quick Benchmark Anchors */}
          {anchors.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginLeft: isMobile ? 0 : 'auto', width: isMobile ? '100%' : 'auto' }}>
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
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '140px' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={returnToTeams}
            className="btn btn-secondary touch-target"
            style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowLeft size={14} /> Back to Teams
          </button>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.18rem', fontWeight: 800 }}>{teamDetail?.name}</h3>
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
            <>
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
            <button
              type="button"
              onClick={handleManualSync}
              disabled={saveStatus === 'saving'}
              className="btn btn-secondary touch-target"
              title="Force sync current scores and feedback with server"
              style={{
                fontSize: '0.72rem',
                padding: '4px 10px',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontWeight: 600,
              }}
            >
              <Save size={12} /> Sync Draft
            </button>
          </>
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

      {/* Mobile Step Navigator Pills (Intelligent Flow for Mobile) */}
      {isMobile && hasMultiPsSections && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            overflowX: 'auto',
            padding: '4px 2px 8px 2px',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <button
            type="button"
            onClick={() => setMobileStep('overview')}
            className={`btn ${mobileStep === 'overview' ? 'btn-primary' : 'btn-secondary'} touch-target`}
            style={{
              padding: '6px 12px',
              fontSize: '0.78rem',
              borderRadius: '999px',
              whiteSpace: 'nowrap',
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            1. Overview
          </button>

          <button
            type="button"
            onClick={() => setMobileStep('secA')}
            className={`btn ${mobileStep === 'secA' ? 'btn-primary' : 'btn-secondary'} touch-target`}
            style={{
              padding: '6px 12px',
              fontSize: '0.78rem',
              borderRadius: '999px',
              whiteSpace: 'nowrap',
              fontWeight: 700,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>2. Section A</span>
            <span
              style={{
                fontSize: '0.68rem',
                padding: '1px 6px',
                borderRadius: '999px',
                background: secAScoredCount >= secATotalCount && secATotalCount > 0 ? '#22c55e' : 'rgba(255,255,255,0.25)',
                color: '#fff',
                fontWeight: 800,
              }}
            >
              {secAScoredCount}/{secATotalCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMobileStep('secB')}
            className={`btn ${mobileStep === 'secB' ? 'btn-primary' : 'btn-secondary'} touch-target`}
            style={{
              padding: '6px 12px',
              fontSize: '0.78rem',
              borderRadius: '999px',
              whiteSpace: 'nowrap',
              fontWeight: 700,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>3. Section B</span>
            <span
              style={{
                fontSize: '0.68rem',
                padding: '1px 6px',
                borderRadius: '999px',
                background: secBScoredCount >= secBTotalCount && secBTotalCount > 0 ? '#22c55e' : 'rgba(255,255,255,0.25)',
                color: '#fff',
                fontWeight: 800,
              }}
            >
              {secBScoredCount}/{secBTotalCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMobileStep('review')}
            className={`btn ${mobileStep === 'review' ? 'btn-primary' : 'btn-secondary'} touch-target`}
            style={{
              padding: '6px 12px',
              fontSize: '0.78rem',
              borderRadius: '999px',
              whiteSpace: 'nowrap',
              fontWeight: 700,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>4. Review & Submit</span>
            <span
              style={{
                fontSize: '0.68rem',
                padding: '1px 6px',
                borderRadius: '999px',
                background: allFilled ? '#22c55e' : 'rgba(245, 158, 11, 0.4)',
                color: '#fff',
                fontWeight: 800,
              }}
            >
              {secASubtotal + secBSubtotal}%
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMobileStep(mobileStep === 'all' ? 'overview' : 'all')}
            className="btn btn-secondary touch-target"
            style={{
              padding: '6px 10px',
              fontSize: '0.72rem',
              borderRadius: '999px',
              whiteSpace: 'nowrap',
              color: 'var(--text-muted)',
              flexShrink: 0,
            }}
            title="Toggle between step-by-step and full page"
          >
            {mobileStep === 'all' ? 'Step View' : 'View All'}
          </button>
        </div>
      )}

      {showOverview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Problem Statement Details Banner */}
          {(teamDetail?.psCode || teamDetail?.psTitle) && (
            <div
              className="glass-card"
              style={{
                padding: '16px 20px',
                borderRadius: '12px',
                borderLeft: '4px solid var(--primary)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {teamDetail.psCode && (
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      padding: '3px 10px',
                      borderRadius: '6px',
                      background: 'rgba(217, 119, 6, 0.12)',
                      color: '#b45309',
                      border: '1px solid rgba(217, 119, 6, 0.25)',
                      letterSpacing: '0.03em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {formatPsBadge(teamDetail.psCode)}
                  </span>
                )}
                {teamDetail.psTitle && (
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {teamDetail.psTitle}
                  </span>
                )}
              </div>
              {teamDetail.psDescription && (
                <div style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Core Objective: </strong>
                  {teamDetail.psDescription}
                </div>
              )}
            </div>
          )}

          {/* Decisive Stress Test / Required Case Banner */}
          {teamDetail?.decisiveTest && (
            <div
              className="glass-card"
              style={{
                padding: '16px 20px',
                borderRadius: '12px',
                background: 'rgba(217, 119, 6, 0.08)',
                border: '1px solid rgba(217, 119, 6, 0.3)',
                borderLeft: '4px solid #d97706',
                display: 'flex',
                gap: '12px',
              }}
            >
              <AlertTriangle size={22} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Decisive Stress Test / Required Edge Case ({formatPsBadge(teamDetail.psCode) || 'Selected Problem Statement'})
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginTop: '6px', lineHeight: 1.55, fontWeight: 500 }}>
                  {teamDetail.decisiveTest}
                </div>
                {teamDetail.guidanceNotes && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px', borderTop: '1px solid rgba(217, 119, 6, 0.2)', paddingTop: '6px' }}>
                    <strong style={{ color: '#b45309' }}>Judging Guidance: </strong>{teamDetail.guidanceNotes}
                  </div>
                )}
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

          {isMobile && mobileStep === 'overview' && hasMultiPsSections && (
            <div style={{ marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setMobileStep('secA')}
                className="btn btn-primary touch-target"
                style={{
                  width: '100%',
                  padding: '13px 18px',
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  borderRadius: '10px',
                }}
              >
                <span>Start Scoring: Section A ({secATotalCount} criteria)</span>
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Scoring Section: Multi-PS Partitioned vs Unified */}
      {hasMultiPsSections ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {/* Section A: PS Specific */}
          {showSecA && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', color: '#b45309' }}>
                  <Target size={18} /> Section A: Problem Statement Specific Criteria ({formatPsBadge(teamDetail?.psCode) || 'PS'})
                </h4>
                <span
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    padding: '3px 10px',
                    borderRadius: '6px',
                    background: 'rgba(217, 119, 6, 0.12)',
                    color: '#b45309',
                    border: '1px solid rgba(217, 119, 6, 0.28)',
                  }}
                >
                  Section A Subtotal: {secASubtotal} / 40 Marks
                </span>
              </div>

              {secAFields.map((field, idx) => renderCriterionCard(field, idx))}

              {isMobile && mobileStep === 'secA' && (
                <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setMobileStep('overview')}
                    className="btn btn-secondary touch-target"
                    style={{ flex: 1, padding: '12px', fontSize: '0.86rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <ChevronLeft size={16} /> Overview
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileStep('secB')}
                    className="btn btn-primary touch-target"
                    style={{ flex: 2, padding: '12px', fontSize: '0.86rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <span>Next: Section B (60 Marks)</span>
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Section B: General Criteria */}
          {showSecB && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
                  <Layers size={18} /> Section B: General Criteria
                </h4>
                <span
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    padding: '3px 10px',
                    borderRadius: '6px',
                    background: 'rgba(59, 130, 246, 0.12)',
                    color: 'var(--primary)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                  }}
                >
                  Section B Subtotal: {secBSubtotal} / 60 Marks
                </span>
              </div>

              {secBFields.map((field, idx) => renderCriterionCard(field, idx))}

              {isMobile && mobileStep === 'secB' && (
                <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setMobileStep('secA')}
                    className="btn btn-secondary touch-target"
                    style={{ flex: 1, padding: '12px', fontSize: '0.86rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <ChevronLeft size={16} /> Section A
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileStep('review')}
                    className="btn btn-primary touch-target"
                    style={{ flex: 2, padding: '12px', fontSize: '0.86rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <span>Next: Review & Submit</span>
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Single-Tier Numeric Criteria List (Fallback) */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} color="var(--primary)" /> Numeric Scoring Criteria
          </h4>

          {rubricFields.filter((f) => f.type === 'numeric').map((field, idx) => renderCriterionCard(field, idx))}
        </div>
      )}

      {/* Scoring Section: Text Qualitative Criteria & Summary */}
      {showFeedback && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
          {isMobile && (
            <div
              className="glass-card"
              style={{
                padding: '16px',
                borderRadius: '12px',
                background: 'rgba(59, 130, 246, 0.06)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>Scoring Summary</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.84rem' }}>
                <span>Section A (PS Specific):</span>
                <strong style={{ color: '#fbbf24' }}>{secASubtotal} / 40 ({secAScoredCount}/{secATotalCount} scored)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.84rem' }}>
                <span>Section B (General Criteria):</span>
                <strong style={{ color: '#60a5fa' }}>{secBSubtotal} / 60 ({secBScoredCount}/{secBTotalCount} scored)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                <span style={{ fontWeight: 700 }}>Total Calculated Score:</span>
                <strong style={{ color: '#4ade80', fontSize: '1.25rem' }}>{secASubtotal + secBSubtotal}%</strong>
              </div>
              {!allFilled && (
                <div style={{ fontSize: '0.78rem', color: '#f59e0b', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={14} /> Some criteria are not scored yet. Review above if needed.
                </div>
              )}
            </div>
          )}

          {textFields.length > 0 && (
            <>
              <h4 style={{ margin: '6px 0 0 0', fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'gap', gap: '8px' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                        <span style={{ color: '#ef4444', fontWeight: 800, fontSize: '1.05rem', lineHeight: 1 }} title="Required">*</span>
                        <span>{field.label}</span>
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

                    {field.description && (
                      <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {field.description}
                      </p>
                    )}

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
            </>
          )}

          {isMobile && mobileStep === 'review' && (
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setMobileStep('secB')}
                className="btn btn-secondary touch-target"
                style={{ flex: 1, padding: '12px', fontSize: '0.86rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <ChevronLeft size={16} /> Section B
              </button>
              {isLocked ? (
                <button
                  type="button"
                  onClick={returnToTeams}
                  className="btn btn-primary touch-target"
                  style={{
                    flex: 2,
                    padding: '12px',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    background: 'var(--primary)',
                    borderColor: 'var(--primary)',
                  }}
                >
                  <ArrowLeft size={16} /> Return to Teams List
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSubmitConfirmOpen(true)}
                  disabled={submitting}
                  className="btn btn-primary touch-target"
                  style={{
                    flex: 2,
                    padding: '12px',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    background: '#22c55e',
                    borderColor: '#22c55e',
                  }}
                >
                  <Send size={16} /> Submit Evaluation
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sticky Bottom Actions Bar */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'var(--bg-surface, #ffffff)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid var(--border-light)',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          zIndex: 100,
          boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.2)',
        }}
      >
        {isMobile ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '8px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                {!hasMultiPsSections
                  ? `Scoring (${secBScoredCount}/${secBTotalCount})`
                  : mobileStep === 'overview'
                  ? 'Step 1/4 · Overview'
                  : mobileStep === 'secA'
                  ? `Step 2/4 · Sec A (${secAScoredCount}/${secATotalCount})`
                  : mobileStep === 'secB'
                  ? `Step 3/4 · Sec B (${secBScoredCount}/${secBTotalCount})`
                  : 'Step 4/4 · Review'}
              </span>
              <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#22c55e' }}>
                {liveTotalScore !== null ? `${liveTotalScore}%` : `${secASubtotal + secBSubtotal}%`}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {!isLocked && (
                <>
                  {!hasMultiPsSections ? (
                    <button
                      type="button"
                      onClick={() => setSubmitConfirmOpen(true)}
                      disabled={submitting}
                      className="btn btn-primary touch-target"
                      style={{
                        padding: '8px 18px',
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        background: '#22c55e',
                        borderColor: '#22c55e',
                        borderRadius: '8px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Send size={14} /> Submit
                    </button>
                  ) : (
                    <>
                      {mobileStep === 'overview' && (
                        <button
                          type="button"
                          onClick={() => setMobileStep('secA')}
                          className="btn btn-primary touch-target"
                          style={{ padding: '8px 16px', fontSize: '0.84rem', fontWeight: 700, borderRadius: '8px' }}
                        >
                          Start Sec A →
                        </button>
                      )}
                      {mobileStep === 'secA' && (
                        <button
                          type="button"
                          onClick={() => setMobileStep('secB')}
                          className="btn btn-primary touch-target"
                          style={{ padding: '8px 16px', fontSize: '0.84rem', fontWeight: 700, borderRadius: '8px' }}
                        >
                          Next: Sec B →
                        </button>
                      )}
                      {mobileStep === 'secB' && (
                        <button
                          type="button"
                          onClick={() => setMobileStep('review')}
                          className="btn btn-primary touch-target"
                          style={{ padding: '8px 16px', fontSize: '0.84rem', fontWeight: 700, borderRadius: '8px' }}
                        >
                          Review →
                        </button>
                      )}
                      {(mobileStep === 'review' || mobileStep === 'all') && (
                        <button
                          type="button"
                          onClick={() => setSubmitConfirmOpen(true)}
                          disabled={submitting}
                          className="btn btn-primary touch-target"
                          style={{
                            padding: '8px 16px',
                            fontSize: '0.84rem',
                            fontWeight: 700,
                            background: '#22c55e',
                            borderColor: '#22c55e',
                            borderRadius: '8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <Send size={14} /> Submit
                        </button>
                      )}
                    </>
                  )}
                </>
              )}

              {isLocked && (
                <button
                  type="button"
                  onClick={returnToTeams}
                  className="btn btn-secondary touch-target"
                  style={{
                    padding: '7px 12px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    borderRadius: '8px',
                  }}
                >
                  <ArrowLeft size={14} /> Back to Teams
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {hasMultiPsSections ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <div>
                  <span style={{ fontSize: '0.68rem', color: 'rgba(255, 255, 255, 0.7)', display: 'block', fontWeight: 600 }}>
                    Section A (PS)
                  </span>
                  <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fbbf24' }}>
                    {secASubtotal} / 40
                  </span>
                </div>

                <div style={{ width: '1px', height: '22px', background: 'rgba(255, 255, 255, 0.15)' }} />

                <div>
                  <span style={{ fontSize: '0.68rem', color: 'rgba(255, 255, 255, 0.7)', display: 'block', fontWeight: 600 }}>
                    Section B (General)
                  </span>
                  <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#60a5fa' }}>
                    {secBSubtotal} / 60
                  </span>
                </div>

                <div style={{ width: '1px', height: '22px', background: 'rgba(255, 255, 255, 0.15)' }} />

                <div>
                  <span style={{ fontSize: '0.68rem', color: 'rgba(255, 255, 255, 0.7)', display: 'block', fontWeight: 600 }}>
                    Combined Score
                  </span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#4ade80' }}>
                    {liveTotalScore !== null ? `${liveTotalScore}%` : `${secASubtotal + secBSubtotal} / 100`}
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.7)', display: 'block', fontWeight: 600 }}>
                    Calculated Total
                  </span>
                  <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#60a5fa' }}>
                    {liveTotalScore !== null ? `${liveTotalScore}%` : isLocked && teamDetail?.mine?.totalPct ? `${teamDetail.mine.totalPct}%` : '--'}
                  </span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {!isLocked && (
                <button
                  type="button"
                  onClick={() => setSubmitConfirmOpen(true)}
                  disabled={submitting}
                  className="btn btn-primary touch-target"
                  style={{
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '9px 20px',
                  }}
                >
                  <Send size={16} /> Submit Evaluation
                </button>
              )}

              {isLocked && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '0.82rem', color: '#22c55e', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={16} /> Finalized
                  </span>
                  <button
                    type="button"
                    onClick={returnToTeams}
                    className="btn btn-secondary touch-target"
                    style={{
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                    }}
                  >
                    <ArrowLeft size={14} /> Back to Teams
                  </button>
                </div>
              )}
            </div>
          </>
        )}
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
