from datetime import datetime
from decimal import Decimal
import pytest

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
)
from app.services.assignment import make_preview_token
from app.config import settings
from tests.factories import make_org_event, make_user, make_volunteer, make_team, auth_header


@pytest.fixture
def admin_eval_fixture(db):
    event = make_org_event(db, name="Admin Eval Event")
    admin_user = make_user(db, event, Role.ADMIN, username="admin1")
    volunteer_user = make_user(db, event, Role.VOLUNTEER, username="vol1")

    t1 = make_team(db, event, name="Team 1", registration_id="REG1")
    t1.collegeName = "MIT"
    t2 = make_team(db, event, name="Team 2", registration_id="REG2")
    t2.collegeName = "Stanford"

    j1 = make_volunteer(db, event, name="Judge 1", type="JUDGE")
    j1.remarks = "mit"
    j2 = make_volunteer(db, event, name="Judge 2", type="JUDGE")
    j2.remarks = "Harvard"

    # User login for j2
    j2_user = make_user(db, event, Role.VOLUNTEER, username="j2_user", volunteer=j2)

    round_obj = EvaluationRound(
        eventId=event.id,
        name="Round Alpha",
        roundNumber=1,
        status="live",
        submissionEnabled=True,
        evaluationEnabled=True,
        currentRubricVersion=1,
    )
    db.add(round_obj)
    db.flush()

    r_ver = RubricVersion(
        eventId=event.id,
        roundId=round_obj.id,
        version=1,
        reason="initial",
        createdBy="admin1",
        publishedAt=datetime.utcnow(),
    )
    db.add(r_ver)
    db.flush()

    f1 = RubricField(
        eventId=event.id,
        rubricVersionId=r_ver.id,
        fieldKey="fk_num",
        type="numeric",
        label="Technical",
        maxMarks=Decimal("100.00"),
        weight=Decimal("100.00"),
        sortOrder=1,
        isRequired=True,
    )
    f2 = RubricField(
        eventId=event.id,
        rubricVersionId=r_ver.id,
        fieldKey="fk_txt",
        type="text",
        label="Staff Notes",
        visibility="staff",
        sortOrder=2,
        isRequired=False,
    )
    db.add_all([f1, f2])
    db.commit()

    return {
        "event": event,
        "admin": admin_user,
        "volunteer": volunteer_user,
        "round": round_obj,
        "t1": t1,
        "t2": t2,
        "j1": j1,
        "j2": j2,
        "f1": f1,
        "f2": f2,
    }


def test_permission_gates_evaluation_admin(client, admin_eval_fixture):
    fx = admin_eval_fixture
    rid = fx["round"].id
    vol_h = auth_header(fx["volunteer"])

    # Seeded volunteer lacks evaluation.assign, evaluation.view_all, evaluation.unlock, etc. -> 403
    res1 = client.get(f"/admin/rounds/{rid}/assignable-teams", headers=vol_h)
    assert res1.status_code == 403

    res2 = client.get(f"/admin/rounds/{rid}/progress", headers=vol_h)
    assert res2.status_code == 403

    res3 = client.post(f"/admin/rounds/{rid}/assignments/preview", json={"teamIds": [], "judgeVolunteerIds": []}, headers=vol_h)
    assert res3.status_code == 403


def test_assignable_teams(client, admin_eval_fixture):
    fx = admin_eval_fixture
    rid = fx["round"].id
    adm_h = auth_header(fx["admin"])

    res = client.get(f"/admin/rounds/{rid}/assignable-teams", headers=adm_h)
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 2
    team_names = {t["name"] for t in data}
    assert "Team 1" in team_names
    assert "Team 2" in team_names


