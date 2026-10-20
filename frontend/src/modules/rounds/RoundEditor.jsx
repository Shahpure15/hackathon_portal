import React, { useState, useEffect } from 'react';
import {
  Save,
  FileText,
  Sliders,
  Scale,
  Settings2,
  Calendar,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  Clock,
  Layers,
  HelpCircle,
  Users,
  Award,
  Trophy,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  Pencil,
  Check,
} from 'lucide-react';
import api from '../../services/api';
import Modal from '../../components/Modal';
import SubmissionFieldsEditor from './SubmissionFieldsEditor';
import RubricEditor from './RubricEditor';
import AssignmentWizard from './AssignmentWizard';
import JudgingProgressConsole from './JudgingProgressConsole';
import ReviseRubricModal from './ReviseRubricModal';
import RoundResultsTab from './RoundResultsTab';
import { useToast } from '../../contexts/ToastContext';

function toLocalDatetimeInputString(dateInput) {
  if (!dateInput) return '';
  let str = String(dateInput);
  if (!str.endsWith('Z') && !str.includes('+') && !str.slice(10).includes('-')) {
    str += 'Z';
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export const RoundEditor = ({
  round,
  features = { evaluation: true, pods: true },
  onClose,
  onSaved,
}) => {
  const { addToast } = useToast();
  const isNew = !round?.id;

  // Multi-process step state: 'setup' (1) | 'submissions' (2) | 'rubric' (3) | 'results' (4)
  const [activeStep, setActiveStep] = useState('setup');

  // Process 1: Round Setup & Scoring Rules
  const [name, setName] = useState(round?.name || '');
  const [isEditingName, setIsEditingName] = useState(false);
  const [description, setDescription] = useState(round?.description || '');
  const [number, setNumber] = useState(round?.number || 1);
  const [status, setStatus] = useState(round?.status || 'live');
  const [opensAt, setOpensAt] = useState(toLocalDatetimeInputString(round?.opensAt));
  const [closesAt, setClosesAt] = useState(toLocalDatetimeInputString(round?.closesAt));
  const [evaluationEnabled, setEvaluationEnabled] = useState(
    round?.evaluationEnabled !== undefined ? round.evaluationEnabled : true
  );
  const [aggregation, setAggregation] = useState(round?.aggregation || 'mean');
  const [trimCount, setTrimCount] = useState(round?.trimCount || 1);
  const [totalScale, setTotalScale] = useState(round?.totalScale || 100);
  const [tieBreakOrder, setTieBreakOrder] = useState(round?.tieBreakOrder || []);
  const [eligibilityMode, setEligibilityMode] = useState(round?.eligibility?.mode || 'all');
  const [fromRoundId, setFromRoundId] = useState(round?.eligibility?.fromRoundId || '');
  const [availablePreviousRounds, setAvailablePreviousRounds] = useState([]);

  // Process 2: Submissions & Gate
  const [submissionEnabled, setSubmissionEnabled] = useState(
    round?.submissionEnabled !== undefined ? round.submissionEnabled : true
  );
  const [isSubmissionOpen, setIsSubmissionOpen] = useState(
    round?.isSubmissionOpen !== undefined ? round.isSubmissionOpen : false
  );
  const [submissionFields, setSubmissionFields] = useState(
    round?.submissionFields || []
  );

  // Process 3: Rubric Designer
  const [rubricFields, setRubricFields] = useState(round?.rubricFields || []);
  const [rubricGuidance, setRubricGuidance] = useState([]);
  const [isRubricLocked, setIsRubricLocked] = useState(
    Boolean(round?.rubricSummary?.locked)
  );
  const [isRubricPublished, setIsRubricPublished] = useState(
    Boolean(round?.rubricSummary?.published)
  );
  const [currentRubricVersion, setCurrentRubricVersion] = useState(round?.currentRubricVersion || 1);
  const [showReviseRubricModal, setShowReviseRubricModal] = useState(false);

  // Separate Dedicated Assignment Wizard Modal
  const [showAssignmentWizardModal, setShowAssignmentWizardModal] = useState(false);
  const [showProgressConsoleModal, setShowProgressConsoleModal] = useState(false);

  const [saving, setSaving] = useState(false);

  // Load available previous rounds for progression eligibility
  useEffect(() => {
    const fetchPreviousRounds = async () => {
      try {
        const res = await api.get('/admin/rounds');
        const list = res.data || [];
        const currentNum = parseInt(number, 10) || round?.number || round?.roundNumber || 1;
        const prev = list.filter((r) => r.id !== round?.id && (r.number || r.roundNumber || 0) < currentNum);
        setAvailablePreviousRounds(prev);
        if (prev.length > 0 && !fromRoundId) {
          setFromRoundId(prev[0].id);
        }
      } catch (err) {
        console.error('Failed to load previous rounds for eligibility', err);
      }
    };
    fetchPreviousRounds();
  }, [round?.id, number]);

  // Load rubric detail if editing existing round
  // Dirty state tracking to prevent losing unsaved progress
  const [isDirty, setIsDirty] = useState(false);
  const initialSnapshotRef = React.useRef(null);

  // Take snapshot of initial values once loaded
  useEffect(() => {
    if (!initialSnapshotRef.current) {
      initialSnapshotRef.current = JSON.stringify({
        name,
        description,
        number,
        status,
        opensAt,
        closesAt,
        evaluationEnabled,
        aggregation,
        trimCount,
        totalScale,
        eligibilityMode,
        fromRoundId,
        submissionEnabled,
        isSubmissionOpen,
        submissionFieldsCount: submissionFields.length,
        rubricFieldsCount: rubricFields.length,
      });
    } else {
      const currentSnapshot = JSON.stringify({
        name,
        description,
        number,
        status,
        opensAt,
        closesAt,
        evaluationEnabled,
        aggregation,
        trimCount,
        totalScale,
        eligibilityMode,
        fromRoundId,
        submissionEnabled,
        isSubmissionOpen,
        submissionFieldsCount: submissionFields.length,
        rubricFieldsCount: rubricFields.length,
      });
      if (currentSnapshot !== initialSnapshotRef.current) {
        setIsDirty(true);
      }
    }
  }, [
    name, description, number, status, opensAt, closesAt,
    evaluationEnabled, aggregation, trimCount, totalScale,
    eligibilityMode, fromRoundId, submissionEnabled, isSubmissionOpen,
    submissionFields.length, rubricFields.length
  ]);

  // Warn on page refresh or browser close if dirty
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes in this round. If you leave or refresh, your progress will be lost.';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Safe close handler that checks isDirty
  const handleSafeClose = () => {
    if (isDirty) {
      const confirmLeave = window.confirm(
        'You have unsaved changes in this round! Leaving now will discard your progress.\n\nAre you sure you want to exit without saving?'
      );
      if (!confirmLeave) return;
    }
    onClose();
  };

  const handleRubricRevised = async (result) => {
    setIsRubricLocked(false);
    if (result.newVersion) {
      setCurrentRubricVersion(result.newVersion);
    }
    try {
      const res = await api.get(`/admin/rounds/${round.id}/rubric`);
      if (res.data) {
        setRubricFields(res.data.rubricFields || []);
        setRubricGuidance(res.data.guidance || []);
        setIsRubricLocked(Boolean(res.data.locked));
        setIsRubricPublished(Boolean(res.data.published));
      }
    } catch (err) {
      console.error('Failed to reload rubric after revision', err);
    }
  };

  const handleSave = async (e, shouldClose = true) => {
    if (e) e.preventDefault();
    if (!name.trim()) {
      addToast('Round name is required', 'error');
      return null;
    }

    if (!opensAt || !closesAt) {
      addToast('Round schedule is mandatory. Please set both Start and End date & time.', 'error');
      return null;
    }

    if (new Date(opensAt) >= new Date(closesAt)) {
      addToast('Scheduled Closes At must be after Scheduled Opens At', 'error');
      return null;
    }

    if (!submissionEnabled && !evaluationEnabled) {
      addToast('At least one of Submissions or Judging must be enabled', 'error');
      return null;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        number: parseInt(number) || 1,
        status,
        submissionEnabled,
        evaluationEnabled,
        isSubmissionOpen,
        opensAt: opensAt ? new Date(opensAt).toISOString() : null,
        closesAt: closesAt ? new Date(closesAt).toISOString() : null,
        aggregation,
        trimCount: parseInt(trimCount) || 1,
        totalScale: parseInt(totalScale) || 100,
        tieBreakOrder,
        eligibility: eligibilityMode === 'advanced_from'
          ? { mode: 'advanced_from', fromRoundId }
          : { mode: eligibilityMode },
        submissionFields: submissionFields.map((f) => ({
          id: f.id || `field_${Date.now()}`,
          name: (f.name || '').trim(),
          description: (f.description || '').trim(),
          fieldType: 'text',
          required: Boolean(f.required),
        })),
      };

      let savedRound;
      if (isNew) {
        const res = await api.post('/admin/rounds', payload);
        savedRound = res.data;
        addToast('Round created successfully!', 'success');
      } else {
        const res = await api.put(`/admin/rounds/${round.id}`, payload);
        savedRound = res.data;
        addToast('Round updated successfully!', 'success');
      }

      // Save rubric if fields or guidance present
      const targetRoundId = savedRound.id;
      if (rubricFields.length > 0 || rubricGuidance.length > 0) {
        try {
          const rubRes = await api.put(`/admin/rounds/${targetRoundId}/rubric`, {
            rubricFields: rubricFields.map((rf, idx) => ({
              ...rf,
              sortOrder: idx,
            })),
            guidance: rubricGuidance,
          });
          if (rubRes.data?.warnings?.length > 0) {
            addToast(`Rubric warnings: ${rubRes.data.warnings.join('; ')}`, 'info');
          }
        } catch (rErr) {
          console.error('Failed to save rubric during round save', rErr);
          const rMsg = rErr.response?.data?.detail || 'Failed to save rubric criteria';
          addToast(rMsg, 'error');
          return null;
        }
      }

      setIsDirty(false);
      if (onSaved) onSaved(savedRound);
      if (shouldClose) {
        onClose();
      }
      return savedRound;
    } catch (err) {
      const d = err.response?.data?.detail;
      const msg = typeof d === 'string' ? d : d?.message || 'Failed to save round';
      addToast(msg, 'error');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleLaunchAssignmentWizard = async () => {
    if (isNew) {
      const saved = await handleSave(null, false);
      if (saved) {
        setShowAssignmentWizardModal(true);
      }
    } else {
      setShowAssignmentWizardModal(true);
    }
  };

  return (
    <>
      <div
        className="round-editor-workspace fade-in-up"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '22px',
          width: '100%',
          minHeight: '85vh',
          paddingBottom: '40px',
        }}
      >
        {/* Workspace Top Header Bar */}
        <div
          className="glass-card"
          style={{
            padding: '16px 24px',
            borderRadius: '14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '14px',
            background: 'var(--card-bg, rgba(255, 255, 255, 0.03))',
            border: '1px solid var(--border-color)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              type="button"
              onClick={handleSafeClose}
              className="btn btn-secondary touch-target"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', fontWeight: 600 }}
            >
              <ArrowLeft size={16} /> Back to Rounds
            </button>
            <div style={{ width: '1px', height: '26px', background: 'var(--border-color)' }} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: 'rgba(99, 102, 241, 0.12)',
                    color: 'var(--primary)',
                  }}
                >
                  Round #{round?.number || 'New'}
                </span>
                {isEditingName ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="text"
                      className="form-input"
                      value={name}
                      autoFocus
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setIsEditingName(false);
                        if (e.key === 'Escape') setIsEditingName(false);
                      }}
                      onBlur={() => setIsEditingName(false)}
                      style={{
                        fontSize: '1.15rem',
                        fontWeight: 800,
                        padding: '4px 10px',
                        height: 'auto',
                        width: '320px',
                        maxWidth: '100%',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setIsEditingName(false)}
                      className="btn btn-primary touch-target"
                      style={{ padding: '6px 10px', display: 'flex', alignItems: 'center' }}
                      title="Confirm round name"
                    >
                      <Check size={14} />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => setIsEditingName(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      padding: '2px 6px',
                      borderRadius: '6px',
                      transition: 'background 0.2s',
                    }}
                    className="hover-bg-glass"
                    title="Click to rename round"
                  >
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>{name || 'New Round'}</h2>
                    <Pencil size={14} style={{ color: 'var(--text-secondary)', opacity: 0.7 }} />
                  </div>
                )}
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {isNew ? 'Configure round details, submission gate, scoring rubric, and live leaderboard' : `Status: ${round?.status || 'live'} · Rubric v${currentRubricVersion} · (Editable here or in Tab 1)`}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={(e) => handleSave(e, false)}
              disabled={saving}
              className="btn btn-secondary touch-target"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', fontWeight: 600 }}
            >
              <Save size={15} /> {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              type="button"
              onClick={(e) => handleSave(e, true)}
              disabled={saving}
              className="btn btn-primary touch-target"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', fontWeight: 700 }}
            >
              <Save size={15} /> {saving ? 'Saving...' : 'Save & Close'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {/* Multi-Process Stepper Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--border-color)',
              paddingBottom: '14px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            {/* Step navigation tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setActiveStep('setup')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: activeStep === 'setup' ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                  background: activeStep === 'setup' ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-glass, transparent)',
                  color: activeStep === 'setup' ? 'var(--primary)' : 'var(--text-secondary)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: activeStep === 'setup' ? 'var(--primary)' : 'var(--border-color)',
                    color: activeStep === 'setup' ? '#fff' : 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                  }}
                >
                  1
                </span>
                <span>Details & Scoring Rules</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveStep('submissions')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: activeStep === 'submissions' ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                  background: activeStep === 'submissions' ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-glass, transparent)',
                  color: activeStep === 'submissions' ? 'var(--primary)' : 'var(--text-secondary)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: activeStep === 'submissions' ? 'var(--primary)' : 'var(--border-color)',
                    color: activeStep === 'submissions' ? '#fff' : 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                  }}
                >
                  2
                </span>
                <span>Submissions & Gate</span>
                {submissionEnabled && (
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e' }} />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveStep('rubric')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: activeStep === 'rubric' ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                  background: activeStep === 'rubric' ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-glass, transparent)',
                  color: activeStep === 'rubric' ? 'var(--primary)' : 'var(--text-secondary)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: activeStep === 'rubric' ? 'var(--primary)' : 'var(--border-color)',
                    color: activeStep === 'rubric' ? '#fff' : 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                  }}
                >
                  3
                </span>
                <span>Rubric Designer</span>
                {rubricFields.length > 0 && (
                  <span style={{ fontSize: '0.72rem', opacity: 0.8 }}>({rubricFields.length})</span>
                )}
              </button>

              {!isNew && (
                <button
                  type="button"
                  onClick={() => setActiveStep('results')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: activeStep === 'results' ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                    background: activeStep === 'results' ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-glass, transparent)',
                    color: activeStep === 'results' ? 'var(--primary)' : 'var(--text-secondary)',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Trophy size={15} />
                  <span>Rankings & Results</span>
                </button>
              )}
            </div>

            {/* Dedicated Team Assignment Quick Launcher */}
            {evaluationEnabled && (
              <button
                type="button"
                onClick={handleLaunchAssignmentWizard}
                className="btn btn-secondary touch-target"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: 'var(--primary)',
                  borderColor: 'var(--primary)',
                }}
                title="Launch separate judge assignment wizard to allocate teams"
              >
                <Users size={15} /> Judge Assignment Wizard →
              </button>
            )}
          </div>

          {/* PROCESS 1: ROUND SETUP & SCORING RULES */}
          {activeStep === 'setup' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Basic Information Section */}
              <div
                className="glass-card"
                style={{
                  padding: '20px',
                  borderRadius: '12px',
                  background: 'var(--card-bg, var(--bg-card))',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Settings2 size={16} color="var(--primary)" /> 1. Round Identification & Schedule
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                      Round Name *
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Round 1: Design & Architecture"
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                      Round Sequence Number *
                    </label>
                    <input
                      type="number"
                      min="1"
                      className="form-input"
                      value={number}
                      onChange={(e) => setNumber(parseInt(e.target.value) || 1)}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                      Status
                    </label>
                    <select
                      className="form-input"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="live">Live (Active)</option>
                      <option value="draft">Draft (Setup Phase)</option>
                      <option value="closed">Concluded / Closed</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                    Description & Instructions for Participants
                  </label>
                  <textarea
                    rows={2}
                    className="form-input"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Provide overview of deliverables and expectations for this round..."
                    style={{ resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                      <Calendar size={13} style={{ display: 'inline', marginRight: '4px' }} />
                      Scheduled Starts At <span style={{ color: '#ef4444', fontWeight: 800 }}>*</span>
                    </label>
                    <input
                      type="datetime-local"
                      required
                      className="form-input"
                      value={opensAt}
                      onChange={(e) => setOpensAt(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                      <Clock size={13} style={{ display: 'inline', marginRight: '4px' }} />
                      Scheduled Ends At <span style={{ color: '#ef4444', fontWeight: 800 }}>*</span>
                    </label>
                    <input
                      type="datetime-local"
                      required
                      className="form-input"
                      value={closesAt}
                      onChange={(e) => setClosesAt(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Evaluation & Scoring Rules Section */}
              <div
                className="glass-card"
                style={{
                  padding: '20px',
                  borderRadius: '12px',
                  background: 'var(--card-bg, var(--bg-card))',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Sliders size={16} color="var(--primary)" /> 2. Evaluation & Scoring Parameters
                    </h4>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Configure how judge scores are aggregated and calculated across panels.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEvaluationEnabled(!evaluationEnabled)}
                    className="btn btn-icon"
                    style={{ color: evaluationEnabled ? 'var(--primary)' : 'var(--text-muted)' }}
                    title={evaluationEnabled ? 'Judging enabled' : 'Judging disabled'}
                  >
                    {evaluationEnabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                  </button>
                </div>

                {evaluationEnabled && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                        Score Aggregation Formula
                      </label>
                      <select
                        className="form-input"
                        value={aggregation}
                        onChange={(e) => setAggregation(e.target.value)}
                      >
                        <option value="mean">Arithmetic Mean (Average of all judges)</option>
                        <option value="median">Median (Middle score)</option>
                        <option value="trimmed_mean">Trimmed Mean (Drop extreme outliers)</option>
                      </select>
                    </div>

                    {aggregation === 'trimmed_mean' && (
                      <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                          Trim Count (Outliers to discard)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="5"
                          className="form-input"
                          value={trimCount}
                          onChange={(e) => setTrimCount(parseInt(e.target.value) || 1)}
                        />
                      </div>
                    )}

                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                        Total Scale Target (e.g. 100)
                      </label>
                      <input
                        type="number"
                        min="10"
                        max="1000"
                        className="form-input"
                        value={totalScale}
                        onChange={(e) => setTotalScale(parseInt(e.target.value) || 100)}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                        Team Advancement Eligibility
                      </label>
                      <select
                        className="form-input"
                        value={eligibilityMode}
                        onChange={(e) => setEligibilityMode(e.target.value)}
                      >
                        <option value="all">All active registered teams</option>
                        <option value="advanced_from">Advanced from earlier round</option>
                      </select>
                    </div>
                  </div>
                )}

                {evaluationEnabled && eligibilityMode === 'advanced_from' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Eligible from Round:
                    </label>
                    {availablePreviousRounds.length === 0 ? (
                      <span style={{ fontSize: '0.8rem', color: '#eab308' }}>
                        No earlier rounds exist. Please create a lower-numbered round first or select 'All'.
                      </span>
                    ) : (
                      <select
                        className="form-input"
                        value={fromRoundId}
                        onChange={(e) => setFromRoundId(e.target.value)}
                      >
                        {availablePreviousRounds.map((pr) => (
                          <option key={pr.id} value={pr.id}>
                            {pr.name} (Round #{pr.number || pr.roundNumber})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* Navigation Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setActiveStep('submissions')}
                  className="btn btn-primary touch-target"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  Next: Submissions & Gate <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* PROCESS 2: SUBMISSIONS & DELIVERABLES */}
          {activeStep === 'submissions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div
                className="glass-card"
                style={{
                  padding: '20px',
                  borderRadius: '12px',
                  background: 'var(--card-bg, var(--bg-card))',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '14px',
                }}
              >
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700 }}>Enable Team Submissions</h4>
                  <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Allow participant teams to upload deliverables, repositories, links, and documents.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSubmissionEnabled(!submissionEnabled)}
                  className="btn btn-icon"
                  style={{ color: submissionEnabled ? '#22c55e' : 'var(--text-muted)' }}
                >
                  {submissionEnabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                </button>
              </div>

              {submissionEnabled && (
                <>
                  <div
                    className="glass-panel"
                    style={{
                      padding: '16px 20px',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: isSubmissionOpen ? 'rgba(34, 197, 94, 0.06)' : 'rgba(239, 68, 68, 0.06)',
                      border: `1px solid ${isSubmissionOpen ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.88rem' }}>Live Submission Gate Status</strong>
                      <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {isSubmissionOpen ? 'Submissions currently OPEN for teams' : 'Submissions currently LOCKED / CLOSED for teams'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsSubmissionOpen(!isSubmissionOpen)}
                      className={`btn ${isSubmissionOpen ? 'btn-secondary' : 'btn-primary'}`}
                      style={{ fontSize: '0.82rem', fontWeight: 700 }}
                    >
                      {isSubmissionOpen ? 'Close Submissions' : 'Open Submissions Now'}
                    </button>
                  </div>

                  <div
                    className="glass-card"
                    style={{
                      padding: '20px',
                      borderRadius: '12px',
                      background: 'var(--card-bg, var(--bg-card))',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <SubmissionFieldsEditor
                      fields={submissionFields}
                      onChange={setSubmissionFields}
                    />
                  </div>
                </>
              )}

              {/* Navigation Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setActiveStep('setup')}
                  className="btn btn-secondary touch-target"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <ArrowLeft size={15} /> Back to Setup
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStep('rubric')}
                  className="btn btn-primary touch-target"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  Next: Rubric Designer <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* PROCESS 3: RUBRIC DESIGNER */}
          {activeStep === 'rubric' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <RubricEditor
                roundId={round?.id}
                rubricFields={rubricFields}
                onChangeFields={setRubricFields}
                guidance={rubricGuidance}
                onChangeGuidance={setRubricGuidance}
                isLocked={isRubricLocked}
                isPublished={isRubricPublished}
                evaluationEnabled={evaluationEnabled}
                onPublishChanged={(pub) => setIsRubricPublished(pub)}
                onReviseRubric={() => setShowReviseRubricModal(true)}
              />

              {/* Navigation Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setActiveStep('submissions')}
                  className="btn btn-secondary touch-target"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <ArrowLeft size={15} /> Back to Submissions
                </button>
                <button
                  type="button"
                  onClick={(e) => handleSave(e, true)}
                  disabled={saving}
                  className="btn btn-primary touch-target"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#22c55e', borderColor: '#22c55e' }}
                >
                  <Save size={15} /> {saving ? 'Saving...' : 'Save & Finish'}
                </button>
              </div>
            </div>
          )}

          {/* PROCESS 4: RESULTS & LEADERBOARD (EXISTING ROUND ONLY) */}
          {activeStep === 'results' && !isNew && (
            <RoundResultsTab round={round} rubricFields={rubricFields} />
          )}

          {/* Revise Rubric Modal */}
          {round?.id && (
            <ReviseRubricModal
              roundId={round.id}
              roundName={name}
              currentRubricVersion={currentRubricVersion}
              isOpen={showReviseRubricModal}
              onClose={() => setShowReviseRubricModal(false)}
              onRevised={handleRubricRevised}
            />
          )}

          {/* Global Workspace Footer Buttons */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid var(--border-color)',
              paddingTop: '18px',
              marginTop: 'auto',
            }}
          >
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                onClick={(e) => handleSave(e, false)}
                disabled={saving}
                className="btn btn-secondary"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={(e) => handleSave(e, true)}
                disabled={saving}
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Save size={16} /> {saving ? 'Saving...' : 'Save & Close'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Standalone Separate Assignment Wizard Modal */}
      {showAssignmentWizardModal && (round?.id || name) && (
        <Modal
          isOpen={true}
          onClose={() => setShowAssignmentWizardModal(false)}
          title={`Judge & Team Assignment Wizard: ${name}`}
          maxWidth="1220px"
        >
          <AssignmentWizard
            roundId={round?.id}
            features={features}
            onClose={() => setShowAssignmentWizardModal(false)}
          />
        </Modal>
      )}

      {/* Standalone Progress Console Modal */}
      {showProgressConsoleModal && round?.id && (
        <Modal
          isOpen={true}
          onClose={() => setShowProgressConsoleModal(false)}
          title={`Judging Progress Console: ${name}`}
          maxWidth="1100px"
        >
          <JudgingProgressConsole
            roundId={round.id}
            roundName={name}
            onClose={() => setShowProgressConsoleModal(false)}
          />
        </Modal>
      )}
    </>
  );
};

export default RoundEditor;
