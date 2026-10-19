import React, { useState, useMemo, useEffect } from 'react';
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
  Wand2,
  Layers,
  HelpCircle,
  FileText,
  Tag,
  Target,
  Info,
  ChevronDown,
  ChevronRight,
  Edit3,
  X,
  Pencil,
  Check,
} from 'lucide-react';
import api from '../../services/api';
import Modal from '../../components/Modal';
import { useToast } from '../../contexts/ToastContext';

// Helper to validate criterion anchors strictly according to evaluation rules:
// 1. Lower limit of first anchor is 0
// 2. Next anchor lower starts exactly from last anchor upper limit
// 3. Only whole integers allowed for marks and limits
// 4. from < to for every anchor
// 5. Last anchor upper limit equals maxMarks
const validateCriterionAnchors = (field) => {
  if (field.type !== 'numeric') return { valid: true, errors: [] };
  const anchors = field.anchors;
  if (!Array.isArray(anchors) || anchors.length === 0) {
    return { valid: true, errors: [] };
  }
  const maxMarks = Number(field.maxMarks);
  const errors = [];

  if (!Number.isInteger(maxMarks) || maxMarks <= 0) {
    errors.push('Max marks must be a positive integer.');
  }

  // Check first anchor starts at 0
  const firstFrom = Number(anchors[0].from);
  if (firstFrom !== 0) {
    errors.push(`First benchmark must start at 0 (currently ${firstFrom}).`);
  }

  for (let i = 0; i < anchors.length; i++) {
    const from = Number(anchors[i].from);
    const to = Number(anchors[i].to);

    if (!Number.isInteger(from) || !Number.isInteger(to)) {
      errors.push(`Benchmark #${i + 1} limits must be whole integers.`);
    }

    if (from >= to) {
      errors.push(`Benchmark #${i + 1} 'From' (${from}) must be strictly less than 'To' (${to}).`);
    }

    if (i > 0) {
      const prevTo = Number(anchors[i - 1].to);
      if (from !== prevTo) {
        errors.push(`Benchmark #${i + 1} 'From' (${from}) must start exactly where #${i} ended (${prevTo}).`);
      }
    }
  }

  // Check last anchor ends at maxMarks
  const lastTo = Number(anchors[anchors.length - 1].to);
  if (lastTo !== maxMarks) {
    errors.push(`Last benchmark must end at max marks (${maxMarks}). Currently ends at ${lastTo}.`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

export const RubricEditor = ({
  roundId,
  rubricFields = [],
  onChangeFields,
  guidance = [],
  onChangeGuidance,
  isLocked = false,
  isPublished = false,
  onPublishChanged,
  evaluationEnabled = true,
  onReviseRubric,
}) => {
  const { addToast } = useToast();
  const [publishing, setPublishing] = useState(false);

  // Problem statements pool
  const [problemStatements, setProblemStatements] = useState([]);
  const [psLoading, setPsLoading] = useState(false);
  const [selectedPsId, setSelectedPsId] = useState(null);

  // Load problem statements
  useEffect(() => {
    let isMounted = true;
    const fetchPS = async () => {
      setPsLoading(true);
      try {
        const res = await api.get('/admin/problem-statements');
        if (isMounted && res.data) {
          setProblemStatements(res.data);
          if (res.data.length > 0) {
            setSelectedPsId((prev) => {
              if (prev) return prev;
              const existingWithPs = rubricFields.find((f) => f.problemStatementId);
              return existingWithPs ? existingWithPs.problemStatementId : res.data[0].id;
            });
          }
        }
      } catch (err) {
        console.error('Failed to load problem statements for rubric editor', err);
      } finally {
        if (isMounted) setPsLoading(false);
      }
    };
    fetchPS();
    return () => {
      isMounted = false;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Modular Sections State
  // -------------------------------------------------------------------------
  const [sections, setSections] = useState(() => {
    const hasPs = rubricFields.some((f) => Boolean(f.problemStatementId));
    if (hasPs) {
      const genNumeric = rubricFields.filter((f) => !f.problemStatementId && f.type === 'numeric');
      const genWeightSum = genNumeric.reduce((acc, f) => acc + (parseFloat(f.weight) || 0), 0);
      const genTarget = genWeightSum > 0 ? genWeightSum : 60;
      const psTarget = Math.max(0, 100 - genTarget);
      return [
        { id: 'sec_general', title: 'Section B: General Criteria', isPsSpecific: false, targetWeight: genTarget },
        { id: 'sec_ps', title: 'Section A: Problem Statement Specific', isPsSpecific: true, targetWeight: psTarget },
      ];
    }
    return [
      { id: 'sec_general', title: 'Evaluation Criteria', isPsSpecific: false, targetWeight: 100 },
    ];
  });

  const [activeSectionId, setActiveSectionId] = useState(() => sections[0]?.id || 'sec_general');
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [editSectionTitleVal, setEditSectionTitleVal] = useState('');
  const [showAddSectionModal, setShowAddSectionModal] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionIsPs, setNewSectionIsPs] = useState(false);
  const [newSectionWeight, setNewSectionWeight] = useState(40);

  // Active section object
  const activeSection = useMemo(() => {
    return sections.find((s) => s.id === activeSectionId) || sections[0] || {
      id: 'sec_general',
      title: 'General Criteria',
      isPsSpecific: false,
      targetWeight: 100,
    };
  }, [sections, activeSectionId]);

  // Synchronize target weights if there is only 1 section
  useEffect(() => {
    if (sections.length === 1 && sections[0].targetWeight !== 100) {
      setSections([{ ...sections[0], targetWeight: 100 }]);
    }
  }, [sections.length]);

  // Section target weight sum
  const totalSectionTargetWeight = useMemo(() => {
    return sections.reduce((acc, s) => acc + (parseFloat(s.targetWeight) || 0), 0);
  }, [sections]);
  const isSectionSplitValid = Math.abs(totalSectionTargetWeight - 100) < 0.001;

  // General fields
  const generalFields = useMemo(
    () => rubricFields.filter((f) => !f.problemStatementId),
    [rubricFields]
  );
  const generalNumericFields = useMemo(
    () => generalFields.filter((f) => f.type === 'numeric'),
    [generalFields]
  );
  const generalWeight = useMemo(() => {
    return generalNumericFields.reduce((acc, f) => acc + (parseFloat(f.weight) || 0), 0);
  }, [generalNumericFields]);

  // Active PS fields (for PS-specific sections)
  const currentPsFields = useMemo(
    () => rubricFields.filter((f) => f.problemStatementId === selectedPsId),
    [rubricFields, selectedPsId]
  );
  const currentPsNumericFields = useMemo(
    () => currentPsFields.filter((f) => f.type === 'numeric'),
    [currentPsFields]
  );
  const currentPsWeight = useMemo(() => {
    return currentPsNumericFields.reduce((acc, f) => acc + (parseFloat(f.weight) || 0), 0);
  }, [currentPsNumericFields]);

  // PS weights map: psId -> total numeric weight
  const psWeights = useMemo(() => {
    const map = {};
    for (const f of rubricFields) {
      if (f.problemStatementId && f.type === 'numeric') {
        map[f.problemStatementId] = (map[f.problemStatementId] || 0) + (parseFloat(f.weight) || 0);
      }
    }
    return map;
  }, [rubricFields]);

  // Guidance for the currently selected PS
  const currentGuidance = useMemo(() => {
    return (
      (guidance || []).find((g) => g.problemStatementId === selectedPsId) || {
        decisiveTest: '',
        notes: '',
      }
    );
  }, [guidance, selectedPsId]);

  const handleUpdateGuidance = (key, val) => {
    if (!selectedPsId || !onChangeGuidance) return;
    const list = Array.isArray(guidance) ? [...guidance] : [];
    const idx = list.findIndex((g) => g.problemStatementId === selectedPsId);
    if (idx >= 0) {
      list[idx] = { ...list[idx], [key]: val };
    } else {
      list.push({
        problemStatementId: selectedPsId,
        decisiveTest: key === 'decisiveTest' ? val : '',
        notes: key === 'notes' ? val : '',
      });
    }
    onChangeGuidance(list);
  };

  // -------------------------------------------------------------------------
  // UNIFORM "Add Field" Handlers (Fixed placement and predictable behavior)
  // -------------------------------------------------------------------------
  const handleAddNumericCriterion = () => {
    if (isLocked) return;
    const isPs = Boolean(activeSection?.isPsSpecific);
    if (isPs && !selectedPsId) {
      addToast('Please select a Problem Statement first.', 'warning');
      return;
    }
    const psObj = isPs ? problemStatements.find((p) => p.id === selectedPsId) : null;
    const psCode = psObj?.code || 'PS';
    const nextKey = `rf_${Date.now()}`;
    const next = [
      ...rubricFields,
      {
        fieldKey: nextKey,
        type: 'numeric',
        label: isPs
          ? `${psCode} Criterion ${currentPsNumericFields.length + 1}`
          : `Criterion ${generalNumericFields.length + 1}`,
        description: '',
        sortOrder: rubricFields.length,
        isRequired: true,
        maxMarks: 10,
        weight: 10,
        problemStatementId: isPs ? selectedPsId : null,
        anchors: [
          { from: 0, to: 4, label: 'Needs Improvement' },
          { from: 4, to: 8, label: 'Proficient' },
          { from: 8, to: 10, label: 'Exceptional' },
        ],
      },
    ];
    onChangeFields(next);
  };

  const handleAddTextFeedback = () => {
    if (isLocked) return;
    const isPs = Boolean(activeSection?.isPsSpecific);
    const nextKey = `rf_${Date.now()}`;
    const next = [
      ...rubricFields,
      {
        fieldKey: nextKey,
        type: 'text',
        label: 'Constructive Feedback',
        description: 'Qualitative notes and improvement suggestions',
        sortOrder: rubricFields.length,
        isRequired: false,
        visibility: 'participant',
        maxLength: 500,
        problemStatementId: isPs ? selectedPsId : null,
      },
    ];
    onChangeFields(next);
  };

  // Field attribute change by fieldKey
  const handleFieldChange = (fieldKey, key, val) => {
    const next = rubricFields.map((f) => {
      if ((f.fieldKey || f.id) === fieldKey) {
        return { ...f, [key]: val };
      }
      return f;
    });
    onChangeFields(next);
  };

  // Remove field by fieldKey
  const handleRemoveField = (fieldKey) => {
    if (isLocked) return;
    const next = rubricFields.filter((f) => (f.fieldKey || f.id) !== fieldKey);
    onChangeFields(next);
  };

  // Move field within active section
  const handleMoveField = (fieldKey, direction, sectionList) => {
    if (isLocked) return;
    const secIdx = sectionList.findIndex((f) => (f.fieldKey || f.id) === fieldKey);
    const targetSecIdx = secIdx + direction;
    if (targetSecIdx < 0 || targetSecIdx >= sectionList.length) return;

    const targetKey = sectionList[targetSecIdx].fieldKey || sectionList[targetSecIdx].id;
    const fullIdx = rubricFields.findIndex((f) => (f.fieldKey || f.id) === fieldKey);
    const fullTargetIdx = rubricFields.findIndex((f) => (f.fieldKey || f.id) === targetKey);

    const next = [...rubricFields];
    const temp = next[fullIdx];
    next[fullIdx] = next[fullTargetIdx];
    next[fullTargetIdx] = temp;
    next.forEach((f, i) => {
      f.sortOrder = i;
    });
    onChangeFields(next);
  };

  // Anchor Handlers
  const handleAddAnchor = (fieldKey) => {
    const field = rubricFields.find((f) => (f.fieldKey || f.id) === fieldKey);
    if (!field) return;
    const anchors = Array.isArray(field.anchors) ? [...field.anchors] : [];
    const maxMarks = Math.round(Number(field.maxMarks)) || 10;
    const lastTo = anchors.length > 0 ? Number(anchors[anchors.length - 1].to) : 0;
    const nextFrom = lastTo;
    const nextTo = Math.min(maxMarks, nextFrom + Math.max(1, Math.round(maxMarks / 3)));

    anchors.push({
      from: nextFrom,
      to: nextTo,
      label: `Benchmark Level ${anchors.length + 1}`,
    });
    handleFieldChange(fieldKey, 'anchors', anchors);
  };

  const handleAnchorChange = (fieldKey, anchorIdx, key, val) => {
    const field = rubricFields.find((f) => (f.fieldKey || f.id) === fieldKey);
    if (!field) return;
    const anchors = Array.isArray(field.anchors) ? [...field.anchors] : [];
    if (!anchors[anchorIdx]) return;
    const numVal = key === 'label' ? val : (val === '' ? '' : Math.max(0, parseInt(val, 10) || 0));
    anchors[anchorIdx] = { ...anchors[anchorIdx], [key]: numVal };
    handleFieldChange(fieldKey, 'anchors', anchors);
  };

  const handleBlurAnchor = (fieldKey, anchorIdx, key) => {
    const field = rubricFields.find((f) => (f.fieldKey || f.id) === fieldKey);
    if (!field) return;
    const anchors = Array.isArray(field.anchors) ? [...field.anchors] : [];
    if (!anchors[anchorIdx]) return;
    if (anchors[anchorIdx][key] === '' || isNaN(anchors[anchorIdx][key])) {
      anchors[anchorIdx] = { ...anchors[anchorIdx], [key]: 0 };
      handleFieldChange(fieldKey, 'anchors', anchors);
    }
  };

  const handleRemoveAnchor = (fieldKey, anchorIdx) => {
    const field = rubricFields.find((f) => (f.fieldKey || f.id) === fieldKey);
    if (!field) return;
    const anchors = (field.anchors || []).filter((_, i) => i !== anchorIdx);
    handleFieldChange(fieldKey, 'anchors', anchors);
  };

  const handleAutoAlignAnchors = (fieldKey) => {
    const field = rubricFields.find((f) => (f.fieldKey || f.id) === fieldKey);
    if (!field) return;
    const anchors = Array.isArray(field.anchors) ? [...field.anchors] : [];
    if (anchors.length === 0) return;
    const maxMarks = Math.round(Number(field.maxMarks)) || 10;
    const n = anchors.length;

    let cur = 0;
    const nextAnchors = anchors.map((a, i) => {
      const from = cur;
      const targetTo = i === n - 1 ? maxMarks : Math.max(from + 1, Math.round(((i + 1) * maxMarks) / n));
      const to = i === n - 1 ? maxMarks : targetTo;
      cur = to;
      return { ...a, from, to };
    });
    nextAnchors[n - 1].to = maxMarks;

    handleFieldChange(fieldKey, 'anchors', nextAnchors);
    addToast(`Aligned benchmarks to contiguous scale (0 → ${maxMarks})`, 'success');
  };

  const handleApplyPreset = (fieldKey, presetType) => {
    const field = rubricFields.find((f) => (f.fieldKey || f.id) === fieldKey);
    if (!field) return;
    const maxMarks = Math.round(Number(field.maxMarks)) || 10;
    let nextAnchors = [];

    if (presetType === '3tier') {
      const p1 = Math.max(1, Math.round(maxMarks * 0.4));
      const p2 = Math.max(p1 + 1, Math.round(maxMarks * 0.8));
      nextAnchors = [
        { from: 0, to: p1, label: 'Needs Improvement / Developing' },
        { from: p1, to: p2, label: 'Proficient / Meets Expectations' },
        { from: p2, to: maxMarks, label: 'Exceptional / Exceeds Expectations' },
      ];
    } else if (presetType === '4tier') {
      const p1 = Math.max(1, Math.round(maxMarks * 0.25));
      const p2 = Math.max(p1 + 1, Math.round(maxMarks * 0.5));
      const p3 = Math.max(p2 + 1, Math.round(maxMarks * 0.75));
      nextAnchors = [
        { from: 0, to: p1, label: 'Novice (Below Basic)' },
        { from: p1, to: p2, label: 'Developing (Approaching Standards)' },
        { from: p2, to: p3, label: 'Proficient (Meets Standards)' },
        { from: p3, to: maxMarks, label: 'Advanced (Exceeds Standards)' },
      ];
    }

    handleFieldChange(fieldKey, 'anchors', nextAnchors);
    addToast(`Applied ${presetType === '3tier' ? '3-tier' : '4-tier'} benchmarks (0 → ${maxMarks})`, 'success');
  };

  // -------------------------------------------------------------------------
  // Modular Section Weight Balancers
  // -------------------------------------------------------------------------
  const handleDistributeActiveSection = () => {
    if (isLocked) return;
    const target = parseFloat(activeSection.targetWeight) || 0;
    if (activeSection.isPsSpecific) {
      if (currentPsNumericFields.length === 0) return;
      const count = currentPsNumericFields.length;
      const base = Math.floor((target / count) * 100) / 100;
      const remainder = Math.round((target - base * count) * 100) / 100;
      let idx = 0;
      const next = rubricFields.map((f) => {
        if (f.problemStatementId === selectedPsId && f.type === 'numeric') {
          const w = idx === 0 ? base + remainder : base;
          idx++;
          return { ...f, weight: w };
        }
        return f;
      });
      onChangeFields(next);
      addToast(`Distributed weights evenly across active PS criteria (${target}%)`, 'info');
    } else {
      if (generalNumericFields.length === 0) return;
      const count = generalNumericFields.length;
      const base = Math.floor((target / count) * 100) / 100;
      const remainder = Math.round((target - base * count) * 100) / 100;
      let idx = 0;
      const next = rubricFields.map((f) => {
        if (!f.problemStatementId && f.type === 'numeric') {
          const w = idx === 0 ? base + remainder : base;
          idx++;
          return { ...f, weight: w };
        }
        return f;
      });
      onChangeFields(next);
      addToast(`Distributed weights evenly across ${activeSection.title} (${target}%)`, 'info');
    }
  };

  const handleNormaliseActiveSection = () => {
    if (isLocked) return;
    const target = parseFloat(activeSection.targetWeight) || 0;
    if (activeSection.isPsSpecific) {
      if (currentPsWeight <= 0) return;
      const next = rubricFields.map((f) => {
        if (f.problemStatementId === selectedPsId && f.type === 'numeric') {
          const cur = parseFloat(f.weight) || 0;
          const normalized = Math.round((cur / currentPsWeight) * target * 100) / 100;
          return { ...f, weight: normalized };
        }
        return f;
      });
      onChangeFields(next);
      addToast(`Normalized active PS criteria weights to ${target}%`, 'info');
    } else {
      if (generalWeight <= 0) return;
      const next = rubricFields.map((f) => {
        if (!f.problemStatementId && f.type === 'numeric') {
          const cur = parseFloat(f.weight) || 0;
          const normalized = Math.round((cur / generalWeight) * target * 100) / 100;
          return { ...f, weight: normalized };
        }
        return f;
      });
      onChangeFields(next);
      addToast(`Normalized ${activeSection.title} weights to ${target}%`, 'info');
    }
  };

  // -------------------------------------------------------------------------
  // Section Management Handlers
  // -------------------------------------------------------------------------
  const handleOpenAddSection = () => {
    const hasPsSection = sections.some((s) => s.isPsSpecific);
    setNewSectionTitle(hasPsSection ? 'Viva & Pitch Presentation' : 'Section A: Problem Statement Specific Criteria');
    setNewSectionIsPs(!hasPsSection);
    setNewSectionWeight(40);
    setShowAddSectionModal(true);
  };

  const handleConfirmAddSection = () => {
    if (!newSectionTitle.trim()) {
      addToast('Section title cannot be empty.', 'error');
      return;
    }
    const secId = `sec_${Date.now()}`;
    const weightVal = Math.max(0, Math.min(100, parseInt(newSectionWeight, 10) || 0));
    const newSec = {
      id: secId,
      title: newSectionTitle.trim(),
      isPsSpecific: newSectionIsPs,
      targetWeight: weightVal,
    };

    // Rebalance existing sections so total equals 100%
    const currentFirst = sections[0];
    const updatedFirst = { ...currentFirst, targetWeight: Math.max(1, 100 - weightVal) };
    const nextSections = [updatedFirst, newSec];

    setSections(nextSections);
    setActiveSectionId(secId);
    setShowAddSectionModal(false);
    addToast(`Added section "${newSec.title}" (${weightVal}%).`, 'success');
  };

  const handleUpdateSectionWeight = (secId, val) => {
    if (val === '') {
      setSections((prev) =>
        prev.map((s) => (s.id === secId ? { ...s, targetWeight: '' } : s))
      );
      return;
    }
    const parsed = parseInt(val, 10);
    const num = isNaN(parsed) ? 0 : Math.max(0, Math.min(100, parsed));
    setSections((prev) =>
      prev.map((s) => (s.id === secId ? { ...s, targetWeight: num } : s))
    );
  };

  const handleBlurSectionWeight = (secId) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id === secId) {
          const val = s.targetWeight === '' || isNaN(s.targetWeight) ? 0 : Math.max(0, Math.min(100, Number(s.targetWeight)));
          return { ...s, targetWeight: val };
        }
        return s;
      })
    );
  };

  const handleStartRenameSection = (sec, e) => {
    if (e) e.stopPropagation();
    if (isLocked) return;
    setEditingSectionId(sec.id);
    setEditSectionTitleVal(sec.title);
  };

  const handleSaveSectionTitle = (secId) => {
    const trimmed = editSectionTitleVal.trim();
    if (!trimmed) {
      addToast('Section title cannot be empty.', 'error');
      return;
    }
    setSections((prev) =>
      prev.map((s) => (s.id === secId ? { ...s, title: trimmed } : s))
    );
    setEditingSectionId(null);
    addToast(`Section renamed to "${trimmed}".`, 'success');
  };

  const handleDeleteSection = (secId) => {
    if (sections.length <= 1) {
      addToast('Cannot delete the only evaluation section.', 'warning');
      return;
    }
    const secToDelete = sections.find((s) => s.id === secId);
    if (!secToDelete) return;

    if (window.confirm(`Are you sure you want to remove "${secToDelete.title}"? Any criteria assigned to it will be unlinked.`)) {
      const remaining = sections.filter((s) => s.id !== secId);
      // If only 1 section remains, lock its weight to 100%
      if (remaining.length === 1) {
        remaining[0] = { ...remaining[0], targetWeight: 100 };
      }
      setSections(remaining);
      setActiveSectionId(remaining[0].id);

      // Clean up fields if deleting PS section
      if (secToDelete.isPsSpecific) {
        const cleanedFields = rubricFields.filter((f) => !f.problemStatementId);
        onChangeFields(cleanedFields);
      }
      addToast(`Removed section "${secToDelete.title}".`, 'info');
    }
  };

  // -------------------------------------------------------------------------
  // Publish Rubric Validation
  // -------------------------------------------------------------------------
  const handlePublish = async () => {
    if (!roundId) return;

    // Validate section target weights sum to 100
    if (!isSectionSplitValid) {
      addToast(`Total section weights must equal 100% (currently ${totalSectionTargetWeight.toFixed(1)}%).`, 'error');
      return;
    }

    // Validate each section's numeric criteria
    for (const sec of sections) {
      const targetW = parseFloat(sec.targetWeight) || 0;
      if (sec.isPsSpecific) {
        if (Object.keys(psWeights).length === 0) {
          addToast(`No criteria defined in ${sec.title}. Add criteria for each problem statement.`, 'error');
          return;
        }
        for (const [psId, w] of Object.entries(psWeights)) {
          if (Math.abs(w - targetW) >= 0.001) {
            const psObj = problemStatements.find((p) => p.id === psId);
            const psName = psObj?.code || 'Problem Statement';
            addToast(`Criteria for ${psName} in ${sec.title} must sum to ${targetW}% (currently ${w.toFixed(1)}%).`, 'error');
            return;
          }
        }
      } else {
        if (generalNumericFields.length === 0) {
          addToast(`No numeric criteria defined in ${sec.title}.`, 'error');
          return;
        }
        if (Math.abs(generalWeight - targetW) >= 0.001) {
          addToast(`Criteria in ${sec.title} must sum to ${targetW}% (currently ${generalWeight.toFixed(1)}%).`, 'error');
          return;
        }
      }
    }

    setPublishing(true);
    try {
      await api.post(`/admin/rounds/${roundId}/publish`);
      addToast('Scoring rubric published successfully! Judges can now score.', 'success');
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
      addToast('Rubric unpublished. Returned to draft status.', 'info');
      if (onPublishChanged) onPublishChanged(false);
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to unpublish rubric', 'error');
    } finally {
      setPublishing(false);
    }
  };

  // Active displayed fields for current view
  const activeDisplayedFields = activeSection.isPsSpecific ? currentPsFields : generalFields;
  const activeCurrentWeight = activeSection.isPsSpecific ? currentPsWeight : generalWeight;
  const isCurrentSectionBalanced = Math.abs(activeCurrentWeight - activeSection.targetWeight) < 0.001;
  const selectedPs = problemStatements.find((p) => p.id === selectedPsId);

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
          <Lock size={20} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <strong style={{ display: 'block', fontSize: '0.9rem' }}>
              Rubric locked: judges have started scoring
            </strong>
            <span style={{ fontSize: '0.8rem', opacity: 0.9 }}>
              Structural attributes, max marks, and weights cannot be modified. Only descriptions and descriptive benchmark anchors remain editable.
            </span>
          </div>
          {onReviseRubric && (
            <button
              type="button"
              onClick={onReviseRubric}
              className="btn btn-secondary"
              style={{
                fontSize: '0.8rem',
                color: '#ef4444',
                borderColor: 'rgba(239, 68, 68, 0.4)',
                background: 'rgba(239, 68, 68, 0.1)',
                whiteSpace: 'nowrap',
              }}
            >
              Revise Rubric
            </button>
          )}
        </div>
      )}

      {/* Header Actions & Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Scale size={20} color="var(--primary)" /> Evaluation Scoring Rubric
          </h4>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Modular evaluation structure. Configure general criteria and optional problem-statement specific parameters.
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
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* MODULAR SECTIONS BAR & WEIGHT MANAGER */}
      {/* --------------------------------------------------------------------- */}
      <div
        className="glass-card"
        style={{
          padding: '16px 20px',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          {/* Section Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {sections.map((sec) => {
              const isActive = sec.id === activeSectionId;
              const isEditingThis = editingSectionId === sec.id;

              if (isEditingThis) {
                return (
                  <div
                    key={sec.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 8px',
                      borderRadius: '8px',
                      background: 'var(--card-bg, rgba(255, 255, 255, 0.05))',
                      border: '1px solid var(--primary)',
                    }}
                  >
                    <input
                      type="text"
                      autoFocus
                      value={editSectionTitleVal}
                      onChange={(e) => setEditSectionTitleVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveSectionTitle(sec.id);
                        if (e.key === 'Escape') setEditingSectionId(null);
                      }}
                      className="form-input"
                      style={{ padding: '4px 8px', fontSize: '0.82rem', width: '210px', height: 'auto' }}
                      placeholder="Section title..."
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveSectionTitle(sec.id)}
                      className="btn btn-primary touch-target"
                      style={{ padding: '4px 6px', display: 'flex', alignItems: 'center' }}
                      title="Save section title"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSectionId(null)}
                      className="btn btn-secondary touch-target"
                      style={{ padding: '4px 6px', display: 'flex', alignItems: 'center' }}
                      title="Cancel"
                    >
                      <X size={13} />
                    </button>
                  </div>
                );
              }

              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setActiveSectionId(sec.id)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: isActive ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                    background: isActive ? 'var(--primary-glow, rgba(99, 102, 241, 0.12))' : 'rgba(255, 255, 255, 0.02)',
                    color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {sec.isPsSpecific ? <Target size={15} color="#eab308" /> : <Layers size={15} />}
                  <span>{sec.title}</span>
                  {!isLocked && isActive && (
                    <span
                      onClick={(e) => handleStartRenameSection(sec, e)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px',
                        borderRadius: '4px',
                        color: 'var(--primary)',
                        opacity: 0.85,
                      }}
                      title="Rename section"
                    >
                      <Pencil size={12} />
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: '0.72rem',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: isActive ? 'var(--primary)' : 'var(--border-color)',
                      color: isActive ? '#fff' : 'var(--text-secondary)',
                      fontWeight: 800,
                    }}
                  >
                    {sec.targetWeight}%
                  </span>
                </button>
              );
            })}

            {!isLocked && (
              <button
                type="button"
                onClick={handleOpenAddSection}
                className="btn btn-secondary touch-target"
                style={{
                  padding: '7px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Plus size={14} /> + Add Section
              </button>
            )}
          </div>

          {/* Section Weight Balancer Controls & Quick Rename */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{activeSection.title}</strong>
                {!isLocked && (
                  <button
                    type="button"
                    onClick={(e) => handleStartRenameSection(activeSection, e)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--primary)',
                      padding: '2px',
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                    title="Rename this section"
                  >
                    <Pencil size={13} />
                  </button>
                )}
                Target Weight:
              </span>

              {sections.length > 1 ? (
                <>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    disabled={isLocked}
                    className="form-input"
                    style={{ width: '65px', padding: '4px 8px', textAlign: 'center', fontSize: '0.85rem', fontWeight: 800 }}
                    value={activeSection.targetWeight !== undefined && activeSection.targetWeight !== null ? activeSection.targetWeight : ''}
                    onChange={(e) => handleUpdateSectionWeight(activeSection.id, e.target.value)}
                    onBlur={() => handleBlurSectionWeight(activeSection.id)}
                  />
                  <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>%</span>
                </>
              ) : (
                <span
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: 'rgba(34, 197, 94, 0.1)',
                    color: '#22c55e',
                  }}
                >
                  100% (Single Section Locked)
                </span>
              )}
            </div>

            {!isLocked && sections.length > 1 && (
              <button
                type="button"
                onClick={() => handleDeleteSection(activeSection.id)}
                className="btn btn-icon touch-target"
                title="Remove this section"
                style={{ color: '#ef4444', padding: '6px' }}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Visual Split Summary Bar */}
        {sections.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div
              style={{
                width: '100%',
                height: '8px',
                borderRadius: '4px',
                background: 'var(--border-color)',
                display: 'flex',
                overflow: 'hidden',
              }}
            >
              {sections.map((sec, idx) => {
                const w = parseFloat(sec.targetWeight) || 0;
                const colors = ['#6366f1', '#eab308', '#22c55e', '#ec4899'];
                return (
                  <div
                    key={sec.id}
                    style={{
                      width: `${w}%`,
                      height: '100%',
                      background: colors[idx % colors.length],
                    }}
                    title={`${sec.title}: ${w}%`}
                  />
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <span>
                Split: {sections.map((s) => `${s.title} (${s.targetWeight}%)`).join(' + ')}
              </span>
              <span style={{ fontWeight: 700, color: isSectionSplitValid ? '#22c55e' : '#ef4444' }}>
                Total: {totalSectionTargetWeight.toFixed(0)}% {isSectionSplitValid ? '(Balanced ✓)' : '(Must total 100%)'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* IF PS-SPECIFIC SECTION: PROBLEM STATEMENT SELECTOR & DECISIVE TEST */}
      {/* --------------------------------------------------------------------- */}
      {activeSection.isPsSpecific && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* PS Selector Bar */}
          <div
            className="glass-card"
            style={{
              padding: '16px 20px',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <strong style={{ fontSize: '0.92rem' }}>
                  Select Problem Statement ({activeSection.targetWeight} Marks per PS)
                </strong>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Each team is assigned to one PS. Judges evaluating that team will dynamically receive criteria for their PS.
                </p>
              </div>

              {problemStatements.length > 0 && (
                <div style={{ minWidth: '280px' }}>
                  <select
                    className="form-input"
                    value={selectedPsId || ''}
                    onChange={(e) => setSelectedPsId(e.target.value)}
                    style={{ fontSize: '0.85rem', fontWeight: 600 }}
                  >
                    {problemStatements.map((ps) => {
                      const w = psWeights[ps.id] || 0;
                      const isOk = Math.abs(w - activeSection.targetWeight) < 0.001;
                      return (
                        <option key={ps.id} value={ps.id}>
                          {ps.code}: {ps.title} ({w.toFixed(0)}/{activeSection.targetWeight}M {isOk ? '✓' : ''})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>

            {/* Quick Pills for All Problem Statements */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {problemStatements.map((ps) => {
                const isSelected = ps.id === selectedPsId;
                const w = psWeights[ps.id] || 0;
                const isOk = Math.abs(w - activeSection.targetWeight) < 0.001;
                return (
                  <button
                    key={ps.id}
                    type="button"
                    onClick={() => setSelectedPsId(ps.id)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                      background: isSelected
                        ? 'var(--primary)'
                        : isOk
                        ? 'rgba(34, 197, 94, 0.08)'
                        : 'rgba(255, 255, 255, 0.03)',
                      color: isSelected
                        ? '#ffffff'
                        : isOk
                        ? '#22c55e'
                        : 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>{ps.code}</span>
                    <span style={{ fontSize: '0.7rem', opacity: 0.9 }}>
                      ({w.toFixed(0)}/{activeSection.targetWeight})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active PS Guidance & Decisive Test Card */}
          {selectedPs && (
            <div
              className="glass-card"
              style={{
                padding: '20px 22px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                borderLeft: '5px solid #d97706',
                background: 'var(--card-bg, rgba(255, 255, 255, 0.03))',
                boxShadow: '0 4px 16px -4px rgba(0, 0, 0, 0.06)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '3px 8px',
                      borderRadius: '5px',
                      background: 'rgba(217, 119, 6, 0.12)',
                      color: '#b45309',
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    <Target size={14} color="#b45309" /> Live Judging Guidance
                  </span>
                  <h5 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {selectedPs.code} — {selectedPs.title}
                  </h5>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  This decisive test and judging guidance will be displayed prominently as a high-priority banner on the Judge's Console when evaluating teams for this Problem Statement.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    <span>Decisive Stress Test / Required Edge Case <span style={{ color: '#dc2626' }}>*</span></span>
                  </label>
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Mandatory live test the judge must request the team to execute on the spot (e.g. simulate offline network, test tampered token).
                  </span>
                  <textarea
                    rows={3}
                    disabled={isLocked}
                    value={currentGuidance.decisiveTest || ''}
                    onChange={(e) => handleUpdateGuidance('decisiveTest', e.target.value)}
                    placeholder="e.g. Disconnect the internet and give a local-language input to verify offline fallback and graceful sync..."
                    className="form-input"
                    style={{
                      fontSize: '0.85rem',
                      lineHeight: 1.5,
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    <span>Evaluation Guidance Notes for Judges</span>
                  </label>
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Technical rubrics or performance thresholds for judges to inspect (e.g. verify sandbox latency &lt; 100ms, check GPU RAM).
                  </span>
                  <textarea
                    rows={3}
                    disabled={isLocked}
                    value={currentGuidance.notes || ''}
                    onChange={(e) => handleUpdateGuidance('notes', e.target.value)}
                    placeholder="e.g. Inspect accuracy threshold, check whether confidence score drops on poor images..."
                    className="form-input"
                    style={{
                      fontSize: '0.85rem',
                      lineHeight: 1.5,
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* ACTIVE SECTION WEIGHT BALANCE BAR */}
      {/* --------------------------------------------------------------------- */}
      <div
        className="glass-card"
        style={{
          padding: '16px 20px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          borderLeft: `5px solid ${isCurrentSectionBalanced ? '#16a34a' : '#d97706'}`,
          background: isCurrentSectionBalanced
            ? 'rgba(34, 197, 94, 0.05)'
            : 'rgba(217, 119, 6, 0.05)',
          boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.04)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: isCurrentSectionBalanced ? 'rgba(34, 197, 94, 0.15)' : 'rgba(217, 119, 6, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {isCurrentSectionBalanced ? (
                <CheckCircle2 size={18} color="#16a34a" />
              ) : (
                <AlertTriangle size={18} color="#d97706" />
              )}
            </div>
            <div>
              <div style={{ fontSize: '0.94rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {activeSection.isPsSpecific ? `${selectedPs?.code || 'PS'} Criteria Weight:` : `${activeSection.title} Weight:`}{' '}
                <span style={{ color: isCurrentSectionBalanced ? '#16a34a' : '#d97706' }}>
                  {activeCurrentWeight.toFixed(1)}%
                </span>{' '}
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                  / {activeSection.targetWeight}% Target
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: isCurrentSectionBalanced ? '#16a34a' : '#b45309',
                }}
              >
                {isCurrentSectionBalanced
                  ? `✓ Criteria weights perfectly match the ${activeSection.targetWeight}% section allocation.`
                  : `(Must equal exactly ${activeSection.targetWeight}%)`}
              </span>
            </div>
          </div>

          {!isLocked && (activeSection.isPsSpecific ? currentPsNumericFields.length > 0 : generalNumericFields.length > 0) && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={handleDistributeActiveSection}
                className="btn btn-secondary"
                style={{ fontSize: '0.78rem', padding: '5px 12px', height: '32px', fontWeight: 600 }}
              >
                Distribute Evenly ({activeSection.targetWeight}%)
              </button>
              <button
                type="button"
                onClick={handleNormaliseActiveSection}
                className="btn btn-secondary"
                style={{ fontSize: '0.78rem', padding: '5px 12px', height: '32px', fontWeight: 600 }}
              >
                Normalise to {activeSection.targetWeight}%
              </button>
            </div>
          )}
        </div>

        <div
          style={{
            width: '100%',
            height: '8px',
            borderRadius: '4px',
            background: 'var(--border-color)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.min((activeCurrentWeight / (activeSection.targetWeight || 1)) * 100, 100)}%`,
              height: '100%',
              background: isCurrentSectionBalanced ? '#16a34a' : '#d97706',
              transition: 'width 0.3s ease, background 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* UNIFORM CRITERIA ACTION BAR (SINGLE FIXED PLACE FOR ADDS) */}
      {/* --------------------------------------------------------------------- */}
      <div
        className="glass-panel"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 18px',
          borderRadius: '10px',
          background: 'var(--card-bg, rgba(255, 255, 255, 0.03))',
          border: '1px solid var(--border-color)',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.92rem', fontWeight: 800 }}>
            {activeSection.title} {activeSection.isPsSpecific && selectedPs ? `· ${selectedPs.code}` : ''}
          </span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            ({activeDisplayedFields.length} criteria defined)
          </span>
        </div>

        {/* UNIFORM FIXED BUTTONS FOR BOTH SECTIONS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={handleAddNumericCriterion}
            disabled={isLocked || (activeSection.isPsSpecific && !selectedPsId)}
            className="btn btn-primary touch-target"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700 }}
          >
            <Plus size={15} /> + Add Criterion
          </button>
          <button
            type="button"
            onClick={handleAddTextFeedback}
            disabled={isLocked}
            className="btn btn-secondary touch-target"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600 }}
          >
            <Plus size={15} /> + Feedback Text
          </button>
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* CRITERIA CARDS LIST FOR ACTIVE SECTION */}
      {/* --------------------------------------------------------------------- */}
      {activeDisplayedFields.length === 0 ? (
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
          <p style={{ margin: 0, fontSize: '0.95rem' }}>
            No criteria in {activeSection.title} {activeSection.isPsSpecific && selectedPs ? `(${selectedPs.code})` : ''} yet.
          </p>
          <p style={{ margin: '6px 0 16px 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Click "+ Add Criterion" or "+ Feedback Text" to add evaluation parameters.
          </p>
          <div style={{ display: 'inline-flex', gap: '8px' }}>
            <button
              type="button"
              onClick={handleAddNumericCriterion}
              disabled={isLocked || (activeSection.isPsSpecific && !selectedPsId)}
              className="btn btn-primary touch-target"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700 }}
            >
              <Plus size={15} /> + Add Criterion
            </button>
            <button
              type="button"
              onClick={handleAddTextFeedback}
              disabled={isLocked}
              className="btn btn-secondary touch-target"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600 }}
            >
              <Plus size={15} /> + Feedback Text
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {activeDisplayedFields.map((field, secIdx) => {
            const fieldKey = field.fieldKey || field.id;
            const anchorValidation = field.type === 'numeric' ? validateCriterionAnchors(field) : { valid: true, errors: [] };

            return (
              <div
                key={fieldKey}
                className="glass-card"
                style={{
                  padding: '20px',
                  borderRadius: '12px',
                  border: `1px solid ${!anchorValidation.valid ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-color)'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  background: 'var(--card-bg, var(--bg-card))',
                }}
              >
                {/* Row Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: field.problemStatementId ? 'rgba(234, 179, 8, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                        color: field.problemStatementId ? '#facc15' : 'var(--primary)',
                      }}
                    >
                      #{secIdx + 1} {field.type === 'numeric' ? 'Numeric Criterion' : 'Text Feedback'}
                    </span>
                    {field.problemStatementId && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'rgba(234, 179, 8, 0.12)',
                          color: '#facc15',
                        }}
                      >
                        {selectedPs?.code || 'PS'}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      disabled={isLocked || secIdx === 0}
                      onClick={() => handleMoveField(fieldKey, -1, activeDisplayedFields)}
                      className="btn btn-icon touch-target"
                      title="Move Up"
                      style={{ padding: '6px' }}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      type="button"
                      disabled={isLocked || secIdx === activeDisplayedFields.length - 1}
                      onClick={() => handleMoveField(fieldKey, 1, activeDisplayedFields)}
                      className="btn btn-icon touch-target"
                      title="Move Down"
                      style={{ padding: '6px' }}
                    >
                      <ArrowDown size={15} />
                    </button>
                    {!isLocked && (
                      <button
                        type="button"
                        onClick={() => handleRemoveField(fieldKey)}
                        className="btn btn-icon touch-target"
                        title="Delete Criterion"
                        style={{ color: '#ef4444', padding: '6px' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Main Fields Form Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
                  {/* Label */}
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Criterion Title / Label *
                    </label>
                    <input
                      type="text"
                      disabled={isLocked}
                      value={field.label || ''}
                      onChange={(e) => handleFieldChange(fieldKey, 'label', e.target.value)}
                      placeholder="e.g. Solution Feasibility & Architecture"
                      className="form-input"
                      style={{ fontSize: '0.88rem', fontWeight: 600 }}
                    />
                  </div>

                  {/* Description */}
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Guidance Description for Judges
                    </label>
                    <textarea
                      rows={2}
                      value={field.description || ''}
                      onChange={(e) => handleFieldChange(fieldKey, 'description', e.target.value)}
                      placeholder="Evaluation guidelines, key focus areas, and what constitutes a strong response..."
                      className="form-input"
                      style={{ fontSize: '0.82rem' }}
                    />
                  </div>

                  {/* Numeric specific: Max Marks & Weight */}
                  {field.type === 'numeric' && (
                    <>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          Max Marks (Integer) *
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          disabled={isLocked}
                          value={field.maxMarks !== undefined && field.maxMarks !== null ? field.maxMarks : ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                              handleFieldChange(fieldKey, 'maxMarks', '');
                            } else {
                              const val = parseInt(raw, 10);
                              handleFieldChange(fieldKey, 'maxMarks', isNaN(val) ? 0 : Math.max(0, val));
                            }
                          }}
                          onBlur={() => {
                            if (field.maxMarks === '' || isNaN(field.maxMarks) || Number(field.maxMarks) <= 0) {
                              handleFieldChange(fieldKey, 'maxMarks', 10);
                            }
                          }}
                          className="form-input"
                          style={{ fontSize: '0.88rem', fontWeight: 700 }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          Relative Weight (% Contribution) *
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          max="100"
                          disabled={isLocked}
                          value={field.weight !== undefined && field.weight !== null ? field.weight : ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                              handleFieldChange(fieldKey, 'weight', '');
                            } else {
                              const val = parseFloat(raw);
                              handleFieldChange(fieldKey, 'weight', isNaN(val) ? 0 : Math.max(0, val));
                            }
                          }}
                          onBlur={() => {
                            if (field.weight === '' || isNaN(field.weight)) {
                              handleFieldChange(fieldKey, 'weight', 0);
                            }
                          }}
                          className="form-input"
                          style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--primary)' }}
                        />
                      </div>
                    </>
                  )}

                  {/* Text specific: Audience / Visibility */}
                  {field.type === 'text' && (
                    <>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          Audience / Visibility
                        </label>
                        <select
                          disabled={isLocked}
                          value={field.visibility || 'participant'}
                          onChange={(e) => handleFieldChange(fieldKey, 'visibility', e.target.value)}
                          className="form-input"
                          style={{ fontSize: '0.84rem' }}
                        >
                          <option value="participant">Participant (Visible on scorecard release)</option>
                          <option value="staff">Staff Only (Private internal judging notes)</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          Max Characters
                        </label>
                        <input
                          type="number"
                          step="50"
                          min="50"
                          max="2000"
                          disabled={isLocked}
                          value={field.maxLength || 500}
                          onChange={(e) => handleFieldChange(fieldKey, 'maxLength', parseInt(e.target.value, 10) || 500)}
                          className="form-input"
                          style={{ fontSize: '0.84rem' }}
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Benchmark Anchors (Numeric Criteria Only) */}
                {field.type === 'numeric' && (
                  <div
                    style={{
                      borderTop: '1px solid var(--border-color)',
                      paddingTop: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sliders size={15} color="var(--primary)" />
                        <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                          Qualitative Benchmark Anchors ({field.anchors?.length || 0})
                        </span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          (Guides judges on score ranges)
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => handleApplyPreset(fieldKey, '3tier')}
                          className="btn btn-secondary touch-target"
                          style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                          title="Apply 3-tier benchmark scale"
                        >
                          <Wand2 size={12} /> 3-Tier Preset
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyPreset(fieldKey, '4tier')}
                          className="btn btn-secondary touch-target"
                          style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                          title="Apply 4-tier benchmark scale"
                        >
                          <Wand2 size={12} /> 4-Tier Preset
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddAnchor(fieldKey)}
                          className="btn btn-secondary touch-target"
                          style={{ fontSize: '0.72rem', padding: '3px 8px', fontWeight: 600 }}
                        >
                          <Plus size={12} /> + Add Anchor
                        </button>
                      </div>
                    </div>

                    {/* Benchmark Anchor Validation Warnings */}
                    {!anchorValidation.valid && (
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: 'rgba(239, 68, 68, 0.08)',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                          fontSize: '0.78rem',
                          color: '#ef4444',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                          <span>{anchorValidation.errors[0]}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAutoAlignAnchors(fieldKey)}
                          className="btn btn-secondary"
                          style={{
                            fontSize: '0.72rem',
                            padding: '3px 8px',
                            background: '#ef4444',
                            color: '#fff',
                            borderColor: '#ef4444',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Auto-Fix Now
                        </button>
                      </div>
                    )}

                    {Array.isArray(field.anchors) && field.anchors.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '80px 80px 1fr 34px',
                            gap: '8px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: 'var(--text-secondary)',
                            padding: '0 4px',
                          }}
                        >
                          <span>From (Min)</span>
                          <span>To (Max)</span>
                          <span>Description / Benchmark Criteria</span>
                          <span></span>
                        </div>

                        {field.anchors.map((anchor, aIdx) => (
                          <div
                            key={aIdx}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '80px 80px 1fr 34px',
                              gap: '8px',
                              alignItems: 'center',
                            }}
                          >
                            <input
                              type="number"
                              step="1"
                              min="0"
                              max={field.maxMarks || 10}
                              className="form-input"
                              style={{ padding: '6px 8px', fontSize: '0.82rem', fontWeight: 600 }}
                              value={anchor.from !== undefined && anchor.from !== null ? anchor.from : ''}
                              placeholder="0"
                              onChange={(e) =>
                                handleAnchorChange(fieldKey, aIdx, 'from', e.target.value)
                              }
                              onBlur={() => handleBlurAnchor(fieldKey, aIdx, 'from')}
                            />
                            <input
                              type="number"
                              step="1"
                              min="0"
                              max={field.maxMarks || 10}
                              className="form-input"
                              style={{ padding: '6px 8px', fontSize: '0.82rem', fontWeight: 600 }}
                              value={anchor.to !== undefined && anchor.to !== null ? anchor.to : ''}
                              placeholder="Max"
                              onChange={(e) =>
                                handleAnchorChange(fieldKey, aIdx, 'to', e.target.value)
                              }
                              onBlur={() => handleBlurAnchor(fieldKey, aIdx, 'to')}
                            />
                            <input
                              type="text"
                              className="form-input"
                              style={{ padding: '6px 10px', fontSize: '0.82rem' }}
                              value={anchor.label || ''}
                              placeholder="e.g. Working prototype, solves core problem statement"
                              onChange={(e) => handleAnchorChange(fieldKey, aIdx, 'label', e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveAnchor(fieldKey, aIdx)}
                              className="btn btn-icon touch-target"
                              style={{ color: '#ef4444', padding: '6px' }}
                              title="Remove anchor"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        No benchmarks defined yet. Use presets or click <strong>+ Add Anchor</strong> to provide scoring guides for judges.
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Bottom Drop-Card with Identical Uniform Add Buttons */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '12px',
              padding: '16px',
              borderRadius: '12px',
              border: '1px dashed var(--border-color)',
              background: 'rgba(255, 255, 255, 0.01)',
            }}
          >
            <button
              type="button"
              onClick={handleAddNumericCriterion}
              disabled={isLocked || (activeSection.isPsSpecific && !selectedPsId)}
              className="btn btn-primary touch-target"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700 }}
            >
              <Plus size={15} /> + Add Criterion
            </button>
            <button
              type="button"
              onClick={handleAddTextFeedback}
              disabled={isLocked}
              className="btn btn-secondary touch-target"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600 }}
            >
              <Plus size={15} /> + Feedback Text
            </button>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* ADD SECTION MODAL */}
      {/* --------------------------------------------------------------------- */}
      {showAddSectionModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowAddSectionModal(false)}
          title="Add Evaluation Section"
          maxWidth="540px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Add a new evaluation section to divide judging into distinct stages or problem-statement specific parameters.
            </p>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>
                Section Title *
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Technical Implementation or Problem Statement Criteria"
                value={newSectionTitle}
                onChange={(e) => setNewSectionTitle(e.target.value)}
                style={{ fontSize: '0.88rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '8px' }}>
                Section Type *
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: !newSectionIsPs ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                    background: !newSectionIsPs ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="sectionType"
                    checked={!newSectionIsPs}
                    onChange={() => setNewSectionIsPs(false)}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <strong style={{ fontSize: '0.85rem', display: 'block' }}>Common / General Criteria</strong>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      Evaluates all teams equally across standard criteria (e.g. presentation, general architecture).
                    </span>
                  </div>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: newSectionIsPs ? '1px solid #d97706' : '1px solid var(--border-color)',
                    background: newSectionIsPs ? 'rgba(217, 119, 6, 0.08)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="sectionType"
                    checked={newSectionIsPs}
                    onChange={() => setNewSectionIsPs(true)}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <strong style={{ fontSize: '0.85rem', display: 'block', color: 'var(--text-primary)' }}>
                      Problem Statement Specific Criteria
                    </strong>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      Teams will be evaluated on criteria tailored specifically to their chosen Problem Statement.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>
                Target Weight (% of total score)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  className="form-input"
                  style={{ width: '80px', textAlign: 'center', fontSize: '0.9rem', fontWeight: 700 }}
                  value={newSectionWeight !== undefined && newSectionWeight !== null ? newSectionWeight : ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') {
                      setNewSectionWeight('');
                    } else {
                      const parsed = parseInt(v, 10);
                      setNewSectionWeight(isNaN(parsed) ? 0 : Math.max(0, Math.min(100, parsed)));
                    }
                  }}
                  onBlur={() => {
                    if (newSectionWeight === '' || isNaN(newSectionWeight)) {
                      setNewSectionWeight(0);
                    }
                  }}
                />
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>%</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  (Remaining {100 - (parseInt(newSectionWeight, 10) || 0)}% will be assigned to Section 1)
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => setShowAddSectionModal(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAddSection}
                className="btn btn-primary"
              >
                Create Section
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default RubricEditor;
