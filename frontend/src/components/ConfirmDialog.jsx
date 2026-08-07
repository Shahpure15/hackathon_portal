import React from 'react';
import Modal from './Modal';

const ConfirmDialog = ({
  isOpen,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
  loading = false
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      maxWidth="400px"
      hideCloseButton={true}
    >
      <div style={{ marginBottom: '24px', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
        {message}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-secondary"
          style={{ minHeight: 'auto', padding: '8px 16px' }}
          disabled={loading}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="btn"
          disabled={loading}
          style={{
            minHeight: 'auto',
            padding: '8px 16px',
            backgroundColor: danger ? 'var(--danger)' : 'var(--primary)',
            color: '#fff',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.65 : 1
          }}
        >
          {loading ? <span className="spinner spinner-white" style={{ width: '16px', height: '16px' }}></span> : confirmLabel}
        </button>
      </div>
    </Modal>
  );
};

export default ConfirmDialog;
