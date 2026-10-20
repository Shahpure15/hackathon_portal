import io
import csv
from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_, func
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.logger import logger
from app.models import Role, Team, TeamMember, CheckpointType, AttendanceRecord, EventConfig, ProblemStatement, PSSelection, Volunteer, VolunteerAttendanceRecord
from app.auth import require_role, CurrentUser
from app.rbac import Principal, require_permission, require_principal, apply_team_scope, STAFF_PRINCIPAL_TYPES
from app.services.export_utils import safe_cell

router = APIRouter(prefix="/volunteer", tags=["volunteer"])

@router.get("/config")
def get_volunteer_config(
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_principal(*STAFF_PRINCIPAL_TYPES))
):
    config = db.query(EventConfig).filter(EventConfig.eventId == current_user.eventId).first()
    return {
        "allowVolunteerPsSelection": bool(config.allowVolunteerPsSelection) if config else False
    }

@router.get("/problem-statements")
def get_volunteer_problem_statements(
    team_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('ps.view', principal_types=STAFF_PRINCIPAL_TYPES))
):
    config = db.query(EventConfig).filter(EventConfig.eventId == current_user.eventId).first()
    if not config or not config.allowVolunteerPsSelection:
        raise HTTPException(status_code=403, detail="Volunteer problem statement selection is currently disabled by Admin")
    
    team = None
    if team_id:
        team = db.query(Team).filter(Team.id == team_id, Team.eventId == current_user.eventId).first()
        
    query = db.query(ProblemStatement).filter(ProblemStatement.eventId == current_user.eventId)
    if team and team.category:
        query = query.filter(or_(ProblemStatement.discipline == team.category, ProblemStatement.discipline.is_(None)))
        
    statements = query.order_by(ProblemStatement.code).all()
    return [
        {
            "id": s.id,
            "code": s.code,
            "title": s.title,
            "description": s.description,
            "capacity": s.capacity or 0,
            "selectedCount": s.selectedCount or 0,
            "remainingCapacity": max((s.capacity or 0) - (s.selectedCount or 0), 0),
            "requirements": s.requirements,
            "discipline": s.discipline
        } for s in statements
    ]

@router.post("/teams/{team_id}/select-ps")
def volunteer_select_team_ps(
    team_id: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('ps.assist', principal_types=STAFF_PRINCIPAL_TYPES))
):
    config = db.query(EventConfig).filter(EventConfig.eventId == current_user.eventId).first()
    if not config or not config.allowVolunteerPsSelection:
        raise HTTPException(status_code=403, detail="Volunteer problem statement selection is currently disabled by Admin")
        
    ps_id = payload.get("psId")
    if not ps_id:
        raise HTTPException(status_code=400, detail="Problem statement ID is required")
        
    team = db.query(Team).filter(Team.id == team_id, Team.eventId == current_user.eventId).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
        
    ps_obj = db.query(ProblemStatement).filter(ProblemStatement.id == ps_id, ProblemStatement.eventId == current_user.eventId).first()
    if not ps_obj:
        raise HTTPException(status_code=404, detail="Problem statement not found")
        
    # Category discipline check
    if ps_obj.discipline and team.category and ps_obj.discipline != team.category:
        raise HTTPException(status_code=400, detail=f"This problem statement is for {ps_obj.discipline}, but team is {team.category}")
        
    # Capacity check
    if (ps_obj.selectedCount or 0) >= (ps_obj.capacity or 0):
        raise HTTPException(status_code=409, detail="PS_FULL: This problem statement has reached maximum capacity")
        
    # Check existing selection
    existing_sel = db.query(PSSelection).filter(PSSelection.teamId == team.id).first()
    if existing_sel:
        existing_sel.psId = ps_obj.id
    else:
        new_sel = PSSelection(teamId=team.id, psId=ps_obj.id)
        db.add(new_sel)
        
    db.commit()
    return {
        "message": f"Successfully locked in [{ps_obj.code}] {ps_obj.title} for team {team.name}",
        "teamId": team.id,
        "psId": ps_obj.id,
        "psCode": ps_obj.code,
        "psTitle": ps_obj.title
    }








