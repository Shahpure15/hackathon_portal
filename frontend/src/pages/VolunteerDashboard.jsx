import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, UserCheck, Search, X, CheckCircle, ChevronLeft, ChevronRight, LogOut, Info, QrCode, Menu, Layers
} from 'lucide-react';
import api, { getAccessToken } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import DataTable from '../components/DataTable';
import useTableQuery from '../components/useTableQuery';
import Navbar from '../components/Navbar';
import Skeleton from '../components/Skeleton';
import IconButton from '../components/IconButton';
import QRScanner from '../components/QRScanner';

const VolunteerDashboard = () => {
  const { logout } = useAuth();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState('checkin');

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1000);

  // Checkpoints dropdown state
  const [checkpoints, setCheckpoints] = useState([]);
  const [activeCheckpointId, setActiveCheckpointId] = useState('');
  const [eventId, setEventId] = useState(null);

  // QR Scanner modal state
  const [scannerOpen, setScannerOpen] = useState(false);

  // Teams data state
  const [teams, setTeams] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);

  // People (Faculty, Judges, Volunteers) data state
  const [peopleList, setPeopleList] = useState([]);
  const [peopleTotal, setPeopleTotal] = useState(0);
  const [peoplePages, setPeoplePages] = useState(1);
  const [peoplePage, setPeoplePage] = useState(1);
  const [peopleSearch, setPeopleSearch] = useState('');
  const [peopleTypeFilter, setPeopleTypeFilter] = useState('ALL');
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [markingPersonId, setMarkingPersonId] = useState('');

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
  const [markingMemberId, setMarkingMemberId] = useState('');

  // Volunteer Problem Statement Allotment feature
  const [allowVolunteerPsSelection, setAllowVolunteerPsSelection] = useState(false);
  const [availablePsList, setAvailablePsList] = useState([]);
  const [selectedPsId, setSelectedPsId] = useState('');
  const [isAssigningPs, setIsAssigningPs] = useState(false);

  useEffect(() => {
    fetchCheckpoints();
    fetchVolunteerConfig();
  }, []);

  useEffect(() => {
    if (activeTab === 'checkin') {
      const delayDebounce = setTimeout(() => {
        fetchTeams();
      }, 300);
      return () => clearTimeout(delayDebounce);
    }
  }, [search, page, activeTab]);

  useEffect(() => {
    if (activeTab === 'people') {
      const delayDebounce = setTimeout(() => {
        fetchPeople();
      }, 300);
      return () => clearTimeout(delayDebounce);
    }
  }, [peopleSearch, peopleTypeFilter, peoplePage, activeTab, activeCheckpointId]);

  const fetchPeople = async () => {
    setPeopleLoading(true);
    try {
      const res = await api.get('/volunteer/people', {
        params: {
          search: peopleSearch || undefined,
          type: peopleTypeFilter !== 'ALL' ? peopleTypeFilter : undefined,
          page: peoplePage,
          limit: 10
        }
      });
      setPeopleList(res.data.results || []);
      setPeopleTotal(res.data.total || 0);
      setPeoplePages(res.data.pages || 1);
    } catch (err) {
      addToast('Failed to fetch people list', 'error');
    } finally {
      setPeopleLoading(false);
    }
  };

  const handleMarkPersonPresent = async (personId, personName) => {
    if (!activeCheckpointId) {
      addToast('Please select a checkpoint first', 'warning');
      return;
    }
    setMarkingPersonId(personId);
    try {
      const res = await api.post('/volunteer/people/checkin', {
        volunteerId: personId,
        checkpointTypeId: activeCheckpointId
      });
      addToast(`${personName} marked present!`, 'success');
      fetchPeople();
    } catch (err) {
      if (err.response?.status === 409) {
        addToast('Already checked in', 'info');
      } else {
        addToast('Failed to mark check-in for person', 'error');
      }
    } finally {
      setMarkingPersonId('');
    }
  };

  const fetchVolunteerConfig = async () => {
    try {
      const res = await api.get('/volunteer/config');
      setAllowVolunteerPsSelection(!!res.data?.allowVolunteerPsSelection);
    } catch (err) {
      // silent
    }
  };

  const fetchCheckpoints = async () => {
    try {
      const res = await api.get('/volunteer/checkpoints');
      const data = res.data;
      const cps = data.checkpoints || data;
      setCheckpoints(cps);
      if (data.eventId) setEventId(data.eventId);
      if (cps.length > 0) {
        setActiveCheckpointId(cps[0].id);
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
    setSelectedPsId('');
    try {
      const res = await api.get(`/volunteer/teams/${teamId}`);
      setDetailedTeam(res.data);

      // If volunteer PS selection is enabled, fetch problem statements filtered for this team
      const configRes = await api.get('/volunteer/config');
      const isAllowed = !!configRes.data?.allowVolunteerPsSelection;
      setAllowVolunteerPsSelection(isAllowed);

      if (isAllowed) {
        try {
          const psRes = await api.get('/volunteer/problem-statements', { params: { team_id: teamId } });
          setAvailablePsList(psRes.data || []);
        } catch (e) {
          // silent
        }
      }
    } catch (err) {
      addToast('Failed to load team details', 'error');
    } finally {
      setModalLoading(false);
    }
  };

  const handleAssignPs = async () => {
    if (!selectedPsId) {
      addToast('Please choose a problem statement from the list', 'warning');
      return;
    }
    setIsAssigningPs(true);
    try {
      const res = await api.post(`/volunteer/teams/${detailedTeam.id}/select-ps`, { psId: selectedPsId });
      addToast(res.data?.message || 'Problem statement allotted!', 'success');
      setDetailedTeam(prev => ({
        ...prev,
        selectedProblemStatement: {
          id: res.data?.psId,
          code: res.data?.psCode,
          title: res.data?.psTitle
        }
      }));
      setSelectedPsId('');
      // refresh available list
      const psRes = await api.get('/volunteer/problem-statements', { params: { team_id: detailedTeam.id } });
      setAvailablePsList(psRes.data || []);
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to allot problem statement', 'error');
    } finally {
      setIsAssigningPs(false);
    }
  };

  const handleQrScan = (scannedTeamId) => {
    setScannerOpen(false);
    setSelectedTeam({ id: scannedTeamId });
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
          { id: 'checkin', label: 'Teams Check-in', icon: <UserCheck size={16} /> },
          { id: 'people', label: 'People / Faculty / Judges', icon: <Users size={16} /> }
        ]}
        activeTab={activeTab}
        onTabChange={(tabId) => setActiveTab(tabId)}
      />

      {/* Main Content Area */}
      <div 
        className="main-content" 
        style={{ 
          padding: '80px 20px 40px 20px', 
          maxWidth: '1400px', 
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box'
        }}
      >
        {/* Header and Checkpoint Selection row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <h1 style={{ fontSize: '2.25rem', fontWeight: 800 }}>
              {activeTab === 'checkin' ? 'Teams Check-in' : 'Faculty, Judges & People'} <span className="font-accent">Desk</span>
            </h1>
            <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
              {activeTab === 'checkin'
                ? 'Verify identity credentials, mark attendance checkpoints, and allot problem statements when enabled.'
                : 'Verify attendance for Faculty, Judges, Student Volunteers, Organizers, and event staff.'}
            </p>
          </div>

          {/* Active Checkpoint dropdown */}
          <div className="glass-panel" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
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

        {/* TEAMS CHECK-IN TAB CONTENT */}
        {activeTab === 'checkin' && (
          <div>
            {/* Volunteer PS Selection Mode Status Banner (if active) */}
            {allowVolunteerPsSelection && (
              <div 
                className="glass-panel" 
                style={{ 
                  padding: '14px 20px', 
                  borderRadius: '12px', 
                  marginBottom: '24px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '12px', 
                  background: 'rgba(16, 185, 129, 0.08)', 
                  border: '1px solid rgba(16, 185, 129, 0.3)' 
                }}
              >
                <div style={{ padding: '6px 10px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', fontWeight: 800, fontSize: '0.75rem' }}>
                  ACTIVE
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                  <strong>Admin Notice:</strong> Problem Statement Allotment is <strong>ENABLED</strong> for volunteers. You can assign and lock in problem statements directly inside each team's roster modal.
                </div>
              </div>
            )}

            {/* Action and Search Bar */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '280px', position: 'relative' }}>
                <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search by Team Name or Team Code..."
                  className="form-input"
                  style={{ paddingLeft: '48px', width: '100%' }}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <button 
                onClick={() => setScannerOpen(true)}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '160px', justifyContent: 'center' }}
              >
                <QrCode size={18} />
                Scan Team QR
              </button>
            </div>

            {/* Teams Table */}
            <DataTable
              columns={[
                {
                  header: 'Team Info',
                  accessor: 'name',
                  render: (t) => (
                    <div>
                      <div style={{ fontWeight: 600 }}>{t.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Code: {t.registrationId}</div>
                    </div>
                  )
                },
                {
                  header: 'Discipline / Category',
                  accessor: 'category',
                  render: (t) => (
                    <span className="status-badge" style={{ fontSize: '0.75rem', fontWeight: 700, background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
                      {t.category || 'ENGINEERING'}
                    </span>
                  )
                },
                {
                  header: 'College',
                  accessor: 'collegeName',
                  render: (t) => <span style={{ fontSize: '0.85rem' }}>{t.collegeName}</span>
                },
                {
                  header: 'Bench / Desk #',
                  accessor: 'deskNumber',
                  render: (t) => (
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: t.deskNumber ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {t.deskNumber || '—'}
                    </span>
                  )
                },
                {
                  header: 'POD Group',
                  accessor: 'podName',
                  render: (t) => (
                    t.podName ? (
                      <span style={{ fontSize: '0.85rem', background: 'rgba(185, 111, 56, 0.12)', color: 'var(--primary)', padding: '4px 8px', borderRadius: '6px', fontWeight: 600 }}>
                        {t.podName}
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Unassigned</span>
                    )
                  )
                },
                {
                  header: 'Check-In Status',
                  accessor: 'id',
                  render: (t) => {
                    const totalMembers = t.totalMembers || 0;
                    const checkedIn = t.checkedInMembers || 0;
                    const isFullyCheckedIn = totalMembers > 0 && checkedIn === totalMembers;
                    return (
                      <span className={`status-badge ${isFullyCheckedIn ? 'status-active' : checkedIn > 0 ? 'status-draft' : 'status-danger'}`} style={{ fontSize: '0.75rem' }}>
                        {checkedIn} / {totalMembers} Checked In
                      </span>
                    );
                  }
                },
                {
                  header: 'Action',
                  accessor: 'id',
                  align: 'right',
                  render: (t) => (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTeam(t);
                      }}
                      className="btn btn-secondary"
                      style={{ minHeight: '36px', padding: '6px 14px', fontSize: '0.8rem' }}
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
          </div>
        )}

        {/* PEOPLE / FACULTY / JUDGES CHECK-IN TAB CONTENT */}
        {activeTab === 'people' && (
          <div>
            {/* Search and Type Filter Bar */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '280px', position: 'relative' }}>
                <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search by Name, Contact, or Role (Faculty/Judge)..."
                  className="form-input"
                  style={{ paddingLeft: '48px', width: '100%' }}
                  value={peopleSearch}
                  onChange={(e) => {
                    setPeopleSearch(e.target.value);
                    setPeoplePage(1);
                  }}
                />
              </div>

              <select
                value={peopleTypeFilter}
                onChange={(e) => {
                  setPeopleTypeFilter(e.target.value);
                  setPeoplePage(1);
                }}
                className="form-input"
                style={{ width: '220px', minHeight: '42px', padding: '6px 12px' }}
              >
                <option value="ALL">All Roles / Types</option>
                <option value="FACULTY">Faculty</option>
                <option value="JUDGE">Judges</option>
                <option value="VOLUNTEER">Volunteers</option>
              </select>
            </div>

            {/* People Table */}
            <DataTable
              columns={[
                {
                  header: 'Person Info',
                  accessor: 'name',
                  render: (p) => (
                    <div>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{p.contact}</div>
                    </div>
                  )
                },
                {
                  header: 'Role / Type',
                  accessor: 'type',
                  render: (p) => (
                    <span className="status-badge" style={{ fontSize: '0.75rem', fontWeight: 700, background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                      {p.type || 'VOLUNTEER'}
                    </span>
                  )
                },
                {
                  header: 'Assigned Pod / Remarks',
                  accessor: 'remarks',
                  render: (p) => (
                    <div style={{ fontSize: '0.85rem' }}>
                      {p.podName ? <span style={{ fontWeight: 600, color: 'var(--primary)', marginRight: '6px' }}>[{p.podName}]</span> : null}
                      {p.remarks || '-'}
                    </div>
                  )
                },
                {
                  header: 'Check-In Status',
                  accessor: 'id',
                  render: (p) => {
                    const cpStatus = p.checkpoints?.find(cp => cp.checkpointTypeId === activeCheckpointId);
                    const isCheckedIn = cpStatus?.checkedIn;

                    if (isCheckedIn) {
                      return (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          <span style={{ color: 'var(--success)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                            <CheckCircle size={14} /> Checked In
                          </span>
                          <div>by {cpStatus.markedBy}</div>
                        </div>
                      );
                    }
                    return (
                      <span className="status-badge status-draft" style={{ fontSize: '0.75rem' }}>
                        Not Checked In
                      </span>
                    );
                  }
                },
                {
                  header: 'Action',
                  accessor: 'id',
                  align: 'right',
                  render: (p) => {
                    const cpStatus = p.checkpoints?.find(cp => cp.checkpointTypeId === activeCheckpointId);
                    const isCheckedIn = cpStatus?.checkedIn;

                    if (isCheckedIn) {
                      return (
                        <span style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: 600 }}>
                          Verified
                        </span>
                      );
                    }

                    return (
                      <button
                        onClick={() => handleMarkPersonPresent(p.id, p.name)}
                        className="btn btn-primary"
                        style={{ minHeight: '36px', padding: '6px 14px', fontSize: '0.8rem' }}
                        disabled={markingPersonId === p.id}
                      >
                        {markingPersonId === p.id ? <span className="spinner spinner-white" style={{ width: '14px', height: '14px' }}></span> : 'Mark Present'}
                      </button>
                    );
                  }
                }
              ]}
              data={peopleList}
              page={peoplePage}
              pages={peoplePages}
              totalCount={peopleTotal}
              onPageChange={setPeoplePage}
              loading={peopleLoading}
              emptyState={
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Users size={32} style={{ marginBottom: '12px' }} />
                  <p>No people records found matching your search.</p>
                </div>
              }
            />
          </div>
        )}

        {/* Team Details & PS Allotment Modal */}
        {selectedTeam && (
          <div className="modal-overlay-fade" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div className="glass-card modal-scale-up" style={{ width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', padding: '28px', position: 'relative' }}>
              <button onClick={() => setSelectedTeam(null)} style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 800 }}>{selectedTeam.name}</h2>
                <span className="status-badge" style={{ fontSize: '0.75rem', fontWeight: 700, background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
                  {detailedTeam?.category || selectedTeam.category || 'ENGINEERING'}
                </span>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '8px' }}>
                Code: <strong>{detailedTeam?.registrationId || selectedTeam.registrationId}</strong> | Active Checkpoint: <strong style={{ color: 'var(--primary)' }}>{activeCheckpointName}</strong>
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-light)', padding: '4px 10px', borderRadius: '6px' }}>
                  Bench / Desk #: <strong style={{ color: 'var(--text-primary)' }}>{detailedTeam?.deskNumber || selectedTeam?.deskNumber || '—'}</strong>
                </span>
                <span style={{ fontSize: '0.8rem', background: 'rgba(185, 111, 56, 0.12)', border: '1px solid rgba(185, 111, 56, 0.3)', padding: '4px 10px', borderRadius: '6px', color: 'var(--primary)' }}>
                  POD Group: <strong>{detailedTeam?.podName || selectedTeam?.podName || 'Unassigned'}</strong>
                </span>
              </div>

              {modalLoading ? (
                <div style={{ padding: '40px', textAlign: 'center' }}>
                  <span className="spinner" style={{ width: '32px', height: '32px', margin: '0 auto' }}></span>
                </div>
              ) : detailedTeam ? (
                <div>
                  {/* Problem Statement Allotment Card (When Admin Enabled) */}
                  {allowVolunteerPsSelection && (
                    <div 
                      style={{ 
                        background: 'rgba(99, 102, 241, 0.06)', 
                        border: '1px solid rgba(99, 102, 241, 0.3)', 
                        borderRadius: '12px', 
                        padding: '16px', 
                        marginBottom: '20px' 
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <Layers size={18} style={{ color: 'var(--primary)' }} />
                        <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Problem Statement Allotment</h3>
                      </div>

                      {detailedTeam.selectedProblemStatement ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '10px 14px', borderRadius: '8px', marginBottom: '12px' }}>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700 }}>CURRENT ALLOTMENT</div>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                              [{detailedTeam.selectedProblemStatement.code}] {detailedTeam.selectedProblemStatement.title}
                            </div>
                          </div>
                          <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', fontWeight: 700 }}>
                            LOCKED IN
                          </span>
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                          No problem statement selected yet by this team.
                        </div>
                      )}

                      {/* Dropdown to assign or re-assign */}
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <select
                          value={selectedPsId}
                          onChange={(e) => setSelectedPsId(e.target.value)}
                          className="form-input"
                          style={{ flex: 1, minWidth: '240px', padding: '8px 12px', fontSize: '0.85rem' }}
                        >
                          <option value="">-- Select Problem Statement to Assign --</option>
                          {availablePsList.map((ps) => {
                            const isFull = ps.remainingCapacity === 0;
                            return (
                              <option key={ps.id} value={ps.id} disabled={isFull}>
                                [{ps.code}] {ps.title} ({ps.remainingCapacity} slots left) {isFull ? '- [FULL]' : ''}
                              </option>
                            );
                          })}
                        </select>
                        <button
                          onClick={handleAssignPs}
                          disabled={isAssigningPs || !selectedPsId}
                          className="btn btn-primary"
                          style={{ padding: '8px 16px', fontSize: '0.85rem', fontWeight: 600, minHeight: '38px' }}
                        >
                          {isAssigningPs ? 'Locking in...' : detailedTeam.selectedProblemStatement ? 'Re-assign Topic' : 'Lock In PS'}
                        </button>
                      </div>
                    </div>
                  )}

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
                            <div style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {member.name}
                              {member.isTeamLeader && (
                                <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.2)', color: 'var(--primary)', fontWeight: 700 }}>
                                  LEADER
                                </span>
                              )}
                            </div>
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
                                style={{ minHeight: '40px', padding: '8px 18px', fontSize: '0.85rem' }}
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

        {scannerOpen && (
          <QRScanner
            onScan={handleQrScan}
            onClose={() => setScannerOpen(false)}
          />
        )}
      </div>
    </div>
  );
};

export default VolunteerDashboard;
