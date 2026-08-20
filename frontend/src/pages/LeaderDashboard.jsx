import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, Layers, FileText, CheckCircle, Clock, AlertTriangle, LogOut, Info, ShieldAlert, Lock, Menu, Eye, EyeOff, ChevronLeft, ChevronRight
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';


import { useToast } from '../contexts/ToastContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import Navbar from '../components/Navbar';
import Skeleton from '../components/Skeleton';
import IconButton from '../components/IconButton';
import AmbientCursorGlow from '../components/AmbientCursorGlow';
import TeamQRCode from '../components/TeamQRCode';



const formatContact = (contactStr) => {
  if (!contactStr) return { email: '', phone: '' };
  if (contactStr.includes(' | ')) {
    const parts = contactStr.split(' | ');
    return { email: parts[0] || '', phone: parts[1] || '' };
  }
  if (contactStr.includes('@')) {
    return { email: contactStr, phone: '' };
  }
  return { email: '', phone: contactStr };
};

const LeaderDashboard = () => {
  const { logout } = useAuth();
  const { addToast } = useToast();
  
  const [teamInfo, setTeamInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('leaderActiveTab') || 'team'); // 'team', 'ps', 'settings'
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1000);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1000);
      if (window.innerWidth >= 1000) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [viewingPS, setViewingPS] = useState(null);
  const [selectConfirmState, setSelectConfirmState] = useState(null);
  const [showTutorialModal, setShowTutorialModal] = useState(false);
  const [demoConfirmState, setDemoConfirmState] = useState(null);
  const [demoLockedState, setDemoLockedState] = useState(null);

  const handleTabClick = (tabName) => {
    setActiveTab(tabName);
    localStorage.setItem('leaderActiveTab', tabName);
    setMobileMenuOpen(false);
  };
  
  // Change password states
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      addToast('All fields are required', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast('New passwords do not match', 'error');
      return;
    }
    if (newPassword === oldPassword) {
      addToast('New password cannot be the same as your current password', 'error');
      return;
    }
    setIsChangingPassword(true);
    try {
      await api.post('/auth/change-password', {
        oldPassword,
        newPassword
      });
      addToast('Password changed successfully!', 'success');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to change password', 'error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Config/Release state
  const [psReleaseAt, setPsReleaseAt] = useState(null);
  const [serverTime, setServerTime] = useState(null);
  const [clockDrift, setClockDrift] = useState(0); // diff in ms between server and local clock
  const [isReleased, setIsReleased] = useState(false);
  const [countdownText, setCountdownText] = useState('');
  const [configLoaded, setConfigLoaded] = useState(false);

  // Verification / Check-in gating state
  const [verificationStatus, setVerificationStatus] = useState({
    verified: true,
    gatingEnabled: false,
    resolvedMemberName: null
  });
  const [updatedPsId, setUpdatedPsId] = useState(null);

  // Problem statements listing
  const [statements, setStatements] = useState([]);
  const [statementsLoading, setStatementsLoading] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);

  // Evaluation rounds state
  const [evalRounds, setEvalRounds] = useState([]);
  const [submittingRoundId, setSubmittingRoundId] = useState(null);
  const [roundInputs, setRoundInputs] = useState({});

  useEffect(() => {
    fetchTeamData();
    fetchConfig();
    fetchVerificationStatus();
    fetchEvalRounds();
  }, []);

  const fetchEvalRounds = async () => {
    try {
      const res = await api.get('/leader/evaluation-rounds');
      setEvalRounds(res.data || []);
      const initialInputs = {};
      (res.data || []).forEach(r => {
        const subAnswers = r.submission?.answers || {};
        initialInputs[r.id] = {
          driveLink: r.submission?.driveLink || '',
          githubLink: r.submission?.githubLink || '',
          answers: { ...subAnswers }
        };
      });
      setRoundInputs(initialInputs);
    } catch (e) {
      console.error('Failed to fetch evaluation rounds', e);
    }
  };

  const handleRoundSubmit = async (roundId) => {
    const data = roundInputs[roundId] || {};
    setSubmittingRoundId(roundId);
    try {
      await api.post(`/leader/evaluation-rounds/${roundId}/submit`, {
        driveLink: data.driveLink || null,
        githubLink: data.githubLink || null,
        answers: data.answers || {}
      });
      addToast('Submission updated successfully!', 'success');
      fetchEvalRounds();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to update submission', 'error');
    } finally {
      setSubmittingRoundId(null);
    }
  };

  const fetchVerificationStatus = async () => {
    try {
      const res = await api.get('/leader/verification-status');
      setVerificationStatus(res.data);
    } catch (e) {
      console.error('Failed to fetch verification status', e);
    }
  };







  const fetchTeamData = async () => {
    try {
      const res = await api.get('/leader/me');
      setTeamInfo(res.data);
    } catch (err) {
      addToast('Failed to fetch team dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await api.get('/leader/config');
      if (res.data.psReleaseAt) {
        const releaseTime = new Date(res.data.psReleaseAt).getTime();
        const servTime = new Date(res.data.serverTime).getTime();
        const localTime = Date.now();
        
        setPsReleaseAt(releaseTime);
        setServerTime(servTime);
        setClockDrift(servTime - localTime);
        
        if (servTime >= releaseTime) {
          setIsReleased(true);
          fetchProblemStatements();
        }
      } else {
        setPsReleaseAt(null);
        setIsReleased(false);
      }
    } catch (err) {
      console.error('Failed to load release schedule configuration', err);
    } finally {
      setConfigLoaded(true);
    }
  };

  const fetchProblemStatements = async () => {
    setStatementsLoading(true);
    try {
      const res = await api.get('/leader/problem-statements');
      setStatements(res.data || []);
    } catch (err) {
      if (err.response?.status === 403) {
        setIsReleased(false);
      } else {
        addToast('Failed to load problem statements', 'error');
      }
    } finally {
      setStatementsLoading(false);
    }
  };

  // Countdown timer tick & units
  const [countdownUnits, setCountdownUnits] = useState({ days: 0, hours: 0, mins: 0, secs: 0 });

  useEffect(() => {
    if (!psReleaseAt || isReleased) return;

    const timer = setInterval(() => {
      const currentServerTime = Date.now() + clockDrift;
      const diff = psReleaseAt - currentServerTime;

      if (diff <= 0) {
        setIsReleased(true);
        clearInterval(timer);
        fetchProblemStatements();
        addToast('Problem statements are now released! Select your topic.', 'success');
      } else {
        // Format countdown text & units
        const days = Math.floor(diff / (24 * 3600 * 1000));
        const hours = Math.floor((diff % (24 * 3600 * 1000)) / (3600 * 1000));
        const mins = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
        const secs = Math.floor((diff % (60 * 1000)) / 1000);

        setCountdownUnits({ days, hours, mins, secs });
        const pad = (n) => String(n).padStart(2, '0');
        setCountdownText(`${days > 0 ? days + 'd ' : ''}${pad(hours)}h : ${pad(mins)}m : ${pad(secs)}s`);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [psReleaseAt, isReleased, clockDrift]);

  const executeSelectPS = async () => {
    if (!selectConfirmState) return;
    const { psId, psCode, psTitle } = selectConfirmState;
    setIsSelecting(true);
    try {
      await api.post('/leader/select-ps', { psId });
      addToast(`Successfully locked in: [${psCode}] ${psTitle}!`, 'success');
      setSelectConfirmState(null);
      fetchTeamData();
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (detail === 'PS_FULL') {
        addToast('Conflict: This problem statement just filled up! Pick another.', 'error');
        setSelectConfirmState(null);
        fetchProblemStatements();
      } else if (detail === 'ALREADY_SELECTED') {
        addToast('Conflict: Your team has already locked in a selection.', 'error');
        setSelectConfirmState(null);
        fetchTeamData();
      } else if (detail === 'NOT_CHECKED_IN') {
        addToast('Check-in required — please complete verification at the help desk to select your problem statement.', 'error');
        setSelectConfirmState(null);
        fetchVerificationStatus();
      } else {
        addToast(detail || 'Selection failed. Check connection.', 'error');
      }
    } finally {
      setIsSelecting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-main)', position: 'relative' }}>
        <AmbientCursorGlow />
        <div style={{ padding: '76px 24px 40px', maxWidth: '1600px', margin: '0 auto' }}>
          <Skeleton variant="card" count={3} style={{ marginBottom: '16px' }} />
        </div>
      </div>
    );
  }

  const hasSelection = !!teamInfo?.psSelection;

  const psGated = verificationStatus.gatingEnabled && !verificationStatus.verified;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', position: 'relative' }}>
      <Navbar
        title="MIT India Hackathon"
        user={{ username: teamInfo?.name || 'Leader', role: 'Team Leader' }}
        onLogout={logout}
        activeTab={activeTab}
        onTabChange={handleTabClick}
        navItems={[
          { id: 'team', label: 'Team Roster', icon: <Users size={16} /> },
          { id: 'ps', label: 'Problem Selection', icon: <Layers size={16} /> },
          { id: 'settings', label: 'Change Password', icon: <Lock size={16} /> }
        ]}
      />

      {/* Main Content Area */}
      <div 
        className="main-content" 
        style={{ 
          padding: '76px 24px 40px 24px', 
          maxWidth: '1600px', 
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box'
        }}
      >
        {/* Header Block */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1 style={{ fontSize: '2.25rem', fontWeight: 800 }}>{teamInfo.name}</h1>
              {teamInfo.psSelection ? (
                <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', background: 'rgba(62, 125, 71, 0.15)', color: 'var(--success)', border: '1px solid rgba(62, 125, 71, 0.3)' }}>
                  Topic Locked [{teamInfo.psSelection.code || teamInfo.psSelection.problemStatement?.code}]
                </span>
              ) : (
                <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', background: 'rgba(224, 92, 26, 0.15)', color: 'var(--warning)', border: '1px solid rgba(224, 92, 26, 0.3)' }}>
                  Pending Topic Selection
                </span>
              )}
            </div>
            <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
              Team Code: <strong style={{ color: 'var(--text-primary)' }}>{teamInfo.registrationId}</strong> | {teamInfo.collegeName}
            </p>
          </div>
        </div>

        <div style={{ display: activeTab === 'team' ? 'block' : 'none' }}>
          <div>
            {/* Dashboard Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginBottom: '24px' }}>
              {/* Team Roster Card */}
              <div className="glass-card" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Users size={18} style={{ color: 'var(--primary)' }} />
                  Team Roster ({teamInfo.members.length} members)
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {teamInfo.members.map((m) => (
                    <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(0,0,0,0.01)', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}>
                      <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{m.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', wordBreak: 'break-word' }}>{m.email} | {m.phone}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {m.idVerified ? (
                          <span style={{ color: 'var(--success)', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(16, 185, 129, 0.1)', padding: '4px 8px', borderRadius: '6px', whiteSpace: 'nowrap' }}>✓ Verified</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', background: 'rgba(255, 255, 255, 0.03)', padding: '4px 8px', borderRadius: '6px', whiteSpace: 'nowrap' }}>Awaiting Venue Check-in</span>
                        )}
                      </div>
                    </div>
                  ))}

                </div>
              </div>

              {/* Check-in QR Code Card */}
              <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, width: '100%', marginBottom: '12px', textAlign: 'center' }}>
                  Check-in QR Code
                </h3>
                <TeamQRCode teamId={teamInfo.id} eventId={teamInfo.eventId} teamName={teamInfo.name} />
              </div>

              {/* POD & Desk Assignment Card */}

              <div className="glass-card" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Layers size={18} style={{ color: 'var(--primary)' }} />
                  Venue Location & POD Group
                </h3>

                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ flex: 1, padding: '12px', borderRadius: '8px', background: 'rgba(185, 111, 56, 0.08)', border: '1px solid rgba(185, 111, 56, 0.2)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Category</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, textTransform: 'capitalize', color: 'var(--primary)', marginTop: '2px' }}>
                      {teamInfo.category || 'Engineering'}
                    </div>
                  </div>
                  <div style={{ flex: 1, padding: '12px', borderRadius: '8px', background: 'rgba(62, 125, 71, 0.08)', border: '1px solid rgba(62, 125, 71, 0.2)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Desk / Bench</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--success)', marginTop: '2px' }}>
                      {teamInfo.deskNumber || 'Not assigned yet'}
                    </div>
                  </div>
                </div>

                {teamInfo.pod ? (
                  <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '8px' }}>POD: {teamInfo.pod.name}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>POD Mentors:</span>
                      {teamInfo.pod.mentors.map((men, i) => (
                        <div key={i} style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.01)', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}>
                          <div style={{ fontWeight: 600 }}>{men.name} <span style={{ fontSize: '0.7rem', color: 'var(--primary)' }}>({men.type})</span></div>
                          <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                            <div>{formatContact(men.contact).email || men.contact}</div>
                            {formatContact(men.contact).phone && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatContact(men.contact).phone}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)' }}>
                    <p style={{ fontSize: '0.85rem' }}>POD grouping is currently unassigned.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Evaluation Submissions Section */}
            {evalRounds.length > 0 && (
              <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <FileText size={20} style={{ color: 'var(--primary)' }} />
                  Evaluation Submissions
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {evalRounds.map((r) => {
                    const inputs = roundInputs[r.id] || { driveLink: '', githubLink: '', answers: {} };
                    return (
                      <div key={r.id} style={{ padding: '20px', borderRadius: '12px', background: 'rgba(0,0,0,0.01)', border: '1px solid var(--border-light)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                            {r.name} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>(Round #{r.roundNumber})</span>
                          </div>
                          <span style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: '6px', fontWeight: 700, background: r.isOpen ? 'var(--success-glow)' : 'rgba(255,255,255,0.05)', color: r.isOpen ? 'var(--success)' : 'var(--text-muted)' }}>
                            {r.isOpen ? '● SUBMISSION OPEN' : '🔒 SUBMISSIONS CLOSED'}
                          </span>
                        </div>

                        {r.description && (
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
                            {r.description}
                          </p>
                        )}

                        {r.isOpen ? (
                          <form onSubmit={(e) => { e.preventDefault(); handleRoundSubmit(r.id); }} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
                            {r.fields && r.fields.length > 0 ? (
                              r.fields.map((f, idx) => {
                                const fname = f.name || `Field ${idx + 1}`;
                                const fid = f.id || fname;
                                const currentVal = inputs.answers?.[fname] ?? inputs.answers?.[fid] ?? '';

                                return (
                                  <div key={idx}>
                                    <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                      {fname} {f.required && <span style={{ color: 'var(--danger)' }}>*</span>}
                                    </label>
                                    {f.description && (
                                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '-2px 0 6px 0' }}>
                                        {f.description}
                                      </p>
                                    )}
                                    <input
                                      type="text"
                                      className="form-input touch-target"
                                      placeholder={`Enter ${fname}...`}
                                      value={currentVal}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setRoundInputs(prev => ({
                                          ...prev,
                                          [r.id]: {
                                            ...prev[r.id],
                                            answers: {
                                              ...(prev[r.id]?.answers || {}),
                                              [fname]: val,
                                              [fid]: val
                                            }
                                          }
                                        }));
                                      }}
                                      required={f.required}
                                    />
                                  </div>
                                );
                              })
                            ) : (
                              <>
                                <div>
                                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Google Drive / OneDrive Link</label>
                                  <input
                                    type="url"
                                    className="form-input touch-target"
                                    placeholder="https://drive.google.com/..."
                                    value={inputs.driveLink}
                                    onChange={(e) => setRoundInputs(prev => ({
                                      ...prev,
                                      [r.id]: { ...prev[r.id], driveLink: e.target.value }
                                    }))}
                                  />
                                </div>
                                <div>
                                  <label className="form-label" style={{ fontSize: '0.8rem' }}>GitHub Repository Link</label>
                                  <input
                                    type="url"
                                    className="form-input touch-target"
                                    placeholder="https://github.com/..."
                                    value={inputs.githubLink}
                                    onChange={(e) => setRoundInputs(prev => ({
                                      ...prev,
                                      [r.id]: { ...prev[r.id], githubLink: e.target.value }
                                    }))}
                                  />
                                </div>
                              </>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                              <button
                                type="submit"
                                className="btn btn-primary touch-target"
                                style={{ padding: '8px 24px', fontSize: '0.85rem' }}
                                disabled={submittingRoundId === r.id}
                              >
                                {submittingRoundId === r.id ? 'Saving Submission...' : 'Save & Submit Round'}
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
                            {r.fields && r.fields.length > 0 ? (
                              r.fields.map((f, idx) => {
                                const fname = f.name || `Field ${idx + 1}`;
                                const fid = f.id || fname;
                                const val = r.submission?.answers?.[fname] || r.submission?.answers?.[fid] || '';

                                return (
                                  <div key={idx} style={{ background: 'rgba(0,0,0,0.02)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                                    <strong style={{ color: 'var(--text-primary)', display: 'block', fontSize: '0.8rem' }}>{fname}:</strong>
                                    {val ? (
                                      val.startsWith('http') ? (
                                        <a href={val} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', wordBreak: 'break-all' }}>{val}</a>
                                      ) : (
                                        <span style={{ color: 'var(--text-primary)' }}>{val}</span>
                                      )
                                    ) : (
                                      <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Not submitted</span>
                                    )}
                                  </div>
                                );
                              })
                            ) : (
                              <>
                                <div style={{ marginBottom: '6px' }}><strong>Drive Link:</strong> {r.submission?.driveLink ? <a href={r.submission.driveLink} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', marginLeft: '6px' }}>{r.submission.driveLink}</a> : <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>None provided</span>}</div>
                                <div><strong>GitHub Link:</strong> {r.submission?.githubLink ? <a href={r.submission.githubLink} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', marginLeft: '6px' }}>{r.submission.githubLink}</a> : <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>None provided</span>}</div>
                              </>
                            )}

                            {r.submission?.submittedAt && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'right' }}>
                                Submitted: {new Date(r.submission.submittedAt).toLocaleString()}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Note on Verification */}
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px 20px', borderRadius: '12px', border: '1px solid var(--border-light)', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <Info size={20} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <h4 style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '4px' }}>Verification & Check-in Information</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>
                  Attendance status and ID verification will be completed physically at the venue check-in counters by the event volunteers when you present your physical Government & College ID cards.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: activeTab === 'ps' ? 'block' : 'none' }}>
          <div>
            {/* SECTION: Locked Problem Statement Display */}
            {hasSelection ? (
              <div className="glass-panel" style={{ padding: '32px', marginBottom: '40px', borderLeft: '5px solid var(--success)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: 'var(--success)' }}>
                  <CheckCircle size={24} />
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Problem Statement Locked In</h2>
                </div>
                
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: '0.75rem', background: 'rgba(62,125,71,0.1)', color: 'var(--success)', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
                    {teamInfo.psSelection.code || teamInfo.psSelection.problemStatement?.code}
                  </span>
                  <h3 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '8px 0' }}>{teamInfo.psSelection.title || teamInfo.psSelection.problemStatement?.title}</h3>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {teamInfo.psSelection.description || teamInfo.psSelection.problemStatement?.description}
                  </p>
                  <button 
                    onClick={() => setViewingPS(teamInfo.psSelection)} 
                    className="btn btn-secondary" 
                    style={{ marginTop: '12px', padding: '8px 16px', fontSize: '0.8rem', minHeight: 'auto' }}
                  >
                    View Details & Requirements
                  </button>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '16px', borderTop: '1px solid var(--border-light)', paddingTop: '12px' }}>
                    Topic Locked At: {new Date(teamInfo.psSelection.selectedAt).toLocaleString()}
                  </div>
                </div>
              </div>
            ) : (
              /* SECTION: PS Selection Workspace */
              <div className="glass-panel" style={{ padding: '32px', marginBottom: '40px' }}>
                {/* Countdown State */}
                {!isReleased ? (
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    {verificationStatus.gatingEnabled && !verificationStatus.verified && (
                      <div style={{
                        padding: '16px 20px',
                        borderRadius: 'var(--radius, 8px)',
                        background: 'rgba(224, 92, 26, 0.1)',
                        border: '1px solid var(--warning)',
                        color: 'var(--warning)',
                        marginBottom: '24px',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                      }}>
                        <AlertTriangle size={24} style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                          Complete check-in before the countdown ends — your team won't be able to select a problem statement until {verificationStatus.resolvedMemberName || 'a team member'} is verified at check-in.
                        </span>
                      </div>
                    )}

                    {configLoaded && psReleaseAt === null ? (
                      <>
                        <ShieldAlert size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px', marginLeft: 'auto', marginRight: 'auto' }} />
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Selection Closed</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '8px' }}>
                          Problem statement selection timeline has passed away.
                        </p>
                      </>
                    ) : (
                      <>
                        <Clock size={40} style={{ color: 'var(--primary)', marginBottom: '16px', marginLeft: 'auto', marginRight: 'auto' }} />
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Problem Statement Selection Pending</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '6px', marginBottom: '20px' }}>
                          Topics will be released automatically when the countdown reaches zero.
                        </p>
                        
                        {countdownText ? (
                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '16px', marginBottom: '8px' }}>
                            {countdownUnits.days > 0 && (
                              <div style={{ background: 'var(--cream)', border: '1px solid var(--border-strong)', borderRadius: '14px', width: '72px', height: '72px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', flexShrink: 0, aspectRatio: '1 / 1' }}>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>{String(countdownUnits.days).padStart(2, '0')}</div>
                                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '4px' }}>Days</div>
                              </div>
                            )}
                            <div style={{ background: 'var(--cream)', border: '1px solid var(--border-strong)', borderRadius: '14px', width: '72px', height: '72px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', flexShrink: 0, aspectRatio: '1 / 1' }}>
                              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>{String(countdownUnits.hours).padStart(2, '0')}</div>
                              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '4px' }}>Hours</div>
                            </div>
                            <div style={{ background: 'var(--cream)', border: '1px solid var(--border-strong)', borderRadius: '14px', width: '72px', height: '72px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', flexShrink: 0, aspectRatio: '1 / 1' }}>
                              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>{String(countdownUnits.mins).padStart(2, '0')}</div>
                              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '4px' }}>Mins</div>
                            </div>
                            <div style={{ background: 'var(--cream)', border: '1px solid var(--border-strong)', borderRadius: '14px', width: '72px', height: '72px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', flexShrink: 0, aspectRatio: '1 / 1' }}>
                              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>{String(countdownUnits.secs).padStart(2, '0')}</div>
                              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '4px' }}>Secs</div>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0' }}>
                            <Skeleton variant="text" width="220px" height="48px" />
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '8px' }}>Synchronizing timer...</span>
                          </div>
                        )}
                        
                        {psReleaseAt && (
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '12px' }}>
                            Scheduled Release: {new Date(psReleaseAt).toLocaleString()}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                ) : (
                  /* Selection Roster Board */
                  <div>
                    {psGated && (
                      <div style={{
                        padding: '16px 20px',
                        borderRadius: '10px',
                        background: 'var(--danger-glow)',
                        border: '1px solid var(--danger)',
                        color: 'var(--danger)',
                        marginBottom: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px'
                      }}>
                        <ShieldAlert size={24} style={{ flexShrink: 0 }} />
                        <div>
                          <strong style={{ fontSize: '0.95rem', display: 'block', marginBottom: '2px' }}>Check-in Required</strong>
                          <span style={{ fontSize: '0.85rem', opacity: 0.85 }}>
                            {verificationStatus.resolvedMemberName || 'A team member'} must be verified at the check-in desk before your team can lock in a selection.
                          </span>
                        </div>
                      </div>
                    )}

                    <div style={{ marginBottom: '24px' }}>
                      {/* Notice Banner & Tutorial Trigger */}
                      <div style={{
                        padding: '16px 20px',
                        borderRadius: '12px',
                        background: 'rgba(59, 130, 246, 0.08)',
                        border: '1px solid rgba(59, 130, 246, 0.25)',
                        marginBottom: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '260px' }}>
                          <Info size={22} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                          <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                            <strong>Note for Team Leaders:</strong> Clicking <strong>'Proceed to Select'</strong> on a problem statement opens a <strong>final confirmation step</strong>. Your selection is locked ONLY after you explicitly confirm in the confirmation popup modal.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setDemoLockedState(null);
                            setDemoConfirmState(null);
                            setShowTutorialModal(true);
                          }}
                          className="btn"
                          style={{
                            background: 'rgba(185, 111, 56, 0.15)',
                            color: 'var(--primary)',
                            border: '1px solid rgba(185, 111, 56, 0.3)',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            padding: '8px 16px',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          🎮 Try Selection Practice Mode (Tutorial)
                        </button>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                          <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Problem Selection Workspace</h2>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>
                            Hard caps apply in real-time. Buttons disable automatically once topics fill up.
                          </p>
                        </div>
                        <button 
                          onClick={fetchProblemStatements} 
                          className="btn btn-secondary" 
                          style={{ 
                            padding: '8px 16px', 
                            fontSize: '0.85rem', 
                            fontWeight: 600,
                            height: '38px', 
                            minHeight: '38px', 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            gap: '6px'
                          }}
                        >
                          Refresh Capacities
                        </button>
                      </div>
                    </div>

                    {statementsLoading ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {[...Array(4)].map((_, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', flexWrap: 'wrap', gap: '16px' }}>
                            <div style={{ flex: 1, minWidth: '240px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                <div className="skeleton" style={{ height: '18px', width: '60px', borderRadius: '4px' }}></div>
                                <div className="skeleton" style={{ height: '20px', width: '150px', borderRadius: '4px' }}></div>
                              </div>
                              <div className="skeleton" style={{ height: '14px', width: '80%', borderRadius: '4px', marginBottom: '6px' }}></div>
                              <div className="skeleton" style={{ height: '12px', width: '100px', borderRadius: '4px' }}></div>
                            </div>
                            <div className="skeleton" style={{ height: '40px', width: '140px', borderRadius: '999px' }}></div>
                          </div>
                        ))}
                      </div>
                    ) : statements.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>No problem statements are configured.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {statements.map((s) => {
                          const isDesign = (s.discipline || '').toUpperCase() === 'DESIGN' || s.capacity >= 999000;
                          const isSoldOut = !isDesign && s.remainingCapacity === 0;
                          const isUpdated = s.id === updatedPsId;
                          
                          return (
                            <div 
                              key={s.id} 
                              className={isUpdated ? 'ps-row-pulse' : ''}
                              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', opacity: (isSoldOut || psGated) ? 0.7 : 1, flexWrap: 'wrap', gap: '16px', transition: 'all 0.3s ease' }}
                            >
                              <div style={{ flex: 1, minWidth: '240px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                  <span style={{ fontSize: '0.75rem', background: 'var(--primary-glow)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                                    {s.code}
                                  </span>
                                  {isDesign ? (
                                    <span style={{ fontSize: '0.75rem', background: 'rgba(236,72,153,0.15)', color: '#ec4899', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                                      Unlimited Selection
                                    </span>
                                  ) : (
                                    <span className={isUpdated ? 'ps-count-scale' : ''} style={{ fontSize: '0.75rem', background: isSoldOut ? 'var(--danger-glow)' : 'var(--success-glow)', color: isSoldOut ? 'var(--danger)' : 'var(--success)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, transition: 'all 0.4s ease' }}>
                                      {isSoldOut ? 'Fully Committed' : `${s.remainingCapacity} slots remaining`}
                                    </span>
                                  )}
                                </div>
                                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '6px' }}>{s.title}</h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                  {s.description}
                                </p>
                                <button 
                                  onClick={() => setViewingPS(s)} 
                                  className="btn btn-secondary" 
                                  style={{ marginTop: '8px', padding: '6px 12px', fontSize: '0.8rem', minHeight: 'auto' }}
                                >
                                  View Details &amp; Requirements
                                </button>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                                <button
                                  onClick={() => setSelectConfirmState({ psId: s.id, psCode: s.code, psTitle: s.title })}
                                  disabled={isSoldOut || isSelecting || psGated}
                                  className="btn btn-primary"
                                  style={{ minHeight: 0, padding: '10px 24px', fontSize: '0.85rem' }}
                                >
                                  {isSelecting ? <span className="spinner"></span> : psGated ? 'Check-in Required' : 'Proceed to Select'}
                                </button>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                                  Total capacity: {s.capacity} teams
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
          <div className="glass-panel" style={{ padding: '32px', maxWidth: '480px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '8px' }} className="text-gradient">
              Change Account Password
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '24px' }}>
              Ensure your new password contains at least 8 characters and a mix of letters and numbers.
            </p>
            <form onSubmit={handleChangePasswordSubmit}>
              <div className="form-group">
                <label className="form-label">Current Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showOldPassword ? "text" : "password"}
                    name="current-password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="form-input"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    required
                    disabled={isChangingPassword}
                    style={{ paddingRight: '44px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPassword(!showOldPassword)}
                    style={{ position: 'absolute', right: '0', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '44px', width: '44px' }}
                    tabIndex="-1"
                  >
                    {showOldPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">New Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showNewPassword ? "text" : "password"}
                    name="new-password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="form-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    disabled={isChangingPassword}
                    style={{ paddingRight: '44px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    style={{ position: 'absolute', right: '0', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '44px', width: '44px' }}
                    tabIndex="-1"
                  >
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label className="form-label">Confirm New Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    name="confirm-new-password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="form-input"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={isChangingPassword}
                    style={{ paddingRight: '44px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{ position: 'absolute', right: '0', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '44px', width: '44px' }}
                    tabIndex="-1"
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={isChangingPassword}
              >
                {isChangingPassword ? <span className="spinner spinner-white" style={{ width: '14px', height: '14px' }}></span> : 'Change Password'}
              </button>
            </form>
          </div>
        </div>
      </div>
      
      {/* Dynamic badges css overrides */}
      <style>{`
        .status-badge {
          display: inline-block;
          font-size: 0.75rem;
          font-weight: 700;
          padding: 4px 8px;
          border-radius: 6px;
          text-transform: uppercase;
        }
        .status-registered {
          background: rgba(6, 182, 212, 0.1);
          color: var(--accent-blue);
        }
        .status-shortlisted {
          background: var(--success-glow);
          color: var(--success);
        }
        .status-waitlisted {
          background: rgba(245, 158, 11, 0.1);
          color: var(--warning);
        }
        .status-disqualified {
          background: var(--danger-glow);
          color: var(--danger);
        }
      `}</style>

      {viewingPS && (
        <Modal
          isOpen={true}
          onClose={() => setViewingPS(null)}
          title={`Problem Statement details: ${viewingPS.code}`}
          maxWidth="640px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <span style={{ fontSize: '0.75rem', background: 'var(--primary-glow)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                {viewingPS.code}
              </span>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '8px 0 4px 0' }}>{viewingPS.title}</h3>
            </div>
            
            <div>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Description</h4>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {viewingPS.description}
              </p>
            </div>
            
            <div>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Detailed Requirements</h4>
              <p style={{ fontSize: '0.9rem', color: viewingPS.requirements ? 'var(--text-secondary)' : 'var(--text-muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {viewingPS.requirements || 'No specific requirements provided.'}
              </p>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button onClick={() => setViewingPS(null)} className="btn btn-primary" style={{ minHeight: 'auto', padding: '10px 24px' }}>
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {selectConfirmState && (
        <ConfirmDialog
          isOpen={true}
          title="Lock In Problem Statement"
          message={`Are you sure you want to lock in the problem statement selection for [${selectConfirmState.psCode}] ${selectConfirmState.psTitle}? Once submitted, this selection is final and cannot be changed.`}
          confirmLabel="Lock Selection"
          danger={false}
          onConfirm={executeSelectPS}
          onCancel={() => setSelectConfirmState(null)}
          loading={isSelecting}
        />
      )}

      {/* Interactive Hands-on Selection Practice / Tutorial Modal */}
      {showTutorialModal && (
        <Modal
          isOpen={true}
          onClose={() => {
            setShowTutorialModal(false);
            setDemoConfirmState(null);
            setDemoLockedState(null);
          }}
          title="🎮 Interactive Selection Tutorial & Practice Mode"
          maxWidth="700px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: 'rgba(185, 111, 56, 0.08)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(185, 111, 56, 0.25)' }}>
              <h4 style={{ color: 'var(--primary)', fontWeight: 700, margin: '0 0 6px 0', fontSize: '0.95rem' }}>
                Practice How Problem Selection Works (Safe Sandbox)
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                This is a hands-on simulator. Practice clicking <strong>'Proceed to Select'</strong> and confirming the popup so you know exactly what to expect when the real countdown ends! <em>Nothing here modifies your real team selection.</em>
              </p>
            </div>

            {demoLockedState ? (
              <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '24px', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.3)', textAlign: 'center' }}>
                <CheckCircle size={40} style={{ color: 'var(--success)', marginBottom: '12px', marginLeft: 'auto', marginRight: 'auto' }} />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--success)' }}>
                  Practice Lock Successful! [{demoLockedState.code}]
                </h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600, marginTop: '4px' }}>
                  {demoLockedState.title}
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: 1.5 }}>
                  🎉 Great job! In the actual hackathon, this is how your selection will be locked into the database. You are now 100% prepared!
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setDemoLockedState(null);
                    setDemoConfirmState(null);
                  }}
                  className="btn btn-secondary"
                  style={{ marginTop: '16px', padding: '8px 20px', fontSize: '0.85rem' }}
                >
                  🔄 Try Demo Again
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Demo Problem Statements (Try Clicking Below):
                </div>

                {/* Demo Card 1 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderRadius: '10px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.75rem', background: 'var(--primary-glow)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                        DEMO-01
                      </span>
                      <span style={{ fontSize: '0.75rem', background: 'var(--success-glow)', color: 'var(--success)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                        2 slots remaining
                      </span>
                    </div>
                    <h4 style={{ fontWeight: 700, margin: '2px 0' }}>AI Health Diagnostic Assistant</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>Smart triage assistant for rural health centers.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDemoConfirmState({ code: 'DEMO-01', title: 'AI Health Diagnostic Assistant' })}
                    className="btn btn-primary"
                    style={{ padding: '8px 18px', fontSize: '0.82rem' }}
                  >
                    Proceed to Select
                  </button>
                </div>

                {/* Demo Card 2 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderRadius: '10px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.75rem', background: 'var(--primary-glow)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                        DEMO-02
                      </span>
                      <span style={{ fontSize: '0.75rem', background: 'var(--success-glow)', color: 'var(--success)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                        1 slot remaining
                      </span>
                    </div>
                    <h4 style={{ fontWeight: 700, margin: '2px 0' }}>Smart Urban Traffic Flow System</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>Adaptive signal management using camera feeds.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDemoConfirmState({ code: 'DEMO-02', title: 'Smart Urban Traffic Flow System' })}
                    className="btn btn-primary"
                    style={{ padding: '8px 18px', fontSize: '0.82rem' }}
                  >
                    Proceed to Select
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => {
                  setShowTutorialModal(false);
                  setDemoConfirmState(null);
                  setDemoLockedState(null);
                }}
                className="btn btn-secondary"
                style={{ padding: '8px 20px', fontSize: '0.85rem' }}
              >
                Done Practicing
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Demo Confirmation Popup Modal */}
      {demoConfirmState && (
        <ConfirmDialog
          isOpen={true}
          title="Demo Practice: Confirmation Step"
          message={`This is step 2 of selection! Are you sure you want to lock in [${demoConfirmState.code}] ${demoConfirmState.title}? In the real hackathon, clicking confirm here locks your choice.`}
          confirmLabel="Confirm & Lock Problem Statement"
          danger={false}
          onConfirm={() => {
            setDemoLockedState(demoConfirmState);
            setDemoConfirmState(null);
            addToast('Practice Demo Completed! Your selection demo passed successfully.', 'success');
          }}
          onCancel={() => setDemoConfirmState(null)}
        />
      )}
    </div>
  );
};

export default LeaderDashboard;