# Helper: Escape SQL LIKE wildcards
def escape_like_string(s: str) -> str:
    return s.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')

@router.get("/checkpoints")
def get_checkpoints(
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('checkpoint.view', principal_types=STAFF_PRINCIPAL_TYPES))
):
    """Returns list of all checkpoints defined for this event."""
    checkpoints = db.query(CheckpointType).filter(
        CheckpointType.eventId == current_user.eventId
    ).order_by(CheckpointType.name).all()
    
    return {
        "eventId": current_user.eventId,
        "checkpoints": [
            {
                "id": cp.id,
                "name": cp.name,
                "description": cp.description,
                "isDefault": bool(getattr(cp, "isDefault", False))
            } for cp in checkpoints
        ]
    }

@router.get("/teams")
def get_volunteer_teams(
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('team.view', principal_types=STAFF_PRINCIPAL_TYPES))
):
    """Search and paginate teams for check-in verification (read-only except for attendance)."""
    query = db.query(Team).filter(Team.eventId == current_user.eventId)
    query = apply_team_scope(query, current_user)
    
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
    teams = query.options(
        joinedload(Team.pod),
        joinedload(Team.psSelection).joinedload(PSSelection.ps),
        joinedload(Team.members)
    ).order_by(Team.registrationId).offset((page - 1) * limit).limit(limit).all()
    
    results = []
    for team in teams:
        verified_count = sum(1 for m in team.members if m.idVerified)
        pod_name = team.pod.name if team.pod else None
        ps_code = team.psSelection.ps.code if (team.psSelection and team.psSelection.ps) else None
        
        results.append({
            "id": team.id,
            "registrationId": team.registrationId,
            "name": team.name,
            "collegeName": team.collegeName,
            "leaderName": team.leaderName,
            "category": team.category.value if hasattr(team.category, 'value') else team.category,
            "deskNumber": team.deskNumber,
            "podId": team.podId,
            "podName": pod_name,
            "selectedPsCode": ps_code,
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
def get_volunteer_team_detail(
    team_id: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('team.view', principal_types=STAFF_PRINCIPAL_TYPES))
):
    """Detailed team list for check-in including attendance status per member."""
    team = db.query(Team).options(
        joinedload(Team.pod),
        joinedload(Team.psSelection).joinedload(PSSelection.ps),
        joinedload(Team.members)
    ).filter(
        Team.id == team_id,
        Team.eventId == current_user.eventId
    ).first()
    
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
        
    if apply_team_scope(db.query(Team).filter(Team.id == team.id), current_user).first() is None:
        raise HTTPException(status_code=404, detail="Team not found")
        
    # Get all checkpoints for this event
    checkpoints = db.query(CheckpointType).filter(CheckpointType.eventId == current_user.eventId).all()
    
    # Fetch all attendance logs for member IDs in a single query
    member_ids = [m.id for m in team.members]
    attendance_logs = db.query(AttendanceRecord).filter(AttendanceRecord.teamMemberId.in_(member_ids)).all() if member_ids else []
    
    attendance_by_member = {}
    for log in attendance_logs:
        if log.teamMemberId not in attendance_by_member:
            attendance_by_member[log.teamMemberId] = {}
        attendance_by_member[log.teamMemberId][log.checkpointTypeId] = {
            "markedBy": log.markedBy,
            "timestamp": log.timestamp
        }
        
    members_data = []
    for m in team.members:
        attendance_map = attendance_by_member.get(m.id, {})
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
            "teamId": m.teamId,
            "name": m.name,
            "email": m.email,
            "phone": m.phone,
            "isTeamLeader": m.isTeamLeader,
            "idVerified": m.idVerified,
            "checkpoints": checkpoints_status
        })
            
    pod_name = team.pod.name if team.pod else None
    selected_ps_data = None
    if team.psSelection and team.psSelection.ps:
        selected_ps_data = {
            "id": team.psSelection.ps.id,
            "code": team.psSelection.ps.code,
            "title": team.psSelection.ps.title,
            "selectedAt": team.psSelection.selectedAt
        }

    return {
        "id": team.id,
        "registrationId": team.registrationId,
        "name": team.name,
        "collegeName": team.collegeName,
        "category": team.category.value if hasattr(team.category, 'value') else team.category,
        "deskNumber": team.deskNumber,
        "podId": team.podId,
        "podName": pod_name,
        "selectedProblemStatement": selected_ps_data,
        "members": members_data
    }


