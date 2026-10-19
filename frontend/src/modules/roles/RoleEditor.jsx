import React, { useState, useEffect, useMemo } from 'react';
import {
  Save,
  Trash2,
  Bookmark,
  X,
  AlertTriangle,
  ShieldCheck,
  Check,
  Users,
  Eye,
  KeyRound,
} from 'lucide-react';
import api from '../../services/api';
import PermissionGroups from './PermissionGroups';
import MembersPanel from './MembersPanel';
import ViewAsRole from './ViewAsRole';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useToast } from '../../contexts/ToastContext';

export const RoleEditor = ({
  role,
  catalog,
  features,
  onSaved,
  onDeleted,
  onClose,
  onTemplateCreated,
}) => {
  const { addToast } = useToast();
  const isNew = !role?.id;
  const isSystem = Boolean(role?.isSystem);

  const [activeTab, setActiveTab] = useState('permissions'); // permissions | members | viewAs
  const [name, setName] = useState(role?.name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [selectedPermissions, setSelectedPermissions] = useState(role?.permissions || []);
  const [confirmSensitive, setConfirmSensitive] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Template modal state
  const [saveTemplateDialogOpen, setSaveTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateLoading, setTemplateLoading] = useState(false);

  // Delete modal state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Map of permission key -> Permission object
  const permMap = useMemo(() => {
    const map = {};
    if (catalog?.permissions) {
      for (const p of catalog.permissions) {
        map[p.key] = p;
      }
    }
    return map;
  }, [catalog]);

  const sensitiveSelected = useMemo(() => {
    return selectedPermissions.filter((k) => permMap[k]?.tier === 'sensitive');
  }, [selectedPermissions, permMap]);

  useEffect(() => {
    setName(role?.name || '');
    setDescription(role?.description || '');
    const perms = role?.permissions || [];
    setSelectedPermissions(perms);
    // If existing role already has sensitive permissions, default to confirmed
    const hasSensitive = perms.some((k) => permMap[k]?.tier === 'sensitive');
    setConfirmSensitive(hasSensitive);
    setErrorMessage(null);
    setActiveTab('permissions');
  }, [role, permMap]);

  // Compute effective permissions closure
  const effectivePermissions = useMemo(() => {
    const effective = new Set(selectedPermissions);
    const stack = [...selectedPermissions];
    while (stack.length > 0) {
      const k = stack.pop();
      const meta = permMap[k];
      if (meta && Array.isArray(meta.implies)) {
        for (const imp of meta.implies) {
          if (!effective.has(imp)) {
            effective.add(imp);
            stack.push(imp);
          }
        }
      }
    }
    return effective;
  }, [selectedPermissions, permMap]);

  const handleSave = async () => {
    setSaving(true);
    setErrorMessage(null);

    let willConfirm = confirmSensitive;
    if (sensitiveSelected.length > 0 && !confirmSensitive) {
      const ok = window.confirm(
        `This role includes sensitive permissions (${sensitiveSelected.join(', ')}). Do you confirm granting these elevated permissions?`
      );
      if (!ok) {
        setSaving(false);
        return;
      }
      willConfirm = true;
      setConfirmSensitive(true);
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      permissions: selectedPermissions,
      confirmSensitive: willConfirm,
    };

    try {
      let res;
      if (isNew) {
        res = await api.post('/admin/rbac/roles', payload);
        addToast('Role created successfully', 'success');
      } else {
        res = await api.put(`/admin/rbac/roles/${role.id}`, payload);
        addToast('Role updated successfully', 'success');
      }
      onSaved(res.data);
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to save role';
      const msg = typeof detail === 'string' ? detail : JSON.stringify(detail);
      setErrorMessage(msg);
      addToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!role?.id) return;
    setTemplateLoading(true);
    try {
      const res = await api.post('/admin/rbac/templates/from-role', {
        roleId: role.id,
        name: templateName.trim() || undefined,
      });
      addToast('Saved as org template', 'success');
      setSaveTemplateDialogOpen(false);
      if (onTemplateCreated) onTemplateCreated(res.data);
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to save template';
      addToast(typeof detail === 'string' ? detail : JSON.stringify(detail), 'error');
    } finally {
      setTemplateLoading(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!role?.id) return;
    setDeleteLoading(true);
    setErrorMessage(null);
    try {
      await api.delete(`/admin/rbac/roles/${role.id}`);
      addToast('Role deleted successfully', 'success');
      setDeleteDialogOpen(false);
      onDeleted(role.id);
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to delete role';
      const msg = typeof detail === 'string' ? detail : JSON.stringify(detail);
      setErrorMessage(msg);
      addToast(msg, 'error');
      setDeleteDialogOpen(false);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '520px',
        background: 'var(--bg-card, rgba(255, 255, 255, 0.02))',
        borderRadius: '12px',
        border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
        padding: '20px',
      }}
    >
      {/* Editor Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          paddingBottom: '16px',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
              {isNew ? 'Create New Role' : role.name}
            </h3>
            {isSystem && (
              <span
                className="status-badge"
                style={{ background: 'rgba(99, 102, 241, 0.15)', color: 'var(--primary)', fontSize: '0.72rem', fontWeight: 700 }}
              >
                SYSTEM ROLE
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            {isSystem
              ? 'Permissions can be customized. System roles cannot be renamed or deleted.'
              : 'Configure name, permissions, and members for this custom role.'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {!isNew && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setTemplateName(role.name);
                setSaveTemplateDialogOpen(true);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '6px 12px' }}
            >
              <Bookmark size={15} />
              Save as Template
            </button>
          )}

          {!isNew && !isSystem && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDeleteDialogOpen(true)}
              style={{ color: '#ef4444', padding: '6px 10px' }}
              title="Delete Role"
            >
              <Trash2 size={16} />
            </button>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
          >
            <Save size={16} />
            {saving ? 'Saving...' : isNew ? 'Create Role' : 'Save Changes'}
          </button>

          {onClose && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ padding: '6px 10px' }}
              title="Close"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {errorMessage && (
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
          <AlertTriangle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Role Details Inputs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '18px' }}>
        <div>
          <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Role Name</label>
          <input
            type="text"
            className="form-input"
            value={name}
            disabled={isSystem}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Stage Coordinator, Verification Officer"
            style={{ width: '100%', marginTop: '4px', opacity: isSystem ? 0.7 : 1 }}
          />
          {isSystem && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
              System role names are immutable.
            </span>
          )}
        </div>

        <div>
          <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Description</label>
          <input
            type="text"
            className="form-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of responsibilities"
            style={{ width: '100%', marginTop: '4px' }}
          />
        </div>
      </div>

      {/* Editor Sub-Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          marginBottom: '16px',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('permissions')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'permissions' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'permissions' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: '0.88rem',
            padding: '8px 14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <KeyRound size={15} />
          Permissions
        </button>

        {!isNew && (
          <button
            type="button"
            onClick={() => setActiveTab('members')}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'members' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'members' ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '0.88rem',
              padding: '8px 14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Users size={15} />
            Members ({role.memberCount || 0})
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveTab('viewAs')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'viewAs' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'viewAs' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: '0.88rem',
            padding: '8px 14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Eye size={15} />
          View As Role
        </button>
      </div>

      {/* Tab Panels */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'permissions' && (
          <PermissionGroups
            catalog={catalog}
            selectedPermissions={selectedPermissions}
            onChangeSelected={setSelectedPermissions}
            confirmSensitive={confirmSensitive}
            onSetConfirmSensitive={setConfirmSensitive}
          />
        )}

        {activeTab === 'members' && !isNew && (
          <MembersPanel role={role} features={features} />
        )}

        {activeTab === 'viewAs' && (
          <ViewAsRole effectivePermissions={effectivePermissions} />
        )}
      </div>

      {/* Save Template Dialog */}
      <ConfirmDialog
        isOpen={saveTemplateDialogOpen}
        title="Save as Organization Template"
        message="Create a reusable organization-level role template from these permissions? The template will be detached and later edits will not affect each other."
        onConfirm={handleSaveAsTemplate}
        onCancel={() => setSaveTemplateDialogOpen(false)}
        confirmText={templateLoading ? 'Saving...' : 'Save Template'}
      />

      {/* Delete Role Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        title="Delete Role"
        message={`Are you sure you want to permanently delete role '${role?.name}'? Roles with active members cannot be deleted.`}
        onConfirm={handleDeleteRole}
        onCancel={() => setDeleteDialogOpen(false)}
        confirmText={deleteLoading ? 'Deleting...' : 'Delete Role'}
      />
    </div>
  );
};

export default RoleEditor;
