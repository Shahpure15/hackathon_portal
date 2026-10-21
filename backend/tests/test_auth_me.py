from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models import Role, RbacRole, RolePermission, UserRoleAssignment
from app.permissions import CATALOG
from app.rbac import assign_default_role
from tests.factories import make_org_event, make_user, make_volunteer, auth_header

client = TestClient(app)


def test_auth_me_unauthenticated():
    res = client.get("/auth/me")
    assert res.status_code in (401, 403)


def test_auth_me_admin(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "test_admin")

    res = client.get("/auth/me", headers=auth_header(admin))
    assert res.status_code == 200
    data = res.json()

    assert data["username"] == "test_admin"
    assert data["role"] == "ADMIN"
    assert data["isAdmin"] is True
    assert data["status"] == "active"
    assert data["roleNames"] == ["Admin"]
    assert len(data["permissions"]) == len(CATALOG)
    assert data["permissions"] == sorted(list(CATALOG.keys()))
    assert data["scope"] == {"teams": {"mode": "all", "ids": []}}
    assert "pods" in data["features"]
    assert "evaluation" in data["features"]
    assert data["moduleGates"] == {}


def test_auth_me_volunteer_no_role(db: Session):
    event = make_org_event(db)
    vol_rec = make_volunteer(db, event, "norole_vol")
    vol_user = make_user(db, event, Role.VOLUNTEER, "norole_vol", volunteer=vol_rec)

    count_before = db.query(UserRoleAssignment).filter(UserRoleAssignment.userId == vol_user.id).count()
    assert count_before == 0

    res = client.get("/auth/me", headers=auth_header(vol_user))
    assert res.status_code == 200
    data = res.json()
    assert data["username"] == "norole_vol"
    assert data["role"] == "VOLUNTEER"
    assert data["roleNames"] == []
    assert data["permissions"] == []

    count_after = db.query(UserRoleAssignment).filter(UserRoleAssignment.userId == vol_user.id).count()
    assert count_after == 0


def test_auth_me_seeded_volunteer(db: Session):
    event = make_org_event(db)
    vol_rec = make_volunteer(db, event, "seeded_vol")
    vol_user = make_user(db, event, Role.VOLUNTEER, "seeded_vol", volunteer=vol_rec)
    assign_default_role(db, vol_user, vol_rec)

    res = client.get("/auth/me", headers=auth_header(vol_user))
    assert res.status_code == 200
    data = res.json()

    assert data["username"] == "seeded_vol"
    assert data["role"] == "VOLUNTEER"
    assert data["isAdmin"] is False
    assert data["status"] == "active"
    assert "Volunteer" in data["roleNames"]
    # Seeded volunteer has expanded permissions
    assert "attendance.mark" in data["permissions"]
    assert "checkpoint.view" in data["permissions"]
    assert "team.view" in data["permissions"]
    assert data["scope"] == {"teams": {"mode": "all", "ids": []}}


def test_auth_me_custom_role_volunteer(db: Session):
    event = make_org_event(db)
    user = make_user(db, event, Role.VOLUNTEER, "custom_vol")

    # Custom role with only 'team.view' and scoped to pods ['pod-abc']
    role = RbacRole(eventId=event.id, name="Pod Spec Vol", isSystem=False)
    db.add(role)
    db.flush()
    db.add(RolePermission(roleId=role.id, permissionKey="team.view"))

    asgn = UserRoleAssignment(
        eventId=event.id,
        userId=user.id,
        roleId=role.id,
        scope={"teams": {"mode": "pods", "ids": ["pod-abc"]}},
        createdBy="test"
    )
    db.add(asgn)
    db.commit()

    res = client.get("/auth/me", headers=auth_header(user))
    assert res.status_code == 200
    data = res.json()

    assert data["username"] == "custom_vol"
    assert data["role"] == "VOLUNTEER"
    assert data["isAdmin"] is False
    assert data["roleNames"] == ["Pod Spec Vol"]
    assert data["permissions"] == ["team.view"]
    assert data["scope"] == {"teams": {"mode": "pods", "ids": ["pod-abc"]}}


def test_auth_me_leader(db: Session):
    event = make_org_event(db)
    leader = make_user(db, event, Role.LEADER, "team_leader")

    res = client.get("/auth/me", headers=auth_header(leader))
    assert res.status_code == 200
    data = res.json()

    assert data["username"] == "team_leader"
    assert data["role"] == "LEADER"
    assert data["isAdmin"] is False
    assert data["roleNames"] == []
    assert data["permissions"] == []
    assert data["scope"] == {"teams": {"mode": "all", "ids": []}}


def test_auth_me_disabled_user(db: Session):
    event = make_org_event(db)
    user = make_user(db, event, Role.VOLUNTEER, "disabled_user", status="disabled")

    res = client.get("/auth/me", headers=auth_header(user))
    assert res.status_code == 401


def test_admin_change_username_and_password(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "admin_change_test")

    # Check username availability
    res = client.get("/auth/check-username?username=admin_new_name", headers=auth_header(admin))
    assert res.status_code == 200
    assert res.json()["available"] is True

    # Change username
    res = client.post(
        "/auth/change-username",
        json={"newUsername": "admin_new_name"},
        headers=auth_header(admin),
    )
    assert res.status_code == 200
    assert res.json()["username"] == "admin_new_name"

    # Change password
    res = client.post(
        "/auth/change-password",
        json={"currentPassword": "Passw0rd!xyz", "newPassword": "newsecretpassword123"},
        headers=auth_header(admin),
    )
    assert res.status_code == 200
