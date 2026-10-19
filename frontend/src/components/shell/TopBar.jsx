import React, { useState } from 'react';
import {
  Menu,
  ChevronLeft,
  ChevronRight,
  Search,
  Bell,
  Sun,
  Moon,
  LogOut,
  KeyRound,
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
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

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

        {/* User Pill */}
        <div className="admin-user-pill" title={`Logged in as ${user?.username || 'User'} (${user?.role || 'Staff'})`}>
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
        </div>

        {/* Change Password */}
        <button
          type="button"
          className="btn btn-secondary admin-password-btn"
          onClick={() => setChangePasswordOpen(true)}
          aria-label="Change Password"
          title="Change Password"
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
          <KeyRound size={14} />
          <span className="admin-btn-text">Password</span>
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
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />
    </header>
  );
}
