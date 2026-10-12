import React, { useState, useMemo } from 'react';
import './shell.css';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MobileNav from './MobileNav';
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

  // Filter groups according to current permissions and feature flags
  const groups = useMemo(() => {
    return visibleGroups(can, canAny, features);
  }, [can, canAny, features]);

  return (
    <div className={`admin-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <TopBar
        eventName={eventName}
        stage={stage}
        sidebarCollapsed={collapsed}
        onToggleSidebar={toggleSidebar}
        onOpenSearch={onOpenSearch}
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
    </div>
  );
}
