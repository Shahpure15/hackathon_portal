from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dto.rounds import (
    RoundCreateRequest,
    RoundDetailDTO,
    RoundListItemDTO,
    RoundUpdateRequest,
    RubricFieldItemDTO,
    RubricPSGuidanceDTO,
    RubricResponse,
    RubricSaveRequest,
    RubricSummaryDTO,
)
from app.models import EvaluationRound, RubricField, RubricVersion, Submission, Team
from app.rbac import Principal, require_permission
from app.routers.admin import log_audit
from app.services.features import get_event_features
from app.services.rubric import (
    get_current_rubric,
    is_locked,
    publish_rubric,
    save_draft_rubric,
    unpublish_rubric,
)
from app.services.scoring import validate_rubric

router = APIRouter(prefix="/admin/rounds", tags=["Rounds Admin"])


def _build_rubric_summary(rubric_ver: Optional[RubricVersion]) -> RubricSummaryDTO:
    if not rubric_ver:
        return RubricSummaryDTO(version=0, fieldCount=0, published=False, locked=False)
    return RubricSummaryDTO(
        version=rubric_ver.version,
        fieldCount=len(rubric_ver.fields) if rubric_ver.fields else 0,
        published=rubric_ver.publishedAt is not None,
        locked=rubric_ver.lockedAt is not None,
    )


def _build_round_detail(round_obj: EvaluationRound, db: Session) -> RoundDetailDTO:
    sub_count = db.query(Submission).filter(Submission.roundId == round_obj.id).count()
    rubric_ver = get_current_rubric(db, round_obj)
    rubric_summary = _build_rubric_summary(rubric_ver)

    rubric_fields_dto = []
    guidance_dto = []
    if rubric_ver:
        if rubric_ver.fields:
            ordered_fields = sorted(rubric_ver.fields, key=lambda f: f.sortOrder)
            for f in ordered_fields:
                rubric_fields_dto.append(
                    RubricFieldItemDTO(
                        id=f.id,
                        problemStatementId=f.problemStatementId,
                        fieldKey=f.fieldKey,
                        type=f.type,
                        label=f.label,
                        description=f.description,
                        sortOrder=f.sortOrder,
                        isRequired=f.isRequired,
                        maxMarks=f.maxMarks,
                        weight=f.weight,
                        anchors=f.anchors,
                        visibility=f.visibility,
                        maxLength=f.maxLength,
                    )
                )
        if rubric_ver.guidances:
            guidance_dto = [RubricPSGuidanceDTO.from_orm(g) for g in rubric_ver.guidances]

    return RoundDetailDTO(
        id=round_obj.id,
        name=round_obj.name,
        description=round_obj.description,
        number=round_obj.roundNumber,
        status=round_obj.status,
        submissionEnabled=round_obj.submissionEnabled,
        evaluationEnabled=round_obj.evaluationEnabled,
        isSubmissionOpen=round_obj.isSubmissionOpen,
        opensAt=round_obj.opensAt,
        closesAt=round_obj.closesAt,
        aggregation=round_obj.aggregation,
        trimCount=round_obj.trimCount,
        totalScale=round_obj.totalScale,
        tieBreakOrder=round_obj.tieBreakOrder,
        eligibility=round_obj.eligibility,
        coiRule=round_obj.coiRule,
        resultsConfig=round_obj.resultsConfig,
        submissionFields=round_obj.fields or [],
        submissionCount=sub_count,
        rubricSummary=rubric_summary,
        rubricFields=rubric_fields_dto,
        guidance=guidance_dto,
    )


@router.get("", response_model=List[RoundListItemDTO])
def list_rounds(
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("round.view")),
):
    rounds = (
        db.query(EvaluationRound)
        .filter(EvaluationRound.eventId == current_user.eventId)
        .order_by(EvaluationRound.roundNumber)
        .all()
    )

    result: List[RoundListItemDTO] = []
    for r in rounds:
        count = db.query(Submission).filter(Submission.roundId == r.id).count()
        rubric_ver = get_current_rubric(db, r)
        summary = _build_rubric_summary(rubric_ver)
        result.append(
            RoundListItemDTO(
                id=r.id,
                name=r.name,
                description=r.description,
                number=r.roundNumber,
                status=r.status,
                submissionEnabled=r.submissionEnabled,
                evaluationEnabled=r.evaluationEnabled,
                isSubmissionOpen=r.isSubmissionOpen,
                opensAt=r.opensAt,
                closesAt=r.closesAt,
                submissionCount=count,
                rubricSummary=summary,
            )
        )
    return result


