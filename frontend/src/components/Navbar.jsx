import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LogOut, Menu, X, Sun, Moon, ChevronLeft, ChevronRight } from 'lucide-react';
import IconButton from './IconButton';
import AmbientCursorGlow from './AmbientCursorGlow';
import { useTheme } from '../contexts/ThemeContext';

export function Navbar({
  title = 'MIT India Hackathon',
  user,
  onLogout,
  navItems = [],
  activeTab,
  onTabChange
}) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const { theme, toggleTheme } = useTheme();

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, paddingRight: '8px' }}>
          <span style={{ fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.3px', whiteSpace: 'nowrap' }} className="text-gradient">
            {title}
          </span>
          {user?.role && (
            <span style={{
              fontSize: '0.6rem',
              background: 'var(--primary-glow)',
              color: 'var(--primary)',
              padding: '2px 6px',
              borderRadius: '999px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.3px',
              whiteSpace: 'nowrap'
            }}>
              {user.role}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {!isMobile ? (
            <>
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
                onClick={onLogout}
                className="btn btn-secondary"
                style={{ padding: '5px 14px', minHeight: 'auto', height: '34px', borderRadius: '999px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                <LogOut size={14} />
                <span>Logout</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              title="Toggle Menu"
              className="mobile-navbar-toggle"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
              <span className="mobile-navbar-toggle-label">Menu</span>
            </button>
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
          <div className="mobile-glass-dropdown">
            {user && (
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{user.username || 'User'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user.role}</div>
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
    </>
  );
}

export default Navbar;
