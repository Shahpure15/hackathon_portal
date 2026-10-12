import React, { useState, useEffect, useMemo } from 'react';
import './shell.css';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MobileNav from './MobileNav';
import CommandPalette from './CommandPalette';
import { useAuth } from '../../contexts/AuthContext';
import { visibleGroups } from '../../modules/registry';

export default function AdminShell({
  activeTab,
  onSelectTab,
  user,
  onLogout,
  eventName = 'MIT India Hackathon',
  stage,
  onOpenSearch,
  unreadAlertsCount = 0,
  onOpenAlerts,
  badges = {},
  children,
}) {
  const { can, canAny, features } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Desktop sidebar collapse state persisted in localStorage
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('admin-sidebar') === 'collapsed';
  });

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('admin-sidebar', next ? 'collapsed' : 'expanded');
      return next;
    });
  };

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter groups according to current permissions and feature flags
  const groups = useMemo(() => {
    return visibleGroups(can, canAny, features);
  }, [can, canAny, features]);

  const handleOpenSearch = onOpenSearch || (() => setPaletteOpen(true));

  return (
    <div className={`admin-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <TopBar
        eventName={eventName}
        stage={stage}
        sidebarCollapsed={collapsed}
        onToggleSidebar={toggleSidebar}
        onOpenSearch={handleOpenSearch}
        unreadAlertsCount={unreadAlertsCount}
        onOpenAlerts={onOpenAlerts}
        user={user}
        onLogout={onLogout}
      />
      <div className="admin-shell-body">
        <Sidebar
          groups={groups}
          activeTab={activeTab}
          onSelectTab={onSelectTab}
          collapsed={collapsed}
          badges={badges}
        />
        <main className="admin-shell-main" id="admin-main-content">
          {children}
        </main>
      </div>
      <MobileNav
        groups={groups}
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        badges={badges}
      />

      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        groups={groups}
        onNavigate={(mod, params) => {
          onSelectTab(mod, params);
          setPaletteOpen(false);
        }}
      />
    </div>
  );
}

