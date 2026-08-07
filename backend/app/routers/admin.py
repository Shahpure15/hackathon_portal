import re
import csv
import uuid
import random
import string
import pandas as pd
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func

from app.database import get_db
from app.models import (
    User, Role, Team, TeamMember, TeamStatus, Pod, Volunteer, 
    VolunteerType, ProblemStatement, PSSelection, AuditLog, 
    PendingImport, EventConfig, CheckpointType, AttendanceRecord
)
from app.auth import require_role, CurrentUser, get_password_hash
from app.schemas import (
    TeamResponse, TeamDetailResponse, AuditLogResponse, 
    PodResponse, VolunteerResponse, ProblemStatementResponse,
    CheckpointTypeCreate, CheckpointTypeUpdate, CheckpointTypeResponse
)

router = APIRouter(prefix="/admin", tags=["admin"])

# Helper: Escape SQL LIKE wildcards
def escape_like_string(s: str) -> str:
    return s.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')

# Helper: Serialize diff data for JSON serialization (convert datetime to string)
def serialize_diff(diff: Any) -> Any:
    if isinstance(diff, dict):
        return {k: serialize_diff(v) for k, v in diff.items()}
    elif isinstance(diff, list):
        return [serialize_diff(v) for v in diff]
    elif isinstance(diff, datetime):
        return diff.isoformat()
    return diff

# Helper: Log audit trail
def log_audit(db: Session, actor_id: str, action: str, entity_type: str, entity_id: str, diff: Optional[dict] = None):
    serialized_diff = serialize_diff(diff) if diff else None
    audit = AuditLog(
        actorId=actor_id,
        action=action,
        entityType=entity_type,
        entityId=entity_id,
        diff=serialized_diff
    )
    db.add(audit)
    db.flush()

# Helper: Generate random password
def generate_random_password(length: int = 10) -> str:
    chars = string.ascii_letters + string.digits
    return "".join(random.choice(chars) for _ in range(length))

# Helper: Generate unique volunteer username
def generate_unique_volunteer_username(db: Session, name: str) -> str:
    base = "vol_" + re.sub(r'[^a-zA-Z0-9]', '', name).lower()
    if not base or base == "vol_":
        base = "vol_user"
    username = base
    while db.query(User).filter(func.lower(User.username) == username.lower()).first():
        suffix = "".join(random.choices(string.digits, k=3))
        username = f"{base}{suffix}"
    return username

# Helper: Parse members from CSV row
def parse_members_from_row(row: Dict[str, Any]) -> List[Dict[str, Any]]:
    members = []
    # Look for up to 10 potential members in columns
    for key in row.keys():
        if key.startswith("Member ") and key.endswith(" Name"):
            try:
                # Extract index number
                parts = key.split(" ")
                n = int(parts[1])
            except (ValueError, IndexError):
                continue
                
            name = row.get(f"Member {n} Name")
            if name and str(name).strip() and str(name).lower() != "nan":
                lead_val = str(row.get(f"Member {n} Lead", "No")).strip().lower()
                lead = lead_val in ["yes", "y", "true", "1"]
                college = str(row.get(f"Member {n} College", "")).strip()
                email = str(row.get(f"Member {n} Email", "")).strip()
                phone = str(row.get(f"Member {n} Mobile", "")).strip()
                
                members.append({
                    "name": str(name).strip(),
                    "lead": lead,
                    "college": college if college.lower() != "nan" else "",
                    "email": email if email.lower() != "nan" else "",
                    "phone": phone if phone.lower() != "nan" else ""
                })
    return members


# ==========================================
# TEAMS MANAGEMENT
# ==========================================

