import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LogOut, Menu, X, Sun, Moon, ChevronLeft, ChevronRight, KeyRound } from 'lucide-react';
import IconButton from './IconButton';
import AmbientCursorGlow from './AmbientCursorGlow';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import ChangePasswordModal from './ChangePasswordModal';

export function Navbar({
  title = 'MIT India Hackathon',
  user: userProp,
  role: roleProp,
  onLogout,
  navItems = [],
  activeTab,
  onTabChange,
  notification
}) {
  const { user: authUser, access } = useAuth?.() || {};
  const user = userProp || authUser;

  // Dynamically resolve role
  const displayRole = roleProp || user?.displayRole || (access?.roleNames?.length ? access.roleNames.join(' / ') : access?.isAdmin ? 'ADMIN' : access?.landing === 'judge' ? 'JUDGE' : user?.role);

  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const { theme, toggleTheme } = useTheme();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const tabsRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    if (tabsRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabsRef.current;
      setCanScrollLeft(scrollLeft > 5);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 5);
    }
  }, []);

  useEffect(() => {
    checkScroll();
    const el = tabsRef.current;
    if (el) {
      el.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
      return () => {
        el.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
      };
    }
  }, [checkScroll, navItems]);

  const scrollTabs = (direction) => {
    if (tabsRef.current) {
      tabsRef.current.scrollBy({ left: direction * 220, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setMobileOpen(false);
      checkScroll();
    };

    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setScrolled(window.scrollY > 20);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [checkScroll]);

  const handleNavClick = (tabId) => {
    setMobileOpen(false);
    if (onTabChange) {
      if (typeof document !== 'undefined' && document.startViewTransition) {
        document.startViewTransition(() => {
          onTabChange(tabId);
        });
      } else {
        onTabChange(tabId);
      }
    }
  };

  return (
    <>
      <AmbientCursorGlow />
      {/* Floating Glass Notch Navigation Pill */}
      <nav className={`floating-nav ${scrolled ? 'scrolled' : ''}`}>
        {/* Left Section: Logo & Role Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, paddingRight: '6px', minWidth: 0 }}>
          <span
            style={{
              fontWeight: 800,
              fontSize: isMobile ? '0.8rem' : '0.85rem',
              letterSpacing: '0.3px',
              whiteSpace: 'nowrap',
              maxWidth: isMobile ? '120px' : 'auto',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
            className="text-gradient"
          >
            {title}
          </span>
          {displayRole && (
            <span style={{
              fontSize: '0.6rem',
              background: 'var(--primary-glow)',
              color: 'var(--primary)',
              padding: '2px 6px',
              borderRadius: '999px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.3px',
              whiteSpace: 'nowrap',
              maxWidth: isMobile ? '70px' : 'auto',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {displayRole}
            </span>
          )}
        </div>

        {/* Center Section: Desktop Tabs with Clickable Scroll Arrows */}
        {!isMobile && navItems.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', position: 'relative', overflow: 'hidden', flex: 1, minWidth: 0, margin: '0 4px' }}>
            {canScrollLeft && (
              <button
                type="button"
                onClick={() => scrollTabs(-1)}
                title="Scroll navbar left"
                style={{
                  background: 'var(--primary-glow)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '999px',
                  width: '26px',
                  height: '26px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--primary)',
                  marginRight: '4px',
                  flexShrink: 0,
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                  zIndex: 2,
                  padding: 0
                }}
              >
                <ChevronLeft size={14} />
              </button>
            )}

            <div ref={tabsRef} className="floating-nav-tabs" style={{ scrollBehavior: 'smooth' }}>
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                const isDisabled = !!item.disabled;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (isDisabled) {
                        item.onDisabledClick?.();
                      } else {
                        handleNavClick(item.id);
                      }
                    }}
                    className={`btn tab-pill ${isActive ? 'btn-primary' : 'btn-secondary'}`}
                    title={isDisabled ? item.disabledTitle || 'Not available' : undefined}
                    style={{
                      padding: '4px 10px',
                      border: 'none',
                      background: isActive ? undefined : 'transparent',
                      minHeight: 'auto',
                      height: '32px',
                      borderRadius: '999px',
                      fontSize: '0.78rem',
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? undefined : isDisabled ? 'var(--text-muted)' : 'var(--text-secondary)',
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      opacity: isDisabled ? 0.5 : 1,
                      cursor: isDisabled ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                    {isDisabled && item.disabledIcon}
                  </button>
                );
              })}
            </div>

            {canScrollRight && (
              <button
                type="button"
                onClick={() => scrollTabs(1)}
                title="Scroll navbar right"
                style={{
                  background: 'var(--primary-glow)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '999px',
                  width: '26px',
                  height: '26px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--primary)',
                  marginLeft: '4px',
                  flexShrink: 0,
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                  zIndex: 2,
                  padding: 0
                }}
              >
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        )}

        {/* Right Section: Desktop Theme Toggle & Logout or Mobile Menu Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {/* Optional notification bell */}
          {notification}

          {!isMobile ? (
            <>
              {/* User badge with username visible on desktop */}
              {user?.username && (
                <div
                  title={`Logged in as ${user.username} (${displayRole || 'User'})`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '3px 8px 3px 4px',
                    borderRadius: '999px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid var(--border-light)',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, var(--hero), var(--hero-deep))',
                      color: '#ffffff',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textTransform: 'uppercase',
                      flexShrink: 0,
                    }}
                  >
                    {user.username[0]}
                  </div>
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: '0.78rem',
                      maxWidth: '120px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {user.username}
                  </span>
                </div>
              )}

              <IconButton
                size="34px"
                onClick={toggleTheme}
                title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
                aria-label="Toggle Theme"
                style={{ borderRadius: '999px', background: 'transparent' }}
              >
                {theme === 'dark' ? <Sun size={15} color="var(--primary)" /> : <Moon size={15} color="var(--text-secondary)" />}
              </IconButton>
              <button
                type="button"
                onClick={() => setChangePasswordOpen(true)}
                className="btn btn-secondary"
                title="Change Password"
                aria-label="Change Password"
                style={{ padding: '5px 12px', minHeight: 'auto', height: '34px', borderRadius: '999px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                <KeyRound size={14} />
                <span>Password</span>
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="btn btn-secondary"
                style={{ padding: '5px 14px', minHeight: 'auto', height: '34px', borderRadius: '999px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                <LogOut size={14} />
                <span>Logout</span>
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <IconButton
                size="32px"
                onClick={toggleTheme}
                title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
                aria-label="Toggle Theme"
                style={{ borderRadius: '999px', background: 'transparent' }}
              >
                {theme === 'dark' ? <Sun size={14} color="var(--primary)" /> : <Moon size={14} color="var(--text-secondary)" />}
              </IconButton>

              {/* Responsive Hamburger Toggle Button */}
              <button
                type="button"
                onClick={() => setMobileOpen(!mobileOpen)}
                className="btn btn-secondary touch-target"
                title={mobileOpen ? "Close menu" : "Open menu"}
                aria-label={mobileOpen ? "Close menu" : "Open menu"}
                style={{
                  width: '32px',
                  height: '32px',
                  minWidth: '32px',
                  minHeight: '32px',
                  maxWidth: '32px',
                  maxHeight: '32px',
                  padding: 0,
                  borderRadius: '999px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: mobileOpen ? 'var(--primary-glow)' : 'transparent',
                  border: '1px solid var(--border-light)',
                  borderColor: mobileOpen ? 'var(--primary)' : 'var(--border-light)',
                  color: mobileOpen ? 'var(--primary)' : 'var(--text-primary)',
                  position: 'relative',
                  flexShrink: 0
                }}
              >
                {mobileOpen ? <X size={16} /> : <Menu size={16} />}
                {navItems.length > 0 && !mobileOpen && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '3px',
                      right: '3px',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: 'var(--primary)',
                      boxShadow: '0 0 5px var(--primary)',
                    }}
                  />
                )}
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Mobile Glass Dropdown Menu */}
      {isMobile && mobileOpen && (
        <>
          <div
            onClick={() => setMobileOpen(false)}
            className="modal-overlay-fade"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 12, 8, 0.55)',
              backdropFilter: 'blur(6px)',
              zIndex: 998
            }}
          />
          <div className="mobile-glass-dropdown" style={{ maxHeight: 'calc(100vh - 84px)', overflowY: 'auto' }}>
            {user && (
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--hero), var(--hero-deep))',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textTransform: 'uppercase',
                  flexShrink: 0,
                }}>
                  {user.username ? user.username[0] : 'U'}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.username || 'User'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{displayRole || user?.role}</div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '4px 0' }}>
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                const isDisabled = !!item.disabled;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (isDisabled) {
                        item.onDisabledClick?.();
                        setMobileOpen(false);
                      } else {
                        handleNavClick(item.id);
                      }
                    }}
                    className={`btn ${isActive ? 'btn-primary' : 'btn-secondary'}`}
                    style={{
                      justifyContent: 'flex-start',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      fontSize: '0.9rem',
                      border: 'none',
                      background: isActive ? undefined : 'transparent',
                      color: isActive ? undefined : isDisabled ? 'var(--text-muted)' : 'var(--text-primary)',
                      opacity: isDisabled ? 0.5 : 1,
                      cursor: isDisabled ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {item.icon}
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {isDisabled && item.disabledIcon}
                  </button>
                );
              })}

              {/* Mobile Theme Toggle Button */}
              <button
                type="button"
                onClick={toggleTheme}
                className="btn btn-secondary"
                style={{
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  fontSize: '0.9rem',
                  border: '1px solid var(--border-light)',
                  marginTop: '4px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {theme === 'dark' ? <Sun size={16} color="var(--primary)" /> : <Moon size={16} color="var(--text-secondary)" />}
                  <span>{theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
                </div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'var(--primary-glow)', color: 'var(--primary)' }}>
                  {theme.toUpperCase()}
                </span>
              </button>
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                setChangePasswordOpen(true);
              }}
              className="btn btn-secondary"
              style={{
                justifyContent: 'flex-start',
                padding: '12px 16px',
                borderRadius: '12px',
                fontSize: '0.9rem',
                border: '1px solid var(--border-light)',
                marginTop: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <KeyRound size={16} />
              <span>Change Password</span>
            </button>
          </div>

          {onLogout && (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  onLogout();
                }}
                className="btn btn-secondary"
                style={{
                  justifyContent: 'center',
                  padding: '12px',
                  borderRadius: '12px',
                  fontSize: '0.9rem',
                  color: 'var(--danger)',
                  borderColor: 'rgba(239, 68, 68, 0.2)',
                  marginTop: '4px'
                }}
              >
                <LogOut size={16} />
                <span>Logout</span>
              </button>
            )}
          </div>
        </>
      )}

      <ChangePasswordModal
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />
    </>
  );
}

export default Navbar;
