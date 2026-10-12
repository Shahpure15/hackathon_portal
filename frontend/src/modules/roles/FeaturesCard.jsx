import React, { useState } from 'react';
import { ToggleLeft, ToggleRight, AlertTriangle, ShieldCheck, Layers, Award } from 'lucide-react';
import api from '../../services/api';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useToast } from '../../contexts/ToastContext';

export const FeaturesCard = ({ features, onUpdateFeatures }) => {
  const { addToast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingFeature, setPendingFeature] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const handleToggleClick = (featureName, nextValue) => {
    setErrorMessage(null);
    setPendingFeature({ featureName, nextValue });
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    if (!pendingFeature) return;
    const { featureName, nextValue } = pendingFeature;
    setLoading(true);
    setErrorMessage(null);

    try {
      const payload = { [featureName]: nextValue };
      const res = await api.put('/admin/config/features', payload);
      addToast(`Feature '${featureName}' updated successfully`, 'success');
      onUpdateFeatures(res.data);
      setConfirmOpen(false);
      setPendingFeature(null);
    } catch (err) {
      const detail = err.response?.data?.detail;
      let msg = 'Failed to update feature';
      if (typeof detail === 'string') {
        msg = detail;
      } else if (detail?.message) {
        msg = detail.message;
        if (Array.isArray(detail.members) && detail.members.length > 0) {
          msg += `: ${detail.members.map(m => m.name || m.userId).join(', ')}`;
        }
      }
      setErrorMessage(msg);
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)' }}>
            <Layers size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Event Feature Switches</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              Enable or disable optional event management modules for this event.
            </p>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#ef4444', fontSize: '0.85rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
        {/* Pods Feature Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '10px', background: 'var(--bg-card, rgba(255,255,255,0.03))', border: '1px solid var(--border-color, rgba(255,255,255,0.06))' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>POD Groups & Rooms</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Assign teams to rooms/pods and filter volunteer scopes
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handleToggleClick('pods', !features?.pods)}
            style={{
              padding: '6px 14px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: features?.pods ? '#10b981' : 'var(--text-muted)'
            }}
          >
            {features?.pods ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
            {features?.pods ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        {/* Evaluation Feature Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '10px', background: 'var(--bg-card, rgba(255,255,255,0.03))', border: '1px solid var(--border-color, rgba(255,255,255,0.06))' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Evaluation & Judging</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Submission rounds, scoring rubric, and panel judging
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handleToggleClick('evaluation', !features?.evaluation)}
            style={{
              padding: '6px 14px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: features?.evaluation ? '#10b981' : 'var(--text-muted)'
            }}
          >
            {features?.evaluation ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
            {features?.evaluation ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        {/* Staff Admin Shell Access Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '10px', background: 'var(--bg-card, rgba(255,255,255,0.03))', border: '1px solid var(--border-color, rgba(255,255,255,0.06))' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Staff Access to Admin Shell</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Allow non-admin staff with RBAC roles to access permitted admin tabs
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handleToggleClick('staff_admin_portal', features?.staff_admin_portal === false ? true : false)}
            style={{
              padding: '6px 14px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: features?.staff_admin_portal !== false ? '#10b981' : 'var(--text-muted)'
            }}
          >
            {features?.staff_admin_portal !== false ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
            {features?.staff_admin_portal !== false ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        {/* Volunteer Check-in Portal Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '10px', background: 'var(--bg-card, rgba(255,255,255,0.03))', border: '1px solid var(--border-color, rgba(255,255,255,0.06))' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Volunteer Check-in Portal</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Volunteer scanner and checkpoint attendance portal (/volunteer)
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handleToggleClick('volunteer_portal', features?.volunteer_portal === false ? true : false)}
            style={{
              padding: '6px 14px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: features?.volunteer_portal !== false ? '#10b981' : 'var(--text-muted)'
            }}
          >
            {features?.volunteer_portal !== false ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
            {features?.volunteer_portal !== false ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        {/* Participant Leader Portal Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '10px', background: 'var(--bg-card, rgba(255,255,255,0.03))', border: '1px solid var(--border-color, rgba(255,255,255,0.06))' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Participant Leader Portal</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Team leader submissions, team management, and results (/leader)
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handleToggleClick('leader_portal', features?.leader_portal === false ? true : false)}
            style={{
              padding: '6px 14px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: features?.leader_portal !== false ? '#10b981' : 'var(--text-muted)'
            }}
          >
            {features?.leader_portal !== false ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
            {features?.leader_portal !== false ? 'Enabled' : 'Disabled'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title={`Toggle ${pendingFeature?.featureName ? pendingFeature.featureName.toUpperCase().replace(/_/g, ' ') : ''}`}
        message={`Are you sure you want to ${pendingFeature?.nextValue ? 'enable' : 'disable'} ${pendingFeature?.featureName ? pendingFeature.featureName.replace(/_/g, ' ') : ''}? ${pendingFeature?.nextValue === false ? 'Non-admin users will immediately lose access to this portal/feature.' : ''}`}
        onConfirm={handleConfirm}
        onCancel={() => {
          setConfirmOpen(false);
          setPendingFeature(null);
        }}
        confirmText={loading ? 'Updating...' : 'Confirm'}
      />
    </div>
  );
};

export default FeaturesCard;
