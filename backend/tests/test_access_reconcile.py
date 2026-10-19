from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models import Role, RbacRole, UserRoleAssignment, Volunteer, User
from app.rbac import (
    resolve_access,
    compute_landing,
    ensure_system_roles,
    assign_default_role,
)
from scripts.reconcile_roles import reconcile_roles
from tests.factories import make_org_event, make_user, make_volunteer, auth_header

client = TestClient(app)


def test_resolve_access_empty_and_idempotent(db: Session):
    event = make_org_event(db)
    vol_rec = make_volunteer(db, event, "empty_vol", type="VOLUNTEER")
    vol_user = make_user(db, event, Role.VOLUNTEER, "empty_vol_user", volunteer=vol_rec)

    count_before = (
        db.query(UserRoleAssignment)
        .filter(UserRoleAssignment.userId == vol_user.id)
        .count()
    )
    assert count_before == 0

    acc1 = resolve_access(db, vol_user)
    assert acc1.permissions == set()

    acc2 = resolve_access(db, vol_user)
    assert acc2.permissions == set()

    count_after = (
        db.query(UserRoleAssignment)
        .filter(UserRoleAssignment.userId == vol_user.id)
        .count()
    )
    assert count_after == 0


def test_get_auth_me_called_twice_creates_no_rows(db: Session):
    event = make_org_event(db)
    vol_rec = make_volunteer(db, event, "test_two_me", type="VOLUNTEER")
    vol_user = make_user(db, event, Role.VOLUNTEER, "test_two_me_user", volunteer=vol_rec)

    res1 = client.get("/auth/me", headers=auth_header(vol_user))
    assert res1.status_code == 200
    assert res1.json()["permissions"] == []
    assert res1.json()["landing"] == "none"

    res2 = client.get("/auth/me", headers=auth_header(vol_user))
    assert res2.status_code == 200
    assert res2.json()["permissions"] == []
    assert res2.json()["landing"] == "none"

    count = (
        db.query(UserRoleAssignment)
        .filter(UserRoleAssignment.userId == vol_user.id)
        .count()
    )
    assert count == 0


def test_create_volunteer_judge_staff_faculty_flow(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "admin_user_flow")

    # 1. JUDGE
    res_judge = client.post(
        "/admin/volunteers",
        json={"name": "Judge Flow", "type": "JUDGE", "contact": "1234567890", "generateLogin": True},
        headers=auth_header(admin),
    )
    assert res_judge.status_code == 200
    judge_data = res_judge.json()
    judge_vol_id = judge_data["id"]

    judge_user = db.query(User).filter(User.volunteerId == judge_vol_id).first()
    assert judge_user is not None

    me_judge = client.get("/auth/me", headers=auth_header(judge_user))
    assert me_judge.status_code == 200
    assert me_judge.json()["permissions"] == ["evaluation.score"]
    assert me_judge.json()["landing"] == "judge"

    # 2. VOLUNTEER
    res_vol = client.post(
        "/admin/volunteers",
        json={"name": "Vol Flow", "type": "VOLUNTEER", "contact": "1234567891", "generateLogin": True},
        headers=auth_header(admin),
    )
    assert res_vol.status_code == 200
    vol_data = res_vol.json()
    vol_user = db.query(User).filter(User.volunteerId == vol_data["id"]).first()
    assert vol_user is not None

    me_vol = client.get("/auth/me", headers=auth_header(vol_user))
    assert me_vol.status_code == 200
    assert "team.view" in me_vol.json()["permissions"]
    assert me_vol.json()["landing"] == "staff"

    # 3. FACULTY
    res_fac = client.post(
        "/admin/volunteers",
        json={"name": "Faculty Flow", "type": "FACULTY", "contact": "1234567892", "generateLogin": True},
        headers=auth_header(admin),
    )
    assert res_fac.status_code == 200
    fac_data = res_fac.json()
    fac_user = db.query(User).filter(User.volunteerId == fac_data["id"]).first()
    assert fac_user is not None

    me_fac = client.get("/auth/me", headers=auth_header(fac_user))
    assert me_fac.status_code == 200
    assert "team.view" in me_fac.json()["permissions"]
    assert me_fac.json()["landing"] == "staff"


