import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, List, Optional, Sequence
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import EvaluationRound, RubricField, RubricVersion
from app.routers.admin import log_audit
from app.services.scoring import validate_rubric


def is_locked(version: Optional[RubricVersion]) -> bool:
    """Returns True if the rubric version is locked (i.e. lockedAt is set)."""
    return version is not None and version.lockedAt is not None


def get_current_rubric(db: Session, round_obj: EvaluationRound) -> Optional[RubricVersion]:
    """Returns the current RubricVersion instance for the round, or None if not created."""
    if not round_obj.currentRubricVersion or round_obj.currentRubricVersion <= 0:
        return None
    return (
        db.query(RubricVersion)
        .filter(
            RubricVersion.roundId == round_obj.id,
            RubricVersion.version == round_obj.currentRubricVersion,
        )
        .first()
    )


def _validate_anchors(anchors: Any, max_marks: Optional[Decimal]) -> None:
    """Validates anchors: [{'from': n, 'to': n, 'label': str}] with 0 <= from <= to <= maxMarks."""
    if anchors is None:
        return
    if not isinstance(anchors, list):
        raise HTTPException(status_code=422, detail="Anchors must be a list of objects.")
    for a in anchors:
        if not isinstance(a, dict):
            raise HTTPException(status_code=422, detail="Each anchor must be an object.")
        frm = a.get('from')
        to = a.get('to')
        lbl = a.get('label')
        if frm is None or to is None or not lbl or not str(lbl).strip():
            raise HTTPException(status_code=422, detail="Anchor must specify valid 'from', 'to', and non-empty 'label'.")
        try:
            d_from = Decimal(str(frm))
            d_to = Decimal(str(to))
        except Exception:
            raise HTTPException(status_code=422, detail="Anchor 'from' and 'to' must be numeric values.")
        if d_from < 0:
            raise HTTPException(status_code=422, detail="Anchor 'from' cannot be negative.")
        if d_from > d_to:
            raise HTTPException(status_code=422, detail="Anchor 'from' cannot exceed 'to'.")
        if max_marks is not None and d_to > max_marks:
            raise HTTPException(
                status_code=422,
                detail=f"Anchor 'to' ({d_to}) cannot exceed field maxMarks ({max_marks}).",
            )


