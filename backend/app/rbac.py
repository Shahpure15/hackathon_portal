import threading
import time
from typing import Dict, List, Optional, Set

from fastapi import Depends, HTTPException, status
from sqlalchemy import false, or_
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user
from app.database import get_db
from app.models import (
    Panel,
    ProblemStatement,
    PSSelection,
    RbacRole,
    Role,
    RolePermission,
    Team,
    UserRoleAssignment,
)
from app.permissions import CATALOG, SEED_ROLES, expand_permissions, is_assignable

CACHE_TTL_SECONDS = 15
CACHE_MAX_ENTRIES = 5000
_cache: Dict[str, tuple] = {}
_lock = threading.Lock()
FORBIDDEN_DETAIL = "Access denied: insufficient permissions"


class ResolvedAccess:
    def __init__(
        self,
        permissions: Set[str],
        team_scope_all: bool,
        pod_ids: Set[str],
        panel_ids: Set[str],
        role_names: List[str],
    ):
        self.permissions = permissions
        self.team_scope_all = team_scope_all
        self.pod_ids = pod_ids
        self.panel_ids = panel_ids
        self.role_names = role_names


class Principal:
    def __init__(self, ctx: CurrentUser, access: ResolvedAccess):
        self._ctx = ctx
        self.access = access
        self.permissions = access.permissions
        self.is_admin = ctx.role == Role.ADMIN

    def __getattr__(self, name):
        if name.startswith('_'):
            raise AttributeError(name)
        return getattr(self._ctx, name)

    def has(self, key: str) -> bool:
        return self.is_admin or key in self.permissions


def invalidate_user(user_id: str) -> None:
    with _lock:
        _cache.pop(user_id, None)


def invalidate_all() -> None:
    with _lock:
        _cache.clear()


def ensure_system_roles(db: Session, event_id: str) -> None:
    """Idempotently create the event's Volunteer and Judge system roles from SEED_ROLES."""
    for system_key, role_data in SEED_ROLES.items():
        existing = (
            db.query(RbacRole)
            .filter(
                RbacRole.eventId == event_id,
                or_(RbacRole.systemKey == system_key, RbacRole.name == role_data['name']),
            )
            .first()
        )
        if not existing:
            role = RbacRole(
                eventId=event_id,
                name=role_data['name'],
                description=role_data.get('description'),
                isSystem=True,
                systemKey=system_key,
            )
            db.add(role)
            db.flush()
            for perm in role_data.get('permissions', []):
                db.add(RolePermission(roleId=role.id, permissionKey=perm))
    db.commit()


def resolve_access(db: Session, ctx: CurrentUser) -> ResolvedAccess:
    if ctx.role == Role.ADMIN:
        return ResolvedAccess(set(CATALOG), True, set(), set(), ['Admin'])
    if ctx.role != Role.VOLUNTEER:
        return ResolvedAccess(set(), False, set(), set(), [])

    now = time.time()
    with _lock:
        hit = _cache.get(ctx.id)
    if hit and now - hit[0] < CACHE_TTL_SECONDS:
        return hit[1]

    # Load (assignment, role) rows for ctx.id.
    assignments = (
        db.query(UserRoleAssignment)
        .filter(UserRoleAssignment.userId == ctx.id)
        .all()
    )

    # Legacy fallback: If there are none, ensure system roles and create an assignment
    if not assignments and ctx.eventId:
        ensure_system_roles(db, ctx.eventId)
        vol_role = (
            db.query(RbacRole)
            .filter(RbacRole.eventId == ctx.eventId, RbacRole.systemKey == 'volunteer')
            .first()
        )
        if vol_role:
            new_assignment = UserRoleAssignment(
                eventId=ctx.eventId,
                userId=ctx.id,
                roleId=vol_role.id,
                scope={'teams': {'mode': 'all', 'ids': []}},
                createdBy='SYSTEM',
            )
            db.add(new_assignment)
            db.commit()
            assignments = [new_assignment]

    all_perms: Set[str] = set()
    team_scope_all = False
    pod_ids: Set[str] = set()
    panel_ids: Set[str] = set()
    role_names: List[str] = []

    for asgn in assignments:
        role = db.query(RbacRole).filter(RbacRole.id == asgn.roleId).first()
        if not role:
            continue
        if role.name not in role_names:
            role_names.append(role.name)

        role_perm_keys = [p.permissionKey for p in role.permissions]
        expanded = expand_permissions(role_perm_keys)
        assignable_keys = {k for k in expanded if is_assignable(k)}
        all_perms.update(assignable_keys)

        if 'team.view' in expanded:
            scope = asgn.scope or {}
            teams_scope = scope.get('teams')
            if teams_scope is None:
                team_scope_all = True
            else:
                mode = teams_scope.get('mode', 'all')
                ids = teams_scope.get('ids', [])
                if mode == 'all':
                    team_scope_all = True
                elif mode == 'pods':
                    pod_ids.update(ids)
                elif mode == 'panels':
                    panel_ids.update(ids)
                elif mode == 'mixed':
                    pod_ids.update(teams_scope.get('podIds', []))
                    panel_ids.update(teams_scope.get('panelIds', []))

    access = ResolvedAccess(
        permissions=all_perms,
        team_scope_all=team_scope_all,
        pod_ids=pod_ids,
        panel_ids=panel_ids,
        role_names=role_names,
    )

    with _lock:
        if len(_cache) >= CACHE_MAX_ENTRIES:
            _cache.clear()
        _cache[ctx.id] = (now, access)

    return access


def require_permission(key: str, *more: str, principal_types: Optional[tuple] = None):
    """Any-of semantics when several keys are given. Unknown keys fail at import time."""
    keys = (key,) + more
    for k in keys:
        if k not in CATALOG:
            raise KeyError('Unknown permission key: ' + k)

    def dependency(
        current_user: CurrentUser = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> Principal:
        if principal_types is not None and current_user.role not in principal_types:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=FORBIDDEN_DETAIL)
        principal = Principal(current_user, resolve_access(db, current_user))
        if not any(principal.has(k) for k in keys):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=FORBIDDEN_DETAIL)
        return principal

    return dependency


def require_principal(*types):
    """Guard by principal type only (for example every volunteer-type user), no permission."""
    def dependency(
        current_user: CurrentUser = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> Principal:
        if current_user.role not in types:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=FORBIDDEN_DETAIL)
        return Principal(current_user, resolve_access(db, current_user))

    return dependency


def apply_team_scope(query, principal: Principal, team_model=Team):
    access = principal.access
    if principal.is_admin or access.team_scope_all:
        return query

    clauses = []
    if access.pod_ids:
        clauses.append(team_model.podId.in_(access.pod_ids))

    if access.panel_ids:
        clauses.append(
            team_model.id.in_(
                query.session.query(PSSelection.teamId)
                .join(ProblemStatement, PSSelection.psId == ProblemStatement.id)
                .join(Panel, Panel.problemStatementId == ProblemStatement.id)
                .filter(Panel.id.in_(access.panel_ids))
            )
        )

    if not clauses:
        return query.filter(false())

    return query.filter(or_(*clauses))
