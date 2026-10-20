import React, { useState, useEffect } from 'react';
import { KeyRound, User, Lock, Eye, EyeOff, CheckCircle2, AlertCircle, Check, Loader2 } from 'lucide-react';
import Modal from './Modal';
import api from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';

export const ChangePasswordModal = ({ isOpen, onClose }) => {
  const { addToast } = useToast();
  const { user, updateUsername } = useAuth?.() || {};

  const [activeTab, setActiveTab] = useState('username'); // 'username' or 'password'

  // Username form state
  const [newUsername, setNewUsername] = useState('');
  const [usernamePassword, setUsernamePassword] = useState('');
  const [showUsernamePassword, setShowUsernamePassword] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [availabilityStatus, setAvailabilityStatus] = useState(null); // { available: bool, message: string }
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [usernameError, setUsernameError] = useState(null);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState(null);

  useEffect(() => {
    if (isOpen && user?.username) {
      setNewUsername(user.username);
      setAvailabilityStatus(null);
      setUsernameError(null);
      setPasswordError(null);
    }
  }, [isOpen, user]);

  // Live availability check debouncer
  useEffect(() => {
    if (!newUsername || newUsername.trim().length < 3) {
      setAvailabilityStatus(null);
      return;
    }

    if (user?.username && newUsername.trim().toLowerCase() === user.username.toLowerCase()) {
      setAvailabilityStatus({ available: true, message: 'This is your current username', isCurrent: true });
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingAvailability(true);
      try {
        const res = await api.get(`/auth/check-username?username=${encodeURIComponent(newUsername.trim())}`);
        setAvailabilityStatus(res.data);
      } catch (err) {
        setAvailabilityStatus({ available: false, message: 'Unable to check availability' });
      } finally {
        setCheckingAvailability(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [newUsername, user]);

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setUsernamePassword('');
    setUsernameError(null);
    setPasswordError(null);
    setAvailabilityStatus(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleUsernameSubmit = async (e) => {
    e.preventDefault();
    setUsernameError(null);

    const trimmed = (newUsername || '').trim();
    if (trimmed.length < 3) {
      setUsernameError('Username must be at least 3 characters long.');
      return;
    }

    if (user?.username && trimmed.toLowerCase() === user.username.toLowerCase()) {
      setUsernameError('Please enter a different username than your current one.');
      return;
    }

    if (availabilityStatus && !availabilityStatus.available) {
      setUsernameError(availabilityStatus.message || 'Username is not available.');
      return;
    }

    setUsernameLoading(true);
    try {
      const res = await api.post('/auth/change-username', {
        newUsername: trimmed,
        password: usernamePassword || undefined,
      });
      if (updateUsername) {
        updateUsername(trimmed);
      }
      addToast(res.data?.message || 'Username updated successfully!', 'success');
      handleClose();
    } catch (err) {
      const d = err.response?.data?.detail;
      const msg = typeof d === 'string' ? d : d?.message || 'Failed to update username.';
      setUsernameError(msg);
    } finally {
      setUsernameLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError(null);

    if (!newPassword || newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match. Please verify and try again.');
      return;
    }

    setPasswordLoading(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: currentPassword || undefined,
        oldPassword: currentPassword || undefined,
        newPassword,
      });
      addToast('Password updated successfully! Please use your new password next time you log in.', 'success');
      handleClose();
    } catch (err) {
      const d = err.response?.data?.detail;
      const msg = typeof d === 'string' ? d : d?.message || 'Failed to change password. Please check your current password.';
      setPasswordError(msg);
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Account Settings"
      maxWidth="480px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Navigation Tabs */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px',
          background: 'rgba(0, 0, 0, 0.04)',
          padding: '4px',
          borderRadius: '12px',
          border: '1px solid var(--border-light)',
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('username')}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: activeTab === 'username' ? 'var(--bg-surface)' : 'transparent',
              color: activeTab === 'username' ? 'var(--primary)' : 'var(--text-secondary)',
              boxShadow: activeTab === 'username' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <User size={15} />
            <span>Change Username</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('password')}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: activeTab === 'password' ? 'var(--bg-surface)' : 'transparent',
              color: activeTab === 'password' ? 'var(--primary)' : 'var(--text-secondary)',
              boxShadow: activeTab === 'password' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <KeyRound size={15} />
            <span>Change Password</span>
          </button>
        </div>

        {/* Change Username Tab */}
        {activeTab === 'username' && (
          <form onSubmit={handleUsernameSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
              Choose a new username. We will automatically check availability in real time across your event.
            </p>

            {usernameError && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ef4444',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{usernameError}</span>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                New Username
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="form-input"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="Enter new username"
                  autoComplete="off"
                  style={{
                    paddingRight: '36px',
                    borderColor: availabilityStatus
                      ? availabilityStatus.available
                        ? 'rgba(62, 125, 71, 0.5)'
                        : 'rgba(239, 68, 68, 0.5)'
                      : undefined
                  }}
                  required
                />
                <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
                  {checkingAvailability ? (
                    <Loader2 size={16} className="spin-slow" style={{ color: 'var(--text-muted)' }} />
                  ) : availabilityStatus ? (
                    availabilityStatus.available ? (
                      <Check size={16} style={{ color: '#22c55e' }} />
                    ) : (
                      <AlertCircle size={16} style={{ color: '#ef4444' }} />
                    )
                  ) : null}
                </div>
              </div>
              {availabilityStatus && (
                <span
                  style={{
                    display: 'block',
                    marginTop: '4px',
                    fontSize: '0.75rem',
                    color: availabilityStatus.available ? '#22c55e' : '#ef4444',
                    fontWeight: 500,
                  }}
                >
                  {availabilityStatus.message}
                </span>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                Current Password <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(Optional confirmation)</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showUsernamePassword ? 'text' : 'password'}
                  className="form-input"
                  value={usernamePassword}
                  onChange={(e) => setUsernamePassword(e.target.value)}
                  placeholder="Verify with password if required"
                  style={{ paddingRight: '40px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowUsernamePassword(!showUsernamePassword)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    padding: '4px',
                  }}
                >
                  {showUsernamePassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={handleClose}
                disabled={usernameLoading}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={usernameLoading || !newUsername || (availabilityStatus && !availabilityStatus.available)}
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <User size={16} />
                {usernameLoading ? 'Saving...' : 'Update Username'}
              </button>
            </div>
          </form>
        )}

        {/* Change Password Tab */}
        {activeTab === 'password' && (
          <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
              Update your account password. Ensure your new password is secure and at least 6 characters long.
            </p>

            {passwordError && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ef4444',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{passwordError}</span>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                Current Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showCurrent ? 'text' : 'password'}
                  className="form-input"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter your current password"
                  style={{ paddingRight: '40px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    padding: '4px',
                  }}
                >
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                New Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showNew ? 'text' : 'password'}
                  className="form-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  style={{ paddingRight: '40px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    padding: '4px',
                  }}
                >
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                Confirm New Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  className="form-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  style={{ paddingRight: '40px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    padding: '4px',
                  }}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={handleClose}
                disabled={passwordLoading}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={passwordLoading || !newPassword}
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <KeyRound size={16} />
                {passwordLoading ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};

export default ChangePasswordModal;
