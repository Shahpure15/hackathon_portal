from datetime import datetime, timezone
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient

from app.models import (
    EvaluationRound,
    RubricVersion,
    RubricField,
    JudgeAssignment,
    Evaluation,
    EvaluationVersion,
    EvaluationScore,
    EvaluationText,
    TeamRoundStatus,
    ResultRelease,
    ResultReleaseItem,
    Notification,
    Role,
)
from app.services.results import PRIVATE_KEYWORDS
from tests.factories import make_org_event, make_team, make_volunteer, make_user, auth_header


@pytest.fixture
def participant_setup(db):
    event = make_org_event(db, name="Participant Test Event")
    admin = make_user(db, event, role="ADMIN", username="admin_part")

    t1 = make_team(db, event, name="Team Phoenix", registration_id="REG-P-01")
    t2 = make_team(db, event, name="Team Dragon", registration_id="REG-P-02")

    u1 = make_user(db, event, role="LEADER", username="leader_phoenix", team_id=t1.id)
    u2 = make_user(db, event, role="LEADER", username="leader_dragon", team_id=t2.id)

    round1 = EvaluationRound(
        eventId=event.id,
        name="Round 1",
        roundNumber=1,
        submissionEnabled=True,
        evaluationEnabled=True,
        isSubmissionOpen=True,
        eligibility={"mode": "all"},
        currentRubricVersion=1,
    )
    round2 = EvaluationRound(
        eventId=event.id,
        name="Round 2",
        roundNumber=2,
        submissionEnabled=True,
        evaluationEnabled=True,
        isSubmissionOpen=True,
        eligibility={"mode": "advanced_from", "fromRoundId": None},  # Will link to round1
        currentRubricVersion=1,
    )
    round_manual = EvaluationRound(
        eventId=event.id,
        name="Round Manual",
        roundNumber=3,
        submissionEnabled=True,
        isSubmissionOpen=True,
        eligibility={"mode": "manual", "teamIds": [t1.id]},  # t1 only
    )
    db.add_all([round1, round2, round_manual])
    db.commit()
    db.refresh(round1)
    db.refresh(round2)
    db.refresh(round_manual)

    round2.eligibility = {"mode": "advanced_from", "fromRoundId": round1.id}
    db.commit()

    # t1 is advanced from round 1, t2 is not_advanced
    trs1 = TeamRoundStatus(eventId=event.id, roundId=round1.id, teamId=t1.id, state="advanced", via="auto_top_n")
    trs2 = TeamRoundStatus(eventId=event.id, roundId=round1.id, teamId=t2.id, state="not_advanced", via="auto_top_n")
    db.add_all([trs1, trs2])
    db.commit()

    # Create release for round 1
    rel1 = ResultRelease(
        eventId=event.id,
        roundId=round1.id,
        releaseNo=1,
        config={"showScore": True, "showRank": True, "showAdvancement": True},
        releasedBy=admin.id,
    )
    db.add(rel1)
    db.flush()

    item1 = ResultReleaseItem(
        releaseId=rel1.id,
        teamId=t1.id,
        payload={"score": 92.5, "rank": 1, "advancement": "advanced", "criteria": [{"label": "Concept", "avgMarks": 18.5, "maxMarks": 20.0}]},
    )
    item2 = ResultReleaseItem(
        releaseId=rel1.id,
        teamId=t2.id,
        payload={"score": 75.0, "rank": 2, "advancement": "not_advanced", "criteria": [{"label": "Concept", "avgMarks": 15.0, "maxMarks": 20.0}]},
    )
    db.add_all([item1, item2])
    db.commit()

    return {
        "event": event,
        "rounds": (round1, round2, round_manual),
        "teams": (t1, t2),
        "users": (u1, u2),
        "release": rel1,
    }


