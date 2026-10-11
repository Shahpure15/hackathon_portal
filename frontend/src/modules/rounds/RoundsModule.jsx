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
} from 'lucide-react';
import api from '../../services/api';
import RoundList from './RoundList';
import RoundEditor from './RoundEditor';
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
      name: `Round ${rounds.length + 1} Evaluation`,
      number: rounds.length + 1,
      description: 'Submit your project architecture slide deck link and source code repository URL.',
      submissionEnabled: true,
      evaluationEnabled: features?.evaluation !== false,
      isSubmissionOpen: false,
      status: 'live',
      submissionFields: [
        { id: 'field_1', name: 'Google Drive / Slide Deck Link', description: 'Presentation or Architecture PDF link', fieldType: 'text', required: true },
        { id: 'field_2', name: 'GitHub Repository Link', description: 'Public repository source code link', fieldType: 'text', required: true },
      ],
      rubricFields: [
        {
          type: 'numeric',
          label: 'Innovation & Originality',
          description: 'Originality of concept and unique approach to solving problem statement',
          maxMarks: 10,
          weight: 40,
          anchors: [
            { from: 0, to: 4, label: 'Derivative' },
            { from: 5, to: 8, label: 'Creative' },
            { from: 9, to: 10, label: 'Breakthrough' },
          ],
        },
        {
          type: 'numeric',
          label: 'Technical Implementation & Architecture',
          description: 'Code quality, backend stability, design patterns, and deployment completeness',
          maxMarks: 20,
          weight: 60,
          anchors: [
            { from: 0, to: 10, label: 'Basic' },
            { from: 11, to: 16, label: 'Functional' },
            { from: 17, to: 20, label: 'Production Quality' },
          ],
        },
        {
          type: 'text',
          label: 'Judge Feedback & Recommendations',
          description: 'Constructive notes and next step suggestions for the team',
          visibility: 'participant',
          maxLength: 500,
        },
      ],
    });
    setEditorOpen(true);
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
  };

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
      />

      {/* Round Editor Modal */}
      {editorOpen && (
        <RoundEditor
          round={selectedRound}
          features={features}
          onClose={() => {
            setEditorOpen(false);
            setSelectedRound(null);
          }}
          onSaved={() => {
            fetchRounds();
          }}
        />
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
