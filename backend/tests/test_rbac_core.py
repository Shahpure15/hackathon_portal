import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_password_hash
from app.models import Pod, RbacRole, Role, RolePermission, Team, User, UserRoleAssignment
from app.permissions import CATALOG, SEED_ROLES, expand_permissions
from app.rbac import (
    Principal,
    ResolvedAccess,
    apply_team_scope,
    assign_default_role,
    invalidate_user,
    require_permission,
    resolve_access,
)
from tests.factories import auth_header, make_org_event, make_team, make_user, make_volunteer


def test_1_unknown_key_raises_key_error():
    with pytest.raises(KeyError, match="Unknown permission key: not_a_real.key"):
        require_permission("not_a_real.key")


def test_2_admin_resolves_every_catalog_key(db: Session):
    event = make_org_event(db)
    admin_user = make_user(db, event, Role.ADMIN, "admin_all_keys")
    ctx = CurrentUser(
        id=admin_user.id,
        eventId=event.id,
        username=admin_user.username,
        role=Role.ADMIN,
    )
    access = resolve_access(db, ctx)
    principal = Principal(ctx, access)

    assert principal.is_admin is True
    assert access.team_scope_all is True
    for key in CATALOG:
        assert principal.has(key) is True


def test_3_volunteer_with_seeded_role(db: Session):
    event = make_org_event(db)
    vol_user = make_user(db, event, Role.VOLUNTEER, "vol_seeded")
    assign_default_role(db, vol_user, None)
    ctx = CurrentUser(
        id=vol_user.id,
        eventId=event.id,
        username=vol_user.username,
        role=Role.VOLUNTEER,
    )
    access = resolve_access(db, ctx)
    principal = Principal(ctx, access)

    expected = expand_permissions(SEED_ROLES['volunteer']['permissions'])
    assert principal.permissions == expected
    assert principal.has('attendance.mark') is True
    assert principal.has('team.view') is True
    assert principal.has('config.manage') is False


def test_4_volunteer_no_assignment_deny_by_default(db: Session):
    event = make_org_event(db)
    vol_user = make_user(db, event, Role.VOLUNTEER, "vol_no_assignment")
    ctx = CurrentUser(
        id=vol_user.id,
        eventId=event.id,
        username=vol_user.username,
        role=Role.VOLUNTEER,
    )

    # Initially zero assignments
    assert db.query(UserRoleAssignment).filter(UserRoleAssignment.userId == vol_user.id).count() == 0

    access = resolve_access(db, ctx)
    assert len(access.permissions) == 0
    assert access.role_names == []

    # resolve_access must NEVER write to the database
    count = db.query(UserRoleAssignment).filter(UserRoleAssignment.userId == vol_user.id).count()
    assert count == 0

    # Calling again creates no second row
    invalidate_user(vol_user.id)
    access2 = resolve_access(db, ctx)
    assert len(access2.permissions) == 0
    assert db.query(UserRoleAssignment).filter(UserRoleAssignment.userId == vol_user.id).count() == 0


def test_5_scope_union(db: Session):
    event = make_org_event(db)
    vol_user = make_user(db, event, Role.VOLUNTEER, "vol_scope_union")

    role1 = RbacRole(eventId=event.id, name="ScopeRole1", isSystem=False)
    role2 = RbacRole(eventId=event.id, name="ScopeRole2", isSystem=False)
    db.add_all([role1, role2])
    db.flush()
    db.add(RolePermission(roleId=role1.id, permissionKey="team.view"))
    db.add(RolePermission(roleId=role2.id, permissionKey="team.view"))

    asgn1 = UserRoleAssignment(
        eventId=event.id,
        userId=vol_user.id,
        roleId=role1.id,
        scope={"teams": {"mode": "pods", "ids": ["p1"]}},
    )
    asgn2 = UserRoleAssignment(
        eventId=event.id,
        userId=vol_user.id,
        roleId=role2.id,
        scope={"teams": {"mode": "pods", "ids": ["p2"]}},
    )
    db.add_all([asgn1, asgn2])
    db.commit()

    ctx = CurrentUser(
        id=vol_user.id,
        eventId=event.id,
        username=vol_user.username,
        role=Role.VOLUNTEER,
    )
    invalidate_user(vol_user.id)
    access = resolve_access(db, ctx)
    assert access.pod_ids == {"p1", "p2"}
    assert access.team_scope_all is False

    # Updating assignment to 'all' makes team_scope_all True
    asgn1.scope = {"teams": {"mode": "all", "ids": []}}
    db.commit()
    invalidate_user(vol_user.id)
    access2 = resolve_access(db, ctx)
    assert access2.team_scope_all is True


