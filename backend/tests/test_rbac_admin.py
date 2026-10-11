from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models import (
    Pod,
    RbacRole,
    Role,
    RolePermission,
    RoleTemplate,
    UserRoleAssignment,
)
from app.permissions import CATALOG, SEED_ROLES
from tests.factories import (
    auth_header,
    make_org_event,
    make_team,
    make_user,
    make_volunteer,
)

client = TestClient(app)


def test_catalog_endpoint(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "catalog_admin")

    res = client.get("/admin/rbac/catalog", headers=auth_header(admin))
    assert res.status_code == 200
    data = res.json()

    assert "modules" in data
    assert "permissions" in data
    assert len(data["permissions"]) == len(CATALOG)
    keys = {p["key"] for p in data["permissions"]}
    assert "team.view" in keys
    assert "role.manage" in keys


def test_roles_crud_happy_path(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "crud_admin")
    headers = auth_header(admin)

    # 1. List roles (should auto-seed system roles)
    res = client.get("/admin/rbac/roles", headers=headers)
    assert res.status_code == 200
    roles = res.json()
    assert len(roles) >= 2
    role_names = [r["name"] for r in roles]
    assert "Volunteer" in role_names
    assert "Judge" in role_names

    # 2. Create role
    create_payload = {
        "name": "Custom Coordinator",
        "description": "Custom role for team management",
        "permissions": ["team.view", "team.edit"],
        "confirmSensitive": False,
    }
    res = client.post("/admin/rbac/roles", json=create_payload, headers=headers)
    assert res.status_code == 201
    created = res.json()
    role_id = created["id"]
    assert created["name"] == "Custom Coordinator"
    assert created["isSystem"] is False
    assert set(created["permissions"]) == {"team.view", "team.edit"}
    assert created["expandedCount"] >= 2

    # 3. Update role
    update_payload = {
        "name": "Lead Coordinator",
        "permissions": ["team.view", "ps.view"],
    }
    res = client.put(f"/admin/rbac/roles/{role_id}", json=update_payload, headers=headers)
    assert res.status_code == 200
    updated = res.json()
    assert updated["name"] == "Lead Coordinator"
    assert set(updated["permissions"]) == {"team.view", "ps.view"}

    # 4. Delete role
    res = client.delete(f"/admin/rbac/roles/{role_id}", headers=headers)
    assert res.status_code == 200

    # 5. Verify deleted
    res = client.get(f"/admin/rbac/roles", headers=headers)
    assert role_id not in [r["id"] for r in res.json()]


def test_reserved_and_duplicate_names(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "names_admin")
    headers = auth_header(admin)

    # Reserved names
    for name in ["Admin", "admin", "Team Leader", "team leader"]:
        res = client.post("/admin/rbac/roles", json={"name": name, "permissions": ["team.view"]}, headers=headers)
        assert res.status_code == 422

    # Short name
    res = client.post("/admin/rbac/roles", json={"name": "A", "permissions": ["team.view"]}, headers=headers)
    assert res.status_code == 422

    # Create valid role
    res = client.post("/admin/rbac/roles", json={"name": "Unique Name", "permissions": ["team.view"]}, headers=headers)
    assert res.status_code == 201

    # Duplicate name in same event
    res = client.post("/admin/rbac/roles", json={"name": "unique name", "permissions": ["team.view"]}, headers=headers)
    assert res.status_code == 409


def test_unknown_danger_and_governance_keys_rejected(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "keys_admin")
    headers = auth_header(admin)

    # Unknown key
    res = client.post("/admin/rbac/roles", json={"name": "Unknown Key Role", "permissions": ["nonexistent.key"]}, headers=headers)
    assert res.status_code == 422

    # Danger tier
    res = client.post("/admin/rbac/roles", json={"name": "Danger Role", "permissions": ["attendance.danger"]}, headers=headers)
    assert res.status_code == 422

    # Governance tier
    res = client.post("/admin/rbac/roles", json={"name": "Gov Role", "permissions": ["role.manage"]}, headers=headers)
    assert res.status_code == 422


