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
    RubricResponse,
    RubricSaveRequest,
    RubricSummaryDTO,
)
from app.models import EvaluationRound, RubricField, RubricVersion, Submission
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
    if rubric_ver and rubric_ver.fields:
        ordered_fields = sorted(rubric_ver.fields, key=lambda f: f.sortOrder)
        for f in ordered_fields:
            rubric_fields_dto.append(
                RubricFieldItemDTO(
                    id=f.id,
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
                "fieldKey": f.fieldKey,
                "type": f.type,
                "label": f.label,
                "maxMarks": f.maxMarks,
                "weight": f.weight,
                "visibility": f.visibility,
            }
        )

    # Compute validation status: weights not 100 is warning during editing
    validation_errs = validate_rubric(fields_data, tie_break_keys=round_obj.tieBreakOrder or [])
    warnings = [e for e in validation_errs if "weights must total exactly 100" in e]
    errors = [e for e in validation_errs if "weights must total exactly 100" not in e]

    return RubricResponse(
        rubricFields=fields_dto,
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
    rubric_ver = save_draft_rubric(db, round_obj, fields_raw, current_user.id)

    # Prepare response with warnings vs errors
    fields_dto = []
    fields_data = []
    for f in sorted(rubric_ver.fields, key=lambda x: x.sortOrder):
        fields_dto.append(
            RubricFieldItemDTO(
                id=f.id,
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
                "fieldKey": f.fieldKey,
                "type": f.type,
                "label": f.label,
                "maxMarks": f.maxMarks,
                "weight": f.weight,
                "visibility": f.visibility,
            }
        )

    validation_errs = validate_rubric(fields_data, tie_break_keys=round_obj.tieBreakOrder or [])
    warnings = [e for e in validation_errs if "weights must total exactly 100" in e]
    errors = [e for e in validation_errs if "weights must total exactly 100" not in e]

    return RubricResponse(
        rubricFields=fields_dto,
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
    return RubricResponse(
        rubricFields=fields_dto,
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
    return RubricResponse(
        rubricFields=fields_dto,
        errors=[],
        warnings=[],
        version=rubric_ver.version,
        published=False,
        locked=rubric_ver.lockedAt is not None,
    )
