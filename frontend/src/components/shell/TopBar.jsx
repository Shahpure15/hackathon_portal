import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  Bell,
  Sun,
  Moon,
  LogOut,
  KeyRound,
  User as UserIcon,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import VersionBadge from '../VersionBadge';
import ChangePasswordModal from '../ChangePasswordModal';

export default function TopBar({
  eventName = 'MIT India Hackathon',
  stage = 'Active',
  onToggleSidebar,
  sidebarCollapsed = false,
  onOpenSearch,
  unreadAlertsCount = 0,
  onOpenAlerts,
  user = { username: 'Admin', role: 'Administrator' },
  onLogout,
}) {
  const { theme, toggleTheme } = useTheme();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState('username');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [userMenuOpen]);

  const openAccountModal = (tab = 'username') => {
    setModalTab(tab);
    setModalOpen(true);
    setUserMenuOpen(false);
  };

  return (
    <header className="admin-topbar" role="banner">
      {/* Left: Sidebar toggle, Event Name, Stage Chip */}
      <div className="admin-topbar-left">
        <button
          type="button"
          className="admin-sidebar-toggle"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>

        <span className="admin-brand-title text-gradient" style={{ fontWeight: 800, fontSize: '0.88rem', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>
          {eventName}
        </span>

        {stage && (
          <span className="admin-stage-chip" title="Current Event Stage">
            {stage}
          </span>
        )}
      </div>

      {/* Center: Command Palette Search Trigger */}
      <div className="admin-topbar-center">
        <button
          type="button"
          className="admin-search-trigger"
          onClick={onOpenSearch}
          aria-label="Search and quick actions (Ctrl+K)"
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Search size={14} />
            <span>Search teams, staff, or actions...</span>
          </span>
          <kbd className="admin-search-kbd">Ctrl K</kbd>
        </button>
      </div>

      {/* Right: Theme, Alerts, User, Logout, Version */}
      <div className="admin-topbar-right">
        {/* Mobile Search Button */}
        <button
          type="button"
          className="admin-icon-btn admin-mobile-search-btn"
          onClick={onOpenSearch}
          aria-label="Search"
          style={{ display: 'none' }}
        >
          <Search size={15} />
        </button>

        {/* Theme Toggle */}
        <button
          type="button"
          className="admin-icon-btn admin-theme-btn"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* Alerts Bell */}
        <button
          type="button"
          className="admin-icon-btn"
          onClick={onOpenAlerts}
          aria-label={`Alerts (${unreadAlertsCount} pending)`}
          title="Attention list and system alerts"
        >
          <Bell size={15} />
          {unreadAlertsCount > 0 && (
            <span className="admin-badge-count">{unreadAlertsCount}</span>
          )}
        </button>

        {/* User Pill with Dropdown Menu */}
        <div style={{ position: 'relative' }} ref={userMenuRef}>
          <button
            type="button"
            className="admin-user-pill admin-user-pill-btn"
            onClick={() => setUserMenuOpen((prev) => !prev)}
            aria-expanded={userMenuOpen}
            aria-haspopup="true"
            title={`Account options for ${user?.username || 'User'}`}
            style={{
              cursor: 'pointer',
              border: userMenuOpen ? '1px solid var(--primary)' : undefined,
              boxShadow: userMenuOpen ? '0 0 0 2px var(--primary-glow)' : undefined,
            }}
          >
            <div className="admin-user-avatar">
              {(user?.username || 'A')[0].toUpperCase()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 }}>
              <span style={{ fontWeight: 600, fontSize: '0.8rem' }}>{user?.username || 'Admin'}</span>
              {user?.role && (
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                  {user.role}
                </span>
              )}
            </div>
            <ChevronDown size={14} style={{ opacity: 0.7, marginLeft: '2px', transform: userMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
          </button>

          {/* Glassmorphic Dropdown Menu */}
          {userMenuOpen && (
            <div className="admin-user-dropdown" role="menu">
              <div className="admin-user-dropdown-header">
                <div className="admin-user-avatar" style={{ width: '32px', height: '32px', fontSize: '0.85rem' }}>
                  {(user?.username || 'A')[0].toUpperCase()}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user?.username || 'Admin'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    {user?.role || 'Administrator'}
                  </div>
                </div>
              </div>

              <div style={{ padding: '4px 0' }}>
                <button
                  type="button"
                  className="admin-user-dropdown-item"
                  onClick={() => openAccountModal('username')}
                >
                  <UserIcon size={15} />
                  <span>Change Username</span>
                </button>

                <button
                  type="button"
                  className="admin-user-dropdown-item"
                  onClick={() => openAccountModal('password')}
                >
                  <KeyRound size={15} />
                  <span>Change Password</span>
                </button>
              </div>

              <div style={{ borderTop: '1px solid var(--border-light)', margin: '4px 0' }} />

              <div style={{ padding: '4px 0' }}>
                <button
                  type="button"
                  className="admin-user-dropdown-item text-danger"
                  onClick={() => {
                    setUserMenuOpen(false);
                    onLogout?.();
                  }}
                  style={{ color: '#ef4444' }}
                >
                  <LogOut size={15} />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Change Account Quick Action */}
        <button
          type="button"
          className="btn btn-secondary admin-password-btn"
          onClick={() => openAccountModal('username')}
          aria-label="Account Settings"
          title="Account Settings (Username & Password)"
          style={{
            padding: '5px 12px',
            minHeight: 'auto',
            height: '34px',
            borderRadius: '999px',
            fontSize: '0.78rem',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <UserIcon size={14} />
          <span className="admin-btn-text">Account</span>
        </button>

        {/* Logout */}
        <button
          type="button"
          className="btn btn-secondary admin-logout-btn"
          onClick={onLogout}
          aria-label="Log out"
          title="Log out"
          style={{
            padding: '5px 14px',
            minHeight: 'auto',
            height: '34px',
            borderRadius: '999px',
            fontSize: '0.78rem',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <LogOut size={14} />
          <span className="admin-btn-text">Logout</span>
        </button>

        {/* Version Badge */}
        <VersionBadge />
      </div>

      <ChangePasswordModal
        isOpen={modalOpen}
        initialTab={modalTab}
        onClose={() => setModalOpen(false)}
      />
    </header>
  );
}