@router.post("", response_model=RoundDetailDTO, status_code=status.HTTP_201_CREATED)
def create_round(
    payload: RoundCreateRequest,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("round.manage")),
):
    # At least one of the two switches must be true (422)
    if not payload.submissionEnabled and not payload.evaluationEnabled:
        raise HTTPException(
            status_code=422,
            detail="At least one of submissionEnabled or evaluationEnabled must be true.",
        )

    # evaluationEnabled with features.evaluation false is 409
    if payload.evaluationEnabled:
        features = get_event_features(db, current_user.eventId)
        if not features.evaluation:
            raise HTTPException(
                status_code=409,
                detail="Evaluation feature is disabled for this event.",
            )

    # Determine roundNumber
    if payload.number is not None:
        existing = (
            db.query(EvaluationRound)
            .filter(
                EvaluationRound.eventId == current_user.eventId,
                EvaluationRound.roundNumber == payload.number,
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Round number {payload.number} already exists.",
            )
        round_num = payload.number
    else:
        max_num = (
            db.query(func.max(EvaluationRound.roundNumber))
            .filter(EvaluationRound.eventId == current_user.eventId)
            .scalar()
        )
        round_num = (max_num or 0) + 1

    round_obj = EvaluationRound(
        eventId=current_user.eventId,
        name=payload.name,
        roundNumber=round_num,
        description=payload.description,
        fields=payload.submissionFields if payload.submissionFields is not None else [],
        isSubmissionOpen=payload.isSubmissionOpen,
        status=payload.status or "live",
        submissionEnabled=payload.submissionEnabled,
        evaluationEnabled=payload.evaluationEnabled,
        opensAt=payload.opensAt,
        closesAt=payload.closesAt,
        aggregation=payload.aggregation or "mean",
        trimCount=payload.trimCount if payload.trimCount is not None else 1,
        totalScale=payload.totalScale if payload.totalScale is not None else 100,
        tieBreakOrder=payload.tieBreakOrder,
        eligibility=payload.eligibility,
        coiRule=payload.coiRule,
        resultsConfig=payload.resultsConfig,
    )
    db.add(round_obj)
    db.flush()

    log_audit(
        db,
        current_user.id,
        "round.created",
        "EvaluationRound",
        round_obj.id,
        {"name": round_obj.name, "roundNumber": round_obj.roundNumber},
        event_id=current_user.eventId,
    )
    db.commit()
    db.refresh(round_obj)
    return _build_round_detail(round_obj, db)


@router.get("/{round_id}", response_model=RoundDetailDTO)
def get_round_detail(
    round_id: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("round.view")),
):
    round_obj = (
        db.query(EvaluationRound)
        .filter(
            EvaluationRound.id == round_id,
            EvaluationRound.eventId == current_user.eventId,
        )
        .first()
    )
    if not round_obj:
        raise HTTPException(status_code=404, detail="Evaluation round not found")
    return _build_round_detail(round_obj, db)


