import pytest
from datetime import datetime
from decimal import Decimal
from fastapi import HTTPException

from app.models import (
    Event,
    EventConfig,
    EvaluationRound,
    RubricVersion,
    RubricField,
    JudgeAssignment,
    Evaluation,
    EvaluationVersion,
    Volunteer,
    Team,
)
from app.services.evaluation import (
    get_or_create_evaluation,
    save_draft,
    submit,
    unlock,
    revise_rubric,
    current_finals,
    diff_versions,
)
from tests.factories import make_org_event, make_volunteer, make_team


@pytest.fixture
def eval_setup(db):
    event = make_org_event(db, name="Eval Event")
    v = make_volunteer(db, event, name="Judge Alice", type="JUDGE")
    t1 = make_team(db, event, name="Team 1", registration_id="REG001")
    t2 = make_team(db, event, name="Team 2", registration_id="REG002")

    # Round with evaluation enabled
    round_obj = EvaluationRound(
        eventId=event.id,
        name="Round 1",
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
        createdBy="admin-test",
        publishedAt=datetime.utcnow(),
    )
    db.add(r_ver)
    db.flush()

    # Rubric fields: 1 numeric, 1 text required, 1 text optional
    f1 = RubricField(
        eventId=event.id,
        rubricVersionId=r_ver.id,
        fieldKey="fk_num_1",
        type="numeric",
        label="Innovation",
        maxMarks=Decimal("50.00"),
        weight=Decimal("100.00"),
        sortOrder=1,
        isRequired=True,
    )
    f2 = RubricField(
        eventId=event.id,
        rubricVersionId=r_ver.id,
        fieldKey="fk_txt_critique",
        type="text",
        label="Critique",
        sortOrder=2,
        isRequired=True,
        maxLength=500,
        visibility="staff",
    )
    f3 = RubricField(
        eventId=event.id,
        rubricVersionId=r_ver.id,
        fieldKey="fk_txt_feedback",
        type="text",
        label="Suggestions",
        sortOrder=3,
        isRequired=False,
        maxLength=500,
        visibility="participant",
    )
    db.add_all([f1, f2, f3])
    db.flush()

    # Active assignment for t1
    assign1 = JudgeAssignment(
        eventId=event.id,
        roundId=round_obj.id,
        teamId=t1.id,
        judgeVolunteerId=v.id,
        source="wizard",
        status="active",
    )
    db.add(assign1)
    db.commit()

    return {
        "event": event,
        "round": round_obj,
        "rubric_ver": r_ver,
        "judge": v,
        "team1": t1,
        "team2": t2,
        "fields": {"f1": f1, "f2": f2, "f3": f3},
        "assignment": assign1,
    }


def test_draft_submit_lifecycle_and_rubric_locking(db, eval_setup):
    round_obj = eval_setup["round"]
    judge = eval_setup["judge"]
    t1 = eval_setup["team1"]
    f1 = eval_setup["fields"]["f1"]
    f2 = eval_setup["fields"]["f2"]
    r_ver = eval_setup["rubric_ver"]

    assert r_ver.lockedAt is None

    evaluation = get_or_create_evaluation(db, round_obj, t1.id, judge.id)
    assert evaluation.id is not None

    # Save draft
    payload = {
        "scores": {f1.id: "40.0"},
        "texts": {f2.id: "Great technical architecture."},
    }
    draft, token = save_draft(db, evaluation, payload, token=None, actor="judge-user")
    assert draft.status == "draft"
    assert draft.version == 1
    db.refresh(r_ver)
    assert r_ver.lockedAt is not None  # Rubric locked on first draft save

    # Submit
    final_ver = submit(db, evaluation, token=token, actor="judge-user")
    assert final_ver.status == "final"
    assert final_ver.totalPct == Decimal("80.000")
    assert evaluation.currentVersionId == final_ver.id

    # Idempotent re-submit with same version returns same final
    resub = submit(db, evaluation, token=token, actor="judge-user")
    assert resub.id == final_ver.id

    # Editing after final without unlocking raises 409
    with pytest.raises(HTTPException) as exc_info:
        save_draft(db, evaluation, payload, token=token, actor="judge-user")
    assert exc_info.value.status_code == 409
    assert "Already submitted" in exc_info.value.detail


def test_unassigned_or_revoked_cannot_save(db, eval_setup):
    round_obj = eval_setup["round"]
    judge = eval_setup["judge"]
    t2 = eval_setup["team2"]
    f1 = eval_setup["fields"]["f1"]

    # t2 is not assigned to judge
    eval2 = get_or_create_evaluation(db, round_obj, t2.id, judge.id)
    with pytest.raises(HTTPException) as exc_info:
        save_draft(db, eval2, {"scores": {f1.id: "30"}}, token=None, actor="judge-user")
    assert exc_info.value.status_code == 403

    # Revoke assignment on t1
    assign1 = eval_setup["assignment"]
    assign1.status = "revoked"
    db.commit()

    eval1 = get_or_create_evaluation(db, round_obj, eval_setup["team1"].id, judge.id)
    with pytest.raises(HTTPException) as exc_info:
        save_draft(db, eval1, {"scores": {f1.id: "30"}}, token=None, actor="judge-user")
    assert exc_info.value.status_code == 403


