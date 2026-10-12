import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, CheckCheck, Clock, Award, X } from 'lucide-react';
import api from '../../services/api';

/**
 * NotificationBell component for participant dashboard header.
 * Polls /leader/notifications?unread=1 every 45s when document is visible.
 * Shows dropdown on click; clicking an item marks it read and navigates to round.
 */
export const NotificationBell = ({ onSelectRound }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/leader/notifications?unread=1');
      const list = res.data || [];
      setNotifications(list);
      setUnreadCount(list.length);
    } catch (err) {
      // Ignore polling errors quietly
    }
  };

  useEffect(() => {
    fetchNotifications();

    // Poll every 45 seconds strictly when tab/window is visible
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchNotifications();
      }
    }, 45000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchNotifications();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleItemClick = async (notif) => {
    try {
      await api.post(`/leader/notifications/${notif.id}/read`);
      setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error('Failed to mark notification read', err);
    }

    setIsOpen(false);

    // If notification has roundId, navigate to that round
    const rid = notif.payload?.roundId || notif.payload?.round_id;
    if (rid && onSelectRound) {
      onSelectRound(rid);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post('/leader/notifications/read-all');
      setNotifications([]);
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications read', err);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="btn btn-icon"
        title="Notifications"
        style={{
          position: 'relative',
          width: '38px',
          height: '38px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isOpen ? 'var(--surface-hover)' : 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--border-light)',
          color: unreadCount > 0 ? 'var(--primary)' : 'var(--text-secondary)',
          cursor: 'pointer',
        }}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-3px',
              right: '-3px',
              minWidth: '18px',
              height: '18px',
              padding: '0 4px',
              borderRadius: '999px',
              background: '#ef4444',
              color: '#ffffff',
              fontSize: '0.7rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 8px rgba(239, 68, 68, 0.6)',
              border: '2px solid var(--bg-main, #0f172a)',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Dropdown */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '360px',
            maxWidth: '90vw',
            background: 'var(--surface-overlay, #1e293b)',
            border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
            borderRadius: '14px',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            zIndex: 1100,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid var(--border-light, rgba(255, 255, 255, 0.08))',
              background: 'rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bell size={16} style={{ color: 'var(--primary)' }} />
              <strong style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                Notifications
              </strong>
              {unreadCount > 0 && (
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '2px 6px',
                    borderRadius: '999px',
                    background: 'var(--primary-glow)',
                    color: 'var(--primary)',
                    fontWeight: 700,
                  }}
                >
                  {unreadCount} unread
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '0.76rem',
                  color: 'var(--primary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div
                style={{
                  padding: '36px 20px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '0.85rem',
                }}
              >
                <Award size={28} style={{ opacity: 0.3, marginBottom: '8px' }} />
                <div>You're all caught up!</div>
                <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>No new unread notifications.</div>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  style={{
                    padding: '14px 16px',
                    borderBottom: '1px solid var(--border-light, rgba(255, 255, 255, 0.05))',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                    background: 'rgba(59, 130, 246, 0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.04)';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                      {n.title}
                    </strong>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {n.createdAt ? new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>

                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    {n.body}
                  </p>

                  {n.payload?.roundId && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 600, marginTop: '2px' }}>
                      View Round Results →
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
