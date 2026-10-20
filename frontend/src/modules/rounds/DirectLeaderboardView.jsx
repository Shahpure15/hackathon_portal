import React, { useState, useEffect, useMemo } from 'react';
import {
  Trophy,
  Award,
  Download,
  Search,
  Filter,
  RefreshCw,
  Eye,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  ChevronRight,
  Users,
  Layers,
} from 'lucide-react';
import api from '../../services/api';
import EvaluationTrailModal from './EvaluationTrailModal';
import { useToast } from '../../contexts/ToastContext';

export const DirectLeaderboardView = ({ defaultRoundId }) => {
  const { addToast } = useToast();

  const [rounds, setRounds] = useState([]);
  const [selectedRoundId, setSelectedRoundId] = useState(defaultRoundId || '');
  const [loadingRounds, setLoadingRounds] = useState(true);

  // Leaderboard data
  const [leaderboard, setLeaderboard] = useState({ rows: [], unscored: [] });
  const [loadingData, setLoadingData] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | scored | unscored
  const [exporting, setExporting] = useState(false);
  const [exportingDetailed, setExportingDetailed] = useState(false);

  // Audit trail modal
  const [trailModalTeam, setTrailModalTeam] = useState(null);

  // Fetch all rounds
  useEffect(() => {
    const fetchRounds = async () => {
      setLoadingRounds(true);
      try {
        const res = await api.get('/admin/rounds');
        const list = res.data || [];
        // Only include rounds that have evaluation enabled
        const evalRounds = list.filter((r) => r.evaluationEnabled !== false);
        setRounds(evalRounds.length > 0 ? evalRounds : list);
        if (evalRounds.length > 0 && !selectedRoundId) {
          setSelectedRoundId(evalRounds[0].id);
        } else if (list.length > 0 && !selectedRoundId) {
          setSelectedRoundId(list[0].id);
        }
      } catch (err) {
        addToast('Failed to load competition rounds', 'error');
      } finally {
        setLoadingRounds(false);
      }
    };
    fetchRounds();
  }, [defaultRoundId]);

  // Fetch leaderboard when selectedRoundId changes
  const fetchLeaderboard = async (roundId) => {
    if (!roundId) return;
    setLoadingData(true);
    try {
      const res = await api.get(`/admin/rounds/${roundId}/leaderboard`);
      setLeaderboard(res.data || { rows: [], unscored: [] });
    } catch (err) {
      console.error('Failed to load leaderboard', err);
      addToast('Failed to load round leaderboard rankings', 'error');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (selectedRoundId) {
      fetchLeaderboard(selectedRoundId);
    }
  }, [selectedRoundId]);

  const selectedRound = useMemo(() => {
    return rounds.find((r) => r.id === selectedRoundId);
  }, [rounds, selectedRoundId]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    const rows = leaderboard.rows || [];
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => {
      const name = (r.name || r.teamName || '').toLowerCase();
      const reg = (r.registrationId || '').toLowerCase();
      const ps = (r.psTitle || '').toLowerCase();
      return name.includes(q) || reg.includes(q) || ps.includes(q);
    });
  }, [leaderboard.rows, search]);

  const filteredUnscored = useMemo(() => {
    const list = leaderboard.unscored || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((r) => {
      const name = (r.name || r.teamName || '').toLowerCase();
      const reg = (r.registrationId || '').toLowerCase();
      return name.includes(q) || reg.includes(q);
    });
  }, [leaderboard.unscored, search]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const rows = leaderboard.rows || [];
    const unscored = leaderboard.unscored || [];
    const totalTeams = rows.length + unscored.length;
    if (rows.length === 0) {
      return { totalTeams, scoredCount: 0, topScore: null, avgScore: null, winner: null };
    }
    const scores = rows.map((r) => Number(r.totalScorePct || r.score || 0)).filter((s) => !isNaN(s));
    const max = Math.max(...scores);
    const sum = scores.reduce((a, b) => a + b, 0);
    const avg = scores.length > 0 ? (sum / scores.length).toFixed(1) : null;
    const winner = rows[0]?.name || rows[0]?.teamName || null;
    return {
      totalTeams,
      scoredCount: rows.length,
      topScore: max !== -Infinity ? max.toFixed(1) : null,
      avgScore: avg,
      winner,
    };
  }, [leaderboard]);

  // Export Leaderboard (Summary Scores)
  const handleExport = async () => {
    if (!selectedRoundId) return;
    setExporting(true);
    try {
      const res = await api.get(`/admin/rounds/${selectedRoundId}/leaderboard/export`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${selectedRound?.name || 'Leaderboard'}_Rankings.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast('Leaderboard scores export downloaded successfully', 'success');
    } catch (err) {
      // Fallback: Export CSV directly in browser if backend endpoint fails
      try {
        const rows = leaderboard.rows || [];
        if (rows.length === 0) {
          addToast('No leaderboard rows to export', 'info');
          return;
        }
        let csv = 'Rank,Team Name,Registration ID,Score (%),Judges Evaluated,Provisional\n';
        rows.forEach((r, idx) => {
          csv += `"${idx + 1}","${r.name || r.teamName || ''}","${r.registrationId || ''}","${r.totalScorePct ?? r.score ?? 0}","${r.judgesCount || 0}","${r.isProvisional ? 'Yes' : 'No'}"\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${selectedRound?.name || 'Leaderboard'}_Rankings.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        addToast('Exported leaderboard as CSV', 'success');
      } catch (e) {
        addToast('Failed to export leaderboard', 'error');
      }
    } finally {
      setExporting(false);
    }
  };

  // Export Detailed Print-Ready Zip of Workbooks
  const handleExportDetailed = async () => {
    if (!selectedRoundId) return;
    setExportingDetailed(true);
    try {
      const res = await api.get(`/admin/rounds/${selectedRoundId}/export/detailed-sheets`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/zip' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${selectedRound?.name || 'Round'}_Detailed_Evaluation_Sheets.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast('Detailed evaluation sheets ZIP downloaded successfully!', 'success');
    } catch (err) {
      console.error('Failed to export detailed sheets', err);
      addToast('Failed to export detailed evaluation sheets', 'error');
    } finally {
      setExportingDetailed(false);
    }
  };

  const getRankBadge = (rank) => {
    if (rank === 1) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.2), rgba(234, 179, 8, 0.05))',
            color: '#eab308',
            border: '1px solid rgba(234, 179, 8, 0.4)',
            fontWeight: 800,
            fontSize: '0.82rem',
          }}
        >
          <Trophy size={14} /> #1 Gold
        </span>
      );
    }
    if (rank === 2) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
            borderRadius: '6px',
            background: 'rgba(148, 163, 184, 0.15)',
            color: '#94a3b8',
            border: '1px solid rgba(148, 163, 184, 0.3)',
            fontWeight: 800,
            fontSize: '0.82rem',
          }}
        >
          <Award size={14} /> #2 Silver
        </span>
      );
    }
    if (rank === 3) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
            borderRadius: '6px',
            background: 'rgba(217, 119, 6, 0.15)',
            color: '#d97706',
            border: '1px solid rgba(217, 119, 6, 0.3)',
            fontWeight: 800,
            fontSize: '0.82rem',
          }}
        >
          <Award size={14} /> #3 Bronze
        </span>
      );
    }
    return (
      <span style={{ fontWeight: 700, color: 'var(--text-secondary)', paddingLeft: '8px' }}>
        #{rank}
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
      {/* Top Controls: Round Selector + Export */}
      <div
        className="glass-card"
        style={{
          padding: '20px 24px',
          borderRadius: '14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Trophy size={24} color="var(--primary)" />
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Direct Leaderboard</h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Live evaluation rankings, aggregate scores, and judging audit trails
              </p>
            </div>
          </div>

          {/* Round Selector Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Competition Round:
            </label>
            <select
              className="form-input"
              value={selectedRoundId}
              onChange={(e) => setSelectedRoundId(e.target.value)}
              style={{ fontWeight: 700, minWidth: '220px', padding: '6px 12px' }}
            >
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} (Round #{r.number})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={() => fetchLeaderboard(selectedRoundId)}
            disabled={loadingData}
            className="btn btn-secondary touch-target"
            title="Refresh Leaderboard"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}
          >
            <RefreshCw size={14} className={loadingData ? 'spin' : ''} /> Refresh
          </button>

          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || (leaderboard.rows || []).length === 0}
            className="btn btn-primary touch-target"
            title="Download summary spreadsheet of scores and rankings"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}
          >
            <Download size={14} /> {exporting ? 'Exporting...' : 'Export Scores (XLSX)'}
          </button>

          <button
            type="button"
            onClick={handleExportDetailed}
            disabled={exportingDetailed || (leaderboard.rows || []).length === 0}
            className="btn btn-secondary touch-target"
            title="Export print-ready multi-sheet workbook with one detailed evaluation sheet per team"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}
          >
            <Download size={14} /> {exportingDetailed ? 'Exporting Sheets...' : 'Detailed Team Sheets (XLSX)'}
          </button>
        </div>
      </div>

      {/* Metric Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '12px' }}>
          <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Evaluated Teams
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '4px', color: 'var(--primary)' }}>
            {metrics.scoredCount} <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>/ {metrics.totalTeams} Total</span>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '12px' }}>
          <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Highest Score
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '4px', color: '#22c55e' }}>
            {metrics.topScore !== null ? `${metrics.topScore}%` : '—'}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '12px' }}>
          <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Average Score
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, marginTop: '4px' }}>
            {metrics.avgScore !== null ? `${metrics.avgScore}%` : '—'}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '12px' }}>
          <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Current Leader (#1)
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: '8px', color: '#eab308', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {metrics.winner || 'No evaluations yet'}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        className="glass-panel"
        style={{
          padding: '14px 18px',
          borderRadius: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="text"
            className="form-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teams by name, registration ID, or problem statement..."
            style={{ paddingLeft: '36px', width: '100%' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`btn ${statusFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.78rem', padding: '4px 12px', height: '32px' }}
          >
            All Teams ({metrics.totalTeams})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('scored')}
            className={`btn ${statusFilter === 'scored' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.78rem', padding: '4px 12px', height: '32px' }}
          >
            Scored ({metrics.scoredCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('unscored')}
            className={`btn ${statusFilter === 'unscored' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.78rem', padding: '4px 12px', height: '32px' }}
          >
            Unscored ({(leaderboard.unscored || []).length})
          </button>
        </div>
      </div>

      {/* Leaderboard Table */}
      {loadingData ? (
        <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', borderRadius: '14px', color: 'var(--text-secondary)' }}>
          <RefreshCw size={28} className="spin" style={{ marginBottom: '12px' }} />
          <p style={{ margin: 0, fontSize: '0.95rem' }}>Loading live evaluations and standings...</p>
        </div>
      ) : filteredRows.length === 0 && (statusFilter !== 'unscored') ? (
        <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', borderRadius: '14px', color: 'var(--text-muted)' }}>
          <Trophy size={36} style={{ marginBottom: '12px', opacity: 0.5 }} />
          <h4 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', color: 'var(--text-primary)' }}>
            No evaluated teams found
          </h4>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {search ? 'Try adjusting your search query.' : 'Judges have not submitted scores for this round yet.'}
          </p>
        </div>
      ) : (
        <div
          className="glass-card"
          style={{
            borderRadius: '14px',
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-glass, rgba(125, 125, 125, 0.04))' }}>
                  <th style={{ padding: '14px 16px', fontWeight: 700, width: '110px' }}>Rank</th>
                  <th style={{ padding: '14px 16px', fontWeight: 700 }}>Team Details</th>
                  <th style={{ padding: '14px 16px', fontWeight: 700 }}>Problem Statement</th>
                  <th style={{ padding: '14px 16px', fontWeight: 700, textAlign: 'center', width: '140px' }}>Aggregate Score</th>
                  <th style={{ padding: '14px 16px', fontWeight: 700, textAlign: 'center', width: '110px' }}>Evaluations</th>
                  <th style={{ padding: '14px 16px', fontWeight: 700, textAlign: 'center', width: '120px' }}>Audit Trail</th>
                </tr>
              </thead>
              <tbody>
                {statusFilter !== 'unscored' && filteredRows.map((row, idx) => {
                  const rank = idx + 1;
                  const score = Number(row.totalScorePct ?? row.score ?? 0).toFixed(1);
                  const isProvisional = Boolean(row.isProvisional);

                  return (
                    <tr
                      key={row.teamId || idx}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        transition: 'background 0.2s',
                      }}
                      className="hover-row"
                    >
                      <td style={{ padding: '14px 16px' }}>{getRankBadge(rank)}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                          {row.name || row.teamName}
                        </div>
                        {row.registrationId && (
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                            ID: {row.registrationId}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', maxWidth: '280px' }}>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {row.psTitle || '—'}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                          <span
                            style={{
                              fontSize: '1.05rem',
                              fontWeight: 800,
                              color: rank <= 3 ? 'var(--primary)' : 'var(--text-primary)',
                            }}
                          >
                            {score}%
                          </span>
                          {isProvisional && (
                            <span style={{ fontSize: '0.68rem', color: '#f59e0b', fontWeight: 700 }}>
                              Provisional
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: 'rgba(59, 130, 246, 0.1)',
                            color: 'var(--primary)',
                          }}
                        >
                          {row.judgesCount || 0} judges
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => setTrailModalTeam(row)}
                          className="btn btn-secondary touch-target"
                          style={{ fontSize: '0.76rem', padding: '4px 10px', height: '28px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          title="View detailed judge evaluations, scores and feedback breakdown"
                        >
                          <Eye size={13} /> View Trail
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {/* Unscored section if requested or in 'all' view */}
                {(statusFilter === 'unscored' || (statusFilter === 'all' && filteredUnscored.length > 0)) && (
                  filteredUnscored.map((team, uIdx) => (
                    <tr
                      key={team.teamId || `un_${uIdx}`}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        opacity: 0.7,
                      }}
                    >
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>—</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{team.name || team.teamName}</div>
                        {team.registrationId && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>ID: {team.registrationId}</div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{team.psTitle || '—'}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <span style={{ fontSize: '0.76rem', fontStyle: 'italic' }}>Pending Evaluation</span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>0</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>No Trail</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Evaluation Trail Modal */}
      {trailModalTeam && selectedRoundId && (
        <EvaluationTrailModal
          roundId={selectedRoundId}
          teamId={trailModalTeam.teamId || trailModalTeam.id}
          teamName={trailModalTeam.name || trailModalTeam.teamName}
          onClose={() => setTrailModalTeam(null)}
          onEvaluationCleared={() => fetchLeaderboardData(selectedRoundId)}
        />
      )}
    </div>
  );
};

export default DirectLeaderboardView;
