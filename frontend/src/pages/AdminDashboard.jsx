import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Users, Layers, UserCheck, FileText, Download, Upload,
  Search, X, Edit2, AlertCircle, CheckCircle, Info, ChevronLeft, ChevronRight, Eye, EyeOff, LogOut, Menu, Lock, Plus, Trash2
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../contexts/ToastContext';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import CredentialDialog from '../components/CredentialDialog';
import DateTimePicker from '../components/DateTimePicker';
import useTableQuery from '../components/useTableQuery';
import Navbar from '../components/Navbar';
import Skeleton from '../components/Skeleton';
import IconButton from '../components/IconButton';
import usePsWebSocket from '../hooks/usePsWebSocket';

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
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('adminActiveTab') || 'teams');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1000);
  const { addToast } = useToast();

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

  // Custom Reset Password states
  const [resetPasswordState, setResetPasswordState] = useState(null);
  const [customPasswordValue, setCustomPasswordValue] = useState('');
  const [showResetPasswordInput, setShowResetPasswordInput] = useState(false);
  const [isSavingReset, setIsSavingReset] = useState(false);
  const [parentCredentialsToShow, setParentCredentialsToShow] = useState(null);

  const handleTabClick = (tabName) => {
    setActiveTab(tabName);
    localStorage.setItem('adminActiveTab', tabName);
    setMobileMenuOpen(false);
  };

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

  const handleLogout = async () => {
    localStorage.removeItem('adminActiveTab');
    localStorage.removeItem('leaderActiveTab');
    await api.post('/auth/logout');
    window.location.href = '/login';
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', position: 'relative' }}>
      <Navbar
        title="MIT India Hackathon"
        user={{ username: 'Admin', role: 'Administrator' }}
        onLogout={handleLogout}
        activeTab={activeTab}
        onTabChange={handleTabClick}
        navItems={[
          { id: 'teams', label: 'Teams', icon: <Users size={16} /> },
          { id: 'pods', label: 'POD Groups', icon: <Layers size={16} /> },
          { id: 'panels', label: 'Panels', icon: <Layers size={16} /> },
          { id: 'evalRounds', label: 'Evaluation Rounds', icon: <FileText size={16} /> },
          { id: 'volunteers', label: 'People & Organizers', icon: <UserCheck size={16} /> },
          { id: 'checkpoints', label: 'Attendance Slots', icon: <FileText size={16} /> },
          { id: 'ps', label: 'Problem Statements', icon: <Layers size={16} /> }
        ]}
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
        <div style={{ display: activeTab === 'teams' ? 'block' : 'none' }} className="fade-in-up">
          <TeamsView 
            pods={pods} 
            fetchPodsPool={fetchPodsPool} 
            onResetPassword={(teamId, teamName) => {
              setResetPasswordState({
                isOpen: true,
                targetId: teamId,
                targetName: teamName,
                type: 'team'
              });
            }}
          />
        </div>
        <div style={{ display: activeTab === 'pods' ? 'block' : 'none' }} className="fade-in-up">
          <PodsView pods={pods} fetchPodsPool={fetchPodsPool} />
        </div>
        <div style={{ display: activeTab === 'panels' ? 'block' : 'none' }} className="fade-in-up">
          <PanelsView />
        </div>
        <div style={{ display: activeTab === 'evalRounds' ? 'block' : 'none' }} className="fade-in-up">
          <EvalRoundsView />
        </div>
        <div style={{ display: activeTab === 'volunteers' ? 'block' : 'none' }} className="fade-in-up">
          <VolunteersView
            pods={pods}
            fetchPodsPool={fetchPodsPool}
            onResetPassword={(volId, volName) => setResetPasswordState({ isOpen: true, targetId: volId, targetName: volName, type: 'volunteer' })}
          />
        </div>
        <div style={{ display: activeTab === 'checkpoints' ? 'block' : 'none' }} className="fade-in-up">
          <CheckpointsView />
        </div>
        <div style={{ display: activeTab === 'ps' ? 'block' : 'none' }} className="fade-in-up">
          <PSView />
        </div>
      </div>

      {resetPasswordState && (
        <Modal
          isOpen={true}
          onClose={() => { setResetPasswordState(null); setCustomPasswordValue(''); }}
          title={`Reset Password for ${resetPasswordState.targetName}`}
          maxWidth="440px"
        >
          <form onSubmit={async (e) => {
            e.preventDefault();
            const pwd = customPasswordValue.trim();
            const payload = pwd ? { password: pwd } : {};
            setIsSavingReset(true);
            try {
              const url = resetPasswordState.type === 'team'
                ? `/admin/teams/${resetPasswordState.targetId}/reset-password`
                : `/admin/volunteers/${resetPasswordState.targetId}/reset-password`;
              const res = await api.post(url, payload);
              addToast(`Password reset successfully!`, 'success');
              setParentCredentialsToShow({
                title: `Password Reset for ${resetPasswordState.targetName}`,
                username: res.data.username,
                password: res.data.password
              });
              setResetPasswordState(null);
              setCustomPasswordValue('');
              if (resetPasswordState.type === 'volunteer') {
                fetchVolunteers();
              }
            } catch (err) {
              console.error("Password reset failure:", err);
              addToast(err.response?.data?.detail || err.message || 'Failed to reset password', 'error');
            } finally {
              setIsSavingReset(false);
            }
          }}>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">New Password (Optional)</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showResetPasswordInput ? "text" : "password"}
                  placeholder="Leave blank to auto-generate"
                  className="form-input"
                  value={customPasswordValue}
                  onChange={(e) => setCustomPasswordValue(e.target.value)}
                  style={{ paddingRight: '44px' }}
                  disabled={isSavingReset}
                />
                <button
                  type="button"
                  onClick={() => setShowResetPasswordInput(!showResetPasswordInput)}
                  style={{ position: 'absolute', right: '0', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '44px', width: '44px' }}
                >
                  {showResetPasswordInput ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: '1.4' }}>
                If you leave this blank, the system will automatically generate a strong random 16-character password.
              </p>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button type="button" onClick={() => { setResetPasswordState(null); setCustomPasswordValue(''); }} className="btn btn-secondary" style={{ minHeight: '38px', height: '38px', padding: '6px 16px', fontSize: '0.85rem' }} disabled={isSavingReset}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" style={{ minHeight: '38px', height: '38px', padding: '6px 16px', fontSize: '0.85rem' }} disabled={isSavingReset}>
                {isSavingReset ? <span className="spinner spinner-white" style={{ width: '14px', height: '14px' }}></span> : 'Reset Password'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {parentCredentialsToShow && (
        <CredentialDialog
          isOpen={true}
          onClose={() => setParentCredentialsToShow(null)}
          title={parentCredentialsToShow.title}
          username={parentCredentialsToShow.username}
          password={parentCredentialsToShow.password}
        />
      )}
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
const TeamsView = ({ pods, fetchPodsPool, onResetPassword }) => {
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
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [showBulkPodModal, setShowBulkPodModal] = useState(false);
  const [selectedBulkPodId, setSelectedBulkPodId] = useState('');
  const [isAssigningBulk, setIsAssigningBulk] = useState(false);

  // Inline POD creation in bulk modal
  const [showInlineBulkPod, setShowInlineBulkPod] = useState(false);
  const [inlineBulkPodName, setInlineBulkPodName] = useState('');
  const [isCreatingInlinePod, setIsCreatingInlinePod] = useState(false);

  const handleCreateInlineBulkPod = async (e) => {
    e.preventDefault();
    if (!inlineBulkPodName.trim()) return;
    setIsCreatingInlinePod(true);
    try {
      const res = await api.post('/admin/pods', { name: inlineBulkPodName.trim() });
      addToast(`POD Group '${res.data.name}' created!`, 'success');
      setInlineBulkPodName('');
      setShowInlineBulkPod(false);
      await fetchPodsPool();
      setSelectedBulkPodId(res.data.id);
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to create POD group', 'error');
    } finally {
      setIsCreatingInlinePod(false);
    }
  };

  // Conflict resolution states
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [currentConflicts, setCurrentConflicts] = useState([]);

  // Clear selection on team data change
  useEffect(() => {
    setSelectedTeamIds([]);
  }, [teams]);

  // Debounced fetch when search, filters or page changes
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchTeams();
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [search, filters, page]);

  const [problemStatementsList, setProblemStatementsList] = useState([]);

  useEffect(() => {
    const fetchPSList = async () => {
      try {
        const res = await api.get('/admin/problem-statements');
        setProblemStatementsList(res.data || []);
      } catch (err) {
        console.error(err);
      }
    };
    fetchPSList();
  }, []);

  const fetchTeams = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/teams', {
        params: {
          search: search || undefined,
          status: filters.status || undefined,
          category: filters.category || undefined,
          podId: filters.podId || undefined,
          hasPod: filters.hasPod === '' || filters.hasPod === undefined ? undefined : filters.hasPod === 'true',
          hasPs: filters.hasPs === '' || filters.hasPs === undefined ? undefined : filters.hasPs === 'true',
          hasDesk: filters.hasDesk === '' || filters.hasDesk === undefined ? undefined : filters.hasDesk === 'true',
          deskNumber: filters.deskNumber || undefined,
          psId: filters.psId || undefined,
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

  const handleBulkAssign = async (force = false) => {
    setIsAssigningBulk(true);
    try {
      const res = await api.post('/admin/pods/assign-teams', {
        podId: selectedBulkPodId || null,
        teamIds: selectedTeamIds,
        force
      });

      if (res.status === 409) {
        setCurrentConflicts(res.data.conflicts || []);
        setShowConflictDialog(true);
        setIsAssigningBulk(false);
        return;
      }

      addToast(res.data.message || 'Successfully updated POD assignments!', 'success');
      setShowBulkPodModal(false);
      setShowConflictDialog(false);
      setSelectedTeamIds([]);
      fetchTeams();
      fetchPodsPool();
    } catch (err) {
      if (err.response && err.response.status === 409) {
        setCurrentConflicts(err.response.data.conflicts || []);
        setShowConflictDialog(true);
      } else {
        addToast(err.response?.data?.detail || 'Failed to assign teams to POD', 'error');
      }
    } finally {
      setIsAssigningBulk(false);
    }
  };

  const handleDownloadTeamsTemplate = () => {
    const headers = [
      "Team Code",
      "Team Name",
      "Member 1 Name",
      "Member 1 Lead",
      "Member 1 College",
      "Member 1 Email",
      "Member 1 Mobile",
      "Member 2 Name",
      "Member 2 Lead",
      "Member 2 College",
      "Member 2 Email",
      "Member 2 Mobile",
      "Member 3 Name",
      "Member 3 Lead",
      "Member 3 College",
      "Member 3 Email",
      "Member 3 Mobile"
    ];
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" +
      "T1001,Alpha Force,Alice Cooper,Yes,MIT,alice@mit.edu,+91 9999988888,Bob Harris,No,MIT,bob@mit.edu,+91 9999977777,Charlie Vance,No,MIT,charlie@mit.edu,+91 9999966666\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "teams_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExport = async () => {
    addToast('Preparing roster download...', 'info');
    try {
      const response = await api.get('/admin/teams/export', {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'teams_roster_export.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast('Roster downloaded successfully!', 'success');
    } catch (err) {
      addToast('Failed to download roster', 'error');
    }
  };

  return (
    <div>
      {/* Top Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800 }}>Teams <span className="font-accent">Directory</span></h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Roster of {total} registered teams, statuses, and pod groupings.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={handleDownloadTeamsTemplate} className="btn btn-secondary" title="Download Teams Import Template CSV">
            <Download size={16} />
            Template CSV
          </button>
          <button onClick={handleExport} className="btn btn-secondary">
            <Download size={16} />
            Export CSV
          </button>
          <button onClick={async () => {
            try {
              const res = await api.get('/admin/evaluation-sheet/export', { responseType: 'blob' });
              const url = window.URL.createObjectURL(new Blob([res.data]));
              const link = document.createElement('a');
              link.href = url;
              link.setAttribute('download', 'evaluation_roster.csv');
              document.body.appendChild(link);
              link.click();
              link.remove();
              window.URL.revokeObjectURL(url);
              addToast('Evaluation roster downloaded!', 'success');
            } catch (err) {
              addToast('Failed to export evaluation roster', 'error');
            }
          }} className="btn btn-secondary">
            <Download size={16} />
            Evaluation Sheet CSV
          </button>
          <button onClick={() => setShowImportModal(true)} className="btn btn-primary">
            <Upload size={16} />
            Import CSV
          </button>
        </div>
      </div>

      {selectedTeamIds.length > 0 && (
        <div className="glass-panel" style={{ padding: '16px 24px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(185, 111, 56, 0.05)', borderColor: 'rgba(185, 111, 56, 0.2)' }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>
            <span style={{ color: 'var(--primary)' }}>{selectedTeamIds.length}</span> teams selected
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => {
                setSelectedTeamIds([]);
              }}
              className="btn btn-secondary"
              style={{ minHeight: '38px', height: '38px', padding: '6px 16px', fontSize: '0.85rem' }}
            >
              Cancel Selection
            </button>
            <button
              onClick={() => {
                setSelectedBulkPodId('');
                setShowBulkPodModal(true);
              }}
              className="btn btn-primary"
              style={{ minHeight: '38px', height: '38px', padding: '6px 16px', fontSize: '0.85rem' }}
            >
              Assign to POD Group
            </button>
          </div>
        </div>
      )}

      {/* Filter and Search controls */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', width: '100%' }}>
          <div style={{ position: 'relative', flex: 2, minWidth: '260px' }}>
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
              value={filters.category || ''}
              onChange={(e) => onFilterChange('category', e.target.value)}
              className="form-input"
              style={{ width: '100%' }}
            >
              <option value="">All Categories</option>
              <option value="ENGINEERING">Engineering</option>
              <option value="DESIGN">Design</option>
            </select>
          </div>

          <div style={{ flex: 1, minWidth: '150px' }}>
            <select
              value={filters.status || ''}
              onChange={(e) => onFilterChange('status', e.target.value)}
              className="form-input"
              style={{ width: '100%' }}
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
              style={{ width: '100%' }}
            >
              <option value="">All POD Groups</option>
              {pods.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
            <select
              value={filters.psId || ''}
              onChange={(e) => onFilterChange('psId', e.target.value)}
              className="form-input"
              style={{ width: '200px' }}
            >
              <option value="">All Problem Statements</option>
              {problemStatementsList.map((ps) => (
                <option key={ps.id} value={ps.id}>[{ps.code}] {ps.title}</option>
              ))}
            </select>

            <select
              value={filters.hasPod || ''}
              onChange={(e) => onFilterChange('hasPod', e.target.value)}
              className="form-input"
              style={{ width: '170px' }}
            >
              <option value="">All POD Statuses</option>
              <option value="true">Assigned to POD</option>
              <option value="false">Unassigned (No POD)</option>
            </select>

            <select
              value={filters.hasPs || ''}
              onChange={(e) => onFilterChange('hasPs', e.target.value)}
              className="form-input"
              style={{ width: '170px' }}
            >
              <option value="">All PS Statuses</option>
              <option value="true">Selected a PS</option>
              <option value="false">No PS Selected</option>
            </select>

            <select
              value={filters.hasDesk || ''}
              onChange={(e) => onFilterChange('hasDesk', e.target.value)}
              className="form-input"
              style={{ width: '170px' }}
            >
              <option value="">All Desk Statuses</option>
              <option value="true">Assigned Desk #</option>
              <option value="false">Unassigned Desk</option>
            </select>

            <input
              type="text"
              placeholder="Desk # (e.g. Desk 14)"
              className="form-input"
              style={{ width: '160px' }}
              value={filters.deskNumber || ''}
              onChange={(e) => onFilterChange('deskNumber', e.target.value)}
            />
          </div>

          {(search || filters.status || filters.category || filters.podId || filters.hasPod || filters.hasPs || filters.hasDesk || filters.deskNumber || filters.psId) && (
            <button
              type="button"
              onClick={clearFilters}
              className="btn btn-secondary"
              style={{ minHeight: '38px', height: '38px', padding: '6px 16px', fontSize: '0.85rem' }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <DataTable
        columns={[
          {
            header: (
              <input
                type="checkbox"
                checked={teams.length > 0 && selectedTeamIds.length === teams.length}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedTeamIds(teams.map(t => t.id));
                  } else {
                    setSelectedTeamIds([]);
                  }
                }}
                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
              />
            ),
            width: '40px',
            accessor: 'checkbox',
            render: (t) => (
              <input
                type="checkbox"
                checked={selectedTeamIds.includes(t.id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedTeamIds(prev => [...prev, t.id]);
                  } else {
                    setSelectedTeamIds(prev => prev.filter(id => id !== t.id));
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
              />
            )
          },
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
            header: 'Category',
            accessor: 'category',
            render: (t) => (
              <span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: '6px', fontWeight: 600, textTransform: 'capitalize', background: t.category === 'design' ? 'rgba(236,72,153,0.1)' : 'rgba(59,130,246,0.1)', color: t.category === 'design' ? '#ec4899' : '#3b82f6' }}>
                {t.category || 'Engineering'}
              </span>
            )
          },
          {
            header: 'Desk #',
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
            header: 'Problem Statement',
            accessor: 'selectedPsCode',
            render: (t) => (
              t.selectedPsCode ? (
                <span style={{ fontSize: '0.85rem', background: 'rgba(62, 125, 71, 0.12)', color: 'var(--success)', padding: '4px 8px', borderRadius: '6px', fontWeight: 600 }}>
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
                style={{ padding: '0', borderRadius: '999px', minHeight: '36px', height: '36px', width: '36px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
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
          onResetPassword={onResetPassword}
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

      {/* Bulk POD Assignment Modal */}
      <Modal
        isOpen={showBulkPodModal}
        onClose={() => {
          setShowBulkPodModal(false);
          setShowInlineBulkPod(false);
          setInlineBulkPodName('');
        }}
        title="Assign Teams to POD Group"
        maxWidth="440px"
      >
        <div style={{ marginBottom: '20px' }}>
          <label className="form-label">Target POD Group</label>
          <select
            value={selectedBulkPodId}
            onChange={(e) => setSelectedBulkPodId(e.target.value)}
            className="form-input"
            style={{ width: '100%' }}
            disabled={isAssigningBulk}
          >
            <option value="">Unassign / Remove from POD</option>
            {pods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.capacity ? `(Cap: ${p.teamCount}/${p.capacity})` : ''}
              </option>
            ))}
          </select>
          
          <div style={{ marginTop: '12px' }}>
            {!showInlineBulkPod ? (
              <button 
                type="button" 
                onClick={() => setShowInlineBulkPod(true)}
                className="btn btn-secondary"
                style={{ padding: '6px 14px', fontSize: '0.75rem', minHeight: '32px', height: '32px' }}
              >
                + Create new POD Group
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'rgba(185, 111, 56, 0.02)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-strong)', marginTop: '8px' }}>
                <input
                  type="text"
                  placeholder="New POD Name"
                  className="form-input"
                  value={inlineBulkPodName}
                  onChange={(e) => setInlineBulkPodName(e.target.value)}
                  style={{ flex: 1, minHeight: '38px', height: '38px', padding: '6px 12px', fontSize: '0.85rem' }}
                />
                <button
                  type="button"
                  onClick={handleCreateInlineBulkPod}
                  className="btn btn-primary"
                  style={{ minHeight: '38px', height: '38px', padding: '6px 16px', fontSize: '0.85rem' }}
                  disabled={isCreatingInlinePod || !inlineBulkPodName.trim()}
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowInlineBulkPod(false);
                    setInlineBulkPodName('');
                  }}
                  className="btn btn-secondary"
                  style={{ minHeight: '38px', height: '38px', padding: '6px 16px', fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '12px' }}>
            All selected {selectedTeamIds.length} teams will be moved to the chosen POD.
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '28px' }}>
          <button
            type="button"
            onClick={() => setShowBulkPodModal(false)}
            className="btn btn-secondary"
            style={{ minHeight: '38px', height: '38px', padding: '6px 16px', fontSize: '0.85rem' }}
            disabled={isAssigningBulk}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleBulkAssign(false)}
            className="btn btn-primary"
            style={{ minHeight: '38px', height: '38px', padding: '6px 16px', fontSize: '0.85rem' }}
            disabled={isAssigningBulk}
          >
            {isAssigningBulk ? <span className="spinner"></span> : 'Assign POD'}
          </button>
        </div>
      </Modal>

      {/* POD Assignment Conflict Resolution Modal */}
      <Modal
        isOpen={showConflictDialog}
        onClose={() => setShowConflictDialog(false)}
        title="Conflict: Teams Already Assigned"
        maxWidth="500px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
            The following teams are already assigned to other POD groups:
          </p>

          <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '8px', padding: '16px', maxHeight: '200px', overflowY: 'auto' }}>
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {currentConflicts.map((c, i) => (
                <li key={i} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <strong>{c.teamName}</strong> is in <strong>{c.podName}</strong>
                </li>
              ))}
            </ul>
          </div>

          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Do you want to override and force re-assign these teams to the new POD?
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => setShowConflictDialog(false)}
              className="btn btn-secondary"
              style={{ minHeight: 'auto' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleBulkAssign(true)}
              className="btn btn-primary"
              style={{ minHeight: 'auto', background: 'var(--danger)', borderColor: 'var(--danger)' }}
              disabled={isAssigningBulk}
            >
              {isAssigningBulk ? <span className="spinner"></span> : 'Force Re-assign'}
            </button>
          </div>
        </div>
      </Modal>

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
// TEAM DETAILS MODAL COMPONENT (FULL ADMIN EDIT)
// ==========================================
const TeamDetailsModal = ({ team, pods, fetchPodsPool, onResetPassword, onClose }) => {
  const { addToast } = useToast();
  
  // Team editable fields
  const [name, setName] = useState(team.name || '');
  const [registrationId, setRegistrationId] = useState(team.registrationId || '');
  const [collegeName, setCollegeName] = useState(team.collegeName || '');
  const [leaderName, setLeaderName] = useState(team.leaderName || '');
  const [leaderEmail, setLeaderEmail] = useState(team.leaderEmail || '');
  const [leaderPhone, setLeaderPhone] = useState(team.leaderPhone || '');
  const [status, setStatus] = useState(team.status || 'REGISTERED');
  const [category, setCategory] = useState(team.category || 'ENGINEERING');
  const [deskNumber, setDeskNumber] = useState(team.deskNumber || '');
  const [podId, setPodId] = useState(team.podId || '');
  const [psId, setPsId] = useState('');
  const [members, setMembers] = useState(team.members || []);

  const [problemStatements, setProblemStatements] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [inlinePodName, setInlinePodName] = useState('');
  const [showInlinePod, setShowInlinePod] = useState(false);

  const modalRef = useRef();

  const handleResetTeamPassword = () => {
    onResetPassword(team.id, name || team.name);
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
        setName(teamRes.data.name || '');
        setRegistrationId(teamRes.data.registrationId || '');
        setCollegeName(teamRes.data.collegeName || '');
        setLeaderName(teamRes.data.leaderName || '');
        setLeaderEmail(teamRes.data.leaderEmail || '');
        setLeaderPhone(teamRes.data.leaderPhone || '');
        setStatus(teamRes.data.status || 'REGISTERED');
        setCategory(teamRes.data.category || 'ENGINEERING');
        setDeskNumber(teamRes.data.deskNumber || '');
        setPodId(teamRes.data.podId || '');
        setPsId(teamRes.data.psId || '');
        setMembers(teamRes.data.members || []);

        const psRes = await api.get('/admin/problem-statements');
        setProblemStatements(psRes.data || []);
      } catch (err) {
        addToast('Failed to load team details', 'error');
      } finally {
        setLoadingDetails(false);
      }
    };
    fetchDetails();
  }, [team.id]);

  const handleSave = async () => {
    if (!name.trim()) {
      addToast('Team name cannot be empty', 'error');
      return;
    }
    if (!registrationId.trim()) {
      addToast('Registration code cannot be empty', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await api.patch(`/admin/teams/${team.id}`, {
        name: name.trim(),
        registrationId: registrationId.trim(),
        collegeName: collegeName.trim(),
        leaderName: leaderName.trim(),
        leaderEmail: leaderEmail.trim(),
        leaderPhone: leaderPhone.trim(),
        status,
        category,
        deskNumber: deskNumber.trim() || null,
        podId: podId || null,
        psId: psId || null,
        members
      });

      addToast('Team details updated successfully!', 'success');
      onClose();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to update team details', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddMember = () => {
    setMembers((prev) => [
      ...prev,
      { id: '', name: '', email: '', phone: '', isTeamLeader: false, idVerified: false }
    ]);
  };

  const handleMemberChange = (index, field, val) => {
    setMembers((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val };
      return next;
    });
  };

  const handleRemoveMember = (index) => {
    setMembers((prev) => prev.filter((_, i) => i !== index));
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
    >
      <div className="glass-card modal-scale-up" style={{ width: '90vw', maxWidth: '1240px', padding: '28px', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
        
        {/* Header Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-light)', paddingBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 className="panel-title" style={{ fontSize: '1.6rem', fontWeight: 800 }}>Edit Team Profile</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '2px' }}>
              Full admin edit mode for team information, leaders, assigned venue location, and roster.
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              onClick={handleResetTeamPassword}
              type="button"
              className="btn btn-secondary touch-target"
              style={{ fontSize: '0.85rem', padding: '8px 16px', minHeight: '38px', height: '38px', gap: '6px' }}
              title="Reset password for leader account"
            >
              <Lock size={14} />
              Reset Leader Password
            </button>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {loadingDetails ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <span className="spinner" style={{ width: '32px', height: '32px', margin: '0 auto' }}></span>
            <p style={{ marginTop: '12px', color: 'var(--text-secondary)' }}>Loading team information...</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            
            {/* LEFT COLUMN: Team Primary Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--primary)', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>
                Team & Leader Details
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="form-label">Team Name</label>
                  <input
                    type="text"
                    className="form-input touch-target"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Registration Code / ID</label>
                  <input
                    type="text"
                    className="form-input touch-target"
                    value={registrationId}
                    onChange={(e) => setRegistrationId(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="form-label">College Name</label>
                <input
                  type="text"
                  className="form-input touch-target"
                  value={collegeName}
                  onChange={(e) => setCollegeName(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="form-label">Leader Name</label>
                  <input
                    type="text"
                    className="form-input touch-target"
                    value={leaderName}
                    onChange={(e) => setLeaderName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Leader Email</label>
                  <input
                    type="email"
                    className="form-input touch-target"
                    value={leaderEmail}
                    onChange={(e) => setLeaderEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Leader Mobile</label>
                  <input
                    type="text"
                    className="form-input touch-target"
                    value={leaderPhone}
                    onChange={(e) => setLeaderPhone(e.target.value)}
                  />
                </div>
              </div>

              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--primary)', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px', marginTop: '8px' }}>
                Category & Venue Assignment
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="form-label">Category</label>
                  <select
                    className="form-input touch-target"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="ENGINEERING">Engineering</option>
                    <option value="DESIGN">Design</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Desk / Bench #</label>
                  <input
                    type="text"
                    className="form-input touch-target"
                    placeholder="e.g. Desk 14"
                    value={deskNumber}
                    onChange={(e) => setDeskNumber(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Team Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value)} className="form-input touch-target">
                    <option value="REGISTERED">Registered</option>
                    <option value="SHORTLISTED">Shortlisted</option>
                    <option value="WAITLISTED">Waitlisted</option>
                    <option value="DISQUALIFIED">Disqualified</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>POD Group</span>
                  <button
                    onClick={() => setShowInlinePod(!showInlinePod)}
                    type="button"
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                  >
                    + Create New Pod
                  </button>
                </label>
                {showInlinePod ? (
                  <form onSubmit={handleCreateInlinePod} style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <input
                      type="text"
                      placeholder="Pod Name (e.g. Pod 10)"
                      className="form-input touch-target"
                      value={inlinePodName}
                      onChange={(e) => setInlinePodName(e.target.value)}
                    />
                    <button type="submit" className="btn btn-primary touch-target" style={{ minHeight: '38px', height: '38px', padding: '6px 16px', fontSize: '0.85rem' }}>Save</button>
                  </form>
                ) : (
                  <select value={podId} onChange={(e) => setPodId(e.target.value)} className="form-input touch-target">
                    <option value="">-- Unassigned --</option>
                    {pods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.capacity ? `(${p.capacity} max)` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="form-label">Problem Statement Assignment</label>
                <select value={psId} onChange={(e) => setPsId(e.target.value)} className="form-input touch-target">
                  <option value="">-- None Locked --</option>
                  {problemStatements.map((ps) => (
                    <option key={ps.id} value={ps.id}>
                      [{ps.code}] {ps.title} ({ps.selectedCount}/{ps.capacity} filled)
                    </option>
                  ))}
                </select>
              </div>

            </div>

            {/* RIGHT COLUMN: Roster Members Editor */}
            <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border-light)', paddingLeft: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--primary)' }}>
                  Team Roster ({members.length} members)
                </h3>
                <button
                  type="button"
                  onClick={handleAddMember}
                  className="btn btn-secondary touch-target"
                  style={{ padding: '4px 10px', fontSize: '0.75rem', minHeight: '32px' }}
                >
                  <Plus size={14} /> Add Member
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', maxHeight: '460px', paddingRight: '4px' }}>
                {members.map((m, idx) => (
                  <div key={idx} style={{ padding: '12px', borderRadius: '8px', background: 'var(--cream)', border: '1px solid var(--border-strong)', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Member #{idx + 1} {m.isTeamLeader ? '★ (Leader)' : ''}
                      </span>
                      {members.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(idx)}
                          style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '2px' }}
                          title="Remove member"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <input
                        type="text"
                        placeholder="Member Full Name"
                        className="form-input touch-target"
                        style={{ fontSize: '0.85rem' }}
                        value={m.name}
                        onChange={(e) => handleMemberChange(idx, 'name', e.target.value)}
                      />
                      <input
                        type="email"
                        placeholder="Email Address"
                        className="form-input touch-target"
                        style={{ fontSize: '0.85rem' }}
                        value={m.email}
                        onChange={(e) => handleMemberChange(idx, 'email', e.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="Mobile Number"
                        className="form-input touch-target"
                        style={{ fontSize: '0.85rem' }}
                        value={m.phone}
                        onChange={(e) => handleMemberChange(idx, 'phone', e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border-light)', paddingTop: '16px', marginTop: '20px' }}>
          <button onClick={onClose} className="btn btn-secondary touch-target" disabled={isSaving}>Cancel</button>
          <button onClick={handleSave} className="btn btn-primary touch-target" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save All Team Changes'}
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

        <h2 className="panel-title text-gradient" style={{ fontSize: '1.75rem', marginBottom: '8px' }}>
          CSV Team Importer
        </h2>

        {/* Step progress header */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', fontSize: '0.85rem', alignItems: 'center', flexWrap: 'wrap', paddingLeft: '16px' }}>
          <span style={{ display: 'inline-flex', padding: '6px 12px', borderRadius: '999px', background: step === 1 ? 'var(--primary-glow)' : 'transparent', color: step === 1 ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600 }}>1. Upload</span>
          <span style={{ color: 'var(--text-muted)' }}>➔</span>
          <span style={{ display: 'inline-flex', padding: '6px 12px', borderRadius: '999px', background: step === 2 ? 'var(--primary-glow)' : 'transparent', color: step === 2 ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600 }}>2. Review & Resolve</span>
          <span style={{ color: 'var(--text-muted)' }}>➔</span>
          <span style={{ display: 'inline-flex', padding: '6px 12px', borderRadius: '999px', background: step === 3 ? 'var(--primary-glow)' : 'transparent', color: step === 3 ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600 }}>3. Leader Credentials</span>
        </div>

        {/* STEP 1: UPLOAD */}
        {step === 1 && (
          <div>
            <div style={{ border: '2px dashed var(--border-strong)', borderRadius: '12px', padding: '48px 24px', textAlign: 'center', marginBottom: '24px', cursor: 'pointer', background: 'rgba(185, 111, 56, 0.02)', transition: 'border-color var(--transition-fast)' }} onClick={() => document.getElementById('csvFile').click()}>
              <Upload size={36} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
              <p style={{ fontWeight: 600 }}>Click to browse registration CSV</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>CSV format only, max 2MB</p>

              {file && (
                <div style={{ marginTop: '16px', background: 'var(--primary-glow)', border: '1px solid var(--border-focus)', display: 'inline-flex', padding: '6px 12px', borderRadius: '999px', fontSize: '0.85rem', color: 'var(--primary)', gap: '8px', alignItems: 'center' }}>
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
              <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>New Teams</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary)', marginTop: '4px' }}>{summary.new}</div>
              </div>
              <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Changes</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--warning)', marginTop: '4px' }}>{summary.changed}</div>
              </div>
              <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Unchanged</span>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '4px' }}>{summary.unchanged}</div>
              </div>
              <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '12px', textAlign: 'center', borderColor: summary.invalid > 0 ? 'var(--danger)' : undefined }}>
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
            <div style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '16px', marginBottom: '24px', background: 'rgba(0,0,0,0.05)' }}>
              {/* Invalid Rows Details */}
              {invalidRows.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{ color: 'var(--danger)', fontSize: '0.9rem', display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
                    <AlertCircle size={14} /> Validation Errors
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {invalidRows.map((err, i) => (
                      <div key={i} style={{ fontSize: '0.8rem', background: 'rgba(178, 58, 42, 0.05)', padding: '8px 12px', borderRadius: '6px', borderLeft: '3px solid var(--danger)' }}>
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
                            style={{ padding: '0 16px', fontSize: '0.75rem', borderRadius: '999px', minHeight: '28px', height: '28px' }}
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
                      <td style={{ padding: '10px 16px', fontFamily: 'monospace', color: 'var(--primary)', fontWeight: 600 }}>{c.password}</td>
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
// ==========================================
// GENERIC CSV IMPORT MODAL COMPONENT
// ==========================================
const GenericCsvImportModal = ({ title, endpoint, previewEndpoint, confirmEndpoint, templateHeaders, onSuccess, onClose }) => {
  const { addToast } = useToast();

  const [step, setStep] = useState(1); // 1: Upload, 2: Review & Resolve, 3: Credentials (if any)
  const [file, setFile] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  // Preview data
  const [importId, setImportId] = useState(null);
  const [summary, setSummary] = useState({ new: 0, changed: 0, unchanged: 0, invalid: 0 });
  const [changedRows, setChangedRows] = useState([]);
  const [invalidRows, setInvalidRows] = useState([]);
  const [decisions, setDecisions] = useState({}); // key -> "update" | "skip"
  const [credentials, setCredentials] = useState([]);

  const targetPreview = previewEndpoint || `${endpoint}/preview`;
  const targetConfirm = confirmEndpoint || `${endpoint}/confirm`;

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected && (selected.type === 'text/csv' || selected.name.endsWith('.csv'))) {
      setFile(selected);
    } else {
      addToast('Please select a valid CSV file', 'error');
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setIsAnalyzing(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post(targetPreview, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setImportId(res.data.importId);
      setSummary(res.data.summary || { new: 0, changed: 0, unchanged: 0, invalid: 0 });
      setChangedRows(res.data.details?.changed || []);
      setInvalidRows(res.data.details?.invalid || []);

      const initialDecisions = {};
      (res.data.details?.changed || []).forEach(row => {
        const pkKey = row.code || row.contact || row.registrationId || row.name;
        if (pkKey) initialDecisions[pkKey] = 'update';
      });
      setDecisions(initialDecisions);
      setStep(2);
    } catch (err) {
      // Fallback for endpoints without preview API
      try {
        const singleRes = await api.post(endpoint, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        addToast(singleRes.data.message || 'CSV imported successfully!', 'success');
        onSuccess?.();
        onClose();
      } catch (singleErr) {
        addToast(singleErr.response?.data?.detail || err.response?.data?.detail || 'Failed to import CSV', 'error');
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDecisionToggle = (pkKey) => {
    setDecisions(prev => ({
      ...prev,
      [pkKey]: prev[pkKey] === 'update' ? 'skip' : 'update'
    }));
  };

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      const res = await api.post(targetConfirm, decisions, {
        params: { importId }
      });
      if (res.data.credentials && res.data.credentials.length > 0) {
        setCredentials(res.data.credentials);
        addToast('CSV data successfully imported!', 'success');
        setStep(3);
      } else {
        addToast(res.data.message || 'CSV data successfully imported!', 'success');
        onSuccess?.();
        onClose();
      }
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to confirm CSV import', 'error');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleDownloadCredentials = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Name,Username,Generated Password\n";
    credentials.forEach(cred => {
      csvContent += `"${cred.name}","${cred.username}","${cred.password}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "generated_logins.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return createPortal(
    <div className="modal-overlay-fade" style={{ zIndex: 1100, background: 'rgba(0,0,0,0.5)' }}>
      <div className="glass-card modal-scale-up" style={{ width: '100%', maxWidth: step === 2 ? '780px' : '580px', padding: '28px', position: 'relative' }}>
        {step < 3 && (
          <button onClick={onClose} style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        )}

        <h2 className="panel-title text-gradient" style={{ fontSize: '1.6rem', marginBottom: '8px' }}>
          {title}
        </h2>

        {/* STEP 1: UPLOAD */}
        {step === 1 && (
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Upload CSV file with columns: <code>{templateHeaders.join(', ')}</code>
            </p>

            <div
              style={{ border: '2px dashed var(--border-strong)', borderRadius: '12px', padding: '36px 20px', textAlign: 'center', marginBottom: '20px', cursor: 'pointer', background: 'rgba(185, 111, 56, 0.02)' }}
              onClick={() => document.getElementById('genCsvFile').click()}
            >
              <Upload size={32} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
              <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>Click to select CSV file</p>

              {file && (
                <div style={{ marginTop: '12px', background: 'var(--primary-glow)', border: '1px solid var(--border-focus)', display: 'inline-flex', padding: '4px 10px', borderRadius: '999px', fontSize: '0.8rem', color: 'var(--primary)' }}>
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </div>
              )}

              <input id="genCsvFile" type="file" accept=".csv" onChange={handleFileChange} style={{ display: 'none' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={onClose} className="btn btn-secondary touch-target" disabled={isAnalyzing}>Cancel</button>
              <button onClick={handleAnalyze} className="btn btn-primary touch-target" disabled={!file || isAnalyzing}>
                {isAnalyzing ? <span className="spinner"></span> : 'Analyze CSV'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: REVIEW & RESOLVE */}
        {step === 2 && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
              <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>New Entries</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--primary)', marginTop: '2px' }}>{summary.new}</div>
              </div>
              <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Changed Records</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--warning)', marginTop: '2px' }}>{summary.changed}</div>
              </div>
              <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Unchanged</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '2px' }}>{summary.unchanged}</div>
              </div>
              <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '10px', textAlign: 'center', borderColor: summary.invalid > 0 ? 'var(--danger)' : undefined }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Invalid</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: summary.invalid > 0 ? 'var(--danger)' : 'var(--text-muted)', marginTop: '2px' }}>{summary.invalid}</div>
              </div>
            </div>

            {/* Error banner blocking confirm */}
            {summary.invalid > 0 && (
              <div className="toast toast-error" style={{ position: 'static', width: '100%', maxWidth: 'none', margin: '0 0 16px 0', borderLeft: '4px solid var(--danger)' }}>
                <AlertCircle size={18} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                <div>
                  <h4 style={{ fontWeight: 700, fontSize: '0.9rem' }}>Import Blocked</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    The CSV file contains {summary.invalid} invalid rows. Please fix these in your file and re-upload.
                  </p>
                </div>
              </div>
            )}

            {/* Diffs & validation details container */}
            <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '14px', marginBottom: '20px', background: 'rgba(0,0,0,0.03)' }}>
              {invalidRows.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ color: 'var(--danger)', fontSize: '0.85rem', display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
                    <AlertCircle size={14} /> Validation Errors ({invalidRows.length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {invalidRows.map((err, i) => (
                      <div key={i} style={{ fontSize: '0.8rem', background: 'rgba(178, 58, 42, 0.05)', padding: '6px 10px', borderRadius: '6px', borderLeft: '3px solid var(--danger)' }}>
                        Row {err.row}: <strong>{err.reason}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {changedRows.length > 0 && (
                <div>
                  <h4 style={{ color: 'var(--warning)', fontSize: '0.85rem', display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '10px' }}>
                    <Info size={14} /> Review & Resolve Field Changes ({changedRows.length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {changedRows.map((row, idx) => {
                      const pkKey = row.code || row.contact || row.registrationId || row.name;
                      return (
                        <div key={idx} style={{ border: '1px solid var(--border-light)', borderRadius: '8px', padding: '10px', background: 'rgba(255,255,255,0.02)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{row.name || row.code || pkKey}</span>
                            <button
                              type="button"
                              onClick={() => handleDecisionToggle(pkKey)}
                              className={`btn ${decisions[pkKey] === 'update' ? 'btn-primary' : 'btn-secondary'}`}
                              style={{ padding: '0 12px', fontSize: '0.75rem', borderRadius: '999px', minHeight: '26px', height: '26px' }}
                            >
                              {decisions[pkKey] === 'update' ? 'Will Update' : 'Will Skip'}
                            </button>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '8px', borderLeft: '2px solid rgba(255,255,255,0.1)' }}>
                            {Object.entries(row.changes).map(([field, delta]) => (
                              <div key={field} style={{ fontSize: '0.8rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>{field}:</span>{' '}
                                <del style={{ color: 'var(--danger)', opacity: 0.8, textDecoration: 'line-through', marginRight: '6px' }}>
                                  {String(delta.from)}
                                </del>{' '}
                                <ins style={{ color: 'var(--success)', textDecoration: 'none', fontWeight: 600 }}>
                                  {String(delta.to)}
                                </ins>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {changedRows.length === 0 && invalidRows.length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
                  <CheckCircle size={32} style={{ color: 'var(--success)', marginBottom: '8px' }} />
                  <p>All records are valid! {summary.new} new entries will be created.</p>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setStep(1)} className="btn btn-secondary touch-target">Back</button>
              <button
                onClick={handleConfirm}
                className="btn btn-primary touch-target"
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
            <div className="toast toast-success" style={{ position: 'static', width: '100%', maxWidth: 'none', margin: '0 0 20px 0', borderLeft: '4px solid var(--success)' }}>
              <CheckCircle size={20} style={{ color: 'var(--success)' }} />
              <div>
                <h4 style={{ fontWeight: 700 }}>Import Completed!</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  User accounts have been generated. Download this credentials list now.
                </p>
              </div>
            </div>

            <div style={{ border: '1px solid var(--border-light)', borderRadius: '10px', overflow: 'hidden', marginBottom: '20px', maxHeight: '220px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-light)' }}>
                    <th style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--text-muted)' }}>Name</th>
                    <th style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--text-muted)' }}>Username</th>
                    <th style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--text-muted)' }}>Password</th>
                  </tr>
                </thead>
                <tbody>
                  {credentials.map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '8px 14px', fontWeight: 600 }}>{c.name}</td>
                      <td style={{ padding: '8px 14px', fontFamily: 'monospace' }}>{c.username}</td>
                      <td style={{ padding: '8px 14px', fontFamily: 'monospace', color: 'var(--primary)', fontWeight: 600 }}>{c.password}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={handleDownloadCredentials} className="btn btn-secondary touch-target">
                <Download size={16} />
                Download Credentials CSV
              </button>
              <button onClick={() => { onSuccess?.(); onClose(); }} className="btn btn-primary touch-target">Finish & Close</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

// ==========================================
// PANELS TAB VIEW
// ==========================================
const PanelsView = () => {
  const { addToast } = useToast();
  const [panels, setPanels] = useState([]);
  const [problemStatements, setProblemStatements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingPanel, setEditingPanel] = useState(null);
  const [deleteConfirmPanel, setDeleteConfirmPanel] = useState(null);

  // Form states
  const [name, setName] = useState('');
  const [facultyMemberName, setFacultyMemberName] = useState('');
  const [memberNames, setMemberNames] = useState(['']);
  const [problemStatementId, setProblemStatementId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchPanels = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/panels');
      setPanels(res.data || []);
    } catch (err) {
      addToast('Failed to fetch panels', 'error');
    } finally {
      setLoading(false);
    }
  };

  const takenPsIds = panels
    .filter(p => p.problemStatementId && (!editingPanel || p.id !== editingPanel.id))
    .map(p => p.problemStatementId);

  const fetchPSList = async () => {
    try {
      const res = await api.get('/admin/problem-statements');
      setProblemStatements(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchPanels();
    fetchPSList();
  }, []);

  const openCreateModal = () => {
    setEditingPanel(null);
    setName(`Panel ${panels.length + 1}`);
    setFacultyMemberName('');
    setMemberNames(['']);
    setProblemStatementId('');
    setShowModal(true);
  };

  const openEditModal = (p) => {
    setEditingPanel(p);
    setName(p.name);
    setFacultyMemberName(p.facultyMemberName || '');
    setMemberNames(p.memberNames && p.memberNames.length ? p.memberNames : ['']);
    setProblemStatementId(p.problemStatementId || '');
    setShowModal(true);
  };

  const handleAddJudge = () => {
    setMemberNames((prev) => [...prev, '']);
  };

  const handleJudgeChange = (index, value) => {
    setMemberNames((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleRemoveJudge = (index) => {
    setMemberNames((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSavePanel = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSaving(true);
    const cleanMembers = memberNames.map(m => m.trim()).filter(Boolean);
    const payload = {
      name: name.trim(),
      facultyMemberName: facultyMemberName.trim() || null,
      memberNames: cleanMembers,
      problemStatementId: problemStatementId || null
    };

    try {
      if (editingPanel) {
        await api.put(`/admin/panels/${editingPanel.id}`, payload);
        addToast('Panel updated successfully!', 'success');
      } else {
        await api.post('/admin/panels', payload);
        addToast('Panel created successfully!', 'success');
      }
      setShowModal(false);
      fetchPanels();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to save panel', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePanel = async () => {
    if (!deleteConfirmPanel) return;
    try {
      await api.delete(`/admin/panels/${deleteConfirmPanel.id}`);
      addToast('Panel deleted successfully!', 'success');
      setDeleteConfirmPanel(null);
      fetchPanels();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to delete panel', 'error');
    }
  };

  const handleDownloadPanelsTemplate = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Panel Name,Problem Statement Code,Faculty Lead,Judges\n";
    csvContent += "Panel 1,PS01,Dr. John Doe,Judge Alpha; Judge Beta\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "panels_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPanels = async () => {
    try {
      const res = await api.get('/admin/panels/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'panels_export.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast('Panels exported successfully!', 'success');
    } catch (err) {
      addToast('Failed to export panels', 'error');
    }
  };

  const handleExportPSPanelSheet = async (psId, psCode) => {
    try {
      const res = await api.get(`/admin/evaluation-sheet/export?ps_id=${psId}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `evaluation_sheet_${psCode || 'ps'}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast('Evaluation sheet downloaded!', 'success');
    } catch (err) {
      addToast('Failed to download evaluation sheet', 'error');
    }
  };

  const [search, setSearch] = useState('');

  const filteredPanels = panels.filter((p) => {
    const q = search.toLowerCase();
    const matchesName = p.name.toLowerCase().includes(q);
    const matchesFaculty = p.facultyMemberName && p.facultyMemberName.toLowerCase().includes(q);
    const matchesPs = p.problemStatementCode && p.problemStatementCode.toLowerCase().includes(q);
    const matchesJudges = p.memberNames && p.memberNames.some(j => j.toLowerCase().includes(q));
    return matchesName || matchesFaculty || matchesPs || matchesJudges;
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800 }}>Evaluation <span className="font-accent">Panels</span></h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Assign 1:1 judging panels to Problem Statements with assigned faculty leads and judges.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={handleDownloadPanelsTemplate} className="btn btn-secondary touch-target" title="Download Panels Template CSV">
            <Download size={16} /> Template CSV
          </button>
          <button onClick={handleExportPanels} className="btn btn-secondary touch-target" title="Export Panels CSV">
            <Download size={16} /> Export CSV
          </button>
          <button onClick={() => setShowImportModal(true)} className="btn btn-secondary touch-target" title="Import Panels CSV">
            <Upload size={16} /> Import CSV
          </button>
          <button onClick={openCreateModal} className="btn btn-primary touch-target">
            + Create Panel
          </button>
        </div>
      </div>

      {showImportModal && (
        <GenericCsvImportModal
          title="Panels CSV Importer"
          endpoint="/admin/panels/import"
          templateHeaders={["Panel Name", "Problem Statement Code", "Faculty Lead", "Judges"]}
          onSuccess={fetchPanels}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {/* Search & Filter Controls under Page Title */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px', position: 'relative' }}>
        <Search size={18} style={{ position: 'absolute', left: '36px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          type="text"
          placeholder="Search evaluation panels by name, faculty lead, judges, or PS code..."
          className="form-input"
          style={{ paddingLeft: '48px', width: '100%' }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center' }}>
          <span className="spinner" style={{ width: '32px', height: '32px', margin: '0 auto' }}></span>
          <p style={{ marginTop: '12px', color: 'var(--text-secondary)' }}>Loading evaluation panels...</p>
        </div>
      ) : filteredPanels.length === 0 ? (
        <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Layers size={32} style={{ marginBottom: '12px' }} />
          <p>No evaluation panels match your criteria.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
          {filteredPanels.map((p) => (
            <div key={p.id} className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>{p.name}</h3>
                  {p.problemStatementCode ? (
                    <span style={{ fontSize: '0.75rem', background: 'rgba(99,102,241,0.12)', color: 'var(--primary)', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
                      PS: {p.problemStatementCode}
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', padding: '3px 8px', borderRadius: '6px' }}>
                      Unassigned PS
                    </span>
                  )}
                </div>

                <div style={{ marginBottom: '12px', fontSize: '0.85rem' }}>
                  <strong style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase' }}>Faculty Member / Lead:</strong>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>{p.facultyMemberName || 'Not specified'}</div>
                </div>

                <div style={{ fontSize: '0.85rem', marginBottom: '16px' }}>
                  <strong style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '4px' }}>Panel Judges:</strong>
                  {p.memberNames && p.memberNames.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {p.memberNames.map((j, i) => (
                        <span key={i} style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-light)', padding: '2px 8px', borderRadius: '4px' }}>
                          {j}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>No judges added</span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-light)', paddingTop: '16px', marginTop: '16px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => openEditModal(p)} className="btn btn-secondary touch-target" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                    Edit
                  </button>
                  <button onClick={() => setDeleteConfirmPanel(p)} className="btn btn-secondary touch-target" style={{ padding: '6px 12px', fontSize: '0.8rem', color: 'var(--danger)' }}>
                    Delete
                  </button>
                </div>
                {p.problemStatementId && (
                  <button onClick={() => handleExportPSPanelSheet(p.problemStatementId, p.problemStatementCode)} className="btn btn-secondary touch-target" style={{ padding: '6px 12px', fontSize: '0.8rem' }} title="Download Evaluation Sheet for this PS Panel">
                    <Download size={14} /> Sheet
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Create/Edit Panel */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingPanel ? `Edit ${editingPanel.name}` : 'Create Evaluation Panel'} maxWidth="520px">
        <form onSubmit={handleSavePanel} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="form-label">Panel Name / Title</label>
            <input type="text" className="form-input touch-target" placeholder="e.g. Panel 1 (AI & ML)" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div>
            <label className="form-label">Faculty Member Name</label>
            <input type="text" className="form-input touch-target" placeholder="Dr. John Doe" value={facultyMemberName} onChange={(e) => setFacultyMemberName(e.target.value)} />
          </div>

          <div>
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Panel Judges / Evaluators</span>
              <button type="button" onClick={handleAddJudge} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                + Add Judge
              </button>
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
              {memberNames.map((judge, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    className="form-input touch-target"
                    placeholder={`Judge ${idx + 1} Name`}
                    value={judge}
                    onChange={(e) => handleJudgeChange(idx, e.target.value)}
                  />
                  {memberNames.length > 1 && (
                    <button type="button" onClick={() => handleRemoveJudge(idx)} className="btn btn-secondary touch-target" style={{ color: 'var(--danger)', padding: '0 12px' }}>
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="form-label">Assign to Problem Statement (1:1)</label>
            <select className="form-input touch-target" value={problemStatementId} onChange={(e) => setProblemStatementId(e.target.value)}>
              <option value="">-- None (Unassigned) --</option>
              {problemStatements.map((ps) => {
                const isTaken = takenPsIds.includes(ps.id);
                return (
                  <option key={ps.id} value={ps.id} disabled={isTaken}>
                    {ps.code} — {ps.title} {isTaken ? '(Already assigned to another panel)' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary touch-target">Cancel</button>
            <button type="submit" className="btn btn-primary touch-target" disabled={isSaving}>
              {isSaving ? 'Saving...' : editingPanel ? 'Update Panel' : 'Create Panel'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete Dialog */}
      {deleteConfirmPanel && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setDeleteConfirmPanel(null)}
          onConfirm={handleDeletePanel}
          title={`Delete ${deleteConfirmPanel.name}?`}
          message="Are you sure you want to delete this evaluation panel? This will unassign judges for the linked problem statement."
        />
      )}
    </div>
  );
};

// ==========================================
// EVALUATION ROUNDS TAB VIEW
// ==========================================
const EvalRoundsView = () => {
  const { addToast } = useToast();
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingRound, setEditingRound] = useState(null);

  // Form states
  const [name, setName] = useState('');
  const [roundNumber, setRoundNumber] = useState(1);
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmRound, setDeleteConfirmRound] = useState(null);

  const fetchRounds = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/evaluation-rounds');
      setRounds(res.data || []);
    } catch (err) {
      addToast('Failed to fetch evaluation rounds', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRounds();
  }, []);

  const openCreateModal = () => {
    setEditingRound(null);
    setName(`Round ${rounds.length + 1} Evaluation`);
    setRoundNumber(rounds.length + 1);
    setDescription('Submit your project architecture slide deck link and source code repository URL.');
    setFields([
      { id: 'field_1', name: 'Google Drive / Slide Deck Link', description: 'Presentation or Architecture PDF link', fieldType: 'text', required: true },
      { id: 'field_2', name: 'GitHub Repository Link', description: 'Public repository source code link', fieldType: 'text', required: true }
    ]);
    setShowModal(true);
  };

  const openEditModal = (r) => {
    setEditingRound(r);
    setName(r.name);
    setRoundNumber(r.roundNumber);
    setDescription(r.description || '');
    setFields(r.fields && r.fields.length > 0 ? r.fields : [
      { id: 'field_1', name: 'Google Drive / Slide Deck Link', description: 'Presentation or Architecture PDF link', fieldType: 'text', required: true },
      { id: 'field_2', name: 'GitHub Repository Link', description: 'Public repository source code link', fieldType: 'text', required: true }
    ]);
    setShowModal(true);
  };

  const handleAddField = () => {
    setFields(prev => [
      ...prev,
      {
        id: `field_${Date.now()}`,
        name: `Submission Field ${prev.length + 1}`,
        description: 'Text response or URL',
        fieldType: 'text',
        required: true
      }
    ]);
  };

  const handleFieldChange = (index, key, val) => {
    setFields(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: val };
      return next;
    });
  };

  const handleRemoveField = (index) => {
    setFields(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveRound = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSaving(true);
    const payload = {
      name: name.trim(),
      roundNumber: parseInt(roundNumber) || 1,
      description: description.trim() || null,
      fields: fields.map(f => ({
        id: f.id || `field_${Date.now()}`,
        name: f.name.trim() || 'Submission Field',
        description: f.description ? f.description.trim() : '',
        fieldType: 'text',
        required: !!f.required
      }))
    };

    try {
      if (editingRound) {
        await api.patch(`/admin/evaluation-rounds/${editingRound.id}`, payload);
        addToast('Evaluation round & submission fields updated!', 'success');
      } else {
        await api.post('/admin/evaluation-rounds', payload);
        addToast('Evaluation round created!', 'success');
      }
      setShowModal(false);
      fetchRounds();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to save round', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleSubmissionOpen = async (roundId, currentOpen) => {
    try {
      await api.patch(`/admin/evaluation-rounds/${roundId}`, {
        isSubmissionOpen: !currentOpen
      });
      addToast(`Submissions ${!currentOpen ? 'opened' : 'closed'} for round`, 'success');
      fetchRounds();
    } catch (err) {
      addToast('Failed to update submission status', 'error');
    }
  };

  const handleDeleteRound = async () => {
    if (!deleteConfirmRound) return;
    try {
      await api.delete(`/admin/evaluation-rounds/${deleteConfirmRound.id}`);
      addToast('Evaluation round deleted!', 'success');
      setDeleteConfirmRound(null);
      fetchRounds();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to delete round', 'error');
    }
  };

  const handleDownloadRoundsTemplate = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Round Name,Sequence Order\n";
    csvContent += "Round 1 Evaluation,1\nRound 2 Evaluation,2\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "evaluation_rounds_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportRounds = async () => {
    try {
      const res = await api.get('/admin/evaluation-rounds/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'evaluation_rounds_export.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast('Evaluation rounds exported!', 'success');
    } catch (err) {
      addToast('Failed to export evaluation rounds', 'error');
    }
  };

  const handleExportMasterWorkbook = async () => {
    try {
      addToast('Generating master round-wise Excel workbook...', 'info');
      const res = await api.get('/admin/evaluation-rounds/export-master-workbook', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'evaluation_submissions_master_workbook.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast('Master Evaluation Workbook (All Rounds) downloaded!', 'success');
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to export master workbook', 'error');
    }
  };

  const handleExportSubmissions = async (roundId, roundName) => {
    try {
      const res = await api.get(`/admin/evaluation-rounds/${roundId}/submissions/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `submissions_${roundName.toLowerCase().replace(/\s+/g, '_')}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast('Submissions Excel downloaded!', 'success');
    } catch (err) {
      addToast('Failed to export submissions', 'error');
    }
  };

  const [search, setSearch] = useState('');

  const filteredRounds = rounds.filter((r) => {
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) || String(r.roundNumber).includes(q) || (r.description && r.description.toLowerCase().includes(q));
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800 }}>Evaluation <span className="font-accent">Rounds</span></h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Design submission form fields, toggle submission windows, and export team answers Excel workbook.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={handleExportMasterWorkbook} className="btn btn-primary touch-target" title="Export Multi-Sheet Excel Workbook for All Rounds">
            <Download size={16} /> Export All Rounds (Excel)
          </button>
          <button onClick={handleDownloadRoundsTemplate} className="btn btn-secondary touch-target" title="Download Rounds Template CSV">
            <Download size={16} /> Template CSV
          </button>
          <button onClick={handleExportRounds} className="btn btn-secondary touch-target" title="Export Rounds CSV">
            <Download size={16} /> Export CSV
          </button>
          <button onClick={() => setShowImportModal(true)} className="btn btn-secondary touch-target" title="Import Rounds CSV">
            <Upload size={16} /> Import CSV
          </button>
          <button onClick={openCreateModal} className="btn btn-primary touch-target">
            + Add Round
          </button>
        </div>
      </div>

      {showImportModal && (
        <GenericCsvImportModal
          title="Evaluation Rounds CSV Importer"
          endpoint="/admin/evaluation-rounds/import"
          templateHeaders={["Round Name", "Sequence Order"]}
          onSuccess={fetchRounds}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {/* Search & Filter Controls under Page Title */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px', position: 'relative' }}>
        <Search size={18} style={{ position: 'absolute', left: '36px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          type="text"
          placeholder="Search evaluation rounds by name, round # or description..."
          className="form-input"
          style={{ paddingLeft: '48px', width: '100%' }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center' }}>
          <span className="spinner" style={{ width: '32px', height: '32px', margin: '0 auto' }}></span>
          <p style={{ marginTop: '12px', color: 'var(--text-secondary)' }}>Loading evaluation rounds...</p>
        </div>
      ) : filteredRounds.length === 0 ? (
        <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <FileText size={32} style={{ marginBottom: '12px' }} />
          <p>No evaluation rounds match your search.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredRounds.map((r) => (
            <div key={r.id} className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.75rem', background: 'rgba(185, 111, 56, 0.12)', color: 'var(--primary)', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
                      Round #{r.roundNumber}
                    </span>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{r.name}</h3>
                  </div>
                  {r.description && (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', maxWidth: '600px' }}>
                      {r.description}
                    </p>
                  )}
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px', display: 'flex', gap: '16px' }}>
                    <span>Total Submissions: <strong>{r.submissionCount || 0}</strong></span>
                    <span>Required Fields: <strong>{r.fields?.length || 0} Text Fields</strong></span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.02)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Window:</span>
                    <button
                      onClick={() => handleToggleSubmissionOpen(r.id, r.isSubmissionOpen)}
                      className={`btn ${r.isSubmissionOpen ? 'btn-primary' : 'btn-secondary'} touch-target`}
                      style={{ padding: '4px 12px', fontSize: '0.8rem', minHeight: '32px' }}
                    >
                      {r.isSubmissionOpen ? '● OPEN' : '🔒 CLOSED'}
                    </button>
                  </div>

                  <button onClick={() => openEditModal(r)} className="btn btn-secondary touch-target" style={{ padding: '8px 14px', fontSize: '0.85rem' }}>
                    Edit Round & Form
                  </button>

                  <button onClick={() => handleExportSubmissions(r.id, r.name)} className="btn btn-secondary touch-target" style={{ padding: '8px 14px', fontSize: '0.85rem' }}>
                    <Download size={16} /> Export CSV
                  </button>

                  <button onClick={() => setDeleteConfirmRound(r)} className="btn btn-secondary touch-target" style={{ padding: '8px 12px', color: 'var(--danger)' }}>
                    Delete
                  </button>
                </div>
              </div>

              {/* Form Fields Summary Pill Badge */}
              {r.fields && r.fields.length > 0 && (
                <div style={{ background: 'rgba(0,0,0,0.02)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-light)', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Submissions Taking:</span>
                  {r.fields.map((f, idx) => (
                    <span key={idx} style={{ fontSize: '0.75rem', background: 'var(--primary-glow)', border: '1px solid var(--border-focus)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '6px' }}>
                      {f.name} <span style={{ opacity: 0.6, fontSize: '0.7rem' }}>(Text)</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal: Create/Edit Round & Form Designer */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingRound ? "Edit Round & Submission Form" : "Add Evaluation Round & Form"} maxWidth="620px">
        <form onSubmit={handleSaveRound} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <div>
              <label className="form-label">Round Title</label>
              <input type="text" className="form-input touch-target" placeholder="e.g. Round 1 - Architecture & Deck" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            <div>
              <label className="form-label">Sequence #</label>
              <input type="number" className="form-input touch-target" min="1" value={roundNumber} onChange={(e) => setRoundNumber(e.target.value)} required />
            </div>
          </div>

          <div>
            <label className="form-label">Round Instructions / Description (for Students)</label>
            <textarea
              className="form-input touch-target"
              placeholder="Instructions displayed to team leaders when submitting for this round..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{ resize: 'vertical' }}
            />
          </div>

          {/* Custom Submission Fields Designer */}
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-strong)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Strict Text Submission Fields</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Define what information teams must enter for this evaluation round.
                </p>
              </div>
              <button type="button" onClick={handleAddField} className="btn btn-secondary touch-target" style={{ padding: '4px 12px', fontSize: '0.8rem' }}>
                + Add Field
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {fields.map((f, idx) => (
                <div key={idx} style={{ background: 'rgba(0,0,0,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="form-input touch-target"
                      placeholder={`Field ${idx + 1} Name (e.g. GitHub Repo URL)`}
                      value={f.name}
                      onChange={(e) => handleFieldChange(idx, 'name', e.target.value)}
                      required
                    />
                    <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', padding: '6px 10px', borderRadius: '6px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      TEXT
                    </span>
                    {fields.length > 1 && (
                      <button type="button" onClick={() => handleRemoveField(idx)} className="btn btn-secondary touch-target" style={{ color: 'var(--danger)', padding: '0 10px' }}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    className="form-input touch-target"
                    placeholder="Field Helper Prompt / Subtext (e.g. Public repo URL containing source code)"
                    value={f.description || ''}
                    onChange={(e) => handleFieldChange(idx, 'description', e.target.value)}
                    style={{ fontSize: '0.8rem' }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary touch-target">Cancel</button>
            <button type="submit" className="btn btn-primary touch-target" disabled={isSaving}>
              {isSaving ? 'Saving...' : editingRound ? 'Update Round & Fields' : 'Create Round'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete Dialog */}
      {deleteConfirmRound && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setDeleteConfirmRound(null)}
          onConfirm={handleDeleteRound}
          title={`Delete ${deleteConfirmRound.name}?`}
          message="Are you sure you want to delete this evaluation round? Submissions made by teams for this round will also be deleted."
        />
      )}
    </div>
  );
};

// ==========================================
// PODS VIEW TAB COMPONENT
// ==========================================
const PodsView = ({ pods, fetchPodsPool }) => {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedPod, setSelectedPod] = useState(null);
  const [deleteConfirmPod, setDeleteConfirmPod] = useState(null);

  // Create Pod Form State
  const [podName, setPodName] = useState('');
  const [podCapacity, setPodCapacity] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (showCreateModal || showImportModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showCreateModal, showImportModal]);

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

  const executeDeletePod = async () => {
    if (!deleteConfirmPod) return;
    const { id, name } = deleteConfirmPod;
    try {
      await api.delete(`/admin/pods/${id}`);
      addToast('POD deleted successfully', 'success');
      setDeleteConfirmPod(null);
      fetchPodsPool();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to delete POD', 'error');
    }
  };

  const handleDownloadPodsTemplate = () => {
    const headers = ["name", "capacity"];
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" +
      "POD Alpha,6\n" +
      "POD Beta,8\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "pods_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPods = async () => {
    addToast('Preparing PODs download...', 'info');
    try {
      const response = await api.get('/admin/pods/export', {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'pods_export.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast('PODs list downloaded successfully!', 'success');
    } catch (err) {
      addToast('Failed to download PODs list', 'error');
    }
  };

  const handleExportRoster = async (id, name) => {
    addToast(`Preparing roster download for ${name}...`, 'info');
    try {
      const response = await api.get(`/admin/pods/${id}/export`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `pod_roster_${name.toLowerCase().replace(/\s+/g, '_')}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast(`Roster for ${name} downloaded successfully!`, 'success');
    } catch (err) {
      addToast(`Failed to download roster for ${name}`, 'error');
    }
  };

  const [search, setSearch] = useState('');

  const filteredPods = pods.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800 }}>POD <span className="font-accent">Groupings</span></h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Groupings for mentor assignments and team checkpoints.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={handleDownloadPodsTemplate} className="btn btn-secondary touch-target" title="Download PODs Import Template CSV">
            <Download size={16} />
            Template CSV
          </button>
          <button onClick={() => setShowImportModal(true)} className="btn btn-secondary touch-target">
            <Upload size={16} />
            Import CSV
          </button>
          <button onClick={handleExportPods} className="btn btn-secondary touch-target">
            <Download size={16} />
            Export CSV
          </button>
          <button onClick={() => setShowCreateModal(true)} className="btn btn-primary touch-target">
            + Create POD Group
          </button>
        </div>
      </div>

      {/* Search Controls under Page Title */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px', position: 'relative' }}>
        <Search size={18} style={{ position: 'absolute', left: '36px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          type="text"
          placeholder="Search POD groups by name..."
          className="form-input"
          style={{ paddingLeft: '48px', width: '100%' }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Grid of Pod Tiles */}
      {filteredPods.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }} className="glass-panel">
          <Layers size={32} style={{ marginBottom: '12px' }} />
          <p>No POD groups match your search.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
          {filteredPods.map((p) => {
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
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmPod({ id: p.id, name: p.name }); }}
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

      {deleteConfirmPod && (
        <ConfirmDialog
          isOpen={true}
          title="Delete POD Group"
          message={`Are you sure you want to delete the POD group '${deleteConfirmPod.name}'? All assigned volunteers will be unassigned.`}
          confirmLabel="Delete POD"
          danger={true}
          onConfirm={executeDeletePod}
          onCancel={() => setDeleteConfirmPod(null)}
        />
      )}

      {/* POD Import Modal */}
      {showImportModal && (
        <PodImportModal
          onClose={() => {
            setShowImportModal(false);
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
  const modalOverlayRef = useRef();
  const [teams, setTeams] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pod info editing states
  const [localPod, setLocalPod] = useState(pod);
  const [isEditingPod, setIsEditingPod] = useState(false);
  const [editedName, setEditedName] = useState(pod.name);
  const [editedCapacity, setEditedCapacity] = useState(pod.capacity || '');

  // Team assignment states
  const [allTeamsPool, setAllTeamsPool] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [showAddTeam, setShowAddTeam] = useState(false);

  // New States for volunteer management
  const [allVolunteersPool, setAllVolunteersPool] = useState([]);
  const [selectedExistingVolId, setSelectedExistingVolId] = useState('');
  const [showAddExisting, setShowAddExisting] = useState(false);
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [isActionSaving, setIsActionSaving] = useState(false);
  const [unassignConfirmState, setUnassignConfirmState] = useState(null);

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
      const teamsRes = await api.get('/admin/teams', { params: { podId: localPod.id, limit: 100 } });
      setTeams(teamsRes.data.results || []);

      // Fetch volunteers assigned to this pod
      const volRes = await api.get('/admin/volunteers', { params: { podId: localPod.id } });
      setVolunteers(volRes.data || []);
    } catch (err) {
      addToast('Failed to fetch POD roster details', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamsPool = async () => {
    try {
      const allTeamsRes = await api.get('/admin/teams', { params: { limit: 1000 } });
      setAllTeamsPool(allTeamsRes.data.results || []);
    } catch (err) {
      addToast('Failed to fetch team options', 'error');
    }
  };

  const fetchVolunteersPool = async () => {
    try {
      const volRes = await api.get('/admin/volunteers');
      setAllVolunteersPool(volRes.data || []);
    } catch (err) {
      addToast('Failed to fetch volunteer options', 'error');
    }
  };

  useEffect(() => {
    fetchRoster();
  }, [localPod.id]);

  const handleUpdatePodInfo = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!editedName.trim()) return;
    setIsActionSaving(true);
    try {
      const res = await api.patch(`/admin/pods/${localPod.id}`, {
        name: editedName.trim(),
        capacity: editedCapacity ? parseInt(editedCapacity) : null
      });
      setLocalPod(res.data);
      setIsEditingPod(false);
      addToast('POD details updated successfully!', 'success');
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to update POD info', 'error');
    } finally {
      setIsActionSaving(false);
    }
  };

  const handleAssignTeamSubmit = async () => {
    if (!selectedTeamId) return;
    setIsActionSaving(true);
    try {
      await api.post('/admin/pods/assign-teams', {
        teamIds: [selectedTeamId],
        podId: localPod.id
      });
      addToast('Team assigned successfully!', 'success');
      setSelectedTeamId('');
      setShowAddTeam(false);
      await fetchRoster();
      await fetchTeamsPool();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to assign team', 'error');
    } finally {
      setIsActionSaving(false);
    }
  };

  const handleRemoveTeam = async (teamId) => {
    setIsActionSaving(true);
    try {
      await api.post('/admin/pods/assign-teams', {
        teamIds: [teamId],
        podId: null
      });
      addToast('Team removed from POD', 'success');
      await fetchRoster();
      await fetchTeamsPool();
    } catch (err) {
      addToast('Failed to remove team', 'error');
    } finally {
      setIsActionSaving(false);
    }
  };

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
      await fetchVolunteersPool();
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
        podId: localPod.id
      });
      addToast('Volunteer created and assigned successfully!', 'success');
      setNewVolName('');
      setNewVolEmail('');
      setNewVolPhone('');
      setNewVolType('MENTOR');
      setShowCreateNew(false);
      await fetchRoster();
      await fetchVolunteersPool();
    } catch (err) {
      addToast('Failed to create volunteer', 'error');
    } finally {
      setIsActionSaving(false);
    }
  };


  const executeUnassignVolunteer = async () => {
    if (!unassignConfirmState) return;
    try {
      await api.patch(`/admin/volunteers/${unassignConfirmState}`, {
        podId: null
      });
      addToast('Volunteer removed from POD', 'success');
      setUnassignConfirmState(null);
      await fetchRoster();
      await fetchVolunteersPool();
    } catch (err) {
      addToast('Failed to remove volunteer', 'error');
    }
  };

  return createPortal(
    <div
      ref={modalOverlayRef}
      onClick={(e) => e.target === modalOverlayRef.current && onClose()}
      className="modal-overlay-fade"
    >
      <div className="glass-card modal-scale-up" style={{ width: '100%', maxWidth: '1000px', padding: '24px', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <X size={20} />
        </button>

        <div style={{ marginBottom: '24px', paddingRight: '48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>{localPod.name} Detail Roster</h2>
            {!isEditingPod && (
              <button
                type="button"
                onClick={() => setIsEditingPod(true)}
                className="btn btn-secondary"
                style={{ padding: '4px 8px', fontSize: '0.75rem', minHeight: 'auto', height: '24px' }}
              >
                Edit Details
              </button>
            )}
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px', marginBottom: isEditingPod ? '16px' : 0 }}>
            Capacity limit: {localPod.capacity ? `${teams.length} / ${localPod.capacity} Teams` : `${teams.length} Teams`} assigned
          </p>

          {isEditingPod && (
            <form onSubmit={handleUpdatePodInfo} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-light)', width: '100%', marginTop: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 2, minWidth: '160px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>POD Group Name</span>
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="form-input"
                  style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                  required
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '100px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Team Capacity</span>
                <input
                  type="number"
                  value={editedCapacity}
                  onChange={(e) => setEditedCapacity(e.target.value)}
                  className="form-input"
                  style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                  min="1"
                />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.8rem', minHeight: 'auto', height: '36px' }} disabled={isActionSaving}>
                  {isActionSaving ? <span className="spinner spinner-white" style={{ width: '14px', height: '14px' }}></span> : 'Save'}
                </button>
                <button type="button" onClick={() => { setIsEditingPod(false); setEditedName(localPod.name); setEditedCapacity(localPod.capacity || ''); }} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '0.8rem', minHeight: 'auto', height: '36px' }}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

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
                    onClick={() => {
                      const nextVal = !showAddExisting;
                      setShowAddExisting(nextVal);
                      setShowCreateNew(false);
                      if (nextVal) fetchVolunteersPool();
                    }}
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
                      .filter(v => v.podId !== localPod.id)
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
                <form onSubmit={handleCreateNewSubmit} className="pod-mentor-form-grid" style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-light)', marginBottom: '16px' }}>
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
                        onClick={() => setUnassignConfirmState(v.id)}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
                  Assigned Teams ({teams.length})
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    const nextVal = !showAddTeam;
                    setShowAddTeam(nextVal);
                    if (nextVal) fetchTeamsPool();
                  }}
                  className="btn btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '0.75rem', minHeight: 'auto', height: '28px' }}
                >
                  + Assign Team
                </button>
              </div>

              {/* Assign Team Dropdown Box */}
              {showAddTeam && (
                <div style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-light)', marginBottom: '16px', flexWrap: 'wrap' }}>
                  <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    className="form-input"
                    style={{ flex: 1, padding: '6px 12px', fontSize: '0.85rem', minWidth: '200px' }}
                  >
                    <option value="">-- Select a team to assign --</option>
                    {allTeamsPool
                      .filter(t => t.podId !== localPod.id)
                      .map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.registrationId}) {t.pod ? `[Assigned to ${t.pod.name}]` : '[Unassigned]'}
                        </option>
                      ))
                    }
                  </select>
                  <button
                    onClick={handleAssignTeamSubmit}
                    className="btn btn-primary"
                    style={{ padding: '6px 16px', fontSize: '0.85rem', minHeight: 'auto', height: '36px' }}
                    disabled={isActionSaving || !selectedTeamId}
                  >
                    Assign
                  </button>
                </div>
              )}

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
                  },
                  {
                    header: 'Actions',
                    accessor: 'id',
                    align: 'right',
                    render: (t) => (
                      <button
                        onClick={() => handleRemoveTeam(t.id)}
                        className="btn btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '0.75rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.15)', minHeight: 'auto', height: '24px' }}
                        disabled={isActionSaving}
                      >
                        ✕ Remove
                      </button>
                    )
                  }
                ]}
                data={teams}
                loading={loading}
                hideTopPagination={true}
                emptyState={<p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No teams assigned to this POD yet.</p>}
              />
            </div>
          </div>)}
        {unassignConfirmState && (
          <ConfirmDialog
            isOpen={true}
            title="Remove Volunteer from POD"
            message="Are you sure you want to remove this volunteer from this POD group?"
            confirmLabel="Remove Volunteer"
            danger={true}
            onConfirm={executeUnassignVolunteer}
            onCancel={() => setUnassignConfirmState(null)}
          />
        )}
      </div>
    </div>,
    document.body
  );
};



// ==========================================
// VOLUNTEERS VIEW TAB COMPONENT
// ==========================================
const VolunteersView = ({ pods, fetchPodsPool, onResetPassword }) => {
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
  const [type, setType] = useState('FACULTY');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [remarks, setRemarks] = useState('');
  const [podId, setPodId] = useState('');
  const [generateLogin, setGenerateLogin] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [credentialsToShow, setCredentialsToShow] = useState(null);
  const [revokeConfirmState, setRevokeConfirmState] = useState(null);
  const [deleteConfirmState, setDeleteConfirmState] = useState(null);

  const [peopleRoles, setPeopleRoles] = useState([
    "Faculty Lead",
    "Judge / Evaluator",
    "Student Coordinator",
    "Volunteer / Monitor",
    "Event Organizer",
    "Student Assistant"
  ]);
  const [showManageRolesModal, setShowManageRolesModal] = useState(false);
  const [newRoleInput, setNewRoleInput] = useState('');

  const fetchPeopleRoles = async () => {
    try {
      const res = await api.get('/admin/people-roles');
      if (res.data && res.data.length > 0) {
        setPeopleRoles(res.data);
      }
    } catch (err) {
      // Keep defaults
    }
  };

  useEffect(() => {
    fetchPeopleRoles();
  }, []);

  const handleAddRole = async () => {
    const trimmed = newRoleInput.trim();
    if (!trimmed) return;
    try {
      const res = await api.post('/admin/people-roles', { role: trimmed });
      setPeopleRoles(res.data);
      setNewRoleInput('');
      addToast(`Added role "${trimmed}"`, 'success');
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to add role', 'error');
    }
  };

  const handleDeleteRole = async (roleName) => {
    try {
      const res = await api.delete(`/admin/people-roles/${encodeURIComponent(roleName)}`);
      setPeopleRoles(res.data);
      addToast(`Removed role "${roleName}"`, 'success');
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to delete role', 'error');
    }
  };

  useEffect(() => {
    if (showAddModal || showImportModal || showManageRolesModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showAddModal, showImportModal, showManageRolesModal]);

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
      addToast('Failed to fetch organizers list', 'error');
    } finally {
      setLoading(false);
    }
  };

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingVolunteer, setEditingVolunteer] = useState(null);

  const handleOpenEditModal = (v) => {
    setEditingVolunteer(v);
    setName(v.name || '');
    setType(v.type || 'VOLUNTEER');
    const { email: parsedEmail, phone: parsedPhone } = formatContact(v.contact || '');
    setEmail(parsedEmail || v.contact || '');
    setPhone(parsedPhone || '');
    setRemarks(v.remarks || '');
    setPodId(v.podId || '');
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingVolunteer || !name.trim() || !email.trim()) return;

    setIsSaving(true);
    try {
      const combinedContact = phone.trim() ? `${email.trim()} | ${phone.trim()}` : email.trim();
      const res = await api.patch(`/admin/volunteers/${editingVolunteer.id}`, {
        name: name.trim(),
        type,
        contact: combinedContact,
        remarks: remarks.trim() || null,
        podId: podId || null
      });
      addToast('Updated details successfully!', 'success');
      setShowEditModal(false);
      setEditingVolunteer(null);

      const updatedVol = res.data;
      setVolunteers((prev) => prev.map((v) => (v.id === updatedVol.id ? updatedVol : v)));
      fetchPodsPool();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to update details', 'error');
    } finally {
      setIsSaving(false);
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
        remarks: remarks.trim() || null,
        podId: podId || null,
        generateLogin: generateLogin
      });
      addToast('Added successfully!', 'success');
      if (res.data.username && res.data.generatedPassword) {
        setCredentialsToShow({
          title: 'Account Created with Login Access',
          username: res.data.username,
          password: res.data.generatedPassword
        });
      }
      setName('');
      setEmail('');
      setPhone('');
      setRemarks('');
      setPodId('');
      setGenerateLogin(true);
      setShowAddModal(false);

      // Optimistic append
      const newVol = res.data;
      setVolunteers((prev) => [newVol, ...prev]);
      setTotal((prev) => prev + 1);
      fetchPodsPool();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to add record', 'error');
    } finally {
      setIsSaving(false);
    }
  };


  const handleCreateVolunteerLogin = async (volId, volName) => {
    try {
      const res = await api.post(`/admin/volunteers/${volId}/login`);
      addToast(`Login created for ${volName}!`, 'success');
      setCredentialsToShow({
        title: `Login Created for ${volName}`,
        username: res.data.username,
        password: res.data.generatedPassword
      });
      setVolunteers((prev) =>
        prev.map((v) => (v.id === volId ? { ...v, hasLogin: true, username: res.data.username } : v))
      );
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to create login', 'error');
    }
  };

  const executeRevokeVolunteerLogin = async () => {
    if (!revokeConfirmState) return;
    const { volId, volName } = revokeConfirmState;
    try {
      await api.delete(`/admin/volunteers/${volId}/login`);
      addToast(`Login account revoked for ${volName}`, 'success');
      setRevokeConfirmState(null);
      setVolunteers((prev) =>
        prev.map((v) => (v.id === volId ? { ...v, hasLogin: false, username: null } : v))
      );
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to revoke login', 'error');
    }
  };

  const handleResetVolunteerPassword = (volId, volName) => {
    if (onResetPassword) {
      onResetPassword(volId, volName);
    }
  };

  const handleUpdatePodInline = async (volId, newPodId) => {
    try {
      await api.patch(`/admin/volunteers/${volId}`, {
        podId: newPodId || null
      });
      addToast('Updated POD assignment', 'success');
      const targetPod = pods.find((p) => p.id === newPodId);
      setVolunteers((prev) =>
        prev.map((v) =>
          v.id === volId
            ? { ...v, podId: newPodId || null, podName: targetPod ? targetPod.name : null }
            : v
        )
      );
      fetchPodsPool();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to update assignment', 'error');
    }
  };

  const executeDeleteVolunteer = async () => {
    if (!deleteConfirmState) return;
    const { volId, volName } = deleteConfirmState;
    try {
      await api.delete(`/admin/volunteers/${volId}`);
      addToast('Person deleted successfully', 'success');
      setDeleteConfirmState(null);
      setVolunteers((prev) => prev.filter((v) => v.id !== volId));
      setTotal((prev) => Math.max(0, prev - 1));
      fetchPodsPool();
    } catch (err) {
      addToast('Failed to delete person', 'error');
    }
  };

  const handleExportVolunteers = async () => {
    addToast('Preparing volunteers download...', 'info');
    try {
      const response = await api.get('/admin/volunteers/export', {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'volunteers_export.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast('Volunteers list downloaded successfully!', 'success');
    } catch (err) {
      addToast('Failed to download volunteers list', 'error');
    }
  };

  const handleDownloadVolunteersTemplate = () => {
    const headers = ["name", "type", "contact"];
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" +
      "John Doe,STUDENT,john@mit.edu | +91 9999988888\n" +
      "Dr. Smith,FACULTY,smith@mit.edu | +91 8888877777\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "volunteers_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderRoleBadge = (t) => {
    const rolesMap = {
      FACULTY: 'Faculty Lead',
      JUDGE: 'Judge / Evaluator',
      STUDENT_COORDINATOR: 'Student Coordinator',
      VOLUNTEER: 'Volunteer / Monitor',
      ORGANIZER: 'Event Organizer',
      STUDENT: 'Student Assistant'
    };
    const displayLabel = rolesMap[t] || t || 'Member';
    return (
      <span style={{ fontSize: '0.75rem', background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.3)', padding: '4px 8px', borderRadius: '6px', fontWeight: 700, display: 'inline-block' }}>
        {displayLabel}
      </span>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800 }}>People & Organizers <span className="font-accent">Directory</span></h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Faculty leads, judges, student coordinators, volunteers, and event organizers.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={() => setShowManageRolesModal(true)} className="btn btn-secondary" title="Manage Custom Roles">
            <Layers size={16} />
            Manage Roles
          </button>
          <button onClick={handleDownloadVolunteersTemplate} className="btn btn-secondary" title="Download Import Template CSV">
            <Download size={16} />
            Template CSV
          </button>
          <button onClick={() => setShowImportModal(true)} className="btn btn-secondary">
            <Upload size={16} />
            Import CSV
          </button>
          <button onClick={handleExportVolunteers} className="btn btn-secondary">
            <Download size={16} />
            Export CSV
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
            + Add Person
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
              placeholder="Search by name, contact or assignment remarks..."
              className="form-input"
              style={{ paddingLeft: '48px', width: '100%' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ flex: 1, minWidth: '170px' }}>
            <select
              value={filters.type || ''}
              onChange={(e) => onFilterChange('type', e.target.value)}
              className="form-input"
              style={{ width: '100%', padding: '10px' }}
            >
              <option value="">All Roles</option>
              {peopleRoles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
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
            header: 'Name & Contact',
            accessor: 'name',
            render: (v) => (
              <div>
                <div style={{ fontWeight: 600 }}>{v.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {formatContact(v.contact).email || v.contact}
                  {formatContact(v.contact).phone ? ` • ${formatContact(v.contact).phone}` : ''}
                </div>
              </div>
            )
          },
          {
            header: 'Role / Designation',
            accessor: 'type',
            render: (v) => renderRoleBadge(v.type)
          },
          {
            header: 'Remarks / Notes',
            accessor: 'remarks',
            render: (v) => (
              v.remarks ? (
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', maxWidth: '240px', display: 'block' }}>
                  {v.remarks}
                </span>
              ) : (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>—</span>
              )
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
                style={{ padding: '6px 12px', fontSize: '0.85rem', width: '170px' }}
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
                    User: <code>{v.username}</code>
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
                      onClick={() => setRevokeConfirmState({ isOpen: true, volId: v.id, volName: v.name })}
                      className="btn btn-secondary"
                      style={{ padding: '4px 8px', fontSize: '0.75rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.15)', minHeight: 0, height: 'auto' }}
                    >
                      Revoke
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
            width: '100px',
            render: (v) => (
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => handleOpenEditModal(v)}
                  className="btn btn-secondary"
                  style={{ padding: '6px 10px' }}
                  title="Edit details"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => setDeleteConfirmState({ isOpen: true, volId: v.id, volName: v.name })}
                  className="btn btn-secondary"
                  style={{ padding: '6px 10px', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.15)' }}
                  title="Delete"
                >
                  ✕
                </button>
              </div>
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
            <p>No organizers or people added yet.</p>
          </div>
        }
      />

      {/* Edit Person Modal */}
      {showEditModal && createPortal(
        <div className="modal-overlay-fade" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="glass-card modal-scale-up" style={{ width: '100%', maxWidth: '480px', padding: '24px', position: 'relative' }}>
            <button onClick={() => setShowEditModal(false)} style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <X size={20} />
            </button>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '16px' }} className="text-gradient">Edit Person / Organizer</h2>

            <form onSubmit={handleEditSubmit}>
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
                <label className="form-label">Role Designation</label>
                <select value={type} onChange={(e) => setType(e.target.value)} className="form-input" disabled={isSaving}>
                  {peopleRoles.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
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

              <div className="form-group">
                <label className="form-label">Remarks / Assignment Notes</label>
                <textarea
                  placeholder="e.g. Evaluator for Pod A & B, judge for AI track"
                  className="form-input"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                  disabled={isSaving}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">Assign to POD Group (Optional)</label>
                <select value={podId} onChange={(e) => setPodId(e.target.value)} className="form-input" disabled={isSaving}>
                  <option value="">Unassigned</option>
                  {pods.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" onClick={() => setShowEditModal(false)} className="btn btn-secondary touch-target" disabled={isSaving}>Cancel</button>
                <button type="submit" className="btn btn-primary touch-target" disabled={isSaving}>
                  {isSaving ? <span className="spinner"></span> : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Add Person Modal */}
      {showAddModal && createPortal(
        <div className="modal-overlay-fade" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="glass-card modal-scale-up" style={{ width: '100%', maxWidth: '480px', padding: '24px', position: 'relative' }}>
            <button onClick={() => setShowAddModal(false)} style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <X size={20} />
            </button>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '16px' }} className="text-gradient">Add Person / Organizer</h2>

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
                <label className="form-label">Role Designation</label>
                <select value={type} onChange={(e) => setType(e.target.value)} className="form-input" disabled={isSaving}>
                  {peopleRoles.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
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

              <div className="form-group">
                <label className="form-label">Remarks / Assignment Notes</label>
                <textarea
                  placeholder="e.g. Evaluator for Pod A & B, judge for AI track"
                  className="form-input"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                  disabled={isSaving}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Assign to POD Group (Optional)</label>
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

      {/* Manage Custom Roles Modal */}
      {showManageRolesModal && createPortal(
        <div className="modal-overlay-fade" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="glass-card modal-scale-up" style={{ width: '100%', maxWidth: '460px', padding: '24px', position: 'relative' }}>
            <button onClick={() => setShowManageRolesModal(false)} style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <X size={20} />
            </button>
            <h2 style={{ fontSize: '1.4rem', marginBottom: '8px' }} className="text-gradient">Manage Custom Roles</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Add or remove role designations available in dropdowns across the platform.
            </p>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <input
                type="text"
                placeholder="e.g. Technical Mentor, Guest Speaker"
                className="form-input"
                value={newRoleInput}
                onChange={(e) => setNewRoleInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddRole(); } }}
                style={{ flex: 1 }}
              />
              <button onClick={handleAddRole} className="btn btn-primary" style={{ padding: '0 16px', whiteSpace: 'nowrap' }}>
                + Add Role
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto', paddingRight: '4px' }}>
              {peopleRoles.map((roleName) => (
                <div
                  key={roleName}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justify: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)'
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{roleName}</span>
                  <button
                    onClick={() => handleDeleteRole(roleName)}
                    className="btn btn-secondary"
                    style={{ padding: '4px 8px', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                    title="Remove Role"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowManageRolesModal(false)} className="btn btn-secondary">Done</button>
            </div>
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

      {credentialsToShow && (
        <CredentialDialog
          isOpen={true}
          onClose={() => setCredentialsToShow(null)}
          title={credentialsToShow.title}
          username={credentialsToShow.username}
          password={credentialsToShow.password}
        />
      )}

      {revokeConfirmState && revokeConfirmState.isOpen && (
        <ConfirmDialog
          isOpen={true}
          title="Revoke Volunteer Login Access"
          message={`Are you sure you want to revoke the login account for ${revokeConfirmState.volName}? They will no longer be able to access the volunteer portal.`}
          confirmLabel="Revoke Login"
          danger={true}
          onConfirm={executeRevokeVolunteerLogin}
          onCancel={() => setRevokeConfirmState(null)}
        />
      )}

      {deleteConfirmState && deleteConfirmState.isOpen && (
        <ConfirmDialog
          isOpen={true}
          title="Delete Volunteer"
          message={`Are you sure you want to delete volunteer '${deleteConfirmState.volName}'? This action is permanent and cannot be undone.`}
          confirmLabel="Delete Volunteer"
          danger={true}
          onConfirm={executeDeleteVolunteer}
          onCancel={() => setDeleteConfirmState(null)}
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
// CHECKPOINTS VIEW TAB COMPONENT
// ==========================================
const CheckpointsView = () => {
  const { addToast } = useToast();
  const [checkpoints, setCheckpoints] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showForceDeleteConfirm, setShowForceDeleteConfirm] = useState(false);
  const [hasRecordsError, setHasRecordsError] = useState(false);

  // Form states
  const [cpId, setCpId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Table query state
  const {
    page,
    setPage,
    search,
    setSearch,
    clearFilters
  } = useTableQuery('', 'asc', 'checkpoints');

  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);

  const fetchCheckpoints = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/checkpoints');
      const allCp = res.data || [];

      const filtered = allCp.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.description && c.description.toLowerCase().includes(search.toLowerCase()))
      );

      const limit = 10;
      const totalCount = filtered.length;
      const totalPages = Math.ceil(totalCount / limit) || 1;

      const startIdx = (page - 1) * limit;
      const paginated = filtered.slice(startIdx, startIdx + limit);

      setCheckpoints(paginated);
      setTotal(totalCount);
      setPages(totalPages);
    } catch (err) {
      addToast('Failed to fetch checkpoints', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCheckpoints();
  }, [search, page]);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      await api.post('/admin/checkpoints', {
        name: name.trim(),
        description: description.trim() || null
      });
      addToast('Attendance Slot created successfully!', 'success');
      setName('');
      setDescription('');
      setShowAddModal(false);
      fetchCheckpoints();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to create Attendance Slot', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      await api.patch(`/admin/checkpoints/${cpId}`, {
        name: name.trim(),
        description: description.trim() || null
      });
      addToast('Attendance Slot updated successfully!', 'success');
      setCpId('');
      setName('');
      setDescription('');
      setShowEditModal(false);
      fetchCheckpoints();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to update Attendance Slot', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/admin/checkpoints/${cpId}`);
      addToast('Attendance Slot deleted successfully!', 'success');
      setCpId('');
      setShowDeleteConfirm(false);
      setHasRecordsError(false);
      fetchCheckpoints();
    } catch (err) {
      const detail = err.response?.data?.detail || '';
      if (detail.includes('attendance records')) {
        // Has records — offer to clear first or force delete
        setShowDeleteConfirm(false);
        setHasRecordsError(true);
        setShowForceDeleteConfirm(true);
      } else {
        addToast(detail || 'Failed to delete Attendance Slot', 'error');
      }
    }
  };

  const handleForceDelete = async () => {
    try {
      await api.delete(`/admin/checkpoints/${cpId}?force=true`);
      addToast('Attendance Slot and all its records deleted!', 'success');
      setCpId('');
      setShowForceDeleteConfirm(false);
      setHasRecordsError(false);
      fetchCheckpoints();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to delete Attendance Slot', 'error');
    }
  };

  const handleClearRecords = async () => {
    setIsClearing(true);
    try {
      const res = await api.delete(`/admin/checkpoints/${cpId}/records`);
      addToast(res.data?.message || 'Records cleared successfully!', 'success');
      setShowClearConfirm(false);
      setShowForceDeleteConfirm(false);
      setHasRecordsError(false);
      // Now they can delete normally
      setCpId('');
      fetchCheckpoints();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to clear records', 'error');
    } finally {
      setIsClearing(false);
    }
  };

  const openClearConfirm = (cp) => {
    setCpId(cp.id);
    setName(cp.name);
    setShowClearConfirm(true);
  };

  const openEditModal = (cp) => {
    setCpId(cp.id);
    setName(cp.name);
    setDescription(cp.description || '');
    setShowEditModal(true);
  };

  const openDeleteConfirm = (cp) => {
    setCpId(cp.id);
    setName(cp.name);
    setShowDeleteConfirm(true);
  };

  const [showImportModal, setShowImportModal] = useState(false);

  const handleDownloadSlotsTemplate = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Slot Title,Sequence Order\n";
    csvContent += "Day 1 Registration,1\nDay 1 Lunch Checkin,2\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "attendance_slots_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportSlots = async () => {
    try {
      const res = await api.get('/admin/attendance-slots/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'attendance_slots_export.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast('Attendance slots exported!', 'success');
    } catch (err) {
      addToast('Failed to export attendance slots', 'error');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800 }}>Attendance <span className="font-accent">Slots</span></h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Configure and manage checkpoints (check-in, lunch, workshops) that volunteers can verify.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={handleDownloadSlotsTemplate} className="btn btn-secondary touch-target" title="Download Slots Template CSV">
            <Download size={16} /> Template CSV
          </button>
          <button onClick={handleExportSlots} className="btn btn-secondary touch-target" title="Export Slots CSV">
            <Download size={16} /> Export CSV
          </button>
          <button onClick={() => setShowImportModal(true)} className="btn btn-secondary touch-target" title="Import Slots CSV">
            <Upload size={16} /> Import CSV
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary touch-target">
            + Add Attendance Slot
          </button>
        </div>
      </div>

      {showImportModal && (
        <GenericCsvImportModal
          title="Attendance Slots CSV Importer"
          endpoint="/admin/attendance-slots/import"
          templateHeaders={["Slot Title", "Sequence Order"]}
          onSuccess={fetchCheckpoints}
          onClose={() => setShowImportModal(false)}
        />
      )}

      <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px', position: 'relative' }}>
        <Search size={18} style={{ position: 'absolute', left: '36px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          type="text"
          placeholder="Search Attendance Slots..."
          className="form-input"
          style={{ paddingLeft: '48px', width: '100%' }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <DataTable
        columns={[
          {
            header: 'Slot Name',
            accessor: 'name',
            render: (c) => <div style={{ fontWeight: 600 }}>{c.name}</div>
          },
          {
            header: 'Description',
            accessor: 'description',
            render: (c) => <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{c.description || 'No description provided'}</span>
          },
          {
            header: '',
            align: 'right',
            width: '200px',
            render: (c) => (
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => openClearConfirm(c)}
                  className="btn btn-secondary"
                  style={{ padding: '6px 10px', color: 'var(--warning)', borderColor: 'rgba(245, 158, 11, 0.2)', minHeight: 'auto', fontSize: '0.8rem' }}
                  title="Clear all attendance records for this slot"
                >
                  Clear Records
                </button>
                <button
                  onClick={() => openEditModal(c)}
                  className="btn btn-secondary"
                  style={{ padding: '6px 10px', minHeight: 'auto' }}
                  title="Edit Slot"
                >
                  Edit
                </button>
                <button
                  onClick={() => openDeleteConfirm(c)}
                  className="btn btn-secondary"
                  style={{ padding: '6px 10px', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.15)', minHeight: 'auto' }}
                  title="Delete Slot"
                >
                  Delete
                </button>
              </div>
            )
          }
        ]}
        data={checkpoints}
        page={page}
        pages={pages}
        totalCount={total}
        onPageChange={setPage}
        loading={loading}
        emptyState={
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <CheckCircle size={32} style={{ marginBottom: '12px' }} />
            <p>No Attendance Slots match your search.</p>
          </div>
        }
      />

      {/* Add Slot Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Attendance Slot"
        maxWidth="440px"
      >
        <form onSubmit={handleAddSubmit}>
          <div className="form-group">
            <label className="form-label">Slot Name</label>
            <input
              type="text"
              placeholder="e.g. Day 2 Lunch"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isSaving}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="form-label">Description (Optional)</label>
            <textarea
              placeholder="Provide context for volunteers..."
              className="form-input"
              style={{ minHeight: '80px', resize: 'vertical' }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSaving}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary" disabled={isSaving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? <span className="spinner"></span> : 'Add Slot'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Slot Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Attendance Slot"
        maxWidth="440px"
      >
        <form onSubmit={handleEditSubmit}>
          <div className="form-group">
            <label className="form-label">Slot Name</label>
            <input
              type="text"
              placeholder="e.g. Day 2 Lunch"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isSaving}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="form-label">Description (Optional)</label>
            <textarea
              placeholder="Provide context for volunteers..."
              className="form-input"
              style={{ minHeight: '80px', resize: 'vertical' }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSaving}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" onClick={() => setShowEditModal(false)} className="btn btn-secondary" disabled={isSaving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? <span className="spinner"></span> : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Attendance Slot"
        message={`Are you sure you want to delete the Attendance Slot '${name}'? This cannot be undone.`}
        confirmLabel="Delete Slot"
        danger={true}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Clear Records Confirm Dialog */}
      <ConfirmDialog
        isOpen={showClearConfirm}
        title="Clear Attendance Records"
        message={`This will permanently erase ALL attendance records logged under '${name}'. The slot itself will remain. This cannot be undone.`}
        confirmLabel={isClearing ? 'Clearing...' : 'Clear All Records'}
        danger={true}
        onConfirm={handleClearRecords}
        onCancel={() => { setShowClearConfirm(false); setCpId(''); }}
        loading={isClearing}
      />

      {/* Force Delete Confirm (triggered when delete blocked by records) */}
      <Modal
        isOpen={showForceDeleteConfirm}
        onClose={() => { setShowForceDeleteConfirm(false); setCpId(''); setHasRecordsError(false); }}
        title="Checkpoint Has Attendance Records"
        maxWidth="460px"
      >
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '24px' }}>
          <strong style={{ color: 'var(--text-primary)' }}>{name}</strong> has logged attendance records.
          Choose how you want to proceed:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={handleClearRecords}
            className="btn btn-secondary"
            disabled={isClearing}
            style={{ justifyContent: 'flex-start', padding: '14px 18px', borderRadius: '10px', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--warning)' }}
          >
            {isClearing ? <span className="spinner" style={{ width: '16px', height: '16px', marginRight: '8px' }} /> : null}
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 700, marginBottom: '2px' }}>Clear Records Only</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Erase all attendance records but keep the slot</div>
            </div>
          </button>
          <button
            onClick={handleForceDelete}
            className="btn btn-secondary"
            disabled={isClearing}
            style={{ justifyContent: 'flex-start', padding: '14px 18px', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)' }}
          >
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 700, marginBottom: '2px' }}>Delete Slot + All Records</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Permanently removes the slot and all its attendance data</div>
            </div>
          </button>
          <button
            onClick={() => { setShowForceDeleteConfirm(false); setCpId(''); setHasRecordsError(false); }}
            className="btn btn-secondary"
            style={{ marginTop: '4px' }}
          >
            Cancel
          </button>
        </div>
      </Modal>
    </div>
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
  const [selectedGateCheckpointId, setSelectedGateCheckpointId] = useState('');
  const [checkpoints, setCheckpoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isUpdatingConfig, setIsUpdatingConfig] = useState(false);

  const [search, setSearch] = useState('');
  const [disciplineFilter, setDisciplineFilter] = useState('');

  // Modals state
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedPS, setSelectedPS] = useState(null);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [showLockConfirm, setShowLockConfirm] = useState(false);

  const sortKey = '';
  const sortDir = 'asc';

  const filteredStatements = statements.filter((s) => {
    const q = search.toLowerCase();
    const matchesSearch = s.code.toLowerCase().includes(q) || s.title.toLowerCase().includes(q) || (s.description && s.description.toLowerCase().includes(q)) || (s.organization && s.organization.toLowerCase().includes(q));
    const matchesDiscipline = !disciplineFilter || (s.discipline && s.discipline.toUpperCase() === disciplineFilter.toUpperCase());
    return matchesSearch && matchesDiscipline;
  });

  useEffect(() => {
    fetchPS();
    fetchConfig();
    fetchCheckpointsList();
  }, []);

  const fetchCheckpointsList = async () => {
    try {
      const res = await api.get('/admin/checkpoints');
      setCheckpoints(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

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
        const localDate = new Date(res.data.psReleaseAt);
        setInputReleaseTime(localDate.toISOString());
      } else {
        setReleaseTime('');
        setInputReleaseTime('');
      }
      setSelectedGateCheckpointId(res.data.psGateCheckpointTypeId || '');
    } catch (err) {
      console.error(err);
    }
  };

  // Handle saving PS release schedule & check-in gate config
  const handleSaveConfig = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    const utcDate = inputReleaseTime ? new Date(inputReleaseTime).toISOString() : null;

    setIsUpdatingConfig(true);
    try {
      const res = await api.patch('/admin/config/ps-release-at', {
        psReleaseAt: utcDate,
        psGateCheckpointTypeId: selectedGateCheckpointId || null
      });
      addToast('Event config updated successfully!', 'success');
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

  const handleExportPS = async () => {
    addToast('Preparing problem statements download...', 'info');
    try {
      const response = await api.get('/admin/problem-statements/export', {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'problem_statements_export.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast('Problem Statements downloaded successfully!', 'success');
    } catch (err) {
      addToast('Failed to download problem statements', 'error');
    }
  };

  const handleDownloadPSTemplate = () => {
    const headers = ["code", "title", "description", "capacity", "requirements"];
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" +
      "PS01,Decentralized Voting System,A blockchain-based secure voting portal,12,React and basic Solidity knowledge required\n" +
      "PS02,AI Route Optimization,Build an AI routing engine for electric buses,8,Python and basic ML libraries familiarity\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "problem_statements_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800 }}>Problem <span className="font-accent">Statements</span></h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Upload challenges and manage leader selection schedules.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={handleDownloadPSTemplate} className="btn btn-secondary" title="Download PS Import Template CSV">
            <Download size={16} />
            Template CSV
          </button>
          <button onClick={() => setShowImportModal(true)} className="btn btn-secondary">
            <Upload size={16} />
            Import PS CSV
          </button>
          <button onClick={handleExportPS} className="btn btn-primary">
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Release Configuration Card */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={18} style={{ color: 'var(--primary)' }} />
          Problem Selection Release Config
        </h3>

        {!releaseTime ? (
          <div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Problem statement selections are currently <strong>locked</strong>. Set a future release time to allow teams to choose their statement.
            </p>
            <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-end', maxWidth: '750px' }}>
              <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '220px' }}>
                <label className="form-label">Release Date & Time (Local Time)</label>
                <DateTimePicker
                  value={inputReleaseTime}
                  onChange={setInputReleaseTime}
                  minDateTime={new Date()}
                  placeholder="Select Release Date & Time"
                  disabled={isUpdatingConfig}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '220px' }}>
                <label className="form-label">Check-in Gate (Opt-in)</label>
                <select
                  className="form-input"
                  value={selectedGateCheckpointId}
                  onChange={(e) => setSelectedGateCheckpointId(e.target.value)}
                  disabled={isUpdatingConfig}
                  style={{ height: '48px' }}
                >
                  <option value="">None (Gating Off)</option>
                  {checkpoints.map((cp) => (
                    <option key={cp.id} value={cp.id}>
                      {cp.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn btn-primary" disabled={isUpdatingConfig} style={{ height: '48px', minHeight: 'auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isUpdatingConfig ? <span className="spinner"></span> : 'Save Configuration'}
              </button>
            </form>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <span style={{ fontSize: '0.75rem', background: 'var(--success-glow)', color: 'var(--success)', padding: '2px 8px', borderRadius: '999px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Selections Scheduled / Unlocked
              </span>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '6px' }}>
                {new Date(releaseTime).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}
              </div>
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

      {/* Search & Discipline Filter Bar under Config Card */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 2, minWidth: '260px' }}>
          <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search problem statements by code, title, domain, organization..."
            className="form-input"
            style={{ paddingLeft: '48px', width: '100%' }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={{ flex: 1, minWidth: '160px' }}>
          <select
            value={disciplineFilter}
            onChange={(e) => setDisciplineFilter(e.target.value)}
            className="form-input"
            style={{ width: '100%' }}
          >
            <option value="">All Categories</option>
            <option value="ENGINEERING">Engineering</option>
            <option value="DESIGN">Design</option>
          </select>
        </div>
      </div>

      {/* Tile Grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="glass-card" style={{ padding: '24px', minHeight: '180px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div className="skeleton" style={{ height: '18px', width: '60px', borderRadius: '4px' }}></div>
                  <div className="skeleton" style={{ height: '18px', width: '80px', borderRadius: '4px' }}></div>
                </div>
                <div className="skeleton" style={{ height: '24px', width: '85%', borderRadius: '4px', marginBottom: '10px' }}></div>
                <div className="skeleton" style={{ height: '16px', width: '100%', borderRadius: '4px', marginBottom: '6px' }}></div>
                <div className="skeleton" style={{ height: '16px', width: '70%', borderRadius: '4px' }}></div>
              </div>
              <div style={{ marginTop: '20px' }}>
                <div className="skeleton" style={{ height: '14px', width: '100%', borderRadius: '4px' }}></div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredStatements.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }} className="glass-panel">
          <FileText size={32} style={{ marginBottom: '12px' }} />
          <p>No problem statements match your criteria.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {filteredStatements.map((s) => {
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
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
                        {s.code}
                      </span>
                      {s.discipline && (
                        <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, textTransform: 'capitalize', background: s.discipline === 'design' ? 'rgba(236,72,153,0.12)' : 'rgba(59,130,246,0.12)', color: s.discipline === 'design' ? '#ec4899' : '#3b82f6' }}>
                          {s.discipline}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.75rem', background: isFull ? 'var(--danger-glow)' : 'var(--success-glow)', color: isFull ? 'var(--danger)' : 'var(--success)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                      {isFull ? 'Fully Committed' : `${s.remainingCapacity} Left`}
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

        <div style={{ marginBottom: '20px' }}>
          <label className="form-label">Check-in Gate Checkpoint (Opt-in)</label>
          <select
            className="form-input"
            value={selectedGateCheckpointId}
            onChange={(e) => setSelectedGateCheckpointId(e.target.value)}
            disabled={isUpdatingConfig}
          >
            <option value="">None (Check-in Gating Disabled)</option>
            {checkpoints.map((cp) => (
              <option key={cp.id} value={cp.id}>
                {cp.name}
              </option>
            ))}
          </select>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
            When set, team leaders must be checked in at this checkpoint before selecting a problem statement.
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              type="button"
              onClick={() => setShowReleaseModal(false)}
              className="btn btn-secondary"
              style={{ minHeight: '38px', height: '38px', padding: '6px 16px', fontSize: '0.85rem' }}
              disabled={isUpdatingConfig}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSaveConfig()}
              className="btn btn-primary"
              style={{ minHeight: '38px', height: '38px', padding: '6px 16px', fontSize: '0.85rem' }}
              disabled={!inputReleaseTime || isUpdatingConfig}
            >
              {isUpdatingConfig ? <span className="spinner spinner-white" style={{ width: '14px', height: '14px' }}></span> : 'Save Changes'}
            </button>
          </div>
          
          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '16px', display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => setShowLockConfirm(true)}
              className="btn btn-secondary"
              style={{ color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.15)', minHeight: '38px', height: '38px', padding: '6px 16px', fontSize: '0.85rem', width: '100%' }}
              disabled={isUpdatingConfig}
            >
              Deactivate Timer & Lock Selections
            </button>
          </div>
        </div>
      </Modal>

      {/* Lock Selections Confirm Dialog */}
      <ConfirmDialog
        isOpen={showLockConfirm}
        title="Deactivate Timer & Lock Selections"
        message="Are you sure you want to deactivate the countdown timer? Problem statement selections will be locked immediately and teams will no longer be able to select topics."
        confirmLabel="Deactivate & Lock"
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

  return createPortal(
    <div className="modal-overlay-fade">
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
                <div>
                  <h4 style={{ fontWeight: 700 }}>Invalid Rows Found!</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Please correct the following errors in your CSV file and try importing again.
                  </p>
                </div>
              </div>
            ) : (
              <div className="toast toast-success" style={{ position: 'static', width: '100%', maxWidth: 'none', margin: '0 0 20px 0', borderLeft: '4px solid var(--success)' }}>
                <div>
                  <h4 style={{ fontWeight: 700 }}>CSV File Validated!</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    The CSV contains {newCount} new problem statements to be imported.
                  </p>
                </div>
              </div>
            )}

            {invalidRows.length > 0 && (
              <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '8px', padding: '16px', marginBottom: '24px', maxHeight: '200px', overflowY: 'auto' }}>
                <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {invalidRows.map((err, i) => (
                    <li key={i} style={{ fontSize: '0.85rem', color: 'var(--danger)' }}>
                      Row {err.row}: {err.errors.join(', ')}
                    </li>
                  ))}
                </ul>
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
    </div>,
    document.body
  );
};


// ==========================================
// POD GROUP CSV IMPORT MODAL WIZARD
// ==========================================
const PodImportModal = ({ onClose }) => {
  const { addToast } = useToast();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const [importId, setImportId] = useState(null);
  const [newCount, setNewCount] = useState(0);
  const [invalidRows, setInvalidRows] = useState([]);

  const handleDownloadTemplate = () => {
    const csvContent = "name,capacity\n" +
      "POD Alpha,6\n" +
      "POD Beta,8\n";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "pods_import_template.csv");
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
      const res = await api.post('/admin/pods/import/preview', formData, {
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
      await api.post('/admin/pods/import/confirm', null, { params: { importId } });
      addToast('POD Groups successfully imported!', 'success');
      onClose();
    } catch (err) {
      addToast('Failed to confirm POD Groups import', 'error');
    } finally {
      setIsConfirming(false);
    }
  };

  return createPortal(
    <div className="modal-overlay-fade">
      <div className="glass-card modal-scale-up" style={{ width: '100%', maxWidth: '600px', padding: '32px', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <X size={20} />
        </button>

        <h2 style={{ fontSize: '1.75rem', marginBottom: '8px' }} className="text-gradient">Import POD Groups</h2>
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
            <div style={{ border: '2px dashed var(--border-light)', borderRadius: '12px', padding: '40px 20px', textAlign: 'center', marginBottom: '24px', cursor: 'pointer', background: 'rgba(255,255,255,0.01)' }} onClick={() => document.getElementById('podCsvFile').click()}>
              <Upload size={32} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
              <p style={{ fontWeight: 600 }}>Click to browse POD CSV file</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>Columns: name, capacity</p>

              {file && (
                <div style={{ marginTop: '16px', background: 'rgba(99, 102, 241, 0.1)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--primary)' }}>
                  {file.name}
                </div>
              )}
              <input id="podCsvFile" type="file" accept=".csv" onChange={handleFileChange} style={{ display: 'none' }} />
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
                <div>
                  <h4 style={{ fontWeight: 700 }}>Invalid Rows Found!</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Please correct the following errors in your CSV file and try importing again.
                  </p>
                </div>
              </div>
            ) : (
              <div className="toast toast-success" style={{ position: 'static', width: '100%', maxWidth: 'none', margin: '0 0 20px 0', borderLeft: '4px solid var(--success)' }}>
                <div>
                  <h4 style={{ fontWeight: 700 }}>CSV File Validated!</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    The CSV contains {newCount} new POD groups to be imported.
                  </p>
                </div>
              </div>
            )}

            {invalidRows.length > 0 && (
              <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '8px', padding: '16px', marginBottom: '24px', maxHeight: '200px', overflowY: 'auto' }}>
                <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {invalidRows.map((err, i) => (
                    <li key={i} style={{ fontSize: '0.85rem', color: 'var(--danger)' }}>
                      Row {err.row}: {err.reason}
                    </li>
                  ))}
                </ul>
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
    </div>,
    document.body
  );
};


// ==========================================
// PS SELECTIONS LIST MODAL
// ==========================================
const PSTeamsModal = ({ ps, onClose }) => {
  const { addToast } = useToast();
  const [selections, setSelections] = useState([]);
  const [loading, setLoading] = useState(true);
  const modalOverlayRef = useRef();

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
  }, [onClose]);

  return createPortal(
    <div 
      ref={modalOverlayRef}
      onClick={(e) => e.target === modalOverlayRef.current && onClose()}
      className="modal-overlay-fade"
    >
      <div className="glass-card modal-scale-up" style={{ width: '100%', maxWidth: '640px', padding: '32px', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <X size={20} />
        </button>

        <h2 style={{ fontSize: '1.5rem', marginBottom: '4px', fontWeight: 700 }}>[{ps.code}] {ps.title} Selections</h2>

        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-light)', marginBottom: '20px', marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <h4 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Description</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4, whiteSpace: 'pre-wrap', margin: 0 }}>
              {ps.description}
            </p>
          </div>
          <div>
            <h4 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Requirements</h4>
            <p style={{ fontSize: '0.85rem', color: ps.requirements ? 'var(--text-secondary)' : 'var(--text-muted)', lineHeight: 1.4, whiteSpace: 'pre-wrap', margin: 0 }}>
              {ps.requirements || 'No specific requirements provided.'}
            </p>
          </div>
        </div>

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
              render: (sel) => {
                const timeStr = sel.selectedAt;
                const utcStr = timeStr && !timeStr.endsWith('Z') && !timeStr.includes('+') ? timeStr + 'Z' : timeStr;
                return (
                  <span style={{ fontWeight: 600 }}>
                    {utcStr ? new Date(utcStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : ''}
                  </span>
                );
              }
            }
          ]}
          data={selections}
          loading={loading}
          hideTopPagination={true}
          emptyState={<p style={{ color: 'var(--text-muted)', padding: '20px 0' }}>No teams have selected this problem statement yet.</p>}
        />
      </div>
    </div>,
    document.body
  );
};


export default AdminDashboard;


