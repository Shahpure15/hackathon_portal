from datetime import datetime, timezone
from decimal import Decimal
import uuid
import pytest
from fastapi import HTTPException

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
)
from app.services.ranking import build_leaderboard
from app.services.progression import select_top_n, select_threshold
from app.services.results import (
    build_release_items,
    diff_releases,
    release,
    update,
    retract,
    assert_no_private_keys,
    DEFAULT_RESULTS_CONFIG,
)
from tests.factories import make_org_event, make_team, make_volunteer, make_user


@pytest.fixture
def ranking_setup(db):
    event = make_org_event(db, name="Ranking Test Event")

    # 3 teams
    t1 = make_team(db, event, name="Team 1", registration_id="REG-01")
    t2 = make_team(db, event, name="Team 2", registration_id="REG-02")
    t3 = make_team(db, event, name="Team 3", registration_id="REG-03")
    t_unscored = make_team(db, event, name="Team Unscored", registration_id="REG-04")

    # 3 judges
    j1 = make_volunteer(db, event, name="Judge 1", type="JUDGE")
    j2 = make_volunteer(db, event, name="Judge 2", type="JUDGE")
    j3 = make_volunteer(db, event, name="Judge 3", type="JUDGE")

    # Leaders for teams
    u1 = make_user(db, event, role="LEADER", username="leader1", team_id=t1.id)
    u2 = make_user(db, event, role="LEADER", username="leader2", team_id=t2.id)
    u3 = make_user(db, event, role="LEADER", username="leader3", team_id=t3.id)
    u_admin = make_user(db, event, role="ADMIN", username="superadmin")

    # Round with totalScale=50, aggregation="mean", currentRubricVersion=1
    round_row = EvaluationRound(
        eventId=event.id,
        name="Round 1",
        roundNumber=1,
        submissionEnabled=True,
        evaluationEnabled=True,
        aggregation="mean",
        totalScale=50,
        currentRubricVersion=1,
        tieBreakOrder=["crit_b"],
    )
    db.add(round_row)
    db.flush()

    rubric = RubricVersion(
        eventId=event.id,
        roundId=round_row.id,
        version=1,
        lockedAt=datetime.now(timezone.utc),
        reason="locked rubric",
        createdBy="admin",
    )
    db.add(rubric)
    db.flush()

    # Two numeric fields: crit_a (weight 60, max 20), crit_b (weight 40, max 10)
    # Total weight = 100
    f_num_a = RubricField(
        eventId=event.id,
        rubricVersionId=rubric.id,
        fieldKey="crit_a",
        type="numeric",
        label="Criterion A",
        maxMarks=Decimal("20.00"),
        weight=Decimal("60.00"),
    )
    f_num_b = RubricField(
        eventId=event.id,
        rubricVersionId=rubric.id,
        fieldKey="crit_b",
        type="numeric",
        label="Criterion B",
        maxMarks=Decimal("10.00"),
        weight=Decimal("40.00"),
    )
    # One participant text field, one staff-only text field
    f_txt_pub = RubricField(
        eventId=event.id,
        rubricVersionId=rubric.id,
        fieldKey="feedback_pub",
        type="text",
        label="Public Feedback",
        visibility="participant",
    )
    f_txt_priv = RubricField(
        eventId=event.id,
        rubricVersionId=rubric.id,
        fieldKey="private_notes",
        type="text",
        label="Private Notes",
        visibility="staff",
    )
    db.add_all([f_num_a, f_num_b, f_txt_pub, f_txt_priv])
    db.commit()

    return {
        "event": event,
        "round": round_row,
        "rubric": rubric,
        "fields": (f_num_a, f_num_b, f_txt_pub, f_txt_priv),
        "teams": (t1, t2, t3, t_unscored),
        "judges": (j1, j2, j3),
        "users": (u1, u2, u3, u_admin),
    }


