import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  CalendarCheck,
  QrCode,
  Boxes,
  PanelsTopLeft,
  ListChecks,
  Radio,
  ClipboardCheck,
  Mail,
  ShieldCheck,
  Settings,
  Award,
  Circle,
  ChevronDown,
  ChevronRight,
  Plus,
  FileText,
} from 'lucide-react';
import api from '../../services/api';

const ICON_MAP = {
  LayoutDashboard,
  Users,
  UserCheck,
  CalendarCheck,
  QrCode,
  Boxes,
  PanelsTopLeft,
  ListChecks,
  Radio,
  ClipboardCheck,
  Mail,
  ShieldCheck,
  Settings,
  Award,
};

export default function Sidebar({
  groups = [],
  activeTab,
  onSelectTab,
  collapsed = false,
  badges = {},
}) {
  const [rounds, setRounds] = useState([]);
  const [roundsExpanded, setRoundsExpanded] = useState(true);
  const [searchParams] = useSearchParams();
  const currentRoundId = searchParams.get('roundId');

  const fetchRoundsList = async () => {
    try {
      const res = await api.get('/admin/rounds');
      setRounds(Array.isArray(res.data) ? res.data : []);
    } catch {
      // silent fallback
    }
  };

  useEffect(() => {
    fetchRoundsList();
    const handleRoundsUpdated = () => fetchRoundsList();
    window.addEventListener('rounds-updated', handleRoundsUpdated);
    return () => window.removeEventListener('rounds-updated', handleRoundsUpdated);
  }, []);

  return (
    <aside
      className="admin-sidebar"
      aria-label="Admin Navigation"
      role="navigation"
    >
      {groups.map((group) => (
        <div key={group.id} className="admin-nav-group">
          {!collapsed ? (
            <div className="admin-nav-group-label">{group.label}</div>
          ) : (
            <div className="admin-nav-group-label" title={group.label}>
              •••
            </div>
          )}

          <div role="menu">
            {group.items.map((item) => {
              const IconComponent = ICON_MAP[item.icon] || Circle;
              const isRoundsItem = item.id === 'evalRounds';
              const isActive = activeTab === item.id;
              const badge = badges[item.id];

              return (
                <div key={item.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <button
                      role="menuitem"
                      className={`admin-nav-item ${isActive && (!isRoundsItem || !currentRoundId) ? 'active' : ''}`}
                      onClick={() => onSelectTab(item.id)}
                      title={collapsed ? item.label : undefined}
                      aria-current={isActive ? 'page' : undefined}
                      aria-label={item.label}
                      type="button"
                      style={{ flex: 1, paddingRight: isRoundsItem && !collapsed ? '32px' : undefined }}
                    >
                      <span className="admin-nav-icon">
                        <IconComponent size={18} />
                      </span>
                      {!collapsed && <span className="admin-nav-label">{item.label}</span>}
                      {badge && !collapsed && (
                        <span className="admin-badge-count">{badge}</span>
                      )}
                      {badge && collapsed && <span className="admin-badge-dot" />}
                    </button>

                    {isRoundsItem && !collapsed && rounds.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRoundsExpanded((prev) => !prev);
                        }}
                        style={{
                          position: 'absolute',
                          right: '6px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '4px',
                        }}
                        title={roundsExpanded ? 'Collapse rounds tree' : 'Expand rounds tree'}
                      >
                        {roundsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    )}
                  </div>

                  {/* File Explorer Tree for Rounds */}
                  {isRoundsItem && !collapsed && roundsExpanded && rounds.length > 0 && (
                    <div
                      className="admin-nav-subtree"
                      style={{
                        marginLeft: '18px',
                        paddingLeft: '10px',
                        borderLeft: '1px solid var(--border-light, rgba(255,255,255,0.08))',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        marginTop: '3px',
                        marginBottom: '6px',
                      }}
                    >
                      {rounds.map((r) => {
                        const isRoundActive = isActive && (currentRoundId === r.id);
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCurrentRoundId(r.id);
                              onSelectTab('evalRounds', { roundId: r.id });
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '5px 8px',
                              fontSize: '0.78rem',
                              borderRadius: '6px',
                              border: 'none',
                              background: isRoundActive ? 'var(--primary-glow, rgba(99,102,241,0.12))' : 'transparent',
                              color: isRoundActive ? 'var(--primary)' : 'var(--text-secondary)',
                              fontWeight: isRoundActive ? 700 : 500,
                              cursor: 'pointer',
                              textAlign: 'left',
                              width: '100%',
                              transition: 'background 0.15s ease, color 0.15s ease',
                            }}
                            title={`Round #${r.number || r.roundNumber}: ${r.name}`}
                          >
                            <span
                              style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: r.status === 'live' ? '#22c55e' : (r.status === 'closed' ? '#ef4444' : '#94a3b8'),
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                              #{r.number || r.roundNumber}: {r.name}
                            </span>
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentRoundId('new');
                          onSelectTab('evalRounds', { action: 'create' });
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 8px',
                          fontSize: '0.74rem',
                          borderRadius: '6px',
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--primary)',
                          cursor: 'pointer',
                          fontWeight: 600,
                          marginTop: '2px',
                        }}
                      >
                        <Plus size={12} /> New Round
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}