def save_draft_rubric(
    db: Session,
    round_obj: EvaluationRound,
    fields_payload: Sequence[dict],
    actor_id: str,
) -> RubricVersion:
    """Saves a draft rubric. Creates version 1 if absent, handles field key stability and lock rules."""
    rubric_ver = None
    if round_obj.currentRubricVersion and round_obj.currentRubricVersion > 0:
        rubric_ver = (
            db.query(RubricVersion)
            .filter(
                RubricVersion.roundId == round_obj.id,
                RubricVersion.version == round_obj.currentRubricVersion,
            )
            .first()
        )

    if not rubric_ver:
        # Rule 1: with no rubric yet, create version 1 (reason='initial') and set round.currentRubricVersion = 1
        rubric_ver = RubricVersion(
            eventId=round_obj.eventId,
            roundId=round_obj.id,
            version=1,
            reason='initial',
            createdBy=actor_id,
        )
        db.add(rubric_ver)
        round_obj.currentRubricVersion = 1
        db.flush()

    existing_fields = (
        db.query(RubricField)
        .filter(RubricField.rubricVersionId == rubric_ver.id)
        .order_by(RubricField.sortOrder)
        .all()
    )
    existing_map = {f.fieldKey: f for f in existing_fields}

    if is_locked(rubric_ver):
        # Rule 3: When locked, only description and anchors may change
        if len(fields_payload) != len(existing_fields):
            raise HTTPException(status_code=409, detail="The rubric is locked. Use Revise to change it.")

        payload_keys = set()
        for idx, fp in enumerate(fields_payload):
            fk = fp.get('fieldKey') or fp.get('id')
            if not fk or fk not in existing_map:
                raise HTTPException(status_code=409, detail="The rubric is locked. Use Revise to change it.")
            payload_keys.add(fk)
            orig = existing_map[fk]

            # Structural / scoring immutability checks
            if orig.type != fp.get('type'):
                raise HTTPException(status_code=409, detail="The rubric is locked. Use Revise to change it.")
            if orig.label != fp.get('label'):
                raise HTTPException(status_code=409, detail="The rubric is locked. Use Revise to change it.")
            if orig.sortOrder != fp.get('sortOrder', idx):
                raise HTTPException(status_code=409, detail="The rubric is locked. Use Revise to change it.")
            if orig.isRequired != fp.get('isRequired', True):
                raise HTTPException(status_code=409, detail="The rubric is locked. Use Revise to change it.")
            if orig.visibility != fp.get('visibility'):
                raise HTTPException(status_code=409, detail="The rubric is locked. Use Revise to change it.")
            if orig.maxLength != fp.get('maxLength'):
                raise HTTPException(status_code=409, detail="The rubric is locked. Use Revise to change it.")

            orig_max = orig.maxMarks
            fp_max = Decimal(str(fp['maxMarks'])) if fp.get('maxMarks') is not None else None
            if orig_max != fp_max:
                raise HTTPException(status_code=409, detail="The rubric is locked. Use Revise to change it.")

            orig_w = orig.weight
            fp_w = Decimal(str(fp['weight'])) if fp.get('weight') is not None else None
            if orig_w != fp_w:
                raise HTTPException(status_code=409, detail="The rubric is locked. Use Revise to change it.")

            # Description and anchors are permitted to update
            _validate_anchors(fp.get('anchors'), orig.maxMarks)
            orig.description = fp.get('description')
            orig.anchors = fp.get('anchors')

        if payload_keys != set(existing_map.keys()):
            raise HTTPException(status_code=409, detail="The rubric is locked. Use Revise to change it.")

    else:
        # Rule 2: Unlocked - replace fields in one transaction. Preserve existing fieldKey; generate uuid4 for new ones.
        for ef in existing_fields:
            db.delete(ef)
        db.flush()

        for idx, fp in enumerate(fields_payload):
            fk = fp.get('fieldKey') or fp.get('id')
            if not fk:
                fk = str(uuid.uuid4())

            mx = Decimal(str(fp['maxMarks'])) if fp.get('maxMarks') is not None else None
            w = Decimal(str(fp['weight'])) if fp.get('weight') is not None else None
            anchors = fp.get('anchors')
            if anchors is not None:
                _validate_anchors(anchors, mx)

            rf = RubricField(
                eventId=round_obj.eventId,
                rubricVersionId=rubric_ver.id,
                fieldKey=fk,
                type=fp.get('type', 'numeric'),
                label=fp.get('label', ''),
                description=fp.get('description'),
                sortOrder=fp.get('sortOrder', idx),
                isRequired=fp.get('isRequired', True),
                maxMarks=mx,
                weight=w,
                anchors=anchors,
                visibility=fp.get('visibility'),
                maxLength=fp.get('maxLength'),
            )
            db.add(rf)

    log_audit(
        db,
        actor_id,
        'round.rubric_saved',
        'EvaluationRound',
        round_obj.id,
        {'version': rubric_ver.version, 'fieldCount': len(fields_payload)},
        event_id=round_obj.eventId,
    )
    db.commit()
    db.refresh(rubric_ver)
    return rubric_ver


def publish_rubric(db: Session, round_obj: EvaluationRound, actor_id: str) -> RubricVersion:
    """Validates and publishes the current rubric for the round."""
    if not round_obj.evaluationEnabled:
        raise HTTPException(
            status_code=400,
            detail="Evaluation must be enabled on the round to publish a rubric.",
        )

    rubric_ver = get_current_rubric(db, round_obj)
    if not rubric_ver:
        raise HTTPException(status_code=404, detail="No rubric version found for this round.")

    fields_data = [
        {
            'id': f.id,
            'fieldKey': f.fieldKey,
            'type': f.type,
            'label': f.label,
            'maxMarks': f.maxMarks,
            'weight': f.weight,
            'visibility': f.visibility,
        }
        for f in rubric_ver.fields
    ]
    errors = validate_rubric(fields_data, tie_break_keys=round_obj.tieBreakOrder or [])
    if errors:
        raise HTTPException(
            status_code=422,
            detail={'message': 'Rubric validation failed', 'errors': errors},
        )

    rubric_ver.publishedAt = datetime.utcnow()
    log_audit(
        db,
        actor_id,
        'round.rubric_published',
        'EvaluationRound',
        round_obj.id,
        {'version': rubric_ver.version},
        event_id=round_obj.eventId,
    )
    db.commit()
    db.refresh(rubric_ver)
    return rubric_ver


def unpublish_rubric(db: Session, round_obj: EvaluationRound, actor_id: str) -> RubricVersion:
    """Unpublishes the rubric if not locked."""
    rubric_ver = get_current_rubric(db, round_obj)
    if not rubric_ver:
        raise HTTPException(status_code=404, detail="No rubric version found for this round.")

    if is_locked(rubric_ver):
        raise HTTPException(status_code=409, detail="Cannot unpublish a locked rubric.")

    rubric_ver.publishedAt = None
    log_audit(
        db,
        actor_id,
        'round.rubric_unpublished',
        'EvaluationRound',
        round_obj.id,
        {'version': rubric_ver.version},
        event_id=round_obj.eventId,
    )
    db.commit()
    db.refresh(rubric_ver)
    return rubric_ver
