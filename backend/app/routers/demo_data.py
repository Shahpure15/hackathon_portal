from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import CurrentUser, require_role
from app.database import get_db
from app.models import Role
from app.services.demo_seeder import clear_demo_data, seed_demo_data

router = APIRouter(prefix="/admin/demo-data", tags=["Demo Data Management"])


class DemoSeedRequest(BaseModel):
    teamsCount: Optional[int] = 6
    judgesCount: Optional[int] = 3


@router.post("/seed")
def seed_demo(
    payload: Optional[DemoSeedRequest] = None,
    current_user: CurrentUser = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    """Generates non-destructive demonstration data isolated to the DEMO- prefix."""
    teams_cnt = payload.teamsCount if payload and payload.teamsCount is not None else 6
    judges_cnt = payload.judgesCount if payload and payload.judgesCount is not None else 3
    return seed_demo_data(
        event_id=current_user.eventId,
        db=db,
        teams_count=teams_cnt,
        judges_count=judges_cnt,
    )


@router.delete("/clear")
def clear_demo(
    current_user: CurrentUser = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    """Safely purges only records with the DEMO- prefix for this event."""
    return clear_demo_data(
        event_id=current_user.eventId,
        db=db,
    )
