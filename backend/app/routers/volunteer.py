from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.models import Role, Team, TeamMember, CheckpointType, AttendanceRecord
from app.auth import require_role, CurrentUser

router = APIRouter(prefix="/volunteer", tags=["volunteer"])

# Helper: Escape SQL LIKE wildcards
def escape_like_string(s: str) -> str:
    return s.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')

@router.get("/checkpoints")
async def get_checkpoints(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.VOLUNTEER))
):
    """Returns list of all checkpoints defined for this event."""
    checkpoints = db.query(CheckpointType).filter(
        CheckpointType.eventId == current_user.eventId
    ).order_by(CheckpointType.name).all()
    
    return [
        {
            "id": cp.id,
            "name": cp.name,
            "description": cp.description
        } for cp in checkpoints
    ]

@router.get("/teams")
async def get_volunteer_teams(
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.VOLUNTEER))
):
    """Search and paginate teams for check-in verification (read-only except for attendance)."""
    query = db.query(Team).filter(Team.eventId == current_user.eventId)
    
    if search:
        escaped = escape_like_string(search)
        query = query.filter(
            or_(
                Team.name.ilike(f"%{escaped}%"),
                Team.leaderName.ilike(f"%{escaped}%"),
                Team.collegeName.ilike(f"%{escaped}%"),
                Team.registrationId.ilike(f"%{escaped}%")
            )
        )
        
    total_count = query.count()
    teams = query.order_by(Team.registrationId).offset((page - 1) * limit).limit(limit).all()
    
    results = []
    for team in teams:
        # Count verified members
        verified_count = db.query(TeamMember).filter(
            TeamMember.teamId == team.id,
            TeamMember.idVerified == True
        ).count()
        
        results.append({
            "id": team.id,
            "registrationId": team.registrationId,
            "name": team.name,
            "collegeName": team.collegeName,
            "leaderName": team.leaderName,
            "memberCount": len(team.members),
            "verifiedCount": verified_count
        })
        
    return {
        "total": total_count,
        "page": page,
        "limit": limit,
        "pages": (total_count + limit - 1) // limit,
        "results": results
    }

@router.get("/teams/{team_id}")
async def get_volunteer_team_detail(
    team_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.VOLUNTEER))
):
    """Detailed team list for check-in including attendance status per member."""
    team = db.query(Team).filter(
        Team.id == team_id,
        Team.eventId == current_user.eventId
    ).first()
    
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
        
    # Get all checkpoints for this event
    checkpoints = db.query(CheckpointType).filter(CheckpointType.eventId == current_user.eventId).all()
    
    members_data = []
    for m in team.members:
        # Find attendance logs for this member
        attendance_logs = db.query(AttendanceRecord).filter(AttendanceRecord.teamMemberId == m.id).all()
        attendance_map = {log.checkpointTypeId: {
            "markedBy": log.markedBy,
            "timestamp": log.timestamp
        } for log in attendance_logs}
        
        checkpoints_status = []
        for cp in checkpoints:
            record = attendance_map.get(cp.id)
            checkpoints_status.append({
                "checkpointTypeId": cp.id,
                "checkpointName": cp.name,
                "checkedIn": record is not None,
                "markedBy": record["markedBy"] if record else None,
                "timestamp": record["timestamp"] if record else None
            })
            
        members_data.append({
            "id": m.id,
            "name": m.name,
            "email": m.email,
            "phone": m.phone,
            "idVerified": m.idVerified,
            "checkpoints": checkpoints_status
        })
        
    return {
        "id": team.id,
        "registrationId": team.registrationId,
        "name": team.name,
        "collegeName": team.collegeName,
        "members": members_data
    }

@router.post("/checkin")
async def mark_attendance_checkin(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.VOLUNTEER))
):
    member_id = payload.get("teamMemberId")
    checkpoint_id = payload.get("checkpointTypeId")
    
    if not member_id or not checkpoint_id:
        raise HTTPException(status_code=400, detail="teamMemberId and checkpointTypeId are required")
        
    # Verify team member exists
    member = db.query(TeamMember).filter(TeamMember.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found")
        
    # Verify checkpoint exists
    checkpoint = db.query(CheckpointType).filter(
        CheckpointType.id == checkpoint_id,
        CheckpointType.eventId == current_user.eventId
    ).first()
    if not checkpoint:
        raise HTTPException(status_code=404, detail="Checkpoint type not found")

    # Check if already checked in (Idempotency check)
    existing = db.query(AttendanceRecord).filter(
        AttendanceRecord.teamMemberId == member_id,
        AttendanceRecord.checkpointTypeId == checkpoint_id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="ALREADY_CHECKED_IN"
        )
        
    try:
        # Create Attendance Record
        record = AttendanceRecord(
            teamMemberId=member_id,
            checkpointTypeId=checkpoint_id,
            markedBy=current_user.username
        )
        db.add(record)
        
        # Mark member ID as physically verified
        member.idVerified = True
        
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="ALREADY_CHECKED_IN"
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Database checkin error: {str(e)}"
        )
        
    return {
        "message": f"Successfully verified check-in for {member.name}",
        "teamMemberId": member_id,
        "checkpointTypeId": checkpoint_id
    }