def test_assignment_preview_and_commit_lifecycle(client, admin_eval_fixture):
    fx = admin_eval_fixture
    rid = fx["round"].id
    adm_h = auth_header(fx["admin"])

    # Preview with j1 (no login) and j2 (has login)
    preview_payload = {
        "teamIds": [fx["t1"].id, fx["t2"].id],
        "judgeVolunteerIds": [fx["j1"].id, fx["j2"].id],
        "mode": "split",
        "judgesPerTeam": 1,
    }
    res_prev = client.post(f"/admin/rounds/{rid}/assignments/preview", json=preview_payload, headers=adm_h)
    assert res_prev.status_code == 200
    prev_data = res_prev.json()
    token = prev_data["token"]
    pairs = prev_data["pairs"]
    assert len(pairs) == 2
    # Warning about j1 having no login
    warnings = prev_data["warnings"]
    assert any(w["code"] == "no_login" and w["judgeId"] == fx["j1"].id for w in warnings)
    # Conflict between t1 (MIT) and j1 (mit)
    conflicts = prev_data["conflicts"]
    assert len(conflicts) == 1
    assert conflicts[0]["teamId"] == fx["t1"].id and conflicts[0]["judgeId"] == fx["j1"].id

    # Commit with tampered token -> 400
    tampered_payload = {
        "pairs": pairs,
        "token": "invalid.token",
        "replaceWizard": False,
        "overrideConflicts": True,
    }
    res_bad = client.post(f"/admin/rounds/{rid}/assignments/commit", json=tampered_payload, headers=adm_h)
    assert res_bad.status_code == 400

    # Commit without overrideConflicts -> 409
    commit_payload_no_override = {
        "pairs": pairs,
        "token": token,
        "replaceWizard": False,
        "overrideConflicts": False,
    }
    res_conflict = client.post(f"/admin/rounds/{rid}/assignments/commit", json=commit_payload_no_override, headers=adm_h)
    assert res_conflict.status_code == 409

    # Commit with overrideConflicts -> 200
    commit_payload = {
        "pairs": pairs,
        "token": token,
        "replaceWizard": False,
        "overrideConflicts": True,
    }
    res_commit = client.post(f"/admin/rounds/{rid}/assignments/commit", json=commit_payload, headers=adm_h)
    assert res_commit.status_code == 200
    commit_data = res_commit.json()
    assert commit_data["created"] == 2

    # Committing again is idempotent (skips active)
    res_commit_again = client.post(f"/admin/rounds/{rid}/assignments/commit", json=commit_payload, headers=adm_h)
    assert res_commit_again.status_code == 200
    assert res_commit_again.json()["skipped"] == 2


def test_manual_assignment_precedence_and_revoke(client, admin_eval_fixture, db):
    fx = admin_eval_fixture
    rid = fx["round"].id
    adm_h = auth_header(fx["admin"])

    # Wizard assign t1 to j2
    token, _ = make_preview_token(settings.JWT_SECRET_KEY, rid, fx["event"].id, [(fx["t1"].id, fx["j2"].id)])
    client.post(
        f"/admin/rounds/{rid}/assignments/commit",
        json={"pairs": [[fx["t1"].id, fx["j2"].id]], "token": token, "replaceWizard": False, "overrideConflicts": True},
        headers=adm_h,
    )

    # Manual assign upgrades wizard row to manual
    res_man = client.post(
        f"/admin/rounds/{rid}/assignments",
        json={"teamIds": [fx["t1"].id], "judgeVolunteerIds": [fx["j2"].id]},
        headers=adm_h,
    )
    assert res_man.status_code == 200
    assert res_man.json()["upgraded"] == 1

    # Revoke assignment
    assign_row = db.query(JudgeAssignment).filter(JudgeAssignment.teamId == fx["t1"].id, JudgeAssignment.judgeVolunteerId == fx["j2"].id).first()
    res_rev = client.delete(f"/admin/rounds/{rid}/assignments/{assign_row.id}", headers=adm_h)
    assert res_rev.status_code == 200
    assert res_rev.json()["hasEvaluation"] is False

    db.refresh(assign_row)
    assert assign_row.status == "revoked"

    # Direct manual assign revives revoked row as manual
    res_revive = client.post(
        f"/admin/rounds/{rid}/assignments",
        json={"teamIds": [fx["t1"].id], "judgeVolunteerIds": [fx["j2"].id]},
        headers=adm_h,
    )
    assert res_revive.status_code == 200
    assert res_revive.json()["revived"] == 1
    db.refresh(assign_row)
    assert assign_row.status == "active"
    assert assign_row.source == "manual"


