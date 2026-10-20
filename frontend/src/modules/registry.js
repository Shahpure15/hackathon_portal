/**
 * Permission mappings and navigation registry for admin and staff modules.
 */

export const ADMIN_NAV_PERMISSIONS = {
  teams: ['team.view'],
  qrScan: ['team.view'],
  pods: ['pod.view'],
  panels: ['panel.view'],
  evalRounds: ['round.view'],
  myScoring: ['evaluation.score'],
  volunteers: ['staff.view'],
  checkpoints: ['checkpoint.view'],
  ps: ['ps.view'],
  psLive: ['ps.view'],
  roles: ['role.manage'],
  email: ['email.manage', 'staff.invite'],
  eventConfig: ['config.view'],
};

export const STAFF_TAB_PERMISSIONS = {
  checkin: 'team.view',
  checkpoints: 'checkpoint.view',
  people: 'people.view',
  evaluations: 'evaluation.score',
};

export const ADMIN_GROUPS = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      { id: 'overview', label: 'Overview', icon: 'LayoutDashboard', requires: [], adminOnly: true },
    ],
  },
  {
    id: 'people',
    label: 'People',
    items: [
      { id: 'teams', label: 'Teams', icon: 'Users', requires: ['team.view'] },
      { id: 'volunteers', label: 'Staff & Judges', icon: 'UserCheck', requires: ['staff.view'] },
    ],
  },
  {
    id: 'eventday',
    label: 'Event day',
    items: [
      { id: 'checkpoints', label: 'Attendance', icon: 'CalendarCheck', requires: ['checkpoint.view'] },
      { id: 'qrScan', label: 'QR lookup', icon: 'QrCode', requires: ['team.view'] },
      { id: 'pods', label: 'Pods', icon: 'Boxes', requires: ['pod.view'], feature: 'pods' },
      { id: 'panels', label: 'Panels', icon: 'PanelsTopLeft', requires: ['panel.view'] },
      { id: 'ps', label: 'Problem statements', icon: 'ListChecks', requires: ['ps.view'] },
      { id: 'psLive', label: 'Live PS view', icon: 'Radio', requires: ['ps.view'] },
    ],
  },
  {
    id: 'judging',
    label: 'Judging',
    items: [
      { id: 'evalRounds', label: 'Rounds', icon: 'ClipboardCheck', requires: ['round.view'], feature: 'evaluation' },
      { id: 'myScoring', label: 'Score teams', icon: 'Award', requires: ['evaluation.score'], feature: 'evaluation' },
    ],
  },
  {
    id: 'communicate',
    label: 'Communicate',
    items: [
      { id: 'email', label: 'Email', icon: 'Mail', anyOf: ['email.send', 'email.manage', 'staff.invite'] },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    items: [
      { id: 'eventConfig', label: 'Event configuration', icon: 'Settings', requires: ['config.view'] },
      { id: 'roles', label: 'Roles & access', icon: 'ShieldCheck', requires: ['role.manage'] },
    ],
  },
];

/**
 * Filter admin navigation groups to permitted modules only, dropping empty groups.
 *
 * @param {Function} can - (perm: string) => boolean
 * @param {Function} canAny - (perms: string[]) => boolean
 * @param {Object} features - Event feature flags object
 * @param {boolean} isAdmin - Whether the current user is an admin
 * @returns {Array} List of groups with visible items
 */
export function visibleGroups(can, canAny, features = {}, isAdmin = false) {
  const checkCan = typeof can === 'function' ? can : () => true;
  const checkCanAny = typeof canAny === 'function' ? canAny : (perms) => perms.some((p) => checkCan(p));

  const filtered = [];

  for (const group of ADMIN_GROUPS) {
    const visibleItems = [];

    for (const item of group.items) {
      if (item.adminOnly && !isAdmin) {
        continue;
      }
      // Feature check: hide if feature explicitly disabled
      if (item.feature && features?.[item.feature] === false) {
        continue;
      }

      // Permission check: requires
      if (item.requires) {
        if (item.requires.length > 0 && !item.requires.every((p) => checkCan(p))) {
          continue;
        }
      }

      // Permission check: anyOf
      if (item.anyOf) {
        if (!checkCanAny(item.anyOf)) {
          continue;
        }
      }

      visibleItems.push(item);
    }

    if (visibleItems.length > 0) {
      filtered.push({
        ...group,
        items: visibleItems,
      });
    }
  }

  return filtered;
}