@router.post("/checkin")
def mark_attendance_checkin(
    payload: Dict[str, Any],
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('attendance.mark', principal_types=STAFF_PRINCIPAL_TYPES))
):
    member_id = payload.get("teamMemberId")
    checkpoint_id = payload.get("checkpointTypeId")
    
    if not member_id or not checkpoint_id:
        raise HTTPException(status_code=400, detail="teamMemberId and checkpointTypeId are required")
        
    # Verify team member exists AND belongs to this volunteer's event (tenant isolation)
    member = db.query(TeamMember).join(Team, TeamMember.teamId == Team.id).filter(
        TeamMember.id == member_id,
        Team.eventId == current_user.eventId
    ).first()
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


@router.get("/people")
def get_volunteer_people(
    search: Optional[str] = None,
    type: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('people.view', principal_types=STAFF_PRINCIPAL_TYPES))
):
    """Search and paginate hackathon people/faculty/judges for check-in verification."""
    query = db.query(Volunteer).filter(Volunteer.eventId == current_user.eventId)
    
    if type and type.upper() != "ALL":
        query = query.filter(func.lower(Volunteer.type) == type.lower())
        
    if search:
        escaped = escape_like_string(search)
        query = query.filter(
            or_(
                Volunteer.name.ilike(f"%{escaped}%"),
                Volunteer.contact.ilike(f"%{escaped}%"),
                Volunteer.type.ilike(f"%{escaped}%"),
                Volunteer.remarks.ilike(f"%{escaped}%")
            )
        )
        
    total_count = query.count()
    people = query.options(joinedload(Volunteer.pod)).order_by(Volunteer.name).offset((page - 1) * limit).limit(limit).all()
    
    # Get all checkpoints for this event
    checkpoints = db.query(CheckpointType).filter(CheckpointType.eventId == current_user.eventId).all()
    
    # Batch load attendance records for these people
    v_ids = [v.id for v in people]
    attendance_records = db.query(VolunteerAttendanceRecord).filter(VolunteerAttendanceRecord.volunteerId.in_(v_ids)).all() if v_ids else []
    
    attendance_map = {}
    for rec in attendance_records:
        if rec.volunteerId not in attendance_map:
            attendance_map[rec.volunteerId] = {}
        attendance_map[rec.volunteerId][rec.checkpointTypeId] = {
            "markedBy": rec.markedBy,
            "timestamp": rec.timestamp
        }
        
    results = []
    for p in people:
        cp_map = attendance_map.get(p.id, {})
        checkpoints_status = []
        for cp in checkpoints:
            rec = cp_map.get(cp.id)
            checkpoints_status.append({
                "checkpointTypeId": cp.id,
                "checkpointName": cp.name,
                "checkedIn": rec is not None,
                "markedBy": rec["markedBy"] if rec else None,
                "timestamp": rec["timestamp"] if rec else None
            })
            
        results.append({
            "id": p.id,
            "name": p.name,
            "type": p.type,
            "contact": p.contact,
            "remarks": p.remarks,
            "podName": p.pod.name if p.pod else None,
            "checkpoints": checkpoints_status
        })
        
    return {
        "total": total_count,
        "page": page,
        "limit": limit,
        "pages": (total_count + limit - 1) // limit,
        "results": results
    }


