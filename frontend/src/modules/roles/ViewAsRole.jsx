import React from 'react';
import { Eye, CheckCircle2, XCircle } from 'lucide-react';
import { ADMIN_NAV_PERMISSIONS, STAFF_TAB_PERMISSIONS } from '../registry';

const ADMIN_MODULE_LABELS = {
  teams: 'Teams Roster',
  qrScan: 'QR Team Lookup',
  pods: 'POD Groups',
  panels: 'Judging Panels',
  evalRounds: 'Evaluation Rounds',
  volunteers: 'People & Staff',
  checkpoints: 'Attendance Slots',
  ps: 'Problem Statements',
  psLive: 'Live PS View',
  roles: 'Roles & Access',
};

const STAFF_MODULE_LABELS = {
  checkin: 'Teams Check-in Desk',
  people: 'Faculty, Judges & People Desk',
};

export const ViewAsRole = ({ effectivePermissions }) => {
  const permSet = effectivePermissions instanceof Set ? effectivePermissions : new Set(effectivePermissions || []);

  const adminNavResults = Object.entries(ADMIN_NAV_PERMISSIONS).map(([tabId, permKey]) => ({
    id: tabId,
    label: ADMIN_MODULE_LABELS[tabId] || tabId,
    requiredPerm: permKey,
    hasAccess: permSet.has(permKey),
  }));

  const staffNavResults = Object.entries(STAFF_TAB_PERMISSIONS).map(([tabId, permKey]) => ({
    id: tabId,
    label: STAFF_MODULE_LABELS[tabId] || tabId,
    requiredPerm: permKey,
    hasAccess: permSet.has(permKey),
  }));

  const adminPermittedCount = adminNavResults.filter((r) => r.hasAccess).length;
  const staffPermittedCount = staffNavResults.filter((r) => r.hasAccess).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div
        style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: 'rgba(99, 102, 241, 0.08)',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <Eye size={18} color="var(--primary)" />
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          This simulator predicts which navigation dashboards and modules will be visible to users assigned this role.
        </span>
      </div>

      {/* Staff UI Dashboard Tabs */}
      <div>
        <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Staff Portal Modules</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {staffPermittedCount} of {staffNavResults.length} enabled
          </span>
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
          {staffNavResults.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 12px',
                borderRadius: '6px',
                background: item.hasAccess ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                border: item.hasAccess ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid var(--border-color, rgba(255, 255, 255, 0.05))',
                opacity: item.hasAccess ? 1 : 0.6,
              }}
            >
              {item.hasAccess ? <CheckCircle2 size={16} color="#10b981" /> : <XCircle size={16} color="var(--text-muted)" />}
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{item.label}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>requires {item.requiredPerm}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Admin UI Tabs */}
      <div>
        <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Admin Portal Views</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {adminPermittedCount} of {adminNavResults.length} enabled
          </span>
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
          {adminNavResults.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 12px',
                borderRadius: '6px',
                background: item.hasAccess ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                border: item.hasAccess ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid var(--border-color, rgba(255, 255, 255, 0.05))',
                opacity: item.hasAccess ? 1 : 0.6,
              }}
            >
              {item.hasAccess ? <CheckCircle2 size={16} color="#10b981" /> : <XCircle size={16} color="var(--text-muted)" />}
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{item.label}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>requires {item.requiredPerm}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ViewAsRole;