@router.put("/{round_id}", response_model=RoundDetailDTO)
def update_round(
    round_id: str,
    payload: RoundUpdateRequest,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("round.manage")),
):
    round_obj = (
        db.query(EvaluationRound)
        .filter(
            EvaluationRound.id == round_id,
            EvaluationRound.eventId == current_user.eventId,
        )
        .first()
    )
    if not round_obj:
        raise HTTPException(status_code=404, detail="Evaluation round not found")

    rubric_ver = get_current_rubric(db, round_obj)
    rubric_locked = is_locked(rubric_ver)

    # Turning evaluationEnabled off is 409 when the rubric is locked
    if payload.evaluationEnabled is False and round_obj.evaluationEnabled and rubric_locked:
        raise HTTPException(
            status_code=409,
            detail="Cannot disable evaluation when the rubric is locked.",
        )

    # Turning evaluationEnabled on when feature is off is 409
    if payload.evaluationEnabled is True and not round_obj.evaluationEnabled:
        features = get_event_features(db, current_user.eventId)
        if not features.evaluation:
            raise HTTPException(
                status_code=409,
                detail="Evaluation feature is disabled for this event.",
            )

    # Check that at least one switch remains enabled if switches are being updated
    next_sub = payload.submissionEnabled if payload.submissionEnabled is not None else round_obj.submissionEnabled
    next_eval = payload.evaluationEnabled if payload.evaluationEnabled is not None else round_obj.evaluationEnabled
    if not next_sub and not next_eval:
        raise HTTPException(
            status_code=422,
            detail="At least one of submissionEnabled or evaluationEnabled must be true.",
        )

    diff = {}
    if payload.name is not None and payload.name != round_obj.name:
        diff["name"] = payload.name
        round_obj.name = payload.name
    if payload.description is not None:
        round_obj.description = payload.description
    if payload.number is not None and payload.number != round_obj.roundNumber:
        existing = (
            db.query(EvaluationRound)
            .filter(
                EvaluationRound.eventId == current_user.eventId,
                EvaluationRound.roundNumber == payload.number,
                EvaluationRound.id != round_id,
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail=f"Round number {payload.number} already exists.")
        diff["roundNumber"] = payload.number
        round_obj.roundNumber = payload.number
    if payload.status is not None:
        round_obj.status = payload.status
    if payload.submissionEnabled is not None:
        round_obj.submissionEnabled = payload.submissionEnabled
    if payload.evaluationEnabled is not None:
        round_obj.evaluationEnabled = payload.evaluationEnabled
    if payload.isSubmissionOpen is not None:
        round_obj.isSubmissionOpen = payload.isSubmissionOpen
    if payload.opensAt is not None:
        round_obj.opensAt = payload.opensAt
    if payload.closesAt is not None:
        round_obj.closesAt = payload.closesAt
    if payload.aggregation is not None:
        round_obj.aggregation = payload.aggregation
    if payload.trimCount is not None:
        round_obj.trimCount = payload.trimCount
    if payload.totalScale is not None:
        round_obj.totalScale = payload.totalScale
    if payload.tieBreakOrder is not None:
        round_obj.tieBreakOrder = payload.tieBreakOrder
    if payload.eligibility is not None:
        mode = payload.eligibility.get("mode")
        if mode == "advanced_from":
            from_rid = payload.eligibility.get("fromRoundId")
            if not from_rid:
                raise HTTPException(status_code=422, detail="fromRoundId is required when eligibility mode is advanced_from.")
            from_round = (
                db.query(EvaluationRound)
                .filter(
                    EvaluationRound.id == from_rid,
                    EvaluationRound.eventId == current_user.eventId,
                )
                .first()
            )
            if not from_round:
                raise HTTPException(status_code=422, detail="fromRoundId must belong to the same event.")
            if from_round.roundNumber >= round_obj.roundNumber:
                raise HTTPException(status_code=422, detail="fromRoundId must have a lower roundNumber than the current round.")
        elif mode == "manual":
            team_ids = payload.eligibility.get("teamIds") or []
            if team_ids:
                event_team_count = (
                    db.query(Team)
                    .filter(Team.id.in_(team_ids), Team.eventId == current_user.eventId)
                    .count()
                )
                if event_team_count != len(set(team_ids)):
                    raise HTTPException(status_code=422, detail="All manual eligibility team IDs must belong to the event.")
        round_obj.eligibility = payload.eligibility
    if payload.coiRule is not None:
        round_obj.coiRule = payload.coiRule
    if payload.resultsConfig is not None:
        round_obj.resultsConfig = payload.resultsConfig
    if payload.submissionFields is not None:
        round_obj.fields = payload.submissionFields

    log_audit(
        db,
        current_user.id,
        "round.updated",
        "EvaluationRound",
        round_obj.id,
        diff,
        event_id=current_user.eventId,
    )
    db.commit()
    db.refresh(round_obj)
    return _build_round_detail(round_obj, db)


@router.delete("/{round_id}")
def delete_round(
    round_id: str,
    confirmDeleteSubmissions: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("round.manage")),
):
    round_obj = (
        db.query(EvaluationRound)
        .filter(
            EvaluationRound.id == round_id,
            EvaluationRound.eventId == current_user.eventId,
        )
        .first()
    )
    if not round_obj:
        raise HTTPException(status_code=404, detail="Evaluation round not found")

    rubric_ver = get_current_rubric(db, round_obj)
    if is_locked(rubric_ver):
        raise HTTPException(
            status_code=409,
            detail="Cannot delete round when the rubric is locked.",
        )

    sub_count = db.query(Submission).filter(Submission.roundId == round_obj.id).count()
    if sub_count > 0 and not confirmDeleteSubmissions:
        raise HTTPException(
            status_code=409,
            detail=f"Round has {sub_count} submissions. Pass confirmDeleteSubmissions=true to delete.",
        )

    round_name = round_obj.name
    db.delete(round_obj)
    log_audit(
        db,
        current_user.id,
        "round.deleted",
        "EvaluationRound",
        round_id,
        {"name": round_name, "submissionsDeleted": sub_count},
        event_id=current_user.eventId,
    )
    db.commit()
    return {"success": True}


