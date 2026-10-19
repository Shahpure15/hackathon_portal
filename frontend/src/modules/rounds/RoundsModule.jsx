import React, { useState, useEffect } from 'react';
import {
  Download,
  Upload,
  Plus,
  Search,
  FileSpreadsheet,
  Layers,
  FileText,
  AlertTriangle,
  Trophy,
  Users,
  Award,
} from 'lucide-react';
import api from '../../services/api';
import RoundList from './RoundList';
import RoundEditor from './RoundEditor';
import AssignmentWizard from './AssignmentWizard';
import JudgingProgressConsole from './JudgingProgressConsole';
import DirectLeaderboardView from './DirectLeaderboardView';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';

export const RoundsModule = () => {
  const { addToast } = useToast();
  const { features } = useAuth();

  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('rounds'); // 'rounds' | 'leaderboard'
  const [leaderboardRoundId, setLeaderboardRoundId] = useState('');

  // Standalone dedicated modals for wizards
  const [assignmentWizardRound, setAssignmentWizardRound] = useState(null);
  const [progressConsoleRound, setProgressConsoleRound] = useState(null);

  // Editor modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedRound, setSelectedRound] = useState(null);

  // Delete modal state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [roundToDelete, setRoundToDelete] = useState(null);
  const [forceDeleteSubmissions, setForceDeleteSubmissions] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Import modal state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  const fetchRounds = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/rounds');
      setRounds(res.data || []);
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to fetch rounds', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRounds();
  }, []);

  // Open Create
  const handleOpenCreate = () => {
    setSelectedRound({
      name: '',
      number: rounds.length + 1,
      description: '',
      submissionEnabled: false,
      evaluationEnabled: features?.evaluation !== false,
      isSubmissionOpen: false,
      status: 'live',
      submissionFields: [],
      rubricFields: [],
    });
    setEditorOpen(true);
    const params = new URLSearchParams(window.location.search);
    params.set('action', 'create');
    params.delete('roundId');
    window.history.pushState(null, '', `${window.location.pathname}?${params.toString()}`);
    window.dispatchEvent(new Event('popstate'));
  };

  // Open Edit
  const handleOpenEdit = async (r) => {
    try {
      const res = await api.get(`/admin/rounds/${r.id}`);
      setSelectedRound(res.data);
      setEditorOpen(true);
    } catch (err) {
      setSelectedRound(r);
      setEditorOpen(true);
    }
    const params = new URLSearchParams(window.location.search);
    params.set('roundId', r.id);
    params.delete('action');
    window.history.pushState(null, '', `${window.location.pathname}?${params.toString()}`);
    window.dispatchEvent(new Event('popstate'));
  };

  // Close Editor and clear roundId from URL
  const handleCloseEditor = () => {
    setEditorOpen(false);
    setSelectedRound(null);
    const params = new URLSearchParams(window.location.search);
    params.delete('roundId');
    params.delete('action');
    const newQuery = params.toString();
    const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ''}`;
    window.history.replaceState(null, '', newUrl);
    fetchRounds();
    window.dispatchEvent(new Event('rounds-updated'));
  };

  // Sync URL search params with active round on mount and popstate
  useEffect(() => {
    const handleUrlSync = () => {
      const params = new URLSearchParams(window.location.search);
      const rId = params.get('roundId');
      const action = params.get('action');
      if (action === 'create') {
        if (!editorOpen) handleOpenCreate();
      } else if (rId && rounds.length > 0) {
        const found = rounds.find((rnd) => rnd.id === rId);
        if (found && (!selectedRound || selectedRound.id !== rId)) {
          handleOpenEdit(found);
        }
      } else if (!rId && !action && editorOpen) {
        setEditorOpen(false);
        setSelectedRound(null);
        fetchRounds();
      }
    };
    handleUrlSync();
    window.addEventListener('popstate', handleUrlSync);
    return () => window.removeEventListener('popstate', handleUrlSync);
  }, [rounds, editorOpen]);

  // Toggle submission open/close
  const handleToggleSubmission = async (roundId, currentOpen) => {
    try {
      await api.put(`/admin/rounds/${roundId}`, {
        isSubmissionOpen: !currentOpen,
      });
      addToast(`Submissions ${!currentOpen ? 'opened' : 'closed'} for round`, 'success');
      fetchRounds();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to update submission status', 'error');
    }
  };

  // Export Submissions for specific round
  const handleExportSubmissions = async (roundId, roundName) => {
    try {
      addToast('Generating submissions export...', 'info');
      const res = await api.get(`/admin/evaluation-rounds/${roundId}/submissions/export`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `submissions_${(roundName || 'round').toLowerCase().replace(/\s+/g, '_')}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast('Submissions Excel workbook downloaded!', 'success');
    } catch (err) {
      addToast('Failed to export submissions', 'error');
    }
  };

  // Export Master Workbook (All Rounds)
  const handleExportMasterWorkbook = async () => {
    try {
      addToast('Generating master evaluation workbook...', 'info');
      const res = await api.get('/admin/evaluation-rounds/export-master-workbook', {
        responseType: 'blob',
      });
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

  // Download Rounds CSV Template
  const handleDownloadTemplate = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Round Name,Sequence Order\n';
    csvContent += 'Round 1 Evaluation,1\nRound 2 Evaluation,2\n';
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'evaluation_rounds_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Rounds CSV
  const handleExportRoundsCsv = async () => {
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

  // Handle Import CSV
  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!importFile) return;
    setImporting(true);
    const formData = new FormData();
    formData.append('file', importFile);
    try {
      await api.post('/admin/evaluation-rounds/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      addToast('Evaluation rounds imported successfully!', 'success');
      setImportModalOpen(false);
      setImportFile(null);
      fetchRounds();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to import evaluation rounds', 'error');
    } finally {
      setImporting(false);
    }
  };

  // Handle Delete Round
  const handleDeleteClick = (r) => {
    setRoundToDelete(r);
    setForceDeleteSubmissions(false);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!roundToDelete) return;
    setDeleteLoading(true);
    try {
      const url = forceDeleteSubmissions
        ? `/admin/rounds/${roundToDelete.id}?confirmDeleteSubmissions=true`
        : `/admin/rounds/${roundToDelete.id}`;
      await api.delete(url);
      addToast('Round deleted successfully', 'success');
      setDeleteConfirmOpen(false);
      setRoundToDelete(null);
      fetchRounds();
    } catch (err) {
      const d = err.response?.data?.detail;
      const msg = typeof d === 'string' ? d : d?.message || 'Failed to delete round';
      if (typeof msg === 'string' && msg.includes('submissions')) {
        setForceDeleteSubmissions(true);
      }
      addToast(msg, 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredRounds = rounds.filter((r) => {
    const q = search.toLowerCase();
    return (
      (r.name || '').toLowerCase().includes(q) ||
      String(r.number || '').includes(q) ||
      (r.description && r.description.toLowerCase().includes(q))
    );
  });

  if (editorOpen) {
    return (
      <div style={{ marginBottom: '28px' }}>
        <RoundEditor
          round={selectedRound}
          features={features}
          onClose={handleCloseEditor}
          onSaved={() => {
            fetchRounds();
            window.dispatchEvent(new Event('rounds-updated'));
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '28px' }}>
      {/* Title Section */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 800, margin: '0 0 6px 0' }}>
          Competition <span className="font-accent">Rounds</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.92rem' }}>
          Unified round engine with independent participant submission windows, versioned scoring rubrics, and judge evaluation parameters.
        </p>
      </div>

      {/* Navigation Switcher: Rounds vs Direct Leaderboard */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-color)',
          gap: '8px',
          marginBottom: '20px',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('rounds')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'transparent',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
            borderBottom: activeTab === 'rounds' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'rounds' ? 'var(--primary)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Layers size={16} /> Competition Rounds ({rounds.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('leaderboard')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'transparent',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
            borderBottom: activeTab === 'leaderboard' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'leaderboard' ? 'var(--primary)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Trophy size={16} /> Direct Leaderboard & Standings
        </button>
      </div>

      {activeTab === 'leaderboard' ? (
        <DirectLeaderboardView defaultRoundId={leaderboardRoundId} />
      ) : (
        <>
          {/* Action Toolbar */}
          <div
            className="glass-panel"
            style={{
              padding: '12px 16px',
              borderRadius: '16px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '10px',
              alignItems: 'center',
              marginBottom: '24px',
            }}
          >
            <button
              type="button"
              onClick={handleExportMasterWorkbook}
              className="btn btn-primary touch-target"
              style={{
                width: '100%',
                height: '42px',
                minHeight: '42px',
                justifyContent: 'center',
                fontSize: '0.85rem',
                fontWeight: 600,
                padding: '0 12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title="Export Multi-Sheet Excel Workbook for All Rounds"
            >
              <Download size={16} /> Export All Rounds (Excel)
            </button>

            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="btn btn-secondary touch-target"
              style={{
                width: '100%',
                height: '42px',
                minHeight: '42px',
                justifyContent: 'center',
                fontSize: '0.85rem',
                fontWeight: 600,
                padding: '0 12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title="Download Rounds Template CSV"
            >
              <Download size={16} /> Template CSV
            </button>

            <button
              type="button"
              onClick={handleExportRoundsCsv}
              className="btn btn-secondary touch-target"
              style={{
                width: '100%',
                height: '42px',
                minHeight: '42px',
                justifyContent: 'center',
                fontSize: '0.85rem',
                fontWeight: 600,
                padding: '0 12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title="Export Rounds CSV"
            >
              <Download size={16} /> Export CSV
            </button>

            <button
              type="button"
              onClick={() => setImportModalOpen(true)}
              className="btn btn-secondary touch-target"
              style={{
                width: '100%',
                height: '42px',
                minHeight: '42px',
                justifyContent: 'center',
                fontSize: '0.85rem',
                fontWeight: 600,
                padding: '0 12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title="Import Rounds CSV"
            >
              <Upload size={16} /> Import CSV
            </button>

            <button
              type="button"
              onClick={handleOpenCreate}
              className="btn btn-primary touch-target"
              style={{
                width: '100%',
                height: '42px',
                minHeight: '42px',
                justifyContent: 'center',
                fontSize: '0.85rem',
                fontWeight: 600,
                padding: '0 12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Plus size={16} /> + Add Round
            </button>
          </div>

          {/* Search Input */}
          <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '24px', position: 'relative' }}>
            <Search
              size={18}
              style={{
                position: 'absolute',
                left: '36px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              placeholder="Search rounds by name, number or description..."
              className="form-input"
              style={{ paddingLeft: '48px', width: '100%' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Round Cards Grid */}
          <RoundList
            rounds={filteredRounds}
            loading={loading}
            onEditRound={handleOpenEdit}
            onDeleteRound={handleDeleteClick}
            onToggleSubmission={handleToggleSubmission}
            onExportSubmissions={handleExportSubmissions}
            onAddRound={handleOpenCreate}
            onAssignJudges={(round) => setAssignmentWizardRound(round)}
            onViewProgress={(round) => setProgressConsoleRound(round)}
            onViewLeaderboard={(round) => {
              setLeaderboardRoundId(round.id);
              setActiveTab('leaderboard');
            }}
          />
        </>
      )}

      {/* Standalone Assignment Wizard Modal */}
      {assignmentWizardRound && (
        <Modal
          isOpen={true}
          onClose={() => setAssignmentWizardRound(null)}
          title={`Judge & Team Assignment Wizard: ${assignmentWizardRound.name}`}
          maxWidth="1220px"
        >
          <AssignmentWizard
            roundId={assignmentWizardRound.id}
            features={features}
            onClose={() => setAssignmentWizardRound(null)}
          />
        </Modal>
      )}

      {/* Standalone Progress Console Modal */}
      {progressConsoleRound && (
        <Modal
          isOpen={true}
          onClose={() => setProgressConsoleRound(null)}
          title={`Judging Progress: ${progressConsoleRound.name}`}
          maxWidth="1100px"
        >
          <JudgingProgressConsole
            roundId={progressConsoleRound.id}
            roundName={progressConsoleRound.name}
            onClose={() => setProgressConsoleRound(null)}
          />
        </Modal>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmOpen && roundToDelete && (
        <ConfirmDialog
          isOpen={true}
          danger={true}
          title={`Delete Round "${roundToDelete.name}"?`}
          message={
            forceDeleteSubmissions ? (
              <div style={{ color: '#ef4444' }}>
                <p style={{ margin: '0 0 8px 0', fontWeight: 600 }}>
                  Warning: This round contains {roundToDelete.submissionCount} participant submissions.
                </p>
                <p style={{ margin: 0, fontSize: '0.85rem' }}>
                  Deleting this round will permanently cascade and purge all team answers and rubrics for this round. Are you completely sure?
                </p>
              </div>
            ) : (
              `Are you sure you want to permanently delete Round #${roundToDelete.number} (${roundToDelete.name})?`
            )
          }
          confirmLabel={forceDeleteSubmissions ? 'Force Delete Submissions & Round' : 'Delete Round'}
          loading={deleteLoading}
          onConfirm={handleConfirmDelete}
          onCancel={() => {
            setDeleteConfirmOpen(false);
            setRoundToDelete(null);
            setForceDeleteSubmissions(false);
          }}
        />
      )}

      {/* Import Modal */}
      {importModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setImportModalOpen(false)}
          title="Import Evaluation Rounds CSV"
          maxWidth="480px"
        >
          <form onSubmit={handleImportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
              Upload a CSV file containing columns: <code>Round Name, Sequence Order</code>
            </p>
            <input
              type="file"
              accept=".csv"
              className="form-input"
              required
              onChange={(e) => setImportFile(e.target.files[0] || null)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!importFile || importing}
                className="btn btn-primary"
              >
                {importing ? 'Importing...' : 'Upload & Import'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default RoundsModule;
