import React, { useState, useEffect } from 'react';
import { Mail, Plus, Trash2, CheckCircle2, AlertCircle, RefreshCw, KeyRound, Server, Send } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import Modal from '../../components/Modal';

export default function EmailAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [sendTestModal, setSendTestModal] = useState(null); // { accountId, targetEmail: '' }
  const [sendingTest, setSendingTest] = useState(false);

  const [formData, setFormData] = useState({
    label: '',
    host: '',
    port: 587,
    security: 'starttls',
    username: '',
    password: '',
    fromEmail: '',
    fromName: '',
    dailyLimit: '',
    perMinuteLimit: '',
  });

  const { addToast } = useToast();

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/email/accounts');
      setAccounts(res.data);
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to load SMTP accounts', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/admin/email/accounts', {
        ...formData,
        port: parseInt(formData.port, 10),
        dailyLimit: formData.dailyLimit ? parseInt(formData.dailyLimit, 10) : null,
        perMinuteLimit: formData.perMinuteLimit ? parseInt(formData.perMinuteLimit, 10) : null,
      });
      addToast('SMTP account added successfully', 'success');
      setShowAddModal(false);
      setFormData({
        label: '',
        host: '',
        port: 587,
        security: 'starttls',
        username: '',
        password: '',
        fromEmail: '',
        fromName: '',
        dailyLimit: '',
        perMinuteLimit: '',
      });
      fetchAccounts();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to create SMTP account', 'error');
    }
  };

  const handleTest = async (account) => {
    setTestingId(account.id);
    setTestResult(null);
    try {
      const res = await api.post(`/admin/email/accounts/${account.id}/test`, {});
      if (res.data.ok) {
        addToast(res.data.message || 'SMTP test successful!', 'success');
        setTestResult({ id: account.id, ok: true, message: res.data.message });
      } else {
        addToast(res.data.error || 'SMTP test failed', 'error');
        setTestResult({ id: account.id, ok: false, error: res.data.error });
      }
    } catch (err) {
      addToast(err.response?.data?.detail || 'Test connection failed', 'error');
      setTestResult({ id: account.id, ok: false, error: err.response?.data?.detail });
    } finally {
      setTestingId(null);
    }
  };

  const handleSendTestEmail = async (e) => {
    e.preventDefault();
    if (!sendTestModal || !sendTestModal.targetEmail) return;
    setSendingTest(true);
    try {
      const res = await api.post(`/admin/email/accounts/${sendTestModal.accountId}/test`, {
        targetEmail: sendTestModal.targetEmail,
      });
      if (res.data.ok) {
        addToast(res.data.message || 'Test email sent successfully!', 'success');
        setSendTestModal(null);
      } else {
        addToast(res.data.error || 'Failed to send test email', 'error');
      }
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to send test email', 'error');
    } finally {
      setSendingTest(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/admin/email/accounts/${deleteId}`);
      addToast('Account removed', 'success');
      setDeleteId(null);
      fetchAccounts();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to delete account', 'error');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>SMTP Accounts</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Configure outbound mail servers for staff invitations and notifications.
          </p>
        </div>
        <button
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          onClick={() => setShowAddModal(true)}
        >
          <Plus size={16} /> Add Account
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading accounts...
        </div>
      ) : accounts.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
          <Server size={36} style={{ color: 'var(--text-secondary)', marginBottom: '12px' }} />
          <h4 style={{ margin: '0 0 6px 0', fontSize: '15px' }}>No SMTP Accounts Configured</h4>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
            Add an SMTP provider (e.g., Gmail, SendGrid, Mailgun) to start sending emails.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {accounts.map((acc) => (
            <div
              key={acc.id}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '18px',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 700, fontSize: '15px' }}>{acc.label}</span>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: acc.status === 'active' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: acc.status === 'active' ? '#16a34a' : '#ef4444',
                    }}
                  >
                    {acc.status}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {acc.host}:{acc.port} ({acc.security})
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  From: {acc.fromName ? `${acc.fromName} <${acc.fromEmail}>` : acc.fromEmail} | User: {acc.username}
                </div>
                {testResult && testResult.id === acc.id && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: testResult.ok ? '#16a34a' : '#ef4444' }}>
                    {testResult.ok ? '✓ Test connection successful' : `✗ Test error: ${testResult.error}`}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '12px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => handleTest(acc)}
                  disabled={testingId === acc.id}
                  title="Check connection and credentials without sending email"
                >
                  <RefreshCw size={14} className={testingId === acc.id ? 'spin' : ''} />
                  {testingId === acc.id ? 'Testing...' : 'Test Connection'}
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '12px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => setSendTestModal({ accountId: acc.id, targetEmail: '' })}
                  title="Send a real test email to an inbox"
                >
                  <Send size={14} />
                  Send Test Email
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ color: '#ef4444', padding: '6px 10px' }}
                  onClick={() => setDeleteId(acc.id)}
                  title="Delete Account"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Account Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add SMTP Server"
        maxWidth="520px"
      >
        <form onSubmit={handleCreate}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>Label</label>
            <input
              type="text"
              className="form-input"
              style={{ width: '100%' }}
              placeholder="e.g., Primary Gmail / Resend"
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>Host</label>
              <input
                type="text"
                className="form-input"
                style={{ width: '100%' }}
                placeholder="smtp.gmail.com"
                value={formData.host}
                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>Port</label>
              <input
                type="number"
                className="form-input"
                style={{ width: '100%' }}
                placeholder="587"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                required
              />
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>Security</label>
            <select
              className="form-input"
              style={{ width: '100%' }}
              value={formData.security}
              onChange={(e) => setFormData({ ...formData, security: e.target.value })}
            >
              <option value="starttls">STARTTLS (Port 587)</option>
              <option value="ssl">SSL / TLS (Port 465)</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>Username</label>
              <input
                type="text"
                className="form-input"
                style={{ width: '100%' }}
                placeholder="user@domain.com"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>Password (App Password)</label>
              <input
                type="password"
                className="form-input"
                style={{ width: '100%' }}
                placeholder="••••••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>From Email</label>
              <input
                type="email"
                className="form-input"
                style={{ width: '100%' }}
                placeholder="noreply@domain.com"
                value={formData.fromEmail}
                onChange={(e) => setFormData({ ...formData, fromEmail: e.target.value })}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>From Name</label>
              <input
                type="text"
                className="form-input"
                style={{ width: '100%' }}
                placeholder="Hackathon Team"
                value={formData.fromName}
                onChange={(e) => setFormData({ ...formData, fromName: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowAddModal(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Account
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        title="Delete SMTP Account"
        message="Are you sure you want to remove this SMTP server configuration?"
        confirmLabel="Delete"
        danger={true}
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />

      {/* Send Test Email Modal */}
      <Modal
        isOpen={!!sendTestModal}
        onClose={() => setSendTestModal(null)}
        title="Send Test Email"
        maxWidth="440px"
      >
        <form onSubmit={handleSendTestEmail}>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Send a live test email through this SMTP account to verify outbound mail delivery to real inboxes.
          </p>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>
              Recipient Email Address
            </label>
            <input
              type="email"
              className="form-input"
              style={{ width: '100%' }}
              placeholder="you@domain.com"
              value={sendTestModal?.targetEmail || ''}
              onChange={(e) => setSendTestModal({ ...sendTestModal, targetEmail: e.target.value })}
              required
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setSendTestModal(null)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={sendingTest}
            >
              {sendingTest ? 'Sending...' : 'Send Message'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
