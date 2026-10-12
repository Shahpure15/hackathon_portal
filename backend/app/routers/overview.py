from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import CurrentUser, require_role
from app.database import get_db
from app.models import Role
from app.services.overview import get_overview_data

router = APIRouter(prefix="/admin/overview", tags=["Admin Overview"])


@router.get("")
@router.get("/")
def get_admin_overview(
    current_user: CurrentUser = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    """Returns overview statistics and prioritized attention items for the admin dashboard."""
    return get_overview_data(event_id=current_user.eventId, db=db)
