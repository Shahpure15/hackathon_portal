import React, { useState, useEffect } from 'react';
import {
  X,
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
} from 'lucide-react';
import api from '../../services/api';
import Modal from '../../components/Modal';
import SubmissionFieldsEditor from './SubmissionFieldsEditor';
import RubricEditor from './RubricEditor';
import AssignmentWizard from './AssignmentWizard';
import JudgingProgressConsole from './JudgingProgressConsole';
import ReviseRubricModal from './ReviseRubricModal';
import { useToast } from '../../contexts/ToastContext';

export const RoundEditor = ({
  round,
  features = { evaluation: true, pods: true },
  onClose,
  onSaved,
}) => {
  const { addToast } = useToast();
  const isNew = !round?.id;

  const [activeTab, setActiveTab] = useState('general'); // general | submissions | judging | rubric

  // General tab states
  const [name, setName] = useState(round?.name || '');
  const [description, setDescription] = useState(round?.description || '');
  const [number, setNumber] = useState(round?.number || 1);
  const [status, setStatus] = useState(round?.status || 'live');
  const [opensAt, setOpensAt] = useState(
    round?.opensAt ? new Date(round.opensAt).toISOString().slice(0, 16) : ''
  );
  const [closesAt, setClosesAt] = useState(
    round?.closesAt ? new Date(round.closesAt).toISOString().slice(0, 16) : ''
  );

  // Submissions tab states
  const [submissionEnabled, setSubmissionEnabled] = useState(
    round?.submissionEnabled !== undefined ? round.submissionEnabled : true
  );
  const [isSubmissionOpen, setIsSubmissionOpen] = useState(
    round?.isSubmissionOpen !== undefined ? round.isSubmissionOpen : false
  );
  const [submissionFields, setSubmissionFields] = useState(
    round?.submissionFields || []
  );

  // Judging tab states
  const [evaluationEnabled, setEvaluationEnabled] = useState(
    round?.evaluationEnabled !== undefined ? round.evaluationEnabled : false
  );
  const [aggregation, setAggregation] = useState(round?.aggregation || 'mean');
  const [trimCount, setTrimCount] = useState(round?.trimCount || 1);
  const [totalScale, setTotalScale] = useState(round?.totalScale || 100);
  const [tieBreakOrder, setTieBreakOrder] = useState(round?.tieBreakOrder || []);
  const [eligibility, setEligibility] = useState('all');

  // Rubric state
  const [rubricFields, setRubricFields] = useState(round?.rubricFields || []);
  const [isRubricLocked, setIsRubricLocked] = useState(
    Boolean(round?.rubricSummary?.locked)
  );
  const [isRubricPublished, setIsRubricPublished] = useState(
    Boolean(round?.rubricSummary?.published)
  );
  const [currentRubricVersion, setCurrentRubricVersion] = useState(round?.currentRubricVersion || 1);
  const [judgingSubTab, setJudgingSubTab] = useState('settings'); // settings | assignments | progress
  const [showReviseRubricModal, setShowReviseRubricModal] = useState(false);

  const [saving, setSaving] = useState(false);

  // Load rubric detail if editing existing round
  useEffect(() => {
    if (!isNew && round?.id) {
      const fetchRubric = async () => {
        try {
          const res = await api.get(`/admin/rounds/${round.id}/rubric`);
          if (res.data) {
            setRubricFields(res.data.rubricFields || []);
            setIsRubricLocked(Boolean(res.data.locked));
            setIsRubricPublished(Boolean(res.data.published));
            if (res.data.currentVersion) {
              setCurrentRubricVersion(res.data.currentVersion);
            }
          }
        } catch (err) {
          console.error('Failed to load rubric fields', err);
        }
      };
      fetchRubric();
    }
  }, [round?.id, isNew]);

  const handleRubricRevised = async (result) => {
    setIsRubricLocked(false);
    if (result.newVersion) {
      setCurrentRubricVersion(result.newVersion);
    }
    try {
      const res = await api.get(`/admin/rounds/${round.id}/rubric`);
      if (res.data) {
        setRubricFields(res.data.rubricFields || []);
        setIsRubricLocked(Boolean(res.data.locked));
        setIsRubricPublished(Boolean(res.data.published));
      }
    } catch (err) {
      console.error('Failed to reload rubric after revision', err);
    }
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!name.trim()) {
      addToast('Round name is required', 'error');
      return;
    }

    if (!submissionEnabled && !evaluationEnabled) {
      addToast('At least one of Submissions or Judging must be enabled', 'error');
      return;
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
        eligibility: { mode: eligibility },
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

      // Save rubric if fields present
      const targetRoundId = savedRound.id;
      if (rubricFields.length > 0) {
        try {
          await api.put(`/admin/rounds/${targetRoundId}/rubric`, {
            rubricFields: rubricFields.map((rf, idx) => ({
              ...rf,
              sortOrder: idx,
            })),
          });
        } catch (rErr) {
          console.error('Failed to save rubric during round save', rErr);
        }
      }

      if (onSaved) onSaved(savedRound);
      onClose();
    } catch (err) {
      const d = err.response?.data?.detail;
      const msg = typeof d === 'string' ? d : d?.message || 'Failed to save round';
      addToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={isNew ? 'Create Unified Event Round' : `Edit Round: ${name}`}
      maxWidth={activeTab === 'judging' && judgingSubTab !== 'settings' ? '1060px' : activeTab === 'rubric' ? '960px' : '840px'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-color)',
            gap: '8px',
            overflowX: 'auto',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'transparent',
              fontSize: '0.88rem',
              fontWeight: 700,
              cursor: 'pointer',
              borderBottom: activeTab === 'general' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'general' ? 'var(--primary)' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Settings2 size={16} /> General
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('submissions')}
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'transparent',
              fontSize: '0.88rem',
              fontWeight: 700,
              cursor: 'pointer',
              borderBottom: activeTab === 'submissions' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'submissions' ? 'var(--primary)' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <FileText size={16} /> Submissions
            {submissionEnabled && (
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#22c55e',
                }}
              />
            )}
          </button>

          {features?.evaluation !== false && (
            <button
              type="button"
              onClick={() => setActiveTab('judging')}
              style={{
                padding: '10px 16px',
                border: 'none',
                background: 'transparent',
                fontSize: '0.88rem',
                fontWeight: 700,
                cursor: 'pointer',
                borderBottom: activeTab === 'judging' ? '2px solid var(--primary)' : '2px solid transparent',
                color: activeTab === 'judging' ? 'var(--primary)' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Sliders size={16} /> Judging
              {evaluationEnabled && (
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--primary)',
                  }}
                />
              )}
            </button>
          )}

          {features?.evaluation !== false && evaluationEnabled && (
            <button
              type="button"
              onClick={() => setActiveTab('rubric')}
              style={{
                padding: '10px 16px',
                border: 'none',
                background: 'transparent',
                fontSize: '0.88rem',
                fontWeight: 700,
                cursor: 'pointer',
                borderBottom: activeTab === 'rubric' ? '2px solid var(--primary)' : '2px solid transparent',
                color: activeTab === 'rubric' ? 'var(--primary)' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Scale size={16} /> Scoring Rubric
            </button>
          )}
        </div>

        {/* Tab 1: General Info */}
        {activeTab === 'general' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                  Round Name *
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Round 1 - Ideation & Prototype"
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
                  onChange={(e) => setNumber(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                  Round Status
                </label>
                <select
                  className="form-input"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="live">Live (Ongoing)</option>
                  <option value="draft">Draft (Upcoming)</option>
                  <option value="closed">Closed (Finished)</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                Description & Instructions
              </label>
              <textarea
                className="form-input"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Guidelines, evaluation context, or deliverables instructions..."
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                  <Calendar size={14} style={{ display: 'inline', marginRight: '4px' }} /> Window Opens At
                </label>
                <input
                  type="datetime-local"
                  className="form-input"
                  value={opensAt}
                  onChange={(e) => setOpensAt(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                  <Clock size={14} style={{ display: 'inline', marginRight: '4px' }} /> Window Closes At
                </label>
                <input
                  type="datetime-local"
                  className="form-input"
                  value={closesAt}
                  onChange={(e) => setClosesAt(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Submissions */}
        {activeTab === 'submissions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div
              className="glass-panel"
              style={{
                padding: '16px 20px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '14px',
              }}
            >
              <div>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Enable Team Submissions</h4>
                <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Allow team leaders to upload code repository links, presentation slide links, and answers.
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
                  className="glass-card"
                  style={{
                    padding: '14px 18px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
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
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8rem', fontWeight: 600 }}
                  >
                    {isSubmissionOpen ? 'Close Submissions' : 'Open Submissions'}
                  </button>
                </div>

                <SubmissionFieldsEditor
                  fields={submissionFields}
                  onChange={setSubmissionFields}
                />
              </>
            )}
          </div>
        )}

        {/* Tab 3: Judging */}
        {activeTab === 'judging' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div
              className="glass-panel"
              style={{
                padding: '16px 20px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '14px',
              }}
            >
              <div>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Enable Judging & Scoring</h4>
                <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Assign evaluation panels and judges to assess participant teams against a standardized rubric.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEvaluationEnabled(!evaluationEnabled)}
                className="btn btn-icon"
                style={{ color: evaluationEnabled ? 'var(--primary)' : 'var(--text-muted)' }}
              >
                {evaluationEnabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
              </button>
            </div>

            {evaluationEnabled && !isNew && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  borderBottom: '1px solid var(--border-color)',
                  paddingBottom: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  onClick={() => setJudgingSubTab('settings')}
                  className={`btn ${judgingSubTab === 'settings' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.82rem', padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Settings2 size={14} /> Judging Rules
                </button>
                <button
                  type="button"
                  onClick={() => setJudgingSubTab('assignments')}
                  className={`btn ${judgingSubTab === 'assignments' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.82rem', padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Users size={14} /> Judge Assignments & Wizard
                </button>
                <button
                  type="button"
                  onClick={() => setJudgingSubTab('progress')}
                  className={`btn ${judgingSubTab === 'progress' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.82rem', padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Award size={14} /> Judging Progress Console
                </button>
                {isRubricLocked && (
                  <button
                    type="button"
                    onClick={() => setShowReviseRubricModal(true)}
                    className="btn btn-secondary"
                    style={{
                      marginLeft: 'auto',
                      fontSize: '0.8rem',
                      color: '#ef4444',
                      borderColor: 'rgba(239, 68, 68, 0.4)',
                    }}
                  >
                    Revise Rubric
                  </button>
                )}
              </div>
            )}

            {evaluationEnabled && (!isNew && judgingSubTab === 'assignments') && (
              <AssignmentWizard roundId={round.id} features={features} />
            )}

            {evaluationEnabled && (!isNew && judgingSubTab === 'progress') && (
              <JudgingProgressConsole roundId={round.id} roundName={name} />
            )}

            {evaluationEnabled && (isNew || judgingSubTab === 'settings') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                      Score Aggregation Method
                    </label>
                    <select
                      className="form-input"
                      value={aggregation}
                      onChange={(e) => setAggregation(e.target.value)}
                    >
                      <option value="mean">Mean (Average of all judges)</option>
                      <option value="median">Median (Middle value)</option>
                      <option value="trimmed_mean">Trimmed Mean (Drop highest & lowest)</option>
                    </select>
                  </div>

                  {aggregation === 'trimmed_mean' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                        Trim Count (Highest & Lowest to drop)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        className="form-input"
                        value={trimCount}
                        onChange={(e) => setTrimCount(e.target.value)}
                      />
                    </div>
                  )}

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                      Total Scale (Target Score Base)
                    </label>
                    <input
                      type="number"
                      min="10"
                      max="1000"
                      className="form-input"
                      value={totalScale}
                      onChange={(e) => setTotalScale(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                    Team Eligibility
                  </label>
                  <select
                    className="form-input"
                    value={eligibility}
                    onChange={(e) => setEligibility(e.target.value)}
                  >
                    <option value="all">All registered & active teams</option>
                    <option value="advanced" disabled title="Available after results release">
                      Advanced from previous round (Available after results release)
                    </option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Rubric */}
        {activeTab === 'rubric' && (
          <RubricEditor
            roundId={round?.id}
            rubricFields={rubricFields}
            onChangeFields={setRubricFields}
            isLocked={isRubricLocked}
            isPublished={isRubricPublished}
            evaluationEnabled={evaluationEnabled}
            onPublishChanged={(pub) => setIsRubricPublished(pub)}
            onReviseRubric={() => setShowReviseRubricModal(true)}
          />
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

        {/* Footer Buttons */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            borderTop: '1px solid var(--border-color)',
            paddingTop: '16px',
          }}
        >
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Save size={16} /> {saving ? 'Saving...' : 'Save Round'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default RoundEditor;
