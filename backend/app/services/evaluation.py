from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    EvaluationRound,
    RubricVersion,
    RubricField,
    JudgeAssignment,
    Evaluation,
    EvaluationVersion,
    EvaluationScore,
    EvaluationText,
)
from app.routers.admin import log_audit
from app.services.scoring import judge_total_pct


def get_or_create_evaluation(
    db: Session,
    round_obj: EvaluationRound,
    team_id: str,
    judge_volunteer_id: str
) -> Evaluation:
    evaluation = (
        db.query(Evaluation)
        .filter(
            Evaluation.roundId == round_obj.id,
            Evaluation.teamId == team_id,
            Evaluation.judgeVolunteerId == judge_volunteer_id,
        )
        .first()
    )
    if not evaluation:
        evaluation = Evaluation(
            eventId=round_obj.eventId,
            roundId=round_obj.id,
            teamId=team_id,
            judgeVolunteerId=judge_volunteer_id,
            currentVersionId=None,
        )
        db.add(evaluation)
        db.flush()
    return evaluation


def _token_from_version(ver: EvaluationVersion) -> str:
    dt = ver.updatedAt or ver.createdAt or datetime.utcnow()
    return dt.isoformat()


def save_draft(
    db: Session,
    evaluation: Evaluation,
    payload: dict,
    token: Optional[str],
    actor: str
) -> Tuple[EvaluationVersion, str]:
    round_obj = db.query(EvaluationRound).filter(EvaluationRound.id == evaluation.roundId).first()
    if not round_obj:
        raise HTTPException(status_code=404, detail="Round not found")

    if round_obj.status != "live" or not round_obj.evaluationEnabled:
        raise HTTPException(status_code=400, detail="Round is not open for evaluation")

    rubric_ver = (
        db.query(RubricVersion)
        .filter(
            RubricVersion.roundId == round_obj.id,
            RubricVersion.version == round_obj.currentRubricVersion,
        )
        .first()
    )
    if not rubric_ver or rubric_ver.publishedAt is None:
        raise HTTPException(status_code=400, detail="Rubric is not published")

    assignment = (
        db.query(JudgeAssignment)
        .filter(
            JudgeAssignment.roundId == round_obj.id,
            JudgeAssignment.teamId == evaluation.teamId,
            JudgeAssignment.judgeVolunteerId == evaluation.judgeVolunteerId,
            JudgeAssignment.status == "active",
        )
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=403, detail="No active assignment found for this judge and team")

    # Check existing final vs draft
    existing_final = (
        db.query(EvaluationVersion)
        .filter(
            EvaluationVersion.evaluationId == evaluation.id,
            EvaluationVersion.status == "final",
        )
        .first()
    )
    draft = (
        db.query(EvaluationVersion)
        .filter(
            EvaluationVersion.evaluationId == evaluation.id,
            EvaluationVersion.status == "draft",
        )
        .first()
    )

    if existing_final and not draft:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Already submitted. Ask an admin to unlock it."
        )

    now = datetime.utcnow()

    # Lock rubric on the first draft save if not locked
    if rubric_ver.lockedAt is None:
        rubric_ver.lockedAt = now

    rubric_fields_list = (
        db.query(RubricField)
        .filter(RubricField.rubricVersionId == rubric_ver.id)
        .all()
    )
    fields_by_id = {f.id: f for f in rubric_fields_list}
    fields_by_key = {f.fieldKey: f for f in rubric_fields_list}

    if not draft:
        max_v = (
            db.query(func.max(EvaluationVersion.version))
            .filter(EvaluationVersion.evaluationId == evaluation.id)
            .scalar()
            or 0
        )
        draft = EvaluationVersion(
            eventId=evaluation.eventId,
            evaluationId=evaluation.id,
            version=max_v + 1,
            rubricVersionId=rubric_ver.id,
            status="draft",
            createdAt=now,
            updatedAt=now,
        )
        db.add(draft)
        db.flush()

        # If previous completed version exists, selectively pre-fill matching fields
        latest_prev = (
            db.query(EvaluationVersion)
            .filter(
                EvaluationVersion.evaluationId == evaluation.id,
                EvaluationVersion.status.in_(["final", "superseded"]),
            )
            .order_by(EvaluationVersion.version.desc())
            .first()
        )
        if latest_prev:
            prev_fields = {
                f.id: f
                for f in db.query(RubricField)
                .filter(RubricField.rubricVersionId == latest_prev.rubricVersionId)
                .all()
            }
            prev_scores = (
                db.query(EvaluationScore)
                .filter(EvaluationScore.versionId == latest_prev.id)
                .all()
            )
            for ps in prev_scores:
                pf = prev_fields.get(ps.fieldId)
                if pf and pf.fieldKey in fields_by_key:
                    nf = fields_by_key[pf.fieldKey]
                    if nf.type == "numeric" and ps.marks is not None:
                        if Decimal("0") <= ps.marks <= (nf.maxMarks or Decimal("0")):
                            db.add(EvaluationScore(versionId=draft.id, fieldId=nf.id, marks=ps.marks))

            prev_texts = (
                db.query(EvaluationText)
                .filter(EvaluationText.versionId == latest_prev.id)
                .all()
            )
            for pt in prev_texts:
                pf = prev_fields.get(pt.fieldId)
                if pf and pf.fieldKey in fields_by_key:
                    nf = fields_by_key[pf.fieldKey]
                    if nf.type == "text" and pt.value is not None:
                        if nf.maxLength is None or len(pt.value) <= nf.maxLength:
                            db.add(
                                EvaluationText(
                                    versionId=draft.id,
                                    fieldId=nf.id,
                                    value=pt.value,
                                    hiddenByAdmin=pt.hiddenByAdmin,
                                    hiddenBy=pt.hiddenBy,
                                    hiddenAt=pt.hiddenAt,
                                )
                            )
            db.flush()
    else:
        # Optimistic concurrency check
        if token:
            curr_token = _token_from_version(draft)
            if token != curr_token:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This evaluation changed in another tab."
                )

    # Process incoming scores
    scores_input = payload.get("scores", {})
    for fid, val in scores_input.items():
        if fid not in fields_by_id:
            raise HTTPException(status_code=422, detail=f"Invalid field id {fid}")
        field_obj = fields_by_id[fid]
        if field_obj.type != "numeric":
            raise HTTPException(status_code=422, detail=f"Field {fid} is not numeric")

        if val is None or str(val).strip() == "":
            score_row = (
                db.query(EvaluationScore)
                .filter(EvaluationScore.versionId == draft.id, EvaluationScore.fieldId == fid)
                .first()
            )
            if score_row:
                db.delete(score_row)
        else:
            try:
                dec_val = Decimal(str(val))
            except Exception:
                raise HTTPException(status_code=422, detail=f"Invalid numeric score for field {fid}")
            if dec_val < Decimal("0") or (field_obj.maxMarks is not None and dec_val > field_obj.maxMarks):
                raise HTTPException(
                    status_code=422,
                    detail=f"Score for {field_obj.label} must be between 0 and {field_obj.maxMarks}"
                )
            score_row = (
                db.query(EvaluationScore)
                .filter(EvaluationScore.versionId == draft.id, EvaluationScore.fieldId == fid)
                .first()
            )
            if score_row:
                score_row.marks = dec_val
            else:
                db.add(EvaluationScore(versionId=draft.id, fieldId=fid, marks=dec_val))

    # Process incoming texts
    texts_input = payload.get("texts", {})
    for fid, val in texts_input.items():
        if fid not in fields_by_id:
            raise HTTPException(status_code=422, detail=f"Invalid field id {fid}")
        field_obj = fields_by_id[fid]
        if field_obj.type != "text":
            raise HTTPException(status_code=422, detail=f"Field {fid} is not a text field")

        text_str = str(val) if val is not None else ""
        if field_obj.maxLength and len(text_str) > field_obj.maxLength:
            raise HTTPException(
                status_code=422,
                detail=f"Text for {field_obj.label} exceeds max length of {field_obj.maxLength}"
            )

        text_row = (
            db.query(EvaluationText)
            .filter(EvaluationText.versionId == draft.id, EvaluationText.fieldId == fid)
            .first()
        )
        if text_row:
            text_row.value = text_str
        else:
            db.add(EvaluationText(versionId=draft.id, fieldId=fid, value=text_str))

    draft.updatedAt = datetime.utcnow()
    db.flush()

    new_token = _token_from_version(draft)
    log_audit(db, actor, "save_draft", "evaluation_version", draft.id, event_id=evaluation.eventId)
    return draft, new_token


