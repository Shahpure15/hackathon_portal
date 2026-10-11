import React, { useState } from 'react';
import { AlertTriangle, Archive, Trash2, ArrowRight, CheckCircle2 } from 'lucide-react';
import api from '../../services/api';
import Modal from '../../components/Modal';
import { useToast } from '../../contexts/ToastContext';

export default function ReviseRubricModal({ roundId, roundName, currentRubricVersion, isOpen, onClose, onRevised }) {
  const { addToast } = useToast();
  const [mode, setMode] = useState('archive'); // archive | discard
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (mode === 'discard' && confirmText.trim() !== roundName.trim()) {
      addToast(`Please type "${roundName}" exactly to confirm discard mode.`, 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post(`/admin/rounds/${roundId}/rubric/revise`, {
        mode,
        confirmText: mode === 'discard' ? confirmText.trim() : null,
      });

      const data = res.data;
      addToast(
        `Rubric revised to v${data.newVersion}! (${data.supersededFinals || 0} finals superseded, ${data.discardedDrafts || 0} drafts discarded)`,
        'success'
      );
      if (onRevised) {
        onRevised(data);
      }
      onClose();
    } catch (err) {
      const d = err.response?.data?.detail;
      const msg = typeof d === 'string' ? d : d?.message || 'Failed to revise rubric';
      addToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const isDiscardValid = mode === 'archive' || confirmText.trim() === roundName.trim();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Revise Locked Rubric (Current v${currentRubricVersion || 1})`}
      maxWidth="540px"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div
          style={{
            padding: '14px 16px',
            borderRadius: '10px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#ef4444',
            fontSize: '0.84rem',
            display: 'flex',
            gap: '12px',
          }}
        >
          <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>This rubric has locked evaluations.</strong>
            <div style={{ marginTop: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Revising the rubric creates a new rubric version (v{Number(currentRubricVersion || 1) + 1}) unlocked for editing. Choose how existing scores are treated:
            </div>
          </div>
        </div>

        {/* Mode selector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div
            onClick={() => setMode('archive')}
            style={{
              padding: '14px',
              borderRadius: '10px',
              border: mode === 'archive' ? '2px solid var(--primary)' : '1px solid var(--border-color)',
              background: mode === 'archive' ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255,255,255,0.02)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontWeight: 700 }}>
              <Archive size={18} /> Archive & Supersede
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Previous finals remain preserved in audit history. Outstanding drafts are discarded. Next drafts pre-fill matching fields.
            </div>
          </div>

          <div
            onClick={() => setMode('discard')}
            style={{
              padding: '14px',
              borderRadius: '10px',
              border: mode === 'discard' ? '2px solid #ef4444' : '1px solid var(--border-color)',
              background: mode === 'discard' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255,255,255,0.02)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontWeight: 700 }}>
              <Trash2 size={18} /> Discard All Scores
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Marks all finals and drafts as discarded. Judges must re-score all teams from scratch under the new rubric.
            </div>
          </div>
        </div>

        {/* Confirmation text if discard */}
        {mode === 'discard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#ef4444' }}>
              Type the exact round name <strong>"{roundName}"</strong> to confirm discard:
            </label>
            <input
              type="text"
              className="form-input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={roundName}
              style={{ borderColor: confirmText.trim() === roundName.trim() ? '#22c55e' : '#ef4444' }}
              required
            />
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !isDiscardValid}
            className="btn btn-primary"
            style={{
              background: mode === 'discard' ? '#ef4444' : 'var(--primary)',
              borderColor: mode === 'discard' ? '#ef4444' : 'var(--primary)',
            }}
          >
            {submitting ? 'Revising...' : `Confirm Revision to v${Number(currentRubricVersion || 1) + 1}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
