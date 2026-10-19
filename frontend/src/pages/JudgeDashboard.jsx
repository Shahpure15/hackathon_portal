import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import Navbar from '../components/Navbar';
import JudgeConsole from '../modules/evaluation/JudgeConsole';

export default function JudgeDashboard() {
  const { user, access, logout } = useAuth();
  const displayRole = user?.displayRole || (access?.roleNames?.[0] ? access.roleNames[0] : 'JUDGE');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}>
      {/* Platform Standard Navigation Notch */}
      <Navbar
        title="MIT India Hackathon"
        user={user}
        role={displayRole}
        onLogout={logout}
      />

      {/* Main Content Area */}
      <main
        style={{
          flex: 1,
          padding: '96px 16px 32px',
          maxWidth: '1440px',
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box',
        }}
      >
        <JudgeConsole />
      </main>
    </div>
  );
}