@router.get("/teams")
async def get_teams(
    search: Optional[str] = None,
    status: Optional[TeamStatus] = None,
    podId: Optional[str] = None,
    hasPod: Optional[bool] = None,
    hasPs: Optional[bool] = None,
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    query = db.query(Team).filter(Team.eventId == current_user.eventId)
    
    # Filters
    if status:
        query = query.filter(Team.status == status)
    if podId:
        query = query.filter(Team.podId == podId)
    if hasPod is not None:
        if hasPod:
            query = query.filter(Team.podId.isnot(None))
        else:
            query = query.filter(Team.podId.is_(None))
    if hasPs is not None:
        if hasPs:
            query = query.filter(Team.psSelection.has())
        else:
            query = query.filter(~Team.psSelection.has())
        
    # Search
    if search:
        escaped = escape_like_string(search)
        query = query.filter(
            or_(
                Team.name.ilike(f"%{escaped}%"),
                Team.leaderName.ilike(f"%{escaped}%"),
                Team.leaderEmail.ilike(f"%{escaped}%"),
                Team.collegeName.ilike(f"%{escaped}%"),
                Team.registrationId.ilike(f"%{escaped}%")
            )
        )
        
    total_count = query.count()
    teams = query.order_by(Team.registrationId).offset((page - 1) * limit).limit(limit).all()
    
    # Construct response with details
    results = []
    for team in teams:
        # Get pod name
        pod_name = team.pod.name if team.pod else None
        
        # Get selected PS code
        ps_code = None
        if team.psSelection:
            ps_code = team.psSelection.ps.code
            
        team_data = {
            "id": team.id,
            "eventId": team.eventId,
            "registrationId": team.registrationId,
            "name": team.name,
            "leaderName": team.leaderName,
            "leaderEmail": team.leaderEmail,
            "leaderPhone": team.leaderPhone,
            "collegeName": team.collegeName,
            "status": team.status,
            "podId": team.podId,
            "podName": pod_name,
            "selectedPsCode": ps_code,
            "createdAt": team.createdAt,
            "members": [
                {
                    "id": m.id,
                    "teamId": m.teamId,
                    "name": m.name,
                    "email": m.email,
                    "phone": m.phone,
                    "idVerified": m.idVerified
                } for m in team.members
            ]
        }
        results.append(team_data)
        
    return {
        "total": total_count,
        "page": page,
        "limit": limit,
        "pages": (total_count + limit - 1) // limit,
        "results": results
    }

@router.get("/teams/{team_id}", response_model=TeamDetailResponse)
async def get_team_detail(
    team_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    team = db.query(Team).filter(
        Team.id == team_id, 
        Team.eventId == current_user.eventId
    ).first()
    
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
        
    ps_code = team.psSelection.ps.code if team.psSelection else None
    ps_id = team.psSelection.psId if team.psSelection else None
    pod_name = team.pod.name if team.pod else None
    
    return TeamDetailResponse(
        id=team.id,
        eventId=team.eventId,
        registrationId=team.registrationId,
        name=team.name,
        leaderName=team.leaderName,
        leaderEmail=team.leaderEmail,
        leaderPhone=team.leaderPhone,
        collegeName=team.collegeName,
        status=team.status,
        podId=team.podId,
        podName=pod_name,
        selectedPsCode=ps_code,
        psId=ps_id,
        createdAt=team.createdAt,
        members=[
            {
                "id": m.id,
                "teamId": m.teamId,
                "name": m.name,
                "email": m.email,
                "phone": m.phone,
                "idVerified": m.idVerified
            } for m in team.members
        ]
    )

@router.patch("/teams/{team_id}")
async def patch_team(
    team_id: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    team = db.query(Team).filter(
        Team.id == team_id,
        Team.eventId == current_user.eventId
    ).first()
    
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
        
    # Valid fields to edit are podId, status, and psId
    allowed_updates = ["podId", "status"]
    diff = {}
    
    # Update simple fields
    for key, value in payload.items():
        if key not in allowed_updates:
            continue
            
        old_val = getattr(team, key)
        
        # Format values for diff check
        if key == "status":
            try:
                value = TeamStatus(value)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid team status: {value}")
        
        if old_val != value:
            # Soft check for Pod Capacity Warning
            if key == "podId" and value:
                pod = db.query(Pod).filter(Pod.id == value).first()
                if pod and pod.capacity:
                    assigned_count = db.query(Team).filter(Team.podId == value).count()
                    if assigned_count >= pod.capacity:
                        # Just logging warning in response, let client proceed as soft warning
                        diff["_warning"] = f"Pod capacity warning: {pod.name} is full ({assigned_count}/{pod.capacity})"
            
            diff[key] = {"from": old_val if old_val is not None else None, "to": value if value is not None else None}
            setattr(team, key, value)
            
    # Process Problem Statement (PS) assignment separately
    if "psId" in payload:
        new_ps_id = payload["psId"]
        existing_selection = db.query(PSSelection).filter(PSSelection.teamId == team.id).first()
        old_ps_id = existing_selection.psId if existing_selection else None
        
        if old_ps_id != new_ps_id:
            # 1. Decrement old selection count
            if existing_selection:
                old_ps = db.query(ProblemStatement).filter(ProblemStatement.id == old_ps_id).first()
                if old_ps and old_ps.selectedCount > 0:
                    old_ps.selectedCount -= 1
                
                # Delete selection from DB if new selection is None/empty
                if not new_ps_id:
                    db.delete(existing_selection)
            
            # 2. Add or update new selection
            if new_ps_id:
                new_ps = db.query(ProblemStatement).filter(ProblemStatement.id == new_ps_id).first()
                if not new_ps:
                    raise HTTPException(status_code=400, detail="Target Problem Statement does not exist.")
                
                new_ps.selectedCount += 1
                
                if existing_selection:
                    existing_selection.psId = new_ps_id
                    existing_selection.selectedAt = datetime.utcnow()
                else:
                    new_selection = PSSelection(teamId=team.id, psId=new_ps_id)
                    db.add(new_selection)
                    
            diff["psId"] = {"from": old_ps_id, "to": new_ps_id}
            
    if diff:
        db.flush()
        log_audit(
            db=db,
            actor_id=current_user.id,
            action="team.edit",
            entity_type="Team",
            entity_id=team.id,
            diff=diff
        )
        db.commit()
        
    return {"message": "Team updated successfully", "diff": diff}


# ==========================================
# CSV IMPORT ENGINE - PREVIEW
# ==========================================

@router.post("/teams/import/preview")
async def import_teams_preview(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    # 1. Validate file size and type
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Invalid file type. Only CSV files allowed.")
        
    contents = await file.read()
    if len(contents) > 2 * 1024 * 1024: # 2MB limit
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 2MB.")
        
    # Read CSV using pandas
    try:
        # Decodes file content
        from io import StringIO
        csv_data = StringIO(contents.decode('utf-8'))
        df = pd.read_csv(csv_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing CSV: {str(e)}")
        
    if df.shape[0] > 1000:
        raise HTTPException(status_code=400, detail="Row count exceeds the maximum limit of 1000 rows.")
        
    # 2. Validate columns
    required_cols = ["Team Code", "Team Name"]
    for col in required_cols:
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Missing required column: {col}")
            
    preview_data = {
        "new": [],
        "changed": [],
        "unchanged": [],
        "invalid": []
    }
    
    unique_codes_in_file = set()
    
    # Process rows
    for index, row_series in df.iterrows():
        row = row_series.to_dict()
        row_num = index + 1
        
        reg_id = str(row.get("Team Code", "")).strip()
        team_name = str(row.get("Team Name", "")).strip()
        
        # Basic validation
        if not reg_id or reg_id.lower() == "nan":
            preview_data["invalid"].append({
                "row": row_num,
                "reason": "Missing Team Code"
            })
            continue
            
        if not team_name or team_name.lower() == "nan":
            preview_data["invalid"].append({
                "row": row_num,
                "reason": "Missing Team Name"
            })
            continue
            
        if reg_id in unique_codes_in_file:
            preview_data["invalid"].append({
                "row": row_num,
                "reason": f"Duplicate Team Code '{reg_id}' inside the uploaded file itself"
            })
            continue
        unique_codes_in_file.add(reg_id)
        
        # Parse members
        parsed_members = parse_members_from_row(row)
        if not parsed_members:
            preview_data["invalid"].append({
                "row": row_num,
                "reason": "Team has no valid members listed"
            })
            continue
            
        # Determine leader
        leader = next((m for m in parsed_members if m["lead"]), parsed_members[0])
        
        # Prepare row payload
        row_payload = {
            "registrationId": reg_id,
            "name": team_name,
            "leaderName": leader["name"],
            "leaderEmail": leader["email"],
            "leaderPhone": leader["phone"],
            "collegeName": leader["college"] or "Unknown College",
            "members": parsed_members,
            "row": row_num
        }
        
        # Validate email formats
        email_regex = r"^[\w\.-]+@[\w\.-]+\.\w+$"
        invalid_emails = [m["email"] for m in parsed_members if m["email"] and not re.match(email_regex, m["email"])]
        if invalid_emails:
            preview_data["invalid"].append({
                "row": row_num,
                "reason": f"Invalid email format: {', '.join(invalid_emails)}"
            })
            continue
            
        # Compare with Database
        db_team = db.query(Team).filter(
            Team.registrationId == reg_id,
            Team.eventId == current_user.eventId
        ).first()
        
        if not db_team:
            preview_data["new"].append(row_payload)
        else:
            # Check for changes
            changes = {}
            if db_team.name != team_name:
                changes["name"] = {"from": db_team.name, "to": team_name}
            if db_team.leaderName != leader["name"]:
                changes["leaderName"] = {"from": db_team.leaderName, "to": leader["name"]}
            if db_team.leaderEmail != leader["email"]:
                changes["leaderEmail"] = {"from": db_team.leaderEmail, "to": leader["email"]}
            if db_team.leaderPhone != leader["phone"]:
                changes["leaderPhone"] = {"from": db_team.leaderPhone, "to": leader["phone"]}
            
            db_college = db_team.collegeName
            csv_college = leader["college"] or "Unknown College"
            if db_college != csv_college:
                changes["collegeName"] = {"from": db_college, "to": csv_college}
                
            # Compare members
            db_members_key = sorted([f"{m.name}:{m.email}" for m in db_team.members])
            csv_members_key = sorted([f'{m["name"]}:{m["email"]}' for m in parsed_members])
            if db_members_key != csv_members_key:
                changes["members"] = {
                    "from": [f"{m.name} ({m.email})" for m in db_team.members],
                    "to": [f'{m["name"]} ({m["email"]})' for m in parsed_members]
                }
                
            if changes:
                row_payload["changes"] = changes
                preview_data["changed"].append(row_payload)
            else:
                preview_data["unchanged"].append(row_payload)
                
    # Save preview in PendingImport
    pending = PendingImport(
        eventId=current_user.eventId,
        type="team",
        payload={
            "new": preview_data["new"],
            "changed": preview_data["changed"],
            "unchanged": preview_data["unchanged"]
        }
    )
    db.add(pending)
    db.commit()
    
    return {
        "importId": pending.id,
        "summary": {
            "new": len(preview_data["new"]),
            "changed": len(preview_data["changed"]),
            "unchanged": len(preview_data["unchanged"]),
            "invalid": len(preview_data["invalid"]),
        },
        "details": {
            "changed": preview_data["changed"],
            "invalid": preview_data["invalid"]
        }
    }


# ==========================================
# CSV IMPORT ENGINE - CONFIRM
# ==========================================

@router.post("/teams/import/confirm")
async def import_teams_confirm(
    importId: str,
    decisions: Dict[str, str], # key: registrationId, value: "update" | "skip"
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    pending = db.query(PendingImport).filter(
        PendingImport.id == importId,
        PendingImport.eventId == current_user.eventId
    ).first()
    
    if not pending or pending.type != "team":
        raise HTTPException(status_code=404, detail="Pending import not found or expired")
        
    payload = pending.payload
    new_teams = payload.get("new", [])
    changed_teams = payload.get("changed", [])
    
    generated_credentials = []
    
    # Use transactional block
    try:
        # 1. Process New Teams
        for row in new_teams:
            reg_id = row["registrationId"]
            
            # Create Team
            team = Team(
                eventId=current_user.eventId,
                registrationId=reg_id,
                name=row["name"],
                leaderName=row["leaderName"],
                leaderEmail=row["leaderEmail"],
                leaderPhone=row["leaderPhone"],
                collegeName=row["collegeName"]
            )
            db.add(team)
            db.flush() # Populate team.id
            
            # Create Team Members
            for member_data in row["members"]:
                member = TeamMember(
                    teamId=team.id,
                    name=member_data["name"],
                    email=member_data["email"],
                    phone=member_data["phone"]
                )
                db.add(member)
                
            # Create Leader User Login Account
            raw_password = generate_random_password()
            leader_user = User(
                eventId=current_user.eventId,
                username=reg_id.lower(), # short registrationId is clean username
                passwordHash=get_password_hash(raw_password),
                role=Role.LEADER,
                teamId=team.id
            )
            db.add(leader_user)
            
            generated_credentials.append({
                "teamName": team.name,
                "registrationId": reg_id,
                "username": leader_user.username,
                "password": raw_password
            })
            
        # 2. Process Changed Teams
        for row in changed_teams:
            reg_id = row["registrationId"]
            decision = decisions.get(reg_id, "update")
            
            if decision == "skip":
                continue
                
            # Fetch existing team
            db_team = db.query(Team).filter(
                Team.registrationId == reg_id,
                Team.eventId == current_user.eventId
            ).first()
            
            if not db_team:
                continue # Safety skip
                
            diff = {}
            
            # Log changes
            for key in ["name", "leaderName", "leaderEmail", "leaderPhone", "collegeName"]:
                old_val = getattr(db_team, key)
                if old_val != row[key]:
                    diff[key] = {"from": old_val, "to": row[key]}
                    setattr(db_team, key, row[key])
                    
            # Delete old team members and insert new ones
            db.query(TeamMember).filter(TeamMember.teamId == db_team.id).delete()
            for member_data in row["members"]:
                member = TeamMember(
                    teamId=db_team.id,
                    name=member_data["name"],
                    email=member_data["email"],
                    phone=member_data["phone"]
                )
                db.add(member)
                
            diff["members"] = row.get("changes", {}).get("members", {})
            
            # Update user username (if registrationId changed, though it is the key and won't normally change)
            db_user = db.query(User).filter(User.teamId == db_team.id).first()
            if db_user:
                db_user.username = reg_id.lower()
                
            log_audit(
                db=db,
                actor_id=current_user.id,
                action="team.csv_update",
                entity_type="Team",
                entity_id=db_team.id,
                diff=diff
            )
            
        # Delete Pending Import row
        db.delete(pending)
        
        # Commit transaction
        db.commit()
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error executing database writes, full transaction rolled back: {str(e)}"
        )
        
    return {
        "message": "CSV data successfully imported!",
        "credentials": generated_credentials
    }

@router.get("/teams/export")
async def export_teams(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    teams = db.query(Team).filter(Team.eventId == current_user.eventId).order_by(Team.registrationId).all()
    
    # Generate CSV stream response
    import io
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Headers
    writer.writerow([
        "Team Code", "Team Name", "Leader Name", "Leader Email", "Leader Phone", 
        "College Name", "Status", "POD Grouping", "Selected PS Code", "Selected PS Title"
    ])
    
    for team in teams:
        pod_name = team.pod.name if team.pod else "Unassigned"
        ps_code = team.psSelection.ps.code if team.psSelection else "None"
        ps_title = team.psSelection.ps.title if team.psSelection else "None"
        
        writer.writerow([
            team.registrationId,
            team.name,
            team.leaderName,
            team.leaderEmail,
            team.leaderPhone,
            team.collegeName,
            team.status.value,
            pod_name,
            ps_code,
            ps_title
        ])
        
    output.seek(0)
    
    # Set headers for file download
    headers = {
        'Content-Disposition': 'attachment; filename="teams_roster_export.csv"',
        'Content-Type': 'text/csv'
    }
    
    return StreamingResponse(iter([output.getvalue()]), headers=headers)


# ==========================================
# PODS (GROUPING) MANAGEMENT
# ==========================================

@router.get("/pods", response_model=List[PodResponse])
async def get_pods(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    pods = db.query(Pod).filter(Pod.eventId == current_user.eventId).order_by(Pod.name).all()
    
    results = []
    for pod in pods:
        team_count = db.query(Team).filter(Team.podId == pod.id).count()
        volunteer_count = db.query(Volunteer).filter(Volunteer.podId == pod.id).count()
        
        results.append(PodResponse(
            id=pod.id,
            eventId=pod.eventId,
            name=pod.name,
            capacity=pod.capacity,
            teamCount=team_count,
            volunteerCount=volunteer_count
        ))
        
    return results

@router.post("/pods", response_model=PodResponse)
async def create_pod(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    name = str(payload.get("name", "")).strip()
    capacity = payload.get("capacity")
    
    if not name:
        raise HTTPException(status_code=400, detail="POD name is required")
        
    # Case-insensitive duplicate check
    existing = db.query(Pod).filter(
        Pod.eventId == current_user.eventId,
        func.lower(Pod.name) == func.lower(name)
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail=f"POD group '{name}' already exists")
        
    pod = Pod(
        eventId=current_user.eventId,
        name=name,
        capacity=int(capacity) if capacity is not None and str(capacity).isdigit() else None
    )
    db.add(pod)
    db.commit()
    db.refresh(pod)
    
    return PodResponse(
        id=pod.id,
        eventId=pod.eventId,
        name=pod.name,
        capacity=pod.capacity,
        teamCount=0,
        volunteerCount=0
    )

@router.patch("/pods/{pod_id}", response_model=PodResponse)
async def update_pod(
    pod_id: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    pod = db.query(Pod).filter(Pod.id == pod_id, Pod.eventId == current_user.eventId).first()
    if not pod:
        raise HTTPException(status_code=404, detail="POD not found")
        
    name = payload.get("name")
    capacity = payload.get("capacity")
    
    diff = {}
    if name is not None:
        name = str(name).strip()
        if not name:
            raise HTTPException(status_code=400, detail="POD name cannot be empty")
            
        # Unique name check
        existing = db.query(Pod).filter(
            Pod.eventId == current_user.eventId,
            Pod.id != pod.id,
            func.lower(Pod.name) == func.lower(name)
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"POD group '{name}' already exists")
            
        if pod.name != name:
            diff["name"] = {"from": pod.name, "to": name}
            pod.name = name
            
    if "capacity" in payload:
        old_cap = pod.capacity
        new_cap = int(capacity) if capacity is not None and str(capacity).isdigit() else None
        if old_cap != new_cap:
            diff["capacity"] = {"from": old_cap, "to": new_cap}
            pod.capacity = new_cap
            
    if diff:
        log_audit(db, current_user.id, "pod.edit", "Pod", pod.id, diff)
        db.commit()
        db.refresh(pod)
        
    team_count = db.query(Team).filter(Team.podId == pod.id).count()
    volunteer_count = db.query(Volunteer).filter(Volunteer.podId == pod.id).count()
    
    return PodResponse(
        id=pod.id,
        eventId=pod.eventId,
        name=pod.name,
        capacity=pod.capacity,
        teamCount=team_count,
        volunteerCount=volunteer_count
    )

@router.delete("/pods/{pod_id}")
async def delete_pod(
    pod_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    pod = db.query(Pod).filter(Pod.id == pod_id, Pod.eventId == current_user.eventId).first()
    if not pod:
        raise HTTPException(status_code=404, detail="POD not found")
        
    # Block deletion if teams are assigned
    team_count = db.query(Team).filter(Team.podId == pod.id).count()
    if team_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete POD '{pod.name}'. There are {team_count} teams currently assigned to it. Please reassign the teams first."
        )
        
    log_audit(db, current_user.id, "pod.delete", "Pod", pod.id, {"name": pod.name})
    db.delete(pod)
    db.commit()
    return {"message": "POD deleted successfully"}

@router.post("/pods/assign-teams")
async def assign_teams_to_pod(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    team_ids = payload.get("teamIds", [])
    pod_id = payload.get("podId") # Can be null to unassign
    force = payload.get("force", False)
    
    if not team_ids:
        raise HTTPException(status_code=400, detail="No teams selected for assignment")
        
    pod = None
    if pod_id:
        pod = db.query(Pod).filter(Pod.id == pod_id, Pod.eventId == current_user.eventId).first()
        if not pod:
            raise HTTPException(status_code=404, detail="POD not found")
            
    # Batch retrieve teams
    teams = db.query(Team).filter(Team.id.in_(team_ids), Team.eventId == current_user.eventId).all()
    
    # Conflict check
    if pod_id and not force:
        conflicts = []
        for team in teams:
            if team.podId and team.podId != pod_id:
                conflicts.append({
                    "teamId": team.id,
                    "teamName": team.name,
                    "podName": team.pod.name if team.pod else "Unknown"
                })
        if conflicts:
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=409,
                content={"conflicts": conflicts}
            )
            
    # Batch update
    for team in teams:
        old_pod = team.podId
        if old_pod != pod_id:
            team.podId = pod_id
            log_audit(db, current_user.id, "team.pod_changed", "Team", team.id, {
                "podId": {"from": old_pod, "to": pod_id}
            })
            
    db.commit()
    return {"message": f"Successfully updated POD assignments for {len(teams)} teams"}

@router.get("/pods/{pod_id}/export")
async def export_pod_roster(
    pod_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    pod = db.query(Pod).filter(Pod.id == pod_id, Pod.eventId == current_user.eventId).first()
    if not pod:
        raise HTTPException(status_code=404, detail="POD not found")
        
    import io
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Title
    writer.writerow([f"ROSTER FOR POD GROUP: {pod.name.upper()}"])
    writer.writerow([])
    
    # Section 1: Assigned Volunteers
    writer.writerow(["VOLUNTEERS POOL"])
    writer.writerow(["Name", "Type", "Contact Details"])
    volunteers = db.query(Volunteer).filter(Volunteer.podId == pod.id).all()
    for v in volunteers:
        writer.writerow([v.name, v.type.value, v.contact])
    writer.writerow([])
    
    # Section 2: Assigned Teams
    writer.writerow(["ASSIGNED TEAMS"])
    writer.writerow(["Team Code", "Team Name", "Leader Name", "Leader Email", "Leader Phone", "College Name", "Status"])
    teams = db.query(Team).filter(Team.podId == pod.id).order_by(Team.registrationId).all()
    for t in teams:
        writer.writerow([t.registrationId, t.name, t.leaderName, t.leaderEmail, t.leaderPhone, t.collegeName, t.status.value])
        
    output.seek(0)
    
    headers = {
        'Content-Disposition': f'attachment; filename="pod_{pod.name.replace(" ", "_")}_roster.csv"',
        'Content-Type': 'text/csv'
    }
    
    return StreamingResponse(iter([output.getvalue()]), headers=headers)


# ==========================================
# VOLUNTEERS MANAGEMENT
# ==========================================

@router.get("/volunteers")
async def get_volunteers(
    search: Optional[str] = None,
    type: Optional[str] = None,
    podId: Optional[str] = None,
    page: Optional[int] = None,
    limit: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    query = db.query(Volunteer).filter(Volunteer.eventId == current_user.eventId)
    
    if search:
        search_escaped = escape_like_string(search.strip())
        query = query.filter(
            or_(
                Volunteer.name.ilike(f"%{search_escaped}%"),
                Volunteer.contact.ilike(f"%{search_escaped}%")
            )
        )
        
    if type:
        query = query.filter(Volunteer.type == type)
        
    if podId:
        query = query.filter(Volunteer.podId == podId)
        
    if page is not None or limit is not None:
        p = page or 1
        l = limit or 10
        total = query.count()
        volunteers = query.order_by(Volunteer.name).offset((p - 1) * l).limit(l).all()
        
        results = []
        for v in volunteers:
            pod_name = v.pod.name if v.pod else None
            user_rec = v.user
            results.append({
                "id": v.id,
                "eventId": v.eventId,
                "name": v.name,
                "type": v.type.value,
                "contact": v.contact,
                "podId": v.podId,
                "podName": pod_name,
                "username": user_rec.username if user_rec else None,
                "hasLogin": user_rec is not None
            })
            
        import math
        pages = math.ceil(total / l)
        return {
            "results": results,
            "total": total,
            "page": p,
            "pages": pages if pages > 0 else 1
        }
        
    volunteers = query.order_by(Volunteer.name).all()
    results = []
    for v in volunteers:
        pod_name = v.pod.name if v.pod else None
        user_rec = v.user
        results.append({
            "id": v.id,
            "eventId": v.eventId,
            "name": v.name,
            "type": v.type.value,
            "contact": v.contact,
            "podId": v.podId,
            "podName": pod_name,
            "username": user_rec.username if user_rec else None,
            "hasLogin": user_rec is not None
        })
    return results

@router.post("/volunteers", response_model=VolunteerResponse)
async def create_volunteer(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    name = str(payload.get("name", "")).strip()
    type_str = payload.get("type")
    contact = str(payload.get("contact", "")).strip()
    pod_id = payload.get("podId")
    
    if not name or not type_str or not contact:
        raise HTTPException(status_code=400, detail="Name, type, and contact are required")
        
    try:
        type_enum = VolunteerType(type_str)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid volunteer type: {type_str}")
        
    if pod_id:
        pod = db.query(Pod).filter(Pod.id == pod_id, Pod.eventId == current_user.eventId).first()
        if not pod:
            raise HTTPException(status_code=404, detail="POD group not found")
            
    generate_login = payload.get("generateLogin", True)

    volunteer = Volunteer(
        eventId=current_user.eventId,
        name=name,
        type=type_enum,
        contact=contact,
        podId=pod_id or None
    )
    db.add(volunteer)
    db.commit()
    db.refresh(volunteer)
    
    generated_username = None
    generated_password = None
    if generate_login:
        generated_username = generate_unique_volunteer_username(db, name)
        generated_password = generate_random_password()
        
        volunteer_user = User(
            eventId=current_user.eventId,
            username=generated_username,
            passwordHash=get_password_hash(generated_password),
            role=Role.VOLUNTEER,
            volunteerId=volunteer.id
        )
        db.add(volunteer_user)
        db.commit()
        db.refresh(volunteer)
    
    pod_name = volunteer.pod.name if volunteer.pod else None
    return VolunteerResponse(
        id=volunteer.id,
        eventId=volunteer.eventId,
        name=volunteer.name,
        type=volunteer.type,
        contact=volunteer.contact,
        podId=volunteer.podId,
        podName=pod_name,
        username=generated_username,
        hasLogin=generate_login,
        generatedPassword=generated_password
    )

@router.patch("/volunteers/{volunteer_id}", response_model=VolunteerResponse)
async def update_volunteer(
    volunteer_id: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    volunteer = db.query(Volunteer).filter(Volunteer.id == volunteer_id, Volunteer.eventId == current_user.eventId).first()
    if not volunteer:
        raise HTTPException(status_code=404, detail="Volunteer not found")
        
    diff = {}
    if "name" in payload:
        name = str(payload["name"]).strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        if volunteer.name != name:
            diff["name"] = {"from": volunteer.name, "to": name}
            volunteer.name = name
            
    if "type" in payload:
        try:
            new_type = VolunteerType(payload["type"])
            if volunteer.type != new_type:
                diff["type"] = {"from": volunteer.type, "to": new_type}
                volunteer.type = new_type
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid type: {payload['type']}")
            
    if "contact" in payload:
        contact = str(payload["contact"]).strip()
        if not contact:
            raise HTTPException(status_code=400, detail="Contact cannot be empty")
        if volunteer.contact != contact:
            diff["contact"] = {"from": volunteer.contact, "to": contact}
            volunteer.contact = contact
            
    if "podId" in payload:
        pod_id = payload["podId"]
        if pod_id:
            pod = db.query(Pod).filter(Pod.id == pod_id, Pod.eventId == current_user.eventId).first()
            if not pod:
                raise HTTPException(status_code=404, detail="POD not found")
        if volunteer.podId != pod_id:
            diff["podId"] = {"from": volunteer.podId, "to": pod_id}
            volunteer.podId = pod_id or None
            
    if diff:
        log_audit(db, current_user.id, "volunteer.edit", "Volunteer", volunteer.id, diff)
        db.commit()
        db.refresh(volunteer)
        
    pod_name = volunteer.pod.name if volunteer.pod else None
    return VolunteerResponse(
        id=volunteer.id,
        eventId=volunteer.eventId,
        name=volunteer.name,
        type=volunteer.type,
        contact=volunteer.contact,
        podId=volunteer.podId,
        podName=pod_name
    )

@router.delete("/volunteers/{volunteer_id}")
async def delete_volunteer(
    volunteer_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    v = db.query(Volunteer).filter(Volunteer.id == volunteer_id, Volunteer.eventId == current_user.eventId).first()
    if not v:
        raise HTTPException(status_code=404, detail="Volunteer not found")
        
    log_audit(db, current_user.id, "volunteer.delete", "Volunteer", v.id, {"name": v.name})
    db.delete(v)
    db.commit()
    return {"message": "Volunteer deleted successfully"}


@router.post("/volunteers/{volunteer_id}/login", response_model=VolunteerResponse)
async def create_volunteer_login(
    volunteer_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    v = db.query(Volunteer).filter(Volunteer.id == volunteer_id, Volunteer.eventId == current_user.eventId).first()
    if not v:
        raise HTTPException(status_code=404, detail="Volunteer not found")
    
    if v.user:
        raise HTTPException(status_code=400, detail="Volunteer already has a login account")
        
    username = generate_unique_volunteer_username(db, v.name)
    password = generate_random_password()
    
    vol_user = User(
        eventId=current_user.eventId,
        username=username,
        passwordHash=get_password_hash(password),
        role=Role.VOLUNTEER,
        volunteerId=v.id
    )
    db.add(vol_user)
    db.commit()
    db.refresh(v)
    
    pod_name = v.pod.name if v.pod else None
    return VolunteerResponse(
        id=v.id,
        eventId=v.eventId,
        name=v.name,
        type=v.type,
        contact=v.contact,
        podId=v.podId,
        podName=pod_name,
        username=username,
        hasLogin=True,
        generatedPassword=password
    )


@router.delete("/volunteers/{volunteer_id}/login")
async def revoke_volunteer_login(
    volunteer_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    v = db.query(Volunteer).filter(Volunteer.id == volunteer_id, Volunteer.eventId == current_user.eventId).first()
    if not v:
        raise HTTPException(status_code=404, detail="Volunteer not found")
        
    if not v.user:
        raise HTTPException(status_code=400, detail="Volunteer does not have a login account")
        
    log_audit(db, current_user.id, "volunteer.revoke_login", "User", v.user.id, {"username": v.user.username})
    db.delete(v.user)
    db.commit()
    return {"message": "Volunteer login revoked successfully"}


@router.post("/volunteers/{volunteer_id}/reset-password")
async def reset_volunteer_password(
    volunteer_id: str,
    payload: Dict[str, Any] = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    v = db.query(Volunteer).filter(Volunteer.id == volunteer_id, Volunteer.eventId == current_user.eventId).first()
    if not v:
        raise HTTPException(status_code=404, detail="Volunteer not found")
        
    if not v.user:
        raise HTTPException(status_code=400, detail="Volunteer does not have a login account")
        
    password = (payload or {}).get("password")
    if not password:
        password = generate_random_password()
        
    v.user.passwordHash = get_password_hash(password)
    db.commit()
    
    return {
        "message": "Password reset successfully",
        "username": v.user.username,
        "password": password
    }


@router.post("/teams/{team_id}/reset-password")
async def reset_team_password(
    team_id: str,
    payload: Dict[str, Any] = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    team = db.query(Team).filter(Team.id == team_id, Team.eventId == current_user.eventId).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
        
    if not team.user:
        username = team.registrationId.lower()
        password = generate_random_password()
        leader_user = User(
            eventId=current_user.eventId,
            username=username,
            passwordHash=get_password_hash(password),
            role=Role.LEADER,
            teamId=team.id
        )
        db.add(leader_user)
        db.commit()
        return {
            "message": "Login account created and password set",
            "username": username,
            "password": password
        }
        
    password = (payload or {}).get("password")
    if not password:
        password = generate_random_password()
        
    team.user.passwordHash = get_password_hash(password)
    db.commit()
    
    return {
        "message": "Password reset successfully",
        "username": team.user.username,
        "password": password
    }


# ==========================================
# VOLUNTEERS CSV IMPORT PREVIEW & CONFIRM
# ==========================================

@router.post("/volunteers/import/preview")
async def import_volunteers_preview(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Invalid file type. Only CSV files allowed.")
        
    contents = await file.read()
    if len(contents) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 2MB limit.")
        
    try:
        from io import StringIO
        csv_data = StringIO(contents.decode('utf-8'))
        df = pd.read_csv(csv_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing CSV: {str(e)}")
        
    # Check headers
    required = ["name", "type", "contact"]
    for col in required:
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Missing column: {col}")
            
    preview_data = {
        "new": [],
        "invalid": []
    }
    
    for index, row_series in df.iterrows():
        row = row_series.to_dict()
        row_num = index + 1
        
        name = str(row.get("name", "")).strip()
        type_str = str(row.get("type", "")).strip().upper()
        contact = str(row.get("contact", "")).strip()
        
        if not name or name.lower() == "nan":
            preview_data["invalid"].append({"row": row_num, "reason": "Missing Name"})
            continue
            
        if not type_str or type_str.lower() == "nan" or type_str not in ["FACULTY", "STUDENT"]:
            preview_data["invalid"].append({"row": row_num, "reason": f"Type must be FACULTY or STUDENT. Got '{type_str}'"})
            continue
            
        if not contact or contact.lower() == "nan":
            preview_data["invalid"].append({"row": row_num, "reason": "Missing Contact Info"})
            continue
            
        # Prep row payload
        preview_data["new"].append({
            "name": name,
            "type": type_str,
            "contact": contact,
            "row": row_num
        })
        
    pending = PendingImport(
        eventId=current_user.eventId,
        type="volunteer",
        payload={"new": preview_data["new"]}
    )
    db.add(pending)
    db.commit()
    
    return {
        "importId": pending.id,
        "summary": {
            "new": len(preview_data["new"]),
            "invalid": len(preview_data["invalid"])
        },
        "details": {
            "invalid": preview_data["invalid"]
        }
    }

@router.post("/volunteers/import/confirm")
async def import_volunteers_confirm(
    importId: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    pending = db.query(PendingImport).filter(
        PendingImport.id == importId,
        PendingImport.eventId == current_user.eventId
    ).first()
    
    if not pending or pending.type != "volunteer":
        raise HTTPException(status_code=404, detail="Pending import not found")
        
    payload = pending.payload
    new_volunteers = payload.get("new", [])
    generated_credentials = []
    
    try:
        for row in new_volunteers:
            v = Volunteer(
                eventId=current_user.eventId,
                name=row["name"],
                type=VolunteerType(row["type"]),
                contact=row["contact"]
            )
            db.add(v)
            db.flush() # Populate ID
            
            # Generate Login
            gen_username = generate_unique_volunteer_username(db, v.name)
            gen_password = generate_random_password()
            
            vol_user = User(
                eventId=current_user.eventId,
                username=gen_username,
                passwordHash=get_password_hash(gen_password),
                role=Role.VOLUNTEER,
                volunteerId=v.id
            )
            db.add(vol_user)
            generated_credentials.append({
                "name": v.name,
                "username": gen_username,
                "password": gen_password
            })
            
        db.delete(pending)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database write error: {str(e)}")
        
    return {
        "message": f"Successfully imported {len(new_volunteers)} volunteers",
        "credentials": generated_credentials
    }


# ==========================================
# PROBLEM STATEMENT (PS) MANAGEMENT
# ==========================================

@router.get("/problem-statements", response_model=List[ProblemStatementResponse])
async def get_problem_statements(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
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
            remainingCapacity=max(s.capacity - s.selectedCount, 0),
            requirements=s.requirements
        ) for s in statements
    ]

@router.post("/problem-statements/import/preview")
async def import_problem_statements_preview(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Invalid file type. Only CSV files allowed.")
        
    contents = await file.read()
    if len(contents) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File exceeds 2MB limit.")
        
    try:
        from io import StringIO
        csv_data = StringIO(contents.decode('utf-8'))
        df = pd.read_csv(csv_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing CSV: {str(e)}")
        
    # Check headers
    required = ["code", "title", "description", "capacity"]
    for col in required:
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Missing column: {col}")
            
    preview_data = {
        "new": [],
        "invalid": []
    }
    
    unique_codes = set()
    
    for index, row_series in df.iterrows():
        row = row_series.to_dict()
        row_num = index + 1
        
        code = str(row.get("code", "")).strip().upper()
        title = str(row.get("title", "")).strip()
        description = str(row.get("description", "")).strip()
        capacity_raw = row.get("capacity")
        requirements = str(row.get("requirements", "")).strip() if row.get("requirements") is not None and pd.notna(row.get("requirements")) else None
        if requirements == "nan" or not requirements:
            requirements = None
        
        if not code or code.lower() == "nan":
            preview_data["invalid"].append({"row": row_num, "reason": "Missing Code (e.g. PS01)"})
            continue
            
        if code in unique_codes:
            preview_data["invalid"].append({"row": row_num, "reason": f"Duplicate Code '{code}' inside the CSV itself"})
            continue
        unique_codes.add(code)
        
        if not title or title.lower() == "nan":
            preview_data["invalid"].append({"row": row_num, "reason": "Missing Title"})
            continue
            
        if not description or description.lower() == "nan":
            preview_data["invalid"].append({"row": row_num, "reason": "Missing Description"})
            continue
            
        try:
            capacity = int(capacity_raw)
            if capacity <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            preview_data["invalid"].append({"row": row_num, "reason": f"Capacity must be a positive integer. Got '{capacity_raw}'"})
            continue
            
        preview_data["new"].append({
            "code": code,
            "title": title,
            "description": description,
            "capacity": capacity,
            "requirements": requirements,
            "row": row_num
        })
        
    pending = PendingImport(
        eventId=current_user.eventId,
        type="ps",
        payload={"new": preview_data["new"]}
    )
    db.add(pending)
    db.commit()
    
    return {
        "importId": pending.id,
        "summary": {
            "new": len(preview_data["new"]),
            "invalid": len(preview_data["invalid"])
        },
        "details": {
            "invalid": preview_data["invalid"]
        }
    }

@router.post("/problem-statements/import/confirm")
async def import_problem_statements_confirm(
    importId: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    pending = db.query(PendingImport).filter(
        PendingImport.id == importId,
        PendingImport.eventId == current_user.eventId
    ).first()
    
    if not pending or pending.type != "ps":
        raise HTTPException(status_code=404, detail="Pending import not found")
        
    payload = pending.payload
    new_statements = payload.get("new", [])
    
    try:
        for row in new_statements:
            ps = ProblemStatement(
                eventId=current_user.eventId,
                code=row["code"],
                title=row["title"],
                description=row["description"],
                capacity=row["capacity"],
                requirements=row.get("requirements")
            )
            db.add(ps)
            
        db.delete(pending)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database write error: {str(e)}")
        
    return {"message": f"Successfully imported {len(new_statements)} problem statements"}

@router.get("/problem-statements/{ps_id}/teams")
async def get_ps_selected_teams(
    ps_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    ps = db.query(ProblemStatement).filter(
        ProblemStatement.id == ps_id,
        ProblemStatement.eventId == current_user.eventId
    ).first()
    
    if not ps:
        raise HTTPException(status_code=404, detail="Problem Statement not found")
        
    selections = db.query(PSSelection).filter(PSSelection.psId == ps.id).all()
    
    results = []
    for sel in selections:
        results.append({
            "teamId": sel.team.id,
            "registrationId": sel.team.registrationId,
            "teamName": sel.team.name,
            "leaderName": sel.team.leaderName,
            "leaderEmail": sel.team.leaderEmail,
            "selectedAt": sel.selectedAt
        })
        
    return results


# ==========================================
# EVENT CONFIGS & RELEASE CONFIGS
# ==========================================

@router.get("/config")
async def get_event_config(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    config = db.query(EventConfig).filter(EventConfig.eventId == current_user.eventId).first()
    if not config:
        # Auto-create if not existing
        config = EventConfig(eventId=current_user.eventId)
        db.add(config)
        db.commit()
        db.refresh(config)
        
    return {
        "psReleaseAt": config.psReleaseAt.replace(tzinfo=timezone.utc) if config.psReleaseAt else None
    }

@router.patch("/config/ps-release-at")
async def update_ps_release_time(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    config = db.query(EventConfig).filter(EventConfig.eventId == current_user.eventId).first()
    if not config:
        config = EventConfig(eventId=current_user.eventId)
        db.add(config)
        db.flush()
        
    release_at_raw = payload.get("psReleaseAt")
    
    if release_at_raw:
        try:
            # Parse ISO string (FastAPI/Pydantic or general parsing)
            # Remove Z suffix if present to read with datetime
            clean_str = str(release_at_raw).replace("Z", "+00:00")
            release_at = datetime.fromisoformat(clean_str)
            # Convert to naive UTC for db standard if it has tzinfo
            if release_at.tzinfo:
                release_at = release_at.astimezone(timezone.utc).replace(tzinfo=None)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid date format. Provide ISO 8601 string.")
            
        # Validate: Cannot be in the past relative to server time
        now = datetime.utcnow()
        if release_at < now - timedelta(minutes=5): # 5 min leeway for clock drift
            raise HTTPException(
                status_code=400, 
                detail="Release time cannot be set in the past."
            )
            
        # Logging Audit Log
        diff = {"psReleaseAt": {"from": config.psReleaseAt, "to": release_at}}
        config.psReleaseAt = release_at
    else:
        diff = {"psReleaseAt": {"from": config.psReleaseAt, "to": None}}
        config.psReleaseAt = None
        
    log_audit(db, current_user.id, "config.ps_release_change", "EventConfig", config.id, diff)
    db.commit()
    
    return {
        "message": "Problem statement release time configured successfully!",
        "psReleaseAt": config.psReleaseAt.replace(tzinfo=timezone.utc) if config.psReleaseAt else None
    }


# ==========================================
# ATTENDANCE CHECKPOINTS CRUD
# ==========================================

@router.get("/checkpoints", response_model=List[CheckpointTypeResponse])
async def get_checkpoints(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    return db.query(CheckpointType).filter(CheckpointType.eventId == current_user.eventId).order_by(CheckpointType.name).all()

@router.post("/checkpoints", response_model=CheckpointTypeResponse)
async def create_checkpoint(
    payload: CheckpointTypeCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    existing = db.query(CheckpointType).filter(
        CheckpointType.eventId == current_user.eventId,
        CheckpointType.name == payload.name.strip()
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="A checkpoint with this name already exists")

    cp = CheckpointType(
        eventId=current_user.eventId,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None
    )
    db.add(cp)
    db.commit()
    db.refresh(cp)

    log_audit(db, current_user.id, "checkpoint.create", "CheckpointType", cp.id, {
        "name": cp.name,
        "description": cp.description
    })
    db.commit()
    return cp

@router.patch("/checkpoints/{id}", response_model=CheckpointTypeResponse)
async def update_checkpoint(
    id: str,
    payload: CheckpointTypeUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    cp = db.query(CheckpointType).filter(
        CheckpointType.id == id,
        CheckpointType.eventId == current_user.eventId
    ).first()
    if not cp:
        raise HTTPException(status_code=404, detail="Checkpoint not found")

    diff = {}
    if payload.name is not None:
        name_clean = payload.name.strip()
        if not name_clean:
            raise HTTPException(status_code=400, detail="Checkpoint name cannot be empty")
        
        if name_clean != cp.name:
            existing = db.query(CheckpointType).filter(
                CheckpointType.eventId == current_user.eventId,
                CheckpointType.name == name_clean
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail="A checkpoint with this name already exists")
            
        diff["name"] = {"from": cp.name, "to": name_clean}
        cp.name = name_clean

    if payload.description is not None:
        desc_clean = payload.description.strip() or None
        diff["description"] = {"from": cp.description, "to": desc_clean}
        cp.description = desc_clean

    if diff:
        log_audit(db, current_user.id, "checkpoint.update", "CheckpointType", cp.id, diff)
        db.commit()
        db.refresh(cp)
    
    return cp

@router.delete("/checkpoints/{id}")
async def delete_checkpoint(
    id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    cp = db.query(CheckpointType).filter(
        CheckpointType.id == id,
        CheckpointType.eventId == current_user.eventId
    ).first()
    if not cp:
        raise HTTPException(status_code=404, detail="Checkpoint not found")

    has_records = db.query(AttendanceRecord).filter(AttendanceRecord.checkpointTypeId == id).first()
    if has_records:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete checkpoint because it has logged attendance records. Delete or clear the attendance records first."
        )

    log_audit(db, current_user.id, "checkpoint.delete", "CheckpointType", cp.id, {
        "name": cp.name,
        "description": cp.description
    })
    db.delete(cp)
    db.commit()
    return {"message": "Checkpoint deleted successfully"}