def add_eval(db, event, round_row, rubric, team, judge, num_a_val, num_b_val, pub_txt="Good", priv_txt="Judge comment", flds=None):
    f_a, f_b, f_pub, f_priv = flds
    # Active assignment
    assign = JudgeAssignment(
        eventId=event.id,
        roundId=round_row.id,
        teamId=team.id,
        judgeVolunteerId=judge.id,
        status="active",
        source="wizard",
    )
    db.add(assign)
    db.flush()

    ev = Evaluation(
        eventId=event.id,
        roundId=round_row.id,
        teamId=team.id,
        judgeVolunteerId=judge.id,
    )
    db.add(ev)
    db.flush()

    # pct = 100 * ((num_a / 20) * 0.6 + (num_b / 10) * 0.4)
    pct = Decimal("100") * ((Decimal(str(num_a_val)) / Decimal("20")) * Decimal("0.6") + (Decimal(str(num_b_val)) / Decimal("10")) * Decimal("0.4"))
    pct = pct.quantize(Decimal("0.001"))

    ver = EvaluationVersion(
        eventId=event.id,
        evaluationId=ev.id,
        version=1,
        rubricVersionId=rubric.id,
        status="final",
        totalPct=pct,
    )
    db.add(ver)
    db.flush()

    s_a = EvaluationScore(versionId=ver.id, fieldId=f_a.id, marks=Decimal(str(num_a_val)))
    s_b = EvaluationScore(versionId=ver.id, fieldId=f_b.id, marks=Decimal(str(num_b_val)))
    t_pub = EvaluationText(versionId=ver.id, fieldId=f_pub.id, value=pub_txt, hiddenByAdmin=False)
    t_priv = EvaluationText(versionId=ver.id, fieldId=f_priv.id, value=priv_txt, hiddenByAdmin=False)
    db.add_all([s_a, s_b, t_pub, t_priv])
    db.commit()
    return ver


def test_ranking_hand_computed_scores_and_tie_break(db, ranking_setup):
    ctx = ranking_setup
    event, round_row, rubric, flds, teams, judges, users = (
        ctx["event"], ctx["round"], ctx["rubric"], ctx["fields"], ctx["teams"], ctx["judges"], ctx["users"]
    )
    t1, t2, t3, t_unscored = teams
    j1, j2, j3 = judges

    # Team 1: Judge 1: num_a=18 (90%), num_b=9 (90%) -> pct = 100*(0.9*0.6 + 0.9*0.4) = 90.000%
    add_eval(db, event, round_row, rubric, t1, j1, 18, 9, flds=flds)

    # Team 2: Judge 1: num_a=15 (75%), num_b=10 (100%) -> pct = 100*(0.75*0.6 + 1.0*0.4) = 45 + 40 = 85.000%
    # crit_b score = 10/10 * 100 = 100.000%
    add_eval(db, event, round_row, rubric, t2, j1, 15, 10, flds=flds)

    # Team 3: Judge 1: num_a=17 (85%), num_b=7 (70%) -> pct = 100*(0.85*0.6 + 0.7*0.4) = 51 + 28 = 79.000% -> wait!
    # Let's give Team 3 totalPct = 85.000% with crit_b = 8/10 (80%) so it ties with Team 2 on score (85%)!
    # To get 85%: 100 * ((a/20)*0.6 + (b/10)*0.4) = 85 -> if b=8 (0.8*0.4 = 0.32), a/20*0.6 = 0.53 -> a = 0.53/0.6 * 20 = 17.6666...
    # Let's use simple numbers:
    # Team 2 and Team 3 tie on score 80%:
    # T2: a=16 (80%), b=8 (80%) -> 80% total. crit_b = 80%
    # T3: a=18 (90%), b=6.5 (65%) -> 0.9*0.6 + 0.65*0.4 = 0.54 + 0.26 = 0.80 = 80% total. crit_b = 65%
    # So T2 has crit_b 80%, T3 has crit_b 65%. Tie-break order is ["crit_b"], so T2 ranks ahead of T3!
    db.query(Evaluation).delete()
    db.query(JudgeAssignment).delete()
    db.commit()

    add_eval(db, event, round_row, rubric, t1, j1, 18, 9, flds=flds) # 90%
    add_eval(db, event, round_row, rubric, t2, j1, 16, 8, flds=flds) # 80%, crit_b=80%
    add_eval(db, event, round_row, rubric, t3, j1, 18, Decimal("6.5"), flds=flds) # 80%, crit_b=65%

    lb = build_leaderboard(db, round_row)
    rows = lb["rows"]
    unscored = lb["unscored"]

    assert len(rows) == 3
    # Check T1 is rank 1
    assert rows[0]["teamId"] == t1.id
    assert rows[0]["rank"] == 1
    assert rows[0]["score"] == Decimal("90.000")
    # totalScale=50 -> 90% * 50 / 100 = 45.00
    assert rows[0]["displayScore"] == Decimal("45.00")

    # Check T2 is rank 2 (won tie-break on crit_b)
    assert rows[1]["teamId"] == t2.id
    assert rows[1]["rank"] == 2
    assert rows[1]["score"] == Decimal("80.000")
    assert rows[1]["fieldScores"]["crit_b"] == Decimal("80.000")

    # Check T3 is rank 3
    assert rows[2]["teamId"] == t3.id
    assert rows[2]["rank"] == 3
    assert rows[2]["score"] == Decimal("80.000")
    assert rows[2]["fieldScores"]["crit_b"] == Decimal("65.000")

    # Check unscored contains t_unscored
    unscored_ids = [u["teamId"] for u in unscored]
    assert t_unscored.id in unscored_ids


