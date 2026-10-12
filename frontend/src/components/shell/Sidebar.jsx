import React from 'react';
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
  Circle,
} from 'lucide-react';

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
};

export default function Sidebar({
  groups = [],
  activeTab,
  onSelectTab,
  collapsed = false,
  badges = {},
}) {
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
              const isActive = activeTab === item.id;
              const badge = badges[item.id];

              return (
                <button
                  key={item.id}
                  role="menuitem"
                  className={`admin-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => onSelectTab(item.id)}
                  title={collapsed ? item.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={item.label}
                  type="button"
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
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}