def submit(
    db: Session,
    evaluation: Evaluation,
    token: Optional[str],
    actor: str
) -> EvaluationVersion:
    # Row-lock evaluation
    db.query(Evaluation).filter(Evaluation.id == evaluation.id).with_for_update().first()

    draft = (
        db.query(EvaluationVersion)
        .filter(
            EvaluationVersion.evaluationId == evaluation.id,
            EvaluationVersion.status == "draft",
        )
        .first()
    )

    if not draft:
        final_ver = (
            db.query(EvaluationVersion)
            .filter(
                EvaluationVersion.evaluationId == evaluation.id,
                EvaluationVersion.status == "final",
            )
            .first()
        )
        if final_ver:
            # Idempotency check: submitting already-final version with matching token returns same version
            return final_ver
        raise HTTPException(status_code=400, detail="No draft evaluation found to submit")

    if token:
        curr_token = _token_from_version(draft)
        if token != curr_token:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This evaluation changed in another tab."
            )

    rubric_fields = (
        db.query(RubricField)
        .filter(RubricField.rubricVersionId == draft.rubricVersionId)
        .all()
    )
    scores = {
        s.fieldId: s.marks
        for s in db.query(EvaluationScore).filter(EvaluationScore.versionId == draft.id).all()
    }
    texts = {
        t.fieldId: t.value
        for t in db.query(EvaluationText).filter(EvaluationText.versionId == draft.id).all()
    }

    numeric_fields = [f for f in rubric_fields if f.type == "numeric"]
    for f in numeric_fields:
        if f.id not in scores or scores[f.id] is None:
            raise HTTPException(status_code=400, detail=f"Score required for field: {f.label}")

    for f in rubric_fields:
        if f.type == "text" and f.isRequired:
            val = texts.get(f.id, "")
            if not val or not val.strip():
                raise HTTPException(status_code=400, detail=f"Required text missing for field: {f.label}")

    field_specs = [{"id": f.id, "maxMarks": f.maxMarks, "weight": f.weight} for f in numeric_fields]
    total_pct = judge_total_pct(field_specs, scores)

    now = datetime.utcnow()

    # Set previous final to superseded if any
    prev_final = (
        db.query(EvaluationVersion)
        .filter(
            EvaluationVersion.evaluationId == evaluation.id,
            EvaluationVersion.status == "final",
        )
        .first()
    )
    if prev_final:
        prev_final.status = "superseded"
        prev_final.supersededAt = now
        prev_final.supersededReason = "unlock_resubmit"
        db.flush()

    draft.totalPct = total_pct
    draft.status = "final"
    draft.submittedAt = now
    draft.updatedAt = now
    evaluation.currentVersionId = draft.id

    db.flush()
    log_audit(db, actor, "submit_evaluation", "evaluation_version", draft.id, event_id=evaluation.eventId)
    return draft


