import React, { useState } from 'react';
import { Mail, Server, FileText, UserPlus } from 'lucide-react';
import EmailAccounts from './EmailAccounts';
import EmailTemplates from './EmailTemplates';
import StaffInvitations from './StaffInvitations';

export default function EmailModule() {
  const [activeTab, setActiveTab] = useState('invitations');

  const tabs = [
    { id: 'invitations', label: 'Staff Invitations', icon: <UserPlus size={16} /> },
    { id: 'accounts', label: 'SMTP Accounts', icon: <Server size={16} /> },
    { id: 'templates', label: 'Email Templates', icon: <FileText size={16} /> },
  ];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', marginBottom: '24px', overflowX: 'auto' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? 'var(--primary-color, #3b82f6)' : 'var(--text-secondary)',
              borderBottom: activeTab === tab.id ? '2px solid var(--primary-color, #3b82f6)' : '2px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === 'invitations' && <StaffInvitations />}
        {activeTab === 'accounts' && <EmailAccounts />}
        {activeTab === 'templates' && <EmailTemplates />}
      </div>
    </div>
  );
}
