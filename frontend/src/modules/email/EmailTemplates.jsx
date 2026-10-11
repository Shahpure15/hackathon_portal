import React, { useState, useEffect } from 'react';
import { FileText, RotateCcw, Eye, Save, Code } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

export default function EmailTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const { addToast } = useToast();

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/email/templates');
      setTemplates(res.data);
      if (res.data.length > 0 && !selectedKey) {
        selectTemplate(res.data[0]);
      }
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to load templates', 'error');
    } finally {
      setLoading(false);
    }
  };

  const selectTemplate = (t) => {
    setSelectedKey(t.key);
    setSubject(t.subject);
    setBody(t.body);
    setPreview(null);
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const currentTemplate = templates.find((t) => t.key === selectedKey);

  const handleSave = async () => {
    if (!selectedKey) return;
    setSaving(true);
    try {
      await api.put(`/admin/email/templates/${selectedKey}`, {
        subject,
        body,
      });
      addToast('Template saved successfully', 'success');
      fetchTemplates();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to save template', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedKey) return;
    try {
      await api.delete(`/admin/email/templates/${selectedKey}`);
      addToast('Template reset to default', 'success');
      fetchTemplates();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to reset template', 'error');
    }
  };

  const handlePreview = async () => {
    if (!selectedKey) return;
    try {
      const res = await api.post(`/admin/email/templates/${selectedKey}/preview`, {});
      setPreview(res.data);
      setShowPreviewModal(true);
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to generate preview', 'error');
    }
  };

  const insertVariable = (varName) => {
    const snippet = `{{${varName}}}`;
    setBody((prev) => prev + snippet);
  };

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Email Templates</h3>
        <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Customize invitation and notification message templates with sandboxed variables.
        </p>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading templates...
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '20px' }}>
          {/* Template List */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px', height: 'fit-content' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', padding: '0 8px' }}>
              TEMPLATES
            </div>
            {templates.map((t) => (
              <div
                key={t.key}
                onClick={() => selectTemplate(t)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: selectedKey === t.key ? 600 : 400,
                  background: selectedKey === t.key ? 'var(--bg-active, rgba(59, 130, 246, 0.1))' : 'transparent',
                  color: selectedKey === t.key ? 'var(--primary-color, #3b82f6)' : 'inherit',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{t.key}</span>
                {t.isCustomized && (
                  <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.2)', color: '#d97706' }}>
                    custom
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Template Editor */}
          {currentTemplate && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '16px' }}>{currentTemplate.key}</h4>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Version {currentTemplate.version} {currentTemplate.updatedAt && `• Updated ${new Date(currentTemplate.updatedAt).toLocaleDateString()}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '12px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={handlePreview}
                  >
                    <Eye size={14} /> Preview
                  </button>
                  {currentTemplate.isCustomized && (
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '12px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      onClick={handleReset}
                    >
                      <RotateCcw size={14} /> Revert
                    </button>
                  )}
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: '12px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={handleSave}
                    disabled={saving}
                  >
                    <Save size={14} /> {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>

              {/* Variable chips */}
              <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  AVAILABLE VARIABLES (Click to insert)
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {currentTemplate.allowedVariables.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariable(v)}
                      style={{
                        background: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        color: 'var(--primary-color, #3b82f6)',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontFamily: 'monospace',
                      }}
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Subject Line</label>
                <input
                  type="text"
                  className="input-field"
                  style={{ width: '100%' }}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Body (Plain Text with Markdown/Links)</label>
                <textarea
                  className="input-field"
                  style={{ width: '100%', minHeight: '220px', fontFamily: 'monospace', fontSize: '13px', lineHeight: 1.5 }}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preview Modal */}
      {showPreviewModal && preview && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '640px', padding: '28px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>Email Preview</h3>
              <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => setShowPreviewModal(false)}>
                Close
              </button>
            </div>

            <div style={{ marginBottom: '12px', padding: '10px 14px', background: 'var(--bg-main)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <strong>Subject:</strong> {preview.subject}
            </div>

            <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '20px', background: '#ffffff', color: '#1f2937' }}>
              <div dangerouslySetInnerHTML={{ __html: preview.html }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
