import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Plus,
  Copy,
  Bookmark,
  Users,
  KeyRound,
  Trash2,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import api from '../../services/api';
import FeaturesCard from './FeaturesCard';
import RoleEditor from './RoleEditor';
import Modal from '../../components/Modal';
import Skeleton from '../../components/Skeleton';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useToast } from '../../contexts/ToastContext';

export const RolesModule = () => {
  const { addToast } = useToast();

  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [features, setFeatures] = useState({ pods: true, evaluation: true });
  const [loading, setLoading] = useState(true);

  // Selected role for editor
  const [selectedRole, setSelectedRole] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);

  // New role dialog state
  const [newRoleModalOpen, setNewRoleModalOpen] = useState(false);
  const [newRoleMode, setNewRoleMode] = useState('blank'); // blank | copy | template
  const [copySourceRoleId, setCopySourceRoleId] = useState('');
  const [templateSourceId, setTemplateSourceId] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [creatingFromTemplate, setCreatingFromTemplate] = useState(false);

  // Templates manager modal state
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState(null);
  const [deleteTemplateConfirmOpen, setDeleteTemplateConfirmOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rolesRes, catalogRes, templatesRes, featuresRes] = await Promise.all([
        api.get('/admin/rbac/roles'),
        api.get('/admin/rbac/catalog'),
        api.get('/admin/rbac/templates'),
        api.get('/admin/config/features'),
      ]);
      setRoles(rolesRes.data || []);
      setCatalog(catalogRes.data || null);
      setTemplates(templatesRes.data || []);
      setFeatures(featuresRes.data || { pods: true, evaluation: true });
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to load roles data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenBlankRole = () => {
    setSelectedRole({
      name: '',
      description: '',
      permissions: [],
      isSystem: false,
    });
    setEditorOpen(true);
    setNewRoleModalOpen(false);
  };

  const handleOpenCopyRole = () => {
    const src = roles.find((r) => r.id === copySourceRoleId);
    if (!src) return;
    setSelectedRole({
      name: `${src.name} (Copy)`,
      description: src.description,
      permissions: [...(src.permissions || [])],
      isSystem: false,
    });
    setEditorOpen(true);
    setNewRoleModalOpen(false);
  };

  const handleCreateFromTemplate = async () => {
    if (!templateSourceId) return;
    setCreatingFromTemplate(true);
    try {
      const res = await api.post('/admin/rbac/roles/from-template', {
        templateId: templateSourceId,
        name: newRoleName.trim() || undefined,
      });
      addToast('Role created from template', 'success');
      setNewRoleModalOpen(false);
      await fetchData();
      setSelectedRole(res.data);
      setEditorOpen(true);
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to create role from template';
      addToast(typeof detail === 'string' ? detail : JSON.stringify(detail), 'error');
    } finally {
      setCreatingFromTemplate(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!templateToDelete) return;
    try {
      await api.delete(`/admin/rbac/templates/${templateToDelete.id}`);
      addToast('Template deleted', 'success');
      setDeleteTemplateConfirmOpen(false);
      setTemplateToDelete(null);
      const res = await api.get('/admin/rbac/templates');
      setTemplates(res.data || []);
    } catch (err) {
      addToast('Failed to delete template', 'error');
    }
  };

  const handleRoleSaved = (savedRole) => {
    fetchData();
    setSelectedRole(savedRole);
  };

  const handleRoleDeleted = (deletedRoleId) => {
    fetchData();
    setSelectedRole(null);
    setEditorOpen(false);
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Module Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldCheck size={28} color="var(--primary)" />
            Roles & Access <span className="font-accent">Control</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Fine-grained RBAC permissions, organization templates, member scopes, and event feature flags.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setTemplatesModalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
          >
            <Bookmark size={16} />
            Org Templates ({templates.length})
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setNewRoleMode('blank');
              setCopySourceRoleId(roles[0]?.id || '');
              setTemplateSourceId(templates[0]?.id || '');
              setNewRoleName('');
              setNewRoleModalOpen(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
          >
            <Plus size={16} />
            New Role
          </button>
        </div>
      </div>

      {/* Event Features Card */}
      <FeaturesCard
        features={features}
        onUpdateFeatures={(updatedFeats) => setFeatures(updatedFeats)}
      />

      {/* Main 2-Column or Stack Layout */}
      {loading ? (
        <Skeleton count={6} />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: editorOpen ? 'minmax(300px, 380px) 1fr' : '1fr',
            gap: '24px',
            alignItems: 'start',
          }}
        >
          {/* Roles Cards Grid / List */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                Event Roles ({roles.length})
              </h3>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: editorOpen ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '14px',
              }}
            >
              {roles.map((r) => {
                const isSelected = selectedRole?.id === r.id && editorOpen;
                return (
                  <div
                    key={r.id}
                    onClick={() => {
                      setSelectedRole(r);
                      setEditorOpen(true);
                    }}
                    className="glass-panel"
                    style={{
                      padding: '16px 18px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      border: isSelected
                        ? '1px solid var(--primary)'
                        : '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                      background: isSelected
                        ? 'rgba(99, 102, 241, 0.08)'
                        : 'var(--bg-card, rgba(255, 255, 255, 0.02))',
                      transition: 'all 0.15s ease',
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                          {r.name}
                        </span>
                        {r.isSystem && (
                          <span
                            className="status-badge"
                            style={{ background: 'rgba(99, 102, 241, 0.15)', color: 'var(--primary)', fontSize: '0.68rem', fontWeight: 700 }}
                          >
                            SYSTEM
                          </span>
                        )}
                      </div>
                      <ChevronRight size={16} color="var(--text-muted)" />
                    </div>

                    {r.description && (
                      <p
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--text-secondary)',
                          margin: '0 0 12px 0',
                          lineHeight: '1.3',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {r.description}
                      </p>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '10px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <KeyRound size={13} color="var(--primary)" />
                        <strong>{r.expandedCount || (r.permissions?.length || 0)}</strong> permissions
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Users size={13} color="var(--text-secondary)" />
                        <strong>{r.memberCount || 0}</strong> member(s)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Role Editor Pane */}
          {editorOpen && (
            <div
              style={{
                position: window.innerWidth <= 768 ? 'fixed' : 'relative',
                top: window.innerWidth <= 768 ? 0 : 'auto',
                left: window.innerWidth <= 768 ? 0 : 'auto',
                width: window.innerWidth <= 768 ? '100%' : 'auto',
                height: window.innerWidth <= 768 ? '100%' : 'auto',
                zIndex: window.innerWidth <= 768 ? 9999 : 1,
                background: 'var(--bg-main)',
                overflowY: 'auto',
              }}
            >
              <RoleEditor
                role={selectedRole}
                catalog={catalog}
                features={features}
                onSaved={handleRoleSaved}
                onDeleted={handleRoleDeleted}
                onClose={() => {
                  setEditorOpen(false);
                  setSelectedRole(null);
                }}
                onTemplateCreated={(newTpl) => {
                  setTemplates((prev) => [...prev, newTpl]);
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* New Role Creation Modal */}
      <Modal
        isOpen={newRoleModalOpen}
        onClose={() => setNewRoleModalOpen(false)}
        title="Create New Role"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <label className="form-label">How would you like to create this role?</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '6px' }}>
              <button
                type="button"
                className={`btn ${newRoleMode === 'blank' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.82rem', padding: '8px 10px' }}
                onClick={() => setNewRoleMode('blank')}
              >
                Blank Role
              </button>
              <button
                type="button"
                className={`btn ${newRoleMode === 'copy' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.82rem', padding: '8px 10px' }}
                onClick={() => setNewRoleMode('copy')}
              >
                Copy Existing
              </button>
              <button
                type="button"
                className={`btn ${newRoleMode === 'template' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.82rem', padding: '8px 10px' }}
                onClick={() => setNewRoleMode('template')}
              >
                From Template
              </button>
            </div>
          </div>

          {newRoleMode === 'blank' && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
              Start with a blank role and select permissions manually.
            </p>
          )}

          {newRoleMode === 'copy' && (
            <div>
              <label className="form-label">Source Role to Copy</label>
              <select
                className="form-input"
                style={{ width: '100%', marginTop: '4px' }}
                value={copySourceRoleId}
                onChange={(e) => setCopySourceRoleId(e.target.value)}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.permissions?.length || 0} permissions)
                  </option>
                ))}
              </select>
            </div>
          )}

          {newRoleMode === 'template' && (
            <div>
              <label className="form-label">Organization Template</label>
              {templates.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '6px 0 0 0' }}>
                  No organization templates saved yet.
                </p>
              ) : (
                <>
                  <select
                    className="form-input"
                    style={{ width: '100%', marginTop: '4px' }}
                    value={templateSourceId}
                    onChange={(e) => setTemplateSourceId(e.target.value)}
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.permissions?.length || 0} permissions)
                      </option>
                    ))}
                  </select>
                  <div style={{ marginTop: '12px' }}>
                    <label className="form-label">Role Name (Optional)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Leave blank to use template name"
                      style={{ width: '100%', marginTop: '4px' }}
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setNewRoleModalOpen(false)}>
              Cancel
            </button>
            {newRoleMode === 'blank' && (
              <button type="button" className="btn btn-primary" onClick={handleOpenBlankRole}>
                Continue to Editor
              </button>
            )}
            {newRoleMode === 'copy' && (
              <button type="button" className="btn btn-primary" onClick={handleOpenCopyRole}>
                Copy into Editor
              </button>
            )}
            {newRoleMode === 'template' && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={creatingFromTemplate || templates.length === 0}
                onClick={handleCreateFromTemplate}
              >
                {creatingFromTemplate ? 'Creating...' : 'Instantiate Role'}
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* Organization Templates Library Modal */}
      <Modal
        isOpen={templatesModalOpen}
        onClose={() => setTemplatesModalOpen(false)}
        title="Organization Role Templates"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
            Reusable role presets saved across events in your organization.
          </p>

          {templates.length === 0 ? (
            <div
              style={{
                padding: '24px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                borderRadius: '8px',
                border: '1px dashed var(--border-color)',
              }}
            >
              No templates saved yet. Open any role and click <strong>Save as Template</strong>.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
              {templates.map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'var(--bg-card, rgba(255,255,255,0.02))',
                    border: '1px solid var(--border-color, rgba(255,255,255,0.06))',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{t.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {t.permissions?.length || 0} permissions · {t.description || 'No description'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ color: '#ef4444', padding: '6px 8px' }}
                    onClick={() => {
                      setTemplateToDelete(t);
                      setDeleteTemplateConfirmOpen(true);
                    }}
                    title="Delete Template"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setTemplatesModalOpen(false)}>
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Template Confirm Dialog */}
      <ConfirmDialog
        isOpen={deleteTemplateConfirmOpen}
        title="Delete Template"
        message={`Delete template '${templateToDelete?.name}'? Roles created from this template will not be affected.`}
        onConfirm={handleDeleteTemplate}
        onCancel={() => {
          setDeleteTemplateConfirmOpen(false);
          setTemplateToDelete(null);
        }}
        confirmText="Delete Template"
      />
    </div>
  );
};

export default RolesModule;
