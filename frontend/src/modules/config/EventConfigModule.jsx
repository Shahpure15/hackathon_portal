import React, { useState, useEffect } from 'react';
import {
  Settings,
  Power,
  AlertTriangle,
  CheckCircle,
  Clock,
  Calendar,
  Shield,
  Users,
  Radio,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Save,
  Lock,
  Unlock,
  Layers,
  HelpCircle
} from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import Skeleton from '../../components/Skeleton';
import { useAuth } from '../../contexts/AuthContext';

export const EventConfigModule = () => {
  const { addToast } = useToast();
  const { reloadAccess } = useAuth();

  const [loading, setLoading] = useState(true);
  const [savingDetails, setSavingDetails] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [togglingFeature, setTogglingFeature] = useState(false);

  // Event & Config state
  const [config, setConfig] = useState(null);
  const [checkpoints, setCheckpoints] = useState([]);

  // Form states
  const [eventName, setEventName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState('active');
  const [isActive, setIsActive] = useState(true);
  const [stage, setStage] = useState('setup');
  const [features, setFeatures] = useState({});
  const [allowVolunteerPs, setAllowVolunteerPs] = useState(false);
  const [psReleaseAt, setPsReleaseAt] = useState('');
  const [selectedGateCheckpointId, setSelectedGateCheckpointId] = useState('');

  // Confirmation dialogs
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    action: null,
    confirmText: 'Confirm',
    isDanger: false,
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [configRes, checkpointsRes] = await Promise.all([
        api.get('/admin/config'),
        api.get('/admin/checkpoints').catch(() => ({ data: [] })),
      ]);

      const data = configRes.data || {};
      setConfig(data);
      setEventName(data.eventName || '');
      setStatus(data.status || 'active');
      setIsActive(data.isActive !== false);
      setStage(data.stage || 'setup');
      setFeatures(data.features || {});
      setAllowVolunteerPs(!!data.allowVolunteerPsSelection);
      setSelectedGateCheckpointId(data.psGateCheckpointTypeId || '');

      if (data.startDate) {
        setStartDate(data.startDate.slice(0, 16));
      }
      if (data.endDate) {
        setEndDate(data.endDate.slice(0, 16));
      }
      if (data.psReleaseAt) {
        setPsReleaseAt(data.psReleaseAt.slice(0, 16));
      } else {
        setPsReleaseAt('');
      }

      setCheckpoints(Array.isArray(checkpointsRes.data) ? checkpointsRes.data : []);
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to load event configuration', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Quick Action: Change Status (e.g. Active <-> Concluded)
  const handleStatusChange = async (newStatus) => {
    setTogglingStatus(true);
    try {
      const payload = {
        status: newStatus,
        isActive: newStatus === 'active' ? true : isActive,
      };
      if (newStatus === 'concluded') {
        payload.stage = 'closed';
      } else if (newStatus === 'active' && stage === 'closed') {
        payload.stage = 'event_day';
      }

      const res = await api.patch('/admin/config', payload);
      setConfig(res.data);
      setStatus(res.data.status);
      setIsActive(res.data.isActive);
      if (res.data.stage) setStage(res.data.stage);
      if (res.data.features) setFeatures(res.data.features);

      addToast(
        newStatus === 'concluded'
          ? 'Event marked as CONCLUDED. Non-admin logins are now locked.'
          : 'Event status updated to ACTIVE! Portals are unlocked.',
        newStatus === 'concluded' ? 'info' : 'success'
      );

      if (typeof reloadAccess === 'function') {
        reloadAccess();
      }
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to update event status', 'error');
    } finally {
      setTogglingStatus(false);
      setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
    }
  };

  // Toggle master active flag
  const handleToggleIsActive = async () => {
    const nextVal = !isActive;
    setTogglingStatus(true);
    try {
      const res = await api.patch('/admin/config', { isActive: nextVal });
      setIsActive(res.data.isActive);
      addToast(`Event master active status set to: ${nextVal ? 'ENABLED' : 'DISABLED'}`, 'success');
      if (typeof reloadAccess === 'function') reloadAccess();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to toggle active state', 'error');
    } finally {
      setTogglingStatus(false);
    }
  };

  // Save Event Details
  const handleSaveDetails = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setSavingDetails(true);
    try {
      const payload = {
        name: eventName.trim(),
        status,
        isActive,
        stage,
        startDate: startDate ? new Date(startDate).toISOString() : null,
        endDate: endDate ? new Date(endDate).toISOString() : null,
        allowVolunteerPsSelection: allowVolunteerPs,
        psGateCheckpointTypeId: selectedGateCheckpointId || null,
        psReleaseAt: psReleaseAt ? new Date(psReleaseAt).toISOString() : null,
      };

      const res = await api.patch('/admin/config', payload);
      setConfig(res.data);
      addToast('Event configuration saved successfully!', 'success');
      if (typeof reloadAccess === 'function') reloadAccess();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to save event configuration', 'error');
    } finally {
      setSavingDetails(false);
    }
  };

  // Toggle individual portal / feature switches
  const handleToggleFeature = async (featureKey, nextVal) => {
    setTogglingFeature(true);
    try {
      const res = await api.put('/admin/config/features', { [featureKey]: nextVal });
      setFeatures(res.data);
      addToast(`Feature '${featureKey}' updated`, 'success');
      if (typeof reloadAccess === 'function') reloadAccess();
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to update feature', 'error');
    } finally {
      setTogglingFeature(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '24px' }}>
        <Skeleton count={6} />
      </div>
    );
  }

  const isConcluded = status === 'concluded';
  const isUpcoming = status === 'upcoming';
  const isActiveStatus = status === 'active';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              padding: '10px',
              borderRadius: '10px',
              background: 'rgba(99, 102, 241, 0.12)',
              color: 'var(--primary)',
            }}
          >
            <Settings size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>
              Event Configuration & Lifecycle
            </h2>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Manage event conclusion status, portal accessibility gates, and schedule parameters.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchData}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>
      </div>

      {/* Primary Lifecycle Status Card (Prominent Callout) */}
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          borderRadius: '14px',
          border: isConcluded
            ? '1px solid rgba(239, 68, 68, 0.4)'
            : '1px solid rgba(16, 185, 129, 0.4)',
          background: isConcluded
            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(20, 20, 30, 0.6) 100%)'
            : 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(20, 20, 30, 0.6) 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '999px',
                fontSize: '0.85rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                background: isConcluded
                  ? 'rgba(239, 68, 68, 0.2)'
                  : isUpcoming
                  ? 'rgba(59, 130, 246, 0.2)'
                  : 'rgba(16, 185, 129, 0.2)',
                color: isConcluded ? '#ef4444' : isUpcoming ? '#3b82f6' : '#10b981',
                border: isConcluded
                  ? '1px solid rgba(239, 68, 68, 0.4)'
                  : isUpcoming
                  ? '1px solid rgba(59, 130, 246, 0.4)'
                  : '1px solid rgba(16, 185, 129, 0.4)',
              }}
            >
              {isConcluded ? <Lock size={15} /> : <Unlock size={15} />}
              Status: {status.toUpperCase()}
            </span>

            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                background: isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(156, 163, 175, 0.2)',
                color: isActive ? '#10b981' : 'var(--text-muted)',
              }}
            >
              Master Flag: {isActive ? 'Active (True)' : 'Inactive (False)'}
            </span>
          </div>

          {/* Quick Action Toggle Button */}
          <div>
            {isConcluded ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={togglingStatus}
                onClick={() =>
                  setConfirmDialog({
                    isOpen: true,
                    title: 'Reopen / Reactivate Event',
                    message:
                      'Are you sure you want to reopen this event? Non-admin users (participants, leaders, volunteers, and judges) will immediately be allowed to sign in and access the portal.',
                    action: () => handleStatusChange('active'),
                    confirmText: 'Reactivate Event',
                    isDanger: false,
                  })
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  fontSize: '0.92rem',
                  fontWeight: 600,
                  backgroundColor: '#10b981',
                  borderColor: '#10b981',
                  boxShadow: '0 0 20px rgba(16, 185, 129, 0.35)',
                }}
              >
                <Unlock size={18} />
                Reactivate Event (Unlock Logins)
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-danger"
                disabled={togglingStatus}
                onClick={() =>
                  setConfirmDialog({
                    isOpen: true,
                    title: 'Conclude Event',
                    message:
                      'Are you sure you want to mark this event as CONCLUDED? All non-admin accounts (leaders, volunteers, judges) will immediately be blocked from logging in (HTTP 410 Gone) and redirected to the Event Concluded read-only page.',
                    action: () => handleStatusChange('concluded'),
                    confirmText: 'Conclude Event',
                    isDanger: true,
                  })
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  fontSize: '0.92rem',
                  fontWeight: 600,
                  backgroundColor: '#ef4444',
                  borderColor: '#ef4444',
                }}
              >
                <Lock size={18} />
                Conclude Event (Lock Access)
              </button>
            )}
          </div>
        </div>

        {/* Informative Explanation Note */}
        <div
          style={{
            padding: '14px 16px',
            borderRadius: '10px',
            background: 'var(--bg-card, rgba(255,255,255,0.03))',
            border: '1px solid var(--border-color, rgba(255,255,255,0.06))',
            fontSize: '0.86rem',
            lineHeight: 1.5,
          }}
        >
          {isConcluded ? (
            <div style={{ display: 'flex', gap: '10px', color: '#fca5a5' }}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Event Concluded Mode:</strong> The portal backend enforces that non-admin
                logins return <code>HTTP 410 GONE</code>. All participant and staff logins are
                stopped and shown the Pune Qualifier Concluded page. Only administrators can sign in
                and access this panel.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '10px', color: '#a7f3d0' }}>
              <CheckCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Event Active Mode:</strong> Participants and staff can sign in normally.
                Specific module access is governed by the portal access switches below and user RBAC
                permissions.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Grid: Status Selector & Live Portal Access Switches */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '24px',
        }}
      >
        {/* Status & Lifecycle Settings */}
        <div
          className="glass-panel"
          style={{ padding: '22px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '18px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Power size={20} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>
              Lifecycle Status Controls
            </h3>
          </div>

          {/* Status selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>
              Event Status (Database Master State)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {['active', 'concluded', 'upcoming'].map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`btn ${status === st ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleStatusChange(st)}
                  disabled={togglingStatus}
                  style={{
                    padding: '8px 12px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                  }}
                >
                  {st}
                </button>
              ))}
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
              Stored in <code>events.status</code>. Controls non-admin authentication gate.
            </p>
          </div>

          {/* Master Active Toggle */}
          <div
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
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Event Active Flag (isActive)</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                System-level active flag in database
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleToggleIsActive}
              disabled={togglingStatus}
              style={{
                padding: '6px 12px',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: isActive ? '#10b981' : 'var(--text-muted)',
              }}
            >
              {isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
              {isActive ? 'Active' : 'Inactive'}
            </button>
          </div>

          {/* Event Stage Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>
              Current Event Stage
            </label>
            <select
              value={stage}
              onChange={(e) => {
                const newStage = e.target.value;
                setStage(newStage);
                api.put('/admin/config/features', { stage: newStage }).then(() => {
                  addToast(`Event stage set to '${newStage}'`, 'success');
                  if (typeof reloadAccess === 'function') reloadAccess();
                });
              }}
              className="form-control"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-card, #1e1e2d)',
                color: 'var(--text-primary, #fff)',
                border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
              }}
            >
              <option value="setup">Setup & Registration (setup)</option>
              <option value="event_day">Event Day — Hacking (event_day)</option>
              <option value="judging">Judging & Evaluation (judging)</option>
              <option value="results">Results Published (results)</option>
              <option value="closed">Concluded / Archive (closed)</option>
            </select>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
              Controls the stage chip displayed in the top bar across the admin shell.
            </p>
          </div>
        </div>

        {/* Live Portal Access Switches */}
        <div
          className="glass-panel"
          style={{ padding: '22px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield size={20} style={{ color: 'var(--primary)' }} />
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>
                Live Portal Access Toggles
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                Toggle individual portals on or off while event is active.
              </p>
            </div>
          </div>

          {/* Participant Leader Portal */}
          <div
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
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Participant Leader Portal</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Routes at <code>/leader</code> (submissions, team overview)
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={togglingFeature}
              onClick={() => handleToggleFeature('leader_portal', features?.leader_portal === false ? true : false)}
              style={{
                padding: '6px 12px',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: features?.leader_portal !== false ? '#10b981' : 'var(--text-muted)',
              }}
            >
              {features?.leader_portal !== false ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
              {features?.leader_portal !== false ? 'Enabled' : 'Paused'}
            </button>
          </div>

          {/* Volunteer Check-in Portal */}
          <div
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
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Volunteer Check-in Portal</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Routes at <code>/volunteer</code> (scanner & checkpoints)
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={togglingFeature}
              onClick={() => handleToggleFeature('volunteer_portal', features?.volunteer_portal === false ? true : false)}
              style={{
                padding: '6px 12px',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: features?.volunteer_portal !== false ? '#10b981' : 'var(--text-muted)',
              }}
            >
              {features?.volunteer_portal !== false ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
              {features?.volunteer_portal !== false ? 'Enabled' : 'Paused'}
            </button>
          </div>

          {/* Staff Access to Admin Shell */}
          <div
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
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Staff Access to Admin Shell</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Allow non-admin staff with RBAC permissions to view admin tabs
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={togglingFeature}
              onClick={() => handleToggleFeature('staff_admin_portal', features?.staff_admin_portal === false ? true : false)}
              style={{
                padding: '6px 12px',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: features?.staff_admin_portal !== false ? '#10b981' : 'var(--text-muted)',
              }}
            >
              {features?.staff_admin_portal !== false ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
              {features?.staff_admin_portal !== false ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          {/* Evaluation & Judging */}
          <div
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
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Evaluation & Judging Module</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Rounds, scoring rubrics, and judge assignments
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={togglingFeature}
              onClick={() => handleToggleFeature('evaluation', !features?.evaluation)}
              style={{
                padding: '6px 12px',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: features?.evaluation ? '#10b981' : 'var(--text-muted)',
              }}
            >
              {features?.evaluation ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
              {features?.evaluation ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </div>
      </div>

      {/* Event Details & Schedule Form Card */}
      <div
        className="glass-panel"
        style={{ padding: '24px', borderRadius: '12px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
          <Calendar size={20} style={{ color: 'var(--primary)' }} />
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>
              Event Metadata & Schedule
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              Update event branding, official dates, and problem statement release settings.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveDetails}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '18px',
              marginBottom: '20px',
            }}
          >
            {/* Event Name */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Event Name
              </label>
              <input
                type="text"
                className="form-control"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="e.g. MIT India Hackathon 2026"
                required
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-card, #1e1e2d)',
                  color: 'var(--text-primary, #fff)',
                  border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                }}
              />
            </div>

            {/* Start Date */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Event Start Date & Time
              </label>
              <input
                type="datetime-local"
                className="form-control"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-card, #1e1e2d)',
                  color: 'var(--text-primary, #fff)',
                  border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                }}
              />
            </div>

            {/* End Date */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Event End Date & Time
              </label>
              <input
                type="datetime-local"
                className="form-control"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-card, #1e1e2d)',
                  color: 'var(--text-primary, #fff)',
                  border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                }}
              />
            </div>

            {/* PS Release Schedule */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Problem Statement Release Time
              </label>
              <input
                type="datetime-local"
                className="form-control"
                value={psReleaseAt}
                onChange={(e) => setPsReleaseAt(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-card, #1e1e2d)',
                  color: 'var(--text-primary, #fff)',
                  border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                }}
              />
            </div>

            {/* PS Gate Checkpoint */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Check-in Gate Checkpoint (for PS Selection)
              </label>
              <select
                value={selectedGateCheckpointId}
                onChange={(e) => setSelectedGateCheckpointId(e.target.value)}
                className="form-control"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-card, #1e1e2d)',
                  color: 'var(--text-primary, #fff)',
                  border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                }}
              >
                <option value="">No checkpoint gating (instant release)</option>
                {checkpoints.map((cp) => (
                  <option key={cp.id} value={cp.id}>
                    {cp.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Volunteer PS Allocation Switch */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Volunteer PS Allotment
              </label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'var(--bg-card, rgba(255,255,255,0.02))',
                  border: '1px solid var(--border-color, rgba(255,255,255,0.06))',
                }}
              >
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Allow volunteers to select PS on behalf of teams
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setAllowVolunteerPs(!allowVolunteerPs)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.8rem',
                    color: allowVolunteerPs ? '#10b981' : 'var(--text-muted)',
                  }}
                >
                  {allowVolunteerPs ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={savingDetails}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 22px' }}
            >
              <Save size={16} />
              {savingDetails ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.action}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        confirmText={confirmDialog.confirmText}
        isDanger={confirmDialog.isDanger}
      />
    </div>
  );
};

export default EventConfigModule;