def unlock(
    db: Session,
    evaluation: Evaluation,
    reason: str,
    actor: str
) -> EvaluationVersion:
    if not reason or not reason.strip():
        raise HTTPException(status_code=400, detail="Reason is required for unlocking an evaluation")

    draft = (
        db.query(EvaluationVersion)
        .filter(
            EvaluationVersion.evaluationId == evaluation.id,
            EvaluationVersion.status == "draft",
        )
        .first()
    )
    if draft:
        raise HTTPException(status_code=409, detail="A draft already exists for this evaluation")

    final_ver = (
        db.query(EvaluationVersion)
        .filter(
            EvaluationVersion.evaluationId == evaluation.id,
            EvaluationVersion.status == "final",
        )
        .first()
    )
    if not final_ver:
        raise HTTPException(status_code=400, detail="No submitted evaluation to unlock")

    now = datetime.utcnow()
    max_v = (
        db.query(func.max(EvaluationVersion.version))
        .filter(EvaluationVersion.evaluationId == evaluation.id)
        .scalar()
        or 0
    )

    new_draft = EvaluationVersion(
        eventId=evaluation.eventId,
        evaluationId=evaluation.id,
        version=max_v + 1,
        rubricVersionId=final_ver.rubricVersionId,
        status="draft",
        createdAt=now,
        updatedAt=now,
    )
    db.add(new_draft)
    db.flush()

    # Copy scores and texts from final_ver
    for s in db.query(EvaluationScore).filter(EvaluationScore.versionId == final_ver.id).all():
        db.add(EvaluationScore(versionId=new_draft.id, fieldId=s.fieldId, marks=s.marks))

    for t in db.query(EvaluationText).filter(EvaluationText.versionId == final_ver.id).all():
        db.add(
            EvaluationText(
                versionId=new_draft.id,
                fieldId=t.fieldId,
                value=t.value,
                hiddenByAdmin=t.hiddenByAdmin,
                hiddenBy=t.hiddenBy,
                hiddenAt=t.hiddenAt,
            )
        )

    db.flush()
    log_audit(
        db,
        actor,
        "unlock_evaluation",
        "evaluation",
        evaluation.id,
        diff={"reason": reason, "new_draft_version": new_draft.version},
        event_id=evaluation.eventId,
    )
    return new_draft