def test_provisional_and_revoked_judge(db, ranking_setup):
    ctx = ranking_setup
    event, round_row, rubric, flds, teams, judges = (
        ctx["event"], ctx["round"], ctx["rubric"], ctx["fields"], ctx["teams"], ctx["judges"]
    )
    t1 = teams[0]
    j1, j2 = judges[0], judges[1]

    # Assign 2 judges to t1
    a1 = JudgeAssignment(eventId=event.id, roundId=round_row.id, teamId=t1.id, judgeVolunteerId=j1.id, status="active")
    a2 = JudgeAssignment(eventId=event.id, roundId=round_row.id, teamId=t1.id, judgeVolunteerId=j2.id, status="active")
    db.add_all([a1, a2])
    db.commit()

    # But only j1 submits final evaluation (1 of 2 needed)
    ev = Evaluation(eventId=event.id, roundId=round_row.id, teamId=t1.id, judgeVolunteerId=j1.id)
    db.add(ev)
    db.flush()
    ver = EvaluationVersion(eventId=event.id, evaluationId=ev.id, version=1, rubricVersionId=rubric.id, status="final", totalPct=Decimal("88.000"))
    db.add(ver)
    db.commit()

    lb = build_leaderboard(db, round_row)
    t1_row = next(r for r in lb["rows"] if r["teamId"] == t1.id)
    assert t1_row["judgesCount"] == 1
    assert t1_row["needed"] == 2
    assert t1_row["provisional"] is True

    # Revoke j1
    a1.status = "revoked"
    db.commit()

    # Once a1 is revoked, current_finals excludes it
    lb2 = build_leaderboard(db, round_row)
    assert not any(r["teamId"] == t1.id for r in lb2["rows"])
    assert any(u["teamId"] == t1.id for u in lb2["unscored"])


def test_progression_pure_top_n_and_threshold():
    rows = [
        {"teamId": "t1", "rank": 1, "score": Decimal("90.0"), "provisional": False},
        {"teamId": "t2", "rank": 2, "score": Decimal("85.0"), "provisional": False},
        {"teamId": "t3", "rank": 2, "score": Decimal("85.0"), "provisional": False},
        {"teamId": "t4", "rank": 4, "score": Decimal("70.0"), "provisional": False},
    ]

    # Top 2 with tie at cutoff (rank 2 shared by t2 and t3)
    teams, warnings = select_top_n(rows, 2)
    assert any(w["type"] == "tie_at_cutoff" for w in warnings)
    tie_w = next(w for w in warnings if w["type"] == "tie_at_cutoff")
    assert set(tie_w["tied_team_ids"]) == {"t2", "t3"}

    # Include all tied decision
    teams_all, _ = select_top_n(rows, 2, tie_decision="include_all_tied")
    assert set(teams_all) == {"t1", "t2", "t3"}

    # Exclude tied decision
    teams_exc, _ = select_top_n(rows, 2, tie_decision="exclude_tied")
    assert teams_exc == ["t1"]

    # Threshold 85 includes both tied teams
    teams_thresh, warnings_thresh = select_threshold(rows, Decimal("85.0"))
    assert set(teams_thresh) == {"t1", "t2", "t3"}

    # Provisional team is excluded with warning
    rows_with_prov = [
        {"teamId": "t1", "rank": 1, "score": Decimal("90.0"), "provisional": True},
        {"teamId": "t2", "rank": 2, "score": Decimal("85.0"), "provisional": False},
    ]
    teams_p, warnings_p = select_top_n(rows_with_prov, 1, include_provisional=False)
    assert any(w["type"] == "provisional_excluded" for w in warnings_p)
    assert "t1" not in teams_p


