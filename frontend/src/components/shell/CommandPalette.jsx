import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  X,
  Compass,
  Zap,
  Users,
  UserCheck,
  History,
  LayoutDashboard,
  CalendarCheck,
  QrCode,
  Boxes,
  PanelsTopLeft,
  ListChecks,
  Radio,
  ClipboardCheck,
  Mail,
  ShieldCheck,
  Circle,
  ArrowRight,
} from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { ADMIN_ACTIONS } from '../../modules/actions';

const ICON_MAP = {
  LayoutDashboard,
  Users,
  UserCheck,
  CalendarCheck,
  QrCode,
  Boxes,
  PanelsTopLeft,
  ListChecks,
  Radio,
  ClipboardCheck,
  Mail,
  ShieldCheck,
};

export default function CommandPalette({
  isOpen = false,
  onClose,
  groups = [],
  onNavigate,
}) {
  const { can, canAny } = useAuth();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [teamResults, setTeamResults] = useState([]);
  const [volunteerResults, setVolunteerResults] = useState([]);
  const [searchingRemote, setSearchingRemote] = useState(false);

  const inputRef = useRef(null);
  const listRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Capture previous active element on open and restore on close
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus?.();
    }
  }, [isOpen]);

  // Global Ctrl+K / Cmd+K and Escape handlers
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // Open handled by parent or if open state is controlled
        }
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Read recent item IDs from localStorage
  const recentIds = useMemo(() => {
    try {
      const raw = localStorage.getItem('admin-palette-recent');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, [isOpen]);

  // Flatten available navigation items
  const allNavItems = useMemo(() => {
    const list = [];
    for (const group of groups) {
      for (const item of group.items) {
        list.push({
          type: 'nav',
          id: item.id,
          label: item.label,
          groupLabel: group.label,
          icon: item.icon,
        });
      }
    }
    return list;
  }, [groups]);

  // Permitted actions
  const permittedActions = useMemo(() => {
    return ADMIN_ACTIONS.filter((act) => {
      if (!act.requires || act.requires.length === 0) return true;
      return act.requires.every((p) => can(p));
    }).map((act) => ({
      type: 'action',
      id: act.id,
      label: act.label,
      keywords: act.keywords || [],
      action: act,
    }));
  }, [can]);

  // Remote debounced search for teams and volunteers
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setTeamResults([]);
      setVolunteerResults([]);
      setSearchingRemote(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchingRemote(true);
      try {
        const promises = [];

        // Search teams if user has team.view
        if (can('team.view')) {
          promises.push(
            api
              .get('/admin/teams', { params: { search: trimmed, limit: 5 } })
              .then((res) => {
                const teams = res.data?.teams || res.data || [];
                return teams.slice(0, 5).map((t) => ({
                  type: 'team',
                  id: t.id,
                  label: `${t.name} (${t.registrationId})`,
                  sub: t.leaderName ? `Leader: ${t.leaderName}` : '',
                  registrationId: t.registrationId,
                }));
              })
              .catch(() => [])
          );
        } else {
          promises.push(Promise.resolve([]));
        }

        // Search volunteers if user has staff.view
        if (can('staff.view')) {
          promises.push(
            api
              .get('/admin/volunteers', { params: { search: trimmed } })
              .then((res) => {
                const vols = Array.isArray(res.data) ? res.data : [];
                return vols.slice(0, 5).map((v) => ({
                  type: 'volunteer',
                  id: v.id,
                  label: v.name,
                  sub: v.type ? `Role: ${v.type}` : '',
                  name: v.name,
                }));
              })
              .catch(() => [])
          );
        } else {
          promises.push(Promise.resolve([]));
        }

        const [teams, volunteers] = await Promise.all(promises);
        setTeamResults(teams);
        setVolunteerResults(volunteers);
      } finally {
        setSearchingRemote(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, can]);

  // Combine and partition results
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) {
      // Empty query: Show recent items first, then navigation groups
      const list = [];

      // 1. Recent
      if (recentIds.length > 0) {
        const recentItems = [];
        for (const rId of recentIds) {
          const matchNav = allNavItems.find((n) => n.id === rId);
          if (matchNav) recentItems.push(matchNav);
          const matchAct = permittedActions.find((a) => a.id === rId);
          if (matchAct) recentItems.push(matchAct);
        }
        if (recentItems.length > 0) {
          list.push({ title: 'Recent', items: recentItems });
        }
      }

      // 2. Navigation items
      if (allNavItems.length > 0) {
        list.push({ title: 'Navigation', items: allNavItems });
      }

      // 3. Actions
      if (permittedActions.length > 0) {
        list.push({ title: 'Actions', items: permittedActions });
      }

      return list;
    }

    // Filtered by query
    const list = [];

    // Matching Navigation
    const matchingNav = allNavItems.filter((n) =>
      n.label.toLowerCase().includes(q)
    );
    if (matchingNav.length > 0) {
      list.push({ title: 'Navigation', items: matchingNav });
    }

    // Matching Actions
    const matchingActions = permittedActions.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        a.keywords.some((kw) => kw.toLowerCase().includes(q))
    );
    if (matchingActions.length > 0) {
      list.push({ title: 'Actions', items: matchingActions });
    }

    // Matching Teams
    if (teamResults.length > 0) {
      list.push({ title: 'Teams', items: teamResults });
    }

    // Matching Staff
    if (volunteerResults.length > 0) {
      list.push({ title: 'Staff & Judges', items: volunteerResults });
    }

    return list;
  }, [query, allNavItems, permittedActions, teamResults, volunteerResults, recentIds]);

  // Flattened items list for arrow navigation
  const flatItems = useMemo(() => {
    return sections.flatMap((sec) => sec.items);
  }, [sections]);

  // Ensure activeIndex is in range
  useEffect(() => {
    if (activeIndex >= flatItems.length) {
      setActiveIndex(Math.max(0, flatItems.length - 1));
    }
  }, [flatItems.length, activeIndex]);

  // Execute selected item
  const handleExecute = (item) => {
    if (!item) return;

    // Persist to recent choices
    try {
      const prev = recentIds.filter((id) => id !== item.id);
      const next = [item.id, ...prev].slice(0, 6);
      localStorage.setItem('admin-palette-recent', JSON.stringify(next));
    } catch {
      // ignore localStorage errors
    }

    if (item.type === 'nav') {
      onNavigate(item.id);
    } else if (item.type === 'action') {
      item.action.run({ navigate: onNavigate });
    } else if (item.type === 'team') {
      onNavigate('teams', { q: item.registrationId });
    } else if (item.type === 'volunteer') {
      onNavigate('volunteers', { q: item.name });
    }

    onClose();
  };

  // Keyboard navigation inside input
  const handleInputKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < flatItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, flatItems.length - 1)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatItems[activeIndex]) {
        handleExecute(flatItems[activeIndex]);
      }
    }
  };

  if (!isOpen) return null;

  let currentFlatIndex = 0;

  return (
    <div
      className="command-palette-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="command-palette-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
      >
        {/* Search Input Bar */}
        <div className="command-palette-input-wrapper">
          <Search size={18} style={{ color: 'var(--text-muted)' }} />
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Type a command, module name, team code, or person..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            aria-autocomplete="list"
            aria-controls="command-palette-list"
            aria-activedescendant={
              flatItems[activeIndex] ? `palette-item-${activeIndex}` : undefined
            }
          />
          <kbd className="admin-search-kbd">ESC</kbd>
        </div>

        {/* Results Listbox */}
        <div
          ref={listRef}
          id="command-palette-list"
          className="command-palette-list"
          role="listbox"
        >
          {sections.length === 0 ? (
            <div className="command-palette-empty">
              {searchingRemote
                ? 'Searching teams and staff...'
                : `No results found for "${query}"`}
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.title}>
                <div className="command-palette-section-title">
                  {section.title}
                </div>
                {section.items.map((item) => {
                  const itemIndex = currentFlatIndex++;
                  const isSelected = itemIndex === activeIndex;

                  let ItemIcon = Compass;
                  if (item.type === 'nav') {
                    ItemIcon = ICON_MAP[item.icon] || Compass;
                  } else if (item.type === 'action') {
                    ItemIcon = Zap;
                  } else if (item.type === 'team') {
                    ItemIcon = Users;
                  } else if (item.type === 'volunteer') {
                    ItemIcon = UserCheck;
                  }

                  return (
                    <button
                      key={`${item.type}-${item.id}`}
                      id={`palette-item-${itemIndex}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`command-palette-item ${isSelected ? 'active' : ''}`}
                      onClick={() => handleExecute(item)}
                      onMouseEnter={() => setActiveIndex(itemIndex)}
                    >
                      <div className="command-palette-item-left">
                        <ItemIcon size={16} />
                        <span className="command-palette-item-label">
                          {item.label}
                        </span>
                        {item.sub && (
                          <span className="command-palette-item-sub">
                            {item.sub}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {item.groupLabel && (
                          <span className="command-palette-badge">
                            {item.groupLabel}
                          </span>
                        )}
                        {isSelected && <ArrowRight size={14} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="command-palette-footer">
          <span>Navigate with <kbd className="admin-search-kbd">↑</kbd> <kbd className="admin-search-kbd">↓</kbd></span>
          <span>Select with <kbd className="admin-search-kbd">↵</kbd></span>
          <span>Close with <kbd className="admin-search-kbd">ESC</kbd></span>
        </div>
      </div>
    </div>
  );
}