@router.get("/{round_id}/rubric", response_model=RubricResponse)
def get_round_rubric(
    round_id: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("round.view")),
):
    round_obj = (
        db.query(EvaluationRound)
        .filter(
            EvaluationRound.id == round_id,
            EvaluationRound.eventId == current_user.eventId,
        )
        .first()
    )
    if not round_obj:
        raise HTTPException(status_code=404, detail="Evaluation round not found")

    rubric_ver = get_current_rubric(db, round_obj)
    if not rubric_ver:
        return RubricResponse(
            rubricFields=[],
            guidance=[],
            errors=[],
            warnings=[],
            version=0,
            published=False,
            locked=False,
        )

    fields_dto = []
    fields_data = []
    for f in sorted(rubric_ver.fields, key=lambda x: x.sortOrder):
        fields_dto.append(
            RubricFieldItemDTO(
                id=f.id,
                problemStatementId=f.problemStatementId,
                fieldKey=f.fieldKey,
                type=f.type,
                label=f.label,
                description=f.description,
                sortOrder=f.sortOrder,
                isRequired=f.isRequired,
                maxMarks=f.maxMarks,
                weight=f.weight,
                anchors=f.anchors,
                visibility=f.visibility,
                maxLength=f.maxLength,
            )
        )
        fields_data.append(
            {
                "id": f.id,
                "problemStatementId": f.problemStatementId,
                "fieldKey": f.fieldKey,
                "type": f.type,
                "label": f.label,
                "maxMarks": f.maxMarks,
                "weight": f.weight,
                "visibility": f.visibility,
            }
        )

    guidance_dto = [RubricPSGuidanceDTO.from_orm(g) for g in (rubric_ver.guidances or [])]

    # Compute validation status: weights not 100 is warning during editing
    validation_errs = validate_rubric(fields_data, tie_break_keys=round_obj.tieBreakOrder or [])
    warnings = [e for e in validation_errs if "weights must total exactly" in e]
    errors = [e for e in validation_errs if "weights must total exactly" not in e]

    return RubricResponse(
        rubricFields=fields_dto,
        guidance=guidance_dto,
        errors=errors,
        warnings=warnings,
        version=rubric_ver.version,
        published=rubric_ver.publishedAt is not None,
        locked=rubric_ver.lockedAt is not None,
    )


