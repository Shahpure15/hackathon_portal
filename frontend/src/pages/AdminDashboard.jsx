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
            Admin
          </span>
        </div>

        {/* Tabs for Desktop */}
        {!isMobile ? (
          <div className="floating-nav-tabs">
            <button
              onClick={() => handleTabClick('teams')}
              className={`btn ${activeTab === 'teams' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '8px 16px', border: 'none', background: activeTab === 'teams' ? undefined : 'transparent', minHeight: 'auto', height: '36px', borderRadius: '999px', fontSize: '0.85rem', color: activeTab === 'teams' ? undefined : 'var(--text-secondary)', flexShrink: 0 }}
            >
              Teams
            </button>
            <button
              onClick={() => handleTabClick('pods')}
              className={`btn ${activeTab === 'pods' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '8px 16px', border: 'none', background: activeTab === 'pods' ? undefined : 'transparent', minHeight: 'auto', height: '36px', borderRadius: '999px', fontSize: '0.85rem', color: activeTab === 'pods' ? undefined : 'var(--text-secondary)', flexShrink: 0 }}
            >
              POD Groups
            </button>
            <button
              onClick={() => handleTabClick('volunteers')}
              className={`btn ${activeTab === 'volunteers' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '8px 16px', border: 'none', background: activeTab === 'volunteers' ? undefined : 'transparent', minHeight: 'auto', height: '36px', borderRadius: '999px', fontSize: '0.85rem', color: activeTab === 'volunteers' ? undefined : 'var(--text-secondary)', flexShrink: 0 }}
            >
              Volunteers
            </button>
            <button
              onClick={() => handleTabClick('checkpoints')}
              className={`btn ${activeTab === 'checkpoints' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '8px 16px', border: 'none', background: activeTab === 'checkpoints' ? undefined : 'transparent', minHeight: 'auto', height: '36px', borderRadius: '999px', fontSize: '0.85rem', color: activeTab === 'checkpoints' ? undefined : 'var(--text-secondary)', flexShrink: 0 }}
            >
              Attendance Slots
            </button>
            <button
              onClick={() => handleTabClick('ps')}
              className={`btn ${activeTab === 'ps' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '8px 16px', border: 'none', background: activeTab === 'ps' ? undefined : 'transparent', minHeight: 'auto', height: '36px', borderRadius: '999px', fontSize: '0.85rem', color: activeTab === 'ps' ? undefined : 'var(--text-secondary)', flexShrink: 0 }}
            >
              Problem Statements
            </button>
          </div>
        ) : null}

        {/* Right side: Logout (Desktop) or Hamburger (Mobile) */}
        {!isMobile ? (
          <button
            onClick={async () => {
              localStorage.removeItem('adminActiveTab');
              localStorage.removeItem('leaderActiveTab');
              await api.post('/auth/logout');
              window.location.href = '/login';
            }}
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
            onClick={() => handleTabClick('teams')}
            className={`btn ${activeTab === 'teams' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ width: '100%', padding: '10px 16px', border: 'none', background: activeTab === 'teams' ? undefined : 'transparent', minHeight: 'auto', height: '40px', borderRadius: '12px', textAlign: 'left', justifyContent: 'flex-start', color: activeTab === 'teams' ? undefined : 'var(--text-secondary)' }}
          >
            Teams
          </button>
          <button
            onClick={() => handleTabClick('pods')}
            className={`btn ${activeTab === 'pods' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ width: '100%', padding: '10px 16px', border: 'none', background: activeTab === 'pods' ? undefined : 'transparent', minHeight: 'auto', height: '40px', borderRadius: '12px', textAlign: 'left', justifyContent: 'flex-start', color: activeTab === 'pods' ? undefined : 'var(--text-secondary)' }}
          >
            POD Groups
          </button>
          <button
            onClick={() => handleTabClick('volunteers')}
            className={`btn ${activeTab === 'volunteers' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ width: '100%', padding: '10px 16px', border: 'none', background: activeTab === 'volunteers' ? undefined : 'transparent', minHeight: 'auto', height: '40px', borderRadius: '12px', textAlign: 'left', justifyContent: 'flex-start', color: activeTab === 'volunteers' ? undefined : 'var(--text-secondary)' }}
          >
            Volunteers
          </button>
          <button
            onClick={() => handleTabClick('checkpoints')}
            className={`btn ${activeTab === 'checkpoints' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ width: '100%', padding: '10px 16px', border: 'none', background: activeTab === 'checkpoints' ? undefined : 'transparent', minHeight: 'auto', height: '40px', borderRadius: '12px', textAlign: 'left', justifyContent: 'flex-start', color: activeTab === 'checkpoints' ? undefined : 'var(--text-secondary)' }}
          >
            Attendance Slots
          </button>
          <button
            onClick={() => handleTabClick('ps')}
            className={`btn ${activeTab === 'ps' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ width: '100%', padding: '10px 16px', border: 'none', background: activeTab === 'ps' ? undefined : 'transparent', minHeight: 'auto', height: '40px', borderRadius: '12px', textAlign: 'left', justifyContent: 'flex-start', color: activeTab === 'ps' ? undefined : 'var(--text-secondary)' }}
          >
            Problem Statements
          </button>
          <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)', margin: '8px 0' }} />
          <button
            onClick={async () => {
              localStorage.removeItem('adminActiveTab');
              localStorage.removeItem('leaderActiveTab');
              await api.post('/auth/logout');
              window.location.href = '/login';
            }}
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
        <div style={{ display: activeTab === 'volunteers' ? 'block' : 'none' }} className="fade-in-up">
          <VolunteersView pods={pods} fetchPodsPool={fetchPodsPool} />
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
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
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <select
              value={filters.hasPod || ''}
              onChange={(e) => onFilterChange('hasPod', e.target.value)}
              className="form-input"
              style={{ width: '180px' }}
            >
              <option value="">All POD Statuses</option>
              <option value="true">Assigned to POD</option>
              <option value="false">Unassigned (No POD)</option>
            </select>

            <select
              value={filters.hasPs || ''}
              onChange={(e) => onFilterChange('hasPs', e.target.value)}
              className="form-input"
              style={{ width: '200px' }}
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
// TEAM DETAILS MODAL COMPONENT
// ==========================================
const TeamDetailsModal = ({ team, pods, fetchPodsPool, onResetPassword, onClose }) => {
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
  const [credentialsToShow, setCredentialsToShow] = useState(null);

  // Handle outside click/Escape closes
  const modalRef = useRef();

  const handleResetTeamPassword = () => {
    onResetPassword(team.id, team.name);
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
    >
      <div className="glass-card modal-scale-up" style={{ width: '80vw', maxWidth: '1200px', padding: '24px', position: 'relative' }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
        >
          <X size={20} />
        </button>

        <h2 className="panel-title" style={{ fontSize: '1.75rem', marginBottom: '4px' }}>{team.name}</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px', paddingLeft: '16px' }}>
          Registration Code: {team.registrationId} | Synced from CSV
        </p>

        {loadingDetails ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <span className="spinner" style={{ width: '32px', height: '32px', margin: '0 auto' }}></span>
            <p style={{ marginTop: '12px', color: 'var(--text-secondary)' }}>Loading team information...</p>
          </div>
        ) : (
          <div className="modal-grid-1-1">
            {/* Left column: read-only summaries & forms */}
            <div>
              <div className="modal-grid-3" style={{ marginBottom: '16px' }}>
                <div style={{ background: 'var(--cream)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-strong)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>Leader Contact</span>
                  <div style={{ fontWeight: 600, marginTop: '4px' }}>{team.leaderName}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{team.leaderEmail}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{team.leaderPhone}</div>
                </div>
                <div style={{ background: 'var(--cream)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-strong)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>College</span>
                  <div style={{ fontWeight: 600, marginTop: '4px', fontSize: '0.85rem', lineHeight: '1.4' }}>{team.collegeName}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Locked from CSV source</div>
                </div>
                <div style={{ background: 'var(--cream)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-strong)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', textTransform: 'uppercase' }}>Leader Account</span>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Username: <code>{team.registrationId.toLowerCase()}</code></div>
                  </div>
                  <button
                    onClick={handleResetTeamPassword}
                    className="btn btn-secondary"
                    style={{ padding: '6px 14px', fontSize: '0.75rem', minHeight: '32px', height: '32px', marginTop: '6px', alignSelf: 'flex-start' }}
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
                      <button type="submit" className="btn btn-primary" style={{ minHeight: '38px', height: '38px', padding: '6px 16px', fontSize: '0.85rem' }}>Save</button>
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
              <h3 className="panel-title" style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '16px' }}>Team Roster</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '340px', paddingRight: '4px' }}>
                {members.map((m) => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderRadius: '8px', background: 'var(--cream)', border: '1px solid var(--border-strong)' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{m.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{m.email}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{m.phone}</div>
                    </div>
                    <div>
                      {m.idVerified ? (
                        <span style={{ color: 'var(--success)', fontSize: '0.75rem', fontWeight: 600, background: 'var(--success-glow)', padding: '4px 8px', borderRadius: '6px' }}>✓ Verified</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', background: 'var(--card-2)', padding: '4px 8px', borderRadius: '6px' }}>Awaiting Venue Check-in</span>
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

      {credentialsToShow && (
        <CredentialDialog
          isOpen={true}
          onClose={() => {
            setCredentialsToShow(null);
            onClose();
          }}
          title={credentialsToShow.title}
          username={credentialsToShow.username}
          password={credentialsToShow.password}
        />
      )}
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800 }}>POD <span className="font-accent">Groupings</span></h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Groupings for mentor assignments and team checkpoints.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={handleDownloadPodsTemplate} className="btn btn-secondary" title="Download PODs Import Template CSV">
            <Download size={16} />
            Template CSV
          </button>
          <button onClick={() => setShowImportModal(true)} className="btn btn-secondary">
            <Upload size={16} />
            Import CSV
          </button>
          <button onClick={handleExportPods} className="btn btn-secondary">
            <Download size={16} />
            Export CSV
          </button>
          <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
            + Create POD Group
          </button>
        </div>
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
  const [credentialsToShow, setCredentialsToShow] = useState(null);
  const [revokeConfirmState, setRevokeConfirmState] = useState(null);
  const [deleteConfirmState, setDeleteConfirmState] = useState(null);

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
        setCredentialsToShow({
          title: 'Volunteer Created with Login Access',
          username: res.data.username,
          password: res.data.generatedPassword
        });
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
      setCredentialsToShow({
        title: `Login Created for ${volName}`,
        username: res.data.username,
        password: res.data.generatedPassword
      });
      fetchVolunteers();
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
      fetchVolunteers();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to revoke login', 'error');
    }
  };

  const handleResetVolunteerPassword = (volId, volName) => {
    setResetPasswordState({
      isOpen: true,
      targetId: volId,
      targetName: volName,
      type: 'volunteer'
    });
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

  const executeDeleteVolunteer = async () => {
    if (!deleteConfirmState) return;
    const { volId, volName } = deleteConfirmState;
    try {
      await api.delete(`/admin/volunteers/${volId}`);
      addToast('Volunteer deleted successfully', 'success');
      setDeleteConfirmState(null);
      fetchVolunteers();
      fetchPodsPool();
    } catch (err) {
      addToast('Failed to delete volunteer', 'error');
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800 }}>Volunteers <span className="font-accent">Pool</span></h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Faculty and student volunteers to monitor pods and physical check-ins.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={handleDownloadVolunteersTemplate} className="btn btn-secondary" title="Download Volunteers Import Template CSV">
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
                      onClick={() => setRevokeConfirmState({ isOpen: true, volId: v.id, volName: v.name })}
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
                onClick={() => setDeleteConfirmState({ isOpen: true, volId: v.id, volName: v.name })}
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

  // Form states
  const [cpId, setCpId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
      fetchCheckpoints();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to delete Attendance Slot', 'error');
    }
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800 }}>Attendance <span className="font-accent">Slots</span></h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Configure and manage checkpoints (check-in, lunch, workshops) that volunteers can verify.
          </p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
          + Add Attendance Slot
        </button>
      </div>

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
            width: '120px',
            render: (c) => (
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
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


