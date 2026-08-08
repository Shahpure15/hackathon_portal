import React, { useState, useEffect } from 'react';
import { 
  Users, UserCheck, Search, X, CheckCircle, ChevronLeft, ChevronRight, LogOut, Info, QrCode, Menu
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import DataTable from '../components/DataTable';
import useTableQuery from '../components/useTableQuery';

const VolunteerDashboard = () => {
  const { logout } = useAuth();
  const { addToast } = useToast();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1000);
  const [checkpoints, setCheckpoints] = useState([]);
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
      setCheckpoints(res.data || []);
      if (res.data.length > 0) {
        setActiveCheckpointId(res.data[0].id);
      }
    } catch (err) {
      addToast('Failed to fetch checkpoints list', 'error');
    }
  };

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
      await api.post('/volunteer/checkin', {
        teamMemberId: memberId,
        checkpointTypeId: activeCheckpointId
      });
      addToast(`${memberName} marked present!`, 'success');
      // Refresh detailed data
      await fetchDetailedTeam(selectedTeam.id);
      // Refresh list to update verified counts
      fetchTeams();
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
      {/* Floating Glass Notch Navigation */}
      <div className="floating-nav">
        {/* Logo / Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: '0.5px' }} className="text-gradient">
            MIT India Hackathon
          </span>
          <span style={{ 
            fontSize: '0.7rem', 
            background: 'var(--primary-glow)', 
            color: 'var(--primary)', 
            padding: '2px 8px', 
            borderRadius: '999px', 
            fontWeight: 700,
            textTransform: 'uppercase'
          }}>
            Volunteer
          </span>
          <span style={{ 
            fontSize: '0.7rem', 
            background: 'rgba(6, 182, 212, 0.1)', 
            color: 'var(--accent-blue)', 
            padding: '2px 8px', 
            borderRadius: '999px', 
            fontWeight: 700,
            textTransform: 'uppercase'
          }}>
            Check-in Desk
          </span>
        </div>

        {/* Tab for Desktop (Empty for single view) */}
        {!isMobile ? (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          </div>
        ) : null}

        {/* Right side: Logout (Desktop) or Hamburger (Mobile) */}
        {!isMobile ? (
          <button
            onClick={logout}
            className="btn btn-secondary"
            style={{ padding: '6px 16px', minHeight: 'auto', height: '36px', borderRadius: '999px', fontSize: '0.8rem' }}
          >
            Logout
          </button>
        ) : (
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="btn btn-secondary"
            style={{ padding: '6px', minHeight: 'auto', height: '36px', width: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        )}
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobile && mobileMenuOpen && (
        <div 
          className="glass-card"
          style={{
            position: 'fixed',
            top: '90px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'calc(100% - 32px)',
            maxWidth: '400px',
            background: 'rgba(253, 251, 247, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.5)',
            borderRadius: '24px',
            boxShadow: '0 15px 35px -10px rgba(43, 33, 24, 0.25)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            zIndex: 999,
            animation: 'scaleInModal 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
          }}
        >
          <button
            onClick={logout}
            className="btn btn-secondary"
            style={{ width: '100%', padding: '10px 16px', minHeight: 'auto', height: '40px', borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            Logout
          </button>
        </div>
      )}

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
                <div>
                  <div style={{ fontWeight: 600 }}>{t.name}</div>
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
                  onClick={() => setSelectedTeam(t)} 
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