def revise_rubric(
    db: Session,
    round_obj: EvaluationRound,
    mode: str,
    confirm_text: str,
    actor: str
) -> dict:
    if mode not in ("archive", "discard"):
        raise HTTPException(status_code=400, detail="Mode must be 'archive' or 'discard'")

    curr_rubric = (
        db.query(RubricVersion)
        .filter(
            RubricVersion.roundId == round_obj.id,
            RubricVersion.version == round_obj.currentRubricVersion,
        )
        .first()
    )
    if not curr_rubric or curr_rubric.lockedAt is None:
        raise HTTPException(status_code=400, detail="Rubric is not locked. Edit draft rubric directly.")

    if mode == "discard" and confirm_text != round_obj.name:
        raise HTTPException(
            status_code=400,
            detail=f"Confirmation text must match round name '{round_obj.name}' exactly"
        )

    evaluations = db.query(Evaluation).filter(Evaluation.roundId == round_obj.id).all()
    eval_ids = [e.id for e in evaluations]
    now = datetime.utcnow()
    superseded_count = 0
    discarded_count = 0

    if eval_ids:
        if mode == "archive":
            finals = (
                db.query(EvaluationVersion)
                .filter(
                    EvaluationVersion.evaluationId.in_(eval_ids),
                    EvaluationVersion.status == "final",
                )
                .all()
            )
            for f in finals:
                f.status = "superseded"
                f.supersededAt = now
                f.supersededReason = "rubric_revise"
                superseded_count += 1

            drafts = (
                db.query(EvaluationVersion)
                .filter(
                    EvaluationVersion.evaluationId.in_(eval_ids),
                    EvaluationVersion.status == "draft",
                )
                .all()
            )
            for d in drafts:
                d.status = "discarded"
                discarded_count += 1
        elif mode == "discard":
            all_vers = (
                db.query(EvaluationVersion)
                .filter(
                    EvaluationVersion.evaluationId.in_(eval_ids),
                    EvaluationVersion.status.in_(["draft", "final"]),
                )
                .all()
            )
            for v in all_vers:
                v.status = "discarded"
                discarded_count += 1
            for e in evaluations:
                e.currentVersionId = None

    new_v_num = round_obj.currentRubricVersion + 1
    new_rubric = RubricVersion(
        eventId=round_obj.eventId,
        roundId=round_obj.id,
        version=new_v_num,
        reason=f"revise_{mode}",
        createdBy=actor,
        createdAt=now,
        publishedAt=None,
        lockedAt=None,
    )
    db.add(new_rubric)
    db.flush()

    old_fields = (
        db.query(RubricField)
        .filter(RubricField.rubricVersionId == curr_rubric.id)
        .all()
    )
    for of in old_fields:
        nf = RubricField(
            eventId=round_obj.eventId,
            rubricVersionId=new_rubric.id,
            fieldKey=of.fieldKey,
            type=of.type,
            label=of.label,
            description=of.description,
            sortOrder=of.sortOrder,
            isRequired=of.isRequired,
            maxMarks=of.maxMarks,
            weight=of.weight,
            anchors=of.anchors,
            visibility=of.visibility,
            maxLength=of.maxLength,
        )
        db.add(nf)

    round_obj.currentRubricVersion = new_v_num
    db.flush()

    log_audit(
        db,
        actor,
        "revise_rubric",
        "rubric_version",
        new_rubric.id,
        diff={
            "mode": mode,
            "new_version": new_v_num,
            "superseded": superseded_count,
            "discarded": discarded_count,
        },
        event_id=round_obj.eventId,
    )

    return {
        "newVersion": new_v_num,
        "superseded": superseded_count,
        "discarded": discarded_count,
    }