def test_6_apply_team_scope(db: Session):
    event = make_org_event(db)
    pod_a = Pod(eventId=event.id, name="Pod A")
    pod_b = Pod(eventId=event.id, name="Pod B")
    db.add_all([pod_a, pod_b])
    db.commit()

    t_a = make_team(db, event, name="Team A", registration_id="REG-A", pod=pod_a)
    t_b = make_team(db, event, name="Team B", registration_id="REG-B", pod=pod_b)

    vol = make_user(db, event, Role.VOLUNTEER, "vol_scoped")
    ctx = CurrentUser(
        id=vol.id,
        eventId=event.id,
        username=vol.username,
        role=Role.VOLUNTEER,
    )

    # Scoped only to pod_a
    from app.rbac import ResolvedAccess
    access = ResolvedAccess(
        permissions={"team.view"},
        team_scope_all=False,
        pod_ids={pod_a.id},
        panel_ids=set(),
        role_names=["Pod Staff"],
    )
    principal = Principal(ctx, access)

    q = db.query(Team).filter(Team.eventId == event.id)
    filtered = apply_team_scope(q, principal).all()
    assert len(filtered) == 1
    assert filtered[0].id == t_a.id

    # No scope clauses -> returns zero rows
    empty_access = ResolvedAccess(
        permissions={"team.view"},
        team_scope_all=False,
        pod_ids=set(),
        panel_ids=set(),
        role_names=["NoScope"],
    )
    empty_principal = Principal(ctx, empty_access)
    zero_filtered = apply_team_scope(q, empty_principal).all()
    assert len(zero_filtered) == 0


def test_7_cache_and_invalidation(db: Session):
    event = make_org_event(db)
    vol = make_user(db, event, Role.VOLUNTEER, "vol_cache")
    role = RbacRole(eventId=event.id, name="CacheRole", isSystem=False)
    db.add(role)
    db.flush()
    db.add(RolePermission(roleId=role.id, permissionKey="team.view"))
    db.add(UserRoleAssignment(
        eventId=event.id,
        userId=vol.id,
        roleId=role.id,
        scope={"teams": {"mode": "all", "ids": []}},
    ))
    db.commit()

    ctx = CurrentUser(
        id=vol.id,
        eventId=event.id,
        username=vol.username,
        role=Role.VOLUNTEER,
    )
    invalidate_user(vol.id)
    acc1 = resolve_access(db, ctx)
    assert "team.edit" not in acc1.permissions

    # Add team.edit to role
    db.add(RolePermission(roleId=role.id, permissionKey="team.edit"))
    db.commit()

    # Cached value still does not have team.edit
    acc_cached = resolve_access(db, ctx)
    assert "team.edit" not in acc_cached.permissions

    # After invalidation, fresh value is loaded
    invalidate_user(vol.id)
    acc_fresh = resolve_access(db, ctx)
    assert "team.edit" in acc_fresh.permissions


def test_8_disabled_user_rejected_at_auth(client, db: Session):
    event = make_org_event(db)
    user = make_user(db, event, Role.ADMIN, "disabled_user", status="disabled")
    headers = auth_header(user)

    res = client.get("/admin/system/info", headers=headers)
    assert res.status_code == 401
    assert res.json() == {"detail": "Could not validate credentials"}


def test_9_leader_gets_403(db: Session):
    event = make_org_event(db)
    leader = make_user(db, event, Role.LEADER, "leader_test")
    ctx = CurrentUser(
        id=leader.id,
        eventId=event.id,
        username=leader.username,
        role=Role.LEADER,
    )
    access = resolve_access(db, ctx)
    principal = Principal(ctx, access)
    assert principal.has("team.view") is False

    dep = require_permission("team.view")
    with pytest.raises(HTTPException) as exc_info:
        dep(current_user=ctx, db=db)
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Access denied: insufficient permissions"


def test_10_principal_delegation(db: Session):
    ctx = CurrentUser(
        id="u-123",
        eventId="e-456",
        username="john_doe",
        role="VOLUNTEER",
        teamId="t-789",
    )
    access = ResolvedAccess(
        permissions={"team.view"},
        team_scope_all=True,
        pod_ids=set(),
        panel_ids=set(),
        role_names=["Staff"],
    )
    principal = Principal(ctx, access)

    assert principal.id == "u-123"
    assert principal.eventId == "e-456"
    assert principal.username == "john_doe"
    assert principal.role == "VOLUNTEER"
    assert principal.teamId == "t-789"
    with pytest.raises(AttributeError):
        _ = principal._private_attr
