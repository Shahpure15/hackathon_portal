import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status, Request, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.models import Role, Team, TeamMember, ProblemStatement, PSSelection, EventConfig, Volunteer, AttendanceRecord
from app.auth import require_role, CurrentUser
from app.schemas import ProblemStatementResponse
from app.limiter import limiter, team_key_func
from app.websocket_manager import manager

router = APIRouter(prefix="/leader", tags=["leader"])

def _broadcast_ps_update(event_id: str, ps_id: str, selected_count: int, capacity: int):
    try:
        asyncio.run(manager.broadcast(event_id, {
            "type": "ps_capacity_update",
            "psId": ps_id,
            "selectedCount": selected_count,
            "remainingCapacity": max(capacity - selected_count, 0)
        }))
    except Exception:
        pass

@router.get("/config")
def get_leader_config(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.LEADER))
):
    """Returns the PS release time and current server time for accurate countdown calculations."""
    config = db.query(EventConfig).filter(EventConfig.eventId == current_user.eventId).first()
    release_at = config.psReleaseAt.replace(tzinfo=timezone.utc) if config and config.psReleaseAt else None
    
    return {
        "psReleaseAt": release_at,
        "psGateCheckpointTypeId": config.psGateCheckpointTypeId if config else None,
        "serverTime": datetime.utcnow().replace(tzinfo=timezone.utc)
    }

@router.get("/verification-status")
def get_leader_verification_status(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.LEADER))
):
    """Returns check-in verification status for the leader's team."""
    if not current_user.teamId:
        return {"verified": False, "gatingEnabled": False, "resolvedMemberName": None}
        
    config = db.query(EventConfig).filter(EventConfig.eventId == current_user.eventId).first()
    if not config or not config.psGateCheckpointTypeId:
        return {"verified": True, "gatingEnabled": False, "resolvedMemberName": None}
        
    team = db.query(Team).filter(Team.id == current_user.teamId).first()
    if not team:
        return {"verified": False, "gatingEnabled": True, "resolvedMemberName": None}
        
    leader_member = db.query(TeamMember).filter(
        TeamMember.teamId == team.id, TeamMember.isTeamLeader == True
    ).first()
    target_member = leader_member if leader_member else db.query(TeamMember).filter(TeamMember.teamId == team.id).first()
    
    if not target_member:
        return {"verified": False, "gatingEnabled": True, "resolvedMemberName": None}
        
    verified = db.query(AttendanceRecord).filter(
        AttendanceRecord.teamMemberId == target_member.id,
        AttendanceRecord.checkpointTypeId == config.psGateCheckpointTypeId
    ).first() is not None
    
    role_desc = "Team Leader" if target_member.isTeamLeader else "Team Member"
    resolved_name = f"{target_member.name} ({role_desc})"
    
    return {
        "verified": verified,
        "gatingEnabled": True,
        "resolvedMemberName": resolved_name
    }

@router.get("/me")
def get_leader_team_info(
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
                "idVerified": m.idVerified,
                "isTeamLeader": m.isTeamLeader
            } for m in team.members
        ]
    }

@router.get("/problem-statements", response_model=List[ProblemStatementResponse])
def get_problem_statements_for_leaders(
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
@limiter.limit("5/minute; 1/second", key_func=team_key_func)
def select_problem_statement(
    request: Request,
    payload: Dict[str, Any],
    background_tasks: BackgroundTasks,
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

    # 1b. Enforce Server-side check-in gate
    if config and config.psGateCheckpointTypeId:
        team = db.query(Team).filter(Team.id == current_user.teamId).first()
        leader_member = db.query(TeamMember).filter(
            TeamMember.teamId == team.id, TeamMember.isTeamLeader == True
        ).first()
        target_member = leader_member if leader_member else db.query(TeamMember).filter(TeamMember.teamId == team.id).first()

        verified = False
        if target_member:
            verified = db.query(AttendanceRecord).filter(
                AttendanceRecord.teamMemberId == target_member.id,
                AttendanceRecord.checkpointTypeId == config.psGateCheckpointTypeId
            ).first() is not None

        if not verified:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="NOT_CHECKED_IN")
        
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
        result = db.execute(
            text("""
                UPDATE problem_statements 
                SET "selectedCount" = "selectedCount" + 1 
                WHERE id = :ps_id AND "selectedCount" < capacity AND "eventId" = :event_id
            """),
            {"ps_id": ps_id, "event_id": current_user.eventId}
        )
        
        if result.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="PS_FULL"
            )
            
        selection = PSSelection(
            teamId=current_user.teamId,
            psId=ps_id
        )
        db.add(selection)
        db.commit()

        # Fetch updated PS for broadcast
        ps_obj = db.query(ProblemStatement).filter(ProblemStatement.id == ps_id).first()
        if ps_obj:
            background_tasks.add_task(
                _broadcast_ps_update,
                current_user.eventId,
                ps_id,
                ps_obj.selectedCount,
                ps_obj.capacity
            )
        
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="ALREADY_SELECTED"
        )
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Selection failed due to a server error: {str(e)}"
        )
        
    return {
        "message": "Problem statement locked in successfully!",
        "psId": ps_id
    }
