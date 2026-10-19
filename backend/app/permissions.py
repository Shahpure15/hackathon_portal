from dataclasses import dataclass
from typing import Dict, Iterable, Set, Tuple

STANDARD = 'standard'      # delegable
SENSITIVE = 'sensitive'    # delegable, UI asks for confirmation
DANGER = 'danger'          # admin-only, never assignable to a role
GOVERNANCE = 'governance'  # admin-only, never assignable to a role
ASSIGNABLE_TIERS = (STANDARD, SENSITIVE)


@dataclass(frozen=True)
class Permission:
    key: str
    module: str
    label: str
    tier: str = STANDARD
    scopable: bool = False
    implies: Tuple[str, ...] = ()
    future: bool = False  # defined now, first used by a later phase


def _p(key, module, label, **kw):
    return Permission(key=key, module=module, label=label, **kw)


CATALOG_LIST = [
    _p('team.view', 'Teams', 'View teams', scopable=True),
    _p('team.edit', 'Teams', 'Edit teams', implies=('team.view',)),
    _p('team.import', 'Teams', 'Import teams', implies=('team.view',)),
    _p('team.export', 'Teams', 'Export teams', implies=('team.view',)),
    _p('team.credentials', 'Teams', 'Reset team passwords and export credentials', tier=SENSITIVE, implies=('team.view',)),
    _p('pod.view', 'Pods', 'View pods'),
    _p('pod.manage', 'Pods', 'Create, edit, delete pods and assign teams', implies=('pod.view', 'team.view')),
    _p('pod.export', 'Pods', 'Export pods', implies=('pod.view',)),
    _p('staff.view', 'Staff', 'View people and organizers'),
    _p('staff.manage', 'Staff', 'Create, edit, delete and import people', implies=('staff.view',)),
    _p('staff.credentials', 'Staff', 'Create and reset staff logins', tier=SENSITIVE, implies=('staff.view',)),
    _p('staff.invite', 'Staff', 'Send staff invitations', implies=('staff.view',), future=True),
    _p('staff.export', 'Staff', 'Export people', implies=('staff.view',)),
    _p('ps.view', 'Problem statements', 'View problem statements'),
    _p('ps.manage', 'Problem statements', 'Manage and import problem statements', implies=('ps.view',)),
    _p('ps.export', 'Problem statements', 'Export problem statements', implies=('ps.view',)),
    _p('ps.assist', 'Problem statements', 'Select a problem statement on behalf of a team', implies=('ps.view', 'team.view')),
    _p('ps.danger', 'Problem statements', 'Clear selections and purge test data', tier=DANGER),
    _p('config.view', 'Config', 'View event configuration'),
    _p('config.manage', 'Config', 'Change event configuration', implies=('config.view',)),
    _p('checkpoint.view', 'Attendance', 'View checkpoints'),
    _p('checkpoint.manage', 'Attendance', 'Manage checkpoints and slots', implies=('checkpoint.view',)),
    _p('attendance.mark', 'Attendance', 'Mark team attendance', scopable=True, implies=('checkpoint.view', 'team.view')),
    _p('attendance.export', 'Attendance', 'Export attendance', implies=('checkpoint.view',)),
    _p('attendance.danger', 'Attendance', 'Clear attendance records', tier=DANGER),
    _p('people.view', 'Attendance', 'View faculty, judges and people'),
    _p('people.checkin', 'Attendance', 'Check in faculty, judges and people', implies=('people.view',)),
    _p('panel.view', 'Panels', 'View panels'),
    _p('panel.manage', 'Panels', 'Manage and import panels', implies=('panel.view',)),
    _p('panel.export', 'Panels', 'Export panels', implies=('panel.view',)),
    _p('round.view', 'Rounds', 'View rounds'),
    _p('round.manage', 'Rounds', 'Create and edit rounds', implies=('round.view',)),
    _p('round.export', 'Rounds', 'Export rounds and submissions', implies=('round.view',)),
    _p('evaluation.score', 'Evaluation', 'Score assigned teams as a judge', future=True),
    _p('evaluation.assign', 'Evaluation', 'Assign judges to teams', implies=('round.view', 'team.view', 'staff.view'), future=True),
    _p('evaluation.view_all', 'Evaluation', 'View all evaluations and staff-only comments', implies=('round.view', 'team.view'), future=True),
    _p('evaluation.unlock', 'Evaluation', 'Unlock submitted evaluations', implies=('evaluation.view_all',), future=True),
    _p('evaluation.release', 'Evaluation', 'Release results to participants', implies=('evaluation.view_all',), future=True),
    _p('evaluation.advance', 'Evaluation', 'Advance teams to the next round', implies=('evaluation.view_all',), future=True),
    _p('evaluation.moderate', 'Evaluation', 'Hide participant-visible comments', implies=('evaluation.view_all',), future=True),
    _p('evaluation.export', 'Evaluation', 'Export evaluations', implies=('evaluation.view_all',), future=True),
    _p('email.send', 'Communications', 'Send emails and announcements', future=True),
    _p('email.manage', 'Communications', 'Manage SMTP accounts and templates', tier=SENSITIVE, future=True),
    _p('audit.view', 'Governance', 'View the audit log', future=True),
    _p('role.manage', 'Governance', 'Manage roles and permissions', tier=GOVERNANCE, future=True),
    _p('access.manage', 'Governance', 'Manage access policies', tier=GOVERNANCE, future=True),
]

CATALOG: Dict[str, Permission] = {p.key: p for p in CATALOG_LIST}

# Frozen copy of what the seeded system roles grant. The Alembic migration in P1-C04
# embeds its OWN copy of these lists on purpose (migrations must not import app code).
SEED_ROLES = {
    'volunteer': {
        'name': 'Volunteer',
        'description': 'Teams, attendance, problem statement assistance and people check-in.',
        'permissions': ['team.view', 'ps.view', 'ps.assist', 'checkpoint.view', 'attendance.mark', 'people.view', 'people.checkin'],
    },
    'judge': {
        'name': 'Judge',
        'description': 'Scores the teams assigned to them.',
        'permissions': ['evaluation.score'],
    },
    'faculty': {
        'name': 'Faculty Lead',
        'description': 'Problem statements, team tracking, and evaluation oversight.',
        'permissions': ['team.view', 'ps.view', 'panel.view', 'round.view', 'evaluation.view_all', 'checkpoint.view', 'people.view'],
    },
}


def expand_permissions(keys: Iterable[str]) -> Set[str]:
    '''Closure over `implies`; unknown keys are ignored (forward compatibility).'''
    result: Set[str] = set()
    stack = [k for k in keys if k in CATALOG]
    while stack:
        key = stack.pop()
        if key in result:
            continue
        result.add(key)
        stack.extend(k for k in CATALOG[key].implies if k not in result)
    return result


def is_assignable(key: str) -> bool:
    return key in CATALOG and CATALOG[key].tier in ASSIGNABLE_TIERS