@router.post("/people/checkin")
def mark_volunteer_people_checkin(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('people.checkin', principal_types=STAFF_PRINCIPAL_TYPES))
):
    volunteer_id = payload.get("volunteerId")
    checkpoint_id = payload.get("checkpointTypeId")
    
    if not volunteer_id or not checkpoint_id:
        raise HTTPException(status_code=400, detail="volunteerId and checkpointTypeId are required")
        
    person = db.query(Volunteer).filter(
        Volunteer.id == volunteer_id,
        Volunteer.eventId == current_user.eventId
    ).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person/Volunteer record not found")
        
    checkpoint = db.query(CheckpointType).filter(
        CheckpointType.id == checkpoint_id,
        CheckpointType.eventId == current_user.eventId
    ).first()
    if not checkpoint:
        raise HTTPException(status_code=404, detail="Checkpoint type not found")

    existing = db.query(VolunteerAttendanceRecord).filter(
        VolunteerAttendanceRecord.volunteerId == volunteer_id,
        VolunteerAttendanceRecord.checkpointTypeId == checkpoint_id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="ALREADY_CHECKED_IN"
        )
        
    try:
        record = VolunteerAttendanceRecord(
            volunteerId=volunteer_id,
            checkpointTypeId=checkpoint_id,
            markedBy=current_user.username
        )
        db.add(record)
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
            detail=f"Checkin error: {str(e)}"
        )
        
    return {
        "message": f"Successfully verified check-in for {person.name}",
        "volunteerId": volunteer_id,
        "checkpointTypeId": checkpoint_id,
        "markedBy": current_user.username,
        "timestamp": datetime.utcnow()
    }


def _csv_safe(value: Any) -> Any:
    return safe_cell(value)


@router.get("/people/export")
def export_volunteer_people(
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('people.view', principal_types=STAFF_PRINCIPAL_TYPES))
):
    people = db.query(Volunteer).options(
        joinedload(Volunteer.pod),
        joinedload(Volunteer.attendanceRecords)
    ).filter(Volunteer.eventId == current_user.eventId).order_by(Volunteer.name).all()

    checkpoints = db.query(CheckpointType).filter(
        CheckpointType.eventId == current_user.eventId
    ).order_by(CheckpointType.name).all()

    output = io.StringIO()
    writer = csv.writer(output)

    headers = [
        "Name", "Role / Type", "Contact", "Assigned POD Group", "Remarks"
    ]

    if checkpoints:
        for cp in checkpoints:
            headers.extend([
                f"{cp.name} (Checked In)",
                f"{cp.name} Check-In Time",
                f"{cp.name} Marked By"
            ])
    else:
        headers.extend(["Checked In", "Check-In Time", "Marked By"])

    writer.writerow([_csv_safe(h) for h in headers])

    for p in people:
        pod_name = p.pod.name if p.pod else "Unassigned"
        vol_type_str = p.type.value if hasattr(p.type, 'value') else str(p.type or "")
        
        row = [
            p.name,
            vol_type_str,
            p.contact or "",
            pod_name,
            p.remarks or ""
        ]

        att_map = {rec.checkpointTypeId: rec for rec in (p.attendanceRecords or [])}
        if checkpoints:
            for cp in checkpoints:
                rec = att_map.get(cp.id)
                if rec:
                    row.extend([
                        "Yes",
                        rec.timestamp.strftime("%Y-%m-%d %H:%M:%S") if rec.timestamp else "",
                        rec.markedBy or ""
                    ])
                else:
                    row.extend(["No", "", ""])
        else:
            if p.attendanceRecords:
                first_rec = p.attendanceRecords[0]
                row.extend([
                    "Yes",
                    first_rec.timestamp.strftime("%Y-%m-%d %H:%M:%S") if first_rec.timestamp else "",
                    first_rec.markedBy or ""
                ])
            else:
                row.extend(["No", "", ""])

        writer.writerow([_csv_safe(v) for v in row])

    output.seek(0)

    headers = {
        'Content-Disposition': 'attachment; filename="people_checkin_export.csv"',
        'Content-Type': 'text/csv; charset=utf-8-sig'
    }
    return StreamingResponse(iter([output.getvalue().encode('utf-8-sig')]), headers=headers)
