/**
 * Action registry for the Command Palette.
 */

export const ADMIN_ACTIONS = [
  {
    id: 'invite_staff',
    label: 'Invite staff',
    category: 'Actions',
    keywords: ['invite', 'staff', 'volunteer', 'judge', 'email'],
    requires: ['staff.invite'],
    run: ({ navigate }) => {
      navigate('email');
    },
  },
  {
    id: 'create_round',
    label: 'Create round',
    category: 'Actions',
    keywords: ['round', 'create', 'rubric', 'new round', 'judging'],
    requires: ['round.manage'],
    run: ({ navigate }) => {
      navigate('evalRounds');
    },
  },
  {
    id: 'assign_judges',
    label: 'Assign judges',
    category: 'Actions',
    keywords: ['assign', 'judges', 'judging', 'evaluation', 'panel'],
    requires: ['round.manage'],
    run: ({ navigate }) => {
      navigate('evalRounds');
    },
  },
  {
    id: 'email_teams',
    label: 'Email teams',
    category: 'Actions',
    keywords: ['email', 'teams', 'broadcast', 'compose', 'message'],
    requires: ['email.send'],
    run: ({ navigate }) => {
      navigate('email');
    },
  },
  {
    id: 'email_judges',
    label: 'Email judges',
    category: 'Actions',
    keywords: ['email', 'judges', 'staff', 'broadcast', 'compose'],
    requires: ['email.send'],
    run: ({ navigate }) => {
      navigate('email');
    },
  },
  {
    id: 'open_roles',
    label: 'Open Roles & access',
    category: 'Actions',
    keywords: ['roles', 'permissions', 'access', 'rbac', 'security'],
    requires: ['role.manage'],
    run: ({ navigate }) => {
      navigate('roles');
    },
  },
];
