import React, { useState, useEffect, useMemo } from 'react';
import {
  Trophy,
  Download,
  Share2,
  AlertTriangle,
  RotateCcw,
  Check,
  Eye,
  Sliders,
  ChevronRight,
  Sparkles,
  Users,
  Award,
  Layers,
  ArrowRight,
  Info,
  CheckCircle2,
  XCircle,
  HelpCircle,
  RefreshCw,
  GripVertical,
  FileSpreadsheet,
} from 'lucide-react';
import api from '../../services/api';
import Modal from '../../components/Modal';
import { useToast } from '../../contexts/ToastContext';
import ParticipantResultCard from '../results/ParticipantResultCard';
import EvaluationTrailModal from './EvaluationTrailModal';

export const RoundResultsTab = ({ round, rubricFields = [] }) => {
  const { addToast } = useToast();
  const roundId = round?.id;

  // Active sub-section: 'leaderboard' | 'release' | 'advance'
  const [subTab, setSubTab] = useState('leaderboard');

  // Loading states
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingDetailed, setExportingDetailed] = useState(false);

  // Leaderboard data
  const [leaderboard, setLeaderboard] = useState({ rows: [], unscored: [] });
  const [leaderboardFilter, setLeaderboardFilter] = useState('');
  const [trailModalTeam, setTrailModalTeam] = useState(null);

  // Release Status & Config
  const [releaseStatus, setReleaseStatus] = useState(null);
  const [resultsConfig, setResultsConfig] = useState({
    showScore: false,
    showCriteria: false,
    showRank: false,
    showAdvancement: false,
    textFields: {},
    scale: 'percent',
  });
  const [holdbackTeamIds, setHoldbackTeamIds] = useState([]);

  // Preview Modal state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewTeamId, setPreviewTeamId] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  // Release Diff Update Modal
  const [updateDiffModalOpen, setUpdateDiffModalOpen] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffData, setDiffData] = useState(null);
  const [updatingResults, setUpdatingResults] = useState(false);

  // Retract Modal
  const [retractModalOpen, setRetractModalOpen] = useState(false);
  const [retracting, setRetracting] = useState(false);

  // Releasing first time
  const [releasing, setReleasing] = useState(false);
  const [publishConfirmModalOpen, setPublishConfirmModalOpen] = useState(false);
  const [publishFilter, setPublishFilter] = useState('all'); // 'all', 'advanced', 'not_advanced'

  // Advancement Wizard State
  const [advanceMode, setAdvanceMode] = useState('top_n'); // top_n | threshold | manual
  const [advanceN, setAdvanceN] = useState(10);
  const [advanceThreshold, setAdvanceThreshold] = useState(75);
  const [manualSelectedIds, setManualSelectedIds] = useState([]);
  const [manualFilter, setManualFilter] = useState('');
  const [includeProvisional, setIncludeProvisional] = useState(false);
  const [targetRoundId, setTargetRoundId] = useState('');
  const [allRounds, setAllRounds] = useState([]);
  const [advancePreviewLoading, setAdvancePreviewLoading] = useState(false);
  const [advancePreviewResult, setAdvancePreviewResult] = useState(null);
  const [tieDecision, setTieDecision] = useState('break_by_score_raw'); // break_by_score_raw | advance_all | keep_top
  const [committingAdvance, setCommittingAdvance] = useState(false);
  const [progressionStatusList, setProgressionStatusList] = useState([]);

  // Final teams compiled for publishing verification
  const finalTeamsToPublish = useMemo(() => {
    const result = [];
    const seen = new Set();

    // 1. Teams with progression status recorded
    (progressionStatusList || []).forEach((s) => {
      seen.add(s.teamId);
      const lbRow = (leaderboard.rows || []).find((r) => r.teamId === s.teamId);
      result.push({
        teamId: s.teamId,
        name: s.name,
        registrationId: s.registrationId,
        state: s.state,
        rank: s.rankSnapshot || lbRow?.rank || null,
        score: s.scoreSnapshot || lbRow?.displayScore || lbRow?.score || null,
      });
    });

    // 2. Remaining leaderboard rows
    (leaderboard.rows || []).forEach((r) => {
      if (!seen.has(r.teamId)) {
        seen.add(r.teamId);
        result.push({
          teamId: r.teamId,
          name: r.teamName,
          registrationId: r.registrationId,
          state: 'not_advanced',
          rank: r.rank,
          score: r.displayScore || r.score,
        });
      }
    });

    // 3. Remaining unscored teams
    (leaderboard.unscored || []).forEach((u) => {
      if (!seen.has(u.teamId)) {
        seen.add(u.teamId);
        result.push({
          teamId: u.teamId,
          name: u.name,
          registrationId: u.registrationId,
          state: 'not_advanced',
          rank: null,
          score: null,
        });
      }
    });

    // Sort: advanced teams first (ordered by rank ascending), then not_advanced
    result.sort((a, b) => {
      if (a.state === 'advanced' && b.state !== 'advanced') return -1;
      if (a.state !== 'advanced' && b.state === 'advanced') return 1;
      if (a.rank && b.rank) return a.rank - b.rank;
      if (a.rank) return -1;
      if (b.rank) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    return result;
  }, [progressionStatusList, leaderboard]);

  // Load Leaderboard
  const fetchLeaderboard = async () => {
    if (!roundId) return;
    setLoadingLeaderboard(true);
    try {
      const res = await api.get(`/admin/rounds/${roundId}/leaderboard`);
      setLeaderboard(res.data || { rows: [], unscored: [] });
    } catch (err) {
      console.error('Failed to load leaderboard', err);
      addToast('Failed to load leaderboard scores', 'error');
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  // Load Release Status & Config
  const fetchReleaseStatusAndConfig = async () => {
    if (!roundId) return;
    setLoadingStatus(true);
    try {
      const [statusRes, configRes] = await Promise.all([
        api.get(`/admin/rounds/${roundId}/results/status`),
        api.get(`/admin/rounds/${roundId}/results-config`),
      ]);
      setReleaseStatus(statusRes.data);
      if (statusRes.data?.holdbackTeamIds) {
        setHoldbackTeamIds(statusRes.data.holdbackTeamIds);
      }
      if (configRes.data) {
        setResultsConfig(configRes.data);
      }
    } catch (err) {
      console.error('Failed to load release status or config', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  // Load all rounds for advancement target
  const fetchRoundsForProgression = async () => {
    try {
      const res = await api.get('/admin/rounds');
      const roundsList = res.data || [];
      // Filter rounds with higher roundNumber than current
      const forwardRounds = roundsList.filter((r) => r.id !== roundId && (r.number || r.roundNumber || 0) >= (round?.number || round?.roundNumber || 0));
      setAllRounds(forwardRounds);
      if (forwardRounds.length > 0 && !targetRoundId) {
        setTargetRoundId(forwardRounds[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch rounds for advancement', err);
    }
  };

  // Load progression statuses
  const fetchProgressionStatus = async () => {
    if (!roundId) return;
    try {
      const res = await api.get(`/admin/rounds/${roundId}/progression`);
      setProgressionStatusList(Array.isArray(res.data) ? res.data : (res.data?.statuses || []));
    } catch (err) {
      console.error('Failed to load progression statuses', err);
    }
  };

  useEffect(() => {
    if (roundId) {
      fetchLeaderboard();
      fetchReleaseStatusAndConfig();
      fetchRoundsForProgression();
      fetchProgressionStatus();
    }
  }, [roundId]);

  // Export Leaderboard Excel
  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get(`/admin/rounds/${roundId}/leaderboard/export`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Round_${round?.name || roundId}_Leaderboard.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      addToast('Leaderboard exported successfully!', 'success');
    } catch (err) {
      console.error('Failed to export leaderboard', err);
      addToast('Failed to export leaderboard', 'error');
    } finally {
      setExporting(false);
    }
  };

  // Export Detailed Print-Ready Zip of Workbooks
  const handleExportDetailed = async () => {
    setExportingDetailed(true);
    try {
      const res = await api.get(`/admin/rounds/${roundId}/export/detailed-sheets`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], {
        type: 'application/zip',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Round_${round?.name || roundId}_Detailed_Evaluation_Sheets.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      addToast('Detailed evaluation sheets ZIP exported successfully!', 'success');
    } catch (err) {
      console.error('Failed to export detailed sheets', err);
      addToast('Failed to export detailed evaluation sheets', 'error');
    } finally {
      setExportingDetailed(false);
    }
  };

  // Save Results Config
  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      await api.put(`/admin/rounds/${roundId}/results-config`, resultsConfig);
      addToast('Results configuration saved!', 'success');
      fetchReleaseStatusAndConfig();
    } catch (err) {
      console.error('Failed to save results configuration', err);
      addToast(err.response?.data?.detail || 'Failed to save configuration', 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  // Preview as participant
  const handleOpenPreview = async () => {
    const teams = leaderboard.rows;
    if (teams.length === 0) {
      addToast('No evaluated teams available to preview', 'info');
      return;
    }
    const selected = previewTeamId || teams[0].teamId;
    setPreviewTeamId(selected);
    setPreviewModalOpen(true);
    loadParticipantPreview(selected);
  };

  const loadParticipantPreview = async (tId) => {
    setPreviewLoading(true);
    try {
      const res = await api.post(`/admin/rounds/${roundId}/results/preview`);
      if (res.data?.items && res.data.items[tId]) {
        setPreviewData(res.data.items[tId]);
      } else {
        setPreviewData(null);
      }
    } catch (err) {
      console.error('Failed to preview participant results', err);
      addToast('Failed to generate preview', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  // First-time Release
  const handleRelease = async () => {
    setReleasing(true);
    try {
      const payload = {
        ...resultsConfig,
        holdTeamIds: holdbackTeamIds,
      };
      const res = await api.post(`/admin/rounds/${roundId}/results/release`, payload);
      const notifiedCount = res.data?.count || res.data?.totalItems || 0;
      addToast(`Results released successfully! (${notifiedCount} teams notified)`, 'success');
      setPublishConfirmModalOpen(false);
      fetchReleaseStatusAndConfig();
      fetchProgressionStatus();
    } catch (err) {
      console.error('Failed to release results', err);
      addToast(err.response?.data?.detail || 'Failed to release results', 'error');
    } finally {
      setReleasing(false);
    }
  };

  // Open Update Diff Modal
  const handleOpenUpdateDiff = async () => {
    setDiffLoading(true);
    setUpdateDiffModalOpen(true);
    try {
      const res = await api.post(`/admin/rounds/${roundId}/results/update/preview`, {
        holdbackTeamIds,
      });
      setDiffData(res.data);
    } catch (err) {
      console.error('Failed to load update diff preview', err);
      addToast('Failed to load changed results diff', 'error');
    } finally {
      setDiffLoading(false);
    }
  };

  // Confirm Update
  const handleConfirmUpdate = async () => {
    setUpdatingResults(true);
    try {
      const res = await api.post(`/admin/rounds/${roundId}/results/update`, {
        holdbackTeamIds,
      });
      addToast(`Updated release #${res.data.releaseNo}! (${res.data.updatedCount} teams updated)`, 'success');
      setUpdateDiffModalOpen(false);
      fetchReleaseStatusAndConfig();
    } catch (err) {
      console.error('Failed to update released results', err);
      addToast(err.response?.data?.detail || 'Failed to update results', 'error');
    } finally {
      setUpdatingResults(false);
    }
  };

  // Retract Results
  const handleRetract = async () => {
    setRetracting(true);
    try {
      await api.post(`/admin/rounds/${roundId}/results/retract`);
      addToast('Results retracted. Participant access has been revoked.', 'success');
      setRetractModalOpen(false);
      fetchReleaseStatusAndConfig();
    } catch (err) {
      console.error('Failed to retract results', err);
      addToast('Failed to retract results', 'error');
    } finally {
      setRetracting(false);
    }
  };

  // Editable Rank Preview State
  const [previewTeams, setPreviewTeams] = useState([]);
  const [draggedIdx, setDraggedIdx] = useState(null);

  // Preview Advancement
  const handleAdvancePreview = async () => {
    if (!targetRoundId) {
      addToast('Please select a target round to advance teams into', 'error');
      return;
    }

    setAdvancePreviewLoading(true);
    try {
      const payload = {
        mode: advanceMode,
        targetRoundId,
        includeProvisional,
      };
      if (advanceMode === 'top_n') payload.n = parseInt(advanceN, 10) || 1;
      if (advanceMode === 'threshold') payload.threshold = parseFloat(advanceThreshold) || 0;
      if (advanceMode === 'manual') payload.manualTeamIds = manualSelectedIds;

      const res = await api.post(`/admin/rounds/${roundId}/advance/preview`, payload);
      setAdvancePreviewResult(res.data);
      const incomingTeams = (res.data.teams || []).map((t, idx) => ({
        ...t,
        rank: t.rank || idx + 1,
      }));
      setPreviewTeams(incomingTeams);
      if (res.data.hasCutoffTie) {
        addToast('Cutoff tie detected! Please select a tie-breaking rule below.', 'info');
      }
    } catch (err) {
      console.error('Failed to preview advancement', err);
      addToast(err.response?.data?.detail || 'Failed to calculate advancement preview', 'error');
    } finally {
      setAdvancePreviewLoading(false);
    }
  };

  // Reorder ranks when manually entering rank N
  const handleRankInputChange = (teamId, newRankVal) => {
    const targetRank = parseInt(newRankVal, 10);
    if (isNaN(targetRank) || targetRank < 1) return;

    setPreviewTeams((prev) => {
      const currentIndex = prev.findIndex((t) => t.id === teamId);
      if (currentIndex === -1) return prev;

      const updated = [...prev];
      const [movedTeam] = updated.splice(currentIndex, 1);
      const destIndex = Math.min(Math.max(0, targetRank - 1), updated.length);
      updated.splice(destIndex, 0, movedTeam);

      // Renumber sequentially 1..N
      return updated.map((t, idx) => ({ ...t, rank: idx + 1 }));
    });
  };

  // Drag and drop reordering
  const handleDragStart = (e, index) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) return;
    setPreviewTeams((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(draggedIdx, 1);
      copy.splice(index, 0, item);
      return copy.map((t, idx) => ({ ...t, rank: idx + 1 }));
    });
    setDraggedIdx(index);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
  };

  // Commit Advancement
  const handleAdvanceCommit = async () => {
    if (!advancePreviewResult?.token) {
      addToast('No valid preview token found. Please re-run preview.', 'error');
      return;
    }

    setCommittingAdvance(true);
    try {
      const customRanks = {};
      previewTeams.forEach((t) => {
        if (t.id && t.rank) customRanks[t.id] = t.rank;
      });

      const payload = {
        token: advancePreviewResult.token,
        teamIds: advancePreviewResult.selectedTeamIds || previewTeams.map((t) => t.id),
        targetRoundId,
        mode: advanceMode,
        tieDecision: advancePreviewResult.hasCutoffTie ? tieDecision : null,
        customRanks,
      };
      const res = await api.post(`/admin/rounds/${roundId}/advance/commit`, payload);
      addToast(`Successfully advanced ${res.data.advancedCount} teams to the next round!`, 'success');
      setAdvancePreviewResult(null);
      setPreviewTeams([]);
      fetchProgressionStatus();
      fetchLeaderboard();
    } catch (err) {
      console.error('Failed to commit advancement', err);
      addToast(err.response?.data?.detail || 'Failed to commit advancement', 'error');
    } finally {
      setCommittingAdvance(false);
    }
  };

  // Text fields available from rubric
  const rubricTextFields = rubricFields.filter((f) => f.fieldType === 'text');

  // Filtered leaderboard rows
  const filteredRows = (leaderboard.rows || []).filter((r) => {
    if (!leaderboardFilter) return true;
    const term = leaderboardFilter.toLowerCase();
    return (
      r.teamName?.toLowerCase().includes(term) ||
      r.registrationId?.toLowerCase().includes(term)
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Sub-navigation pill selector */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '12px',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={() => setSubTab('leaderboard')}
          className={`btn ${subTab === 'leaderboard' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '0.84rem', padding: '6px 16px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Trophy size={15} /> Official Leaderboard
        </button>

        <button
          type="button"
          onClick={() => setSubTab('release')}
          className={`btn ${subTab === 'release' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '0.84rem', padding: '6px 16px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Share2 size={15} /> Release & Publish Results
          {releaseStatus?.released && (
            <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: '#22c55e', color: '#fff', fontWeight: 800 }}>
              #{releaseStatus.releaseNo}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setSubTab('advance')}
          className={`btn ${subTab === 'advance' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '0.84rem', padding: '6px 16px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <ArrowRight size={15} /> Advance Teams to Next Round
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SUBTAB 1: LEADERBOARD TABLE */}
      {/* ========================================================================= */}
      {subTab === 'leaderboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Controls Bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 240px' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Search team name or registration ID..."
                value={leaderboardFilter}
                onChange={(e) => setLeaderboardFilter(e.target.value)}
                style={{ maxWidth: '340px' }}
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {filteredRows.length} scored teams
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                onClick={fetchLeaderboard}
                className="btn btn-secondary"
                title="Refresh scores"
                disabled={loadingLeaderboard}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <RefreshCw size={14} className={loadingLeaderboard ? 'spin' : ''} /> Refresh
              </button>

              <button
                type="button"
                onClick={handleExport}
                className="btn btn-primary"
                disabled={exporting || leaderboard.rows.length === 0}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Download size={14} /> {exporting ? 'Exporting...' : 'Export Leaderboard (XLSX)'}
              </button>

              <button
                type="button"
                onClick={handleExportDetailed}
                className="btn btn-secondary"
                disabled={exportingDetailed || leaderboard.rows.length === 0}
                title="Export print-ready multi-sheet workbook with one tab per team"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <FileSpreadsheet size={14} /> {exportingDetailed ? 'Exporting Sheets...' : 'Export Detailed Sheets (XLSX)'}
              </button>
            </div>
          </div>

          {/* Leaderboard Table */}
          {loadingLeaderboard ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <RefreshCw size={24} className="spin" style={{ marginBottom: '8px' }} />
              <div>Computing final scores and leaderboard rankings...</div>
            </div>
          ) : filteredRows.length === 0 ? (
            <div
              className="glass-panel"
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                borderRadius: '12px',
              }}
            >
              <Trophy size={32} style={{ opacity: 0.3, marginBottom: '10px' }} />
              <strong style={{ display: 'block', fontSize: '1rem', color: 'var(--text-primary)' }}>
                No evaluated teams found
              </strong>
              <p style={{ margin: '6px 0 0 0', fontSize: '0.84rem' }}>
                Judges have not submitted final evaluations for this round yet.
              </p>
            </div>
          ) : (
            <div className="glass-panel" style={{ borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                  <thead>
                    <tr
                      style={{
                        background: 'rgba(0, 0, 0, 0.04)',
                        borderBottom: '1px solid var(--border-color)',
                        textAlign: 'left',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <th style={{ padding: '12px 16px', width: '70px' }}>Rank</th>
                      <th style={{ padding: '12px 16px' }}>Team</th>
                      <th style={{ padding: '12px 16px' }}>Reg ID</th>
                      <th style={{ padding: '12px 16px' }}>Score</th>
                      <th style={{ padding: '12px 16px' }}>Judges</th>
                      <th style={{ padding: '12px 16px' }}>Status & Notes</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Audit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr
                        key={row.teamId}
                        onClick={() => setTrailModalTeam({ id: row.teamId, name: row.teamName, registrationId: row.registrationId })}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <td style={{ padding: '12px 16px', fontWeight: 800 }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              background: row.rank === 1 ? 'rgba(234, 179, 8, 0.2)' : row.rank <= 3 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                              color: row.rank === 1 ? '#eab308' : row.rank <= 3 ? '#3b82f6' : 'var(--text-secondary)',
                            }}
                          >
                            {row.rank}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {row.teamName}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                          {row.registrationId}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 800, color: 'var(--primary)', fontSize: '0.98rem' }}>
                          {row.displayScore !== null && row.displayScore !== undefined ? row.displayScore : '-'}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                          {row.judgesCount} / {row.judgesNeeded}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {row.isProvisional && (
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  background: 'rgba(234, 179, 8, 0.15)',
                                  color: '#eab308',
                                  border: '1px solid rgba(234, 179, 8, 0.3)',
                                }}
                              >
                                Provisional
                              </span>
                            )}
                            {row.fellBackToMean && (
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  background: 'rgba(59, 130, 246, 0.15)',
                                  color: '#3b82f6',
                                  border: '1px solid rgba(59, 130, 246, 0.3)',
                                }}
                              >
                                Fell back to mean
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <span style={{ fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 600 }}>
                            View Trail →
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Unscored Teams Section */}
          {leaderboard.unscored && leaderboard.unscored.length > 0 && (
            <div
              className="glass-panel"
              style={{
                padding: '16px 20px',
                borderRadius: '12px',
                marginTop: '10px',
              }}
            >
              <h5 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Unscored Teams ({leaderboard.unscored.length})
              </h5>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                {leaderboard.unscored.map((u) => (
                  <span
                    key={u.teamId}
                    style={{
                      fontSize: '0.76rem',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border-light)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {u.teamName} ({u.registrationId})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 2: RELEASE & PUBLISH PANEL */}
      {/* ========================================================================= */}
      {subTab === 'release' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Release Status Banner */}
          <div
            className="glass-panel"
            style={{
              padding: '20px',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
              borderLeft: releaseStatus?.released ? '4px solid #22c55e' : '4px solid #f59e0b',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Share2 size={20} style={{ color: releaseStatus?.released ? '#22c55e' : '#f59e0b' }} />
                <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                  {releaseStatus?.released
                    ? `Released #${releaseStatus.releaseNo}, ${new Date(releaseStatus.releasedAt).toLocaleString()}`
                    : 'Results Not Yet Released to Participants'}
                </h4>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {releaseStatus?.released
                  ? `${releaseStatus.totalReleased} teams have access to their score card snapshots.`
                  : 'Configure visibility toggles and preview your results before publishing them to participants.'}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleOpenPreview}
                className="btn btn-secondary"
                style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Eye size={15} /> Preview as Participant
              </button>

              {!releaseStatus?.released ? (
                <button
                  type="button"
                  onClick={() => setPublishConfirmModalOpen(true)}
                  className="btn btn-primary"
                  disabled={releasing}
                  style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Share2 size={15} /> Publish & Release Results
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setRetractModalOpen(true)}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.82rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                >
                  <RotateCcw size={15} /> Retract Release
                </button>
              )}
            </div>
          </div>

          {/* Pending Changes Notice Banner */}
          {releaseStatus?.released && releaseStatus?.pendingChanges > 0 && (
            <div
              style={{
                padding: '16px 20px',
                borderRadius: '12px',
                background: 'rgba(234, 179, 8, 0.1)',
                border: '1px solid rgba(234, 179, 8, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle size={20} style={{ color: '#eab308' }} />
                <div>
                  <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    {releaseStatus.pendingChanges} team(s) have changed scores since last release
                  </strong>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Judges revised rubric marks or evaluations after Release #{releaseStatus.releaseNo}.
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleOpenUpdateDiff}
                className="btn btn-primary"
                style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <RefreshCw size={14} /> Update Released Results
              </button>
            </div>
          )}

          {/* Configuration Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '20px',
            }}
          >
            {/* Column 1: Visibility Toggles */}
            <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
              <h5 style={{ margin: '0 0 14px 0', fontSize: '0.92rem', fontWeight: 700 }}>
                Participant Visibility Controls
              </h5>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.86rem' }}>
                  <input
                    type="checkbox"
                    checked={resultsConfig.showScore}
                    onChange={(e) => setResultsConfig({ ...resultsConfig, showScore: e.target.checked })}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <div>
                    <strong style={{ display: 'block' }}>Show Overall Score</strong>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                      Displays the calculated final aggregated score.
                    </span>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.86rem' }}>
                  <input
                    type="checkbox"
                    checked={resultsConfig.showCriteria}
                    onChange={(e) => setResultsConfig({ ...resultsConfig, showCriteria: e.target.checked })}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <div>
                    <strong style={{ display: 'block' }}>Show Per-Criterion Breakdown</strong>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                      Renders progress bars for each rubric field.
                    </span>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.86rem' }}>
                  <input
                    type="checkbox"
                    checked={resultsConfig.showRank}
                    onChange={(e) => setResultsConfig({ ...resultsConfig, showRank: e.target.checked })}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <div>
                    <strong style={{ display: 'block' }}>Show Round Rank</strong>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                      Displays overall standing position (e.g. Rank #3).
                    </span>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.86rem' }}>
                  <input
                    type="checkbox"
                    checked={resultsConfig.showAdvancement}
                    onChange={(e) => setResultsConfig({ ...resultsConfig, showAdvancement: e.target.checked })}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <div>
                    <strong style={{ display: 'block' }}>Show Advancement Status</strong>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                      Displays calm 'Advanced' or 'Did not advance' chip.
                    </span>
                  </div>
                </label>
              </div>

              {/* Scale Selector */}
              <div style={{ marginTop: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                  Score Display Scale
                </label>
                <select
                  className="form-input"
                  value={resultsConfig.scale || 'percent'}
                  onChange={(e) => setResultsConfig({ ...resultsConfig, scale: e.target.value })}
                >
                  <option value="percent">Percentage (0 - 100%)</option>
                  <option value="target">Target Scale (Out of {round?.totalScale || 100})</option>
                  <option value="raw">Raw Sum of Evaluation Marks</option>
                </select>
              </div>
            </div>

            {/* Column 2: Qualitative Feedback Checklist & Hold-backs */}
            <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
              <h5 style={{ margin: '0 0 14px 0', fontSize: '0.92rem', fontWeight: 700 }}>
                Participant-Visible Feedback Fields
              </h5>

              {rubricTextFields.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  No text/feedback fields defined in this round's rubric.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {rubricTextFields.map((tf) => (
                    <label key={tf.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.84rem' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(resultsConfig.textFields?.[tf.id])}
                        onChange={(e) => {
                          const current = { ...(resultsConfig.textFields || {}) };
                          if (e.target.checked) {
                            current[tf.id] = true;
                          } else {
                            delete current[tf.id];
                          }
                          setResultsConfig({ ...resultsConfig, textFields: current });
                        }}
                        style={{ width: '16px', height: '16px' }}
                      />
                      <span>{tf.label}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Hold-Back Teams Selection */}
              <div style={{ marginTop: '24px' }}>
                <h5 style={{ margin: '0 0 6px 0', fontSize: '0.92rem', fontWeight: 700 }}>
                  Hold Back Specific Teams
                </h5>
                <p style={{ margin: '0 0 10px 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Teams selected here will NOT receive their scores until manually released.
                </p>

                <div
                  style={{
                    maxHeight: '160px',
                    overflowY: 'auto',
                    border: '1px solid var(--border-light)',
                    borderRadius: '8px',
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  {leaderboard.rows.map((row) => {
                    const isHeld = holdbackTeamIds.includes(row.teamId);
                    return (
                      <label
                        key={row.teamId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isHeld}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setHoldbackTeamIds([...holdbackTeamIds, row.teamId]);
                            } else {
                              setHoldbackTeamIds(holdbackTeamIds.filter((id) => id !== row.teamId));
                            }
                          }}
                        />
                        <span>{row.teamName} ({row.registrationId})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  className="btn btn-primary"
                  disabled={savingConfig}
                  style={{ fontSize: '0.84rem' }}
                >
                  {savingConfig ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 3: ADVANCEMENT WIZARD */}
      {/* ========================================================================= */}
      {subTab === 'advance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', fontWeight: 800 }}>
              Round Progression Wizard
            </h4>
            <p style={{ margin: '0 0 20px 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Automatically select and qualify the top performing participant teams into subsequent rounds.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '20px',
              }}
            >
              {/* Target Round */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                  Target Round to Advance Teams Into
                </label>
                <select
                  className="form-input"
                  value={targetRoundId}
                  onChange={(e) => setTargetRoundId(e.target.value)}
                >
                  {allRounds.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} (Round #{r.number || r.roundNumber})
                    </option>
                  ))}
                </select>
              </div>

              {/* Progression Mode */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                  Selection Methodology
                </label>
                <select
                  className="form-input"
                  value={advanceMode}
                  onChange={(e) => setAdvanceMode(e.target.value)}
                >
                  <option value="top_n">Top N Ranked Teams</option>
                  <option value="threshold">Minimum Score Threshold</option>
                  <option value="manual">Manual Team Selection</option>
                </select>
              </div>

              {/* Mode Specific Inputs */}
              {advanceMode === 'top_n' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                    Top N Count (Teams to Qualify)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    className="form-input"
                    value={advanceN}
                    onChange={(e) => setAdvanceN(e.target.value)}
                  />
                </div>
              )}

              {advanceMode === 'threshold' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                    Cutoff Score Threshold
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    className="form-input"
                    value={advanceThreshold}
                    onChange={(e) => setAdvanceThreshold(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Manual Mode Team List */}
            {advanceMode === 'manual' && (() => {
              const allCandidates = [
                ...(leaderboard.rows || []).map((r) => ({
                  teamId: r.teamId,
                  teamName: r.teamName,
                  registrationId: r.registrationId,
                  rankLabel: `#${r.rank}`,
                  isScored: true,
                })),
                ...(leaderboard.unscored || []).map((u) => ({
                  teamId: u.teamId,
                  teamName: u.teamName,
                  registrationId: u.registrationId,
                  rankLabel: 'Unscored',
                  isScored: false,
                })),
              ];
              const q = (manualFilter || '').trim().toLowerCase();
              const displayed = allCandidates.filter((c) => {
                if (!q) return true;
                return (
                  (c.teamName && c.teamName.toLowerCase().includes(q)) ||
                  (c.registrationId && c.registrationId.toLowerCase().includes(q))
                );
              });

              return (
                <div style={{ marginTop: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                      Select Teams ({manualSelectedIds.length} of {allCandidates.length} selected)
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setManualSelectedIds(allCandidates.map((c) => c.teamId))}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.74rem', padding: '2px 8px' }}
                      >
                        Select All
                      </button>
                      {leaderboard.rows?.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setManualSelectedIds(leaderboard.rows.map((r) => r.teamId))}
                          className="btn btn-secondary"
                          style={{ fontSize: '0.74rem', padding: '2px 8px' }}
                        >
                          Select Scored
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setManualSelectedIds([])}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.74rem', padding: '2px 8px' }}
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  <div style={{ marginBottom: '10px' }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Search teams by name or registration ID..."
                      value={manualFilter}
                      onChange={(e) => setManualFilter(e.target.value)}
                      style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                    />
                  </div>

                  <div
                    style={{
                      maxHeight: '220px',
                      overflowY: 'auto',
                      border: '1px solid var(--border-light)',
                      borderRadius: '8px',
                      padding: '10px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '8px',
                    }}
                  >
                    {displayed.length === 0 ? (
                      <div style={{ padding: '12px', fontSize: '0.82rem', color: 'var(--text-muted)', gridColumn: '1 / -1', textAlign: 'center' }}>
                        No teams match "{manualFilter}"
                      </div>
                    ) : (
                      displayed.map((cand) => (
                        <label
                          key={cand.teamId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={manualSelectedIds.includes(cand.teamId)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setManualSelectedIds([...manualSelectedIds, cand.teamId]);
                              } else {
                                setManualSelectedIds(manualSelectedIds.filter((id) => id !== cand.teamId));
                              }
                            }}
                          />
                          <span>
                            <strong>[{cand.rankLabel}]</strong> {cand.teamName} <small style={{ color: 'var(--text-muted)' }}>({cand.registrationId})</small>
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Provisional Scores Toggle */}
            <div style={{ marginTop: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={includeProvisional}
                  onChange={(e) => setIncludeProvisional(e.target.checked)}
                />
                <span>Include teams with provisional scores (fewer than needed judges completed)</span>
              </label>
            </div>

            {/* Run Preview Button */}
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleAdvancePreview}
                className="btn btn-primary"
                disabled={advancePreviewLoading}
                style={{ fontSize: '0.84rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Eye size={15} /> {advancePreviewLoading ? 'Calculating Preview...' : 'Calculate Advancement Preview'}
              </button>
            </div>
          </div>

          {/* Advancement Preview Results Table */}
          {advancePreviewResult && (
            <div
              className="glass-panel"
              style={{
                padding: '20px',
                borderRadius: '12px',
                border: '1px solid var(--primary)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>
                    Advancement Preview: {advancePreviewResult.count} Teams Selected
                  </h4>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Review the qualification list before committing progression to the target round.
                  </span>
                </div>
              </div>

              {/* Cutoff Tie Warning & Mandatory Radio Decision */}
              {advancePreviewResult.hasCutoffTie && (
                <div
                  style={{
                    padding: '16px',
                    borderRadius: '10px',
                    background: 'rgba(234, 179, 8, 0.12)',
                    border: '1px solid rgba(234, 179, 8, 0.4)',
                    marginBottom: '16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <AlertTriangle size={18} style={{ color: '#eab308' }} />
                    <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      Cutoff Tie Detected at Score {advancePreviewResult.cutoffScore}!
                    </strong>
                  </div>
                  <p style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Multiple teams share the cutoff boundary score. You must declare how to resolve this tie before committing:
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="tieDecision"
                        value="break_by_score_raw"
                        checked={tieDecision === 'break_by_score_raw'}
                        onChange={(e) => setTieDecision(e.target.value)}
                      />
                      <span><strong>Break tie by raw evaluation mark:</strong> Use unscaled raw marks to break the tie.</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="tieDecision"
                        value="advance_all"
                        checked={tieDecision === 'advance_all'}
                        onChange={(e) => setTieDecision(e.target.value)}
                      />
                      <span><strong>Advance all tied teams:</strong> Generously qualify all teams sharing the cutoff score.</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="tieDecision"
                        value="keep_top"
                        checked={tieDecision === 'keep_top'}
                        onChange={(e) => setTieDecision(e.target.value)}
                      />
                      <span><strong>Keep strictly top N:</strong> Advance strictly up to cutoff limit and omit tied teams.</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Teams Preview Grid with Drag-and-Drop & Manual Rank Inputs */}
              <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Drag cards using <GripVertical size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> or edit rank numbers directly to reorder. Ranks automatically cascade down.
                </span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)' }}>
                  {previewTeams.length} Teams
                </span>
              </div>

              <div
                style={{
                  maxHeight: '280px',
                  overflowY: 'auto',
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  padding: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  marginBottom: '16px',
                }}
              >
                {previewTeams.map((t, idx) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: draggedIdx === idx ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      border: draggedIdx === idx ? '1px dashed var(--primary)' : '1px solid var(--border-light)',
                      fontSize: '0.84rem',
                      cursor: 'grab',
                      userSelect: 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                      <GripVertical size={16} style={{ color: 'var(--text-muted)', cursor: 'grab' }} />
                      
                      {/* Rank editable input */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Rank</span>
                        <input
                          type="number"
                          min="1"
                          max={previewTeams.length}
                          value={t.rank || idx + 1}
                          onChange={(e) => handleRankInputChange(t.id, e.target.value)}
                          className="form-input"
                          style={{
                            width: '54px',
                            padding: '2px 6px',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            textAlign: 'center',
                            borderRadius: '4px',
                          }}
                        />
                      </div>

                      <div>
                        <strong style={{ color: 'var(--text-primary)' }}>{t.name}</strong>
                        <span style={{ color: 'var(--text-muted)', marginLeft: '6px', fontSize: '0.76rem' }}>
                          ({t.registrationId})
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        Score: <strong>{t.displayScore || t.score || '-'}</strong>
                      </span>
                    </div>
                  </div>
                ))}
                {previewTeams.length === 0 && (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                    No teams selected to advance.
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setAdvancePreviewResult(null)}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.82rem' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAdvanceCommit}
                  className="btn btn-primary"
                  disabled={committingAdvance}
                  style={{ fontSize: '0.84rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <CheckCircle2 size={16} /> {committingAdvance ? 'Committing Advancement...' : 'Commit Advancement'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: PREVIEW AS PARTICIPANT */}
      {/* ========================================================================= */}
      {previewModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setPreviewModalOpen(false)}
          title="Participant Result Preview"
          maxWidth="720px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontSize: '0.84rem', fontWeight: 600 }}>Select Team to Preview:</label>
              <select
                className="form-input"
                value={previewTeamId}
                onChange={(e) => {
                  setPreviewTeamId(e.target.value);
                  loadParticipantPreview(e.target.value);
                }}
                style={{ flex: 1 }}
              >
                {leaderboard.rows.map((r) => (
                  <option key={r.teamId} value={r.teamId}>
                    #{r.rank} {r.teamName} ({r.registrationId})
                  </option>
                ))}
              </select>
            </div>

            <ParticipantResultCard
              result={previewData}
              loading={previewLoading}
              preview={true}
              teamName={leaderboard.rows.find((r) => r.teamId === previewTeamId)?.teamName}
            />
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: DIFF UPDATE MODAL */}
      {/* ========================================================================= */}
      {updateDiffModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setUpdateDiffModalOpen(false)}
          title="Update Released Results: Change Diff"
          maxWidth="760px"
        >
          {diffLoading ? (
            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <RefreshCw size={24} className="spin" style={{ marginBottom: '8px' }} />
              <div>Computing score changes...</div>
            </div>
          ) : !diffData || !diffData.changedTeams || diffData.changedTeams.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No score differences detected between current evaluations and released snapshots.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                The following {diffData.changedTeams.length} team(s) have updated evaluation scores since the previous release:
              </p>

              <div style={{ maxHeight: '360px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {diffData.changedTeams.map((ct) => (
                  <div
                    key={ct.teamId}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-light)',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '6px' }}>
                      {ct.teamName} <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>({ct.registrationId})</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {Object.entries(ct.diff || {}).map(([key, val]) => (
                        <div key={key} style={{ fontSize: '0.8rem', display: 'flex', gap: '8px' }}>
                          <span style={{ color: 'var(--text-secondary)', width: '120px' }}>{key}:</span>
                          <span style={{ color: '#ef4444', textDecoration: 'line-through' }}>{String(val.old ?? 'none')}</span>
                          <span>→</span>
                          <span style={{ color: '#22c55e', fontWeight: 700 }}>{String(val.new ?? 'none')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setUpdateDiffModalOpen(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmUpdate}
                  className="btn btn-primary"
                  disabled={updatingResults}
                >
                  {updatingResults ? 'Publishing Updates...' : 'Confirm & Update Released Results'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: RETRACT CONFIRMATION */}
      {/* ========================================================================= */}
      {retractModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setRetractModalOpen(false)}
          title="Confirm Results Retraction"
          maxWidth="500px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Are you sure you want to retract the released results for <strong>{round?.name}</strong>?
            </p>
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                fontSize: '0.82rem',
              }}
            >
              All participant team dashboards will immediately return to the unreleased state and will no longer see scores, criteria, or advancement notes.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setRetractModalOpen(false)}
                className="btn btn-secondary"
              >
                Keep Results Active
              </button>
              <button
                type="button"
                onClick={handleRetract}
                className="btn btn-secondary"
                disabled={retracting}
                style={{ color: '#ef4444', borderColor: '#ef4444' }}
              >
                {retracting ? 'Retracting...' : 'Yes, Retract Results'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: EVALUATION TRAIL MODAL (ON ROW CLICK) */}
      {/* ========================================================================= */}
      {trailModalTeam && (
        <EvaluationTrailModal
          roundId={roundId}
          team={trailModalTeam}
          onClose={() => setTrailModalTeam(null)}
          onEvaluationCleared={fetchLeaderboard}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: PUBLISH RESULTS CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {publishConfirmModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => !releasing && setPublishConfirmModalOpen(false)}
          title="Review Final Teams & Publish Results"
          maxWidth="800px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Review the finalized teams below before releasing official results for <strong>{round?.name}</strong>.
              Once confirmed, these qualification decisions and standings will be published directly to team dashboards.
            </p>

            {/* Quick Stats Banner */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
              }}
            >
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '10px',
                  background: 'rgba(34, 197, 94, 0.08)',
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                }}
              >
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#16a34a', fontWeight: 700, letterSpacing: '0.5px' }}>
                  Advancing / Qualified
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#16a34a', marginTop: '2px' }}>
                  {finalTeamsToPublish.filter((t) => t.state === 'advanced').length} Teams
                </div>
              </div>

              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-light)',
                }}
              >
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.5px' }}>
                  Not Advancing / Concluded
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
                  {finalTeamsToPublish.filter((t) => t.state !== 'advanced').length} Teams
                </div>
              </div>

              {holdbackTeamIds.length > 0 && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '10px',
                    background: 'rgba(234, 179, 8, 0.08)',
                    border: '1px solid rgba(234, 179, 8, 0.25)',
                  }}
                >
                  <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#eab308', fontWeight: 700, letterSpacing: '0.5px' }}>
                    Held-Back Teams
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#eab308', marginTop: '2px' }}>
                    {holdbackTeamIds.length} Teams
                  </div>
                </div>
              )}
            </div>

            {/* Visibility Settings Summary */}
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(59, 130, 246, 0.06)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                fontSize: '0.78rem',
                color: 'var(--text-secondary)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '12px',
                alignItems: 'center',
              }}
            >
              <span style={{ fontWeight: 700, color: '#3b82f6' }}>Participant Visibility:</span>
              <span>{resultsConfig.showAdvancement ? '✓ Advancement Badge' : '✗ Advancement Hidden'}</span>
              <span>•</span>
              <span>{resultsConfig.showRank ? '✓ Standings Rank' : '✗ Rank Hidden'}</span>
              <span>•</span>
              <span>{resultsConfig.showScore ? '✓ Overall Score' : '✗ Score Hidden'}</span>
              <span>•</span>
              <span>{resultsConfig.showCriteria ? '✓ Criteria Breakdown' : '✗ Criteria Hidden'}</span>
            </div>

            {/* Filter Tabs for Teams */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
              <button
                type="button"
                onClick={() => setPublishFilter('all')}
                style={{
                  padding: '4px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: publishFilter === 'all' ? 'var(--primary)' : 'transparent',
                  color: publishFilter === 'all' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                All Teams ({finalTeamsToPublish.length})
              </button>
              <button
                type="button"
                onClick={() => setPublishFilter('advanced')}
                style={{
                  padding: '4px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: publishFilter === 'advanced' ? '#16a34a' : 'transparent',
                  color: publishFilter === 'advanced' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                Qualifying Only ({finalTeamsToPublish.filter((t) => t.state === 'advanced').length})
              </button>
              <button
                type="button"
                onClick={() => setPublishFilter('not_advanced')}
                style={{
                  padding: '4px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: publishFilter === 'not_advanced' ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: publishFilter === 'not_advanced' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                Not Advancing ({finalTeamsToPublish.filter((t) => t.state !== 'advanced').length})
              </button>
            </div>

            {/* Final Teams List */}
            <div
              style={{
                maxHeight: '340px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                paddingRight: '4px',
              }}
            >
              {finalTeamsToPublish
                .filter((t) => {
                  if (publishFilter === 'advanced') return t.state === 'advanced';
                  if (publishFilter === 'not_advanced') return t.state !== 'advanced';
                  return true;
                })
                .map((t) => {
                  const isHeld = holdbackTeamIds.includes(t.teamId);
                  const isAdv = t.state === 'advanced';

                  return (
                    <div
                      key={t.teamId}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background: isAdv ? 'rgba(34, 197, 94, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                        border: `1px solid ${isAdv ? 'rgba(34, 197, 94, 0.25)' : 'var(--border-light)'}`,
                        fontSize: '0.84rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {t.rank ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '26px',
                              height: '26px',
                              borderRadius: '50%',
                              background: t.rank === 1 ? 'rgba(234, 179, 8, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                              color: t.rank === 1 ? '#eab308' : 'var(--text-primary)',
                              fontSize: '0.78rem',
                              fontWeight: 800,
                            }}
                          >
                            #{t.rank}
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '26px',
                              height: '26px',
                              borderRadius: '50%',
                              background: 'rgba(255, 255, 255, 0.03)',
                              color: 'var(--text-muted)',
                              fontSize: '0.74rem',
                            }}
                          >
                            -
                          </span>
                        )}

                        <div>
                          <strong style={{ color: 'var(--text-primary)' }}>{t.name}</strong>
                          <span style={{ color: 'var(--text-muted)', marginLeft: '6px', fontSize: '0.76rem' }}>
                            ({t.registrationId})
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {t.score !== null && t.score !== undefined && (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            Score: <strong>{t.score}</strong>
                          </span>
                        )}

                        {isHeld ? (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: 'rgba(234, 179, 8, 0.15)',
                              color: '#eab308',
                              border: '1px solid rgba(234, 179, 8, 0.3)',
                            }}
                          >
                            HELD BACK
                          </span>
                        ) : isAdv ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: '4px',
                              background: 'rgba(34, 197, 94, 0.15)',
                              color: '#16a34a',
                              border: '1px solid rgba(34, 197, 94, 0.3)',
                            }}
                          >
                            <CheckCircle2 size={12} /> QUALIFIED
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              padding: '3px 8px',
                              borderRadius: '4px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              color: 'var(--text-muted)',
                              border: '1px solid var(--border-light)',
                            }}
                          >
                            NOT ADVANCED
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              {finalTeamsToPublish.length === 0 && (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                  No candidate teams detected in this round.
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => setPublishConfirmModalOpen(false)}
                className="btn btn-secondary"
                disabled={releasing}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRelease}
                className="btn btn-primary"
                disabled={releasing}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Share2 size={16} /> {releasing ? 'Publishing Results...' : 'Confirm & Publish Results to Teams'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default RoundResultsTab;