def test_round_progress_and_team_trail_and_hide_text(client, admin_eval_fixture, db):
    fx = admin_eval_fixture
    rid = fx["round"].id
    adm_h = auth_header(fx["admin"])

    # Setup active assignment
    a1 = JudgeAssignment(
        eventId=fx["event"].id,
        roundId=rid,
        teamId=fx["t1"].id,
        judgeVolunteerId=fx["j2"].id,
        source="manual",
        status="active",
    )
    db.add(a1)
    db.flush()

    # Create Evaluation and draft version
    ev = Evaluation(
        eventId=fx["event"].id,
        roundId=rid,
        teamId=fx["t1"].id,
        judgeVolunteerId=fx["j2"].id,
    )
    db.add(ev)
    db.flush()

    v1 = EvaluationVersion(
        eventId=fx["event"].id,
        evaluationId=ev.id,
        version=1,
        rubricVersionId=db.query(RubricVersion).filter(RubricVersion.roundId == rid).first().id,
        status="final",
        totalPct=Decimal("85.000"),
    )
    db.add(v1)
    db.flush()
    ev.currentVersionId = v1.id

    t_entry = EvaluationText(
        versionId=v1.id,
        fieldId=fx["f2"].id,
        value="Staff-only notes here",
        hiddenByAdmin=False,
    )
    db.add(t_entry)
    db.commit()

    # Progress endpoint
    res_prog = client.get(f"/admin/rounds/{rid}/progress", headers=adm_h)
    assert res_prog.status_code == 200
    p_data = res_prog.json()
    assert p_data["overallPercentage"] == 100.0
    assert p_data["totalAssigned"] == 1
    assert p_data["totalSubmitted"] == 1

    # Team trail
    res_trail = client.get(f"/admin/evaluations/team/{fx['t1'].id}", headers=adm_h)
    assert res_trail.status_code == 200
    trail_data = res_trail.json()
    assert trail_data["teamName"] == "Team 1"
    assert len(trail_data["evaluations"]) == 1

    # Hide text
    res_hide = client.post(f"/admin/evaluation-texts/{v1.id}/{fx['f2'].id}/hide", headers=adm_h)
    assert res_hide.status_code == 200
    assert res_hide.json()["hidden"] is True
    db.refresh(t_entry)
    assert t_entry.hiddenByAdmin is True
    assert t_entry.hiddenBy == "admin1"

    # Unhide text
    res_unhide = client.post(f"/admin/evaluation-texts/{v1.id}/{fx['f2'].id}/unhide", headers=adm_h)
    assert res_unhide.status_code == 200
    assert res_unhide.json()["hidden"] is False
    db.refresh(t_entry)
    assert t_entry.hiddenByAdmin is False


def test_unlock_evaluation_endpoint(client, admin_eval_fixture, db):
    fx = admin_eval_fixture
    rid = fx["round"].id
    adm_h = auth_header(fx["admin"])

    ev = Evaluation(
        eventId=fx["event"].id,
        roundId=rid,
        teamId=fx["t1"].id,
        judgeVolunteerId=fx["j2"].id,
    )
    db.add(ev)
    db.flush()

    v1 = EvaluationVersion(
        eventId=fx["event"].id,
        evaluationId=ev.id,
        version=1,
        rubricVersionId=db.query(RubricVersion).filter(RubricVersion.roundId == rid).first().id,
        status="final",
        totalPct=Decimal("80.000"),
    )
    db.add(v1)
    ev.currentVersionId = v1.id
    db.commit()

    res = client.post(f"/admin/evaluations/{ev.id}/unlock", json={"reason": "Recalibration"}, headers=adm_h)
    assert res.status_code == 200
    assert res.json()["draftVersion"] == 2