def test_create_volunteer_login_for_judge(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "admin_user_login")
    vol = make_volunteer(db, event, name="Judge Later", type="JUDGE")

    res = client.post(
        f"/admin/volunteers/{vol.id}/login",
        headers=auth_header(admin),
    )
    assert res.status_code == 200

    vol_user = db.query(User).filter(User.volunteerId == vol.id).first()
    assert vol_user is not None

    me = client.get("/auth/me", headers=auth_header(vol_user))
    assert me.status_code == 200
    assert me.json()["permissions"] == ["evaluation.score"]
    assert me.json()["landing"] == "judge"


def test_judge_plus_volunteer_roles_mixed_and_rounds(db: Session):
    event = make_org_event(db)
    ensure_system_roles(db, event.id)
    vol_rec = make_volunteer(db, event, "Mixed Judge", type="JUDGE")
    vol_user = make_user(db, event, Role.VOLUNTEER, "mixed_judge_user", volunteer=vol_rec)

    judge_role = db.query(RbacRole).filter(RbacRole.eventId == event.id, RbacRole.systemKey == "judge").first()
    volunteer_role = db.query(RbacRole).filter(RbacRole.eventId == event.id, RbacRole.systemKey == "volunteer").first()

    assign_judge = UserRoleAssignment(
        eventId=event.id,
        userId=vol_user.id,
        roleId=judge_role.id,
        scope={"teams": {"mode": "all", "ids": []}},
        createdBy="TEST",
    )
    assign_vol = UserRoleAssignment(
        eventId=event.id,
        userId=vol_user.id,
        roleId=volunteer_role.id,
        scope={"teams": {"mode": "all", "ids": []}},
        createdBy="TEST",
    )
    db.add_all([assign_judge, assign_vol])
    db.commit()

    me = client.get("/auth/me", headers=auth_header(vol_user))
    assert me.status_code == 200
    data = me.json()
    assert "evaluation.score" in data["permissions"]
    assert "team.view" in data["permissions"]
    assert data["landing"] == "staff"

    # Test /judge/rounds still returns 200
    res_rounds = client.get("/judge/rounds", headers=auth_header(vol_user))
    assert res_rounds.status_code == 200


def test_remove_only_role_returns_200_and_landing_none(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "admin_user_removal")
    vol_rec = make_volunteer(db, event, "Solo Role Vol", type="JUDGE")
    vol_user = make_user(db, event, Role.VOLUNTEER, "solo_role_user", volunteer=vol_rec)
    assign_default_role(db, vol_user, vol_rec)

    assignment = (
        db.query(UserRoleAssignment)
        .filter(UserRoleAssignment.userId == vol_user.id)
        .first()
    )
    assert assignment is not None

    del_res = client.delete(
        f"/admin/rbac/roles/{assignment.roleId}/members/{vol_user.id}",
        headers=auth_header(admin),
    )
    assert del_res.status_code == 200
    assert del_res.json()["remainingRoles"] == 0

    me = client.get("/auth/me", headers=auth_header(vol_user))
    assert me.status_code == 200
    assert me.json()["permissions"] == []
    assert me.json()["landing"] == "none"


def test_compute_landing_matrix():
    # Admin
    assert compute_landing("ADMIN", set(), True) == "admin"
    assert compute_landing("VOLUNTEER", set(), True) == "admin"
    assert compute_landing("ADMIN", {"evaluation.score"}, False) == "admin"

    # Leader
    assert compute_landing("LEADER", set(), False) == "leader"
    assert compute_landing("LEADER", {"evaluation.score"}, False) == "leader"

    # Pure Judge
    assert compute_landing("VOLUNTEER", {"evaluation.score"}, False) == "judge"

    # Staff (team.view, attendance.mark)
    assert compute_landing("VOLUNTEER", {"team.view", "attendance.mark"}, False) == "staff"

    # Mixed (evaluation.score + team.view)
    assert compute_landing("VOLUNTEER", {"evaluation.score", "team.view"}, False) == "staff"

    # people.view only
    assert compute_landing("VOLUNTEER", {"people.view"}, False) == "staff"
    assert compute_landing("VOLUNTEER", {"people.checkin"}, False) == "staff"

    # Empty VOLUNTEER
    assert compute_landing("VOLUNTEER", set(), False) == "none"

    # Unknown
    assert compute_landing("", set(), False) == "none"
    assert compute_landing(None, set(), False) == "none"


