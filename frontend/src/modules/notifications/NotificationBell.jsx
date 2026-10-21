import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, CheckCheck, Clock, Award, X } from 'lucide-react';
import api from '../../services/api';

/**
 * NotificationBell component for participant dashboard header.
 * Polls /leader/notifications?unread=1 every 45s when document is visible.
 * Shows dropdown on click; clicking an item marks it read and navigates to round.
 */
export const NotificationBell = ({ onSelectRound, size = '34px' }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const containerRef = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const btnDimension = isMobile ? '32px' : size;
  const iconSize = isMobile ? 15 : 16;

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="icon-btn"
        title="Notifications"
        aria-label="Notifications"
        style={{
          position: 'relative',
          width: btnDimension,
          minWidth: btnDimension,
          maxWidth: btnDimension,
          height: btnDimension,
          minHeight: btnDimension,
          maxHeight: btnDimension,
          padding: 0,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isOpen ? 'var(--primary-glow)' : 'transparent',
          border: '1px solid var(--border-light)',
          color: unreadCount > 0 ? 'var(--primary)' : 'var(--text-secondary)',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'all 0.18s ease-out',
        }}
      >
        <Bell size={iconSize} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-2px',
              right: '-2px',
              minWidth: '16px',
              height: '16px',
              padding: '0 3px',
              borderRadius: '999px',
              background: '#ef4444',
              color: '#ffffff',
              fontSize: '0.65rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 6px rgba(239, 68, 68, 0.7)',
              border: '2px solid var(--bg-main, #0f172a)',
              lineHeight: 1,
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Mobile Dimmer Overlay */}
      {isOpen && isMobile && (
        <div
          onClick={() => setIsOpen(false)}
          className="modal-overlay-fade"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 12, 8, 0.55)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            zIndex: 1099,
          }}
        />
      )}

      {/* Notifications Dropdown Container */}
      {isOpen && (
        <div
          style={{
            position: isMobile ? 'fixed' : 'absolute',
            top: isMobile ? '68px' : 'calc(100% + 8px)',
            left: isMobile ? '12px' : 'auto',
            right: isMobile ? '12px' : 0,
            width: isMobile ? 'auto' : '360px',
            maxWidth: isMobile ? 'calc(100vw - 24px)' : 'calc(100vw - 32px)',
            maxHeight: isMobile ? 'calc(100vh - 84px)' : '460px',
            background: 'var(--bg-surface, #ffffff)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.35)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            zIndex: 1100,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            animation: 'mobileMenuSlideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid var(--border-light)',
              background: 'rgba(0, 0, 0, 0.02)',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bell size={16} style={{ color: 'var(--primary)' }} />
              <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                Notifications
              </strong>
              {unreadCount > 0 && (
                <span
                  style={{
                    fontSize: '0.7rem',
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

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: '0.74rem',
                    color: 'var(--primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: 600,
                  }}
                >
                  <CheckCheck size={14} /> Mark all read
                </button>
              )}
              {isMobile && (
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px',
                  }}
                  title="Close"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Notification Items List */}
          <div style={{ maxHeight: isMobile ? 'calc(100vh - 150px)' : '380px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div
                style={{
                  padding: '36px 20px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '0.85rem',
                }}
              >
                <Award size={28} style={{ opacity: 0.35, marginBottom: '8px' }} />
                <div style={{ fontWeight: 600 }}>You're all caught up!</div>
                <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>No new unread notifications.</div>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border-light)',
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
                    <strong style={{ fontSize: '0.86rem', color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                      {n.title}
                    </strong>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {n.createdAt ? new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>

                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: '1.4', wordBreak: 'break-word' }}>
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
