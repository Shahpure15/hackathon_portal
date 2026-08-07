import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Users, Layers, UserCheck, FileText, Download, Upload, 
  Search, X, Edit2, AlertCircle, CheckCircle, Info, ChevronLeft, ChevronRight, Eye, EyeOff, LogOut, Menu
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../contexts/ToastContext';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import CredentialDialog from '../components/CredentialDialog';
import DateTimePicker from '../components/DateTimePicker';
import useTableQuery from '../components/useTableQuery';

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

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('teams');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { addToast } = useToast();

  // Shared state: Pods (needed for team filtering & editing)
  const [pods, setPods] = useState([]);

  // Fetch pods pool
  const fetchPodsPool = async () => {
    try {
      const res = await api.get('/admin/pods');
      setPods(res.data || []);
    } catch (err) {
      // If endpoint doesn't exist yet (Phase 5), fall back to empty
      setPods([]);
    }
  };

  useEffect(() => {
    fetchPodsPool();
  }, [activeTab]);

  return (
    <div className="dashboard-layout">
      {/* Sidebar Navigation */}
      <div 
        className="sidebar" 
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          height: '100%', 
          justifyContent: 'space-between', 
          padding: '24px 0',
          width: sidebarCollapsed ? '80px' : '260px',
          transition: 'width 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          overflow: 'hidden'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'space-between', padding: sidebarCollapsed ? '0 12px 32px 12px' : '0 24px 32px 24px', transition: 'padding 0.25s' }}>
            {!sidebarCollapsed && (
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }} className="text-gradient">
                  Event Portal
                </h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Admin Panel</span>
              </div>
            )}
            <button 
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', borderRadius: '6px' }}
              title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {sidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            </button>
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: sidebarCollapsed ? '0 8px' : '0 12px', transition: 'padding 0.25s' }}>
            <button
              onClick={() => setActiveTab('teams')}
              className={`btn ${activeTab === 'teams' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: sidebarCollapsed ? '12px' : '12px 16px', border: 'none', background: activeTab === 'teams' ? undefined : 'transparent', width: '100%', minHeight: 'auto', height: '48px' }}
              title="Teams"
            >
              <Users size={18} />
              {!sidebarCollapsed && <span style={{ marginLeft: '12px', textTransform: 'none', letterSpacing: 'normal' }}>Teams</span>}
            </button>
            <button
              onClick={() => setActiveTab('pods')}
              className={`btn ${activeTab === 'pods' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: sidebarCollapsed ? '12px' : '12px 16px', border: 'none', background: activeTab === 'pods' ? undefined : 'transparent', width: '100%', minHeight: 'auto', height: '48px' }}
              title="POD Groups"
            >
              <Layers size={18} />
              {!sidebarCollapsed && <span style={{ marginLeft: '12px', textTransform: 'none', letterSpacing: 'normal' }}>POD Groups</span>}
            </button>
            <button
              onClick={() => setActiveTab('volunteers')}
              className={`btn ${activeTab === 'volunteers' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: sidebarCollapsed ? '12px' : '12px 16px', border: 'none', background: activeTab === 'volunteers' ? undefined : 'transparent', width: '100%', minHeight: 'auto', height: '48px' }}
              title="Volunteers"
            >
              <UserCheck size={18} />
              {!sidebarCollapsed && <span style={{ marginLeft: '12px', textTransform: 'none', letterSpacing: 'normal' }}>Volunteers</span>}
            </button>
            <button
              onClick={() => setActiveTab('ps')}
              className={`btn ${activeTab === 'ps' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: sidebarCollapsed ? '12px' : '12px 16px', border: 'none', background: activeTab === 'ps' ? undefined : 'transparent', width: '100%', minHeight: 'auto', height: '48px' }}
              title="Problem Statements"
            >
              <FileText size={18} />
              {!sidebarCollapsed && <span style={{ marginLeft: '12px', textTransform: 'none', letterSpacing: 'normal' }}>Problem Statements</span>}
            </button>
          </nav>
        </div>

        <div style={{ padding: sidebarCollapsed ? '0 8px' : '0 24px', transition: 'padding 0.25s' }}>
          <button 
            onClick={async () => {
              await api.post('/auth/logout');
              window.location.href = '/login';
            }} 
            className="btn btn-secondary" 
            style={{ width: '100%', padding: sidebarCollapsed ? '12px' : '12px 16px', justifyContent: 'center', minHeight: 'auto', height: '48px' }}
            title="Logout"
          >
            <LogOut size={18} />
            {!sidebarCollapsed && <span style={{ marginLeft: '8px', textTransform: 'none', letterSpacing: 'normal' }}>Logout</span>}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="main-content" style={{ backgroundColor: 'var(--bg-main)' }}>
        {activeTab === 'teams' && <div className="fade-in-up"><TeamsView pods={pods} fetchPodsPool={fetchPodsPool} /></div>}
        {activeTab === 'pods' && <div className="fade-in-up"><PodsView pods={pods} fetchPodsPool={fetchPodsPool} /></div>}
        {activeTab === 'volunteers' && <div className="fade-in-up"><VolunteersView pods={pods} fetchPodsPool={fetchPodsPool} /></div>}
        {activeTab === 'ps' && <div className="fade-in-up"><PSView /></div>}
      </div>
    </div>
  );
};

// ==========================================
// PLACEHOLDER TAB VIEW
// ==========================================
const PlaceholderView = ({ title, description }) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', alignItems: 'center', textAlign: 'center', opacity: 0.6 }}>
    <Info size={48} style={{ marginBottom: '16px', color: 'var(--primary)' }} />
    <h2>{title}</h2>
    <p style={{ maxWidth: '400px', marginTop: '8px', color: 'var(--text-secondary)' }}>{description}</p>
  </div>
);


