import React, { useState, useEffect } from 'react';
import { 
  Users, UserCheck, Search, X, CheckCircle, ChevronLeft, ChevronRight, LogOut, Info, QrCode
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const VolunteerDashboard = () => {
  const { logout } = useAuth();
  const { addToast } = useToast();

  const [checkpoints, setCheckpoints] = useState([]);
  const [activeCheckpointId, setActiveCheckpointId] = useState('');

  // Teams listing states
  const [teams, setTeams] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // Detail checkin modal state
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [detailedTeam, setDetailedTeam] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  useEffect(() => {
    fetchCheckpoints();
  }, []);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      setPage(1);
      fetchTeams();
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [search]);

  useEffect(() => {
    fetchTeams();
  }, [page]);

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

    try {
      await api.post('/volunteer/checkin', {
        teamMemberId: memberId,
        checkpointTypeId: activeCheckpointId
      });
      addToast(`${memberName} marked present!`, 'success');
      // Refresh detailed data
      fetchDetailedTeam(selectedTeam.id);
      // Refresh list to update verified counts
      fetchTeams();
    } catch (err) {
      if (err.response?.status === 409) {
        addToast('Already checked in', 'info');
      } else {
        addToast('Failed to mark check-in. Try again.', 'error');
      }
    }
  };

  const activeCheckpointName = checkpoints.find(c => c.id === activeCheckpointId)?.name || 'Check-in';

  return (
    <div className="dashboard-layout">
      {/* Sidebar Navigation */}
      <div className="sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'space-between', padding: '24px 0' }}>
        <div>
          <div style={{ padding: '0 24px 32px 24px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }} className="text-gradient">
              MIT India
            </h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Volunteer Workspace</span>
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '0 12px' }}>
            <div className="btn btn-primary" style={{ justifyContent: 'flex-start', padding: '12px 16px', border: 'none', cursor: 'default' }}>
              <UserCheck size={18} />
              Check-in Desk
            </div>
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
      <div className="main-content" style={{ backgroundColor: 'var(--bg-main)' }}>
        {/* Header and Checkpoint Selection row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <h1 style={{ fontSize: '2.25rem', fontWeight: 800 }}>Check-in Desk</h1>
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

        {/* Teams Table */}
        <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center' }}>
              <span className="spinner" style={{ width: '40px', height: '40px', margin: '0 auto' }}></span>
            </div>
          ) : teams.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Users size={32} style={{ marginBottom: '12px' }} />
              <p>No teams match your search.</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)', background: 'rgba(255,255,255,0.01)' }}>
                  <th style={{ padding: '16px 24px', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Team Name / College</th>
                  <th style={{ padding: '16px 24px', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Team Code</th>
                  <th style={{ padding: '16px 24px', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Leader</th>
                  <th style={{ padding: '16px 24px', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Member verification</th>
                  <th style={{ padding: '16px 24px', width: '160px' }}></th>
                </tr>
              </thead>
              <tbody>
                {teams.map(t => (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ fontWeight: 600 }}>{t.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t.collegeName}</div>
                    </td>
                    <td style={{ padding: '16px 24px', fontWeight: 700, fontSize: '0.9rem' }}>{t.registrationId}</td>
                    <td style={{ padding: '16px 24px' }}>{t.leaderName}</td>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: t.verifiedCount === t.memberCount ? 'var(--success)' : 'var(--primary)' }}>
                        {t.verifiedCount} / {t.memberCount} Verified
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                      <button 
                        onClick={() => setSelectedTeam(t)} 
                        className="btn btn-secondary"
                        style={{ padding: '8px 16px', fontSize: '0.8rem', minHeight: 0 }}
                      >
                        Verify & Checkin
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Showing page {page} of {pages}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page === 1}
                className="btn btn-secondary"
                style={{ padding: '8px 12px' }}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(p + 1, pages))}
                disabled={page === pages}
                className="btn btn-secondary"
                style={{ padding: '8px 12px' }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

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
                                style={{ minHeight: 0, padding: '8px 16px', fontSize: '0.8rem' }}
                              >
                                Mark Present
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