def test_sensitive_permissions_confirmation(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "sens_admin")
    headers = auth_header(admin)

    # Sensitive key without confirmation
    res = client.post("/admin/rbac/roles", json={"name": "Sens Role", "permissions": ["team.credentials"], "confirmSensitive": False}, headers=headers)
    assert res.status_code == 422
    assert "Sensitive" in res.json()["detail"]

    # With confirmation
    res = client.post("/admin/rbac/roles", json={"name": "Sens Role", "permissions": ["team.credentials"], "confirmSensitive": True}, headers=headers)
    assert res.status_code == 201
    assert "team.credentials" in res.json()["permissions"]


def test_system_role_cannot_be_renamed_or_deleted(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "sys_admin")
    headers = auth_header(admin)

    res = client.get("/admin/rbac/roles", headers=headers)
    vol_role = next(r for r in res.json() if r["name"] == "Volunteer")
    vol_id = vol_role["id"]

    # Try renaming system role
    res = client.put(f"/admin/rbac/roles/{vol_id}", json={"name": "New Volunteer Name"}, headers=headers)
    assert res.status_code == 409
    assert "System roles cannot be renamed" in res.json()["detail"]

    # Try deleting system role
    res = client.delete(f"/admin/rbac/roles/{vol_id}", headers=headers)
    assert res.status_code == 409
    assert "System roles cannot be deleted" in res.json()["detail"]


def test_role_with_members_cannot_be_deleted(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "member_admin")
    headers = auth_header(admin)

    # Create custom role
    res = client.post("/admin/rbac/roles", json={"name": "Member Protected Role", "permissions": ["team.view"]}, headers=headers)
    role_id = res.json()["id"]

    # Create volunteer and login
    vol = make_volunteer(db, event, "Test Vol")
    make_user(db, event, Role.VOLUNTEER, "vol_user_protected", volunteer=vol)

    # Assign member
    res = client.post(f"/admin/rbac/roles/{role_id}/members", json={"volunteerId": vol.id}, headers=headers)
    assert res.status_code == 201

    # Try deleting role
    res = client.delete(f"/admin/rbac/roles/{role_id}", headers=headers)
    assert res.status_code == 409
    assert "active member" in res.json()["detail"]


def test_templates_detached_copy(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "tpl_admin")
    headers = auth_header(admin)

    # Create role
    res = client.post("/admin/rbac/roles", json={"name": "Template Source", "permissions": ["team.view", "team.export"]}, headers=headers)
    role_id = res.json()["id"]

    # Create template from role
    res = client.post("/admin/rbac/templates/from-role", json={"roleId": role_id, "name": "Org Template"}, headers=headers)
    assert res.status_code == 201
    tpl_id = res.json()["id"]
    assert set(res.json()["permissions"]) == {"team.view", "team.export"}

    # Clone role from template
    res = client.post("/admin/rbac/roles/from-template", json={"templateId": tpl_id, "name": "Cloned Role"}, headers=headers)
    assert res.status_code == 201
    cloned_role_id = res.json()["id"]
    assert set(res.json()["permissions"]) == {"team.view", "team.export"}

    # Edit original role -> template remains unchanged
    client.put(f"/admin/rbac/roles/{role_id}", json={"permissions": ["team.view"]}, headers=headers)
    tpl_res = client.get("/admin/rbac/templates", headers=headers)
    target_tpl = next(t for t in tpl_res.json() if t["id"] == tpl_id)
    assert set(target_tpl["permissions"]) == {"team.view", "team.export"}

    # Delete template -> cloned role remains intact
    res = client.delete(f"/admin/rbac/templates/{tpl_id}", headers=headers)
    assert res.status_code == 200

    roles_res = client.get("/admin/rbac/roles", headers=headers)
    assert cloned_role_id in [r["id"] for r in roles_res.json()]