@router.put("/{round_id}/rubric", response_model=RubricResponse)
def update_round_rubric(
    round_id: str,
    payload: RubricSaveRequest,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("round.manage")),
):
    round_obj = (
        db.query(EvaluationRound)
        .filter(
            EvaluationRound.id == round_id,
            EvaluationRound.eventId == current_user.eventId,
        )
        .first()
    )
    if not round_obj:
        raise HTTPException(status_code=404, detail="Evaluation round not found")

    fields_raw = [f.dict() for f in payload.rubricFields]
    guidance_payload = [g.dict() for g in payload.guidance] if payload.guidance is not None else None
    rubric_ver = save_draft_rubric(db, round_obj, fields_raw, current_user.id, guidance_payload=guidance_payload)

    # Prepare response with warnings vs errors
    fields_dto = []
    fields_data = []
    for f in sorted(rubric_ver.fields, key=lambda x: x.sortOrder):
        fields_dto.append(
            RubricFieldItemDTO(
                id=f.id,
                problemStatementId=f.problemStatementId,
                fieldKey=f.fieldKey,
                type=f.type,
                label=f.label,
                description=f.description,
                sortOrder=f.sortOrder,
                isRequired=f.isRequired,
                maxMarks=f.maxMarks,
                weight=f.weight,
                anchors=f.anchors,
                visibility=f.visibility,
                maxLength=f.maxLength,
            )
        )
        fields_data.append(
            {
                "id": f.id,
                "problemStatementId": f.problemStatementId,
                "fieldKey": f.fieldKey,
                "type": f.type,
                "label": f.label,
                "maxMarks": f.maxMarks,
                "weight": f.weight,
                "visibility": f.visibility,
            }
        )

    guidance_dto = [RubricPSGuidanceDTO.from_orm(g) for g in (rubric_ver.guidances or [])]

    validation_errs = validate_rubric(fields_data, tie_break_keys=round_obj.tieBreakOrder or [])
    warnings = [e for e in validation_errs if "weights must total exactly" in e]
    errors = [e for e in validation_errs if "weights must total exactly" not in e]

    return RubricResponse(
        rubricFields=fields_dto,
        guidance=guidance_dto,
        errors=errors,
        warnings=warnings,
        version=rubric_ver.version,
        published=rubric_ver.publishedAt is not None,
        locked=rubric_ver.lockedAt is not None,
    )


@router.post("/{round_id}/publish", response_model=RubricResponse)
def publish_round_rubric(
    round_id: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("round.manage")),
):
    round_obj = (
        db.query(EvaluationRound)
        .filter(
            EvaluationRound.id == round_id,
            EvaluationRound.eventId == current_user.eventId,
        )
        .first()
    )
    if not round_obj:
        raise HTTPException(status_code=404, detail="Evaluation round not found")

    rubric_ver = publish_rubric(db, round_obj, current_user.id)
    fields_dto = [
        RubricFieldItemDTO(
            id=f.id,
            problemStatementId=f.problemStatementId,
            fieldKey=f.fieldKey,
            type=f.type,
            label=f.label,
            description=f.description,
            sortOrder=f.sortOrder,
            isRequired=f.isRequired,
            maxMarks=f.maxMarks,
            weight=f.weight,
            anchors=f.anchors,
            visibility=f.visibility,
            maxLength=f.maxLength,
        )
        for f in sorted(rubric_ver.fields, key=lambda x: x.sortOrder)
    ]
    guidance_dto = [RubricPSGuidanceDTO.from_orm(g) for g in (rubric_ver.guidances or [])]
    return RubricResponse(
        rubricFields=fields_dto,
        guidance=guidance_dto,
        errors=[],
        warnings=[],
        version=rubric_ver.version,
        published=True,
        locked=rubric_ver.lockedAt is not None,
    )


@router.post("/{round_id}/unpublish", response_model=RubricResponse)
def unpublish_round_rubric(
    round_id: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("round.manage")),
):
    round_obj = (
        db.query(EvaluationRound)
        .filter(
            EvaluationRound.id == round_id,
            EvaluationRound.eventId == current_user.eventId,
        )
        .first()
    )
    if not round_obj:
        raise HTTPException(status_code=404, detail="Evaluation round not found")

    rubric_ver = unpublish_rubric(db, round_obj, current_user.id)
    fields_dto = [
        RubricFieldItemDTO(
            id=f.id,
            problemStatementId=f.problemStatementId,
            fieldKey=f.fieldKey,
            type=f.type,
            label=f.label,
            description=f.description,
            sortOrder=f.sortOrder,
            isRequired=f.isRequired,
            maxMarks=f.maxMarks,
            weight=f.weight,
            anchors=f.anchors,
            visibility=f.visibility,
            maxLength=f.maxLength,
        )
        for f in sorted(rubric_ver.fields, key=lambda x: x.sortOrder)
    ]
    guidance_dto = [RubricPSGuidanceDTO.from_orm(g) for g in (rubric_ver.guidances or [])]
    return RubricResponse(
        rubricFields=fields_dto,
        guidance=guidance_dto,
        errors=[],
        warnings=[],
        version=rubric_ver.version,
        published=False,
        locked=rubric_ver.lockedAt is not None,
    )


