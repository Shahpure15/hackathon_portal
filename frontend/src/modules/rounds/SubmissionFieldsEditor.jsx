import React from 'react';
import { Plus, Trash2, FileText, CheckCircle2 } from 'lucide-react';

export const SubmissionFieldsEditor = ({ fields = [], onChange }) => {
  const handleAddField = () => {
    const next = [
      ...fields,
      {
        id: `field_${Date.now()}`,
        name: `Submission Field ${fields.length + 1}`,
        description: 'Text response or URL link',
        fieldType: 'text',
        required: true,
      },
    ];
    onChange(next);
  };

  const handleFieldChange = (index, key, val) => {
    const next = [...fields];
    next[index] = { ...next[index], [key]: val };
    onChange(next);
  };

  const handleRemoveField = (index) => {
    const next = fields.filter((_, i) => i !== index);
    onChange(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
            Submission Deliverable Form Fields
          </h4>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Configure questions, presentation slide links, or GitHub repo URL fields required from participants.
          </p>
        </div>
        <button
          type="button"
          onClick={handleAddField}
          className="btn btn-secondary touch-target"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}
        >
          <Plus size={16} /> Add Submission Field
        </button>
      </div>

      {fields.length === 0 ? (
        <div
          className="glass-panel"
          style={{
            padding: '32px',
            textAlign: 'center',
            borderRadius: '12px',
            color: 'var(--text-muted)',
            border: '1px dashed var(--border-color)',
          }}
        >
          <FileText size={28} style={{ marginBottom: '8px', opacity: 0.6 }} />
          <p style={{ margin: 0, fontSize: '0.9rem' }}>No custom submission fields added yet.</p>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Teams will only see standard link inputs if left blank.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {fields.map((field, idx) => (
            <div
              key={field.id || idx}
              className="glass-card"
              style={{
                padding: '16px',
                borderRadius: '10px',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--primary)',
                    background: 'rgba(99, 102, 241, 0.1)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                  }}
                >
                  Field #{idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveField(idx)}
                  className="btn btn-icon touch-target"
                  style={{ color: '#ef4444', padding: '6px' }}
                  title="Remove field"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                    Field Label / Question *
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={field.name || ''}
                    onChange={(e) => handleFieldChange(idx, 'name', e.target.value)}
                    placeholder="e.g. Google Drive / Presentation Slide URL"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                    Instructions / Description
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={field.description || ''}
                    onChange={(e) => handleFieldChange(idx, 'description', e.target.value)}
                    placeholder="e.g. Ensure link access is set to anyone with link"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '4px' }}>
                <input
                  type="checkbox"
                  id={`field_req_${idx}`}
                  checked={Boolean(field.required)}
                  onChange={(e) => handleFieldChange(idx, 'required', e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                />
                <label
                  htmlFor={`field_req_${idx}`}
                  style={{ fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                >
                  Mandatory Field (Required for submission)
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SubmissionFieldsEditor;
