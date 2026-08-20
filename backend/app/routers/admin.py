import re
import csv
import uuid
import random
import secrets
import string
import traceback
import pandas as pd
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_, func

import io
import asyncio
from app.database import get_db

from app.logger import logger
from app.models import (
    User, Role, Team, TeamMember, TeamStatus, Pod, Volunteer, 
    VolunteerType, ProblemStatement, PSSelection, AuditLog, 
    PendingImport, EventConfig, CheckpointType, AttendanceRecord,
    Panel, EvaluationRound, Submission, Discipline, RefreshToken
)
from app.auth import require_role, CurrentUser, get_password_hash
from app.schemas import (
    TeamResponse, TeamDetailResponse, AuditLogResponse, 
    PodResponse, VolunteerResponse, ProblemStatementResponse,
    CheckpointTypeCreate, CheckpointTypeUpdate, CheckpointTypeResponse,
    PanelCreate, PanelUpdate, PanelResponse,
    EvaluationRoundCreate, EvaluationRoundUpdate, EvaluationRoundResponse,
    ProblemStatementCreate, ProblemStatementUpdate
)

router = APIRouter(prefix="/admin", tags=["admin"])

# Helper: Escape SQL LIKE wildcards
def escape_like_string(s: str) -> str:
    return s.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')

# Helper: CSV formula injection prevention
def csv_safe(value: Any) -> str:
    s = str(value) if value is not None else ""
    if s and s[0] in ('=', '+', '-', '@'):
        return "'" + s
    return s

def safe_writerow(writer: Any, row: List[Any]) -> None:
    writer.writerow([csv_safe(v) for v in row])

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

# Helper: Generate random password (CSPRNG)
def generate_random_password(length: int = 12) -> str:
    chars = string.ascii_letters + string.digits
    return "".join(secrets.choice(chars) for _ in range(length))

# Helper: Generate team leader password (First 5 digits of Leader Mobile + Team ID / Code)
def generate_team_leader_password(leader_phone: str, registration_id: str) -> str:
    digits = re.sub(r'\D', '', str(leader_phone or ''))
    if len(digits) == 12 and digits.startswith('91'):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith('0'):
        digits = digits[1:]
    first_five = digits[:5]
    team_id_clean = "".join(str(registration_id or "").split())
    if first_five and team_id_clean:
        return f"{first_five}{team_id_clean}"
    elif team_id_clean:
        return f"{team_id_clean}123!"
    return generate_random_password()

