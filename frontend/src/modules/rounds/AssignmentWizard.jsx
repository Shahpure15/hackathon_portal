import React, { useState, useEffect } from 'react';
import {
  Users, Check, X, AlertTriangle, ArrowRight, ArrowLeft, RefreshCw,
  Plus, Trash2, Shield, AlertCircle, CheckCircle2, Search, Sliders
} from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import Modal from '../../components/Modal';

export default function AssignmentWizard({ roundId, features = { pods: true }, onUpdated }) {
  const [step, setStep] = useState(1);
  const [teams, setTeams] = useState([]);
  const [judges, setJudges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeAssignments, setActiveAssignments] = useState([]);

  // Step 1: Team Selection
  const [sourceFilter, setSourceFilter] = useState('all'); // all | pod | ps | college | status
  const [sourceGroup, setSourceGroup] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeamIds, setSelectedTeamIds] = useState(new Set());
  const [everyNth, setEveryNth] = useState('');
  const [rangeInput, setRangeInput] = useState('');

  // Step 2: Judges
  const [selectedJudgeIds, setSelectedJudgeIds] = useState(new Set());

  // Step 3: Distribution
  const [mode, setMode] = useState('split'); // all | split
  const [judgesPerTeam, setJudgesPerTeam] = useState(2);
  const [checkConflicts, setCheckConflicts] = useState(true);

  // Step 4: Preview & Commit
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [overrideConflicts, setOverrideConflicts] = useState(false);
  const [replaceWizard, setReplaceWizard] = useState(false);
  const [committing, setCommitting] = useState(false);

  // Manual assign modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualTeams, setManualTeams] = useState([]);
  const [manualJudges, setManualJudges] = useState([]);

  const [revokingId, setRevokingId] = useState(null);

  const { addToast } = useToast();

  const loadData = async () => {
    try {
      setLoading(true);
      const [teamsRes, staffRes, assignRes] = await Promise.all([
        api.get(`/admin/rounds/${roundId}/assignable-teams`),
        api.get('/admin/staff/access'),
        api.get(`/admin/rounds/${roundId}/assignments`),
      ]);
      setTeams(teamsRes.data);
      setJudges(staffRes.data);
      setActiveAssignments(assignRes.data);
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to load assignment data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [roundId]);

  // Distinct groups for filtering
  const podsList = [...new Set(teams.map((t) => t.podName).filter(Boolean))];
  const psList = [...new Set(teams.map((t) => t.psTitle).filter(Boolean))];
  const collegeList = [...new Set(teams.map((t) => t.collegeName).filter(Boolean))];
  const statusList = [...new Set(teams.map((t) => t.status).filter(Boolean))];

  // Filtered teams list based on source and search
  const displayedTeams = teams.filter((t) => {
    if (sourceFilter === 'pod' && sourceGroup && t.podName !== sourceGroup) return false;
    if (sourceFilter === 'ps' && sourceGroup && t.psTitle !== sourceGroup) return false;
    if (sourceFilter === 'college' && sourceGroup && t.collegeName !== sourceGroup) return false;
    if (sourceFilter === 'status' && sourceGroup && t.status !== sourceGroup) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match =
        t.name.toLowerCase().includes(q) ||
        t.registrationId.toLowerCase().includes(q) ||
        (t.collegeName && t.collegeName.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  // Client-side selection helpers
  const handleSelectAll = () => {
    setSelectedTeamIds(new Set(displayedTeams.map((t) => t.id)));
  };

  const handleSelectNone = () => {
    setSelectedTeamIds(new Set());
  };

  const handleSelectInvert = () => {
    const next = new Set(selectedTeamIds);
    displayedTeams.forEach((t) => {
      if (next.has(t.id)) next.delete(t.id);
      else next.add(t.id);
    });
    setSelectedTeamIds(next);
  };

  const handleSelectOdd = () => {
    const next = new Set(selectedTeamIds);
    displayedTeams.forEach((t, idx) => {
      if ((idx + 1) % 2 === 1) next.add(t.id);
      else next.delete(t.id);
    });
    setSelectedTeamIds(next);
  };

  const handleSelectEven = () => {
    const next = new Set(selectedTeamIds);
    displayedTeams.forEach((t, idx) => {
      if ((idx + 1) % 2 === 0) next.add(t.id);
      else next.delete(t.id);
    });
    setSelectedTeamIds(next);
  };

  const handleApplyEveryNth = () => {
    const n = parseInt(everyNth, 10);
    if (isNaN(n) || n <= 0) return;
    const next = new Set(selectedTeamIds);
    displayedTeams.forEach((t, idx) => {
      if ((idx + 1) % n === 0) next.add(t.id);
    });
    setSelectedTeamIds(next);
  };

  const handleApplyRange = () => {
    if (!rangeInput.trim()) return;
    const next = new Set(selectedTeamIds);
    const parts = rangeInput.split(',');

    parts.forEach((part) => {
      const p = part.trim();
      if (p.includes('-')) {
        const [startStr, endStr] = p.split('-');
        const s = parseInt(startStr, 10);
        const e = parseInt(endStr, 10);
        if (!isNaN(s) && !isNaN(e)) {
          for (let i = Math.min(s, e); i <= Math.max(s, e); i++) {
            if (i >= 1 && i <= displayedTeams.length) {
              next.add(displayedTeams[i - 1].id);
            }
          }
        }
      } else {
        const idx = parseInt(p, 10);
        if (!isNaN(idx) && idx >= 1 && idx <= displayedTeams.length) {
          next.add(displayedTeams[idx - 1].id);
        }
      }
    });
    setSelectedTeamIds(next);
  };

  const toggleTeam = (id) => {
    const next = new Set(selectedTeamIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedTeamIds(next);
  };

  const toggleJudge = (id) => {
    const next = new Set(selectedJudgeIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedJudgeIds(next);
  };

  // Run preview
  const fetchPreview = async () => {
    if (selectedTeamIds.size === 0) {
      addToast('Select at least one team', 'error');
      return;
    }
    if (selectedJudgeIds.size === 0) {
      addToast('Select at least one judge', 'error');
      return;
    }

    setPreviewLoading(true);
    try {
      const payload = {
        teamIds: Array.from(selectedTeamIds),
        judgeVolunteerIds: Array.from(selectedJudgeIds),
        mode,
        judgesPerTeam: mode === 'all' ? selectedJudgeIds.size : parseInt(judgesPerTeam, 10),
      };
      const res = await api.post(`/admin/rounds/${roundId}/assignments/preview`, payload);
      setPreviewData(res.data);
      setStep(4);
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to generate preview', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!previewData) return;
    setCommitting(true);
    try {
      const payload = {
        pairs: previewData.pairs,
        token: previewData.token,
        replaceWizard,
        overrideConflicts,
      };
      const res = await api.post(`/admin/rounds/${roundId}/assignments/commit`, payload);
      addToast(`Assignments committed! Created: ${res.data.created}, Revived: ${res.data.revived}`, 'success');
      setStep(1);
      setSelectedTeamIds(new Set());
      setPreviewData(null);
      loadData();
      if (onUpdated) onUpdated();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Commit failed', 'error');
    } finally {
      setCommitting(false);
    }
  };

  const handleRevoke = async (id) => {
    try {
      await api.delete(`/admin/rounds/${roundId}/assignments/${id}`);
      addToast('Assignment revoked', 'success');
      loadData();
      if (onUpdated) onUpdated();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to revoke', 'error');
    }
  };

  const handleManualAssign = async () => {
    if (manualTeams.length === 0 || manualJudges.length === 0) {
      addToast('Select teams and judges for manual assignment', 'error');
      return;
    }
    try {
      await api.post(`/admin/rounds/${roundId}/assignments`, {
        teamIds: manualTeams,
        judgeVolunteerIds: manualJudges,
      });
      addToast('Manual assignments created!', 'success');
      setShowManualModal(false);
      setManualTeams([]);
      setManualJudges([]);
      loadData();
      if (onUpdated) onUpdated();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Manual assignment failed', 'error');
    }
  };

  if (loading) {
    return <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading assignment wizard...</div>;
  }

  return (
    <div>
      {/* Top action header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Judge Assignment Wizard</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Distribute teams across evaluators with conflict-checking and load balancing.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          onClick={() => setShowManualModal(true)}
        >
          <Plus size={15} /> Direct Manual Assign
        </button>
      </div>

      {/* Stepper Bar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: 'var(--bg-main)', padding: '10px', borderRadius: '10px' }}>
        {[
          { num: 1, label: '1. Select Teams' },
          { num: 2, label: '2. Select Judges' },
          { num: 3, label: '3. Distribution' },
          { num: 4, label: '4. Review & Commit' },
        ].map((s) => (
          <button
            key={s.num}
            type="button"
            onClick={() => {
              if (s.num <= step || (s.num === 4 && previewData)) setStep(s.num);
            }}
            style={{
              flex: 1,
              padding: '8px 12px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: step === s.num ? 700 : 500,
              background: step === s.num ? 'var(--primary-color, #3b82f6)' : 'transparent',
              color: step === s.num ? '#ffffff' : 'var(--text-secondary)',
              transition: 'all 0.2s',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* STEP 1: TEAMS */}
      {step === 1 && (
        <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label style={{ fontSize: '12px', fontWeight: 600 }}>Filter By:</label>
              <select
                className="input-field"
                value={sourceFilter}
                onChange={(e) => {
                  setSourceFilter(e.target.value);
                  setSourceGroup('');
                }}
              >
                <option value="all">All Teams</option>
                {features.pods && <option value="pod">By Pod</option>}
                <option value="ps">By Problem Statement</option>
                <option value="college">By College</option>
                <option value="status">By Status</option>
              </select>
            </div>

            {sourceFilter !== 'all' && (
              <select
                className="input-field"
                value={sourceGroup}
                onChange={(e) => setSourceGroup(e.target.value)}
              >
                <option value="">-- Choose {sourceFilter} --</option>
                {sourceFilter === 'pod' && podsList.map((p) => <option key={p} value={p}>{p}</option>)}
                {sourceFilter === 'ps' && psList.map((p) => <option key={p} value={p}>{p}</option>)}
                {sourceFilter === 'college' && collegeList.map((c) => <option key={c} value={c}>{c}</option>)}
                {sourceFilter === 'status' && statusList.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}

            <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type="text"
                className="input-field"
                style={{ width: '100%', paddingLeft: '32px' }}
                placeholder="Search team name, registration, college..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Helpers Bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '16px', padding: '10px 14px', background: 'var(--bg-main)', borderRadius: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Selection Helpers:</span>
            <button type="button" className="btn btn-secondary" style={{ fontSize: '11px', padding: '3px 8px' }} onClick={handleSelectAll}>All</button>
            <button type="button" className="btn btn-secondary" style={{ fontSize: '11px', padding: '3px 8px' }} onClick={handleSelectNone}>None</button>
            <button type="button" className="btn btn-secondary" style={{ fontSize: '11px', padding: '3px 8px' }} onClick={handleSelectInvert}>Invert</button>
            <button type="button" className="btn btn-secondary" style={{ fontSize: '11px', padding: '3px 8px' }} onClick={handleSelectOdd}>Odd</button>
            <button type="button" className="btn btn-secondary" style={{ fontSize: '11px', padding: '3px 8px' }} onClick={handleSelectEven}>Even</button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
              <input
                type="number"
                min="2"
                placeholder="Nth"
                className="input-field"
                style={{ width: '50px', padding: '3px 6px', fontSize: '11px' }}
                value={everyNth}
                onChange={(e) => setEveryNth(e.target.value)}
              />
              <button type="button" className="btn btn-secondary" style={{ fontSize: '11px', padding: '3px 8px' }} onClick={handleApplyEveryNth}>Apply Nth</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
              <input
                type="text"
                placeholder="1-10, 15, 20-25"
                className="input-field"
                style={{ width: '120px', padding: '3px 6px', fontSize: '11px' }}
                value={rangeInput}
                onChange={(e) => setRangeInput(e.target.value)}
              />
              <button type="button" className="btn btn-secondary" style={{ fontSize: '11px', padding: '3px 8px' }} onClick={handleApplyRange}>Apply Range</button>
            </div>

            <div style={{ marginLeft: 'auto', fontWeight: 700, fontSize: '12px', color: 'var(--primary-color, #3b82f6)' }}>
              Selected: {selectedTeamIds.size} / {teams.length}
            </div>
          </div>

          {/* Teams Table */}
          <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-main)', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 1 }}>
                  <th style={{ padding: '8px 12px', width: '36px' }}>
                    <input
                      type="checkbox"
                      checked={displayedTeams.length > 0 && displayedTeams.every((t) => selectedTeamIds.has(t.id))}
                      onChange={(e) => (e.target.checked ? handleSelectAll() : handleSelectNone())}
                    />
                  </th>
                  <th style={{ padding: '8px 12px' }}>#</th>
                  <th style={{ padding: '8px 12px' }}>Team Name</th>
                  <th style={{ padding: '8px 12px' }}>Reg ID</th>
                  <th style={{ padding: '8px 12px' }}>College / Org</th>
                  <th style={{ padding: '8px 12px' }}>Active Judges</th>
                </tr>
              </thead>
              <tbody>
                {displayedTeams.map((t, idx) => {
                  const isChecked = selectedTeamIds.has(t.id);
                  return (
                    <tr
                      key={t.id}
                      onClick={() => toggleTeam(t.id)}
                      style={{
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border-color)',
                        background: isChecked ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '8px 12px' }}>
                        <input type="checkbox" checked={isChecked} onChange={() => {}} />
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{idx + 1}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{t.name}</td>
                      <td style={{ padding: '8px 12px' }}>{t.registrationId}</td>
                      <td style={{ padding: '8px 12px' }}>{t.collegeName}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', background: t.activeJudgeCount > 0 ? 'rgba(34, 197, 94, 0.15)' : 'var(--bg-main)' }}>
                          {t.activeJudgeCount} judges
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              disabled={selectedTeamIds.size === 0}
              onClick={() => setStep(2)}
            >
              Next: Select Judges ({selectedTeamIds.size} teams) <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: JUDGES */}
      {step === 2 && (
        <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4 style={{ margin: 0, fontSize: '15px' }}>Choose Evaluators</h4>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--primary-color, #3b82f6)' }}>
              Selected Judges: {selectedJudgeIds.size}
            </div>
          </div>

          <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-main)', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 1 }}>
                  <th style={{ padding: '8px 12px', width: '36px' }}>
                    <input
                      type="checkbox"
                      checked={judges.length > 0 && judges.every((j) => selectedJudgeIds.has(j.volunteerId))}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedJudgeIds(new Set(judges.map((j) => j.volunteerId)));
                        else setSelectedJudgeIds(new Set());
                      }}
                    />
                  </th>
                  <th style={{ padding: '8px 12px' }}>Name</th>
                  <th style={{ padding: '8px 12px' }}>Type</th>
                  <th style={{ padding: '8px 12px' }}>Account Status</th>
                  <th style={{ padding: '8px 12px' }}>Email</th>
                </tr>
              </thead>
              <tbody>
                {judges.map((j) => {
                  const isChecked = selectedJudgeIds.has(j.volunteerId);
                  const isJudgeType = j.type === 'JUDGE';

                  return (
                    <tr
                      key={j.volunteerId}
                      onClick={() => toggleJudge(j.volunteerId)}
                      style={{
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border-color)',
                        background: isChecked ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '8px 12px' }}>
                        <input type="checkbox" checked={isChecked} onChange={() => {}} />
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{j.name}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', background: isJudgeType ? 'rgba(168, 85, 247, 0.15)' : 'var(--bg-main)' }}>
                          {j.type}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        {!j.userId ? (
                          <span style={{ fontSize: '11px', color: '#d97706', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <AlertCircle size={12} /> No login account
                          </span>
                        ) : j.status === 'invited' ? (
                          <span style={{ fontSize: '11px', color: '#d97706' }}>Invited</span>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#16a34a' }}>Active</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px' }}>{j.email || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => setStep(1)}
            >
              <ArrowLeft size={15} /> Back to Teams
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              disabled={selectedJudgeIds.size === 0}
              onClick={() => setStep(3)}
            >
              Next: Distribution Rules <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: DISTRIBUTION */}
      {step === 3 && (
        <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '10px', border: '1px solid var(--border-color)', maxWidth: '640px', margin: '0 auto' }}>
          <h4 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Assignment Distribution Rules</h4>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
              Assignment Mode:
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="dist_mode"
                  checked={mode === 'split'}
                  onChange={() => setMode('split')}
                />
                <div>
                  <strong>Split teams across judges (Load-balanced)</strong>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Each team is evaluated by N judges. Judges receive balanced team counts.
                  </div>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="dist_mode"
                  checked={mode === 'all'}
                  onChange={() => setMode('all')}
                />
                <div>
                  <strong>Every judge scores every team</strong>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    All selected judges are assigned to all selected teams.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {mode === 'split' && (
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Judges per team:
              </label>
              <input
                type="number"
                min="1"
                max={selectedJudgeIds.size}
                className="input-field"
                style={{ width: '120px' }}
                value={judgesPerTeam}
                onChange={(e) => setJudgesPerTeam(e.target.value)}
              />
            </div>
          )}

          <div style={{ marginBottom: '24px', padding: '12px', background: 'var(--bg-main)', borderRadius: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={checkConflicts}
                onChange={(e) => setCheckConflicts(e.target.checked)}
              />
              <span style={{ fontSize: '13px' }}>
                Detect institution/college conflicts (flags judges affiliated with the same college)
              </span>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => setStep(2)}
            >
              <ArrowLeft size={15} /> Back to Judges
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={fetchPreview}
              disabled={previewLoading}
            >
              {previewLoading ? 'Generating Plan...' : 'Generate Assignment Plan'} <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: REVIEW & COMMIT */}
      {step === 4 && previewData && (
        <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <h4 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Review Planned Assignments</h4>

          {/* Load Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div style={{ padding: '12px', background: 'var(--bg-main)', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 700 }}>{previewData.pairs.length}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Total Pairs</div>
            </div>
            <div style={{ padding: '12px', background: 'var(--bg-main)', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 700 }}>{previewData.loadReport.min}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Min Teams / Judge</div>
            </div>
            <div style={{ padding: '12px', background: 'var(--bg-main)', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 700 }}>{previewData.loadReport.max}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Max Teams / Judge</div>
            </div>
            <div style={{ padding: '12px', background: 'var(--bg-main)', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 700 }}>{previewData.loadReport.avg.toFixed(1)}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Avg Teams / Judge</div>
            </div>
          </div>

          {/* Warnings */}
          {previewData.warnings && previewData.warnings.length > 0 && (
            <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#d97706', fontSize: '13px' }}>
              <strong>Warnings:</strong>
              <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                {previewData.warnings.map((w, idx) => (
                  <li key={idx}>{w.message || `Code: ${w.code}`}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Conflicts */}
          {previewData.conflicts && previewData.conflicts.length > 0 && (
            <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', fontSize: '13px' }}>
              <strong>Detected Conflicts ({previewData.conflicts.length}):</strong>
              <p style={{ margin: '4px 0 8px 0' }}>The following judges share an institution affiliation with the assigned team:</p>
              <ul style={{ margin: '0 0 10px 16px', padding: 0 }}>
                {previewData.conflicts.map((c, idx) => (
                  <li key={idx}>Affiliation match on "{c.value}"</li>
                ))}
              </ul>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={overrideConflicts}
                  onChange={(e) => setOverrideConflicts(e.target.checked)}
                />
                Override conflicts and commit anyway
              </label>
            </div>
          )}

          {/* Replace Wizard option */}
          <div style={{ marginBottom: '20px', padding: '12px', background: 'var(--bg-main)', borderRadius: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={replaceWizard}
                onChange={(e) => setReplaceWizard(e.target.checked)}
              />
              <span style={{ fontSize: '13px' }}>
                Replace earlier wizard assignments for these teams (revokes previous wizard rows not in this plan; manual assignments are untouched)
              </span>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => setStep(3)}
            >
              <ArrowLeft size={15} /> Adjust Rules
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={handleCommit}
              disabled={committing || (previewData.conflicts?.length > 0 && !overrideConflicts)}
            >
              <CheckCircle2 size={16} /> {committing ? 'Committing...' : 'Commit Assignments'}
            </button>
          </div>
        </div>
      )}

      {/* Existing Active Assignments Table */}
      <div style={{ marginTop: '30px', background: 'var(--bg-surface)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
        <h4 style={{ margin: '0 0 14px 0', fontSize: '15px' }}>Current Active Assignments ({activeAssignments.length})</h4>
        {activeAssignments.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
            No judge assignments currently active in this round.
          </div>
        ) : (
          <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-main)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '8px 12px' }}>Team</th>
                  <th style={{ padding: '8px 12px' }}>Reg ID</th>
                  <th style={{ padding: '8px 12px' }}>Assigned Judge</th>
                  <th style={{ padding: '8px 12px' }}>Source</th>
                  <th style={{ padding: '8px 12px' }}>Status</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {activeAssignments.map((a) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{a.teamName}</td>
                    <td style={{ padding: '8px 12px' }}>{a.teamRegistrationId}</td>
                    <td style={{ padding: '8px 12px' }}>{a.judgeName}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: a.source === 'manual' ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-main)',
                          color: a.source === 'manual' ? '#3b82f6' : 'inherit',
                        }}
                      >
                        {a.source === 'manual' ? 'Manual (Always wins)' : 'Wizard'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ fontSize: '12px', color: a.status === 'active' ? '#16a34a' : '#ef4444' }}>
                        {a.status}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      {a.status === 'active' && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '3px 8px', fontSize: '11px', color: '#ef4444' }}
                          onClick={() => handleRevoke(a.id)}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manual Assignment Modal */}
      <Modal
        isOpen={showManualModal}
        onClose={() => setShowManualModal(false)}
        title="Direct Manual Assignment"
        maxWidth="600px"
      >
        <div style={{ marginBottom: '14px' }}>
          <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', fontWeight: 600 }}>
            Manual (Always Wins)
          </span>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>
            Select Teams ({manualTeams.length} selected):
          </label>
          <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px', background: 'var(--bg-main)' }}>
            {teams.map((t) => (
              <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', fontSize: '13px', cursor: 'pointer', borderRadius: '4px' }}>
                <input
                  type="checkbox"
                  checked={manualTeams.includes(t.id)}
                  onChange={(e) => {
                    if (e.target.checked) setManualTeams([...manualTeams, t.id]);
                    else setManualTeams(manualTeams.filter((id) => id !== t.id));
                  }}
                />
                <span>{t.name} ({t.registrationId})</span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>
            Select Judges ({manualJudges.length} selected):
          </label>
          <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px', background: 'var(--bg-main)' }}>
            {judges.map((j) => (
              <label key={j.volunteerId} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', fontSize: '13px', cursor: 'pointer', borderRadius: '4px' }}>
                <input
                  type="checkbox"
                  checked={manualJudges.includes(j.volunteerId)}
                  onChange={(e) => {
                    if (e.target.checked) setManualJudges([...manualJudges, j.volunteerId]);
                    else setManualJudges(manualJudges.filter((id) => id !== j.volunteerId));
                  }}
                />
                <span>{j.name} ({j.type})</span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" className="btn btn-secondary" onClick={() => setShowManualModal(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleManualAssign}
            disabled={manualTeams.length === 0 || manualJudges.length === 0}
          >
            Assign Manually
          </button>
        </div>
      </Modal>
    </div>
  );
}
