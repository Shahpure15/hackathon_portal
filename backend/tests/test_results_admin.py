from datetime import datetime, timezone
from decimal import Decimal
import io
import pytest
import openpyxl
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
    Role,
)
from tests.factories import make_org_event, make_team, make_volunteer, make_user, auth_header


@pytest.fixture
def admin_results_setup(db):
    event = make_org_event(db, name="Results Admin Test Event")
    admin_user = make_user(db, event, role="ADMIN", username="admin_p4")

    # 3 teams: one with malicious formula name
    t1 = make_team(db, event, name="=cmd|' /C calc'!A0", registration_id="REG-MAL-01")
    t2 = make_team(db, event, name="Team Safe", registration_id="REG-SAFE-02")
    t3 = make_team(db, event, name="Team Bronze", registration_id="REG-SAFE-03")
    t_unscored = make_team(db, event, name="Team Idle", registration_id="REG-SAFE-04")

    u1 = make_user(db, event, role="LEADER", username="leader_mal", team_id=t1.id)
    u2 = make_user(db, event, role="LEADER", username="leader_safe", team_id=t2.id)

    judge = make_volunteer(db, event, name="Judge X", type="JUDGE")

    round_row = EvaluationRound(
        eventId=event.id,
        name="Round Alpha",
        roundNumber=1,
        submissionEnabled=True,
        evaluationEnabled=True,
        aggregation="mean",
        totalScale=100,
        currentRubricVersion=1,
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

    f_num = RubricField(
        eventId=event.id,
        rubricVersionId=rubric.id,
        fieldKey="crit_main",
        type="numeric",
        label="Main Criterion",
        maxMarks=Decimal("50.00"),
        weight=Decimal("100.00"),
    )
    f_txt = RubricField(
        eventId=event.id,
        rubricVersionId=rubric.id,
        fieldKey="crit_notes",
        type="text",
        label="Public Notes",
        visibility="participant",
    )
    db.add_all([f_num, f_txt])
    db.commit()

    # Create evaluations for t1 and t2
    for t, m, txt in [(t1, 45, "Nice!"), (t2, 40, "Good!"), (t3, 40, "Tie team!")]:
        assign = JudgeAssignment(
            eventId=event.id,
            roundId=round_row.id,
            teamId=t.id,
            judgeVolunteerId=judge.id,
            status="active",
        )
        db.add(assign)
        db.flush()

        ev = Evaluation(eventId=event.id, roundId=round_row.id, teamId=t.id, judgeVolunteerId=judge.id)
        db.add(ev)
        db.flush()

        pct = (Decimal(str(m)) / Decimal("50")) * Decimal("100")
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

        s = EvaluationScore(versionId=ver.id, fieldId=f_num.id, marks=Decimal(str(m)))
        tx = EvaluationText(versionId=ver.id, fieldId=f_txt.id, value=txt, hiddenByAdmin=False)
        db.add_all([s, tx])

    db.commit()

    return {
        "event": event,
        "admin": admin_user,
        "round": round_row,
        "teams": (t1, t2, t3, t_unscored),
        "fields": (f_num, f_txt),
    }


def test_leaderboard_and_config_endpoints(client: TestClient, admin_results_setup):
    ctx = admin_results_setup
    admin, round_row, flds = ctx["admin"], ctx["round"], ctx["fields"]
    headers = auth_header(admin)

    # 1. GET leaderboard
    res = client.get(f"/admin/rounds/{round_row.id}/leaderboard", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "rows" in data
    assert "unscored" in data
    assert len(data["rows"]) == 3
    assert any(u["registrationId"] == "REG-SAFE-04" for u in data["unscored"])

    # 2. GET results-config
    res_cfg = client.get(f"/admin/rounds/{round_row.id}/results-config", headers=headers)
    assert res_cfg.status_code == 200
    assert res_cfg.json()["showScore"] is False

    # 3. PUT results-config with unknown key -> 422
    bad_payload = {
        "showScore": True,
        "textFields": {"non_existent_key": True},
    }
    res_bad = client.put(f"/admin/rounds/{round_row.id}/results-config", json=bad_payload, headers=headers)
    assert res_bad.status_code == 422

    # PUT valid results-config -> 200
    good_payload = {
        "showScore": True,
        "showRank": True,
        "showAdvancement": True,
        "textFields": {"crit_notes": True},
        "scale": "percent",
        "holdTeamIds": [],
    }
    res_good = client.put(f"/admin/rounds/{round_row.id}/results-config", json=good_payload, headers=headers)
    assert res_good.status_code == 200
    assert res_good.json()["showScore"] is True


def test_results_release_update_and_retract_lifecycle(client: TestClient, admin_results_setup):
    ctx = admin_results_setup
    admin, round_row = ctx["admin"], ctx["round"]
    headers = auth_header(admin)

    # Status before release
    res_st = client.get(f"/admin/rounds/{round_row.id}/results/status", headers=headers)
    assert res_st.status_code == 200
    assert res_st.json()["releaseNo"] == 0

    # Preview results
    res_prev = client.post(f"/admin/rounds/{round_row.id}/results/preview", headers=headers)
    assert res_prev.status_code == 200
    assert res_prev.json()["totalTeams"] == 3

    # Release
    res_rel = client.post(f"/admin/rounds/{round_row.id}/results/release", headers=headers)
    assert res_rel.status_code == 200
    assert res_rel.json()["releaseNo"] == 1

    # Status after release
    res_st2 = client.get(f"/admin/rounds/{round_row.id}/results/status", headers=headers)
    assert res_st2.json()["releaseNo"] == 1
    assert res_st2.json()["pendingChanges"] == 0

    # Double release -> 409
    res_rel_dup = client.post(f"/admin/rounds/{round_row.id}/results/release", headers=headers)
    assert res_rel_dup.status_code == 409

    # Update preview
    res_up_prev = client.post(f"/admin/rounds/{round_row.id}/results/update/preview", headers=headers)
    assert res_up_prev.status_code == 200

    # Update with expectedReleaseNo mismatch -> 409
    res_up_mismatch = client.post(
        f"/admin/rounds/{round_row.id}/results/update",
        json={"expectedReleaseNo": 99},
        headers=headers,
    )
    assert res_up_mismatch.status_code == 409

    # Update with expectedReleaseNo=1 -> 200
    res_up_ok = client.post(
        f"/admin/rounds/{round_row.id}/results/update",
        json={"expectedReleaseNo": 1},
        headers=headers,
    )
    assert res_up_ok.status_code == 200
    assert res_up_ok.json()["releaseNo"] == 2

    # Retract
    res_retract = client.post(f"/admin/rounds/{round_row.id}/results/retract", headers=headers)
    assert res_retract.status_code == 200
    assert res_retract.json()["success"] is True

    # Status now retracted
    res_st3 = client.get(f"/admin/rounds/{round_row.id}/results/status", headers=headers)
    assert res_st3.json()["retracted"] is True


def test_advance_preview_tamper_and_commit(client: TestClient, admin_results_setup):
    ctx = admin_results_setup
    admin, round_row, teams = ctx["admin"], ctx["round"], ctx["teams"]
    t1, t2, t3, t_idle = teams
    headers = auth_header(admin)

    # Preview top 2 (t2 and t3 tie on score 40/50 = 80%)
    res_prev = client.post(
        f"/admin/rounds/{round_row.id}/advance/preview",
        json={"mode": "top_n", "n": 2, "includeProvisional": False},
        headers=headers,
    )
    assert res_prev.status_code == 200
    data = res_prev.json()
    assert any(w["type"] == "tie_at_cutoff" for w in data["warnings"])
    token = data["token"]

    # Tampered token on commit -> 400
    res_tamper = client.post(
        f"/admin/rounds/{round_row.id}/advance/commit",
        json={"mode": "top_n", "teamIds": [t1.id, t2.id], "token": "invalid_fake_token"},
        headers=headers,
    )
    assert res_tamper.status_code == 400

    # Commit without tie decision when tie_at_cutoff exists -> 409
    res_no_td = client.post(
        f"/admin/rounds/{round_row.id}/advance/commit",
        json={"mode": "top_n", "teamIds": data["selectedTeamIds"], "token": token},
        headers=headers,
    )
    assert res_no_td.status_code == 409

    # Re-preview with tieDecision='include_all_tied'
    res_prev2 = client.post(
        f"/admin/rounds/{round_row.id}/advance/preview",
        json={"mode": "top_n", "n": 2, "includeProvisional": False, "tieDecision": "include_all_tied"},
        headers=headers,
    )
    data2 = res_prev2.json()
    token2 = data2["token"]

    # Commit with valid tieDecision
    res_commit = client.post(
        f"/admin/rounds/{round_row.id}/advance/commit",
        json={
            "mode": "top_n",
            "teamIds": data2["selectedTeamIds"],
            "token": token2,
            "tieDecision": "include_all_tied",
        },
        headers=headers,
    )
    assert res_commit.status_code == 200
    assert res_commit.json()["advancedCount"] == len(data2["selectedTeamIds"])

    # GET progression check
    res_prog = client.get(f"/admin/rounds/{round_row.id}/progression", headers=headers)
    assert res_prog.status_code == 200
    prog_data = res_prog.json()
    assert any(p["teamId"] == t1.id and p["state"] == "advanced" for p in prog_data)


def test_leaderboard_export_neutralises_formula_injection(client: TestClient, admin_results_setup):
    ctx = admin_results_setup
    admin, round_row = ctx["admin"], ctx["round"]
    headers = auth_header(admin)

    res = client.get(f"/admin/rounds/{round_row.id}/leaderboard/export", headers=headers)
    assert res.status_code == 200
    assert "application/vnd.openxmlformats" in res.headers["content-type"]

    # Load workbook and check formula neutralization
    wb = openpyxl.load_workbook(io.BytesIO(res.content))
    ws = wb.active

    # Find row with REG-MAL-01
    found_malicious_cell = False
    for row in ws.iter_rows():
        if row[1].value == "REG-MAL-01":
            team_cell = row[2]
            # In openpyxl, formula injection is neutralised via data_type = 's' without modifying text
            assert team_cell.data_type == "s", f"Expected cell data_type 's', got {team_cell.data_type}"
            assert team_cell.value == "=cmd|' /C calc'!A0"
            found_malicious_cell = True
            break
    assert found_malicious_cell, "Malicious team not found in export"


def test_round_put_eligibility_validation(client: TestClient, admin_results_setup, db):
    ctx = admin_results_setup
    admin, round1 = ctx["admin"], ctx["round"]
    headers = auth_header(admin)

    # Create round 2
    round2 = EvaluationRound(
        eventId=round1.eventId,
        name="Round Beta",
        roundNumber=2,
        submissionEnabled=True,
    )
    db.add(round2)
    db.commit()
    db.refresh(round2)

    # Mode advanced_from with equal or higher roundNumber -> 422
    res_bad = client.put(
        f"/admin/rounds/{round1.id}",
        json={"eligibility": {"mode": "advanced_from", "fromRoundId": round2.id}},
        headers=headers,
    )
    assert res_bad.status_code == 422

    # Mode advanced_from on round2 pointing to round1 (lower roundNumber) -> 200
    res_good = client.put(
        f"/admin/rounds/{round2.id}",
        json={"eligibility": {"mode": "advanced_from", "fromRoundId": round1.id}},
        headers=headers,
    )
    assert res_good.status_code == 200

    # Mode manual with fake cross-event team ID -> 422
    res_fake = client.put(
        f"/admin/rounds/{round2.id}",
        json={"eligibility": {"mode": "manual", "teamIds": ["00000000-0000-0000-0000-000000000000"]}},
        headers=headers,
    )
    assert res_fake.status_code == 422


def test_release_manual_round_without_rubric_or_finals(client: TestClient, admin_results_setup, db):
    ctx = admin_results_setup
    admin = ctx["admin"]
    event = ctx["event"]
    headers = auth_header(admin)

    # Create round without rubrics or judge evaluations
    manual_round = EvaluationRound(
        eventId=event.id,
        name="Round Screening",
        roundNumber=10,
        submissionEnabled=True,
        evaluationEnabled=True,
    )
    db.add(manual_round)
    db.flush()

    # Create two teams and set manual progression
    t1 = make_team(db, event, name="Team Qual 1", registration_id="REG-Q1")
    t2 = make_team(db, event, name="Team Qual 2", registration_id="REG-Q2")

    s1 = TeamRoundStatus(
        eventId=event.id,
        roundId=manual_round.id,
        teamId=t1.id,
        state="advanced",
        via="manual",
        rankSnapshot=1,
    )
    s2 = TeamRoundStatus(
        eventId=event.id,
        roundId=manual_round.id,
        teamId=t2.id,
        state="not_advanced",
        via="manual",
        rankSnapshot=2,
    )
    db.add_all([s1, s2])
    db.commit()

    # Release results with advancement visible and rank visible
    res = client.post(
        f"/admin/rounds/{manual_round.id}/results/release",
        json={
            "showAdvancement": True,
            "showRank": True,
            "showScore": False,
        },
        headers=headers,
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["releaseNo"] == 1
    assert data["count"] == 2

    # Check that the leader of t1 can fetch the released result
    u1 = make_user(db, event, role="LEADER", username="leader_q1", team_id=t1.id)
    leader_headers = auth_header(u1)
    res_ldr = client.get(f"/leader/rounds/{manual_round.id}/result", headers=leader_headers)
    assert res_ldr.status_code == 200, res_ldr.text
    ldr_data = res_ldr.json()
    assert ldr_data["advancement"] == "advanced"
    assert ldr_data["rank"] == 1


def test_detailed_sheets_export(client: TestClient, admin_results_setup):
    ctx = admin_results_setup
    admin, round_row = ctx["admin"], ctx["round"]
    headers = auth_header(admin)

    import zipfile
    # 1. Test detailed sheets export (GET and POST returns a ZIP archive containing Leaderboard and team workbooks)
    res = client.get(f"/admin/rounds/{round_row.id}/export/detailed-sheets", headers=headers)
    assert res.status_code == 200
    assert "zip" in res.headers["content-type"]

    zf = zipfile.ZipFile(io.BytesIO(res.content))
    namelist = zf.namelist()
    assert any("Leaderboard.xlsx" in n for n in namelist)

    lb_name = next(n for n in namelist if "Leaderboard.xlsx" in n)
    lb_bytes = zf.read(lb_name)
    wb = openpyxl.load_workbook(io.BytesIO(lb_bytes))
    assert "Evaluation Summary" in wb.sheetnames
    ws_sum = wb["Evaluation Summary"]
    assert "EVALUATION SUMMARY & LEADERBOARD" in str(ws_sum["A1"].value)
    sum_headers = [cell.value for cell in ws_sum[3] if cell.value]
    assert "College / Institution" in sum_headers
    assert "Team Leader" in sum_headers
    assert "Status" in sum_headers

    # Check POST also works
    res_post = client.post(f"/admin/rounds/{round_row.id}/export/detailed-sheets", headers=headers)
    assert res_post.status_code == 200
    assert "zip" in res_post.headers["content-type"]

    # 2. Test leaderboard export (GET and POST)
    lb_res = client.get(f"/admin/rounds/{round_row.id}/leaderboard/export", headers=headers)
    assert lb_res.status_code == 200
    assert "application/vnd.openxmlformats" in lb_res.headers["content-type"]

    lb_wb = openpyxl.load_workbook(io.BytesIO(lb_res.content))
    lb_ws = lb_wb.active
    lb_headers = [cell.value for cell in lb_ws[1] if cell.value]
    assert "Rank" in lb_headers
    assert "Team Registration ID" in lb_headers
    assert "College / Institution" in lb_headers
    assert "Team Leader" in lb_headers
    assert "Final Score (/100)" in lb_headers

    # Check POST also works
    lb_post = client.post(f"/admin/rounds/{round_row.id}/leaderboard/export", headers=headers)
    assert lb_post.status_code == 200