@router.get("/{round_id}/preflight")
def get_round_preflight(
    round_id: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("round.view")),
):
    round_obj = (
        db.query(EvaluationRound)
        .filter(
            EvaluationRound.id == round_id,
            EvaluationRound.eventId == current_user.eventId,
        )
        .first()
    )
    if not round_obj:
        raise HTTPException(status_code=404, detail="Evaluation round not found")

    issues = []
    rubric_ver = get_current_rubric(db, round_obj)
    if not rubric_ver:
        issues.append("No current rubric version configured for round.")
    elif rubric_ver.publishedAt is None:
        issues.append(f"Rubric Version {rubric_ver.version} is not published.")

    fields = db.query(RubricField).filter(RubricField.rubricVersionId == rubric_ver.id).all() if rubric_ver else []
    guidances = db.query(RubricPSGuidance).filter(RubricPSGuidance.rubricVersionId == rubric_ver.id).all() if rubric_ver else []

    general_numeric = [f for f in fields if f.type == "numeric" and f.problemStatementId is None]
    gen_sum = sum(f.maxMarks for f in general_numeric)
    if gen_sum != 60 and rubric_ver:
        issues.append(f"General numeric criteria total {gen_sum} marks, expected exactly 60.")

    ps_guidance_map = {g.problemStatementId: g for g in guidances}
    ps_grouped = {}
    for f in fields:
        if f.problemStatementId is not None:
            ps_grouped.setdefault(f.problemStatementId, []).append(f)

    for ps_id, ps_fields in ps_grouped.items():
        num_fields = [f for f in ps_fields if f.type == "numeric"]
        ps_sum = sum(f.maxMarks for f in num_fields)
        if ps_sum != 40:
            issues.append(f"PS {ps_id} criteria total {ps_sum} marks, expected exactly 40.")
        if ps_id not in ps_guidance_map:
            issues.append(f"PS {ps_id} is missing Decisive Test guidance.")

    assignments = (
        db.query(JudgeAssignment)
        .filter(JudgeAssignment.roundId == round_obj.id, JudgeAssignment.status == "active")
        .all()
    )
    assigned_team_ids = {a.teamId for a in assignments}
    missing_ps_teams = []
    for tid in assigned_team_ids:
        sel = db.query(PSSelection).filter(PSSelection.teamId == tid).first()
        if not sel or not sel.psId:
            team = db.query(Team).filter(Team.id == tid).first()
            missing_ps_teams.append(team.name if team else tid)

    if missing_ps_teams:
        issues.append(f"Teams with active assignments missing PS selection: {missing_ps_teams}")

    assigned_judge_ids = {a.judgeVolunteerId for a in assignments}
    unqualified_judges = []
    for jid in assigned_judge_ids:
        vol = db.query(Volunteer).filter(Volunteer.id == jid).first()
        if not vol or vol.type != "JUDGE":
            unqualified_judges.append(f"Volunteer {jid} not of type JUDGE")
            continue
        user = db.query(User).filter(User.volunteerId == vol.id).first()
        if not user or user.status != "active":
            unqualified_judges.append(f"Judge '{vol.name}' has no active user account")
            continue
        role_assigns = db.query(UserRoleAssignment).filter(UserRoleAssignment.userId == user.id).all()
        role_ids = [ra.roleId for ra in role_assigns]
        has_score_perm = db.query(RolePermission).filter(
            RolePermission.roleId.in_(role_ids),
            RolePermission.permissionKey == "evaluation.score"
        ).first()
        if not has_score_perm:
            unqualified_judges.append(f"Judge '{vol.name}' lacks 'evaluation.score' permission")

    if unqualified_judges:
        issues.extend(unqualified_judges)

    return {
        "status": "PASS" if not issues else "FAIL",
        "round": {
            "id": round_obj.id,
            "name": round_obj.name,
            "number": round_obj.roundNumber,
            "status": round_obj.status,
            "evaluationEnabled": round_obj.evaluationEnabled,
        },
        "rubric": {
            "version": rubric_ver.version if rubric_ver else None,
            "published": rubric_ver.publishedAt is not None if rubric_ver else False,
            "generalMarks": float(gen_sum),
            "psCount": len(ps_grouped),
            "guidanceCount": len(guidances),
        },
        "teams": {
            "assigned": len(assigned_team_ids),
            "missingPsCount": len(missing_ps_teams),
        },
        "judges": {
            "distinctJudges": len(assigned_judge_ids),
            "totalAssignments": len(assignments),
        },
        "issues": issues,
    }
