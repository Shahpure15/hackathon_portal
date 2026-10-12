from datetime import datetime, timedelta
import pytest
from fastapi.testclient import TestClient

from app.models import (
    EvaluationRound,
    JudgeAssignment,
    Evaluation,
    EvaluationVersion,
    EmailOutbox,
    EmailBatch,
    SmtpAccount,
    AuthToken,
    PSSelection,
    ProblemStatement,
    AttendanceRecord,
    CheckpointType,
    TeamMember,
)
from app.services.overview import get_overview_data
from tests.factories import make_org_event, make_team, make_volunteer, make_user, auth_header


def test_overview_empty_event(db):
    event = make_org_event(db, name="Overview Test Empty")
    data = get_overview_data(event.id, db)
    assert data["counts"]["total_teams"] == 0
    assert data["counts"]["checked_in_teams"] == 0
    assert data["counts"]["total_judges"] == 0
    assert data["counts"]["active_rounds"] == 0
    assert data["counts"]["pending_evaluations"] == 0

    # Because no SMTP accounts exist, no_email_account should trigger
    rule_ids = [item["id"] for item in data["attention"]]
    assert "no_email_account" in rule_ids


def test_overview_counts_and_rules(db):
    event = make_org_event(db, name="Overview Counts Event")

    # 1. Teams & Check-in
    t1 = make_team(db, event, name="Team 1", registration_id="REG-T1")
    t2 = make_team(db, event, name="Team 2", registration_id="REG-T2")

    member1 = TeamMember(
        teamId=t1.id,
        name="Leader 1",
        email="l1@example.com",
        phone="111",
        isTeamLeader=True,
    )
    db.add(member1)
    db.flush()

    cp = CheckpointType(eventId=event.id, name="Gate")
    db.add(cp)
    db.flush()

    att = AttendanceRecord(
        teamMemberId=member1.id,
        checkpointTypeId=cp.id,
        markedBy="vol1",
    )
    db.add(att)
    db.flush()

    # 2. Judges
    j1 = make_volunteer(db, event, name="Judge One", type="JUDGE")
    v1 = make_volunteer(db, event, name="Volunteer One", type="VOLUNTEER")

    # 3. Active Rounds
    r1 = EvaluationRound(
        eventId=event.id,
        name="Round 1",
        roundNumber=1,
        status="live",
        evaluationEnabled=True,
        currentRubricVersion=0,  # missing rubric!
    )
    db.add(r1)
    db.flush()

    # 4. Assignments
    ja = JudgeAssignment(
        eventId=event.id,
        roundId=r1.id,
        teamId=t1.id,
        judgeVolunteerId=j1.id,
        status="active",
    )
    db.add(ja)

    # 5. SMTP account
    smtp = SmtpAccount(
        label="Primary",
        host="smtp.example.com",
        port=587,
        security="starttls",
        username="u",
        passwordEnc="enc",
        fromEmail="from@example.com",
        fromName="Sender",
        status="active",
    )
    db.add(smtp)

    # 6. Failed outbox row
    outbox_fail = EmailOutbox(
        eventId=event.id,
        toEmail="err@example.com",
        templateKey="test",
        subject="Failed Email",
        body="Body",
        status="failed",
        nextAttemptAt=datetime.utcnow(),
    )
    db.add(outbox_fail)

    # 7. Expired invite
    expired_token = AuthToken(
        eventId=event.id,
        userId=j1.id,
        kind="invite",
        tokenHash="hash123",
        expiresAt=datetime.utcnow() - timedelta(hours=2),
    )
    db.add(expired_token)

    db.commit()

    # Query overview
    data = get_overview_data(event.id, db)

    # Validate counts
    assert data["counts"]["total_teams"] == 2
    assert data["counts"]["checked_in_teams"] == 1
    assert data["counts"]["total_judges"] == 1
    assert data["counts"]["active_rounds"] == 1
    assert data["counts"]["pending_evaluations"] == 1

    # Validate attention rules triggered
    rule_ids = {item["id"]: item for item in data["attention"]}
    assert "email_failing" in rule_ids
    assert rule_ids["email_failing"]["count"] == 1
    assert rule_ids["email_failing"]["level"] == "error"

    assert "rubric_unpublished" in rule_ids
    assert rule_ids["rubric_unpublished"]["count"] == 1

    assert "unassigned_teams" in rule_ids
    assert rule_ids["unassigned_teams"]["count"] >= 1  # Team 2 is unassigned in round 1

    assert "invites_expired" in rule_ids
    assert rule_ids["invites_expired"]["count"] == 1

    assert "teams_without_ps" in rule_ids
    assert rule_ids["teams_without_ps"]["count"] == 2


def test_overview_api_endpoint(client, db):
    event = make_org_event(db, name="Overview API Event")
    admin_user = make_user(db, event, role="ADMIN", username="admin_overview")
    leader_user = make_user(db, event, role="LEADER", username="leader_overview")

    # 1. Unauthenticated -> 401
    res_unauth = client.get("/admin/overview")
    assert res_unauth.status_code == 401

    # 2. Leader (non-staff) -> 403
    res_leader = client.get("/admin/overview", headers=auth_header(leader_user))
    assert res_leader.status_code == 403

    # 3. Admin -> 200
    res_admin = client.get("/admin/overview", headers=auth_header(admin_user))
    assert res_admin.status_code == 200
    json_data = res_admin.json()
    assert "counts" in json_data
    assert "attention" in json_data
    assert json_data["counts"]["total_teams"] == 0
