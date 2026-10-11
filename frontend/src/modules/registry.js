/**
 * Permission mappings for module navigation and dashboard tabs.
 */

export const ADMIN_NAV_PERMISSIONS = {
  teams: 'team.view',
  qrScan: 'team.view',
  pods: 'pod.view',
  panels: 'panel.view',
  evalRounds: 'round.view',
  volunteers: 'staff.view',
  checkpoints: 'checkpoint.view',
  ps: 'ps.view',
  psLive: 'ps.view',
  roles: 'role.manage',
};

export const STAFF_TAB_PERMISSIONS = {
  checkin: 'team.view',
  people: 'people.view',
};