# Helper: Revoke all active refresh tokens for a user (force logout of all sessions)
def revoke_all_sessions(db: Session, user_id: str):
    db.query(RefreshToken).filter(
        RefreshToken.userId == user_id,
        RefreshToken.revoked == False
    ).update({"revoked": True})

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
def get_teams(
    search: Optional[str] = None,
    status: Optional[TeamStatus] = None,
    category: Optional[str] = None,
    podId: Optional[str] = None,
    hasPod: Optional[bool] = None,
    hasPs: Optional[bool] = None,
    hasDesk: Optional[bool] = None,
    deskNumber: Optional[str] = None,
    psId: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    query = db.query(Team).options(
        joinedload(Team.pod),
        joinedload(Team.psSelection).joinedload(PSSelection.ps),
        joinedload(Team.members)
    ).filter(Team.eventId == current_user.eventId)
    
    # Filters
    if status:
        query = query.filter(Team.status == status)
    if category:
        try:
            cat_enum = Discipline(category.upper())
            query = query.filter(Team.category == cat_enum)
        except ValueError:
            pass
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
    if hasDesk is not None:
        if hasDesk:
            query = query.filter(Team.deskNumber.isnot(None), Team.deskNumber != '')
        else:
            query = query.filter(or_(Team.deskNumber.is_(None), Team.deskNumber == ''))
    if deskNumber:
        escaped_desk = escape_like_string(deskNumber)
        query = query.filter(Team.deskNumber.ilike(f"%{escaped_desk}%"))
    if psId:
        query = query.filter(Team.psSelection.has(PSSelection.psId == psId))
        
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
            
        cat_val = team.category.value if hasattr(team.category, 'value') else (team.category or "ENGINEERING")
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
            "category": cat_val,
            "deskNumber": team.deskNumber,
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

@router.get("/teams/export")
def export_teams(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    teams = db.query(Team).filter(Team.eventId == current_user.eventId).order_by(Team.registrationId).all()
    
    import io
    output = io.StringIO()
    writer = csv.writer(output)
    
    headers = [
        "Team Code", "Team Name", "Category", "Desk Number", "Leader Name", "Leader Email", "Leader Phone", 
        "College Name", "Status", "POD Grouping", "Selected PS Code", "Selected PS Title"
    ]
    for i in range(1, 6):
        headers.extend([
            f"Member {i} Name", f"Member {i} Email", f"Member {i} Phone", f"Member {i} ID Verified"
        ])
    safe_writerow(writer, headers)
    
    for team in teams:
        pod_name = team.pod.name if team.pod else "Unassigned"
        ps_code = team.psSelection.ps.code if team.psSelection else "None"
        ps_title = team.psSelection.ps.title if team.psSelection else "None"
        status_val = team.status.value if hasattr(team.status, 'value') else str(team.status or "")
        cat_val = team.category.value if hasattr(team.category, 'value') else str(team.category or "ENGINEERING")
        
        row = [
            team.registrationId,
            team.name,
            cat_val,
            team.deskNumber or "",
            team.leaderName,
            team.leaderEmail,
            team.leaderPhone,
            team.collegeName,
            status_val,
            pod_name,
            ps_code,
            ps_title
        ]

        
        members = team.members
        for i in range(5):
            if i < len(members):
                m = members[i]
                row.extend([m.name, m.email, m.phone, "Yes" if m.idVerified else "No"])
            else:
                row.extend(["", "", "", ""])
                
        safe_writerow(writer, row)
        
    output.seek(0)
    
    headers = {
        'Content-Disposition': 'attachment; filename="teams_roster_export.csv"',
        'Content-Type': 'text/csv'
    }
    return StreamingResponse(iter([output.getvalue()]), headers=headers)

@router.get("/teams/unresolved-leaders")
def get_unresolved_leaders_report(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    teams = db.query(Team).options(joinedload(Team.members)).filter(Team.eventId == current_user.eventId).all()
    unresolved = []
    for t in teams:
        has_leader = any(m.isTeamLeader for m in t.members)
        if not has_leader:
            unresolved.append({
                "teamId": t.id,
                "name": t.name,
                "registrationId": t.registrationId,
                "leaderEmail": t.leaderEmail
            })
    return {
        "totalUnresolved": len(unresolved),
        "teams": unresolved
    }

@router.get("/teams/{team_id}", response_model=TeamDetailResponse)
def get_team_detail(
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

@router.put("/teams/{team_id}")
@router.patch("/teams/{team_id}")
def patch_team(
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
        
    # Valid fields to edit on Team
    allowed_updates = [
        "name", "registrationId", "collegeName", 
        "leaderName", "leaderEmail", "leaderPhone", 
        "podId", "status", "deskNumber", "category"
    ]
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
        elif key == "category":
            try:
                val_str = str(value).upper() if value else ""
                value = Discipline(val_str)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid category: {value}")
        
        if old_val != value:
            # Strict check for Pod Capacity Limit
            if key == "podId" and value:
                pod = db.query(Pod).filter(Pod.id == value).first()
                if pod and pod.capacity is not None:
                    assigned_count = db.query(Team).filter(Team.podId == value).count()
                    if assigned_count >= pod.capacity:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Cannot assign team to {pod.name}. The POD group is already at full capacity ({assigned_count}/{pod.capacity})."
                        )
            
            diff[key] = {"from": old_val if old_val is not None else None, "to": value if value is not None else None}
            setattr(team, key, value)

    # Process Team Roster (members list) update if provided
    if "members" in payload and isinstance(payload["members"], list):
        existing_members = db.query(TeamMember).filter(TeamMember.teamId == team.id).all()
        existing_map = {m.id: m for m in existing_members}
        payload_member_ids = set()

        for m_data in payload["members"]:
            m_id = m_data.get("id")
            if m_id and m_id in existing_map:
                payload_member_ids.add(m_id)
                tm = existing_map[m_id]
                tm.name = m_data.get("name", tm.name)
                tm.email = m_data.get("email", tm.email)
                tm.phone = m_data.get("phone", tm.phone)
                if "isTeamLeader" in m_data:
                    tm.isTeamLeader = bool(m_data["isTeamLeader"])
            else:
                # Add new team member
                new_tm = TeamMember(
                    teamId=team.id,
                    name=m_data.get("name", ""),
                    email=m_data.get("email", ""),
                    phone=m_data.get("phone", ""),
                    isTeamLeader=bool(m_data.get("isTeamLeader", False))
                )
                db.add(new_tm)
                db.flush()
                payload_member_ids.add(new_tm.id)

        # Remove members not in payload
        for m_id, tm in existing_map.items():
            if m_id not in payload_member_ids:
                db.delete(tm)
            
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
    
    # Batch load all existing teams and their members in a single query
    existing_teams_map = {
        t.registrationId: t
        for t in db.query(Team).options(joinedload(Team.members)).filter(Team.eventId == current_user.eventId).all()
    }

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
            
        # Determine leader and category
        leader = next((m for m in parsed_members if m["lead"]), parsed_members[0])
        
        raw_cat = ""
        for key, val in row.items():
            k_lower = str(key).strip().lower()
            if any(term in k_lower for term in ["category", "discipline", "track", "domain", "stream", "department"]):
                if val and str(val).strip() and str(val).strip().lower() != "nan":
                    raw_cat = str(val).strip()
                    break

        if not raw_cat:
            raw_cat = f"{team_name} {leader.get('college', '')}"

        team_cat = Discipline.DESIGN.value if "design" in raw_cat.lower() else Discipline.ENGINEERING.value
        
        # Prepare row payload
        row_payload = {
            "registrationId": reg_id,
            "name": team_name,
            "leaderName": leader["name"],
            "leaderEmail": leader["email"],
            "leaderPhone": leader["phone"],
            "collegeName": leader["college"] or "Unknown College",
            "category": team_cat,
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
            
        # Compare with in-memory map (0 network latency)
        db_team = existing_teams_map.get(reg_id)
        
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
def import_teams_confirm(
    importId: str,
    decisions: Optional[Dict[str, str]] = None, # key: registrationId, value: "update" | "skip"
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
    decisions = decisions or {}
    
    generated_credentials = []
    
    # Use transactional block
    try:
        # Batch load existing teams and users in single queries
        existing_teams_map = {
            t.registrationId: t
            for t in db.query(Team).filter(Team.eventId == current_user.eventId).all()
        }
        existing_users_map = {
            u.username.lower(): u
            for u in db.query(User).filter(User.eventId == current_user.eventId).all()
        }

        # 1. Process New Teams
        for row in new_teams:
            reg_id = str(row["registrationId"]).strip()
            cat_val = str(row.get("category", "ENGINEERING")).strip().upper()
            cat_enum = Discipline.DESIGN if cat_val == "DESIGN" else Discipline.ENGINEERING

            # Check if team already exists (idempotency safety)
            team = existing_teams_map.get(reg_id)

            if not team:
                team = Team(
                    eventId=current_user.eventId,
                    registrationId=reg_id,
                    name=str(row["name"]).strip()[:255],
                    leaderName=str(row["leaderName"]).strip()[:255],
                    leaderEmail=str(row["leaderEmail"]).strip()[:255],
                    leaderPhone=str(row["leaderPhone"]).strip()[:50],
                    collegeName=str(row["collegeName"]).strip()[:255],
                    category=cat_enum
                )
                db.add(team)
                db.flush() # Populate team.id
                existing_teams_map[reg_id] = team
            else:
                team.name = str(row["name"]).strip()[:255]
                team.leaderName = str(row["leaderName"]).strip()[:255]
                team.leaderEmail = str(row["leaderEmail"]).strip()[:255]
                team.leaderPhone = str(row["leaderPhone"]).strip()[:50]
                team.collegeName = str(row["collegeName"]).strip()[:255]
                team.category = cat_enum
                # Delete existing members to re-insert
                db.query(TeamMember).filter(TeamMember.teamId == team.id).delete()
            
            # Create Team Members
            for member_data in row["members"]:
                is_leader = (str(member_data.get("email", "")).strip().lower() == team.leaderEmail.strip().lower())
                member = TeamMember(
                    teamId=team.id,
                    name=str(member_data["name"]).strip()[:255],
                    email=str(member_data["email"]).strip()[:255],
                    phone=str(member_data.get("phone", "")).strip()[:50],
                    isTeamLeader=is_leader
                )
                db.add(member)
                
            # Create or Update Leader User Login Account
            raw_password = generate_team_leader_password(team.leaderPhone, team.registrationId)
            leader_username = reg_id.lower()
            
            existing_user = existing_users_map.get(leader_username)
            
            if existing_user:
                existing_user.passwordHash = get_password_hash(raw_password)
                existing_user.role = Role.LEADER
                existing_user.teamId = team.id
            else:
                leader_user = User(
                    eventId=current_user.eventId,
                    username=leader_username,
                    passwordHash=get_password_hash(raw_password),
                    role=Role.LEADER,
                    teamId=team.id
                )
                db.add(leader_user)
                existing_users_map[leader_username] = leader_user
            
            generated_credentials.append({
                "teamName": team.name,
                "registrationId": reg_id,
                "username": leader_username,
                "password": raw_password
            })
            
        # 2. Process Changed Teams
        for row in changed_teams:
            reg_id = str(row["registrationId"]).strip()
            decision = decisions.get(reg_id, "update")
            
            if decision == "skip":
                continue
                
            # Fetch existing team
            db_team = existing_teams_map.get(reg_id)
            
            if not db_team:
                continue # Safety skip
                
            diff = {}
            
            # Log changes
            for key in ["name", "leaderName", "leaderEmail", "leaderPhone", "collegeName", "category"]:
                old_val = getattr(db_team, key)
                if hasattr(old_val, "value"):
                    old_val = old_val.value
                new_val = row[key]
                if old_val != new_val:
                    diff[key] = {"from": old_val, "to": new_val}
                    if key == "category":
                        cat_str = str(new_val).strip().upper()
                        setattr(db_team, key, Discipline.DESIGN if cat_str == "DESIGN" else Discipline.ENGINEERING)
                    elif key == "leaderPhone":
                        setattr(db_team, key, str(new_val).strip()[:50])
                    else:
                        setattr(db_team, key, str(new_val).strip()[:255])
                    
            # Delete old team members and insert new ones
            db.query(TeamMember).filter(TeamMember.teamId == db_team.id).delete()
            for member_data in row["members"]:
                is_leader = (str(member_data.get("email", "")).strip().lower() == db_team.leaderEmail.strip().lower())
                member = TeamMember(
                    teamId=db_team.id,
                    name=str(member_data["name"]).strip()[:255],
                    email=str(member_data["email"]).strip()[:255],
                    phone=str(member_data.get("phone", "")).strip()[:50],
                    isTeamLeader=is_leader
                )
                db.add(member)
                
            diff["members"] = row.get("changes", {}).get("members", {})
            
            # Update user account and sync password
            raw_password = generate_team_leader_password(db_team.leaderPhone, db_team.registrationId)
            db_user = existing_users_map.get(reg_id.lower())

            if db_user:
                db_user.username = reg_id.lower()
                db_user.passwordHash = get_password_hash(raw_password)
                db_user.teamId = db_team.id
                db_user.role = Role.LEADER
            else:
                db_user = User(
                    eventId=current_user.eventId,
                    username=reg_id.lower(),
                    passwordHash=get_password_hash(raw_password),
                    role=Role.LEADER,
                    teamId=db_team.id
                )
                db.add(db_user)
                existing_users_map[reg_id.lower()] = db_user

            generated_credentials.append({
                "teamName": db_team.name,
                "registrationId": reg_id,
                "username": reg_id.lower(),
                "password": raw_password
            })
                
            log_audit(
                db=db,
                actor_id=current_user.id,
                action="team.csv_update",
                entity_type="Team",
                entity_id=db_team.id,
                diff=diff
            )

        # 3. Include Unchanged Teams in Credentials List
        unchanged_teams = payload.get("unchanged", [])
        for row in unchanged_teams:
            reg_id = str(row["registrationId"]).strip()
            db_team = existing_teams_map.get(reg_id)
            if db_team:
                raw_password = generate_team_leader_password(db_team.leaderPhone, db_team.registrationId)
                db_user = existing_users_map.get(reg_id.lower())
                if not db_user:
                    db_user = User(
                        eventId=current_user.eventId,
                        username=reg_id.lower(),
                        passwordHash=get_password_hash(raw_password),
                        role=Role.LEADER,
                        teamId=db_team.id
                    )
                    db.add(db_user)
                    existing_users_map[reg_id.lower()] = db_user
                generated_credentials.append({
                    "teamName": db_team.name,
                    "registrationId": reg_id,
                    "username": reg_id.lower(),
                    "password": raw_password
                })
            
        # Delete Pending Import row
        db.delete(pending)
        
        # Commit transaction
        db.commit()
        
    except Exception as e:
        db.rollback()
        logger.error(f"[TEAM IMPORT FAILED] Error: {e}\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"Error executing database writes, full transaction rolled back: {str(e)}"
        )
        
    return {
        "message": "CSV data successfully imported!",
        "credentials": generated_credentials
    }


@router.get("/teams/export-credentials")
def export_team_credentials(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    teams = db.query(Team).filter(Team.eventId == current_user.eventId).order_by(Team.registrationId).all()
    credentials = []
    for t in teams:
        pwd = generate_team_leader_password(t.leaderPhone, t.registrationId)
        credentials.append({
            "teamName": t.name,
            "registrationId": t.registrationId,
            "username": t.registrationId.lower(),
            "password": pwd,
            "leaderName": t.leaderName,
            "leaderPhone": t.leaderPhone,
            "leaderEmail": t.leaderEmail
        })
    return {"credentials": credentials, "total": len(credentials)}

# ==========================================
# PODS (GROUPING) MANAGEMENT
# ==========================================

@router.get("/pods", response_model=List[PodResponse])
def get_pods(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    pods = db.query(Pod).options(
        joinedload(Pod.teams),
        joinedload(Pod.volunteers)
    ).filter(Pod.eventId == current_user.eventId).order_by(Pod.name).all()
    
    results = []
    for pod in pods:
        results.append(PodResponse(
            id=pod.id,
            eventId=pod.eventId,
            name=pod.name,
            capacity=pod.capacity,
            teamCount=len(pod.teams),
            volunteerCount=len(pod.volunteers)
        ))
        
    return results

@router.post("/pods", response_model=PodResponse)
def create_pod(
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

@router.put("/pods/{pod_id}", response_model=PodResponse)
@router.patch("/pods/{pod_id}", response_model=PodResponse)
def update_pod(
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
        try:
            new_cap = int(capacity) if capacity is not None else None
        except ValueError:
            raise HTTPException(status_code=400, detail="Capacity must be a valid number")
            
        if new_cap is None or new_cap < 1:
            raise HTTPException(status_code=400, detail="Capacity must be at least 1")
            
        team_count = db.query(Team).filter(Team.podId == pod.id).count()
        if new_cap < team_count:
            raise HTTPException(status_code=400, detail=f"Cannot reduce capacity to {new_cap} because {team_count} teams are currently assigned to this POD.")
            
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
def delete_pod(
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
def assign_teams_to_pod(
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
    assigned_names = []
    skipped_names = []
    
    current_assigned = db.query(Team).filter(Team.podId == pod_id).count() if pod_id else 0
    spots_left = pod.capacity - current_assigned if (pod and pod.capacity is not None) else len(teams)
    if spots_left < 0:
        spots_left = 0

    for team in teams:
        old_pod = team.podId
        if old_pod == pod_id:
            continue
            
        if pod_id:
            if spots_left > 0:
                team.podId = pod_id
                log_audit(db, current_user.id, "team.pod_changed", "Team", team.id, {
                    "podId": {"from": old_pod, "to": pod_id}
                })
                assigned_names.append(team.name)
                spots_left -= 1
            else:
                skipped_names.append(team.name)
        else:
            # Unassigning
            team.podId = None
            log_audit(db, current_user.id, "team.pod_changed", "Team", team.id, {
                "podId": {"from": old_pod, "to": None}
            })
            assigned_names.append(team.name)

    db.commit()
    
    if skipped_names:
        msg = (
            f"Assigned {len(assigned_names)} teams to {pod.name}. "
            f"Skipped {len(skipped_names)} teams due to capacity limit ({pod.capacity}): {', '.join(skipped_names)}."
        )
    else:
        if pod_id:
            msg = f"Successfully assigned {len(assigned_names)} teams to {pod.name}."
        else:
            msg = f"Successfully unassigned {len(assigned_names)} teams from POD."
            
    return {"message": msg}

@router.get("/pods/export")
def export_pods(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    pods = db.query(Pod).options(
        joinedload(Pod.teams),
        joinedload(Pod.volunteers)
    ).filter(Pod.eventId == current_user.eventId).order_by(Pod.name).all()
    
    import io
    output = io.StringIO()
    writer = csv.writer(output)
    
    safe_writerow(writer, [
        "POD Name", "Capacity Limit", "Current Team Count", 
        "Assigned Faculty", "Assigned Student Volunteers", "Assigned Teams"
    ])
    
    for p in pods:
        faculty = [v.name for v in p.volunteers if v.type == VolunteerType.FACULTY]
        students = [v.name for v in p.volunteers if v.type == VolunteerType.STUDENT]
        teams_list = [t.name for t in p.teams]
        
        safe_writerow(writer, [
            p.name,
            p.capacity if p.capacity is not None else "",
            len(p.teams),
            ", ".join(faculty),
            ", ".join(students),
            ", ".join(teams_list)
        ])
        
    output.seek(0)
    
    headers = {
        'Content-Disposition': 'attachment; filename="pods_export.csv"',
        'Content-Type': 'text/csv'
    }
    return StreamingResponse(iter([output.getvalue()]), headers=headers)


@router.post("/pods/import/preview")
async def import_pods_preview(
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
        
    required = ["name"]
    for col in required:
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Missing column: {col}")
            
    preview_data = {
        "new": [],
        "changed": [],
        "unchanged": [],
        "invalid": []
    }
    
    unique_names = set()
    
    for index, row_series in df.iterrows():
        row = row_series.to_dict()
        row_num = index + 1
        
        name = str(row.get("name", "")).strip()
        capacity_raw = row.get("capacity")
        
        if not name or name.lower() == "nan":
            preview_data["invalid"].append({"row": row_num, "reason": "Missing POD Name"})
            continue
            
        if name.lower() in unique_names:
            preview_data["invalid"].append({"row": row_num, "reason": f"Duplicate POD name '{name}' inside the CSV itself"})
            continue
        unique_names.add(name.lower())
        
        capacity = None
        if capacity_raw is not None and pd.notna(capacity_raw) and str(capacity_raw).strip() != "":
            try:
                capacity = int(capacity_raw)
                if capacity <= 0:
                    raise ValueError()
            except (ValueError, TypeError):
                preview_data["invalid"].append({"row": row_num, "reason": f"Capacity must be a positive integer. Got '{capacity_raw}'"})
                continue
        
        existing_pod = db.query(Pod).filter(Pod.name.ilike(name), Pod.eventId == current_user.eventId).first()
        if existing_pod:
            changes = {}
            if existing_pod.capacity != capacity:
                changes["capacity"] = {"from": existing_pod.capacity, "to": capacity}
            
            if changes:
                preview_data["changed"].append({
                    "name": existing_pod.name,
                    "changes": changes,
                    "new_data": {"name": existing_pod.name, "capacity": capacity},
                    "row": row_num
                })
            else:
                preview_data["unchanged"].append({"name": existing_pod.name, "row": row_num})
        else:
            preview_data["new"].append({
                "name": name,
                "capacity": capacity,
                "row": row_num
            })
        
    pending = PendingImport(
        eventId=current_user.eventId,
        type="pod",
        payload={"new": preview_data["new"], "changed": preview_data["changed"]}
    )
    db.add(pending)
    db.commit()
    
    return {
        "importId": pending.id,
        "summary": {
            "new": len(preview_data["new"]),
            "changed": len(preview_data["changed"]),
            "unchanged": len(preview_data["unchanged"]),
            "invalid": len(preview_data["invalid"])
        },
        "details": {
            "changed": preview_data["changed"],
            "invalid": preview_data["invalid"]
        }
    }


@router.post("/pods/import/confirm")
def import_pods_confirm(
    importId: str,
    decisions: Optional[Dict[str, str]] = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    pending = db.query(PendingImport).filter(
        PendingImport.id == importId,
        PendingImport.eventId == current_user.eventId
    ).first()
    
    if not pending or pending.type != "pod":
        raise HTTPException(status_code=404, detail="Pending import not found")
        
    payload = pending.payload
    new_pods = payload.get("new", [])
    changed_pods = payload.get("changed", [])
    decisions = decisions or {}
    
    try:
        # 1. Insert new PODs
        for row in new_pods:
            pod = Pod(
                eventId=current_user.eventId,
                name=row["name"],
                capacity=row.get("capacity")
            )
            db.add(pod)
            
        # 2. Update changed PODs
        for item in changed_pods:
            pod_name = item["name"]
            if decisions.get(pod_name, "update") == "update":
                pod = db.query(Pod).filter(Pod.name.ilike(pod_name), Pod.eventId == current_user.eventId).first()
                if pod:
                    new_data = item["new_data"]
                    if "capacity" in new_data:
                        pod.capacity = new_data["capacity"]
            
        db.delete(pending)
        db.commit()
        return {"message": "Successfully processed POD groups import"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database write error: {str(e)}")


@router.get("/pods/{pod_id}/export")
def export_pod_roster(
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
    safe_writerow(writer, [f"ROSTER FOR POD GROUP: {pod.name.upper()}"])
    safe_writerow(writer, [])
    
    # Section 1: Assigned Volunteers
    safe_writerow(writer, ["VOLUNTEERS POOL"])
    safe_writerow(writer, ["Name", "Type", "Contact Details"])
    volunteers = db.query(Volunteer).filter(Volunteer.podId == pod.id).all()
    for v in volunteers:
        vol_type_str = v.type.value if hasattr(v.type, 'value') else str(v.type or "")
        safe_writerow(writer, [v.name, vol_type_str, v.contact])
    safe_writerow(writer, [])
    
    # Section 2: Assigned Teams
    safe_writerow(writer, ["ASSIGNED TEAMS"])
    safe_writerow(writer, ["Team Code", "Team Name", "Leader Name", "Leader Email", "Leader Phone", "College Name", "Status"])
    teams = db.query(Team).filter(Team.podId == pod.id).order_by(Team.registrationId).all()
    for t in teams:
        safe_writerow(writer, [t.registrationId, t.name, t.leaderName, t.leaderEmail, t.leaderPhone, t.collegeName, t.status.value])
        
    output.seek(0)
    
    headers = {
        'Content-Disposition': f'attachment; filename="pod_{pod.name.replace(" ", "_")}_roster.csv"',
        'Content-Type': 'text/csv'
    }
    
    return StreamingResponse(iter([output.getvalue()]), headers=headers)


# ==========================================
# VOLUNTEERS MANAGEMENT
# ==========================================

@router.get("/volunteers/export")
def export_volunteers(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    volunteers = db.query(Volunteer).options(
        joinedload(Volunteer.pod),
        joinedload(Volunteer.user)
    ).filter(Volunteer.eventId == current_user.eventId).order_by(Volunteer.name).all()
    
    import io
    output = io.StringIO()
    writer = csv.writer(output)
    
    safe_writerow(writer, [
        "Name", "Type", "Email", "Phone", "Assigned POD Group", "Login Access Created", "Username"
    ])
    
    for v in volunteers:
        pod_name = v.pod.name if v.pod else "Unassigned"
        
        email = ""
        phone = ""
        if v.contact:
            if " | " in v.contact:
                parts = v.contact.split(" | ")
                email = parts[0]
                phone = parts[1]
            elif "@" in v.contact:
                email = v.contact
            else:
                phone = v.contact
                
        has_login = "Yes" if v.user else "No"
        username = v.user.username if v.user else ""
        
        vol_type_str = v.type.value if hasattr(v.type, 'value') else str(v.type or "")
        safe_writerow(writer, [
            v.name,
            vol_type_str,
            email,
            phone,
            pod_name,
            has_login,
            username
        ])
        
    output.seek(0)
    
    headers = {
        'Content-Disposition': 'attachment; filename="volunteers_export.csv"',
        'Content-Type': 'text/csv'
    }
    return StreamingResponse(iter([output.getvalue()]), headers=headers)


@router.get("/volunteers")
def get_volunteers(
    search: Optional[str] = None,
    type: Optional[str] = None,
    podId: Optional[str] = None,
    page: Optional[int] = None,
    limit: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    query = db.query(Volunteer).options(
        joinedload(Volunteer.pod),
        joinedload(Volunteer.panel),
        joinedload(Volunteer.problemStatement),
        joinedload(Volunteer.user)
    ).filter(Volunteer.eventId == current_user.eventId)
    
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
            panel_id = v.panelId or (v.panel.id if v.panel else None)
            panel_name = v.panel.name if v.panel else None
            ps_code = v.problemStatement.code if v.problemStatement else (v.panel.problemStatement.code if v.panel and v.panel.problemStatement else None)
            ps_title = v.problemStatement.title if v.problemStatement else (v.panel.problemStatement.title if v.panel and v.panel.problemStatement else None)
            team_name = v.team.name if v.team else None
            user_rec = v.user
            results.append({
                "id": v.id,
                "eventId": v.eventId,
                "name": v.name,
                "type": v.type.value if hasattr(v.type, 'value') else str(v.type),
                "contact": v.contact,
                "remarks": v.remarks,
                "podId": v.podId,
                "podName": pod_name,
                "panelId": panel_id,
                "panelName": panel_name,
                "problemStatementId": v.problemStatementId,
                "problemStatementCode": ps_code,
                "problemStatementTitle": ps_title,
                "teamId": v.teamId,
                "teamName": team_name,
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
        panel_id = v.panelId or (v.panel.id if v.panel else None)
        panel_name = v.panel.name if v.panel else None
        ps_code = v.problemStatement.code if v.problemStatement else (v.panel.problemStatement.code if v.panel and v.panel.problemStatement else None)
        ps_title = v.problemStatement.title if v.problemStatement else (v.panel.problemStatement.title if v.panel and v.panel.problemStatement else None)
        team_name = v.team.name if v.team else None
        user_rec = v.user
        results.append({
            "id": v.id,
            "eventId": v.eventId,
            "name": v.name,
            "type": v.type.value if hasattr(v.type, 'value') else str(v.type),
            "contact": v.contact,
            "remarks": v.remarks,
            "podId": v.podId,
            "podName": pod_name,
            "panelId": panel_id,
            "panelName": panel_name,
            "problemStatementId": v.problemStatementId,
            "problemStatementCode": ps_code,
            "problemStatementTitle": ps_title,
            "teamId": v.teamId,
            "teamName": team_name,
            "username": user_rec.username if user_rec else None,
            "hasLogin": user_rec is not None
        })
    return results

DEFAULT_PEOPLE_ROLES = [
    {"name": "Faculty Lead", "target": "pod"},
    {"name": "Judge / Evaluator", "target": "ps"},
    {"name": "Student Coordinator", "target": "pod"},
    {"name": "Volunteer / Monitor", "target": "pod"},
    {"name": "Event Organizer", "target": "pod"},
    {"name": "Student Assistant", "target": "pod"}
]

def normalize_people_roles(roles_list):
    if not roles_list:
        return DEFAULT_PEOPLE_ROLES
    res = []
    for r in roles_list:
        if isinstance(r, dict):
            res.append({
                "name": r.get("name", ""),
                "target": r.get("target", "pod")
            })
        elif isinstance(r, str):
            target = "ps" if ("judge" in r.lower() or "evaluator" in r.lower()) else "pod"
            res.append({"name": r, "target": target})
    return res

@router.get("/people-roles")
def get_people_roles(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    config = db.query(EventConfig).filter(EventConfig.eventId == current_user.eventId).first()
    if config and config.peopleRoles:
        return normalize_people_roles(config.peopleRoles)
    return DEFAULT_PEOPLE_ROLES

@router.post("/people-roles")
def add_people_role(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    role_name = str(payload.get("role", "")).strip()
    if not role_name:
        raise HTTPException(status_code=400, detail="Role name is required")

    target = str(payload.get("target", "pod")).strip().lower()
    if target not in ["pod", "ps", "team"]:
        target = "pod"

    config = db.query(EventConfig).filter(EventConfig.eventId == current_user.eventId).first()
    if not config:
        config = EventConfig(eventId=current_user.eventId, peopleRoles=DEFAULT_PEOPLE_ROLES)
        db.add(config)
        db.flush()

    raw_roles = normalize_people_roles(config.peopleRoles or DEFAULT_PEOPLE_ROLES)
    existing_names = [r["name"] for r in raw_roles]
    
    if role_name not in existing_names:
        raw_roles.append({"name": role_name, "target": target})
        config.peopleRoles = raw_roles
        db.commit()
    return raw_roles

@router.delete("/people-roles/{role_name}")
def delete_people_role(
    role_name: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    config = db.query(EventConfig).filter(EventConfig.eventId == current_user.eventId).first()
    if not config:
        config = EventConfig(eventId=current_user.eventId, peopleRoles=DEFAULT_PEOPLE_ROLES)
        db.add(config)
        db.flush()

    raw_roles = normalize_people_roles(config.peopleRoles or DEFAULT_PEOPLE_ROLES)
    filtered = [r for r in raw_roles if r["name"] != role_name]
    config.peopleRoles = filtered
    db.commit()
    return filtered

def sync_volunteer_panel_assignment(
    db: Session,
    volunteer: Volunteer,
    panel_id: Optional[str] = None,
    ps_id: Optional[str] = None,
    event_id: str = None
):
    """
    Guarantees that a volunteer/judge is ALWAYS assigned to a Panel (and via Panel to a Problem Statement).
    Prevents orphaned judges by automatically creating a Panel for a Problem Statement if one doesn't exist.
    Bidirectionally syncs volunteer.panelId, volunteer.problemStatementId, panel.memberNames, and panel.facultyMemberName.
    """
    event_id = event_id or volunteer.eventId

    # 1. Remove volunteer from any existing Panel where their name appears in memberNames or facultyMemberName
    existing_panels = db.query(Panel).filter(Panel.eventId == event_id).all()
    for p in existing_panels:
        if p.facultyMemberName == volunteer.name and (panel_id != p.id):
            p.facultyMemberName = None
        if p.memberNames and volunteer.name in p.memberNames and (panel_id != p.id):
            p.memberNames = [m for m in p.memberNames if m != volunteer.name]

    # 2. Find or auto-create target Panel
    target_panel = None
    if panel_id:
        target_panel = db.query(Panel).filter(Panel.id == panel_id, Panel.eventId == event_id).first()
    elif ps_id:
        target_panel = db.query(Panel).filter(Panel.problemStatementId == ps_id, Panel.eventId == event_id).first()
        if not target_panel:
            ps_obj = db.query(ProblemStatement).filter(ProblemStatement.id == ps_id, ProblemStatement.eventId == event_id).first()
            if ps_obj:
                target_panel = Panel(
                    eventId=event_id,
                    name=f"Panel {ps_obj.code}",
                    problemStatementId=ps_obj.id,
                    memberNames=[]
                )
                db.add(target_panel)
                db.flush()
                logger.info(f"Auto-created Panel '{target_panel.name}' for Problem Statement {ps_obj.code}")

    # 3. Apply assignment
    if target_panel:
        volunteer.panelId = target_panel.id
        volunteer.problemStatementId = target_panel.problemStatementId

        is_faculty = "faculty" in str(volunteer.type).lower()
        if is_faculty:
            target_panel.facultyMemberName = volunteer.name
        else:
            members = list(target_panel.memberNames or [])
            if volunteer.name not in members:
                members.append(volunteer.name)
                target_panel.memberNames = members
    else:
        volunteer.panelId = None
        volunteer.problemStatementId = None

def sync_panel_volunteers(db: Session, panel: Panel, event_id: str):
    """
    Ensures all volunteers listed in panel.memberNames or panel.facultyMemberName
    have their volunteer.panelId and volunteer.problemStatementId synced to this panel.
    Also clears panelId for volunteers who were removed from this panel.
    """
    all_volunteers = db.query(Volunteer).filter(Volunteer.eventId == event_id).all()
    panel_member_names = set(panel.memberNames or [])
    if panel.facultyMemberName:
        panel_member_names.add(panel.facultyMemberName)

    for v in all_volunteers:
        if v.name in panel_member_names:
            v.panelId = panel.id
            v.problemStatementId = panel.problemStatementId
        elif v.panelId == panel.id and v.name not in panel_member_names:
            v.panelId = None
            v.problemStatementId = None

@router.post("/volunteers", response_model=VolunteerResponse)
def create_volunteer(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    name = str(payload.get("name", "")).strip()
    type_str = payload.get("type")
    contact = str(payload.get("contact", "")).strip()
    remarks = str(payload.get("remarks", "")).strip() or None
    pod_id = payload.get("podId")
    panel_id = payload.get("panelId")
    ps_id = payload.get("problemStatementId")
    team_id = payload.get("teamId")
    
    if not name or not type_str or not contact:
        raise HTTPException(status_code=400, detail="Name, type, and contact are required")
        
    type_val = str(type_str).strip()
        
    if pod_id:
        pod = db.query(Pod).filter(Pod.id == pod_id, Pod.eventId == current_user.eventId).first()
        if not pod:
            raise HTTPException(status_code=404, detail="POD group not found")

    if team_id:
        t_rec = db.query(Team).filter(Team.id == team_id, Team.eventId == current_user.eventId).first()
        if not t_rec:
            raise HTTPException(status_code=404, detail="Team not found")

    generate_login = payload.get("generateLogin", True)

    volunteer = Volunteer(
        eventId=current_user.eventId,
        name=name,
        type=type_val,
        contact=contact,
        remarks=remarks,
        podId=pod_id or None,
        teamId=team_id or None
    )
    db.add(volunteer)
    db.flush()

    if panel_id or ps_id:
        sync_volunteer_panel_assignment(db, volunteer, panel_id=panel_id, ps_id=ps_id, event_id=current_user.eventId)

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
    panel_name = volunteer.panel.name if volunteer.panel else None
    ps_code = volunteer.problemStatement.code if volunteer.problemStatement else (volunteer.panel.problemStatement.code if volunteer.panel and volunteer.panel.problemStatement else None)
    ps_title = volunteer.problemStatement.title if volunteer.problemStatement else (volunteer.panel.problemStatement.title if volunteer.panel and volunteer.panel.problemStatement else None)
    team_name = volunteer.team.name if volunteer.team else None

    return VolunteerResponse(
        id=volunteer.id,
        eventId=volunteer.eventId,
        name=volunteer.name,
        type=volunteer.type,
        contact=volunteer.contact,
        remarks=volunteer.remarks,
        podId=volunteer.podId,
        podName=pod_name,
        panelId=volunteer.panelId,
        panelName=panel_name,
        problemStatementId=volunteer.problemStatementId,
        problemStatementCode=ps_code,
        problemStatementTitle=ps_title,
        teamId=volunteer.teamId,
        teamName=team_name,
        username=generated_username,
        hasLogin=generated_username is not None,
        generatedPassword=generated_password
    )

@router.put("/volunteers/{volunteer_id}", response_model=VolunteerResponse)
@router.patch("/volunteers/{volunteer_id}", response_model=VolunteerResponse)
def update_volunteer(
    volunteer_id: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    volunteer = db.query(Volunteer).filter(Volunteer.id == volunteer_id, Volunteer.eventId == current_user.eventId).first()
    if not volunteer:
        raise HTTPException(status_code=404, detail="Volunteer/Person not found")
        
    diff = {}
    if "name" in payload:
        name = str(payload["name"]).strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        if volunteer.name != name:
            diff["name"] = {"from": volunteer.name, "to": name}
            volunteer.name = name
            
    if "type" in payload:
        new_type = str(payload["type"]).strip()
        if volunteer.type != new_type:
            diff["type"] = {"from": volunteer.type, "to": new_type}
            volunteer.type = new_type
            
    if "contact" in payload:
        contact = str(payload["contact"]).strip()
        if not contact:
            raise HTTPException(status_code=400, detail="Contact cannot be empty")
        if volunteer.contact != contact:
            diff["contact"] = {"from": volunteer.contact, "to": contact}
            volunteer.contact = contact

    if "remarks" in payload:
        remarks = str(payload["remarks"]).strip() or None
        if volunteer.remarks != remarks:
            diff["remarks"] = {"from": volunteer.remarks, "to": remarks}
            volunteer.remarks = remarks
            
    if "podId" in payload:
        pod_id = payload["podId"]
        if pod_id:
            pod = db.query(Pod).filter(Pod.id == pod_id, Pod.eventId == current_user.eventId).first()
            if not pod:
                raise HTTPException(status_code=404, detail="POD not found")
        if volunteer.podId != pod_id:
            diff["podId"] = {"from": volunteer.podId, "to": pod_id}
            volunteer.podId = pod_id or None

    if "panelId" in payload or "problemStatementId" in payload:
        panel_id = payload.get("panelId")
        ps_id = payload.get("problemStatementId")
        sync_volunteer_panel_assignment(db, volunteer, panel_id=panel_id, ps_id=ps_id, event_id=current_user.eventId)

    if "teamId" in payload:
        t_id = payload["teamId"]
        if t_id:
            t_rec = db.query(Team).filter(Team.id == t_id, Team.eventId == current_user.eventId).first()
            if not t_rec:
                raise HTTPException(status_code=404, detail="Team not found")
        if volunteer.teamId != t_id:
            diff["teamId"] = {"from": volunteer.teamId, "to": t_id}
            volunteer.teamId = t_id or None
            
    if diff:
        log_audit(db, current_user.id, "volunteer.edit", "Volunteer", volunteer.id, diff)

    db.commit()
    db.refresh(volunteer)
        
    pod_name = volunteer.pod.name if volunteer.pod else None
    panel_name = volunteer.panel.name if volunteer.panel else None
    ps_code = volunteer.problemStatement.code if volunteer.problemStatement else (volunteer.panel.problemStatement.code if volunteer.panel and volunteer.panel.problemStatement else None)
    ps_title = volunteer.problemStatement.title if volunteer.problemStatement else (volunteer.panel.problemStatement.title if volunteer.panel and volunteer.panel.problemStatement else None)
    team_name = volunteer.team.name if volunteer.team else None

    return VolunteerResponse(
        id=volunteer.id,
        eventId=volunteer.eventId,
        name=volunteer.name,
        type=volunteer.type,
        contact=volunteer.contact,
        remarks=volunteer.remarks,
        podId=volunteer.podId,
        podName=pod_name,
        panelId=volunteer.panelId,
        panelName=panel_name,
        problemStatementId=volunteer.problemStatementId,
        problemStatementCode=ps_code,
        problemStatementTitle=ps_title,
        teamId=volunteer.teamId,
        teamName=team_name
    )

@router.delete("/volunteers/{volunteer_id}")
def delete_volunteer(
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
def create_volunteer_login(
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
def revoke_volunteer_login(
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
def reset_volunteer_password(
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
    revoke_all_sessions(db, v.user.id)
    db.commit()
    
    return {
        "message": "Password reset successfully",
        "username": v.user.username,
        "password": password
    }


@router.post("/teams/{team_id}/reset-password")
def reset_team_password(
    team_id: str,
    payload: Dict[str, Any] = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    team = db.query(Team).filter(Team.id == team_id, Team.eventId == current_user.eventId).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
        
    password = (payload or {}).get("password")
    if not password:
        password = generate_team_leader_password(team.leaderPhone, team.registrationId)
        
    if not team.user:
        username = team.registrationId.lower()
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
        
    team.user.passwordHash = get_password_hash(password)
    revoke_all_sessions(db, team.user.id)
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
    required = ["name", "contact"]
    for col in required:
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Missing column: {col}")
            
    preview_data = {
        "new": [],
        "changed": [],
        "unchanged": [],
        "invalid": []
    }
    
    valid_types = [t.value for t in VolunteerType]
    unique_contacts = set()
    
    for index, row_series in df.iterrows():
        row = row_series.to_dict()
        row_num = index + 1
        
        name = str(row.get("name", "")).strip()
        type_str = str(row.get("type", "VOLUNTEER")).strip().upper()
        contact = str(row.get("contact", "")).strip()
        remarks = str(row.get("remarks", "")).strip() if row.get("remarks") is not None and pd.notna(row.get("remarks")) else None
        if remarks == "nan" or not remarks:
            remarks = None
        
        if not name or name.lower() == "nan":
            preview_data["invalid"].append({"row": row_num, "reason": "Missing Name"})
            continue
            
        if type_str not in valid_types:
            type_str = "VOLUNTEER"
            
        if not contact or contact.lower() == "nan":
            preview_data["invalid"].append({"row": row_num, "reason": "Missing Contact Info"})
            continue
            
        if contact.lower() in unique_contacts:
            preview_data["invalid"].append({"row": row_num, "reason": f"Duplicate contact '{contact}' inside the CSV itself"})
            continue
        unique_contacts.add(contact.lower())
        
        # Primary Key match by contact
        existing_vol = db.query(Volunteer).filter(
            Volunteer.contact.ilike(contact),
            Volunteer.eventId == current_user.eventId
        ).first()
        
        if existing_vol:
            changes = {}
            if existing_vol.name != name:
                changes["name"] = {"from": existing_vol.name, "to": name}
            vol_type_str = existing_vol.type.value if hasattr(existing_vol.type, 'value') else str(existing_vol.type or "")
            if vol_type_str != type_str:
                changes["type"] = {"from": vol_type_str, "to": type_str}
            if (existing_vol.remarks or "") != (remarks or ""):
                changes["remarks"] = {"from": existing_vol.remarks or "None", "to": remarks or "None"}
                
            if changes:
                preview_data["changed"].append({
                    "name": existing_vol.name,
                    "contact": contact,
                    "changes": changes,
                    "new_data": {"name": name, "type": type_str, "contact": contact, "remarks": remarks},
                    "row": row_num
                })
            else:
                preview_data["unchanged"].append({"name": existing_vol.name, "contact": contact, "row": row_num})
        else:
            preview_data["new"].append({
                "name": name,
                "type": type_str,
                "contact": contact,
                "remarks": remarks,
                "row": row_num
            })
        
    pending = PendingImport(
        eventId=current_user.eventId,
        type="volunteer",
        payload={"new": preview_data["new"], "changed": preview_data["changed"]}
    )
    db.add(pending)
    db.commit()
    
    return {
        "importId": pending.id,
        "summary": {
            "new": len(preview_data["new"]),
            "changed": len(preview_data["changed"]),
            "unchanged": len(preview_data["unchanged"]),
            "invalid": len(preview_data["invalid"])
        },
        "details": {
            "changed": preview_data["changed"],
            "invalid": preview_data["invalid"]
        }
    }

@router.post("/volunteers/import/confirm")
def import_volunteers_confirm(
    importId: str,
    decisions: Optional[Dict[str, str]] = None,
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
    changed_volunteers = payload.get("changed", [])
    decisions = decisions or {}
    generated_credentials = []
    
    try:
        # 1. Add new volunteers
        for row in new_volunteers:
            raw_type = str(row.get("type", "VOLUNTEER")).strip().upper()
            try:
                vol_type = VolunteerType(raw_type)
            except (ValueError, KeyError):
                vol_type = VolunteerType.VOLUNTEER

            name = str(row["name"]).strip()[:255]
            contact = str(row["contact"]).strip()[:100]

            v = db.query(Volunteer).filter(
                Volunteer.contact.ilike(contact),
                Volunteer.eventId == current_user.eventId
            ).first()

            if not v:
                v = Volunteer(
                    eventId=current_user.eventId,
                    name=name,
                    type=vol_type,
                    contact=contact,
                    remarks=row.get("remarks")
                )
                db.add(v)
                db.flush()
            else:
                v.name = name
                v.type = vol_type
                v.remarks = row.get("remarks")
                db.flush()
            
            vol_user = db.query(User).filter(User.volunteerId == v.id).first()
            gen_password = generate_random_password()
            if not vol_user:
                gen_username = generate_unique_volunteer_username(db, v.name)
                vol_user = User(
                    eventId=current_user.eventId,
                    username=gen_username,
                    passwordHash=get_password_hash(gen_password),
                    role=Role.VOLUNTEER,
                    volunteerId=v.id
                )
                db.add(vol_user)
            else:
                gen_username = vol_user.username
                vol_user.passwordHash = get_password_hash(gen_password)

            generated_credentials.append({
                "name": v.name,
                "username": gen_username,
                "password": gen_password
            })
            
        # 2. Update changed volunteers
        for item in changed_volunteers:
            contact = str(item["contact"]).strip()[:100]
            if decisions.get(contact, "update") == "update":
                vol = db.query(Volunteer).filter(
                    Volunteer.contact.ilike(contact),
                    Volunteer.eventId == current_user.eventId
                ).first()
                if vol:
                    new_data = item["new_data"]
                    raw_type = str(new_data.get("type", "VOLUNTEER")).strip().upper()
                    try:
                        vol_type = VolunteerType(raw_type)
                    except (ValueError, KeyError):
                        vol_type = VolunteerType.VOLUNTEER

                    vol.name = str(new_data["name"]).strip()[:255]
                    vol.type = vol_type
                    vol.remarks = new_data.get("remarks")
                    
                    # Ensure user account has updated password
                    vol_user = db.query(User).filter(User.volunteerId == vol.id).first()
                    gen_password = generate_random_password()
                    if not vol_user:
                        gen_username = generate_unique_volunteer_username(db, vol.name)
                        vol_user = User(
                            eventId=current_user.eventId,
                            username=gen_username,
                            passwordHash=get_password_hash(gen_password),
                            role=Role.VOLUNTEER,
                            volunteerId=vol.id
                        )
                        db.add(vol_user)
                    else:
                        gen_username = vol_user.username
                        vol_user.passwordHash = get_password_hash(gen_password)

                    generated_credentials.append({
                        "name": vol.name,
                        "username": gen_username,
                        "password": gen_password
                    })
            
        db.delete(pending)
        db.commit()
        return {"credentials": generated_credentials, "message": "Successfully processed People & Organizers import"}
    except Exception as e:
        db.rollback()
        logger.error(f"[VOLUNTEER IMPORT FAILED] Error: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Database write error: {str(e)}")


# ==========================================
# PROBLEM STATEMENT (PS) MANAGEMENT
# ==========================================

@router.get("/problem-statements", response_model=List[ProblemStatementResponse])
def get_problem_statements(
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
            capacity=s.capacity or 0,
            selectedCount=s.selectedCount or 0,
            remainingCapacity=max((s.capacity or 0) - (s.selectedCount or 0), 0),
            requirements=s.requirements,
            discipline=s.discipline
        ) for s in statements
    ]


@router.post("/problem-statements", response_model=ProblemStatementResponse)
def create_problem_statement(
    payload: ProblemStatementCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    existing = db.query(ProblemStatement).filter(
        ProblemStatement.eventId == current_user.eventId,
        func.lower(ProblemStatement.code) == payload.code.lower()
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Problem Statement code '{payload.code}' already exists.")

    ps = ProblemStatement(
        eventId=current_user.eventId,
        code=payload.code.strip().upper(),
        title=payload.title.strip(),
        description=payload.description.strip(),
        capacity=payload.capacity,
        requirements=payload.requirements,
        discipline=payload.discipline
    )
    db.add(ps)
    db.commit()
    db.refresh(ps)
    logger.info(f"Created Problem Statement '{ps.code}' (Discipline: {ps.discipline})")
    return ProblemStatementResponse(
        id=ps.id,
        eventId=ps.eventId,
        code=ps.code,
        title=ps.title,
        description=ps.description,
        capacity=ps.capacity,
        selectedCount=ps.selectedCount,
        remainingCapacity=max(ps.capacity - ps.selectedCount, 0),
        requirements=ps.requirements,
        discipline=ps.discipline
    )

@router.put("/problem-statements/{ps_id}", response_model=ProblemStatementResponse)
@router.patch("/problem-statements/{ps_id}", response_model=ProblemStatementResponse)
def update_problem_statement(
    ps_id: str,
    payload: ProblemStatementUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    ps = db.query(ProblemStatement).filter(
        ProblemStatement.id == ps_id,
        ProblemStatement.eventId == current_user.eventId
    ).first()
    if not ps:
        raise HTTPException(status_code=404, detail="Problem Statement not found")

    if payload.code is not None:
        ps.code = payload.code.strip().upper()
    if payload.title is not None:
        ps.title = payload.title.strip()
    if payload.description is not None:
        ps.description = payload.description.strip()
    if payload.capacity is not None:
        ps.capacity = payload.capacity
    if payload.requirements is not None:
        ps.requirements = payload.requirements
    if payload.discipline is not None or "discipline" in payload.model_fields_set:
        ps.discipline = payload.discipline

    db.commit()
    db.refresh(ps)
    logger.info(f"Updated Problem Statement '{ps.code}' (Discipline: {ps.discipline})")
    return ProblemStatementResponse(
        id=ps.id,
        eventId=ps.eventId,
        code=ps.code,
        title=ps.title,
        description=ps.description,
        capacity=ps.capacity,
        selectedCount=ps.selectedCount,
        remainingCapacity=max(ps.capacity - ps.selectedCount, 0),
        requirements=ps.requirements,
        discipline=ps.discipline
    )

@router.delete("/problem-statements/{ps_id}")
def delete_problem_statement(
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

    if ps.selectedCount > 0:
        raise HTTPException(status_code=400, detail="Cannot delete a Problem Statement that has teams selected.")

    db.delete(ps)
    db.commit()
    logger.info(f"Deleted Problem Statement '{ps.code}' (ID: {ps_id})")
    return {"success": True}

@router.get("/problem-statements/export")
def export_problem_statements(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    statements = db.query(ProblemStatement).options(
        joinedload(ProblemStatement.selections).joinedload(PSSelection.team)
    ).filter(ProblemStatement.eventId == current_user.eventId).order_by(ProblemStatement.code).all()
    
    import io
    output = io.StringIO()
    writer = csv.writer(output)
    
    safe_writerow(writer, [
        "Code", "Title", "Discipline", "Requirements", "Description", "Capacity", "Slots Remaining", "Assigned Teams", "Selection Times"
    ])
    
    for s in statements:
        team_names = []
        selection_times = []
        for sel in s.selections:
            team_names.append(f"{sel.team.name} ({sel.team.registrationId})")
            sel_time = sel.selectedAt.strftime("%Y-%m-%d %H:%M:%S") if sel.selectedAt else ""
            selection_times.append(f"{sel.team.name}: {sel_time}")
            
        safe_writerow(writer, [
            s.code,
            s.title,
            s.discipline or "BOTH",
            s.requirements or "",
            s.description,
            s.capacity or 0,
            max((s.capacity or 0) - len(s.selections), 0),
            "; ".join(team_names),
            "; ".join(selection_times)
        ])
        
    output.seek(0)
    
    headers = {
        'Content-Disposition': 'attachment; filename="problem_statements_export.csv"',
        'Content-Type': 'text/csv'
    }
    return StreamingResponse(iter([output.getvalue()]), headers=headers)


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
        "changed": [],
        "unchanged": [],
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
            
        discipline_raw = str(row.get("discipline") or row.get("category") or row.get("track") or "").strip().upper()
        if "DESIGN" in discipline_raw:
            discipline = "DESIGN"
        elif "ENGINEERING" in discipline_raw or "ENG" in discipline_raw:
            discipline = "ENGINEERING"
        else:
            discipline = None
        
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
            
        existing_ps = db.query(ProblemStatement).filter(
            ProblemStatement.code == code,
            ProblemStatement.eventId == current_user.eventId
        ).first()
        
        if existing_ps:
            changes = {}
            if existing_ps.title != title:
                changes["title"] = {"from": existing_ps.title, "to": title}
            if existing_ps.description != description:
                changes["description"] = {"from": existing_ps.description, "to": description}
            if existing_ps.capacity != capacity:
                changes["capacity"] = {"from": existing_ps.capacity, "to": capacity}
            if (existing_ps.requirements or "") != (requirements or ""):
                changes["requirements"] = {"from": existing_ps.requirements or "None", "to": requirements or "None"}
            if (existing_ps.discipline or "") != (discipline or ""):
                changes["discipline"] = {"from": existing_ps.discipline or "BOTH", "to": discipline or "BOTH"}
                
            if changes:
                preview_data["changed"].append({
                    "code": code,
                    "title": existing_ps.title,
                    "changes": changes,
                    "new_data": {
                        "code": code,
                        "title": title,
                        "description": description,
                        "capacity": capacity,
                        "requirements": requirements,
                        "discipline": discipline
                    },
                    "row": row_num
                })
            else:
                preview_data["unchanged"].append({"code": code, "title": existing_ps.title, "row": row_num})
        else:
            preview_data["new"].append({
                "code": code,
                "title": title,
                "description": description,
                "capacity": capacity,
                "requirements": requirements,
                "discipline": discipline,
                "row": row_num
            })
        
    pending = PendingImport(
        eventId=current_user.eventId,
        type="ps",
        payload={"new": preview_data["new"], "changed": preview_data["changed"]}
    )
    db.add(pending)
    db.commit()
    
    return {
        "importId": pending.id,
        "summary": {
            "new": len(preview_data["new"]),
            "changed": len(preview_data["changed"]),
            "unchanged": len(preview_data["unchanged"]),
            "invalid": len(preview_data["invalid"])
        },
        "details": {
            "changed": preview_data["changed"],
            "invalid": preview_data["invalid"]
        }
    }

@router.post("/problem-statements/import/confirm")
def import_problem_statements_confirm(
    importId: str,
    decisions: Optional[Dict[str, str]] = None,
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
    changed_statements = payload.get("changed", [])
    decisions = decisions or {}
    
    try:
        # 1. Add new PS records
        for row in new_statements:
            ps = ProblemStatement(
                eventId=current_user.eventId,
                code=row["code"],
                title=row["title"],
                description=row["description"],
                capacity=row["capacity"],
                requirements=row.get("requirements"),
                discipline=row.get("discipline")
            )
            db.add(ps)
            
        # 2. Update changed PS records
        for item in changed_statements:
            ps_code = item["code"]
            if decisions.get(ps_code, "update") == "update":
                ps = db.query(ProblemStatement).filter(
                    ProblemStatement.code == ps_code,
                    ProblemStatement.eventId == current_user.eventId
                ).first()
                if ps:
                    new_data = item["new_data"]
                    ps.title = new_data["title"]
                    ps.description = new_data["description"]
                    ps.capacity = new_data["capacity"]
                    ps.requirements = new_data.get("requirements")
                    ps.discipline = new_data.get("discipline")
            
        db.delete(pending)
        db.commit()
        return {"message": "Successfully processed Problem Statements import"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database write error: {str(e)}")

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database write error: {str(e)}")

@router.get("/problem-statements/{ps_id}/teams")
def get_ps_selected_teams(
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

def _format_dt_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if not dt:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc)
    return dt.replace(tzinfo=timezone.utc)

@router.get("/config")
def get_event_config(
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
        "psReleaseAt": _format_dt_utc(config.psReleaseAt),
        "psGateCheckpointTypeId": config.psGateCheckpointTypeId,
        "allowVolunteerPsSelection": bool(config.allowVolunteerPsSelection)
    }

@router.put("/config/ps-release-at")
@router.patch("/config/ps-release-at")
def update_ps_release_time(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    config = db.query(EventConfig).filter(EventConfig.eventId == current_user.eventId).first()
    if not config:
        config = EventConfig(eventId=current_user.eventId)
        db.add(config)
        db.flush()
        
    diff = {}
    if "allowVolunteerPsSelection" in payload:
        new_val = bool(payload.get("allowVolunteerPsSelection"))
        diff["allowVolunteerPsSelection"] = {"from": config.allowVolunteerPsSelection, "to": new_val}
        config.allowVolunteerPsSelection = new_val

    if "psGateCheckpointTypeId" in payload:
        new_gate_id = payload.get("psGateCheckpointTypeId")
        diff["psGateCheckpointTypeId"] = {"from": config.psGateCheckpointTypeId, "to": new_gate_id}
        config.psGateCheckpointTypeId = new_gate_id

    if "psReleaseAt" in payload:
        release_at_raw = payload.get("psReleaseAt")
        if release_at_raw:
            try:
                clean_str = str(release_at_raw).replace("Z", "+00:00")
                release_at = datetime.fromisoformat(clean_str)
                if release_at.tzinfo:
                    release_at = release_at.astimezone(timezone.utc).replace(tzinfo=None)
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid date format. Provide ISO 8601 string.")
                
            now = datetime.utcnow()
            if release_at < now - timedelta(minutes=5):
                raise HTTPException(
                    status_code=400, 
                    detail="Release time cannot be set in the past."
                )
                
            diff["psReleaseAt"] = {"from": config.psReleaseAt, "to": release_at}
            config.psReleaseAt = release_at
        else:
            diff["psReleaseAt"] = {"from": config.psReleaseAt, "to": None}
            config.psReleaseAt = None
        
    log_audit(db, current_user.id, "config.update", "EventConfig", config.id, diff)
    db.commit()
    
    return {
        "message": "Event config updated successfully!",
        "psReleaseAt": _format_dt_utc(config.psReleaseAt),
        "psGateCheckpointTypeId": config.psGateCheckpointTypeId,
        "allowVolunteerPsSelection": bool(config.allowVolunteerPsSelection)
    }




# ==========================================
# ATTENDANCE CHECKPOINTS CRUD
# ==========================================

@router.get("/checkpoints", response_model=List[CheckpointTypeResponse])
def get_checkpoints(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    return db.query(CheckpointType).filter(CheckpointType.eventId == current_user.eventId).order_by(CheckpointType.name).all()

@router.post("/checkpoints", response_model=CheckpointTypeResponse)
def create_checkpoint(
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

@router.put("/checkpoints/{id}", response_model=CheckpointTypeResponse)
@router.patch("/checkpoints/{id}", response_model=CheckpointTypeResponse)
def update_checkpoint(
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
def delete_checkpoint(
    id: str,
    force: bool = False,
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
    if has_records and not force:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete checkpoint because it has logged attendance records. Delete or clear the attendance records first."
        )

    if has_records and force:
        # Cascade delete all attendance records first
        record_count = db.query(AttendanceRecord).filter(AttendanceRecord.checkpointTypeId == id).count()
        db.query(AttendanceRecord).filter(AttendanceRecord.checkpointTypeId == id).delete()
        log_audit(db, current_user.id, "checkpoint.clear_records", "CheckpointType", cp.id, {
            "name": cp.name,
            "recordsDeleted": record_count
        })

    log_audit(db, current_user.id, "checkpoint.delete", "CheckpointType", cp.id, {
        "name": cp.name,
        "description": cp.description
    })
    db.delete(cp)
    db.commit()
    return {"message": "Checkpoint deleted successfully"}


@router.delete("/checkpoints/{id}/records")
def clear_checkpoint_records(
    id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    """Clear all attendance records for a specific checkpoint without deleting the checkpoint itself."""
    cp = db.query(CheckpointType).filter(
        CheckpointType.id == id,
        CheckpointType.eventId == current_user.eventId
    ).first()
    if not cp:
        raise HTTPException(status_code=404, detail="Checkpoint not found")

    record_count = db.query(AttendanceRecord).filter(AttendanceRecord.checkpointTypeId == id).count()
    db.query(AttendanceRecord).filter(AttendanceRecord.checkpointTypeId == id).delete()

    # Also reset idVerified on TeamMembers whose only verification was this checkpoint
    # (We leave idVerified as-is since it may be set by other checkpoints too — admin can re-verify)

    log_audit(db, current_user.id, "checkpoint.clear_records", "CheckpointType", cp.id, {
        "name": cp.name,
        "recordsCleared": record_count
    })
    db.commit()
    return {"message": f"Cleared {record_count} attendance record(s) for checkpoint '{cp.name}'", "count": record_count}


# ==========================================
# PANELS & EVALUATION ROSTER EXPORT
# ==========================================

@router.get("/panels", response_model=List[PanelResponse])
def get_panels(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    panels = db.query(Panel).filter(Panel.eventId == current_user.eventId).order_by(Panel.name).all()
    res = []
    for p in panels:
        ps_code = p.problemStatement.code if p.problemStatement else None
        res.append(PanelResponse(
            id=p.id,
            eventId=p.eventId,
            name=p.name,
            facultyMemberName=p.facultyMemberName,
            memberNames=p.memberNames or [],
            problemStatementId=p.problemStatementId,
            problemStatementCode=ps_code
        ))
    return res

@router.post("/panels", response_model=PanelResponse)
def create_panel(
    payload: PanelCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    if payload.problemStatementId:
        existing = db.query(Panel).filter(
            Panel.eventId == current_user.eventId,
            Panel.problemStatementId == payload.problemStatementId
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="This Problem Statement already has a panel assigned.")

    panel = Panel(
        eventId=current_user.eventId,
        name=payload.name,
        facultyMemberName=payload.facultyMemberName,
        memberNames=payload.memberNames,
        problemStatementId=payload.problemStatementId
    )
    db.add(panel)
    db.commit()
    db.refresh(panel)

    sync_panel_volunteers(db, panel, current_user.eventId)
    db.commit()

    logger.info(f"Created Panel '{panel.name}' (ID: {panel.id})")
    ps_code = panel.problemStatement.code if panel.problemStatement else None
    return PanelResponse(
        id=panel.id,
        eventId=panel.eventId,
        name=panel.name,
        facultyMemberName=panel.facultyMemberName,
        memberNames=panel.memberNames or [],
        problemStatementId=panel.problemStatementId,
        problemStatementCode=ps_code
    )

@router.put("/panels/{panel_id}", response_model=PanelResponse)
@router.patch("/panels/{panel_id}", response_model=PanelResponse)
def update_panel(
    panel_id: str,
    payload: PanelUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    panel = db.query(Panel).filter(Panel.id == panel_id, Panel.eventId == current_user.eventId).first()
    if not panel:
        raise HTTPException(status_code=404, detail="Panel not found")

    if payload.problemStatementId is not None and payload.problemStatementId != panel.problemStatementId:
        existing = db.query(Panel).filter(
            Panel.eventId == current_user.eventId,
            Panel.problemStatementId == payload.problemStatementId,
            Panel.id != panel_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="This Problem Statement already has another panel assigned.")
        panel.problemStatementId = payload.problemStatementId

    if payload.name is not None:
        panel.name = payload.name
    if payload.facultyMemberName is not None:
        panel.facultyMemberName = payload.facultyMemberName
    if payload.memberNames is not None:
        panel.memberNames = payload.memberNames

    db.commit()
    db.refresh(panel)

    sync_panel_volunteers(db, panel, current_user.eventId)
    db.commit()

    logger.info(f"Updated Panel '{panel.name}' (ID: {panel.id})")
    ps_code = panel.problemStatement.code if panel.problemStatement else None
    return PanelResponse(
        id=panel.id,
        eventId=panel.eventId,
        name=panel.name,
        facultyMemberName=panel.facultyMemberName,
        memberNames=panel.memberNames or [],
        problemStatementId=panel.problemStatementId,
        problemStatementCode=ps_code
    )

@router.delete("/panels/{panel_id}")
def delete_panel(
    panel_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    panel = db.query(Panel).filter(Panel.id == panel_id, Panel.eventId == current_user.eventId).first()
    if not panel:
        raise HTTPException(status_code=404, detail="Panel not found")
        
    db.query(Volunteer).filter(Volunteer.panelId == panel_id).update(
        {"panelId": None, "problemStatementId": None},
        synchronize_session=False
    )
    db.delete(panel)
    db.commit()
    logger.info(f"Deleted Panel '{panel.name}' (ID: {panel_id})")
    return {"success": True}

@router.get("/evaluation-sheet/export")
def export_evaluation_sheet(
    ps_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    query = (
        db.query(Team)
        .filter(Team.eventId == current_user.eventId)
        .join(PSSelection, PSSelection.teamId == Team.id)
        .join(ProblemStatement, ProblemStatement.id == PSSelection.psId)
        .outerjoin(Panel, Panel.problemStatementId == ProblemStatement.id)
    )
    if ps_id:
        query = query.filter(ProblemStatement.id == ps_id)

    teams = query.order_by(ProblemStatement.code, Team.name).all()

    output = io.StringIO()
    writer = csv.writer(output)
    safe_writerow(writer, [
        "Pod", "Desk/Bench Number", "Team Name", "Team ID", "Leader Name",
        "PS Title", "Panel Number", "Panel Judges", "Faculty Member"
    ])
    for team in teams:
        pod = team.pod
        ps = team.psSelection.ps if team.psSelection else None
        panel = ps.panel if ps else None
        safe_writerow(writer, [
            pod.name if pod else "Unassigned",
            team.deskNumber or "",
            team.name,
            team.registrationId,
            team.leaderName,
            ps.title if ps else "",
            panel.name if panel else "Unassigned",
            "; ".join(panel.memberNames) if panel and panel.memberNames else "",
            panel.facultyMemberName if panel else "",
        ])

    output.seek(0)
    logger.info(f"Exported evaluation sheet (ps_id={ps_id}, total_teams={len(teams)})")
    return StreamingResponse(
        iter([output.getvalue()]),
        headers={'Content-Disposition': 'attachment; filename="evaluation_roster.csv"', 'Content-Type': 'text/csv'}
    )


# ==========================================
# EVALUATION ROUNDS MANAGEMENT
# ==========================================

@router.get("/evaluation-rounds", response_model=List[EvaluationRoundResponse])
def get_evaluation_rounds(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    rounds = db.query(EvaluationRound).filter(EvaluationRound.eventId == current_user.eventId).order_by(EvaluationRound.roundNumber).all()
    res = []
    for r in rounds:
        count = db.query(Submission).filter(Submission.roundId == r.id).count()
        res.append(EvaluationRoundResponse(
            id=r.id,
            eventId=r.eventId,
            name=r.name,
            roundNumber=r.roundNumber,
            description=r.description,
            fields=r.fields or [],
            isSubmissionOpen=r.isSubmissionOpen,
            submissionCount=count,
            createdAt=r.createdAt
        ))
    return res

@router.post("/evaluation-rounds", response_model=EvaluationRoundResponse)
def create_evaluation_round(
    payload: EvaluationRoundCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    existing = db.query(EvaluationRound).filter(
        EvaluationRound.eventId == current_user.eventId,
        EvaluationRound.roundNumber == payload.roundNumber
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Round number {payload.roundNumber} already exists.")

    round_obj = EvaluationRound(
        eventId=current_user.eventId,
        name=payload.name,
        roundNumber=payload.roundNumber,
        description=payload.description,
        fields=payload.fields if payload.fields is not None else [],
        isSubmissionOpen=False
    )
    db.add(round_obj)
    db.commit()
    db.refresh(round_obj)
    logger.info(f"Created Evaluation Round '{round_obj.name}' (Number: {round_obj.roundNumber})")

    return EvaluationRoundResponse(

        id=round_obj.id,
        eventId=round_obj.eventId,
        name=round_obj.name,
        roundNumber=round_obj.roundNumber,
        description=round_obj.description,
        fields=round_obj.fields or [],
        isSubmissionOpen=round_obj.isSubmissionOpen,
        submissionCount=0,
        createdAt=round_obj.createdAt
    )

@router.put("/evaluation-rounds/{round_id}", response_model=EvaluationRoundResponse)
@router.patch("/evaluation-rounds/{round_id}", response_model=EvaluationRoundResponse)
def update_evaluation_round(
    round_id: str,
    payload: EvaluationRoundUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    round_obj = db.query(EvaluationRound).filter(
        EvaluationRound.id == round_id,
        EvaluationRound.eventId == current_user.eventId
    ).first()
    if not round_obj:
        raise HTTPException(status_code=404, detail="Evaluation round not found")

    was_open = round_obj.isSubmissionOpen
    if payload.name is not None:
        round_obj.name = payload.name
    if payload.roundNumber is not None:
        round_obj.roundNumber = payload.roundNumber
    if payload.description is not None:
        round_obj.description = payload.description
    if payload.fields is not None:
        round_obj.fields = payload.fields
    if payload.isSubmissionOpen is not None:
        round_obj.isSubmissionOpen = payload.isSubmissionOpen

    db.commit()
    db.refresh(round_obj)
    logger.info(f"Updated Evaluation Round '{round_obj.name}' (isOpen={round_obj.isSubmissionOpen})")

    count = db.query(Submission).filter(Submission.roundId == round_obj.id).count()

    return EvaluationRoundResponse(
        id=round_obj.id,
        eventId=round_obj.eventId,
        name=round_obj.name,
        roundNumber=round_obj.roundNumber,
        description=round_obj.description,
        fields=round_obj.fields or [],
        isSubmissionOpen=round_obj.isSubmissionOpen,
        submissionCount=count,
        createdAt=round_obj.createdAt
    )

@router.delete("/evaluation-rounds/{round_id}")
def delete_evaluation_round(
    round_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    round_obj = db.query(EvaluationRound).filter(
        EvaluationRound.id == round_id,
        EvaluationRound.eventId == current_user.eventId
    ).first()
    if not round_obj:
        raise HTTPException(status_code=404, detail="Evaluation round not found")
    db.delete(round_obj)
    db.commit()
    logger.info(f"Deleted Evaluation Round '{round_obj.name}' (ID: {round_id})")
    return {"success": True}

@router.get("/evaluation-rounds/export-master-workbook")
def export_master_evaluation_workbook(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    rounds = (
        db.query(EvaluationRound)
        .filter(EvaluationRound.eventId == current_user.eventId)
        .order_by(EvaluationRound.roundNumber)
        .all()
    )

    if not rounds:
        raise HTTPException(status_code=404, detail="No evaluation rounds found for this event")

    wb = openpyxl.Workbook()
    if "Sheet" in wb.sheetnames:
        wb.remove(wb["Sheet"])

    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    data_font = Font(name="Calibri", size=10)
    thin_border = Border(
        left=Side(style='thin', color='E2E8F0'),
        right=Side(style='thin', color='E2E8F0'),
        top=Side(style='thin', color='E2E8F0'),
        bottom=Side(style='thin', color='E2E8F0')
    )

    for r in rounds:
        raw_name = r.name or f"Round {r.roundNumber}"
        sheet_title = raw_name[:31]
        for char in [':', '\\', '/', '?', '*', '[', ']']:
            sheet_title = sheet_title.replace(char, '_')

        ws = wb.create_sheet(title=sheet_title)

        field_list = r.fields or []
        if field_list:
            custom_headers = [f.get("name", f"Field_{i+1}") for i, f in enumerate(field_list)]
        else:
            custom_headers = ["Google Drive Link", "GitHub Repository Link"]

        headers = ["Team Code", "Team Name", "PS Code", "PS Title", *custom_headers, "Submitted At"]
        ws.append(headers)

        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="left", vertical="center")

        submissions = (
            db.query(Submission)
            .filter(Submission.roundId == r.id)
            .join(Team, Team.id == Submission.teamId)
            .order_by(Team.registrationId)
            .all()
        )

        for s in submissions:
            team = s.team
            ps_code = ""
            ps_title = ""
            if team and team.psSelection and team.psSelection.ps:
                ps_code = team.psSelection.ps.code
                ps_title = team.psSelection.ps.title

            ans = s.answers or {}
            custom_row_vals = []
            if field_list:
                for f in field_list:
                    fname = f.get("name", "")
                    fid = f.get("id", fname)
                    val = ans.get(fname, ans.get(fid, ""))
                    if not val and "drive" in fname.lower():
                        val = s.driveLink or ""
                    elif not val and "github" in fname.lower():
                        val = s.githubLink or ""
                    custom_row_vals.append(str(val) if val is not None else "")
            else:
                custom_row_vals = [s.driveLink or "", s.githubLink or ""]

            sub_time_str = s.submittedAt.strftime("%Y-%m-%d %H:%M:%S") if s.submittedAt else ""
            row_values = [
                team.registrationId if team else "",
                team.name if team else "",
                ps_code,
                ps_title,
                *custom_row_vals,
                sub_time_str
            ]
            ws.append(row_values)

            row_idx = ws.max_row
            for c_idx in range(1, len(row_values) + 1):
                cell = ws.cell(row=row_idx, column=c_idx)
                cell.font = data_font
                cell.border = thin_border
                cell.alignment = Alignment(horizontal="left", vertical="center")

        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                val_str = str(cell.value or '')
                if len(val_str) > max_len:
                    max_len = len(val_str)
            ws.column_dimensions[col_letter].width = min(max(max_len + 4, 14), 60)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    logger.info(f"Exported master evaluation workbook across {len(rounds)} round sheets")
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="evaluation_submissions_master_workbook.xlsx"'}
    )

@router.get("/evaluation-rounds/{round_id}/submissions/export")
def export_round_submissions(
    round_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    round_obj = db.query(EvaluationRound).filter(
        EvaluationRound.id == round_id,
        EvaluationRound.eventId == current_user.eventId
    ).first()
    if not round_obj:
        raise HTTPException(status_code=404, detail="Evaluation round not found")

    submissions = (
        db.query(Submission)
        .filter(Submission.roundId == round_id)
        .join(Team, Team.id == Submission.teamId)
        .order_by(Team.registrationId)
        .all()
    )

    wb = openpyxl.Workbook()
    ws = wb.active
    sheet_title = (round_obj.name or f"Round {round_obj.roundNumber}")[:31]
    for char in [':', '\\', '/', '?', '*', '[', ']']:
        sheet_title = sheet_title.replace(char, '_')
    ws.title = sheet_title

    field_list = round_obj.fields or []
    if field_list:
        custom_headers = [f.get("name", f"Field_{i+1}") for i, f in enumerate(field_list)]
    else:
        custom_headers = ["Google Drive Link", "GitHub Repository Link"]

    headers = ["Team Code", "Team Name", "PS Code", "PS Title", *custom_headers, "Submitted At"]
    ws.append(headers)

    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    data_font = Font(name="Calibri", size=10)
    thin_border = Border(
        left=Side(style='thin', color='E2E8F0'),
        right=Side(style='thin', color='E2E8F0'),
        top=Side(style='thin', color='E2E8F0'),
        bottom=Side(style='thin', color='E2E8F0')
    )

    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="left", vertical="center")

    for s in submissions:
        team = s.team
        ps_code = ""
        ps_title = ""
        if team and team.psSelection and team.psSelection.ps:
            ps_code = team.psSelection.ps.code
            ps_title = team.psSelection.ps.title

        ans = s.answers or {}
        custom_row_vals = []
        if field_list:
            for f in field_list:
                fname = f.get("name", "")
                fid = f.get("id", fname)
                val = ans.get(fname, ans.get(fid, ""))
                if not val and "drive" in fname.lower():
                    val = s.driveLink or ""
                elif not val and "github" in fname.lower():
                    val = s.githubLink or ""
                custom_row_vals.append(str(val) if val is not None else "")
        else:
            custom_row_vals = [s.driveLink or "", s.githubLink or ""]

        sub_time_str = s.submittedAt.strftime("%Y-%m-%d %H:%M:%S") if s.submittedAt else ""
        row_values = [
            team.registrationId if team else "",
            team.name if team else "",
            ps_code,
            ps_title,
            *custom_row_vals,
            sub_time_str
        ]
        ws.append(row_values)

        row_idx = ws.max_row
        for c_idx in range(1, len(row_values) + 1):
            cell = ws.cell(row=row_idx, column=c_idx)
            cell.font = data_font
            cell.border = thin_border
            cell.alignment = Alignment(horizontal="left", vertical="center")

    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            val_str = str(cell.value or '')
            if len(val_str) > max_len:
                max_len = len(val_str)
        ws.column_dimensions[col_letter].width = min(max(max_len + 4, 14), 60)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    safe_name = round_obj.name.lower().replace(" ", "_")
    logger.info(f"Exported submissions Excel for round {round_obj.name} ({len(submissions)} rows)")
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="submissions_{safe_name}.xlsx"'}
    )


# ==========================================
# PANELS CSV EXPORT & IMPORT
# ==========================================

@router.get("/panels/export")
def export_panels(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    panels = db.query(Panel).filter(Panel.eventId == current_user.eventId).order_by(Panel.name).all()
    output = io.StringIO()
    writer = csv.writer(output)
    safe_writerow(writer, ["Panel Name", "Problem Statement Code", "Faculty Lead", "Judges"])
    for p in panels:
        ps_code = p.problemStatement.code if p.problemStatement else ""
        judges_str = "; ".join(p.memberNames) if p.memberNames else ""
        safe_writerow(writer, [p.name, ps_code, p.facultyMemberName or "", judges_str])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        headers={'Content-Disposition': 'attachment; filename="panels_export.csv"', 'Content-Type': 'text/csv'}
    )

@router.post("/panels/import")
async def import_panels(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Invalid file type. CSV required.")
    
    contents = await file.read()
    df = pd.read_csv(io.StringIO(contents.decode('utf-8-sig', errors='replace')))
    created_count = 0

    for index, row in df.iterrows():
        name = str(row.get("Panel Name", "")).strip()
        if not name or name.lower() == "nan":
            continue

        ps_code = str(row.get("Problem Statement Code", "")).strip()
        faculty = str(row.get("Faculty Lead", "")).strip()
        judges_raw = str(row.get("Judges", "")).strip()
        judges_list = [j.strip() for j in re.split(r'[;,]', judges_raw) if j.strip() and j.strip().lower() != "nan"]

        ps_obj = None
        if ps_code and ps_code.lower() != "nan":
            ps_obj = db.query(ProblemStatement).filter(
                ProblemStatement.eventId == current_user.eventId,
                ProblemStatement.code.ilike(ps_code)
            ).first()

        existing = db.query(Panel).filter(
            Panel.eventId == current_user.eventId,
            Panel.name.ilike(name)
        ).first()

        if existing:
            existing.facultyMemberName = faculty if faculty and faculty.lower() != "nan" else existing.facultyMemberName
            existing.memberNames = judges_list if judges_list else existing.memberNames
            if ps_obj:
                existing.problemStatementId = ps_obj.id
        else:
            new_p = Panel(
                eventId=current_user.eventId,
                name=name,
                facultyMemberName=faculty if faculty and faculty.lower() != "nan" else None,
                memberNames=judges_list,
                problemStatementId=ps_obj.id if ps_obj else None
            )
            db.add(new_p)
            created_count += 1

    db.commit()
    return {"message": f"Successfully processed panels CSV import ({created_count} new created)"}


# ==========================================
# EVALUATION ROUNDS CSV EXPORT & IMPORT
# ==========================================

@router.get("/evaluation-rounds/export")
def export_evaluation_rounds(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    rounds = db.query(EvaluationRound).filter(EvaluationRound.eventId == current_user.eventId).order_by(EvaluationRound.roundNumber).all()
    output = io.StringIO()
    writer = csv.writer(output)
    safe_writerow(writer, ["Round Name", "Sequence Order", "Submissions Open"])
    for r in rounds:
        safe_writerow(writer, [r.name, r.roundNumber, "YES" if r.isSubmissionOpen else "NO"])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        headers={'Content-Disposition': 'attachment; filename="evaluation_rounds_export.csv"', 'Content-Type': 'text/csv'}
    )

@router.post("/evaluation-rounds/import")
async def import_evaluation_rounds(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Invalid file type. CSV required.")
    
    contents = await file.read()
    df = pd.read_csv(io.StringIO(contents.decode('utf-8-sig', errors='replace')))
    created_count = 0

    for index, row in df.iterrows():
        name = str(row.get("Round Name", "")).strip()
        if not name or name.lower() == "nan":
            continue

        round_num_raw = str(row.get("Sequence Order", index + 1)).strip()
        try:
            round_num = int(round_num_raw)
        except ValueError:
            round_num = index + 1

        existing = db.query(EvaluationRound).filter(
            EvaluationRound.eventId == current_user.eventId,
            EvaluationRound.roundNumber == round_num
        ).first()

        if existing:
            existing.name = name
        else:
            new_r = EvaluationRound(
                eventId=current_user.eventId,
                name=name,
                roundNumber=round_num,
                isSubmissionOpen=False
            )
            db.add(new_r)
            created_count += 1

    db.commit()
    return {"message": f"Successfully imported evaluation rounds ({created_count} created)"}
# ==========================================
# ATTENDANCE SLOTS CSV EXPORT & IMPORT
# ==========================================

@router.get("/attendance-slots/export")
def export_attendance_slots(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    slots = db.query(CheckpointType).filter(CheckpointType.eventId == current_user.eventId).order_by(CheckpointType.name).all()
    output = io.StringIO()
    writer = csv.writer(output)
    safe_writerow(writer, ["Slot Name", "Description"])
    for s in slots:
        safe_writerow(writer, [s.name, s.description or ""])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        headers={'Content-Disposition': 'attachment; filename="attendance_slots_export.csv"', 'Content-Type': 'text/csv'}
    )

@router.post("/attendance-slots/import")
async def import_attendance_slots(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.ADMIN))
):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Invalid file type. CSV required.")
    
    contents = await file.read()
    df = pd.read_csv(io.StringIO(contents.decode('utf-8-sig', errors='replace')))
    created_count = 0

    for index, row in df.iterrows():
        name = str(row.get("Slot Name", row.get("Slot Title", ""))).strip()
        if not name or name.lower() == "nan":
            continue

        desc = str(row.get("Description", "")).strip()
        if desc.lower() == "nan":
            desc = None

        existing = db.query(CheckpointType).filter(
            CheckpointType.eventId == current_user.eventId,
            CheckpointType.name == name
        ).first()

        if existing:
            if desc is not None:
                existing.description = desc
        else:
            cp = CheckpointType(
                eventId=current_user.eventId,
                name=name,
                description=desc
            )
            db.add(cp)
            created_count += 1

    db.commit()
    return {"message": f"Successfully processed attendance slots. Created {created_count} new slot(s)."}
