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
  Award,
  Circle,
  KeyRound,
  User as UserIcon,
  LogOut,
} from 'lucide-react';
import ChangePasswordModal from '../ChangePasswordModal';

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
  Award,
};

export default function MobileNav({
  groups = [],
  activeTab,
  onSelectTab,
  badges = {},
  user,
  onLogout,
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState('username');

  const openAccountModal = (tab = 'username') => {
    setModalTab(tab);
    setModalOpen(true);
    setMoreOpen(false);
  };

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

            {/* User Profile & Account Actions in Mobile Sheet */}
            {user && (
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '14px',
                  padding: '12px',
                  marginBottom: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, var(--hero), var(--hero-deep))',
                      color: '#ffffff',
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textTransform: 'uppercase',
                      flexShrink: 0,
                    }}
                  >
                    {(user?.username || 'A')[0]}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user?.username || 'Admin'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {user?.role || 'Administrator'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => openAccountModal('username')}
                    className="btn btn-secondary"
                    style={{
                      padding: '8px 10px',
                      fontSize: '0.8rem',
                      borderRadius: '10px',
                      justifyContent: 'center',
                      gap: '5px',
                    }}
                  >
                    <UserIcon size={14} />
                    <span>Username</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openAccountModal('password')}
                    className="btn btn-secondary"
                    style={{
                      padding: '8px 10px',
                      fontSize: '0.8rem',
                      borderRadius: '10px',
                      justifyContent: 'center',
                      gap: '5px',
                    }}
                  >
                    <KeyRound size={14} />
                    <span>Password</span>
                  </button>
                </div>

                {onLogout && (
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      onLogout();
                    }}
                    className="btn btn-secondary"
                    style={{
                      padding: '8px',
                      fontSize: '0.8rem',
                      borderRadius: '10px',
                      justifyContent: 'center',
                      color: '#ef4444',
                      borderColor: 'rgba(239, 68, 68, 0.25)',
                      gap: '6px',
                    }}
                  >
                    <LogOut size={14} />
                    <span>Log Out</span>
                  </button>
                )}
              </div>
            )}

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

      <ChangePasswordModal
        isOpen={modalOpen}
        initialTab={modalTab}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