def test_reconcile_roles_script(db: Session):
    event = make_org_event(db)
    ensure_system_roles(db, event.id)
    vol_sys_role = db.query(RbacRole).filter(RbacRole.eventId == event.id, RbacRole.systemKey == "volunteer").first()
    judge_sys_role = db.query(RbacRole).filter(RbacRole.eventId == event.id, RbacRole.systemKey == "judge").first()

    # User 1: type JUDGE, but legacy fallback assigned volunteer role with createdBy='SYSTEM'
    v1 = make_volunteer(db, event, "Judge User 1", type="JUDGE")
    u1 = make_user(db, event, Role.VOLUNTEER, "u1_judge", volunteer=v1)
    a1 = UserRoleAssignment(
        eventId=event.id,
        userId=u1.id,
        roleId=vol_sys_role.id,
        scope={"teams": {"mode": "all", "ids": []}},
        createdBy="SYSTEM",
    )
    db.add(a1)

    # User 2: type VOLUNTEER, 0 assignments
    v2 = make_volunteer(db, event, "Vol User 2", type="VOLUNTEER")
    u2 = make_user(db, event, Role.VOLUNTEER, "u2_vol", volunteer=v2)

    # User 3: 2 assignments (should be skipped)
    v3 = make_volunteer(db, event, "Multi User 3", type="VOLUNTEER")
    u3 = make_user(db, event, Role.VOLUNTEER, "u3_multi", volunteer=v3)
    a3_1 = UserRoleAssignment(
        eventId=event.id,
        userId=u3.id,
        roleId=vol_sys_role.id,
        scope={"teams": {"mode": "all", "ids": []}},
        createdBy="SYSTEM",
    )
    a3_2 = UserRoleAssignment(
        eventId=event.id,
        userId=u3.id,
        roleId=judge_sys_role.id,
        scope={"teams": {"mode": "all", "ids": []}},
        createdBy="ADMIN",
    )
    db.add_all([a3_1, a3_2])
    db.commit()

    # Dry-run
    res_dry = reconcile_roles(db, apply=False, event_id=event.id)
    assert res_dry["totals"]["changed"] == 2
    assert res_dry["totals"]["skipped"] >= 1

    # Verify dry-run did not change db
    u1_assignments = db.query(UserRoleAssignment).filter(UserRoleAssignment.userId == u1.id).all()
    assert len(u1_assignments) == 1
    assert u1_assignments[0].roleId == vol_sys_role.id

    u2_assignments = db.query(UserRoleAssignment).filter(UserRoleAssignment.userId == u2.id).all()
    assert len(u2_assignments) == 0

    # Apply
    res_apply = reconcile_roles(db, apply=True, event_id=event.id)
    assert res_apply["totals"]["changed"] == 2

    # Verify u1 now has judge role with createdBy='RECONCILE'
    u1_assignments_after = db.query(UserRoleAssignment).filter(UserRoleAssignment.userId == u1.id).all()
    assert len(u1_assignments_after) == 1
    assert u1_assignments_after[0].roleId == judge_sys_role.id
    assert u1_assignments_after[0].createdBy == "RECONCILE"

    # Verify u2 now has volunteer role with createdBy='RECONCILE'
    u2_assignments_after = db.query(UserRoleAssignment).filter(UserRoleAssignment.userId == u2.id).all()
    assert len(u2_assignments_after) == 1
    assert u2_assignments_after[0].roleId == vol_sys_role.id
    assert u2_assignments_after[0].createdBy == "RECONCILE"

    # Verify u3 still has 2 assignments
    u3_assignments_after = db.query(UserRoleAssignment).filter(UserRoleAssignment.userId == u3.id).all()
    assert len(u3_assignments_after) == 2