def test_closure_in_role_response(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "closure_admin")
    headers = auth_header(admin)

    res = client.post("/admin/rbac/roles", json={"name": "Marker Role", "permissions": ["attendance.mark"]}, headers=headers)
    assert res.status_code == 201
    data = res.json()

    # Explicit is attendance.mark
    assert data["permissions"] == ["attendance.mark"]
    # Expanded includes checkpoint.view and team.view (at least 3)
    assert data["expandedCount"] >= 3


def test_e2e_volunteer_scoped_access(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "e2e_admin")
    admin_hdr = auth_header(admin)

    # 1. Create a "Monitor" role with team.view only
    res = client.post("/admin/rbac/roles", json={"name": "Monitor", "permissions": ["team.view"]}, headers=admin_hdr)
    role_id = res.json()["id"]

    # 2. Create volunteer & user
    vol = make_volunteer(db, event, "Monitor Vol")
    user = make_user(db, event, Role.VOLUNTEER, "monitor_vol_user", volunteer=vol)
    vol_hdr = auth_header(user)

    # Assign "Monitor" role with scope all
    res = client.post(f"/admin/rbac/roles/{role_id}/members", json={"volunteerId": vol.id, "scope": {"mode": "all"}}, headers=admin_hdr)
    assert res.status_code == 201

    # Also delete legacy volunteer assignments if any, leaving only Monitor role
    db.query(UserRoleAssignment).filter(UserRoleAssignment.userId == user.id, UserRoleAssignment.roleId != role_id).delete()
    db.commit()

    # 3. GET /volunteer/teams -> 200
    res = client.get("/volunteer/teams", headers=vol_hdr)
    assert res.status_code == 200

    # 4. POST /volunteer/checkin -> 403 (does not hold attendance.mark)
    res = client.post("/volunteer/checkin", json={"teamId": "dummy", "checkpointTypeId": "dummy"}, headers=vol_hdr)
    assert res.status_code == 403

    # 5. Add attendance.mark to Monitor role
    res = client.put(f"/admin/rbac/roles/{role_id}", json={"permissions": ["team.view", "attendance.mark"]}, headers=admin_hdr)
    assert res.status_code == 200

    # 6. Now checkin guard passes (returns 404 or 422 instead of 403)
    res = client.post("/volunteer/checkin", json={"teamId": "dummy", "checkpointTypeId": "dummy"}, headers=vol_hdr)
    assert res.status_code != 403


def test_scoped_pods_filter(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "pods_admin")
    admin_hdr = auth_header(admin)

    # Create two pods
    pod1 = Pod(eventId=event.id, name="Pod 1")
    pod2 = Pod(eventId=event.id, name="Pod 2")
    db.add_all([pod1, pod2])
    db.commit()

    # Create teams in pods
    t1 = make_team(db, event, "Team Alpha", "TA101", pod=pod1)
    t2 = make_team(db, event, "Team Beta", "TB102", pod=pod2)

    # Create role with team.view
    res = client.post("/admin/rbac/roles", json={"name": "Pod1 Watcher", "permissions": ["team.view"]}, headers=admin_hdr)
    role_id = res.json()["id"]

    vol = make_volunteer(db, event, "Pod Vol")
    user = make_user(db, event, Role.VOLUNTEER, "pod_vol_user", volunteer=vol)
    vol_hdr = auth_header(user)

    # Assign scope pods: [pod1.id]
    res = client.post(
        f"/admin/rbac/roles/{role_id}/members",
        json={"volunteerId": vol.id, "scope": {"teams": {"mode": "pods", "ids": [pod1.id]}}},
        headers=admin_hdr,
    )
    assert res.status_code == 201

    # Remove any other assignments
    db.query(UserRoleAssignment).filter(UserRoleAssignment.userId == user.id, UserRoleAssignment.roleId != role_id).delete()
    db.commit()

    # GET /volunteer/teams -> only Team Alpha
    res = client.get("/volunteer/teams", headers=vol_hdr)
    assert res.status_code == 200
    returned_ids = [t["id"] for t in res.json().get("results", [])]
    assert t1.id in returned_ids
    assert t2.id not in returned_ids

    # GET /volunteer/teams/{t2.id} -> 404
    res = client.get(f"/volunteer/teams/{t2.id}", headers=vol_hdr)
    assert res.status_code == 404