def test_leader_eligibility_enforcement(client: TestClient, participant_setup):
    ctx = participant_setup
    r1, r2, r_man = ctx["rounds"]
    t1, t2 = ctx["teams"]
    u1, u2 = ctx["users"]

    # 1. Leader 1 is advanced to Round 2 and eligible for Round Manual:
    res1 = client.get("/leader/rounds", headers=auth_header(u1))
    assert res1.status_code == 200
    r_ids_1 = [r["id"] for r in res1.json()]
    assert r1.id in r_ids_1
    assert r2.id in r_ids_1
    assert r_man.id in r_ids_1

    # 2. Leader 2 is NOT advanced to Round 2 and NOT in manual list:
    res2 = client.get("/leader/rounds", headers=auth_header(u2))
    assert res2.status_code == 200
    r_ids_2 = [r["id"] for r in res2.json()]
    assert r1.id in r_ids_2
    assert r2.id not in r_ids_2
    assert r_man.id not in r_ids_2

    # 3. Leader 2 attempts to submit to round 2 -> 403
    res_sub_bad = client.post(
        f"/leader/evaluation-rounds/{r2.id}/submit",
        json={"answers": {}},
        headers=auth_header(u2),
    )
    assert res_sub_bad.status_code == 403

    # 4. Old list parity (/leader/evaluation-rounds is filtered)
    res_old = client.get("/leader/evaluation-rounds", headers=auth_header(u2))
    assert res_old.status_code == 200
    assert not any(r["id"] == r2.id for r in res_old.json())

    # 5. New list (/leader/rounds) superset verification
    first_round = res1.json()[0]
    for required_key in ("id", "name", "roundNumber", "description", "fields", "isOpen", "submissionEnabled", "results", "advancement", "submission"):
        assert required_key in first_round, f"Missing key: {required_key}"


def test_leader_result_privacy_and_isolation(client: TestClient, participant_setup, db):
    ctx = participant_setup
    r1 = ctx["rounds"][0]
    u1, u2 = ctx["users"]
    t1, t2 = ctx["teams"]
    rel1 = ctx["release"]

    # Leader 1 reads only Team 1's results
    res1 = client.get(f"/leader/rounds/{r1.id}/result", headers=auth_header(u1))
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["score"] == 92.5
    assert data1["rank"] == 1
    assert data1["advancement"] == "advanced"

    # Recursive scan confirms NO private/staff keys in response
    def _assert_no_private(obj):
        if isinstance(obj, dict):
            for k, v in obj.items():
                for kw in PRIVATE_KEYWORDS:
                    assert kw not in k.lower(), f"Leaked private key '{kw}' in '{k}'"
                _assert_no_private(v)
        elif isinstance(obj, list):
            for it in obj:
                _assert_no_private(it)

    _assert_no_private(data1)

    # Leader 2 reads only Team 2's results
    res2 = client.get(f"/leader/rounds/{r1.id}/result", headers=auth_header(u2))
    assert res2.status_code == 200
    assert res2.json()["score"] == 75.0
    assert res2.json()["rank"] == 2

    # Retract release -> now gives 404
    rel1.retractedAt = datetime.now(timezone.utc)
    db.commit()

    res_retracted = client.get(f"/leader/rounds/{r1.id}/result", headers=auth_header(u1))
    assert res_retracted.status_code == 404


def test_leader_notifications_lifecycle(client: TestClient, participant_setup, db):
    ctx = participant_setup
    event = ctx["event"]
    u1, u2 = ctx["users"]

    # Create notifications for u1 and u2
    n1 = Notification(
        eventId=event.id,
        recipientUserId=u1.id,
        type="results_released",
        title="Results are out: Round 1",
        body="Your team scored 92.5",
        link="/leader?tab=rounds",
    )
    n2 = Notification(
        eventId=event.id,
        recipientUserId=u2.id,
        type="results_released",
        title="Results are out: Round 1",
        body="Your team scored 75.0",
        link="/leader?tab=rounds",
    )
    db.add_all([n1, n2])
    db.commit()

    # GET notifications for u1
    res1 = client.get("/leader/notifications", headers=auth_header(u1))
    assert res1.status_code == 200
    assert len(res1.json()) == 1
    assert res1.json()[0]["id"] == n1.id

    # Filter unread=1
    res_unread = client.get("/leader/notifications?unread=1", headers=auth_header(u1))
    assert res_unread.status_code == 200
    assert len(res_unread.json()) == 1

    # Mark read
    res_mark = client.post(f"/leader/notifications/{n1.id}/read", headers=auth_header(u1))
    assert res_mark.status_code == 200

    # Now unread=1 is empty
    res_unread_after = client.get("/leader/notifications?unread=1", headers=auth_header(u1))
    assert len(res_unread_after.json()) == 0

    # User 1 cannot mark user 2's notification as read -> 404
    res_cross = client.post(f"/leader/notifications/{n2.id}/read", headers=auth_header(u1))
    assert res_cross.status_code == 404

    # Mark all read for u2
    res_read_all = client.post("/leader/notifications/read-all", headers=auth_header(u2))
    assert res_read_all.status_code == 200
    res_u2_unread = client.get("/leader/notifications?unread=1", headers=auth_header(u2))
    assert len(res_u2_unread.json()) == 0
