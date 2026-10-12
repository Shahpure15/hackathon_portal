import React, { useState, useEffect } from 'react';
import { Send, CheckCircle2, Clock, AlertCircle, Edit2, Check, X, RefreshCw, UserCheck, Plus } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../../components/Modal';

export default function StaffInvitations() {
  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingEmailId, setEditingEmailId] = useState(null);
  const [emailValue, setEmailValue] = useState('');
  const [invitingId, setInvitingId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingStaff, setAddingStaff] = useState(false);
  const [newStaffData, setNewStaffData] = useState({
    name: '',
    type: 'JUDGE',
    email: '',
    contact: '',
  });

  const { addToast } = useToast();

  const fetchData = async () => {
    try {
      setLoading(true);
      const [staffRes, rolesRes] = await Promise.all([
        api.get('/admin/staff/access'),
        api.get('/admin/rbac/roles'),
      ]);
      setStaff(staffRes.data);
      setRoles(rolesRes.data);
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to load staff list', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveEmail = async (volunteerId) => {
    try {
      await api.put(`/admin/staff/${volunteerId}/email`, { email: emailValue });
      addToast('Email updated successfully', 'success');
      setEditingEmailId(null);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to update email', 'error');
    }
  };

  const handleInvite = async (volunteerId, isResend = false, force = false) => {
    setInvitingId(volunteerId);
    try {
      const endpoint = isResend
        ? `/admin/staff/${volunteerId}/invite/resend`
        : `/admin/staff/${volunteerId}/invite`;
      await api.post(endpoint, { force });
      addToast(isResend ? 'Invitation resent!' : 'Invitation email queued for delivery!', 'success');
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to send invitation', 'error');
    } finally {
      setInvitingId(null);
    }
  };

  const handleAddStaff = async (e) => {
    e.preventDefault();
    setAddingStaff(true);
    try {
      const res = await api.post('/admin/volunteers', {
        name: newStaffData.name,
        type: newStaffData.type,
        contact: newStaffData.contact || 'Not Provided',
        generateLogin: false,
      });
      const volId = res.data.id;
      if (newStaffData.email) {
        await api.put(`/admin/staff/${volId}/email`, { email: newStaffData.email });
        await api.post(`/admin/staff/${volId}/invite`, { force: true });
        addToast(`Added ${newStaffData.name} and sent invite email!`, 'success');
      } else {
        addToast(`Added ${newStaffData.name}!`, 'success');
      }
      setShowAddModal(false);
      setNewStaffData({ name: '', type: 'JUDGE', email: '', contact: '' });
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to create staff member', 'error');
    } finally {
      setAddingStaff(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Staff & Judge Invitations</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Send email invitations with secure single-use activation links to event staff, judges, and volunteers.
          </p>
        </div>
        <button
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          onClick={() => setShowAddModal(true)}
        >
          <Plus size={16} />
          Add Staff Member
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading staff directory...
        </div>
      ) : staff.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
          No staff members found. Add volunteers or judges first in People & Organizers.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-surface)', borderRadius: '10px', border: '1px solid var(--border-color)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-main)' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Name</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Type</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Email Address</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Assigned Role(s)</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                const isEditing = editingEmailId === s.volunteerId;
                const isInviting = invitingId === s.volunteerId;

                return (
                  <tr key={s.volunteerId} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                      {s.name}
                      {s.username && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 400 }}>
                          Username: {s.username}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: s.type === 'JUDGE' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                          color: s.type === 'JUDGE' ? '#a855f7' : '#3b82f6',
                        }}
                      >
                        {s.type}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="email"
                            className="input-field"
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                            value={emailValue}
                            onChange={(e) => setEmailValue(e.target.value)}
                            placeholder="email@domain.com"
                          />
                          <button
                            className="btn btn-primary"
                            style={{ padding: '4px 8px' }}
                            onClick={() => handleSaveEmail(s.volunteerId)}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px' }}
                            onClick={() => setEditingEmailId(null)}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{s.email || <em style={{ color: 'var(--text-secondary)' }}>No email</em>}</span>
                          <button
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}
                            onClick={() => {
                              setEditingEmailId(s.volunteerId);
                              setEmailValue(s.email || '');
                            }}
                            title="Edit Email"
                          >
                            <Edit2 size={13} />
                          </button>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {s.status === 'active' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#16a34a', fontSize: '12px', fontWeight: 600 }}>
                          <CheckCircle2 size={14} /> Active
                        </span>
                      ) : s.status === 'invited' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#d97706', fontSize: '12px', fontWeight: 600 }}>
                          <Clock size={14} /> Invited
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                          None
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {s.roleNames && s.roleNames.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {s.roleNames.map((r, i) => (
                            <span key={i} style={{ padding: '1px 6px', borderRadius: '4px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', fontSize: '11px' }}>
                              {r}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Auto (Judge/Volunteer)</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      {s.status === 'active' ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Active</span>
                          {s.email ? (
                            <button
                              className="btn btn-secondary"
                              style={{ fontSize: '12px', padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              onClick={() => handleInvite(s.volunteerId, false, true)}
                              disabled={isInviting}
                              title="Send an email invite / activation link to this address"
                            >
                              <Send size={12} />
                              {isInviting ? 'Sending...' : 'Send Invite'}
                            </button>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic' }}>Add email to invite</span>
                          )}
                        </div>
                      ) : s.status === 'invited' ? (
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: '12px', padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => handleInvite(s.volunteerId, true)}
                          disabled={isInviting || !s.email}
                        >
                          <RefreshCw size={12} className={isInviting ? 'spin' : ''} />
                          {isInviting ? 'Resending...' : 'Resend Invite'}
                        </button>
                      ) : (
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: '12px', padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => handleInvite(s.volunteerId, false)}
                          disabled={isInviting || !s.email}
                        >
                          <Send size={12} />
                          {isInviting ? 'Sending...' : 'Invite by Email'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Staff Member Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Staff Member / Judge"
        maxWidth="480px"
      >
        <form onSubmit={handleAddStaff}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>Full Name</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Dr. Alex Mercer"
              value={newStaffData.name}
              onChange={(e) => setNewStaffData({ ...newStaffData, name: e.target.value })}
              required
              autoFocus
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>Role Type</label>
            <select
              className="form-input"
              value={newStaffData.type}
              onChange={(e) => setNewStaffData({ ...newStaffData, type: e.target.value })}
            >
              <option value="JUDGE">Judge / Evaluator</option>
              <option value="VOLUNTEER">Volunteer / Organizer</option>
            </select>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>Email Address</label>
            <input
              type="email"
              className="form-input"
              placeholder="e.g. alex@university.edu"
              value={newStaffData.email}
              onChange={(e) => setNewStaffData({ ...newStaffData, email: e.target.value })}
              required
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>Phone / Contact (Optional)</label>
            <input
              type="text"
              className="form-input"
              placeholder="+91 98765 43210"
              value={newStaffData.contact}
              onChange={(e) => setNewStaffData({ ...newStaffData, contact: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowAddModal(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={addingStaff}
            >
              {addingStaff ? 'Adding & Inviting...' : 'Add & Send Invite'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