def test_pods_mode_rejected_when_pods_disabled(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "dis_admin")
    admin_hdr = auth_header(admin)

    # Turn off pods
    res = client.put("/admin/config/features", json={"pods": False}, headers=admin_hdr)
    assert res.status_code == 200
    assert res.json()["pods"] is False

    res = client.post("/admin/rbac/roles", json={"name": "Scoped Role", "permissions": ["team.view"]}, headers=admin_hdr)
    role_id = res.json()["id"]

    vol = make_volunteer(db, event, "Dis Vol")
    make_user(db, event, Role.VOLUNTEER, "dis_vol_user", volunteer=vol)

    # Assigning with pods mode should be rejected with 422
    res = client.post(
        f"/admin/rbac/roles/{role_id}/members",
        json={"volunteerId": vol.id, "scope": {"mode": "pods", "ids": ["dummy"]}},
        headers=admin_hdr,
    )
    assert res.status_code == 422


def test_turning_pods_off_with_pod_scoped_members_is_409(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "toggle_admin")
    admin_hdr = auth_header(admin)

    pod = Pod(eventId=event.id, name="Active Pod")
    db.add(pod)
    db.commit()

    res = client.post("/admin/rbac/roles", json={"name": "Pod Member Role", "permissions": ["team.view"]}, headers=admin_hdr)
    role_id = res.json()["id"]

    vol = make_volunteer(db, event, "Scoped Vol")
    make_user(db, event, Role.VOLUNTEER, "scoped_vol_user", volunteer=vol)

    # Assign member with pod scope
    res = client.post(
        f"/admin/rbac/roles/{role_id}/members",
        json={"volunteerId": vol.id, "scope": {"mode": "pods", "ids": [pod.id]}},
        headers=admin_hdr,
    )
    assert res.status_code == 201

    # Try turning pods off -> 409
    res = client.put("/admin/config/features", json={"pods": False}, headers=admin_hdr)
    assert res.status_code == 409
    assert "pod-scoped" in str(res.json()["detail"])


def test_last_assignment_removal_is_409(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "last_admin")
    admin_hdr = auth_header(admin)

    res = client.post("/admin/rbac/roles", json={"name": "Role 1", "permissions": ["team.view"]}, headers=admin_hdr)
    r1_id = res.json()["id"]

    vol = make_volunteer(db, event, "One Role Vol")
    user = make_user(db, event, Role.VOLUNTEER, "one_role_user", volunteer=vol)

    res = client.post(f"/admin/rbac/roles/{r1_id}/members", json={"volunteerId": vol.id}, headers=admin_hdr)
    assert res.status_code == 201

    # Delete any other assignments
    db.query(UserRoleAssignment).filter(UserRoleAssignment.userId == user.id, UserRoleAssignment.roleId != r1_id).delete()
    db.commit()

    # Try removing last assignment -> 409
    res = client.delete(f"/admin/rbac/roles/{r1_id}/members/{user.id}", headers=admin_hdr)
    assert res.status_code == 409
    assert "Assign another role first" in res.json()["detail"]


def test_cross_event_isolation(db: Session):
    e1 = make_org_event(db, name="Event 1")
    e2 = make_org_event(db, name="Event 2")

    admin1 = make_user(db, e1, Role.ADMIN, "e1_admin")
    admin2 = make_user(db, e2, Role.ADMIN, "e2_admin")

    h1 = auth_header(admin1)
    h2 = auth_header(admin2)

    # Create role in Event 1
    res = client.post("/admin/rbac/roles", json={"name": "E1 Secret Role", "permissions": ["team.view"]}, headers=h1)
    e1_role_id = res.json()["id"]

    # Admin 2 cannot get or delete E1 role
    res = client.put(f"/admin/rbac/roles/{e1_role_id}", json={"name": "Hacked Name"}, headers=h2)
    assert res.status_code == 404

    res = client.delete(f"/admin/rbac/roles/{e1_role_id}", headers=h2)
    assert res.status_code == 404
