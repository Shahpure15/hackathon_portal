from datetime import datetime, timezone
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.models import Role, Team, TeamMember, ProblemStatement, PSSelection, EventConfig, Volunteer
from app.auth import require_role, CurrentUser
from app.schemas import ProblemStatementResponse
from app.limiter import limiter

router = APIRouter(prefix="/leader", tags=["leader"])

@router.get("/config")
async def get_leader_config(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.LEADER))
):
    """Returns the PS release time and current server time for accurate countdown calculations."""
    config = db.query(EventConfig).filter(EventConfig.eventId == current_user.eventId).first()
    release_at = config.psReleaseAt.replace(tzinfo=timezone.utc) if config and config.psReleaseAt else None
    
    return {
        "psReleaseAt": release_at,
        "serverTime": datetime.utcnow().replace(tzinfo=timezone.utc)
    }

@router.get("/me")
async def get_leader_team_info(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.LEADER))
):
    if not current_user.teamId:
        raise HTTPException(status_code=400, detail="User account is not linked to a team.")
        
    team = db.query(Team).filter(
        Team.id == current_user.teamId,
        Team.eventId == current_user.eventId
    ).first()
    
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
        
    # Fetch Pod and associated mentors
    pod_data = None
    if team.pod:
        mentors = db.query(Volunteer).filter(Volunteer.podId == team.podId).all()
        pod_data = {
            "id": team.pod.id,
            "name": team.pod.name,
            "mentors": [
                {
                    "name": m.name,
                    "type": m.type.value,
                    "contact": m.contact
                } for m in mentors
            ]
        }
        
    # Fetch selected PS
    ps_data = None
    if team.psSelection:
        ps_data = {
            "code": team.psSelection.ps.code,
            "title": team.psSelection.ps.title,
            "description": team.psSelection.ps.description,
            "selectedAt": team.psSelection.selectedAt.replace(tzinfo=timezone.utc) if team.psSelection.selectedAt else None
        }
        
    return {
        "id": team.id,
        "registrationId": team.registrationId,
        "name": team.name,
        "collegeName": team.collegeName,
        "status": team.status.value,
        "pod": pod_data,
        "psSelection": ps_data,
        "members": [
            {
                "id": m.id,
                "name": m.name,
                "email": m.email,
                "phone": m.phone,
                "idVerified": m.idVerified
            } for m in team.members
        ]
    }

@router.get("/problem-statements", response_model=List[ProblemStatementResponse])
async def get_problem_statements_for_leaders(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.LEADER))
):
    # Enforce Server-Side Release Time
    config = db.query(EventConfig).filter(EventConfig.eventId == current_user.eventId).first()
    
    if not config or not config.psReleaseAt or datetime.utcnow() < config.psReleaseAt:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Problem statements are not yet released"
        )
        
    statements = db.query(ProblemStatement).filter(
        ProblemStatement.eventId == current_user.eventId
    ).order_by(ProblemStatement.code).all()
    
    return [
        ProblemStatementResponse(
            id=s.id,
            eventId=s.eventId,
            code=s.code,
            title=s.title,
            description=s.description,
            capacity=s.capacity,
            selectedCount=s.selectedCount,
            remainingCapacity=max(s.capacity - s.selectedCount, 0)
        ) for s in statements
    ]

@router.post("/select-ps")
@limiter.limit("5/minute; 1/second")
async def select_problem_statement(
    request: Request,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.LEADER))
):
    ps_id = payload.get("psId")
    if not ps_id:
        raise HTTPException(status_code=400, detail="Problem Statement ID is required")
        
    if not current_user.teamId:
        raise HTTPException(status_code=400, detail="User is not associated with a team")

    # 1. Enforce Server-side release time
    config = db.query(EventConfig).filter(EventConfig.eventId == current_user.eventId).first()
    if not config or not config.psReleaseAt or datetime.utcnow() < config.psReleaseAt:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Problem statements have not been released yet"
        )
        
    # 2. Check if team already has a selection (TOCTOU guard)
    existing_selection = db.query(PSSelection).filter(PSSelection.teamId == current_user.teamId).first()
    if existing_selection:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="ALREADY_SELECTED"
        )

    # 3. Perform atomic capacity increment and selection registration in a single transaction block
    try:
        # Conditional update: only increment if selectedCount < capacity
        # This prevents over-allocation under high concurrent load
        result = db.execute(
            text("""
                UPDATE problem_statements 
                SET selectedCount = selectedCount + 1 
                WHERE id = :ps_id AND selectedCount < capacity AND eventId = :event_id
            """),
            {"ps_id": ps_id, "event_id": current_user.eventId}
        )
        
        # If no rows were modified, the PS is either full or doesn't exist
        if result.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="PS_FULL"
            )
            
        # Create PSSelection row
        selection = PSSelection(
            teamId=current_user.teamId,
            psId=ps_id
        )
        db.add(selection)
        
        # Commit the transaction (if teamId unique constraint fails, it will raise IntegrityError)
        db.commit()
        
    except IntegrityError:
        db.rollback()
        # If unique constraint on teamId fails, it means team already selected a PS concurrently
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="ALREADY_SELECTED"
        )
    except HTTPException:
        # Re-raise HTTP exceptions (like PS_FULL) directly
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Selection failed due to a server error: {str(e)}"
        )
        
    # Return selection details on success
    return {
        "message": "Problem statement locked in successfully!",
        "psId": ps_id
    }