// ==========================================
// TEAMS TAB VIEW
// ==========================================
const TeamsView = ({ pods, fetchPodsPool }) => {
  const { addToast } = useToast();
  const [teams, setTeams] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const {
    page,
    setPage,
    search,
    setSearch,
    filters,
    onFilterChange,
    clearFilters
  } = useTableQuery('', 'asc', 'teams');

  // Modals Control
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);

  // Debounced fetch when search, filters or page changes
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchTeams();
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [search, filters, page]);

  const fetchTeams = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/teams', {
        params: {
          search: search || undefined,
          status: filters.status || undefined,
          podId: filters.podId || undefined,
          hasPod: filters.hasPod === '' || filters.hasPod === undefined ? undefined : filters.hasPod === 'true',
          hasPs: filters.hasPs === '' || filters.hasPs === undefined ? undefined : filters.hasPs === 'true',
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

  const handleExport = () => {
    // Standard file download request
    const API_URL = import.meta.env.VITE_API_URL || '/api';
    window.open(`${API_URL}/admin/teams/export`, '_blank');
    addToast('Roster download triggered', 'info');
  };

  return (
    <div>
      {/* Top Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800 }}>Teams Directory</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Roster of {total} registered teams, statuses, and pod groupings.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={handleExport} className="btn btn-secondary">
            <Download size={16} />
            Export CSV
          </button>
          <button onClick={() => setShowImportModal(true)} className="btn btn-primary">
            <Upload size={16} />
            Import CSV
          </button>
        </div>
      </div>

      {/* Filter and Search controls */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', width: '100%' }}>
          <div style={{ position: 'relative', flex: 2, minWidth: '280px' }}>
            <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search teams by name, leader, email, college, code..."
              className="form-input"
              style={{ paddingLeft: '48px', width: '100%' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ flex: 1, minWidth: '150px' }}>
            <select 
              value={filters.status || ''} 
              onChange={(e) => onFilterChange('status', e.target.value)} 
              className="form-input" 
              style={{ width: '100%', padding: '10px' }}
            >
              <option value="">All Statuses</option>
              <option value="REGISTERED">Registered</option>
              <option value="SHORTLISTED">Shortlisted</option>
              <option value="WAITLISTED">Waitlisted</option>
              <option value="DISQUALIFIED">Disqualified</option>
            </select>
          </div>

          <div style={{ flex: 1, minWidth: '150px' }}>
            <select 
              value={filters.podId || ''} 
              onChange={(e) => onFilterChange('podId', e.target.value)} 
              className="form-input" 
              style={{ width: '100%', padding: '10px' }}
            >
              <option value="">All POD Groups</option>
              {pods.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <select 
              value={filters.hasPod || ''} 
              onChange={(e) => onFilterChange('hasPod', e.target.value)} 
              className="form-input" 
              style={{ width: '180px', padding: '8px 12px', fontSize: '0.85rem' }}
            >
              <option value="">All POD Statuses</option>
              <option value="true">Assigned to POD</option>
              <option value="false">Unassigned (No POD)</option>
            </select>

            <select 
              value={filters.hasPs || ''} 
              onChange={(e) => onFilterChange('hasPs', e.target.value)} 
              className="form-input" 
              style={{ width: '200px', padding: '8px 12px', fontSize: '0.85rem' }}
            >
              <option value="">All PS Statuses</option>
              <option value="true">Selected a PS</option>
              <option value="false">No PS Selected</option>
            </select>
          </div>

          {(search || filters.status || filters.podId || filters.hasPod || filters.hasPs) && (
            <button 
              type="button" 
              onClick={clearFilters} 
              className="btn btn-secondary"
              style={{ padding: '6px 12px', minHeight: 'auto', fontSize: '0.8rem' }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <DataTable
        columns={[
          {
            header: 'Team Info',
            accessor: 'name',
            render: (t) => (
              <div>
                <div style={{ fontWeight: 600, fontSize: '1rem' }}>{t.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Code: <strong style={{ color: 'var(--text-secondary)' }}>{t.registrationId}</strong> | {t.collegeName}
                </div>
              </div>
            )
          },
          {
            header: 'Leader Contact',
            accessor: 'leaderName',
            render: (t) => (
              <div>
                <div style={{ fontWeight: 500 }}>{t.leaderName}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>{t.leaderEmail}</div>
              </div>
            )
          },
          {
            header: 'POD Group',
            accessor: 'podName',
            render: (t) => (
              t.podName ? (
                <span style={{ fontSize: '0.85rem', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', padding: '4px 8px', borderRadius: '6px', fontWeight: 600 }}>
                  {t.podName}
                </span>
              ) : (
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Unassigned</span>
              )
            )
          },
          {
            header: 'Problem Statement',
            accessor: 'selectedPsCode',
            render: (t) => (
              t.selectedPsCode ? (
                <span style={{ fontSize: '0.85rem', color: 'var(--accent-blue)', fontWeight: 600 }}>
                  {t.selectedPsCode}
                </span>
              ) : (
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>None locked</span>
              )
            )
          },
          {
            header: 'Status',
            accessor: 'status',
            render: (t) => (
              <span className={`status-badge status-${t.status.toLowerCase()}`}>
                {t.status}
              </span>
            )
          },
          {
            header: '',
            align: 'right',
            width: '80px',
            render: (t) => (
              <button
                onClick={() => setSelectedTeam(t)}
                className="btn btn-secondary"
                style={{ padding: '8px', borderRadius: '8px' }}
                title="Edit Team"
              >
                <Edit2 size={14} />
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
            <p>No teams match your criteria.</p>
          </div>
        }
      />

      {/* Team Details Modal */}
      {selectedTeam && (
        <TeamDetailsModal
          team={selectedTeam}
          pods={pods}
          fetchPodsPool={fetchPodsPool}
          onClose={() => {
            setSelectedTeam(null);
            fetchTeams();
          }}
        />
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <CsvImportModal
          onClose={() => {
            setShowImportModal(false);
            fetchTeams();
          }}
        />
      )}

      {/* CSS badge styling injection */}
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
    </div>
  );
};


// ==========================================
// TEAM DETAILS MODAL COMPONENT
// ==========================================
const TeamDetailsModal = ({ team, pods, fetchPodsPool, onClose }) => {
  const { addToast } = useToast();
  const [status, setStatus] = useState(team.status);
  const [podId, setPodId] = useState(team.podId || '');
  const [psId, setPsId] = useState('');
  const [members, setMembers] = useState(team.members || []);
  const [problemStatements, setProblemStatements] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [inlinePodName, setInlinePodName] = useState('');
  const [showInlinePod, setShowInlinePod] = useState(false);

  // Handle outside click/Escape closes
  const modalRef = useRef();
  
  const handleResetTeamPassword = async () => {
    const customPassword = window.prompt(`Enter a new password for team '${team.name}' (leave blank to auto-generate):`);
    if (customPassword === null) return;
    
    try {
      const payload = customPassword.trim() ? { password: customPassword.trim() } : {};
      const res = await api.post(`/admin/teams/${team.id}/reset-password`, payload);
      addToast(`Password reset for ${team.name}!`, 'success');
      alert(`Password Reset for ${team.name}!\n\nUsername: ${res.data.username}\nPassword: ${res.data.password}\n\nPlease copy these credentials now.`);
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to reset password', 'error');
    }
  };
  
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const fetchDetails = async () => {
      setLoadingDetails(true);
      try {
        const teamRes = await api.get(`/admin/teams/${team.id}`);
        setStatus(teamRes.data.status);
        setPodId(teamRes.data.podId || '');
        setPsId(teamRes.data.psId || '');
        setMembers(teamRes.data.members || []);
        
        const psRes = await api.get('/admin/problem-statements');
        setProblemStatements(psRes.data || []);
      } catch (err) {
        addToast('Failed to load team detailed information', 'error');
      } finally {
        setLoadingDetails(false);
      }
    };
    fetchDetails();
  }, [team.id]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await api.patch(`/admin/teams/${team.id}`, {
        status,
        podId: podId || null,
        psId: psId || null
      });
      
      const resWarning = res.data.diff?._warning;
      if (resWarning) {
        addToast(resWarning, 'warning');
      } else {
        addToast('Team updated successfully!', 'success');
      }
      onClose();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to update team details', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateInlinePod = async (e) => {
    e.preventDefault();
    if (!inlinePodName.trim()) return;
    
    try {
      const res = await api.post('/admin/pods', { name: inlinePodName.trim() });
      addToast(`POD ${res.data.name} created!`, 'success');
      setInlinePodName('');
      setShowInlinePod(false);
      await fetchPodsPool();
      setPodId(res.data.id);
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to create pod', 'error');
    }
  };

  return createPortal(
    <div 
      onClick={(e) => e.target === modalRef.current && onClose()}
      ref={modalRef}
      className="modal-overlay-fade"
      style={{ background: 'rgba(0,0,0,0)' }}
    >
      <div className="glass-card modal-scale-up" style={{ width: '80vw', maxWidth: '1200px', padding: '24px', position: 'relative' }}>
        <button 
          onClick={onClose} 
          style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
        >
          <X size={20} />
        </button>

        <h2 style={{ fontSize: '1.75rem', marginBottom: '4px' }}>{team.name}</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px' }}>
          Registration Code: {team.registrationId} | Synced from CSV
        </p>

        {loadingDetails ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <span className="spinner" style={{ width: '32px', height: '32px', margin: '0 auto' }}></span>
            <p style={{ marginTop: '12px', color: 'var(--text-secondary)' }}>Loading team information...</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '24px' }}>
            {/* Left column: read-only summaries & forms */}
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>Leader Contact</span>
                  <div style={{ fontWeight: 600, marginTop: '4px' }}>{team.leaderName}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{team.leaderEmail}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{team.leaderPhone}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>College</span>
                  <div style={{ fontWeight: 600, marginTop: '4px', fontSize: '0.85rem', lineHeight: '1.4' }}>{team.collegeName}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Locked from CSV source</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>Leader Account</span>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Username: <code>{team.registrationId.toLowerCase()}</code></div>
                  </div>
                  <button 
                    onClick={handleResetTeamPassword}
                    className="btn btn-secondary"
                    style={{ padding: '4px 8px', fontSize: '0.75rem', minHeight: 0, height: 'auto', marginTop: '6px', alignSelf: 'flex-start' }}
                  >
                    Reset Password
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '0' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Team Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value)} className="form-input">
                    <option value="REGISTERED">Registered</option>
                    <option value="SHORTLISTED">Shortlisted</option>
                    <option value="WAITLISTED">Waitlisted</option>
                    <option value="DISQUALIFIED">Disqualified</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>POD Grouping</span>
                    <button 
                      onClick={() => setShowInlinePod(!showInlinePod)} 
                      type="button" 
                      style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                    >
                      + Create New
                    </button>
                  </label>
                  {showInlinePod ? (
                    <form onSubmit={handleCreateInlinePod} style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      <input
                        type="text"
                        placeholder="Pod Name (e.g. Pod 10)"
                        className="form-input"
                        value={inlinePodName}
                        onChange={(e) => setInlinePodName(e.target.value)}
                      />
                      <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px' }}>Save</button>
                    </form>
                  ) : (
                    <select value={podId} onChange={(e) => setPodId(e.target.value)} className="form-input">
                      <option value="">Unassigned</option>
                      {pods.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.capacity ? `(${p.capacity} max)` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Problem Statement Assignment</label>
                  <select value={psId} onChange={(e) => setPsId(e.target.value)} className="form-input">
                    <option value="">No Problem Statement Selected (Unassigned)</option>
                    {problemStatements.map((ps) => (
                      <option key={ps.id} value={ps.id}>
                        [{ps.code}] {ps.title} ({ps.selectedCount}/{ps.capacity} filled)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Right column: member lists */}
            <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border-light)', paddingLeft: '24px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '16px' }}>Team Roster</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '340px', paddingRight: '4px' }}>
                {members.map((m) => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderRadius: '8px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-light)' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{m.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>{m.email}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{m.phone}</div>
                    </div>
                    <div>
                      {m.idVerified ? (
                        <span style={{ color: 'var(--success)', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(16, 185, 129, 0.1)', padding: '4px 8px', borderRadius: '6px' }}>✓ Verified</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', background: 'rgba(255, 255, 255, 0.03)', padding: '4px 8px', borderRadius: '6px' }}>Awaiting Venue Check-in</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border-light)', paddingTop: '16px', marginTop: '16px' }}>
          <button onClick={onClose} className="btn btn-secondary" disabled={isSaving}>Cancel</button>
          <button onClick={handleSave} className="btn btn-primary" disabled={isSaving}>
            {isSaving ? <span className="spinner"></span> : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};


// ==========================================
// CSV IMPORT MODAL WIZARD
// ==========================================
const CsvImportModal = ({ onClose }) => {
  const { addToast } = useToast();
  
  const [step, setStep] = useState(1); // 1: Upload, 2: Preview, 3: Credentials
  const [file, setFile] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  
  // Preview data
  const [importId, setImportId] = useState(null);
  const [summary, setSummary] = useState({ new: 0, changed: 0, unchanged: 0, invalid: 0 });
  const [changedRows, setChangedRows] = useState([]);
  const [invalidRows, setInvalidRows] = useState([]);
  const [decisions, setDecisions] = useState({}); // regId -> "update" | "skip"
  
  // Credentials outputs
  const [credentials, setCredentials] = useState([]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    if (!selected.name.endsWith('.csv')) {
      addToast('Invalid file format. Select a .csv file', 'error');
      return;
    }

    if (selected.size > 2 * 1024 * 1024) {
      addToast('File too large. Maximum size is 2MB', 'error');
      return;
    }

    setFile(selected);
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setIsAnalyzing(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/admin/teams/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setImportId(res.data.importId);
      setSummary(res.data.summary);
      setChangedRows(res.data.details.changed || []);
      setInvalidRows(res.data.details.invalid || []);
      
      // Initialize decisions (default is update)
      const initialDecisions = {};
      (res.data.details.changed || []).forEach(row => {
        initialDecisions[row.registrationId] = 'update';
      });
      setDecisions(initialDecisions);
      
      setStep(2);
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to analyze CSV file', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDecisionToggle = (regId) => {
    setDecisions(prev => ({
      ...prev,
      [regId]: prev[regId] === 'update' ? 'skip' : 'update'
    }));
  };

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      const res = await api.post('/admin/teams/import/confirm', decisions, {
        params: { importId }
      });
      
      setCredentials(res.data.credentials || []);
      addToast('CSV data successfully imported!', 'success');
      setStep(3);
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to commit import transaction', 'error');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleDownloadCredentials = () => {
    // Generate text content
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Team Name,Team Code,Leader Username,Generated Password\n";
    
    credentials.forEach(cred => {
      csvContent += `"${cred.teamName}","${cred.registrationId}","${cred.username}","${cred.password}"\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "generated_leader_logins.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return createPortal(
    <div className="modal-overlay-fade" style={{ background: 'rgba(0,0,0,0)' }}>
      <div className="glass-card modal-scale-up" style={{ width: '100%', maxWidth: '800px', padding: '32px', position: 'relative' }}>
        
        {step < 3 && (
          <button 
            onClick={onClose} 
            style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <X size={20} />
          </button>
        )}

        <h2 style={{ fontSize: '1.75rem', marginBottom: '8px' }} className="text-gradient">
          CSV Team Importer
        </h2>
        
        {/* Step progress header */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', fontSize: '0.85rem' }}>
          <span style={{ fontWeight: step === 1 ? '700' : 'normal', color: step === 1 ? 'var(--primary)' : 'var(--text-muted)' }}>1. Upload</span>
          <span style={{ color: 'var(--text-muted)' }}>➔</span>
          <span style={{ fontWeight: step === 2 ? '700' : 'normal', color: step === 2 ? 'var(--primary)' : 'var(--text-muted)' }}>2. Review & Resolve</span>
          <span style={{ color: 'var(--text-muted)' }}>➔</span>
          <span style={{ fontWeight: step === 3 ? '700' : 'normal', color: step === 3 ? 'var(--primary)' : 'var(--text-muted)' }}>3. Leader Credentials</span>
        </div>

        {/* STEP 1: UPLOAD */}
        {step === 1 && (
          <div>
            <div style={{ border: '2px dashed var(--border-light)', borderRadius: '12px', padding: '48px 24px', textAlign: 'center', marginBottom: '24px', cursor: 'pointer', background: 'rgba(255,255,255,0.01)' }} onClick={() => document.getElementById('csvFile').click()}>
              <Upload size={36} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
              <p style={{ fontWeight: 600 }}>Click to browse registration CSV</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>CSV format only, max 2MB</p>
              
              {file && (
                <div style={{ marginTop: '16px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)', display: 'inline-flex', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--primary)', gap: '8px', alignItems: 'center' }}>
                  <span>{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
              )}
              
              <input
                id="csvFile"
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={onClose} className="btn btn-secondary">Cancel</button>
              <button onClick={handleAnalyze} className="btn btn-primary" disabled={!file || isAnalyzing}>
                {isAnalyzing ? <span className="spinner"></span> : 'Analyze File'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: PREVIEW */}
        {step === 2 && (
          <div>
            {/* Counts dashboard */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>New Teams</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary)', marginTop: '4px' }}>{summary.new}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Changes</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--warning)', marginTop: '4px' }}>{summary.changed}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Unchanged</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '4px' }}>{summary.unchanged}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '12px', textAlign: 'center', borderColor: summary.invalid > 0 ? 'rgba(239, 68, 68, 0.2)' : undefined }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Invalid</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: summary.invalid > 0 ? 'var(--danger)' : 'var(--text-muted)', marginTop: '4px' }}>{summary.invalid}</div>
              </div>
            </div>

            {/* Error banner blocking confirm */}
            {summary.invalid > 0 && (
              <div className="toast toast-error" style={{ position: 'static', width: '100%', maxWidth: 'none', margin: '0 0 20px 0', borderLeft: '4px solid var(--danger)' }}>
                <AlertCircle size={20} style={{ color: 'var(--danger)' }} />
                <div>
                  <h4 style={{ fontWeight: 700 }}>Import Blocked</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    The file contains {summary.invalid} invalid rows. Correct these in your source file and re-upload.
                  </p>
                </div>
              </div>
            )}

            {/* Scrollable list of Diffs and validation failures */}
            <div style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '16px', marginBottom: '24px', background: 'rgba(0,0,0,0.1)' }}>
              {/* Invalid Rows Details */}
              {invalidRows.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{ color: 'var(--danger)', fontSize: '0.9rem', display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
                    <AlertCircle size={14} /> Validation Errors
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {invalidRows.map((err, i) => (
                      <div key={i} style={{ fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.05)', padding: '8px 12px', borderRadius: '6px', borderLeft: '3px solid var(--danger)' }}>
                        Row {err.row}: <strong>{err.reason}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Changed Rows Details */}
              {changedRows.length > 0 && (
                <div>
                  <h4 style={{ color: 'var(--warning)', fontSize: '0.9rem', display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '12px' }}>
                    <Info size={14} /> Review Changed Fields
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {changedRows.map((row) => (
                      <div key={row.registrationId} style={{ border: '1px solid var(--border-light)', borderRadius: '8px', padding: '12px', background: 'rgba(255,255,255,0.01)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontWeight: 600 }}>{row.name} ({row.registrationId})</span>
                          <button 
                            type="button"
                            onClick={() => handleDecisionToggle(row.registrationId)}
                            className={`btn ${decisions[row.registrationId] === 'update' ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '6px' }}
                          >
                            {decisions[row.registrationId] === 'update' ? 'Will Update' : 'Will Skip'}
                          </button>
                        </div>
                        {/* Render Field Diffs */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '8px', borderLeft: '2px solid rgba(255,255,255,0.05)' }}>
                          {Object.entries(row.changes).map(([field, delta]) => (
                            <div key={field} style={{ fontSize: '0.8rem' }}>
                              <span style={{ color: 'var(--text-muted)' }}>{field}:</span>{' '}
                              <del style={{ color: 'var(--danger)', opacity: 0.8, textDecoration: 'line-through', marginRight: '6px' }}>
                                {Array.isArray(delta.from) ? delta.from.join(', ') : String(delta.from)}
                              </del>{' '}
                              <ins style={{ color: 'var(--success)', textDecoration: 'none', fontWeight: 600 }}>
                                {Array.isArray(delta.to) ? delta.to.join(', ') : String(delta.to)}
                              </ins>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {changedRows.length === 0 && invalidRows.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  <CheckCircle size={32} style={{ color: 'var(--success)', marginBottom: '8px' }} />
                  <p>All records are valid! {summary.new} new team logins will be provisioned.</p>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setStep(1)} className="btn btn-secondary">Back</button>
              <button 
                onClick={handleConfirm} 
                className="btn btn-primary" 
                disabled={summary.invalid > 0 || isConfirming}
              >
                {isConfirming ? <span className="spinner"></span> : 'Confirm Import'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: CREDENTIALS */}
        {step === 3 && (
          <div>
            <div className="toast toast-success" style={{ position: 'static', width: '100%', maxWidth: 'none', margin: '0 0 24px 0', borderLeft: '4px solid var(--success)' }}>
              <CheckCircle size={20} style={{ color: 'var(--success)' }} />
              <div>
                <h4 style={{ fontWeight: 700 }}>Import Successful!</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Leader accounts have been generated. Download this list now; these passwords are cryptographically hashed and cannot be retrieved later.
                </p>
              </div>
            </div>

            {/* Scrollable credentials output */}
            <div style={{ border: '1px solid var(--border-light)', borderRadius: '10px', overflow: 'hidden', marginBottom: '24px', maxHeight: '240px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-light)' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--text-muted)' }}>Team Name</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--text-muted)' }}>Code</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--text-muted)' }}>Username</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--text-muted)' }}>Password</th>
                  </tr>
                </thead>
                <tbody>
                  {credentials.map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600 }}>{c.teamName}</td>
                      <td style={{ padding: '10px 16px' }}>{c.registrationId}</td>
                      <td style={{ padding: '10px 16px', fontFamily: 'monospace' }}>{c.username}</td>
                      <td style={{ padding: '10px 16px', fontFamily: 'monospace', color: 'var(--accent-blue)', fontWeight: 600 }}>{c.password}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={handleDownloadCredentials} className="btn btn-secondary">
                <Download size={16} />
                Download CSV
              </button>
              <button onClick={onClose} className="btn btn-primary">Finish & Close</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

// ==========================================
// PODS VIEW TAB COMPONENT
// ==========================================
const PodsView = ({ pods, fetchPodsPool }) => {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPod, setSelectedPod] = useState(null);
  
  // Create Pod Form State
  const [podName, setPodName] = useState('');
  const [podCapacity, setPodCapacity] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (showCreateModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showCreateModal]);

  const handleCreatePodSubmit = async (e) => {
    e.preventDefault();
    if (!podName.trim()) return;

    setIsCreating(true);
    try {
      await api.post('/admin/pods', {
        name: podName.trim(),
        capacity: podCapacity ? parseInt(podCapacity) : null
      });
      addToast(`POD Group ${podName} created successfully!`, 'success');
      setPodName('');
      setPodCapacity('');
      setShowCreateModal(false);
      fetchPodsPool();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to create POD', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeletePod = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete POD group '${name}'?`)) return;

    try {
      await api.delete(`/admin/pods/${id}`);
      addToast('POD deleted successfully', 'success');
      fetchPodsPool();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to delete POD', 'error');
    }
  };

  const handleExportRoster = (id, name) => {
    const API_URL = import.meta.env.VITE_API_URL || '/api';
    window.open(`${API_URL}/admin/pods/${id}/export`, '_blank');
    addToast(`Exporting roster for ${name}`, 'info');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800 }}>POD Groupings</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Groupings for mentor assignments and team checkpoints.
          </p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
          + Create POD Group
        </button>
      </div>

      {/* Grid of Pod Tiles */}
      {pods.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }} className="glass-panel">
          <Layers size={32} style={{ marginBottom: '12px' }} />
          <p>No POD groups created yet. Click the button to add one.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
          {pods.map((p) => {
            const isFull = p.capacity ? p.teamCount >= p.capacity : false;
            const fillPercent = p.capacity ? Math.min((p.teamCount / p.capacity) * 100, 100) : 0;
            
            return (
              <div 
                key={p.id} 
                className="glass-card" 
                style={{ padding: '24px', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer' }}
                onClick={() => setSelectedPod(p)}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>{p.name}</h3>
                    <span style={{ fontSize: '0.75rem', background: isFull ? 'var(--danger-glow)' : 'rgba(255,255,255,0.03)', color: isFull ? 'var(--danger)' : 'var(--text-muted)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                      {p.capacity ? `${p.teamCount}/${p.capacity} Teams` : `${p.teamCount} Teams`}
                    </span>
                  </div>

                  {/* Visual Capacity Bar */}
                  {p.capacity && (
                    <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden', marginBottom: '16px' }}>
                      <div style={{ width: `${fillPercent}%`, height: '100%', background: isFull ? 'var(--danger)' : 'var(--primary)', borderRadius: '3px' }}></div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <div>
                      <strong>{p.teamCount}</strong> Teams
                    </div>
                    <div>
                      <strong>{p.volunteerCount}</strong> Mentors
                    </div>
                  </div>
                </div>

                {/* Quick actions (stopping propagation to prevent triggering click-to-modal) */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '20px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleExportRoster(p.id, p.name); }}
                    className="btn btn-secondary" 
                    style={{ flex: 1, padding: '8px 12px', fontSize: '0.8rem' }}
                  >
                    <Download size={12} /> Roster
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeletePod(p.id, p.name); }}
                    className="btn btn-secondary" 
                    style={{ padding: '8px', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.15)' }}
                    title="Delete Pod"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreateModal && createPortal(
        <div className="modal-overlay-fade" style={{ background: 'rgba(0,0,0,0)' }}>
          <div className="glass-card modal-scale-up" style={{ width: '100%', maxWidth: '440px', padding: '24px', position: 'relative' }}>
            <button onClick={() => setShowCreateModal(false)} style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <X size={20} />
            </button>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '16px' }} className="text-gradient">Create POD Group</h2>
            
            <form onSubmit={handleCreatePodSubmit}>
              <div className="form-group">
                <label className="form-label">POD Group Name</label>
                <input
                  type="text"
                  placeholder="e.g. POD Alpha"
                  className="form-input"
                  value={podName}
                  onChange={(e) => setPodName(e.target.value)}
                  required
                  disabled={isCreating}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">Team Capacity (Optional)</label>
                <input
                  type="number"
                  placeholder="e.g. 8"
                  className="form-input"
                  value={podCapacity}
                  onChange={(e) => setPodCapacity(e.target.value)}
                  disabled={isCreating}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary" disabled={isCreating}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isCreating}>
                  {isCreating ? <span className="spinner"></span> : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}


      {/* Pod Details Modal */}
      {selectedPod && (
        <PodRosterModal 
          pod={selectedPod} 
          onClose={() => {
            setSelectedPod(null);
            fetchPodsPool();
          }} 
        />
      )}
    </div>
  );
};


// ==========================================
// POD ROSTER MODAL COMPONENT
// ==========================================
const PodRosterModal = ({ pod, onClose }) => {
  const { addToast } = useToast();
  const [teams, setTeams] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // New States for volunteer management
  const [allVolunteersPool, setAllVolunteersPool] = useState([]);
  const [selectedExistingVolId, setSelectedExistingVolId] = useState('');
  const [showAddExisting, setShowAddExisting] = useState(false);
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [isActionSaving, setIsActionSaving] = useState(false);

  // New volunteer form states
  const [newVolName, setNewVolName] = useState('');
  const [newVolType, setNewVolType] = useState('FACULTY');
  const [newVolEmail, setNewVolEmail] = useState('');
  const [newVolPhone, setNewVolPhone] = useState('');


  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const fetchRoster = async () => {
    try {
      // Fetch teams assigned to this pod
      const teamsRes = await api.get('/admin/teams', { params: { podId: pod.id, limit: 100 } });
      setTeams(teamsRes.data.results || []);

      // Fetch volunteers pool
      const volRes = await api.get('/admin/volunteers');
      const allVols = volRes.data || [];
      setAllVolunteersPool(allVols);
      
      const podVols = allVols.filter(v => v.podId === pod.id);
      setVolunteers(podVols);
    } catch (err) {
      addToast('Failed to fetch POD roster details', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoster();
  }, [pod.id]);

  const handleAssignExistingSubmit = async () => {
    if (!selectedExistingVolId) return;
    setIsActionSaving(true);
    try {
      await api.patch(`/admin/volunteers/${selectedExistingVolId}`, {
        podId: pod.id
      });
      addToast('Volunteer assigned successfully!', 'success');
      setSelectedExistingVolId('');
      setShowAddExisting(false);
      await fetchRoster();
    } catch (err) {
      addToast('Failed to assign volunteer', 'error');
    } finally {
      setIsActionSaving(false);
    }
  };

  const handleCreateNewSubmit = async (e) => {
    e.preventDefault();
    if (!newVolName.trim() || !newVolEmail.trim()) return;
    setIsActionSaving(true);
    try {
      const combinedContact = `${newVolEmail.trim()} | ${newVolPhone.trim()}`;
      await api.post('/admin/volunteers', {
        name: newVolName.trim(),
        type: newVolType,
        contact: combinedContact,
        podId: pod.id
      });
      addToast('Volunteer created and assigned successfully!', 'success');
      setNewVolName('');
      setNewVolEmail('');
      setNewVolPhone('');
      setNewVolType('MENTOR');
      setShowCreateNew(false);
      await fetchRoster();
    } catch (err) {
      addToast('Failed to create volunteer', 'error');
    } finally {
      setIsActionSaving(false);
    }
  };


  const handleUnassignVolunteer = async (volId) => {
    if (!window.confirm('Are you sure you want to remove this volunteer from this POD?')) return;
    try {
      await api.patch(`/admin/volunteers/${volId}`, {
        podId: null
      });
      addToast('Volunteer removed from POD', 'success');
      await fetchRoster();
    } catch (err) {
      addToast('Failed to remove volunteer', 'error');
    }
  };

  return createPortal(
    <div className="modal-overlay-fade" style={{ background: 'rgba(0,0,0,0)' }}>
      <div className="glass-card modal-scale-up" style={{ width: '75vw', maxWidth: '1000px', padding: '24px', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <X size={20} />
        </button>

        <h2 style={{ fontSize: '1.75rem', marginBottom: '4px' }}>{pod.name} Detail Roster</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '24px' }}>
          Overview of assigned mentor volunteers and team participants.
        </p>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <span className="spinner" style={{ width: '32px', height: '32px', margin: '0 auto' }}></span>
          </div>
        ) : (
          <div>
            {/* Volunteers/Mentors section */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
                  Assigned Mentors ({volunteers.length})
                </h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={() => { setShowAddExisting(!showAddExisting); setShowCreateNew(false); }}
                    className="btn btn-secondary" 
                    style={{ padding: '4px 8px', fontSize: '0.75rem', minHeight: 'auto', height: '28px' }}
                  >
                    + Assign Existing
                  </button>
                  <button 
                    onClick={() => { setShowCreateNew(!showCreateNew); setShowAddExisting(false); }}
                    className="btn btn-secondary" 
                    style={{ padding: '4px 8px', fontSize: '0.75rem', minHeight: 'auto', height: '28px' }}
                  >
                    + Add New
                  </button>
                </div>
              </div>

              {/* Assign Existing Box */}
              {showAddExisting && (
                <div style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-light)', marginBottom: '16px' }}>
                  <select 
                    value={selectedExistingVolId} 
                    onChange={(e) => setSelectedExistingVolId(e.target.value)} 
                    className="form-input"
                    style={{ flex: 1, padding: '6px 12px', fontSize: '0.85rem' }}
                  >
                    <option value="">-- Select an unassigned volunteer --</option>
                    {allVolunteersPool
                      .filter(v => v.podId !== pod.id)
                      .map(v => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.type}) {v.podId ? '[Assigned elsewhere]' : '[Unassigned]'}
                        </option>
                      ))
                    }
                  </select>
                  <button 
                    onClick={handleAssignExistingSubmit} 
                    className="btn btn-primary"
                    style={{ padding: '6px 16px', fontSize: '0.85rem' }}
                    disabled={isActionSaving || !selectedExistingVolId}
                  >
                    Assign
                  </button>
                </div>
              )}

              {/* Create New Volunteer Form */}
              {showCreateNew && (
                <form onSubmit={handleCreateNewSubmit} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr 1fr auto', gap: '8px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-light)', marginBottom: '16px', alignItems: 'end' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Name</span>
                    <input 
                      type="text" 
                      value={newVolName} 
                      onChange={(e) => setNewVolName(e.target.value)} 
                      placeholder="Mentor name" 
                      className="form-input" 
                      style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                      required
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Type</span>
                    <select 
                      value={newVolType} 
                      onChange={(e) => setNewVolType(e.target.value)} 
                      className="form-input"
                      style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                    >
                      <option value="STUDENT">Student</option>
                      <option value="MENTOR">Mentor</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Email</span>
                    <input 
                      type="email" 
                      value={newVolEmail} 
                      onChange={(e) => setNewVolEmail(e.target.value)} 
                      placeholder="email@domain.com" 
                      className="form-input" 
                      style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                      required
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Phone</span>
                    <input 
                      type="text" 
                      value={newVolPhone} 
                      onChange={(e) => setNewVolPhone(e.target.value)} 
                      placeholder="Phone number" 
                      className="form-input" 
                      style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                    />
                  </div>
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                    disabled={isActionSaving}
                  >
                    Save
                  </button>
                </form>
              )}

              {volunteers.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No mentors assigned to this POD yet.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '8px' }}>
                  {volunteers.map(v => (
                    <div key={v.id} style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-light)', fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{v.name} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', padding: '2px 4px', borderRadius: '4px', marginLeft: '4px' }}>{v.type}</span></div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          <div>{formatContact(v.contact).email || v.contact}</div>
                          {formatContact(v.contact).phone && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatContact(v.contact).phone}</div>}
                        </div>
                      </div>
                      <button 
                        onClick={() => handleUnassignVolunteer(v.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, padding: '4px' }}
                        title="Remove from POD"
                      >
                        ✕ Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

            </div>

            {/* Teams roster section */}
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, borderBottom: '1px solid var(--border-light)', paddingBottom: '8px', marginBottom: '12px' }}>
                Assigned Teams ({teams.length})
              </h3>
              <DataTable
                columns={[
                  {
                    header: 'Team Info',
                    accessor: 'name',
                    render: (t) => (
                      <div>
                        <div style={{ fontWeight: 600 }}>{t.name}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '2px' }}>Code: {t.registrationId}</div>
                      </div>
                    )
                  },
                  {
                    header: 'College',
                    accessor: 'collegeName',
                    render: (t) => <span style={{ fontSize: '0.85rem' }}>{t.collegeName}</span>
                  },
                  {
                    header: 'Status',
                    accessor: 'status',
                    render: (t) => (
                      <span className={`status-badge status-${t.status.toLowerCase()}`} style={{ fontSize: '0.65rem' }}>
                        {t.status}
                      </span>
                    )
                  }
                ]}
                data={teams}
                loading={loading}
                hideTopPagination={true}
                emptyState={<p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No teams assigned to this POD yet.</p>}
              />
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};



// ==========================================
// VOLUNTEERS VIEW TAB COMPONENT
// ==========================================
const VolunteersView = ({ pods, fetchPodsPool }) => {
  const { addToast } = useToast();
  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const {
    page,
    setPage,
    search,
    setSearch,
    filters,
    onFilterChange,
    clearFilters
  } = useTableQuery('', 'asc', 'vols');
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [type, setType] = useState('STUDENT');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [podId, setPodId] = useState('');
  const [generateLogin, setGenerateLogin] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (showAddModal || showImportModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showAddModal, showImportModal]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchVolunteers();
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [search, filters, page]);

  const fetchVolunteers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/volunteers', {
        params: {
          search: search || undefined,
          type: filters.type || undefined,
          podId: filters.podId || undefined,
          page,
          limit: 10
        }
      });
      setVolunteers(res.data.results || []);
      setTotal(res.data.total);
      setPages(res.data.pages);
    } catch (err) {
      addToast('Failed to fetch volunteer list', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    setIsSaving(true);
    try {
      const combinedContact = `${email.trim()} | ${phone.trim()}`;
      const res = await api.post('/admin/volunteers', {
        name: name.trim(),
        type,
        contact: combinedContact,
        podId: podId || null,
        generateLogin: generateLogin
      });
      addToast('Volunteer created successfully!', 'success');
      if (res.data.username && res.data.generatedPassword) {
        alert(`Volunteer created with Login Access!\n\nUsername: ${res.data.username}\nPassword: ${res.data.generatedPassword}\n\nPlease copy these credentials now as the password will not be shown again.`);
      }
      setName('');
      setEmail('');
      setPhone('');
      setPodId('');
      setGenerateLogin(true);
      setShowAddModal(false);
      fetchVolunteers();
      fetchPodsPool();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to add volunteer', 'error');
    } finally {
      setIsSaving(false);
    }
  };


  const handleCreateVolunteerLogin = async (volId, volName) => {
    try {
      const res = await api.post(`/admin/volunteers/${volId}/login`);
      addToast(`Login created for ${volName}!`, 'success');
      alert(`Login Created for ${volName}!\n\nUsername: ${res.data.username}\nPassword: ${res.data.generatedPassword}\n\nPlease copy these credentials now as the password will not be shown again.`);
      fetchVolunteers();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to create login', 'error');
    }
  };

  const handleRevokeVolunteerLogin = async (volId, volName) => {
    if (!window.confirm(`Are you sure you want to revoke the login account for ${volName}? They will no longer be able to log in.`)) return;
    try {
      await api.delete(`/admin/volunteers/${volId}/login`);
      addToast(`Login account revoked for ${volName}`, 'success');
      fetchVolunteers();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to revoke login', 'error');
    }
  };

  const handleResetVolunteerPassword = async (volId, volName) => {
    const customPassword = window.prompt(`Enter a new password for ${volName} (leave blank to auto-generate):`);
    if (customPassword === null) return; // cancelled
    
    try {
      const payload = customPassword.trim() ? { password: customPassword.trim() } : {};
      const res = await api.post(`/admin/volunteers/${volId}/reset-password`, payload);
      addToast(`Password reset for ${volName}!`, 'success');
      alert(`Password Reset for ${volName}!\n\nUsername: ${res.data.username}\nPassword: ${res.data.password}\n\nPlease copy these credentials now.`);
      fetchVolunteers();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to reset password', 'error');
    }
  };

  const handleUpdatePodInline = async (volId, newPodId) => {
    try {
      await api.patch(`/admin/volunteers/${volId}`, {
        podId: newPodId || null
      });
      addToast('Updated volunteer POD assignment', 'success');
      fetchVolunteers();
      fetchPodsPool();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to update assignment', 'error');
    }
  };

  const handleDeleteVolunteer = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete volunteer '${name}'?`)) return;

    try {
      await api.delete(`/admin/volunteers/${id}`);
      addToast('Volunteer deleted successfully', 'success');
      fetchVolunteers();
      fetchPodsPool();
    } catch (err) {
      addToast('Failed to delete volunteer', 'error');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800 }}>Volunteers Pool</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Faculty and student volunteers to monitor pods and physical check-ins.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => setShowImportModal(true)} className="btn btn-secondary">
            <Upload size={16} />
            Import CSV
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
            + Add Volunteer
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', width: '100%' }}>
          <div style={{ position: 'relative', flex: 2, minWidth: '280px' }}>
            <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search volunteers by name or contact details..."
              className="form-input"
              style={{ paddingLeft: '48px', width: '100%' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ flex: 1, minWidth: '150px' }}>
            <select 
              value={filters.type || ''} 
              onChange={(e) => onFilterChange('type', e.target.value)} 
              className="form-input" 
              style={{ width: '100%', padding: '10px' }}
            >
              <option value="">All Types</option>
              <option value="FACULTY">Faculty</option>
              <option value="STUDENT">Student</option>
            </select>
          </div>

          <div style={{ flex: 1, minWidth: '150px' }}>
            <select 
              value={filters.podId || ''} 
              onChange={(e) => onFilterChange('podId', e.target.value)} 
              className="form-input" 
              style={{ width: '100%', padding: '10px' }}
            >
              <option value="">All PODs</option>
              {pods.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
          {(search || filters.type || filters.podId) && (
            <button 
              type="button" 
              onClick={clearFilters} 
              className="btn btn-secondary"
              style={{ padding: '6px 12px', minHeight: 'auto', fontSize: '0.8rem' }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <DataTable
        columns={[
          {
            header: 'Volunteer',
            accessor: 'name',
            render: (v) => <div style={{ fontWeight: 600 }}>{v.name}</div>
          },
          {
            header: 'Type',
            accessor: 'type',
            render: (v) => (
              <span style={{ fontSize: '0.75rem', background: v.type === 'FACULTY' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255,255,255,0.04)', color: v.type === 'FACULTY' ? 'var(--primary)' : 'var(--text-secondary)', padding: '3px 6px', borderRadius: '4px', fontWeight: 600 }}>
                {v.type}
              </span>
            )
          },
          {
            header: 'Contact Details',
            accessor: 'contact',
            render: (v) => (
              <div>
                <div>{formatContact(v.contact).email || v.contact}</div>
                {formatContact(v.contact).phone && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {formatContact(v.contact).phone}
                  </div>
                )}
              </div>
            )
          },
          {
            header: 'Assigned POD Group',
            accessor: 'podId',
            render: (v) => (
              <select 
                value={v.podId || ''} 
                onChange={(e) => handleUpdatePodInline(v.id, e.target.value)}
                className="form-input"
                style={{ padding: '6px 12px', fontSize: '0.85rem', width: '180px' }}
              >
                <option value="">Unassigned</option>
                {pods.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )
          },
          {
            header: 'Login Access',
            accessor: 'hasLogin',
            render: (v) => (
              v.hasLogin ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--success)' }}>
                    Username: <code>{v.username}</code>
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      onClick={() => handleResetVolunteerPassword(v.id, v.name)}
                      className="btn btn-secondary"
                      style={{ padding: '4px 8px', fontSize: '0.75rem', minHeight: 0, height: 'auto' }}
                    >
                      Reset Password
                    </button>
                    <button 
                      onClick={() => handleRevokeVolunteerLogin(v.id, v.name)}
                      className="btn btn-secondary"
                      style={{ padding: '4px 8px', fontSize: '0.75rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.15)', minHeight: 0, height: 'auto' }}
                    >
                      Revoke Login
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No Login Account</span>
                  <button 
                    onClick={() => handleCreateVolunteerLogin(v.id, v.name)}
                    className="btn btn-primary"
                    style={{ padding: '4px 8px', fontSize: '0.75rem', minHeight: 0, height: 'auto', alignSelf: 'flex-start' }}
                  >
                    Enable Login
                  </button>
                </div>
              )
            )
          },
          {
            header: '',
            align: 'right',
            width: '80px',
            render: (v) => (
              <button 
                onClick={() => handleDeleteVolunteer(v.id, v.name)}
                className="btn btn-secondary" 
                style={{ padding: '6px 10px', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.15)' }}
              >
                ✕
              </button>
            )
          }
        ]}
        data={volunteers}
        page={page}
        pages={pages}
        totalCount={total}
        onPageChange={setPage}
        loading={loading}
        emptyState={
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <UserCheck size={32} style={{ marginBottom: '12px' }} />
            <p>No volunteers registered yet.</p>
          </div>
        }
      />

      {/* Add Volunteer Modal */}
      {showAddModal && createPortal(
        <div className="modal-overlay-fade" style={{ background: 'rgba(0,0,0,0)' }}>
          <div className="glass-card modal-scale-up" style={{ width: '100%', maxWidth: '440px', padding: '24px', position: 'relative' }}>
            <button onClick={() => setShowAddModal(false)} style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <X size={20} />
            </button>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '16px' }} className="text-gradient">Add Volunteer</h2>

            <form onSubmit={handleAddSubmit}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Dr. John Doe"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={isSaving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Volunteer Type</label>
                <select value={type} onChange={(e) => setType(e.target.value)} className="form-input" disabled={isSaving}>
                  <option value="STUDENT">Student Volunteer</option>
                  <option value="FACULTY">Faculty Mentor</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  placeholder="email@domain.com"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isSaving}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input
                  type="text"
                  placeholder="e.g. +91 98765 43210"
                  className="form-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={isSaving}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Assign to POD (Optional)</label>
                <select value={podId} onChange={(e) => setPodId(e.target.value)} className="form-input" disabled={isSaving}>
                  <option value="">Unassigned</option>
                  {pods.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="generateLogin"
                  checked={generateLogin}
                  onChange={(e) => setGenerateLogin(e.target.checked)}
                  disabled={isSaving}
                  style={{ width: '18px', height: '18px', margin: 0, cursor: 'pointer' }}
                />
                <label htmlFor="generateLogin" className="form-label" style={{ margin: 0, cursor: 'pointer', fontSize: '0.85rem' }}>
                  Auto-generate login credentials for this volunteer
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary" disabled={isSaving}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? <span className="spinner"></span> : 'Save Volunteer'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}


      {/* Volunteer CSV Import Modal */}
      {showImportModal && (
        <VolunteerImportModal
          onClose={() => {
            setShowImportModal(false);
            fetchVolunteers();
            fetchPodsPool();
          }}
        />
      )}
    </div>
  );
};


// ==========================================
// VOLUNTEER CSV IMPORT MODAL WIZARD
// ==========================================
const VolunteerImportModal = ({ onClose }) => {
  const { addToast } = useToast();
  const [step, setStep] = useState(1); // 1: Upload, 2: Preview, 3: Credentials
  const [file, setFile] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [credentials, setCredentials] = useState([]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Preview state
  const [importId, setImportId] = useState(null);
  const [newCount, setNewCount] = useState(0);
  const [invalidRows, setInvalidRows] = useState([]);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    if (!selected.name.endsWith('.csv')) {
      addToast('Select a .csv file', 'error');
      return;
    }

    setFile(selected);
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setIsAnalyzing(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/admin/volunteers/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setImportId(res.data.importId);
      setNewCount(res.data.summary.new);
      setInvalidRows(res.data.details.invalid || []);
      setStep(2);
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to analyze CSV file', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      const res = await api.post('/admin/volunteers/import/confirm', null, { params: { importId } });
      setCredentials(res.data.credentials || []);
      addToast('Volunteers roster successfully imported!', 'success');
      setStep(3);
    } catch (err) {
      addToast('Failed to confirm volunteers import', 'error');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleDownloadCredentials = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Name,Username,Password\n";
    credentials.forEach(cred => {
      csvContent += `"${cred.name}","${cred.username}","${cred.password}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "generated_volunteer_logins.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return createPortal(
    <div className="modal-overlay-fade" style={{ background: 'rgba(0,0,0,0)' }}>
      <div className="glass-card modal-scale-up" style={{ width: '100%', maxWidth: '600px', padding: '32px', position: 'relative' }}>
        {step < 3 && (
          <button onClick={onClose} style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        )}

        <h2 style={{ fontSize: '1.75rem', marginBottom: '8px' }} className="text-gradient">Import Volunteers</h2>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', fontSize: '0.85rem' }}>
          <span style={{ fontWeight: step === 1 ? '700' : 'normal', color: step === 1 ? 'var(--primary)' : 'var(--text-muted)' }}>1. Upload CSV</span>
          <span style={{ color: 'var(--text-muted)' }}>➔</span>
          <span style={{ fontWeight: step === 2 ? '700' : 'normal', color: step === 2 ? 'var(--primary)' : 'var(--text-muted)' }}>2. Review Diff</span>
          <span style={{ color: 'var(--text-muted)' }}>➔</span>
          <span style={{ fontWeight: step === 3 ? '700' : 'normal', color: step === 3 ? 'var(--primary)' : 'var(--text-muted)' }}>3. Credentials</span>
        </div>

        {step === 1 && (
          <div>
            <div style={{ border: '2px dashed var(--border-light)', borderRadius: '12px', padding: '40px 20px', textAlign: 'center', marginBottom: '24px', cursor: 'pointer', background: 'rgba(255,255,255,0.01)' }} onClick={() => document.getElementById('volCsvFile').click()}>
              <Upload size={32} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
              <p style={{ fontWeight: 600 }}>Click to browse volunteer CSV file</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>Columns: name, type, contact</p>
              
              {file && (
                <div style={{ marginTop: '16px', background: 'rgba(99, 102, 241, 0.1)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--primary)' }}>
                  {file.name}
                </div>
              )}
              <input id="volCsvFile" type="file" accept=".csv" onChange={handleFileChange} style={{ display: 'none' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
              <button type="button" onClick={handleAnalyze} className="btn btn-primary" disabled={!file || isAnalyzing}>
                {isAnalyzing ? <span className="spinner"></span> : 'Analyze CSV'}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            {invalidRows.length > 0 ? (
              <div className="toast toast-error" style={{ position: 'static', width: '100%', maxWidth: 'none', margin: '0 0 20px 0', borderLeft: '4px solid var(--danger)' }}>
                <AlertCircle size={20} style={{ color: 'var(--danger)' }} />
                <div>
                  <h4 style={{ fontWeight: 700 }}>Validation errors found</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    CSV contains {invalidRows.length} invalid entries. Fix errors in source and upload again.
                  </p>
                </div>
              </div>
            ) : (
              <div className="toast toast-success" style={{ position: 'static', width: '100%', maxWidth: 'none', margin: '0 0 20px 0', borderLeft: '4px solid var(--success)' }}>
                <CheckCircle size={20} style={{ color: 'var(--success)' }} />
                <div>
                  <h4 style={{ fontWeight: 700 }}>Roster is clean!</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Ready to import {newCount} new volunteers.
                  </p>
                </div>
              </div>
            )}

            {invalidRows.length > 0 && (
              <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-light)', padding: '12px', borderRadius: '8px', marginBottom: '24px', background: 'rgba(0,0,0,0.1)' }}>
                {invalidRows.map((err, i) => (
                  <div key={i} style={{ fontSize: '0.8rem', color: 'var(--danger)', marginBottom: '4px' }}>
                    Row {err.row}: {err.reason}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button type="button" onClick={() => setStep(1)} className="btn btn-secondary">Back</button>
              <button 
                type="button" 
                onClick={handleConfirm} 
                className="btn btn-primary" 
                disabled={invalidRows.length > 0 || isConfirming}
              >
                {isConfirming ? <span className="spinner"></span> : 'Confirm Import'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="toast toast-success" style={{ position: 'static', width: '100%', maxWidth: 'none', margin: '0 0 24px 0', borderLeft: '4px solid var(--success)' }}>
              <CheckCircle size={20} style={{ color: 'var(--success)' }} />
              <div>
                <h4 style={{ fontWeight: 700 }}>Import Successful!</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Volunteer login accounts have been generated. Download this list now; these passwords are cryptographically hashed and cannot be retrieved later.
                </p>
              </div>
            </div>

            <div style={{ border: '1px solid var(--border-light)', borderRadius: '10px', overflow: 'hidden', marginBottom: '24px', maxHeight: '240px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-light)' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--text-muted)' }}>Name</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--text-muted)' }}>Username</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--text-muted)' }}>Password</th>
                  </tr>
                </thead>
                <tbody>
                  {credentials.map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600 }}>{c.name}</td>
                      <td style={{ padding: '10px 16px', fontFamily: 'monospace' }}>{c.username}</td>
                      <td style={{ padding: '10px 16px', fontFamily: 'monospace', color: 'var(--accent-blue)', fontWeight: 600 }}>{c.password}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={handleDownloadCredentials} className="btn btn-secondary">
                <Download size={16} />
                Download CSV
              </button>
              <button onClick={onClose} className="btn btn-primary">Finish & Close</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};


// ==========================================
// PROBLEM STATEMENT (PS) VIEW TAB COMPONENT
// ==========================================
const PSView = () => {
  const { addToast } = useToast();
  const [statements, setStatements] = useState([]);
  const [releaseTime, setReleaseTime] = useState('');
  const [inputReleaseTime, setInputReleaseTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [isUpdatingConfig, setIsUpdatingConfig] = useState(false);
  
  // Modals state
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedPS, setSelectedPS] = useState(null);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [showLockConfirm, setShowLockConfirm] = useState(false);

  // Sorting note: backend sorting is deferred for now, default sort is used
  const sortKey = '';
  const sortDir = 'asc';

  useEffect(() => {
    fetchPS();
    fetchConfig();
  }, []);

  const fetchPS = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/problem-statements');
      setStatements(res.data || []);
    } catch (err) {
      addToast('Failed to fetch problem statements', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await api.get('/admin/config');
      if (res.data.psReleaseAt) {
        setReleaseTime(res.data.psReleaseAt);
        // Format to ISO string for picker
        const localDate = new Date(res.data.psReleaseAt);
        setInputReleaseTime(localDate.toISOString());
      } else {
        setReleaseTime('');
        setInputReleaseTime('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveConfig = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!inputReleaseTime) return;

    const utcDate = new Date(inputReleaseTime).toISOString();

    setIsUpdatingConfig(true);
    try {
      const res = await api.patch('/admin/config/ps-release-at', {
        psReleaseAt: utcDate
      });
      addToast('PS release time updated successfully!', 'success');
      setReleaseTime(res.data.psReleaseAt);
      setShowReleaseModal(false);
      fetchConfig();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to update release configuration', 'error');
    } finally {
      setIsUpdatingConfig(false);
    }
  };

  const handleClearReleaseTime = async () => {
    setIsUpdatingConfig(true);
    try {
      await api.patch('/admin/config/ps-release-at', {
        psReleaseAt: null
      });
      addToast('PS release cleared. Selections are locked.', 'info');
      setReleaseTime('');
      setInputReleaseTime('');
      setShowLockConfirm(false);
      setShowReleaseModal(false);
    } catch (err) {
      addToast('Failed to clear release configuration', 'error');
    } finally {
      setIsUpdatingConfig(false);
    }
  };

  const formatToIST = (dateStr) => {
    if (!dateStr) return 'Not Configured (Locked)';
    const d = new Date(dateStr);
    return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', timeZoneName: 'short' });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800 }}>Problem Statements</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Upload challenges and manage leader selection schedules.
          </p>
        </div>
        <button onClick={() => setShowImportModal(true)} className="btn btn-primary">
          <Upload size={16} />
          Import PS CSV
        </button>
      </div>

      {/* Release Configuration Card */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '32px' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={18} style={{ color: 'var(--primary)' }} />
          Problem Selection Release Config
        </h3>

        {!releaseTime ? (
          <div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Problem statement selections are currently <strong>locked</strong>. Set a future release time to allow teams to choose their statement.
            </p>
            <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-end', maxWidth: '600px' }}>
              <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '240px' }}>
                <label className="form-label">Release Date & Time (Local Time)</label>
                <DateTimePicker
                  value={inputReleaseTime}
                  onChange={setInputReleaseTime}
                  minDateTime={new Date()}
                  placeholder="Select Release Date & Time"
                  disabled={isUpdatingConfig}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={!inputReleaseTime || isUpdatingConfig} style={{ height: '42px', minHeight: 'auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isUpdatingConfig ? <span className="spinner"></span> : 'Set Release Time'}
              </button>
            </form>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
            <div>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                Selections Scheduled: <span style={{ color: 'var(--success)' }}>{formatToIST(releaseTime)}</span>
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                UTC Time: {new Date(releaseTime).toUTCString()}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const localDate = new Date(releaseTime);
                setInputReleaseTime(localDate.toISOString());
                setShowReleaseModal(true);
              }}
              className="btn btn-primary"
              style={{ minHeight: 'auto', padding: '10px 20px', cursor: 'pointer' }}
            >
              Unlock Selections / Update
            </button>
          </div>
        )}
      </div>

      {/* Tile Grid */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center' }}>
          <span className="spinner" style={{ width: '40px', height: '40px', margin: '0 auto' }}></span>
        </div>
      ) : statements.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }} className="glass-panel">
          <FileText size={32} style={{ marginBottom: '12px' }} />
          <p>No problem statements imported yet. Upload a CSV to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {statements.map((s) => {
            const fillPercent = Math.min((s.selectedCount / s.capacity) * 100, 100);
            const isFull = s.remainingCapacity === 0;

            return (
              <div 
                key={s.id} 
                className="glass-card" 
                style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer' }}
                onClick={() => setSelectedPS(s)}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.75rem', background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
                      {s.code}
                    </span>
                    <span style={{ fontSize: '0.75rem', background: isFull ? 'var(--danger-glow)' : 'var(--success-glow)', color: isFull ? 'var(--danger)' : 'var(--success)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                      {isFull ? 'Sold Out' : `${s.remainingCapacity} Left`}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '8px' }}>{s.title}</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: '16px', lineHeight: 1.4 }}>
                    {s.description}
                  </p>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    <span>Capacity Fill</span>
                    <span>{s.selectedCount} / {s.capacity} Slots</span>
                  </div>
                  <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden', marginBottom: '16px' }}>
                    <div style={{ width: `${fillPercent}%`, height: '100%', background: isFull ? 'var(--danger)' : 'var(--accent-blue)', borderRadius: '2px' }}></div>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600 }}>Click card to view selections ➔</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <PSImportModal
          onClose={() => {
            setShowImportModal(false);
            fetchPS();
          }}
        />
      )}

      {/* Selections details modal */}
      {selectedPS && (
        <PSTeamsModal
          ps={selectedPS}
          onClose={() => setSelectedPS(null)}
        />
      )}

      {/* Update Release Modal */}
      <Modal
        isOpen={showReleaseModal}
        onClose={() => setShowReleaseModal(false)}
        title="Update Release Schedule"
        maxWidth="440px"
      >
        <div style={{ marginBottom: '20px' }}>
          <label className="form-label">Release Date & Time (Local Time)</label>
          <DateTimePicker
            value={inputReleaseTime}
            onChange={setInputReleaseTime}
            minDateTime={new Date()}
            placeholder="Select Release Date & Time"
            disabled={isUpdatingConfig}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '28px' }}>
          <button
            type="button"
            onClick={() => setShowLockConfirm(true)}
            className="btn btn-secondary"
            style={{ color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.15)', minHeight: 'auto' }}
            disabled={isUpdatingConfig}
          >
            Clear / Lock Selections
          </button>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              onClick={() => setShowReleaseModal(false)}
              className="btn btn-secondary"
              style={{ minHeight: 'auto' }}
              disabled={isUpdatingConfig}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSaveConfig()}
              className="btn btn-primary"
              style={{ minHeight: 'auto' }}
              disabled={!inputReleaseTime || isUpdatingConfig}
            >
              {isUpdatingConfig ? <span className="spinner"></span> : 'Save Changes'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Lock Selections Confirm Dialog */}
      <ConfirmDialog
        isOpen={showLockConfirm}
        title="Lock Selections & Clear Schedule"
        message="Are you sure you want to clear the release schedule? Selections will be immediately locked and teams will no longer be able to select problem statements."
        confirmLabel="Lock Selections"
        cancelLabel="Keep Scheduled"
        danger={true}
        onConfirm={handleClearReleaseTime}
        onCancel={() => setShowLockConfirm(false)}
      />
    </div>
  );
};


// ==========================================
// PROBLEM STATEMENT CSV IMPORT MODAL WIZARD
// ==========================================
const PSImportModal = ({ onClose }) => {
  const { addToast } = useToast();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const [importId, setImportId] = useState(null);
  const [newCount, setNewCount] = useState(0);
  const [invalidRows, setInvalidRows] = useState([]);

  const handleDownloadTemplate = () => {
    const csvContent = "code,title,description,capacity\n" +
      "PS01,Decentralized Digital Identity,Build a self-sovereign identity verification platform using decentralized identifiers (DIDs) and verifiable credentials.,5\n" +
      "PS02,AI-Powered Medical Diagnosis,Design an automated diagnostic assistant that parses clinical reports and images to highlight potential medical anomalies.,8\n" +
      "PS03,Sustainable Supply Chain Tracker,Implement a carbon footprint tracing ledger that tracks materials from raw sourcing to delivery using verified receipts.,6\n";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "problem_statements_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    if (!selected.name.endsWith('.csv')) {
      addToast('Select a .csv file', 'error');
      return;
    }
    setFile(selected);
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setIsAnalyzing(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/admin/problem-statements/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setImportId(res.data.importId);
      setNewCount(res.data.summary.new);
      setInvalidRows(res.data.details.invalid || []);
      setStep(2);
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to analyze CSV file', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await api.post('/admin/problem-statements/import/confirm', null, { params: { importId } });
      addToast('Problem Statements successfully imported!', 'success');
      onClose();
    } catch (err) {
      addToast('Failed to confirm Problem Statements import', 'error');
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="modal-overlay-fade" style={{ background: 'rgba(0,0,0,0)' }}>
      <div className="glass-card modal-scale-up" style={{ width: '100%', maxWidth: '600px', padding: '32px', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <X size={20} />
        </button>

        <h2 style={{ fontSize: '1.75rem', marginBottom: '8px' }} className="text-gradient">Import Problem Statements</h2>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', fontSize: '0.85rem' }}>
          <span style={{ fontWeight: step === 1 ? '700' : 'normal', color: step === 1 ? 'var(--primary)' : 'var(--text-muted)' }}>1. Upload CSV</span>
          <span style={{ color: 'var(--text-muted)' }}>➔</span>
          <span style={{ fontWeight: step === 2 ? '700' : 'normal', color: step === 2 ? 'var(--primary)' : 'var(--text-muted)' }}>2. Review Details</span>
        </div>

        {step === 1 && (
          <div>
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                onClick={handleDownloadTemplate} 
                className="btn btn-secondary" 
                style={{ minHeight: 0, padding: '6px 14px', fontSize: '0.75rem', textTransform: 'none', letterSpacing: 'normal' }}
              >
                Download Template CSV
              </button>
            </div>
            <div style={{ border: '2px dashed var(--border-light)', borderRadius: '12px', padding: '40px 20px', textAlign: 'center', marginBottom: '24px', cursor: 'pointer', background: 'rgba(255,255,255,0.01)' }} onClick={() => document.getElementById('psCsvFile').click()}>
              <Upload size={32} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
              <p style={{ fontWeight: 600 }}>Click to browse PS CSV file</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>Columns: code, title, description, capacity</p>
              
              {file && (
                <div style={{ marginTop: '16px', background: 'rgba(99, 102, 241, 0.1)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--primary)' }}>
                  {file.name}
                </div>
              )}
              <input id="psCsvFile" type="file" accept=".csv" onChange={handleFileChange} style={{ display: 'none' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
              <button type="button" onClick={handleAnalyze} className="btn btn-primary" disabled={!file || isAnalyzing}>
                {isAnalyzing ? <span className="spinner"></span> : 'Analyze CSV'}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            {invalidRows.length > 0 ? (
              <div className="toast toast-error" style={{ position: 'static', width: '100%', maxWidth: 'none', margin: '0 0 20px 0', borderLeft: '4px solid var(--danger)' }}>
                <AlertCircle size={20} style={{ color: 'var(--danger)' }} />
                <div>
                  <h4 style={{ fontWeight: 700 }}>Validation errors found</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    CSV contains {invalidRows.length} invalid entries. Fix errors in source and upload again.
                  </p>
                </div>
              </div>
            ) : (
              <div className="toast toast-success" style={{ position: 'static', width: '100%', maxWidth: 'none', margin: '0 0 20px 0', borderLeft: '4px solid var(--success)' }}>
                <CheckCircle size={20} style={{ color: 'var(--success)' }} />
                <div>
                  <h4 style={{ fontWeight: 700 }}>Roster is clean!</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Ready to import {newCount} new Problem Statements.
                  </p>
                </div>
              </div>
            )}

            {invalidRows.length > 0 && (
              <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-light)', padding: '12px', borderRadius: '8px', marginBottom: '24px', background: 'rgba(0,0,0,0.1)' }}>
                {invalidRows.map((err, i) => (
                  <div key={i} style={{ fontSize: '0.8rem', color: 'var(--danger)', marginBottom: '4px' }}>
                    Row {err.row}: {err.reason}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button type="button" onClick={() => setStep(1)} className="btn btn-secondary">Back</button>
              <button 
                type="button" 
                onClick={handleConfirm} 
                className="btn btn-primary" 
                disabled={invalidRows.length > 0 || isConfirming}
              >
                {isConfirming ? <span className="spinner"></span> : 'Confirm Import'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


// ==========================================
// PS SELECTIONS LIST MODAL
// ==========================================
const PSTeamsModal = ({ ps, onClose }) => {
  const { addToast } = useToast();
  const [selections, setSelections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSelections = async () => {
      try {
        const res = await api.get(`/admin/problem-statements/${ps.id}/teams`);
        setSelections(res.data || []);
      } catch (err) {
        addToast('Failed to fetch selections list', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchSelections();
  }, [ps.id]);

  return (
    <div className="modal-overlay-fade" style={{ background: 'rgba(0,0,0,0)' }}>
      <div className="glass-card modal-scale-up" style={{ width: '100%', maxWidth: '640px', padding: '32px', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <X size={20} />
        </button>

        <h2 style={{ fontSize: '1.75rem', marginBottom: '4px' }}>[{ps.code}] {ps.title} Selections</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '24px' }}>
          Teams that locked in this Problem Statement.
        </p>

        <DataTable
          columns={[
            {
              header: 'Team Info',
              accessor: 'teamName',
              render: (sel) => (
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{sel.teamName}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Code: <strong>{sel.registrationId}</strong> | Leader: {sel.leaderName} ({sel.leaderEmail})
                  </div>
                </div>
              )
            },
            {
              header: 'Locked At',
              accessor: 'selectedAt',
              render: (sel) => (
                <span style={{ fontWeight: 600 }}>
                  {new Date(sel.selectedAt).toLocaleTimeString()}
                </span>
              )
            }
          ]}
          data={selections}
          loading={loading}
          hideTopPagination={true}
          emptyState={<p style={{ color: 'var(--text-muted)', padding: '20px 0' }}>No teams have selected this problem statement yet.</p>}
        />
      </div>
    </div>
  );
};


export default AdminDashboard;


