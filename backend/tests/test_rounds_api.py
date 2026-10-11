from datetime import datetime
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models import (
    EvaluationRound,
    EventConfig,
    RbacRole,
    Role,
    RolePermission,
    RubricVersion,
    Submission,
    UserRoleAssignment,
)
from tests.factories import (
    auth_header,
    make_org_event,
    make_team,
    make_user,
)

client = TestClient(app)


def test_rounds_create_validation(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "rounds_admin_create")
    headers = auth_header(admin)

    # 1. Both switches false -> 422
    res = client.post(
        "/admin/rounds",
        json={"name": "Bad Round", "submissionEnabled": False, "evaluationEnabled": False},
        headers=headers,
    )
    assert res.status_code == 422

    # 2. evaluationEnabled when feature flag is off -> 409
    cfg = db.query(EventConfig).filter(EventConfig.eventId == event.id).first()
    cfg.features = {"pods": True, "evaluation": False}
    db.commit()

    res = client.post(
        "/admin/rounds",
        json={"name": "Eval Round", "submissionEnabled": False, "evaluationEnabled": True},
        headers=headers,
    )
    assert res.status_code == 409
    assert "Evaluation feature is disabled" in res.json()["detail"]

    # Re-enable evaluation feature
    cfg.features = {"pods": True, "evaluation": True}
    db.commit()

    # 3. Valid round creation
    res = client.post(
        "/admin/rounds",
        json={
            "name": "Round 1 - Ideation",
            "description": "Initial proposal submission",
            "submissionEnabled": True,
            "evaluationEnabled": True,
            "aggregation": "mean",
            "totalScale": 100,
        },
        headers=headers,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Round 1 - Ideation"
    assert data["number"] == 1
    assert data["submissionEnabled"] is True
    assert data["evaluationEnabled"] is True
    assert data["rubricSummary"]["version"] == 0


def test_rounds_update_and_lock_rules(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "rounds_admin_update")
    headers = auth_header(admin)

    res = client.post(
        "/admin/rounds",
        json={"name": "Update Round", "submissionEnabled": True, "evaluationEnabled": True},
        headers=headers,
    )
    assert res.status_code == 201
    round_id = res.json()["id"]

    # Update name
    res = client.put(f"/admin/rounds/{round_id}", json={"name": "Updated Name"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["name"] == "Updated Name"

    # Simulate locked rubric
    rnd = db.query(EvaluationRound).filter(EvaluationRound.id == round_id).first()
    rubric = RubricVersion(
        eventId=event.id,
        roundId=rnd.id,
        version=1,
        reason="initial",
        createdBy="admin",
        lockedAt=datetime.utcnow(),
    )
    db.add(rubric)
    rnd.currentRubricVersion = 1
    db.commit()

    # Turning evaluationEnabled off when locked -> 409
    res = client.put(f"/admin/rounds/{round_id}", json={"evaluationEnabled": False}, headers=headers)
    assert res.status_code == 409
    assert "Cannot disable evaluation when the rubric is locked" in res.json()["detail"]


def test_rounds_delete_rules(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "rounds_admin_delete")
    headers = auth_header(admin)

    res = client.post(
        "/admin/rounds",
        json={"name": "Delete Round", "submissionEnabled": True, "evaluationEnabled": False},
        headers=headers,
    )
    round_id = res.json()["id"]

    team = make_team(db, event, "Submit Team", "REG-SUB-1")
    sub = Submission(teamId=team.id, roundId=round_id)
    db.add(sub)
    db.commit()

    # Delete with submissions without confirmDeleteSubmissions -> 409
    res = client.delete(f"/admin/rounds/{round_id}", headers=headers)
    assert res.status_code == 409
    assert "submissions" in res.json()["detail"].lower()

    # Delete with confirmDeleteSubmissions=true -> 200
    res = client.delete(f"/admin/rounds/{round_id}?confirmDeleteSubmissions=true", headers=headers)
    assert res.status_code == 200
    assert res.json()["success"] is True


def test_rounds_rubric_save_warnings_vs_errors(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "rounds_admin_rubric")
    headers = auth_header(admin)

    res = client.post(
        "/admin/rounds",
        json={"name": "Rubric Round", "submissionEnabled": True, "evaluationEnabled": True},
        headers=headers,
    )
    round_id = res.json()["id"]

    # Save draft rubric with weights totalling 90 -> warning, not error
    save_payload = {
        "rubricFields": [
            {"type": "numeric", "label": "Criterion 1", "maxMarks": 10, "weight": 90},
        ]
    }
    res = client.put(f"/admin/rounds/{round_id}/rubric", json=save_payload, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data["rubricFields"]) == 1
    assert len(data["warnings"]) == 1
    assert "weights must total exactly 100" in data["warnings"][0]
    assert data["errors"] == []


def test_rounds_publish_validation(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "rounds_admin_publish")
    headers = auth_header(admin)

    res = client.post(
        "/admin/rounds",
        json={"name": "Publish Round", "submissionEnabled": True, "evaluationEnabled": True},
        headers=headers,
    )
    round_id = res.json()["id"]

    # Save with 90 weights
    client.put(
        f"/admin/rounds/{round_id}/rubric",
        json={"rubricFields": [{"type": "numeric", "label": "Criterion 1", "maxMarks": 10, "weight": 90}]},
        headers=headers,
    )

    # Publish rejects 90 weights -> 422
    res = client.post(f"/admin/rounds/{round_id}/publish", headers=headers)
    assert res.status_code == 422

    # Save with 100 weights
    client.put(
        f"/admin/rounds/{round_id}/rubric",
        json={"rubricFields": [{"type": "numeric", "label": "Criterion 1", "maxMarks": 10, "weight": 100}]},
        headers=headers,
    )

    # Publish passes at 100
    res = client.post(f"/admin/rounds/{round_id}/publish", headers=headers)
    assert res.status_code == 200
    assert res.json()["published"] is True

    # Unpublish passes
    res = client.post(f"/admin/rounds/{round_id}/unpublish", headers=headers)
    assert res.status_code == 200
    assert res.json()["published"] is False


def test_rounds_permission_guards(db: Session):
    event = make_org_event(db)
    headers_admin = auth_header(make_user(db, event, Role.ADMIN, "r_admin"))

    # Create custom role with only round.view
    role_view = RbacRole(eventId=event.id, name="Round Viewer", isSystem=False)
    db.add(role_view)
    db.flush()
    db.add(RolePermission(roleId=role_view.id, permissionKey="round.view"))
    u_viewer = make_user(db, event, Role.VOLUNTEER, "viewer_user")
    db.add(UserRoleAssignment(eventId=event.id, userId=u_viewer.id, roleId=role_view.id))
    db.commit()
    headers_viewer = auth_header(u_viewer)

    # Viewer can GET /admin/rounds
    res = client.get("/admin/rounds", headers=headers_viewer)
    assert res.status_code == 200

    # Viewer cannot POST /admin/rounds -> 403
    res = client.post("/admin/rounds", json={"name": "No Permission"}, headers=headers_viewer)
    assert res.status_code == 403

    # Random volunteer without round.view gets 403 on GET
    u_other = make_user(db, event, Role.VOLUNTEER, "other_vol")
    res = client.get("/admin/rounds", headers=auth_header(u_other))
    assert res.status_code == 403


def test_rounds_legacy_and_leader_parity(db: Session):
    event = make_org_event(db)
    admin = make_user(db, event, Role.ADMIN, "r_parity_admin")
    headers_admin = auth_header(admin)

    # Seed round 1 (submission + evaluation)
    r1 = EvaluationRound(
        eventId=event.id,
        name="Round 1 Active",
        roundNumber=1,
        description="Active round",
        fields=[{"name": "repo_url", "type": "link"}],
        isSubmissionOpen=True,
        submissionEnabled=True,
        evaluationEnabled=True,
    )
    # Seed round 2 (judging only - submissionEnabled False)
    r2 = EvaluationRound(
        eventId=event.id,
        name="Round 2 Judging Only",
        roundNumber=2,
        description="Interview round",
        fields=[],
        isSubmissionOpen=False,
        submissionEnabled=False,
        evaluationEnabled=True,
    )
    db.add_all([r1, r2])
    db.commit()

    # 1. Existing /admin/evaluation-rounds returns both rounds unchanged
    res_admin = client.get("/admin/evaluation-rounds", headers=headers_admin)
    assert res_admin.status_code == 200
    admin_rounds = res_admin.json()
    assert len(admin_rounds) == 2
    assert admin_rounds[0]["name"] == "Round 1 Active"
    assert admin_rounds[1]["name"] == "Round 2 Judging Only"

    # 2. Leader gets rounds: only Round 1 appears (Round 2 has submissionEnabled=False)
    team = make_team(db, event, "Leader Parity Team", "REG-LEAD-1")
    u_leader = make_user(db, event, Role.LEADER, "team_leader")
    u_leader.teamId = team.id
    db.commit()
    headers_leader = auth_header(u_leader)

    res_leader = client.get("/leader/evaluation-rounds", headers=headers_leader)
    assert res_leader.status_code == 200
    leader_rounds = res_leader.json()
    assert len(leader_rounds) == 1
    assert leader_rounds[0]["id"] == r1.id
    assert leader_rounds[0]["name"] == "Round 1 Active"

    # 3. Leader cannot submit to judging-only round -> 403
    res_sub_bad = client.post(
        f"/leader/evaluation-rounds/{r2.id}/submit",
        json={"driveLink": "https://drive.google.com/test"},
        headers=headers_leader,
    )
    assert res_sub_bad.status_code == 403
    assert "Submissions are closed" in res_sub_bad.json()["detail"]

    # 4. Leader can submit to active submission round -> 200
    res_sub_ok = client.post(
        f"/leader/evaluation-rounds/{r1.id}/submit",
        json={"driveLink": "https://drive.google.com/test"},
        headers=headers_leader,
    )
    assert res_sub_ok.status_code == 200
    assert res_sub_ok.json()["success"] is True
