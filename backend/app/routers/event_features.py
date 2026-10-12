from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dto.rbac_admin import FeaturesUpdateRequest
from app.models import Event, EventConfig, UserRoleAssignment
from app.rbac import Principal, invalidate_all, require_permission
from app.routers.admin import log_audit
from app.services.features import FeaturesConfig, features_from_raw, get_event_features

router = APIRouter(prefix="/admin/config", tags=["Event Features"])


@router.get("/features", response_model=FeaturesConfig)
def get_features(
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("config.view")),
):
    return get_event_features(db, current_user.eventId)


@router.put("/features", response_model=FeaturesConfig)
def update_features(
    payload: FeaturesUpdateRequest,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("config.manage")),
):
    event_config = db.query(EventConfig).filter(EventConfig.eventId == current_user.eventId).first()
    if not event_config:
        event = db.query(Event).filter(Event.id == current_user.eventId).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        event_config = EventConfig(eventId=current_user.eventId)
        db.add(event_config)
        db.flush()

    current_feats = features_from_raw(event_config.features)

    # If turning pods off, check for pod-scoped assignments
    if payload.pods is False and current_feats.pods is True:
        assignments = (
            db.query(UserRoleAssignment)
            .filter(UserRoleAssignment.eventId == current_user.eventId)
            .all()
        )
        pod_scoped_members: List[Dict[str, Any]] = []
        for a in assignments:
            if a.scope:
                mode = a.scope.get("teams", {}).get("mode") or a.scope.get("mode")
                if mode == "pods":
                    u = a.user
                    v = u.volunteer if u else None
                    name = v.name if v else (u.username if u else a.userId)
                    pod_scoped_members.append({
                        "userId": a.userId,
                        "name": name,
                        "roleId": a.roleId,
                    })

        if pod_scoped_members:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Cannot turn off pods while members have pod-scoped assignments",
                    "members": pod_scoped_members,
                },
            )

    new_pods = current_feats.pods if payload.pods is None else payload.pods
    new_eval = current_feats.evaluation if payload.evaluation is None else payload.evaluation
    
    if payload.stage is not None and payload.stage not in ('setup', 'event_day', 'judging', 'results', 'closed'):
        raise HTTPException(
            status_code=422,
            detail="Invalid stage: must be one of setup, event_day, judging, results, closed",
        )
    new_stage = current_feats.stage if payload.stage is None else payload.stage

    diff = {"pods": new_pods, "evaluation": new_eval, "stage": new_stage}
    event_config.features = diff
    db.commit()

    invalidate_all()
    log_audit(
        db,
        current_user.id,
        "config.features_update",
        "EventConfig",
        event_config.id,
        diff,
        event_id=current_user.eventId,
    )

    return FeaturesConfig(pods=new_pods, evaluation=new_eval, stage=new_stage)