def test_numeric_bounds_and_required_checks(db, eval_setup):
    round_obj = eval_setup["round"]
    judge = eval_setup["judge"]
    t1 = eval_setup["team1"]
    f1 = eval_setup["fields"]["f1"]
    f2 = eval_setup["fields"]["f2"]

    evaluation = get_or_create_evaluation(db, round_obj, t1.id, judge.id)

    # Score exceeding max (max is 50.00)
    with pytest.raises(HTTPException) as exc_info:
        save_draft(db, evaluation, {"scores": {f1.id: "60"}}, token=None, actor="judge-user")
    assert exc_info.value.status_code == 422

    # Score negative
    with pytest.raises(HTTPException) as exc_info:
        save_draft(db, evaluation, {"scores": {f1.id: "-5"}}, token=None, actor="judge-user")
    assert exc_info.value.status_code == 422

    # Save partial draft (missing required f2 text)
    draft, token = save_draft(db, evaluation, {"scores": {f1.id: "25"}}, token=None, actor="judge-user")
    assert draft.status == "draft"

    # Submit should fail due to missing required text f2
    with pytest.raises(HTTPException) as exc_info:
        submit(db, evaluation, token=token, actor="judge-user")
    assert exc_info.value.status_code == 400
    assert "Required text missing" in exc_info.value.detail


def test_optimistic_concurrency_token(db, eval_setup):
    round_obj = eval_setup["round"]
    judge = eval_setup["judge"]
    t1 = eval_setup["team1"]
    f1 = eval_setup["fields"]["f1"]

    evaluation = get_or_create_evaluation(db, round_obj, t1.id, judge.id)
    draft, token = save_draft(db, evaluation, {"scores": {f1.id: "20"}}, token=None, actor="judge-user")

    # Mismatched token raises 409
    with pytest.raises(HTTPException) as exc_info:
        save_draft(db, evaluation, {"scores": {f1.id: "25"}}, token="2020-01-01T00:00:00", actor="judge-user")
    assert exc_info.value.status_code == 409
    assert "changed in another tab" in exc_info.value.detail


def test_unlock_prefill_and_resubmit(db, eval_setup):
    round_obj = eval_setup["round"]
    judge = eval_setup["judge"]
    t1 = eval_setup["team1"]
    f1 = eval_setup["fields"]["f1"]
    f2 = eval_setup["fields"]["f2"]

    evaluation = get_or_create_evaluation(db, round_obj, t1.id, judge.id)
    save_draft(db, evaluation, {"scores": {f1.id: "40"}, "texts": {f2.id: "V1 Feedback"}}, None, "judge")
    v1_final = submit(db, evaluation, None, "judge")
    assert v1_final.totalPct == Decimal("80.000")

    # Unlock requires reason
    with pytest.raises(HTTPException):
        unlock(db, evaluation, reason="", actor="admin")

    # Unlock creates draft v2 pre-filled
    v2_draft = unlock(db, evaluation, reason="Typo in score", actor="admin")
    assert v2_draft.version == 2
    assert v2_draft.status == "draft"

    # Check prefilled scores and texts
    diff = diff_versions(v1_final, v2_draft, db)
    assert not any(d["changed"] for d in diff["diffs"])

    # Update v2 draft score to 45
    v2_draft, token2 = save_draft(db, evaluation, {"scores": {f1.id: "45"}, "texts": {f2.id: "V2 Feedback"}}, None, "judge")
    v2_final = submit(db, evaluation, token2, "judge")

    assert v2_final.version == 2
    assert v2_final.status == "final"
    assert v2_final.totalPct == Decimal("90.000")

    # v1 is now superseded
    db.refresh(v1_final)
    assert v1_final.status == "superseded"
    assert v1_final.supersededReason == "unlock_resubmit"

    # current_finals returns only v2
    finals = current_finals(db, round_obj)
    assert len(finals) == 1
    assert finals[0].id == v2_final.id

    # If assignment is revoked, current_finals excludes it
    eval_setup["assignment"].status = "revoked"
    db.commit()
    assert len(current_finals(db, round_obj)) == 0


def test_revise_rubric_archive_and_discard_semantics(db, eval_setup):
    round_obj = eval_setup["round"]
    judge = eval_setup["judge"]
    t1 = eval_setup["team1"]
    f1 = eval_setup["fields"]["f1"]
    f2 = eval_setup["fields"]["f2"]

    evaluation = get_or_create_evaluation(db, round_obj, t1.id, judge.id)
    save_draft(db, evaluation, {"scores": {f1.id: "40"}, "texts": {f2.id: "Good"}}, None, "judge")
    v1_final = submit(db, evaluation, None, "judge")

    # Revise rubric: mode 'discard' requires exact round name
    with pytest.raises(HTTPException) as exc_info:
        revise_rubric(db, round_obj, mode="discard", confirm_text="Wrong Name", actor="admin")
    assert exc_info.value.status_code == 400

    # Revise rubric: mode 'archive'
    res = revise_rubric(db, round_obj, mode="archive", confirm_text="", actor="admin")
    assert res["newVersion"] == 2
    assert res["superseded"] == 1
    assert round_obj.currentRubricVersion == 2

    db.refresh(v1_final)
    assert v1_final.status == "superseded"
    assert v1_final.supersededReason == "rubric_revise"

    # New rubric is unpublished; publishing it
    r2_ver = db.query(RubricVersion).filter(RubricVersion.roundId == round_obj.id, RubricVersion.version == 2).first()
    r2_ver.publishedAt = datetime.utcnow()
    db.commit()

    # Draft under rubric v2 pre-fills matching fields
    draft_v2, _ = save_draft(db, evaluation, payload={}, token=None, actor="judge")
    assert draft_v2.version == 2
    assert draft_v2.rubricVersionId == r2_ver.id

    # Verify field pre-fill
    diff = diff_versions(v1_final, draft_v2, db)
    # The pre-filled score for f1 should match v1 (40)
    num_diff = [d for d in diff["diffs"] if d["type"] == "numeric"][0]
    assert num_diff["newMarks"] == "40.00"
