import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, AlertCircle, ShieldAlert, Check } from 'lucide-react';

export const PermissionGroups = ({
  catalog,
  selectedPermissions,
  onChangeSelected,
  confirmSensitive,
  onSetConfirmSensitive,
}) => {
  const [openModules, setOpenModules] = useState({});

  const toggleModule = (moduleName) => {
    setOpenModules((prev) => ({
      ...prev,
      [moduleName]: !prev[moduleName],
    }));
  };

  // Map of permission key -> Permission object
  const permMap = useMemo(() => {
    const map = {};
    if (catalog?.permissions) {
      for (const p of catalog.permissions) {
        map[p.key] = p;
      }
    }
    return map;
  }, [catalog]);

  // Compute closure: for each explicitly selected key, which keys are implied and via which key
  const { impliedKeys, impliedVia, allEffectiveKeys } = useMemo(() => {
    const implied = new Set();
    const viaMap = {};
    const effective = new Set(selectedPermissions);

    for (const key of selectedPermissions) {
      const p = permMap[key];
      if (p && Array.isArray(p.implies)) {
        const stack = [...p.implies];
        while (stack.length > 0) {
          const impKey = stack.pop();
          if (!effective.has(impKey)) {
            effective.add(impKey);
          }
          if (!implied.has(impKey) && !selectedPermissions.includes(impKey)) {
            implied.add(impKey);
            viaMap[impKey] = p.label || key;
          }
          const impMeta = permMap[impKey];
          if (impMeta && Array.isArray(impMeta.implies)) {
            for (const nested of impMeta.implies) {
              if (!effective.has(nested)) {
                stack.push(nested);
              }
            }
          }
        }
      }
    }

    return {
      impliedKeys: implied,
      impliedVia: viaMap,
      allEffectiveKeys: effective,
    };
  }, [selectedPermissions, permMap]);

  // Filter modules: omit DANGER and GOVERNANCE keys
  const assignableModules = useMemo(() => {
    if (!catalog?.modules) return [];
    return catalog.modules
      .map((mod) => ({
        ...mod,
        permissions: mod.permissions.filter(
          (p) => p.tier !== 'danger' && p.tier !== 'governance' && p.assignable
        ),
      }))
      .filter((mod) => mod.permissions.length > 0);
  }, [catalog]);

  const handleCheckboxClick = (p) => {
    const key = p.key;
    if (selectedPermissions.includes(key)) {
      // Remove
      onChangeSelected(selectedPermissions.filter((k) => k !== key));
    } else {
      // Add
      if (p.tier === 'sensitive' && !confirmSensitive) {
        onSetConfirmSensitive(true);
      }
      onChangeSelected([...selectedPermissions, key]);
    }
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
          padding: '10px 14px',
          background: 'rgba(99, 102, 241, 0.08)',
          borderRadius: '8px',
          border: '1px solid rgba(99, 102, 241, 0.2)',
        }}
      >
        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Grants <strong>{allEffectiveKeys.size}</strong> permissions ({selectedPermissions.length} explicit, {impliedKeys.size} implied)
        </span>
        {confirmSensitive && (
          <span
            className="status-badge"
            style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', fontSize: '0.75rem', fontWeight: 600 }}
          >
            Sensitive permissions confirmed
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {assignableModules.map((mod) => {
          const isOpen = openModules[mod.module] !== false; // default open
          const selectedInMod = mod.permissions.filter((p) =>
            allEffectiveKeys.has(p.key)
          ).length;

          return (
            <div
              key={mod.module}
              style={{
                borderRadius: '8px',
                border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                background: 'var(--bg-card, rgba(255,255,255,0.02))',
                overflow: 'hidden',
              }}
            >
              <div
                onClick={() => toggleModule(mod.module)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{mod.module}</span>
                </div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: selectedInMod > 0 ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.05)',
                    color: selectedInMod > 0 ? 'var(--primary)' : 'var(--text-muted)',
                    fontWeight: 600,
                  }}
                >
                  {selectedInMod} / {mod.permissions.length} active
                </span>
              </div>

              {isOpen && (
                <div
                  style={{
                    padding: '12px 16px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: '10px',
                    borderTop: '1px solid var(--border-color, rgba(255,255,255,0.05))',
                  }}
                >
                  {mod.permissions.map((p) => {
                    const isExplicit = selectedPermissions.includes(p.key);
                    const isImplied = impliedKeys.has(p.key);
                    const isChecked = isExplicit || isImplied;
                    const isSensitive = p.tier === 'sensitive';

                    return (
                      <label
                        key={p.key}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          background: isChecked ? 'rgba(99, 102, 241, 0.06)' : 'transparent',
                          border: isChecked ? '1px solid rgba(99, 102, 241, 0.15)' : '1px solid transparent',
                          cursor: isImplied ? 'default' : 'pointer',
                          opacity: isImplied ? 0.8 : 1,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isImplied}
                          onChange={() => handleCheckboxClick(p)}
                          style={{ marginTop: '3px', cursor: isImplied ? 'default' : 'pointer' }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: isChecked ? 600 : 400 }}>
                              {p.label}
                            </span>
                            {isSensitive && (
                              <span
                                style={{
                                  fontSize: '0.65rem',
                                  fontWeight: 700,
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: 'rgba(245, 158, 11, 0.2)',
                                  color: '#f59e0b',
                                }}
                              >
                                SENSITIVE
                              </span>
                            )}
                          </div>
                          {isImplied && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              included via {impliedVia[p.key]}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '16px', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
        * Admin-only governance and danger actions are never delegable to custom roles.
      </div>
    </div>
  );
};

export default PermissionGroups;