def current_finals(db: Session, round_obj: EvaluationRound) -> List[EvaluationVersion]:
    """Finals of the current rubric version from active assignments only."""
    curr_rubric = (
        db.query(RubricVersion)
        .filter(
            RubricVersion.roundId == round_obj.id,
            RubricVersion.version == round_obj.currentRubricVersion,
        )
        .first()
    )
    if not curr_rubric:
        return []

    return (
        db.query(EvaluationVersion)
        .join(Evaluation, EvaluationVersion.evaluationId == Evaluation.id)
        .join(
            JudgeAssignment,
            (Evaluation.roundId == JudgeAssignment.roundId)
            & (Evaluation.teamId == JudgeAssignment.teamId)
            & (Evaluation.judgeVolunteerId == JudgeAssignment.judgeVolunteerId),
        )
        .filter(
            Evaluation.roundId == round_obj.id,
            EvaluationVersion.rubricVersionId == curr_rubric.id,
            EvaluationVersion.status == "final",
            JudgeAssignment.status == "active",
        )
        .all()
    )


def diff_versions(
    v_old: Optional[EvaluationVersion],
    v_new: EvaluationVersion,
    db: Session
) -> dict:
    """Per-field before and after for the audit trail."""
    new_fields = {
        f.id: f
        for f in db.query(RubricField).filter(RubricField.rubricVersionId == v_new.rubricVersionId).all()
    }
    new_scores = {
        s.fieldId: s.marks
        for s in db.query(EvaluationScore).filter(EvaluationScore.versionId == v_new.id).all()
    }
    new_texts = {
        t.fieldId: t.value
        for t in db.query(EvaluationText).filter(EvaluationText.versionId == v_new.id).all()
    }

    old_scores: Dict[str, Optional[Decimal]] = {}
    old_texts: Dict[str, Optional[str]] = {}
    old_fields_by_key = {}
    if v_old:
        old_fields = {
            f.id: f
            for f in db.query(RubricField).filter(RubricField.rubricVersionId == v_old.rubricVersionId).all()
        }
        old_fields_by_key = {f.fieldKey: f for f in old_fields.values()}
        old_scores = {
            s.fieldId: s.marks
            for s in db.query(EvaluationScore).filter(EvaluationScore.versionId == v_old.id).all()
        }
        old_texts = {
            t.fieldId: t.value
            for t in db.query(EvaluationText).filter(EvaluationText.versionId == v_old.id).all()
        }

    diffs = []
    for fid, f in sorted(new_fields.items(), key=lambda item: item[1].sortOrder or 0):
        old_f = old_fields_by_key.get(f.fieldKey)
        old_mark = old_scores.get(old_f.id) if old_f else None
        new_mark = new_scores.get(fid)
        old_text = old_texts.get(old_f.id) if old_f else None
        new_text = new_texts.get(fid)

        changed = False
        if f.type == "numeric":
            changed = old_mark != new_mark
        else:
            changed = old_text != new_text

        diffs.append({
            "fieldKey": f.fieldKey,
            "label": f.label,
            "type": f.type,
            "oldMarks": str(old_mark) if old_mark is not None else None,
            "newMarks": str(new_mark) if new_mark is not None else None,
            "oldText": old_text,
            "newText": new_text,
            "changed": changed,
        })

    return {
        "oldVersion": v_old.version if v_old else None,
        "newVersion": v_new.version,
        "oldTotalPct": str(v_old.totalPct) if v_old and v_old.totalPct is not None else None,
        "newTotalPct": str(v_new.totalPct) if v_new.totalPct is not None else None,
        "diffs": diffs,
    }
