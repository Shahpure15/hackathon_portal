import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, Layers, FileText, CheckCircle, Clock, AlertTriangle, LogOut, Info, ShieldAlert, Lock, Menu
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

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
  const [activeTab, setActiveTab] = useState('team'); // 'team', 'ps', 'settings'
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [viewingPS, setViewingPS] = useState(null);
  const [selectConfirmState, setSelectConfirmState] = useState(null);

  const handleTabClick = (tabName) => {
    setActiveTab(tabName);
    setMobileMenuOpen(false);
  };
  
  // Change password states
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

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

  // Problem statements listing
  const [statements, setStatements] = useState([]);
  const [statementsLoading, setStatementsLoading] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);

  useEffect(() => {
    fetchTeamData();
    fetchConfig();
  }, []);

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
      // If 403, it's not released yet
      if (err.response?.status === 403) {
        setIsReleased(false);
      } else {
        addToast('Failed to load problem statements', 'error');
      }
    } finally {
      setStatementsLoading(false);
    }
  };

  // Countdown timer tick logic
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
        // Format countdown text
        const hours = Math.floor(diff / (3600 * 1000));
        const mins = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
        const secs = Math.floor((diff % (60 * 1000)) / 1000);
        
        const pad = (n) => String(n).padStart(2, '0');
        setCountdownText(`${pad(hours)}h : ${pad(mins)}m : ${pad(secs)}s`);
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
      } else {
        addToast(detail || 'Selection failed. Check connection.', 'error');
      }
    } finally {
      setIsSelecting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <span className="spinner" style={{ width: '40px', height: '40px' }}></span>
      </div>
    );
  }

  const hasSelection = !!teamInfo?.psSelection;

  return (
    <div className="dashboard-layout">
      {/* Mobile Header */}
      <div className="mobile-header">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="mobile-menu-toggle"
          title="Open Menu"
        >
          <Menu size={24} />
        </button>
        <span style={{ fontWeight: 800, fontSize: '1.25rem' }} className="text-gradient">
          MIT India Leader
        </span>
        <div style={{ width: 44 }}></div>
      </div>

      {mobileMenuOpen && (
        <div className="mobile-backdrop" onClick={() => setMobileMenuOpen(false)}></div>
      )}

      {/* Sidebar Navigation */}
      <div 
        className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          height: '100vh', 
          justifyContent: 'space-between', 
          padding: '24px 0',
          transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        <div>
          <div style={{ padding: '0 24px 32px 24px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }} className="text-gradient">
              MIT India
            </h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Leader Workspace</span>
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '0 12px' }}>
            <button 
              onClick={() => handleTabClick('team')} 
              className={`btn ${activeTab === 'team' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ justifyContent: 'flex-start', padding: '12px 16px', border: 'none', background: activeTab === 'team' ? undefined : 'transparent', width: '100%', cursor: 'pointer', gap: '8px', minHeight: 'auto', height: '44px' }}
            >
              <Users size={18} />
              Team Roster
            </button>
            <button 
              onClick={() => handleTabClick('ps')} 
              className={`btn ${activeTab === 'ps' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ justifyContent: 'flex-start', padding: '12px 16px', border: 'none', background: activeTab === 'ps' ? undefined : 'transparent', width: '100%', cursor: 'pointer', gap: '8px', minHeight: 'auto', height: '44px' }}
            >
              <FileText size={18} />
              Problem Statement
            </button>
            <button 
              onClick={() => handleTabClick('settings')} 
              className={`btn ${activeTab === 'settings' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ justifyContent: 'flex-start', padding: '12px 16px', border: 'none', background: activeTab === 'settings' ? undefined : 'transparent', width: '100%', cursor: 'pointer', gap: '8px', minHeight: 'auto', height: '44px' }}
            >
              <Lock size={18} />
              Change Password
            </button>
          </nav>
        </div>

        <div style={{ padding: '0 24px' }}>
          <button onClick={logout} className="btn btn-secondary" style={{ width: '100%' }}>
            <LogOut size={16} style={{ marginRight: '8px' }} />
            Logout
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="main-content" style={{ backgroundColor: 'var(--bg-main)', overflowY: 'auto' }}>
        {/* Header Block */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1 style={{ fontSize: '2.25rem', fontWeight: 800 }}>{teamInfo.name}</h1>
              <span className={`status-badge status-${teamInfo.status.toLowerCase()}`} style={{ fontSize: '0.75rem' }}>
                {teamInfo.status}
              </span>
            </div>
            <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
              Team Code: <strong style={{ color: 'var(--text-primary)' }}>{teamInfo.registrationId}</strong> | {teamInfo.collegeName}
            </p>
          </div>
        </div>

        {activeTab === 'team' && (
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
                    <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: 'rgba(0,0,0,0.01)', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{m.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{m.email} | {m.phone}</div>
                      </div>
                      {m.idVerified ? (
                        <span style={{ color: 'var(--success)', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(16, 185, 129, 0.1)', padding: '4px 8px', borderRadius: '6px' }}>✓ Verified</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', background: 'rgba(255, 255, 255, 0.03)', padding: '4px 8px', borderRadius: '6px' }}>Awaiting Venue Check-in</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* POD assignments card */}
              <div className="glass-card" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Layers size={18} style={{ color: 'var(--primary)' }} />
                  Assigned POD Group
                </h3>
                
                {teamInfo.pod ? (
                  <div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '12px' }}>{teamInfo.pod.name}</div>
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
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
                    <Layers size={24} style={{ marginBottom: '8px' }} />
                    <p style={{ fontSize: '0.85rem' }}>POD grouping is currently unassigned.</p>
                  </div>
                )}
              </div>
            </div>

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
        )}

        {activeTab === 'ps' && (
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
                    {teamInfo.psSelection.code}
                  </span>
                  <h3 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '8px 0' }}>{teamInfo.psSelection.title}</h3>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {teamInfo.psSelection.description}
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
                  <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    {configLoaded && psReleaseAt === null ? (
                      <>
                        <ShieldAlert size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px', marginLeft: 'auto', marginRight: 'auto' }} />
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Selection Closed</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '8px' }}>
                          Problem statement selection is currently locked by the administrator.
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
                          <div style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'monospace', letterSpacing: '0.15em', background: 'var(--bg-main)', display: 'inline-block', padding: '16px 32px', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                            {countdownText}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0' }}>
                            <span className="spinner" style={{ width: '28px', height: '28px', marginBottom: '8px', marginLeft: 'auto', marginRight: 'auto' }}></span>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Synchronizing timer...</span>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Select Your Problem Statement</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>
                          Hard caps apply in real-time. Buttons disable automatically once topics fill up.
                        </p>
                      </div>
                      <button onClick={fetchProblemStatements} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '0.8rem', minHeight: 0 }}>
                        Refresh Capacities
                      </button>
                    </div>

                    {statementsLoading ? (
                      <div style={{ padding: '40px', textAlign: 'center' }}>
                        <span className="spinner" style={{ width: '32px', height: '32px', margin: '0 auto' }}></span>
                      </div>
                    ) : statements.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>No problem statements are configured.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {statements.map((s) => {
                          const isSoldOut = s.remainingCapacity === 0;
                          
                          return (
                            <div 
                              key={s.id} 
                              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderRadius: '12px', background: 'var(--bg-surface)', border: isSoldOut ? '1px solid var(--border-light)' : '1px solid var(--border-light)', opacity: isSoldOut ? 0.7 : 1, flexWrap: 'wrap', gap: '16px' }}
                            >
                              <div style={{ flex: 1, minWidth: '240px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                  <span style={{ fontSize: '0.75rem', background: 'var(--primary-glow)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                                    {s.code}
                                  </span>
                                  <span style={{ fontSize: '0.75rem', background: isSoldOut ? 'var(--danger-glow)' : 'var(--success-glow)', color: isSoldOut ? 'var(--danger)' : 'var(--success)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                    {isSoldOut ? 'Sold Out' : `${s.remainingCapacity} slots remaining`}
                                  </span>
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
                                  View Details & Requirements
                                </button>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                                <button
                                  onClick={() => setSelectConfirmState({ psId: s.id, psCode: s.code, psTitle: s.title })}
                                  disabled={isSoldOut || isSelecting}
                                  className="btn btn-primary"
                                  style={{ minHeight: 0, padding: '10px 24px', fontSize: '0.85rem' }}
                                >
                                  {isSelecting ? <span className="spinner"></span> : 'Select Topic'}
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
        )}

        {activeTab === 'settings' && (
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
                <input
                  type="password"
                  placeholder="••••••••"
                  className="form-input"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  required
                  disabled={isChangingPassword}
                />
              </div>

              <div className="form-group">
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  className="form-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={isChangingPassword}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label className="form-label">Confirm New Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  className="form-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={isChangingPassword}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={isChangingPassword}
              >
                {isChangingPassword ? <span className="spinner"></span> : 'Change Password'}
              </button>
            </form>
          </div>
        )}
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
        />
      )}
    </div>
  );
};

export default LeaderDashboard;