def test_results_release_lifecycle_diff_and_privacy(db, ranking_setup):
    ctx = ranking_setup
    event, round_row, rubric, flds, teams, judges, users = (
        ctx["event"], ctx["round"], ctx["rubric"], ctx["fields"], ctx["teams"], ctx["judges"], ctx["users"]
    )
    t1, t2, t3, _ = teams
    j1 = judges[0]
    u_admin = users[3]

    # Add evaluation with participant comments and staff-only notes
    v1 = add_eval(db, event, round_row, rubric, t1, j1, 18, 9, pub_txt="Excellent demo!", priv_txt="Judge internal note", flds=flds)
    v2 = add_eval(db, event, round_row, rubric, t2, j1, 16, 8, pub_txt="Good work!", priv_txt="Judge internal note", flds=flds)

    # 1. Closed defaults
    cfg = dict(DEFAULT_RESULTS_CONFIG)
    items = build_release_items(db, round_row, cfg)
    assert t1.id in items
    assert items[t1.id] == {}  # empty because all flags are False

    # 2. Privacy scan on full payload
    cfg["showScore"] = True
    cfg["showCriterionScores"] = True
    cfg["showRank"] = True
    cfg["showAdvancement"] = True
    cfg["textFields"] = {"feedback_pub": True, "private_notes": True}
    items_full = build_release_items(db, round_row, cfg)

    payload_t1 = items_full[t1.id]
    assert "score" in payload_t1
    assert "criteria" in payload_t1
    assert "rank" in payload_t1
    assert "advancement" in payload_t1
    assert "comments" in payload_t1

    # Verify staff-only text NEVER included
    for c in payload_t1["comments"]:
        assert c["label"] == "Public Feedback"
        assert "Judge internal note" not in c["items"]

    # Verify recursive scan passes
    assert_no_private_keys(payload_t1)

    # 3. Hold team
    cfg["holdTeamIds"] = [t2.id]
    items_held = build_release_items(db, round_row, cfg)
    assert t1.id in items_held
    assert t2.id not in items_held

    # 4. Initial release
    cfg["holdTeamIds"] = []
    rel1 = release(db, round_row, cfg, u_admin)
    assert rel1.releaseNo == 1

    # Notifications created for leaders of t1 and t2
    notifs = db.query(Notification).filter(Notification.type == "results_released").all()
    assert len(notifs) == 2

    # Double release returns 409
    with pytest.raises(HTTPException) as exc_info:
        release(db, round_row, cfg, u_admin)
    assert exc_info.value.status_code == 409

    # 5. Immutability: changing score of v1 does not change release 1 snapshot
    db.query(EvaluationScore).filter(EvaluationScore.versionId == v1.id, EvaluationScore.fieldId == flds[0].id).update({"marks": Decimal("10.00")})
    db.commit()
    # Stored item payload still has original score
    stored_item = db.query(ResultReleaseItem).filter(ResultReleaseItem.releaseId == rel1.id, ResultReleaseItem.teamId == t1.id).first()
    assert stored_item.payload["score"] == 90.0

    # 6. Update release with expectedReleaseNo
    # Wrong expectedReleaseNo raises 409
    with pytest.raises(HTTPException) as exc_409:
        update(db, round_row, cfg, u_admin, expected_release_no=99)
    assert exc_409.value.status_code == 409

    # Update with expectedReleaseNo=1 succeeds
    rel2 = update(db, round_row, cfg, u_admin, expected_release_no=1)
    assert rel2.releaseNo == 2

    # Retract release
    retracted = retract(db, round_row, u_admin)
    assert retracted.retractedAt is not None
