import React, { useState, useEffect } from 'react';
import { UserPlus, Trash2, Edit3, Search, AlertCircle, Shield, Check } from 'lucide-react';
import api from '../../services/api';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import Skeleton from '../../components/Skeleton';
import { useToast } from '../../contexts/ToastContext';

export const MembersPanel = ({ role, features }) => {
  const { addToast } = useToast();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add person modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [peopleList, setPeopleList] = useState([]);
  const [podsList, setPodsList] = useState([]);
  const [panelsList, setPanelsList] = useState([]);
  const [selectedVolunteerId, setSelectedVolunteerId] = useState('');
  const [personSearch, setPersonSearch] = useState('');
  const [scopeMode, setScopeMode] = useState('all');
  const [selectedScopeIds, setSelectedScopeIds] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [inlineError, setInlineError] = useState(null);

  // Edit scope modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);

  // Remove confirmation state
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState(null);

  const fetchMembers = async () => {
    if (!role?.id) return;
    setLoading(true);
    setInlineError(null);
    try {
      const res = await api.get(`/admin/rbac/roles/${role.id}/members`);
      setMembers(res.data);
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to fetch members', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [role?.id]);

  const openAddModal = async () => {
    setInlineError(null);
    setSelectedVolunteerId('');
    setPersonSearch('');
    setScopeMode('all');
    setSelectedScopeIds([]);
    setAddModalOpen(true);

    try {
      const [volRes, podsRes, panelsRes] = await Promise.all([
        api.get('/admin/volunteers'),
        api.get('/admin/pods'),
        api.get('/admin/panels'),
      ]);
      // Only people who have logins
      const withLogin = (volRes.data?.volunteers || volRes.data || []).filter(
        (v) => v.hasLogin
      );
      setPeopleList(withLogin);
      setPodsList(podsRes.data?.pods || podsRes.data || []);
      setPanelsList(panelsRes.data?.panels || panelsRes.data || []);
    } catch (err) {
      addToast('Failed to load people or resource pools', 'error');
    }
  };

  const handleAddMember = async () => {
    if (!selectedVolunteerId) {
      setInlineError('Please select a person to assign');
      return;
    }
    setActionLoading(true);
    setInlineError(null);

    const scopePayload = {
      teams: {
        mode: scopeMode,
        ids: scopeMode === 'all' ? [] : selectedScopeIds,
      },
    };

    try {
      await api.post(`/admin/rbac/roles/${role.id}/members`, {
        volunteerId: selectedVolunteerId,
        scope: scopePayload,
      });
      addToast('Member assigned successfully', 'success');
      setAddModalOpen(false);
      fetchMembers();
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to assign role to person';
      setInlineError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setActionLoading(false);
    }
  };

  const openEditScopeModal = async (member) => {
    setEditingMember(member);
    const currScope = member.scope?.teams || member.scope || {};
    setScopeMode(currScope.mode || 'all');
    setSelectedScopeIds(currScope.ids || []);
    setInlineError(null);
    setEditModalOpen(true);

    if (podsList.length === 0 || panelsList.length === 0) {
      try {
        const [podsRes, panelsRes] = await Promise.all([
          api.get('/admin/pods'),
          api.get('/admin/panels'),
        ]);
        setPodsList(podsRes.data?.pods || podsRes.data || []);
        setPanelsList(panelsRes.data?.panels || panelsRes.data || []);
      } catch (err) {
        // silent
      }
    }
  };

  const handleUpdateScope = async () => {
    if (!editingMember) return;
    setActionLoading(true);
    setInlineError(null);

    const scopePayload = {
      teams: {
        mode: scopeMode,
        ids: scopeMode === 'all' ? [] : selectedScopeIds,
      },
    };

    try {
      await api.put(`/admin/rbac/roles/${role.id}/members/${editingMember.userId}`, {
        scope: scopePayload,
      });
      addToast('Member scope updated', 'success');
      setEditModalOpen(false);
      setEditingMember(null);
      fetchMembers();
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to update member scope';
      setInlineError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmRemove = async () => {
    if (!memberToRemove) return;
    setActionLoading(true);
    setInlineError(null);

    try {
      await api.delete(`/admin/rbac/roles/${role.id}/members/${memberToRemove.userId}`);
      addToast('Member removed from role', 'success');
      setConfirmRemoveOpen(false);
      setMemberToRemove(null);
      fetchMembers();
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to remove member from role';
      setInlineError(typeof detail === 'string' ? detail : JSON.stringify(detail));
      setConfirmRemoveOpen(false);
    } finally {
      setActionLoading(false);
    }
  };

  const filteredPeople = peopleList.filter((p) => {
    const q = personSearch.toLowerCase();
    const alreadyAssigned = members.some((m) => m.volunteerId === p.id);
    return (
      !alreadyAssigned &&
      (p.name?.toLowerCase().includes(q) || p.username?.toLowerCase().includes(q))
    );
  });

  const renderScopeChip = (scope) => {
    const s = scope?.teams || scope || {};
    const mode = s.mode || 'all';
    if (mode === 'all') {
      return (
        <span
          className="status-badge"
          style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', fontSize: '0.75rem', fontWeight: 600 }}
        >
          All teams
        </span>
      );
    }
    if (mode === 'pods') {
      return (
        <span
          className="status-badge"
          style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6', fontSize: '0.75rem', fontWeight: 600 }}
        >
          {s.ids?.length || 0} POD(s)
        </span>
      );
    }
    if (mode === 'panels') {
      return (
        <span
          className="status-badge"
          style={{ background: 'rgba(168, 85, 247, 0.12)', color: '#a855f7', fontSize: '0.75rem', fontWeight: 600 }}
        >
          {s.ids?.length || 0} Panel(s)
        </span>
      );
    }
    return <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Custom</span>
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Assigned Members</h4>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
            People currently assigned to this role and their team access scope.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
        >
          <UserPlus size={16} />
          Add Person
        </button>
      </div>

      {inlineError && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            color: '#ef4444',
            fontSize: '0.85rem',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertCircle size={16} />
          <span>{inlineError}</span>
        </div>
      )}

      {loading ? (
        <Skeleton count={3} />
      ) : members.length === 0 ? (
        <div
          style={{
            padding: '30px',
            textAlign: 'center',
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: '8px',
            border: '1px dashed var(--border-color, rgba(255, 255, 255, 0.1))',
            color: 'var(--text-secondary)',
          }}
        >
          No members assigned to this role yet. Click <strong>Add Person</strong> to assign someone with a scope.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {members.map((m) => (
            <div
              key={m.userId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: '8px',
                background: 'var(--bg-card, rgba(255, 255, 255, 0.02))',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.06))',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{m.name}</span>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {m.type || 'STAFF'}
                  </span>
                </div>
                <div style={{ marginTop: '4px' }}>{renderScopeChip(m.scope)}</div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => openEditScopeModal(m)}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Edit3 size={14} />
                  Edit Scope
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInlineError(null);
                    setMemberToRemove(m);
                    setConfirmRemoveOpen(true);
                  }}
                  className="btn btn-secondary"
                  style={{ padding: '6px 10px', color: '#ef4444' }}
                  title="Remove from role"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Person Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Assign Person to Role"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="form-label">Search Person with Login Account</label>
            <div style={{ position: 'relative', marginTop: '4px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search by name or username..."
                className="form-input"
                style={{ paddingLeft: '36px', width: '100%' }}
                value={personSearch}
                onChange={(e) => setPersonSearch(e.target.value)}
              />
            </div>
          </div>

          <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px' }}>
            {filteredPeople.length === 0 ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>
                No unassigned people with login accounts found.
              </div>
            ) : (
              filteredPeople.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedVolunteerId(p.id)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: selectedVolunteerId === p.id ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                    border: selectedVolunteerId === p.id ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid transparent',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{p.name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '8px' }}>({p.username})</span>
                  </div>
                  {selectedVolunteerId === p.id && <Check size={16} color="var(--primary)" />}
                </div>
              ))
            )}
          </div>

          <div>
            <label className="form-label">Team Scope</label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn ${scopeMode === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.82rem', padding: '6px 12px' }}
                onClick={() => {
                  setScopeMode('all');
                  setSelectedScopeIds([]);
                }}
              >
                All Teams
              </button>
              {features?.pods !== false && (
                <button
                  type="button"
                  className={`btn ${scopeMode === 'pods' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.82rem', padding: '6px 12px' }}
                  onClick={() => {
                    setScopeMode('pods');
                    setSelectedScopeIds([]);
                  }}
                >
                  Specific PODs
                </button>
              )}
              <button
                type="button"
                className={`btn ${scopeMode === 'panels' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.82rem', padding: '6px 12px' }}
                onClick={() => {
                  setScopeMode('panels');
                  setSelectedScopeIds([]);
                }}
              >
                Specific Panels
              </button>
            </div>
          </div>

          {/* Scope Multi-Select Picker */}
          {scopeMode === 'pods' && (
            <div>
              <label className="form-label">Select PODs</label>
              <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                {podsList.map((pod) => {
                  const isChecked = selectedScopeIds.includes(pod.id);
                  return (
                    <label key={pod.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setSelectedScopeIds((prev) =>
                            isChecked ? prev.filter((id) => id !== pod.id) : [...prev, pod.id]
                          );
                        }}
                      />
                      <span>{pod.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {scopeMode === 'panels' && (
            <div>
              <label className="form-label">Select Panels</label>
              <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                {panelsList.map((panel) => {
                  const isChecked = selectedScopeIds.includes(panel.id);
                  return (
                    <label key={panel.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setSelectedScopeIds((prev) =>
                            isChecked ? prev.filter((id) => id !== panel.id) : [...prev, panel.id]
                          );
                        }}
                      />
                      <span>{panel.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setAddModalOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={actionLoading || !selectedVolunteerId}
              onClick={handleAddMember}
            >
              {actionLoading ? 'Assigning...' : 'Assign Role'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Scope Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={`Edit Scope for ${editingMember?.name || 'Member'}`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="form-label">Team Scope</label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn ${scopeMode === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.82rem', padding: '6px 12px' }}
                onClick={() => {
                  setScopeMode('all');
                  setSelectedScopeIds([]);
                }}
              >
                All Teams
              </button>
              {features?.pods !== false && (
                <button
                  type="button"
                  className={`btn ${scopeMode === 'pods' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.82rem', padding: '6px 12px' }}
                  onClick={() => {
                    setScopeMode('pods');
                    setSelectedScopeIds([]);
                  }}
                >
                  Specific PODs
                </button>
              )}
              <button
                type="button"
                className={`btn ${scopeMode === 'panels' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.82rem', padding: '6px 12px' }}
                onClick={() => {
                  setScopeMode('panels');
                  setSelectedScopeIds([]);
                }}
              >
                Specific Panels
              </button>
            </div>
          </div>

          {scopeMode === 'pods' && (
            <div>
              <label className="form-label">Select PODs</label>
              <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                {podsList.map((pod) => {
                  const isChecked = selectedScopeIds.includes(pod.id);
                  return (
                    <label key={pod.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setSelectedScopeIds((prev) =>
                            isChecked ? prev.filter((id) => id !== pod.id) : [...prev, pod.id]
                          );
                        }}
                      />
                      <span>{pod.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {scopeMode === 'panels' && (
            <div>
              <label className="form-label">Select Panels</label>
              <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                {panelsList.map((panel) => {
                  const isChecked = selectedScopeIds.includes(panel.id);
                  return (
                    <label key={panel.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setSelectedScopeIds((prev) =>
                            isChecked ? prev.filter((id) => id !== panel.id) : [...prev, panel.id]
                          );
                        }}
                      />
                      <span>{panel.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setEditModalOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={actionLoading}
              onClick={handleUpdateScope}
            >
              {actionLoading ? 'Saving...' : 'Update Scope'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Remove Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmRemoveOpen}
        title="Remove Member from Role"
        message={`Are you sure you want to remove ${memberToRemove?.name || 'this member'} from role '${role.name}'?${
          (memberToRemove?.roleCount === 1 || memberToRemove?.roles?.length === 1)
            ? ' This is their only role. They will be able to log in but will see no access until you assign another role.'
            : ''
        }`}
        onConfirm={handleConfirmRemove}
        onCancel={() => {
          setConfirmRemoveOpen(false);
          setMemberToRemove(null);
        }}
        confirmText={actionLoading ? 'Removing...' : 'Remove Member'}
      />
    </div>
  );
};

export default MembersPanel;
