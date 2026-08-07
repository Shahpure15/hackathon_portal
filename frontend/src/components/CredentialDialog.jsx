import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import Modal from './Modal';

const CredentialDialog = ({
  isOpen,
  title = 'Account Credentials',
  username,
  password,
  onClose
}) => {
  const [copiedUser, setCopiedUser] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);

  const copyToClipboard = async (text, isUser) => {
    try {
      await navigator.clipboard.writeText(text);
      if (isUser) {
        setCopiedUser(true);
        setTimeout(() => setCopiedUser(false), 2000);
      } else {
        setCopiedPass(true);
        setTimeout(() => setCopiedPass(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="420px"
      hideCloseButton={false}
    >
      <div className="toast toast-success" style={{ position: 'static', width: '100%', maxWidth: 'none', margin: '0 0 20px 0', borderLeft: '4px solid var(--success)' }}>
        <div>
          <h4 style={{ fontWeight: 700 }}>Account Generated!</h4>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Please copy these credentials now. These passwords are cryptographically hashed and cannot be retrieved later.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Username</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              readOnly
              className="form-input"
              value={username || ''}
              style={{ fontFamily: 'monospace', flex: 1 }}
            />
            <button
              type="button"
              onClick={() => copyToClipboard(username, true)}
              className="btn btn-secondary"
              style={{ padding: '10px', minHeight: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              title="Copy Username"
            >
              {copiedUser ? <Check size={16} style={{ color: 'var(--success)' }} /> : <Copy size={16} />}
            </button>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Password</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              readOnly
              className="form-input"
              value={password || ''}
              style={{ fontFamily: 'monospace', flex: 1, color: 'var(--accent-blue)', fontWeight: 600 }}
            />
            <button
              type="button"
              onClick={() => copyToClipboard(password, false)}
              className="btn btn-secondary"
              style={{ padding: '10px', minHeight: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              title="Copy Password"
            >
              {copiedPass ? <Check size={16} style={{ color: 'var(--success)' }} /> : <Copy size={16} />}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onClose}
          className="btn btn-primary"
          style={{ minHeight: 'auto', padding: '8px 20px' }}
        >
          Done
        </button>
      </div>
    </Modal>
  );
};

export default CredentialDialog;
