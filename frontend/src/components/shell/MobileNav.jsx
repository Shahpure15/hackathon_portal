import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  ClipboardCheck,
  MoreHorizontal,
  X,
  UserCheck,
  QrCode,
  Boxes,
  PanelsTopLeft,
  ListChecks,
  Radio,
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

export default function MobileNav({
  groups = [],
  activeTab,
  onSelectTab,
  badges = {},
}) {
  const [moreOpen, setMoreOpen] = useState(false);

  // 4 primary items for bottom navigation
  const PRIMARY_ITEMS = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'teams', label: 'People', icon: Users },
    { id: 'checkpoints', label: 'Event Day', icon: CalendarCheck },
    { id: 'evalRounds', label: 'Judging', icon: ClipboardCheck },
  ];

  const handleSelect = (id) => {
    onSelectTab(id);
    setMoreOpen(false);
  };

  // Determine if active tab is in primary items
  const isPrimaryActive = PRIMARY_ITEMS.some((i) => i.id === activeTab);

  return (
    <>
      {/* Mobile Bottom Bar */}
      <nav className="admin-mobile-nav" aria-label="Mobile Navigation">
        {PRIMARY_ITEMS.map((item) => {
          const IconComponent = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`admin-mobile-tab ${isActive ? 'active' : ''}`}
              onClick={() => handleSelect(item.id)}
              aria-current={isActive ? 'page' : undefined}
            >
              <IconComponent size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}

        {/* More Tab */}
        <button
          type="button"
          className={`admin-mobile-tab ${!isPrimaryActive && !moreOpen ? 'active' : ''}`}
          onClick={() => setMoreOpen(!moreOpen)}
          aria-expanded={moreOpen}
          aria-label="More navigation modules"
        >
          <MoreHorizontal size={20} />
          <span>More</span>
        </button>
      </nav>

      {/* Mobile More Sheet */}
      {moreOpen && (
        <div
          className="admin-more-sheet-backdrop"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="admin-more-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="All Navigation Modules"
          >
            <div className="admin-more-sheet-header">
              <span className="admin-more-sheet-title">All Modules</span>
              <button
                type="button"
                className="admin-icon-btn"
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {groups.map((group) => (
                <div key={group.id}>
                  <div className="admin-nav-group-label" style={{ paddingLeft: '4px' }}>
                    {group.label}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '4px' }}>
                    {group.items.map((item) => {
                      const IconComponent = ICON_MAP[item.icon] || Circle;
                      const isActive = activeTab === item.id;
                      const badge = badges[item.id];

                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`admin-nav-item ${isActive ? 'active' : ''}`}
                          onClick={() => handleSelect(item.id)}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          <span className="admin-nav-icon">
                            <IconComponent size={18} />
                          </span>
                          <span className="admin-nav-label">{item.label}</span>
                          {badge && <span className="admin-badge-count">{badge}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
