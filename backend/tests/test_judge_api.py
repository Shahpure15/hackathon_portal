from datetime import datetime
from decimal import Decimal
import pytest
from starlette.requests import Request

from app.models import (
    Role,
    EvaluationRound,
    RubricVersion,
    RubricField,
    JudgeAssignment,
    Evaluation,
    EvaluationVersion,
    EvaluationScore,
    EvaluationText,
    RbacRole,
    UserRoleAssignment,
)
from app.limiter import user_key_func
from tests.factories import make_org_event, make_user, make_volunteer, make_team, auth_header


def assert_no_pod_keys(obj):
    """Recursively asserts that no dictionary key contains 'pod', 'podId', or 'podName' (case-insensitive)."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            k_lower = k.lower()
            assert "pod" not in k_lower, f"Forbidden key '{k}' found in response!"
            assert_no_pod_keys(v)
    elif isinstance(obj, list):
        for item in obj:
            assert_no_pod_keys(item)


@pytest.fixture
def judge_fixture(db):
    event = make_org_event(db, name="Judge API Event")

    # Seed system roles
    judge_role = RbacRole(
        eventId=event.id,
        name="Judge",
        isSystem=True,
        systemKey="judge",
    )
    from app.models import RolePermission
    db.add(judge_role)
    db.flush()
    db.add(RolePermission(roleId=judge_role.id, permissionKey="evaluation.score"))

    # Judge A
    jA = make_volunteer(db, event, name="Judge Alice", type="JUDGE")
    userA = make_user(db, event, Role.VOLUNTEER, username="judge_a", volunteer=jA)
    db.add(UserRoleAssignment(eventId=event.id, userId=userA.id, roleId=judge_role.id))

    # Judge B
    jB = make_volunteer(db, event, name="Judge Bob", type="JUDGE")
    userB = make_user(db, event, Role.VOLUNTEER, username="judge_b", volunteer=jB)
    db.add(UserRoleAssignment(eventId=event.id, userId=userB.id, roleId=judge_role.id))

    # Plain volunteer without evaluation.score
    vol_plain = make_volunteer(db, event, name="Vol Plain", type="VOLUNTEER")
    user_plain = make_user(db, event, Role.VOLUNTEER, username="vol_plain", volunteer=vol_plain)

    t1 = make_team(db, event, name="Team 1", registration_id="REG01")
    t2 = make_team(db, event, name="Team 2", registration_id="REG02")

    # Round with live evaluation
    round_obj = EvaluationRound(
        eventId=event.id,
        name="Judge Round 1",
        roundNumber=1,
        status="live",
        submissionEnabled=True,
        evaluationEnabled=True,
        currentRubricVersion=1,
    )
    db.add(round_obj)
    db.flush()

    # Rubric version 1 published
    r_ver = RubricVersion(
        eventId=event.id,
        roundId=round_obj.id,
        version=1,
        reason="initial",
        createdBy="admin",
        publishedAt=datetime.utcnow(),
    )
    db.add(r_ver)
    db.flush()

    f1 = RubricField(
        eventId=event.id,
        rubricVersionId=r_ver.id,
        fieldKey="num_impact",
        type="numeric",
        label="Impact",
        maxMarks=Decimal("50.00"),
        weight=Decimal("100.00"),
        sortOrder=1,
        isRequired=True,
    )
    f2 = RubricField(
        eventId=event.id,
        rubricVersionId=r_ver.id,
        fieldKey="txt_private",
        type="text",
        label="Internal Remarks",
        visibility="staff",
        sortOrder=2,
        isRequired=False,
    )
    db.add_all([f1, f2])

    # Assign t1 to jA only
    assignA = JudgeAssignment(
        eventId=event.id,
        roundId=round_obj.id,
        teamId=t1.id,
        judgeVolunteerId=jA.id,
        source="wizard",
        status="active",
    )
    # Assign t2 to jB only
    assignB = JudgeAssignment(
        eventId=event.id,
        roundId=round_obj.id,
        teamId=t2.id,
        judgeVolunteerId=jB.id,
        source="wizard",
        status="active",
    )
    db.add_all([assignA, assignB])
    db.commit()

    return {
        "event": event,
        "round": round_obj,
        "rubric_ver": r_ver,
        "jA": jA,
        "userA": userA,
        "jB": jB,
        "userB": userB,
        "user_plain": user_plain,
        "t1": t1,
        "t2": t2,
        "f1": f1,
        "f2": f2,
        "assignA": assignA,
    }


def test_judge_authorization_and_cross_judge_isolation(client, judge_fixture):
    fx = judge_fixture
    rid = fx["round"].id
    t1_id = fx["t1"].id
    t2_id = fx["t2"].id

    hA = auth_header(fx["userA"])
    hB = auth_header(fx["userB"])
    hPlain = auth_header(fx["user_plain"])

    # User without evaluation.score gets 403
    res_plain = client.get("/judge/rounds", headers=hPlain)
    assert res_plain.status_code == 403

    # Judge A can view their rounds and assigned teams
    resA_rounds = client.get("/judge/rounds", headers=hA)
    assert resA_rounds.status_code == 200
    assert_no_pod_keys(resA_rounds.json())
    assert len(resA_rounds.json()) == 1

    resA_teams = client.get(f"/judge/rounds/{rid}/teams", headers=hA)
    assert resA_teams.status_code == 200
    assert_no_pod_keys(resA_teams.json())
    teamsA = resA_teams.json()
    assert len(teamsA) == 1
    assert teamsA[0]["teamId"] == t1_id

    # Judge A cannot read Judge B's team (t2) -> 404
    resA_t2 = client.get(f"/judge/rounds/{rid}/teams/{t2_id}", headers=hA)
    assert resA_t2.status_code == 404

    # Judge A cannot draft or submit for Judge B's team -> 404
    resA_t2_draft = client.put(f"/judge/rounds/{rid}/teams/{t2_id}/draft", json={}, headers=hA)
    assert resA_t2_draft.status_code == 404


def test_judge_no_pod_keys_in_detail_and_rubric_locking(client, judge_fixture, db):
    fx = judge_fixture
    rid = fx["round"].id
    t1_id = fx["t1"].id
    f1_id = fx["f1"].id
    f2_id = fx["f2"].id
    hA = auth_header(fx["userA"])

    r_ver = fx["rubric_ver"]
    assert r_ver.lockedAt is None

    # Detail response scrubbed of pod/admin information
    res_detail = client.get(f"/judge/rounds/{rid}/teams/{t1_id}", headers=hA)
    assert res_detail.status_code == 200
    data = res_detail.json()
    assert_no_pod_keys(data)
    assert data["mine"]["status"] == "not_started"

    # Autosave validation errors
    # Score out of range (max 50)
    res_err = client.put(
        f"/judge/rounds/{rid}/teams/{t1_id}/draft",
        json={"scores": {f1_id: "99"}},
        headers=hA,
    )
    assert res_err.status_code == 422

    # Wrong field id
    res_bad_id = client.put(
        f"/judge/rounds/{rid}/teams/{t1_id}/draft",
        json={"scores": {"bad-field-id": "10"}},
        headers=hA,
    )
    assert res_bad_id.status_code == 422

    # Save valid draft -> locks rubric
    res_draft = client.put(
        f"/judge/rounds/{rid}/teams/{t1_id}/draft",
        json={"scores": {f1_id: "45"}, "texts": {f2_id: "Secret feedback"}},
        headers=hA,
    )
    assert res_draft.status_code == 200
    token = res_draft.json()["token"]

    db.refresh(r_ver)
    assert r_ver.lockedAt is not None  # Rubric locked

    # Token conflict check
    res_conflict = client.put(
        f"/judge/rounds/{rid}/teams/{t1_id}/draft",
        json={"scores": {f1_id: "40"}, "token": "stale-token-123"},
        headers=hA,
    )
    assert res_conflict.status_code == 409

    # Submit
    res_submit = client.post(
        f"/judge/rounds/{rid}/teams/{t1_id}/submit",
        json={"token": token},
        headers=hA,
    )
    assert res_submit.status_code == 200
    assert res_submit.json()["status"] == "submitted"

    # Submit then edit is 409
    res_edit_after_submit = client.put(
        f"/judge/rounds/{rid}/teams/{t1_id}/draft",
        json={"scores": {f1_id: "48"}},
        headers=hA,
    )
    assert res_edit_after_submit.status_code == 409
    assert "Already submitted" in res_edit_after_submit.json()["detail"]


def test_revoked_assignment_and_rate_limit_user_key(client, judge_fixture, db):
    fx = judge_fixture
    rid = fx["round"].id
    t1_id = fx["t1"].id
    f1_id = fx["f1"].id

    hA = auth_header(fx["userA"])
    hB = auth_header(fx["userB"])

    # Revoke assignment A
    fx["assignA"].status = "revoked"
    db.commit()

    res_revoked = client.put(
        f"/judge/rounds/{rid}/teams/{t1_id}/draft",
        json={"scores": {f1_id: "30"}},
        headers=hA,
    )
    assert res_revoked.status_code in (403, 404)

    # Test user_key_func derives key per user behind same IP
    req_a = Request(scope={
        "type": "http",
        "method": "PUT",
        "path": "/",
        "headers": [(b"authorization", hA["Authorization"].encode()), (b"x-forwarded-for", b"203.0.113.1")],
    })
    req_b = Request(scope={
        "type": "http",
        "method": "PUT",
        "path": "/",
        "headers": [(b"authorization", hB["Authorization"].encode()), (b"x-forwarded-for", b"203.0.113.1")],
    })
    key_a = user_key_func(req_a)
    key_b = user_key_func(req_b)
    assert key_a.startswith("user:")
    assert key_b.startswith("user:")
    assert key_a != key_b  # Different users get distinct buckets behind the same IP
