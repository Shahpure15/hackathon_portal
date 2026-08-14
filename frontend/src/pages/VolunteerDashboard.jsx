import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, UserCheck, Search, X, CheckCircle, ChevronLeft, ChevronRight, LogOut, Info, QrCode, Menu
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import DataTable from '../components/DataTable';
import useTableQuery from '../components/useTableQuery';
import Navbar from '../components/Navbar';
import Skeleton from '../components/Skeleton';
import IconButton from '../components/IconButton';
import useCheckinWebSocket from '../hooks/useCheckinWebSocket';

const VolunteerDashboard = () => {
  const { logout } = useAuth();
  const { addToast } = useToast();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1000);
  const [checkpoints, setCheckpoints] = useState([]);
  const [eventId, setEventId] = useState(null);
  const [activeCheckpointId, setActiveCheckpointId] = useState('');
  const [markingMemberId, setMarkingMemberId] = useState('');

  // Teams listing states
  const [teams, setTeams] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const {
    page,
    setPage,
    search,
    setSearch
  } = useTableQuery('', 'asc', 'vcheckin');

  // Detail checkin modal state
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [detailedTeam, setDetailedTeam] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  useEffect(() => {
    fetchCheckpoints();
  }, []);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchTeams();
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [search, page]);

  const fetchCheckpoints = async () => {
    try {
      const res = await api.get('/volunteer/checkpoints');
      const data = res.data;
      // API now returns { eventId, checkpoints: [...] }
      const cps = data.checkpoints || data; // backward compat if old format
      setCheckpoints(cps);
      if (data.eventId) setEventId(data.eventId);
      if (cps.length > 0) {
        setActiveCheckpointId(cps[0].id);
      }
    } catch (err) {
      addToast('Failed to fetch checkpoints list', 'error');
    }
  };

  // Silent refresh for WebSocket-triggered updates (no loading flash)
  const silentRefreshTeams = useCallback(async () => {
    try {
      const res = await api.get('/volunteer/teams', {
        params: { page, limit: 10, search: search || undefined }
      });
      setTeams(res.data.results || []);
      setTotal(res.data.total);
      setPages(res.data.pages);
    } catch (_) {}
  }, [page, search]);

  // WebSocket: live check-in updates from other volunteers on the same event
  const handleWsMessage = useCallback((data) => {
    if (data.type === 'checkin_update') {
      silentRefreshTeams();
      // If the affected team is open in the modal, refresh it too
      if (selectedTeam) {
        fetchDetailedTeam(selectedTeam.id);
      }
    }
  }, [silentRefreshTeams, selectedTeam]);

  useCheckinWebSocket({
    eventId,
    token: localStorage.getItem('access_token'),
    onMessage: handleWsMessage,
    enabled: !!eventId
  });

  const fetchTeams = async () => {
    setLoading(true);
    try {
      const res = await api.get('/volunteer/teams', {
        params: {
          search: search || undefined,
          page,
          limit: 10
        }
      });
      setTeams(res.data.results || []);
      setTotal(res.data.total);
      setPages(res.data.pages);
    } catch (err) {
      addToast('Failed to fetch teams list', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchDetailedTeam = async (teamId) => {
    setModalLoading(true);
    try {
      const res = await api.get(`/volunteer/teams/${teamId}`);
      setDetailedTeam(res.data);
    } catch (err) {
      addToast('Failed to load team members details', 'error');
    } finally {
      setModalLoading(false);
    }
  };

  useEffect(() => {
    if (selectedTeam) {
      fetchDetailedTeam(selectedTeam.id);
    } else {
      setDetailedTeam(null);
    }
  }, [selectedTeam, activeCheckpointId]);

  const handleMarkPresent = async (memberId, memberName) => {
    if (!activeCheckpointId) {
      addToast('Please select a checkpoint first', 'warning');
      return;
    }

    setMarkingMemberId(memberId);
    try {
      const res = await api.post('/volunteer/checkin', {
        teamMemberId: memberId,
        checkpointTypeId: activeCheckpointId
      });
      addToast(`${memberName} marked present!`, 'success');
      
      const nowStr = new Date().toISOString();
      setDetailedTeam(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          members: prev.members.map(m => {
            if (m.id === memberId) {
              const updatedCp = m.checkpoints ? [...m.checkpoints] : [];
              const existingIdx = updatedCp.findIndex(cp => cp.checkpointTypeId === activeCheckpointId);
              const cpObj = {
                checkedIn: true,
                checkpointTypeId: activeCheckpointId,
                timestamp: res.data?.timestamp || nowStr,
                markedBy: res.data?.markedBy || 'You'
              };
              if (existingIdx >= 0) updatedCp[existingIdx] = cpObj;
              else updatedCp.push(cpObj);
              return { ...m, checkpoints: updatedCp };
            }
            return m;
          })
        };
      });
    } catch (err) {
      if (err.response?.status === 409) {
        addToast('Already checked in', 'info');
      } else {
        addToast('Failed to mark check-in. Try again.', 'error');
      }
    } finally {
      setMarkingMemberId('');
    }
  };

  const activeCheckpointName = checkpoints.find(c => c.id === activeCheckpointId)?.name || 'Check-in';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', position: 'relative' }}>
      <Navbar
        title="MIT India Hackathon"
        user={{ username: 'Volunteer', role: 'Check-in Desk' }}
        onLogout={logout}
        navItems={[
          { id: 'checkin', label: 'Check-in Desk', icon: <UserCheck size={16} /> }
        ]}
        activeTab="checkin"
      />

      {/* Main Content Area */}
      <div 
        className="main-content" 
        style={{ 
          padding: '110px 24px 40px 24px', 
          maxWidth: '1280px', 
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box'
        }}
      >
        {/* Header and Checkpoint Selection row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <h1 style={{ fontSize: '2.25rem', fontWeight: 800 }}>Check-in <span className="font-accent">Desk</span></h1>
            <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
              Verify identity credentials and log attendance checkpoints.
            </p>
          </div>

          {/* Active Checkpoint dropdown */}
          <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Active Checkpoint:
            </span>
            <select
              value={activeCheckpointId}
              onChange={(e) => setActiveCheckpointId(e.target.value)}
              className="form-input"
              style={{ width: '220px', minHeight: '38px', padding: '6px 12px' }}
            >
              {checkpoints.map(cp => (
                <option key={cp.id} value={cp.id}>{cp.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Search filter panel */}
        <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px', position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '36px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search teams by name, leader, college, team code..."
            className="form-input"
            style={{ paddingLeft: '48px' }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <DataTable
          columns={[
            {
              header: 'Team Name / College',
              accessor: 'name',
              render: (t) => (
                <div 
                  onClick={(e) => { e.stopPropagation(); setSelectedTeam(t); }}
                  style={{ cursor: 'pointer' }}
                  title="Click to view Team Check-in Roster"
                >
                  <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{t.name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t.collegeName}</div>
                </div>
              )
            },
            {
              header: 'Team Code',
              accessor: 'registrationId',
              render: (t) => <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{t.registrationId}</span>
            },
            {
              header: 'Leader',
              accessor: 'leaderName'
            },
            {
              header: 'Member verification',
              accessor: 'verifiedCount',
              render: (t) => (
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: t.verifiedCount === t.memberCount ? 'var(--success)' : 'var(--primary)' }}>
                  {t.verifiedCount} / {t.memberCount} Verified
                </span>
              )
            },
            {
              header: '',
              align: 'right',
              width: '160px',
              render: (t) => (
                <button 
                  onClick={(e) => { e.stopPropagation(); setSelectedTeam(t); }} 
                  className="btn btn-secondary"
                  style={{ padding: '10px 16px', fontSize: '0.85rem', minHeight: '44px' }}
                >
                  Verify & Checkin
                </button>
              )
            }
          ]}
          data={teams}
          page={page}
          pages={pages}
          totalCount={total}
          onPageChange={setPage}
          onRowClick={(t) => setSelectedTeam(t)}
          loading={loading}
          emptyState={
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Users size={32} style={{ marginBottom: '12px' }} />
              <p>No teams match your search.</p>
            </div>
          }
        />

        {selectedTeam && (
          <div className="modal-overlay-fade" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div className="glass-card modal-scale-up" style={{ width: '100%', maxWidth: '640px', padding: '32px', position: 'relative' }}>
              <button onClick={() => setSelectedTeam(null)} style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>

              <h2 style={{ fontSize: '1.75rem', marginBottom: '4px' }}>{selectedTeam.name} Check-In</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '24px' }}>
                Active Checkpoint: <strong style={{ color: 'var(--primary)' }}>{activeCheckpointName}</strong>
              </p>

              {modalLoading ? (
                <div style={{ padding: '40px', textAlign: 'center' }}>
                  <span className="spinner" style={{ width: '32px', height: '32px', margin: '0 auto' }}></span>
                </div>
              ) : detailedTeam ? (
                <div>
                  {/* Warning message */}
                  <div style={{ background: 'var(--primary-glow)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '12px 16px', display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px', fontSize: '0.85rem' }}>
                    <Info size={16} style={{ color: 'var(--primary)' }} />
                    <p style={{ color: 'var(--text-secondary)' }}>
                      Physically verify Govt ID + College ID before marking attendance. Attendance cannot be unmarked by volunteers.
                    </p>
                  </div>

                  {/* Members list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {detailedTeam.members.map(member => {
                      const cpStatus = member.checkpoints.find(cp => cp.checkpointTypeId === activeCheckpointId);
                      const isCheckedIn = cpStatus?.checkedIn;

                      return (
                        <div key={member.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderRadius: '8px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-light)', flexWrap: 'wrap', gap: '12px' }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{member.name}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{member.email} | {member.phone}</div>
                          </div>

                          <div>
                            {isCheckedIn ? (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                <span style={{ color: 'var(--success)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', marginBottom: '2px' }}>
                                  <CheckCircle size={14} /> Checked In
                                </span>
                                Marked by {cpStatus.markedBy} at {new Date(cpStatus.timestamp).toLocaleTimeString()}
                              </div>
                            ) : (
                              <button
                                onClick={() => handleMarkPresent(member.id, member.name)}
                                className="btn btn-primary"
                                style={{ minHeight: '44px', padding: '10px 20px', fontSize: '0.85rem' }}
                                disabled={markingMemberId === member.id}
                              >
                                {markingMemberId === member.id ? <span className="spinner spinner-white" style={{ width: '16px', height: '16px' }}></span> : 'Mark Present'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VolunteerDashboard;
