import React, { useState, useMemo } from 'react';
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Sparkles,
  Scale,
  Send,
  Eye,
  EyeOff,
  Sliders,
} from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

export const RubricEditor = ({
  roundId,
  rubricFields = [],
  onChangeFields,
  isLocked = false,
  isPublished = false,
  onPublishChanged,
  evaluationEnabled = true,
}) => {
  const { addToast } = useToast();
  const [publishing, setPublishing] = useState(false);

  // Compute total weights of numeric criteria
  const numericFields = useMemo(
    () => rubricFields.filter((f) => f.type === 'numeric'),
    [rubricFields]
  );

  const totalWeight = useMemo(() => {
    return numericFields.reduce((acc, f) => {
      const w = parseFloat(f.weight) || 0;
      return acc + w;
    }, 0);
  }, [numericFields]);

  const isWeightValid = Math.abs(totalWeight - 100) < 0.001;

  // Add numeric field
  const handleAddNumeric = () => {
    if (isLocked) return;
    const next = [
      ...rubricFields,
      {
        fieldKey: `rf_${Date.now()}`,
        type: 'numeric',
        label: `Criterion ${rubricFields.length + 1}`,
        description: '',
        sortOrder: rubricFields.length,
        isRequired: true,
        maxMarks: 10,
        weight: numericFields.length === 0 ? 100 : 0,
        anchors: [
          { from: 0, to: 4, label: 'Needs Improvement' },
          { from: 5, to: 8, label: 'Proficient' },
          { from: 9, to: 10, label: 'Exceptional' },
        ],
      },
    ];
    onChangeFields(next);
  };

  // Add text field
  const handleAddText = () => {
    if (isLocked) return;
    const next = [
      ...rubricFields,
      {
        fieldKey: `rf_${Date.now()}`,
        type: 'text',
        label: 'Constructive Feedback',
        description: 'Qualitative notes and improvement suggestions',
        sortOrder: rubricFields.length,
        isRequired: false,
        visibility: 'participant',
        maxLength: 500,
      },
    ];
    onChangeFields(next);
  };

  const handleFieldChange = (index, key, val) => {
    const next = [...rubricFields];
    next[index] = { ...next[index], [key]: val };
    onChangeFields(next);
  };

  const handleRemoveField = (index) => {
    if (isLocked) return;
    const next = rubricFields.filter((_, i) => i !== index);
    onChangeFields(next);
  };

  const handleMoveField = (index, direction) => {
    if (isLocked) return;
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= rubricFields.length) return;
    const next = [...rubricFields];
    const temp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = temp;
    // update sortOrder
    next.forEach((f, i) => {
      f.sortOrder = i;
    });
    onChangeFields(next);
  };

  // Anchor handlers
  const handleAddAnchor = (fieldIndex) => {
    const field = rubricFields[fieldIndex];
    const anchors = Array.isArray(field.anchors) ? [...field.anchors] : [];
    anchors.push({ from: 0, to: field.maxMarks || 10, label: 'New Benchmark' });
    handleFieldChange(fieldIndex, 'anchors', anchors);
  };

  const handleAnchorChange = (fieldIndex, anchorIdx, key, val) => {
    const field = rubricFields[fieldIndex];
    const anchors = [...(field.anchors || [])];
    anchors[anchorIdx] = { ...anchors[anchorIdx], [key]: val };
    handleFieldChange(fieldIndex, 'anchors', anchors);
  };

  const handleRemoveAnchor = (fieldIndex, anchorIdx) => {
    const field = rubricFields[fieldIndex];
    const anchors = (field.anchors || []).filter((_, i) => i !== anchorIdx);
    handleFieldChange(fieldIndex, 'anchors', anchors);
  };

  // Weight helpers
  const handleDistributeEvenly = () => {
    if (isLocked || numericFields.length === 0) return;
    const count = numericFields.length;
    const base = Math.floor((100 / count) * 100) / 100;
    const remainder = Math.round((100 - base * count) * 100) / 100;

    let numIdx = 0;
    const next = rubricFields.map((f) => {
      if (f.type === 'numeric') {
        const w = numIdx === 0 ? base + remainder : base;
        numIdx++;
        return { ...f, weight: w };
      }
      return f;
    });
    onChangeFields(next);
    addToast('Weights distributed evenly across numeric criteria', 'info');
  };

  const handleNormaliseWeights = () => {
    if (isLocked || totalWeight <= 0) return;
    const next = rubricFields.map((f) => {
      if (f.type === 'numeric') {
        const cur = parseFloat(f.weight) || 0;
        const normalized = Math.round((cur / totalWeight) * 100 * 100) / 100;
        return { ...f, weight: normalized };
      }
      return f;
    });
    onChangeFields(next);
    addToast('Weights normalized to 100%', 'info');
  };

  // Publish / Unpublish actions
  const handlePublish = async () => {
    if (!roundId) return;
    setPublishing(true);
    try {
      await api.post(`/admin/rounds/${roundId}/publish`);
      addToast('Rubric published successfully! Evaluation is now live for judges.', 'success');
      if (onPublishChanged) onPublishChanged(true);
    } catch (err) {
      const d = err.response?.data?.detail;
      const msg = typeof d === 'string' ? d : d?.message || 'Failed to publish rubric';
      addToast(msg, 'error');
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!roundId) return;
    setPublishing(true);
    try {
      await api.post(`/admin/rounds/${roundId}/unpublish`);
      addToast('Rubric unpublished. It is now back in draft status.', 'info');
      if (onPublishChanged) onPublishChanged(false);
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to unpublish rubric', 'error');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Locked Banner */}
      {isLocked && (
        <div
          style={{
            padding: '14px 18px',
            borderRadius: '10px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            color: '#ef4444',
          }}
        >
          <Lock size={20} />
          <div>
            <strong style={{ display: 'block', fontSize: '0.9rem' }}>
              Rubric locked: judges have started scoring
            </strong>
            <span style={{ fontSize: '0.8rem', opacity: 0.9 }}>
              Structural attributes, max marks, and weights cannot be modified. Only descriptions and descriptive benchmark anchors remain editable.
            </span>
          </div>
        </div>
      )}

      {/* Header Actions & Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Scale size={18} color="var(--primary)" /> Evaluation Scoring Rubric
          </h4>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Define judging parameters, weights, scoring anchors, and feedback visibility for judges.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {roundId && (
            isPublished ? (
              <button
                type="button"
                onClick={handleUnpublish}
                disabled={publishing || isLocked}
                className="btn btn-secondary touch-target"
                style={{ fontSize: '0.82rem', fontWeight: 600 }}
              >
                Unpublish Rubric
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing || !evaluationEnabled}
                className="btn btn-primary touch-target"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600 }}
              >
                <Send size={15} /> Publish Rubric
              </button>
            )
          )}
          <button
            type="button"
            onClick={handleAddNumeric}
            disabled={isLocked}
            className="btn btn-secondary touch-target"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600 }}
          >
            <Plus size={15} /> + Numeric Criterion
          </button>
          <button
            type="button"
            onClick={handleAddText}
            disabled={isLocked}
            className="btn btn-secondary touch-target"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600 }}
          >
            <Plus size={15} /> + Feedback Text
          </button>
        </div>
      </div>

      {/* Live Weights Bar */}
      {numericFields.length > 0 && (
        <div
          className="glass-card"
          style={{
            padding: '16px 20px',
            borderRadius: '12px',
            border: `1px solid ${isWeightValid ? 'rgba(34, 197, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
            background: isWeightValid ? 'rgba(34, 197, 94, 0.04)' : 'rgba(245, 158, 11, 0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isWeightValid ? (
                <CheckCircle2 size={18} color="#22c55e" />
              ) : (
                <AlertTriangle size={18} color="#f59e0b" />
              )}
              <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                Total Weight: {totalWeight.toFixed(1)}% / 100%
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: isWeightValid ? '#22c55e' : '#f59e0b',
                }}
              >
                {isWeightValid ? '(Balanced and ready to publish)' : '(Must equal exactly 100% to publish)'}
              </span>
            </div>

            {!isLocked && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleDistributeEvenly}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '4px 10px', height: '30px' }}
                >
                  Distribute Evenly
                </button>
                <button
                  type="button"
                  onClick={handleNormaliseWeights}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '4px 10px', height: '30px' }}
                >
                  Normalise to 100%
                </button>
              </div>
            )}
          </div>

          <div
            style={{
              width: '100%',
              height: '8px',
              borderRadius: '4px',
              background: 'rgba(255, 255, 255, 0.1)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.min(totalWeight, 100)}%`,
                height: '100%',
                background: isWeightValid ? '#22c55e' : '#f59e0b',
                transition: 'width 0.3s ease, background 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Criteria List */}
      {rubricFields.length === 0 ? (
        <div
          className="glass-panel"
          style={{
            padding: '40px',
            textAlign: 'center',
            borderRadius: '12px',
            color: 'var(--text-muted)',
            border: '1px dashed var(--border-color)',
          }}
        >
          <Scale size={32} style={{ marginBottom: '12px', opacity: 0.6 }} />
          <p style={{ margin: 0, fontSize: '0.95rem' }}>No evaluation criteria added to this rubric yet.</p>
          <p style={{ margin: '6px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Add numeric marks criteria (with weights) and optional feedback text fields.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {rubricFields.map((field, idx) => (
            <div
              key={field.fieldKey || idx}
              className="glass-card"
              style={{
                padding: '20px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              {/* Row Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      background: field.type === 'numeric' ? 'rgba(99, 102, 241, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                      color: field.type === 'numeric' ? 'var(--primary)' : '#10b981',
                    }}
                  >
                    {field.type === 'numeric' ? 'Numeric Criterion' : 'Text Feedback'}
                  </span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    #{idx + 1}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => handleMoveField(idx, -1)}
                    disabled={isLocked || idx === 0}
                    className="btn btn-icon touch-target"
                    title="Move up"
                    style={{ padding: '6px' }}
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveField(idx, 1)}
                    disabled={isLocked || idx === rubricFields.length - 1}
                    className="btn btn-icon touch-target"
                    title="Move down"
                    style={{ padding: '6px' }}
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveField(idx)}
                    disabled={isLocked}
                    className="btn btn-icon touch-target"
                    title="Remove criterion"
                    style={{ color: '#ef4444', padding: '6px' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* General Fields */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                    Criterion Label *
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={field.label || ''}
                    disabled={isLocked}
                    onChange={(e) => handleFieldChange(idx, 'label', e.target.value)}
                    placeholder="e.g. Technical Complexity & Feasibility"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                    Description & Instructions for Judges
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={field.description || ''}
                    onChange={(e) => handleFieldChange(idx, 'description', e.target.value)}
                    placeholder="e.g. Assess code structure, depth, and API design"
                  />
                </div>
              </div>

              {/* Type Specific Fields */}
              {field.type === 'numeric' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', alignItems: 'center' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                      Max Marks *
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      className="form-input"
                      value={field.maxMarks !== undefined ? field.maxMarks : 10}
                      disabled={isLocked}
                      onChange={(e) => handleFieldChange(idx, 'maxMarks', parseFloat(e.target.value) || 0)}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                      Weight Percentage (%) *
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      className="form-input"
                      value={field.weight !== undefined ? field.weight : 0}
                      disabled={isLocked}
                      onChange={(e) => handleFieldChange(idx, 'weight', parseFloat(e.target.value) || 0)}
                      required
                    />
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', alignItems: 'center' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                      Feedback Visibility *
                    </label>
                    <select
                      className="form-input"
                      value={field.visibility || 'participant'}
                      disabled={isLocked}
                      onChange={(e) => handleFieldChange(idx, 'visibility', e.target.value)}
                    >
                      <option value="participant">Visible to Participants (Feedback Report)</option>
                      <option value="staff">Staff Only (Private Evaluation Notes)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                      Max Character Length
                    </label>
                    <input
                      type="number"
                      step="50"
                      min="50"
                      max="5000"
                      className="form-input"
                      value={field.maxLength || 500}
                      disabled={isLocked}
                      onChange={(e) => handleFieldChange(idx, 'maxLength', parseInt(e.target.value) || 500)}
                    />
                  </div>
                </div>
              )}

              {/* Anchors Editor (Numeric Only) */}
              {field.type === 'numeric' && (
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      Scoring Anchor Benchmarks (Guidelines for Judges)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAddAnchor(idx)}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.72rem', padding: '2px 8px', height: '26px' }}
                    >
                      + Add Anchor
                    </button>
                  </div>

                  {Array.isArray(field.anchors) && field.anchors.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {field.anchors.map((anchor, aIdx) => (
                        <div
                          key={aIdx}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '70px 70px 1fr 30px',
                            gap: '8px',
                            alignItems: 'center',
                          }}
                        >
                          <input
                            type="number"
                            className="form-input"
                            style={{ padding: '4px 6px', fontSize: '0.8rem' }}
                            value={anchor.from ?? 0}
                            placeholder="From"
                            onChange={(e) =>
                              handleAnchorChange(idx, aIdx, 'from', parseFloat(e.target.value) || 0)
                            }
                          />
                          <input
                            type="number"
                            className="form-input"
                            style={{ padding: '4px 6px', fontSize: '0.8rem' }}
                            value={anchor.to ?? 10}
                            placeholder="To"
                            onChange={(e) =>
                              handleAnchorChange(idx, aIdx, 'to', parseFloat(e.target.value) || 0)
                            }
                          />
                          <input
                            type="text"
                            className="form-input"
                            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                            value={anchor.label || ''}
                            placeholder="Benchmark label (e.g. Prototype functional)"
                            onChange={(e) => handleAnchorChange(idx, aIdx, 'label', e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveAnchor(idx, aIdx)}
                            className="btn btn-icon"
                            style={{ color: '#ef4444', padding: '4px' }}
                            title="Remove anchor"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      No benchmarks defined. Judges will see a raw score input without anchor descriptions.
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RubricEditor;
