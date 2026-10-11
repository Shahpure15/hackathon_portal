import re
import csv
import uuid
import random
import secrets
import string
import traceback
from concurrent.futures import ThreadPoolExecutor
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
    VolunteerAttendanceRecord, Panel, EvaluationRound, Submission,
    Discipline, RefreshToken
)
from app.auth import require_role, CurrentUser, get_password_hash
from app.rbac import Principal, require_permission
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

# Helper: Normalize CSV column header strings (strips BOM, NBSP, and extra whitespace)
def normalize_header(h: Any) -> str:
    s = str(h).replace('\ufeff', '').replace('\xa0', ' ').strip().lower()
    return re.sub(r'[\s_]+', ' ', s)

# Helper: CSV formula injection prevention
def csv_safe(value: Any) -> str:
    s = str(value) if value is not None else ""
    if s and s[0] in ('=', '+', '-', '@'):
        return "'" + s
    return s

# Helper: Natural numeric sorting for strings (e.g. Panel 1, Panel 2, Panel 10)
def natural_sort_key(s: Any) -> list:
    if not s:
        return []
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', str(s))]

def safe_writerow(writer: Any, row: List[Any]) -> None:
    writer.writerow([csv_safe(v) for v in row])

# Helper: Serialize diff data for JSON serialization (convert datetime & enums to string)
def serialize_diff(diff: Any) -> Any:
    if isinstance(diff, dict):
        return {k: serialize_diff(v) for k, v in diff.items()}
    elif isinstance(diff, list):
        return [serialize_diff(v) for v in diff]
    elif isinstance(diff, datetime):
        return diff.isoformat()
    elif hasattr(diff, "value"):
        return str(diff.value)
    return diff

# Helper: Log audit trail
def log_audit(db: Session, actor_id: str, action: str, entity_type: str, entity_id: str, diff: Optional[dict] = None, event_id: Optional[str] = None):
    serialized_diff = serialize_diff(diff) if diff else None
    audit = AuditLog(
        eventId=event_id,
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
    current_user: Principal = Depends(require_permission('team.view'))
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
    current_user: Principal = Depends(require_permission('team.export'))
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
        'Content-Type': 'text/csv; charset=utf-8-sig'
    }
    return StreamingResponse(iter([output.getvalue().encode('utf-8-sig')]), headers=headers)

@router.get("/teams/unresolved-leaders")
def get_unresolved_leaders_report(
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('team.view'))
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

@router.get("/teams/export-credentials")
def export_team_credentials(
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('team.credentials'))
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


@router.get("/teams/{team_id}", response_model=TeamDetailResponse)
def get_team_detail(
    team_id: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('team.view'))
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
    current_user: Principal = Depends(require_permission('team.edit'))
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
            # Check for duplicate registrationId
            if key == "registrationId" and value:
                clean_code = str(value).strip()
                conflict = db.query(Team).filter(
                    Team.registrationId == clean_code,
                    Team.eventId == current_user.eventId,
                    Team.id != team.id
                ).first()
                if conflict:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Team Code '{clean_code}' is already assigned to another team ({conflict.name})."
                    )
                value = clean_code

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

    # Sync leader User account if registrationId or leaderPhone changed
    if "registrationId" in diff or "leaderPhone" in diff or "leaderName" in diff:
        leader_user = db.query(User).filter(
            User.teamId == team.id,
            User.eventId == current_user.eventId
        ).first()
        if leader_user:
            new_username = team.registrationId.lower()
            leader_user.username = new_username
            raw_pwd = generate_team_leader_password(team.leaderPhone, team.registrationId)
            leader_user.passwordHash = get_password_hash(raw_pwd)

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
            
    if diff:
        try:
            log_audit(
                db=db,
                actor_id=current_user.id,
                action="team.update",
                entity_type="Team",
                entity_id=team.id,
                diff=diff
            )
        except Exception as audit_err:
            logger.warning(f"Failed to log audit for team update: {audit_err}")

    try:
        db.commit()
    except IntegrityError as ie:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Team Code or leader username is already in use by another team."
        )
        
    return {"message": "Team updated successfully", "diff": serialize_diff(diff)}




# ==========================================
# CSV IMPORT ENGINE - PREVIEW
# ==========================================

@router.post("/teams/import/preview")
async def import_teams_preview(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('team.import'))
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
    
    # Batch load all existing teams and their members in a single query with secondary lookups
    existing_teams = db.query(Team).options(joinedload(Team.members)).filter(Team.eventId == current_user.eventId).all()
    existing_teams_map = {t.registrationId: t for t in existing_teams}
    existing_teams_by_name = {t.name.strip().lower(): t for t in existing_teams if t.name}
    existing_teams_by_email = {t.leaderEmail.strip().lower(): t for t in existing_teams if t.leaderEmail}

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
            if val is None or pd.isna(val):
                continue
            k_norm = normalize_header(key)
            if any(term in k_norm for term in ["category", "discipline", "track", "domain", "stream", "department"]):
                s_val = str(val).strip()
                if s_val and s_val.lower() not in ["nan", "null", "none"]:
                    raw_cat = s_val
                    break

        if not raw_cat:
            raw_cat = f"{team_name} {leader.get('college', '')}"

        team_cat = Discipline.DESIGN.value if "design" in raw_cat.lower() else Discipline.ENGINEERING.value
        
        # Parse desk number if present in CSV
        raw_desk = ""
        for key, val in row.items():
            if val is None or pd.isna(val):
                continue
            k_norm = normalize_header(key)
            if not k_norm.startswith("member") and any(term in k_norm for term in ["desk", "bench", "table", "seat", "workstation", "lab"]):
                s_val = str(val).strip()
                if s_val and s_val.lower() not in ["nan", "null", "none"]:
                    if s_val.endswith(".0"):
                        try:
                            s_val = str(int(float(s_val)))
                        except ValueError:
                            pass
                    raw_desk = s_val
                    break

        # Prepare row payload
        row_payload = {
            "registrationId": reg_id,
            "name": team_name,
            "leaderName": leader["name"],
            "leaderEmail": leader["email"],
            "leaderPhone": leader["phone"],
            "collegeName": leader["college"] or "Unknown College",
            "category": team_cat,
            "deskNumber": raw_desk,
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
            
        # Compare with in-memory maps (primary by Team Code, secondary by Name/Email if code changed)
        db_team = existing_teams_map.get(reg_id)
        if not db_team:
            db_team = existing_teams_by_name.get(team_name.lower()) or existing_teams_by_email.get(leader["email"].lower())
            if db_team:
                row_payload["oldRegistrationId"] = db_team.registrationId
        
        if not db_team:
            preview_data["new"].append(row_payload)
        else:
            # Check for changes
            changes = {}
            if db_team.registrationId != reg_id:
                changes["registrationId"] = {"from": db_team.registrationId, "to": reg_id}
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
                
            db_desk = db_team.deskNumber or ""
            if db_desk != raw_desk:
                changes["deskNumber"] = {"from": db_desk, "to": raw_desk}

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
    current_user: Principal = Depends(require_permission('team.import'))
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

        # Collect passwords to hash in parallel
        raw_passwords_map = {}
        for row in new_teams:
            reg_id = str(row["registrationId"]).strip()
            phone = str(row.get("leaderPhone", "")).strip()
            raw_passwords_map[reg_id.lower()] = generate_team_leader_password(phone, reg_id)

        for row in changed_teams:
            reg_id = str(row["registrationId"]).strip()
            if decisions.get(reg_id, "update") != "skip":
                db_t = existing_teams_map.get(reg_id)
                phone = db_t.leaderPhone if db_t else str(row.get("leaderPhone", "")).strip()
                raw_passwords_map[reg_id.lower()] = generate_team_leader_password(phone, reg_id)

        unchanged_teams = payload.get("unchanged", [])
        for row in unchanged_teams:
            reg_id = str(row["registrationId"]).strip()
            db_t = existing_teams_map.get(reg_id)
            if db_t:
                raw_passwords_map[reg_id.lower()] = generate_team_leader_password(db_t.leaderPhone, db_t.registrationId)

        # Execute bcrypt password hashing in parallel across thread pool (2s total for 123 passwords)
        def _hash_worker(item):
            uname, raw_pwd = item
            return uname, get_password_hash(raw_pwd)

        with ThreadPoolExecutor(max_workers=16) as executor:
            password_hashes_map = dict(executor.map(_hash_worker, raw_passwords_map.items()))

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
                    category=cat_enum,
                    deskNumber=str(row.get("deskNumber", "")).strip()[:20] if row.get("deskNumber") else None
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
                team.deskNumber = str(row.get("deskNumber", "")).strip()[:20] if row.get("deskNumber") else None
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
            leader_username = reg_id.lower()
            raw_password = raw_passwords_map.get(leader_username) or generate_team_leader_password(team.leaderPhone, team.registrationId)
            password_hash = password_hashes_map.get(leader_username) or get_password_hash(raw_password)
            
            existing_user = existing_users_map.get(leader_username)
            
            if existing_user:
                existing_user.passwordHash = password_hash
                existing_user.role = Role.LEADER
                existing_user.teamId = team.id
            else:
                leader_user = User(
                    eventId=current_user.eventId,
                    username=leader_username,
                    passwordHash=password_hash,
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
            old_reg_id = str(row.get("oldRegistrationId") or reg_id).strip()
            decision = decisions.get(reg_id, decisions.get(old_reg_id, "update"))
            
            if decision == "skip":
                continue
                
            # Fetch existing team
            db_team = existing_teams_map.get(reg_id) or existing_teams_map.get(old_reg_id)
            
            if not db_team:
                continue # Safety skip
                
            diff = {}
            
            # If Team Code changed
            if db_team.registrationId != reg_id:
                diff["registrationId"] = {"from": db_team.registrationId, "to": reg_id}
                db_team.registrationId = reg_id
            
            # Log changes
            for key in ["name", "leaderName", "leaderEmail", "leaderPhone", "collegeName", "category", "deskNumber"]:
                old_val = getattr(db_team, key)
                if hasattr(old_val, "value"):
                    old_val = old_val.value
                new_val = row.get(key, "")
                if (old_val or "") != (new_val or ""):
                    diff[key] = {"from": old_val, "to": new_val}
                    if key == "category":
                        cat_str = str(new_val).strip().upper()
                        setattr(db_team, key, Discipline.DESIGN if cat_str == "DESIGN" else Discipline.ENGINEERING)
                    elif key == "leaderPhone":
                        setattr(db_team, key, str(new_val).strip()[:50])
                    elif key == "deskNumber":
                        setattr(db_team, key, str(new_val).strip()[:20] if new_val else None)
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
            leader_username = reg_id.lower()
            raw_password = raw_passwords_map.get(leader_username) or generate_team_leader_password(db_team.leaderPhone, db_team.registrationId)
            password_hash = password_hashes_map.get(leader_username) or get_password_hash(raw_password)
            db_user = existing_users_map.get(leader_username) or existing_users_map.get(old_reg_id.lower())

            if db_user:
                db_user.username = leader_username
                db_user.passwordHash = password_hash
                db_user.teamId = db_team.id
                db_user.role = Role.LEADER
            else:
                db_user = User(
                    eventId=current_user.eventId,
                    username=leader_username,
                    passwordHash=password_hash,
                    role=Role.LEADER,
                    teamId=db_team.id
                )
                db.add(db_user)
                existing_users_map[leader_username] = db_user

            generated_credentials.append({
                "teamName": db_team.name,
                "registrationId": reg_id,
                "username": leader_username,
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
        for row in unchanged_teams:
            reg_id = str(row["registrationId"]).strip()
            leader_username = reg_id.lower()
            db_team = existing_teams_map.get(reg_id)
            if db_team:
                if row.get("deskNumber"):
                    db_team.deskNumber = str(row.get("deskNumber")).strip()[:20]
                raw_password = raw_passwords_map.get(leader_username) or generate_team_leader_password(db_team.leaderPhone, db_team.registrationId)
                password_hash = password_hashes_map.get(leader_username) or get_password_hash(raw_password)
                db_user = existing_users_map.get(leader_username)
                if not db_user:
                    db_user = User(
                        eventId=current_user.eventId,
                        username=leader_username,
                        passwordHash=password_hash,
                        role=Role.LEADER,
                        teamId=db_team.id
                    )
                    db.add(db_user)
                    existing_users_map[leader_username] = db_user
                else:
                    db_user.passwordHash = password_hash
                generated_credentials.append({
                    "teamName": db_team.name,
                    "registrationId": reg_id,
                    "username": leader_username,
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

# ==========================================
# PODS (GROUPING) MANAGEMENT
# ==========================================

@router.get("/pods", response_model=List[PodResponse])
def get_pods(
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('pod.view'))
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
    current_user: Principal = Depends(require_permission('pod.manage'))
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
    current_user: Principal = Depends(require_permission('pod.manage'))
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
    current_user: Principal = Depends(require_permission('pod.manage'))
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
    current_user: Principal = Depends(require_permission('pod.manage'))
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
    current_user: Principal = Depends(require_permission('pod.export'))
):
    pods = (
        db.query(Pod)
        .options(
            joinedload(Pod.teams).joinedload(Team.members),
            joinedload(Pod.teams).joinedload(Team.psSelection).joinedload(PSSelection.ps),
            joinedload(Pod.volunteers)
        )
        .filter(Pod.eventId == current_user.eventId)
        .order_by(Pod.name)
        .all()
    )
    
    wb = openpyxl.Workbook()
    if "Sheet" in wb.sheetnames:
        wb.remove(wb["Sheet"])

    # Color Palette & Styles
    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    section_fill = PatternFill(start_color="334155", end_color="334155", fill_type="solid")
    sub_header_fill = PatternFill(start_color="475569", end_color="475569", fill_type="solid")
    meta_banner_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
    
    title_font = Font(name="Calibri", size=12, bold=True, color="FFFFFF")
    section_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    header_font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
    meta_bold_font = Font(name="Calibri", size=10, bold=True, color="1E293B")
    meta_regular_font = Font(name="Calibri", size=10, color="334155")
    data_font = Font(name="Calibri", size=10, color="0F172A")
    italic_note_font = Font(name="Calibri", size=10, italic=True, color="64748B")

    thin_border = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )

    # -------------------------------------------------------------
    # SHEET 1: ALL PODS OVERVIEW
    # -------------------------------------------------------------
    ws_summary = wb.create_sheet(title="PODs Overview")
    
    # Title Row
    ws_summary.append(["EVENT POD GROUPS MASTER OVERVIEW"])
    ws_summary.merge_cells(start_row=1, start_column=1, end_row=1, end_column=6)
    cell_title = ws_summary.cell(row=1, column=1)
    cell_title.fill = header_fill
    cell_title.font = title_font
    cell_title.alignment = Alignment(horizontal="center", vertical="center")
    ws_summary.row_dimensions[1].height = 28

    # Summary Table Headers
    summary_headers = [
        "POD Name", "Capacity Limit", "Current Team Count", 
        "Assigned Faculty", "Assigned Student Volunteers", "Assigned Teams"
    ]
    ws_summary.append(summary_headers)
    ws_summary.row_dimensions[2].height = 22

    for col_idx in range(1, len(summary_headers) + 1):
        cell = ws_summary.cell(row=2, column=col_idx)
        cell.fill = section_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="left", vertical="center")
        cell.border = thin_border

    if not pods:
        ws_summary.append(["No POD groups created yet.", "", "", "", "", ""])
        cell = ws_summary.cell(row=3, column=1)
        cell.font = italic_note_font
    else:
        for p in pods:
            faculty = [v.name for v in p.volunteers if (v.type == VolunteerType.FACULTY if hasattr(VolunteerType, 'FACULTY') else str(v.type).upper() == 'FACULTY')]
            students = [v.name for v in p.volunteers if (v.type == VolunteerType.VOLUNTEER if hasattr(VolunteerType, 'VOLUNTEER') else str(v.type).upper() in ['VOLUNTEER', 'STUDENT'])]
            other_vols = [v.name for v in p.volunteers if v.name not in faculty and v.name not in students]
            if other_vols:
                students.extend(other_vols)
                
            teams_list = [f"{t.registrationId} - {t.name}" for t in p.teams]
            
            row_vals = [
                p.name,
                p.capacity if p.capacity is not None else "Unlimited",
                len(p.teams),
                ", ".join(faculty) if faculty else "None",
                ", ".join(students) if students else "None",
                ", ".join(teams_list) if teams_list else "None"
            ]
            ws_summary.append(row_vals)
            curr_row = ws_summary.max_row
            ws_summary.row_dimensions[curr_row].height = 20
            for col_idx in range(1, len(row_vals) + 1):
                c = ws_summary.cell(row=curr_row, column=col_idx)
                c.font = data_font
                c.border = thin_border
                c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)

    # Auto adjust summary column widths
    for col in ws_summary.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            val_str = str(cell.value or '')
            if cell.row == 1:
                continue
            if len(val_str) > max_len:
                max_len = min(len(val_str), 40)
        ws_summary.column_dimensions[col_letter].width = min(max(max_len + 4, 16), 50)

    # -------------------------------------------------------------
    # POD-WISE SHEETS
    # -------------------------------------------------------------
    used_titles = {"pods overview"}
    for p in pods:
        # Sanitize sheet title (Excel limit 31 chars)
        raw_name = p.name or "POD"
        sheet_title = raw_name[:30]
        for char in [':', '\\', '/', '?', '*', '[', ']']:
            sheet_title = sheet_title.replace(char, '_')
        sheet_title = sheet_title.strip() or "POD"
        
        base_title = sheet_title
        counter = 1
        while sheet_title.lower() in used_titles:
            sheet_title = f"{base_title[:27]}_{counter}"
            counter += 1
        used_titles.add(sheet_title.lower())

        ws = wb.create_sheet(title=sheet_title)
        
        # 1. Header Banner
        ws.append([f"POD GROUP: {p.name.upper()}"])
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=11)
        banner_cell = ws.cell(row=1, column=1)
        banner_cell.fill = header_fill
        banner_cell.font = title_font
        banner_cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[1].height = 28

        # 2. Metadata details
        cap_str = str(p.capacity) if p.capacity is not None else "Unlimited"
        meta_row = [
            f"Capacity Limit: {cap_str}",
            f"Total Assigned Teams: {len(p.teams)}",
            f"Total Assigned Volunteers: {len(p.volunteers)}",
            "", "", "", "", "", "", "", ""
        ]
        ws.append(meta_row)
        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=3)
        meta_cell = ws.cell(row=2, column=1)
        meta_cell.fill = meta_banner_fill
        meta_cell.font = meta_bold_font
        meta_cell.alignment = Alignment(horizontal="left", vertical="center")
        ws.row_dimensions[2].height = 22

        ws.append([]) # Empty spacer row 3

        # 3. Section 1: Assigned Faculty & Volunteers
        ws.append(["ASSIGNED FACULTY & VOLUNTEERS"])
        sec1_row = ws.max_row
        ws.merge_cells(start_row=sec1_row, start_column=1, end_row=sec1_row, end_column=5)
        sec1_cell = ws.cell(row=sec1_row, column=1)
        sec1_cell.fill = section_fill
        sec1_cell.font = section_font
        sec1_cell.alignment = Alignment(horizontal="left", vertical="center")
        ws.row_dimensions[sec1_row].height = 22

        vol_headers = ["Name", "Role / Designation", "Contact (Phone/Email)", "Remarks"]
        ws.append(vol_headers)
        vol_hdr_row = ws.max_row
        ws.row_dimensions[vol_hdr_row].height = 20
        for c_idx in range(1, len(vol_headers) + 1):
            c = ws.cell(row=vol_hdr_row, column=c_idx)
            c.fill = sub_header_fill
            c.font = header_font
            c.border = thin_border
            c.alignment = Alignment(horizontal="left", vertical="center")

        if not p.volunteers:
            ws.append(["No faculty or volunteers assigned to this POD.", "", "", ""])
            empty_row = ws.max_row
            ws.merge_cells(start_row=empty_row, start_column=1, end_row=empty_row, end_column=4)
            c = ws.cell(row=empty_row, column=1)
            c.font = italic_note_font
            c.border = thin_border
        else:
            for v in p.volunteers:
                vol_type_str = v.type.value if hasattr(v.type, 'value') else str(v.type or "VOLUNTEER")
                row_vals = [
                    v.name or "",
                    vol_type_str,
                    v.contact or "",
                    v.remarks or ""
                ]
                ws.append(row_vals)
                curr_row = ws.max_row
                ws.row_dimensions[curr_row].height = 19
                for c_idx in range(1, len(row_vals) + 1):
                    c = ws.cell(row=curr_row, column=c_idx)
                    c.font = data_font
                    c.border = thin_border
                    c.alignment = Alignment(horizontal="left", vertical="center")

        ws.append([]) # Spacer row

        # 4. Section 2: Assigned Teams
        ws.append(["ASSIGNED TEAMS"])
        sec2_row = ws.max_row
        ws.merge_cells(start_row=sec2_row, start_column=1, end_row=sec2_row, end_column=11)
        sec2_cell = ws.cell(row=sec2_row, column=1)
        sec2_cell.fill = section_fill
        sec2_cell.font = section_font
        sec2_cell.alignment = Alignment(horizontal="left", vertical="center")
        ws.row_dimensions[sec2_row].height = 22

        team_headers = [
            "Team Code", "Team Name", "PS Code", "PS Title",
            "Leader Name", "Leader Email", "Leader Phone",
            "College Name", "Category", "Desk No.", "Status", "Team Members"
        ]
        ws.append(team_headers)
        team_hdr_row = ws.max_row
        ws.row_dimensions[team_hdr_row].height = 20
        for c_idx in range(1, len(team_headers) + 1):
            c = ws.cell(row=team_hdr_row, column=c_idx)
            c.fill = sub_header_fill
            c.font = header_font
            c.border = thin_border
            c.alignment = Alignment(horizontal="left", vertical="center")

        if not p.teams:
            ws.append(["No teams assigned to this POD.", "", "", "", "", "", "", "", "", "", "", ""])
            empty_row = ws.max_row
            ws.merge_cells(start_row=empty_row, start_column=1, end_row=empty_row, end_column=12)
            c = ws.cell(row=empty_row, column=1)
            c.font = italic_note_font
            c.border = thin_border
        else:
            for t in p.teams:
                ps_code = ""
                ps_title = ""
                if t.psSelection and t.psSelection.ps:
                    ps_code = t.psSelection.ps.code or ""
                    ps_title = t.psSelection.ps.title or ""
                
                status_str = t.status.value if hasattr(t.status, 'value') else str(t.status or "")
                category_str = t.category.value if hasattr(t.category, 'value') else str(t.category or "")
                members_str = ", ".join([m.name for m in t.members if m.name]) if t.members else ""

                row_vals = [
                    t.registrationId or "",
                    t.name or "",
                    ps_code,
                    ps_title,
                    t.leaderName or "",
                    t.leaderEmail or "",
                    t.leaderPhone or "",
                    t.collegeName or "",
                    category_str,
                    t.deskNumber or "",
                    status_str,
                    members_str
                ]
                ws.append(row_vals)
                curr_row = ws.max_row
                ws.row_dimensions[curr_row].height = 19
                for c_idx in range(1, len(row_vals) + 1):
                    c = ws.cell(row=curr_row, column=c_idx)
                    c.font = data_font
                    c.border = thin_border
                    c.alignment = Alignment(horizontal="left", vertical="center")

        # Auto adjust column widths for this POD sheet
        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                # Ignore merged title & banner rows for width calculation
                if cell.row in [1, 2, sec1_row, sec2_row]:
                    continue
                val_str = str(cell.value or '')
                if len(val_str) > max_len:
                    max_len = min(len(val_str), 40)
            ws.column_dimensions[col_letter].width = min(max(max_len + 4, 14), 50)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    logger.info(f"Exported PODs workbook with {len(pods)} pod sheets for event {current_user.eventId}")
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="pods_master_workbook.xlsx"'}
    )


@router.post("/pods/import/preview")
async def import_pods_preview(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('pod.manage'))
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
    current_user: Principal = Depends(require_permission('pod.manage'))
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
    current_user: Principal = Depends(require_permission('pod.export'))
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
        'Content-Type': 'text/csv; charset=utf-8-sig'
    }
    
    return StreamingResponse(iter([output.getvalue().encode('utf-8-sig')]), headers=headers)


# ==========================================
# VOLUNTEERS MANAGEMENT
# ==========================================

@router.get("/volunteers/export")
def export_volunteers(
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('staff.export'))
):
    volunteers = (
        db.query(Volunteer)
        .options(
            joinedload(Volunteer.pod),
            joinedload(Volunteer.panel),
            joinedload(Volunteer.problemStatement),
            joinedload(Volunteer.user),
            joinedload(Volunteer.attendanceRecords)
        )
        .filter(Volunteer.eventId == current_user.eventId)
        .order_by(Volunteer.name)
        .all()
    )
    
    checkpoints = (
        db.query(CheckpointType)
        .filter(CheckpointType.eventId == current_user.eventId)
        .order_by(CheckpointType.name)
        .all()
    )

    wb = openpyxl.Workbook()
    if "Sheet" in wb.sheetnames:
        wb.remove(wb["Sheet"])

    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    section_fill = PatternFill(start_color="334155", end_color="334155", fill_type="solid")
    meta_banner_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")

    title_font = Font(name="Calibri", size=12, bold=True, color="FFFFFF")
    section_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    header_font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
    meta_bold_font = Font(name="Calibri", size=10, bold=True, color="1E293B")
    data_font = Font(name="Calibri", size=10, color="0F172A")
    italic_note_font = Font(name="Calibri", size=10, italic=True, color="64748B")

    thin_border = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )

    # Helper function to parse contact into email & phone
    def parse_contact_info(contact_raw):
        email, phone = "", ""
        if contact_raw:
            if " | " in contact_raw:
                parts = contact_raw.split(" | ")
                email = parts[0].strip()
                phone = parts[1].strip()
            elif "@" in contact_raw:
                email = contact_raw.strip()
            else:
                phone = contact_raw.strip()
        return email, phone

    # -------------------------------------------------------------
    # SHEET 1: VOLUNTEERS OVERVIEW & ANALYSIS
    # -------------------------------------------------------------
    ws_summary = wb.create_sheet(title="Volunteers Overview")

    ws_summary.append(["VOLUNTEERS & FACULTY MASTER OVERVIEW"])
    ws_summary.merge_cells(start_row=1, start_column=1, end_row=1, end_column=10)
    cell_title = ws_summary.cell(row=1, column=1)
    cell_title.fill = header_fill
    cell_title.font = title_font
    cell_title.alignment = Alignment(horizontal="center", vertical="center")
    ws_summary.row_dimensions[1].height = 28

    total_count = len(volunteers)
    faculty_count = sum(1 for v in volunteers if (v.type == VolunteerType.FACULTY if hasattr(VolunteerType, 'FACULTY') else str(v.type).upper() == 'FACULTY'))
    judge_count = sum(1 for v in volunteers if (v.type == VolunteerType.JUDGE if hasattr(VolunteerType, 'JUDGE') else str(v.type).upper() == 'JUDGE'))
    vol_count = total_count - faculty_count - judge_count
    checked_in_count = sum(1 for v in volunteers if v.attendanceRecords and len(v.attendanceRecords) > 0)

    kpi_row = [
        f"Total People: {total_count} | Faculty: {faculty_count} | Volunteers: {vol_count} | Judges: {judge_count} | Checked In: {checked_in_count}",
        "", "", "", "", "", "", "", "", ""
    ]
    ws_summary.append(kpi_row)
    ws_summary.merge_cells(start_row=2, start_column=1, end_row=2, end_column=10)
    kpi_cell = ws_summary.cell(row=2, column=1)
    kpi_cell.fill = meta_banner_fill
    kpi_cell.font = meta_bold_font
    kpi_cell.alignment = Alignment(horizontal="left", vertical="center")
    ws_summary.row_dimensions[2].height = 22

    ws_summary.append([]) # Spacer row 3

    headers_summary = [
        "Name", "Role / Type", "Email", "Phone",
        "Assigned POD", "Assigned Panel", "Assigned PS", "Login Created", "Check-In Status", "Remarks"
    ]
    ws_summary.append(headers_summary)
    ws_summary.row_dimensions[4].height = 22

    for col_idx in range(1, len(headers_summary) + 1):
        c = ws_summary.cell(row=4, column=col_idx)
        c.fill = section_fill
        c.font = header_font
        c.alignment = Alignment(horizontal="left", vertical="center")
        c.border = thin_border

    if not volunteers:
        ws_summary.append(["No volunteers or staff records available.", "", "", "", "", "", "", "", "", ""])
        c = ws_summary.cell(row=5, column=1)
        c.font = italic_note_font
    else:
        for v in volunteers:
            email, phone = parse_contact_info(v.contact)
            vol_type_str = v.type.value if hasattr(v.type, 'value') else str(v.type or "VOLUNTEER")
            pod_name = v.pod.name if v.pod else "Unassigned"
            panel_name = v.panel.name if v.panel else "Unassigned"
            ps_str = f"{v.problemStatement.code}" if v.problemStatement else "Unassigned"
            has_login = "Yes" if v.user else "No"
            checkin_str = "Checked In" if (v.attendanceRecords and len(v.attendanceRecords) > 0) else "Not Checked In"

            row_vals = [
                v.name or "",
                vol_type_str,
                email,
                phone,
                pod_name,
                panel_name,
                ps_str,
                has_login,
                checkin_str,
                v.remarks or ""
            ]
            ws_summary.append(row_vals)
            curr_row = ws_summary.max_row
            ws_summary.row_dimensions[curr_row].height = 20
            for col_idx in range(1, len(row_vals) + 1):
                c = ws_summary.cell(row=curr_row, column=col_idx)
                c.font = data_font
                c.border = thin_border
                c.alignment = Alignment(horizontal="left", vertical="center")

    for col in ws_summary.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            val_str = str(cell.value or '')
            if cell.row in [1, 2]:
                continue
            if len(val_str) > max_len:
                max_len = min(len(val_str), 40)
        ws_summary.column_dimensions[col_letter].width = min(max(max_len + 4, 14), 50)

    # -------------------------------------------------------------
    # ROLE-DIFFERENTIATED WORKSHEETS
    # -------------------------------------------------------------
    roles_map = {
        "Faculty": [v for v in volunteers if (v.type == VolunteerType.FACULTY if hasattr(VolunteerType, 'FACULTY') else str(v.type).upper() == 'FACULTY')],
        "Judges": [v for v in volunteers if (v.type == VolunteerType.JUDGE if hasattr(VolunteerType, 'JUDGE') else str(v.type).upper() == 'JUDGE')],
        "Student Volunteers": [v for v in volunteers if not ((v.type == VolunteerType.FACULTY if hasattr(VolunteerType, 'FACULTY') else str(v.type).upper() == 'FACULTY') or (v.type == VolunteerType.JUDGE if hasattr(VolunteerType, 'JUDGE') else str(v.type).upper() == 'JUDGE'))]
    }

    for role_title, role_vols in roles_map.items():
        ws = wb.create_sheet(title=role_title)

        ws.append([f"{role_title.upper()} MASTER ROSTER & CHECK-IN DETAILS"])
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=10 + len(checkpoints) * 3)
        banner_cell = ws.cell(row=1, column=1)
        banner_cell.fill = header_fill
        banner_cell.font = title_font
        banner_cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[1].height = 28

        ws.append([f"Total {role_title}: {len(role_vols)}"])
        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=5)
        meta_cell = ws.cell(row=2, column=1)
        meta_cell.fill = meta_banner_fill
        meta_cell.font = meta_bold_font
        meta_cell.alignment = Alignment(horizontal="left", vertical="center")
        ws.row_dimensions[2].height = 22

        ws.append([]) # Spacer row 3

        role_headers = [
            "Name", "Type / Sub-role", "Email", "Phone",
            "Assigned POD", "Assigned Panel", "Assigned PS",
            "Username", "Password", "Remarks"
        ]
        if checkpoints:
            for cp in checkpoints:
                role_headers.extend([
                    f"{cp.name} Check-In",
                    f"{cp.name} Time",
                    f"{cp.name} Marked By"
                ])
        else:
            role_headers.extend(["Check-In Status", "Check-In Time", "Marked By"])

        ws.append(role_headers)
        hdr_row = ws.max_row
        ws.row_dimensions[hdr_row].height = 22
        for col_idx in range(1, len(role_headers) + 1):
            c = ws.cell(row=hdr_row, column=col_idx)
            c.fill = section_fill
            c.font = header_font
            c.border = thin_border
            c.alignment = Alignment(horizontal="left", vertical="center")

        if not role_vols:
            ws.append([f"No {role_title.lower()} recorded.", "", "", "", "", "", "", "", "", ""])
            c = ws.cell(row=ws.max_row, column=1)
            c.font = italic_note_font
        else:
            for v in role_vols:
                email, phone = parse_contact_info(v.contact)
                vol_type_str = v.type.value if hasattr(v.type, 'value') else str(v.type or "")
                pod_name = v.pod.name if v.pod else "Unassigned"
                panel_name = v.panel.name if v.panel else "Unassigned"
                ps_str = f"{v.problemStatement.code}" if v.problemStatement else "Unassigned"
                username = v.user.username if v.user else ""

                password_str = ""
                if v.user:
                    digits = re.sub(r'\D', '', phone)
                    if len(digits) >= 5:
                        password_str = f"MitVol@{digits[-5:]}"
                    else:
                        password_str = "MitVolunteer@123"

                row_vals = [
                    v.name or "",
                    vol_type_str,
                    email,
                    phone,
                    pod_name,
                    panel_name,
                    ps_str,
                    username,
                    password_str,
                    v.remarks or ""
                ]

                att_map = {rec.checkpointTypeId: rec for rec in (v.attendanceRecords or [])}
                if checkpoints:
                    for cp in checkpoints:
                        rec = att_map.get(cp.id)
                        if rec:
                            row_vals.extend([
                                "Yes",
                                rec.timestamp.strftime("%Y-%m-%d %H:%M:%S") if rec.timestamp else "",
                                rec.markedBy or ""
                            ])
                        else:
                            row_vals.extend(["No", "", ""])
                else:
                    if v.attendanceRecords:
                        first_rec = v.attendanceRecords[0]
                        row_vals.extend([
                            "Yes",
                            first_rec.timestamp.strftime("%Y-%m-%d %H:%M:%S") if first_rec.timestamp else "",
                            first_rec.markedBy or ""
                        ])
                    else:
                        row_vals.extend(["No", "", ""])

                ws.append(row_vals)
                curr_row = ws.max_row
                ws.row_dimensions[curr_row].height = 19
                for col_idx in range(1, len(row_vals) + 1):
                    c = ws.cell(row=curr_row, column=col_idx)
                    c.font = data_font
                    c.border = thin_border
                    c.alignment = Alignment(horizontal="left", vertical="center")

        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                if cell.row in [1, 2]:
                    continue
                val_str = str(cell.value or '')
                if len(val_str) > max_len:
                    max_len = min(len(val_str), 40)
            ws.column_dimensions[col_letter].width = min(max(max_len + 4, 14), 50)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    logger.info(f"Exported volunteers master workbook for event {current_user.eventId}")
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="volunteers_master_workbook.xlsx"'}
    )


@router.get("/volunteers")
def get_volunteers(
    search: Optional[str] = None,
    type: Optional[str] = None,
    podId: Optional[str] = None,
    page: Optional[int] = None,
    limit: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('staff.view'))
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
    {"name": "Faculty Lead", "target": "both"},
    {"name": "Judge / Evaluator", "target": "ps"},
    {"name": "Volunteer / Monitor", "target": "pod"}
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
    current_user: Principal = Depends(require_permission('staff.view'))
):
    config = db.query(EventConfig).filter(EventConfig.eventId == current_user.eventId).first()
    if config and config.peopleRoles:
        return normalize_people_roles(config.peopleRoles)
    return DEFAULT_PEOPLE_ROLES

@router.post("/people-roles")
def add_people_role(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('staff.manage'))
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
    current_user: Principal = Depends(require_permission('staff.manage'))
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
    current_user: Principal = Depends(require_permission('staff.manage'))
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
    current_user: Principal = Depends(require_permission('staff.manage'))
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
    current_user: Principal = Depends(require_permission('staff.manage'))
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
    current_user: Principal = Depends(require_permission('staff.credentials'))
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
    current_user: Principal = Depends(require_permission('staff.credentials'))
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
    current_user: Principal = Depends(require_permission('staff.credentials'))
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
    current_user: Principal = Depends(require_permission('team.credentials'))
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
    current_user: Principal = Depends(require_permission('staff.manage'))
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
        contact = str(row.get("contact", "")).strip()
        remarks = str(row.get("remarks", "")).strip() if row.get("remarks") is not None and pd.notna(row.get("remarks")) else None
        if remarks == "nan" or not remarks:
            remarks = None

        if not name or name.lower() == "nan":
            preview_data["invalid"].append({"row": row_num, "reason": "Missing Name"})
            continue

        raw_type = str(row.get("type", "VOLUNTEER")).strip().upper()
        if "JUDGE" in raw_type or "EVALUAT" in raw_type:
            type_str = "JUDGE"
        elif "FACULTY" in raw_type or "PROF" in raw_type or "TEACHER" in raw_type:
            type_str = "FACULTY"
        elif raw_type in ["FACULTY", "JUDGE", "VOLUNTEER"]:
            type_str = raw_type
        else:
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
    current_user: Principal = Depends(require_permission('staff.manage'))
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
    current_user: Principal = Depends(require_permission('ps.view'))
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
    current_user: Principal = Depends(require_permission('ps.manage'))
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

@router.post("/problem-statements/clear-selections")
def clear_all_ps_selections(
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('ps.danger'))
):
    """One-click admin reset of all team leader problem statement selections."""
    event_teams = db.query(Team.id).filter(Team.eventId == current_user.eventId).subquery()
    deleted_count = db.query(PSSelection).filter(PSSelection.teamId.in_(event_teams)).delete(synchronize_session=False)

    # Reset selectedCount = 0 on all ProblemStatement rows
    db.query(ProblemStatement).filter(ProblemStatement.eventId == current_user.eventId).update({"selectedCount": 0}, synchronize_session=False)

    log_audit(
        db=db,
        actor_id=current_user.id,
        action="ps.clear_all_selections",
        entity_type="Event",
        entity_id=current_user.eventId,
        diff={"clearedSelectionsCount": deleted_count}
    )

    db.commit()
    logger.info(f"Admin '{current_user.username}' cleared all {deleted_count} problem statement selections.")
    return {
        "message": f"Successfully cleared all {deleted_count} team problem statement selections.",
        "clearedCount": deleted_count
    }


@router.post("/problem-statements/purge-test-data")
def purge_problem_statements_and_selections(
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('ps.danger'))
):
    """Deletes all PS selections AND deletes all test problem statements for this event."""
    event_teams = db.query(Team.id).filter(Team.eventId == current_user.eventId).subquery()
    selections_deleted = db.query(PSSelection).filter(PSSelection.teamId.in_(event_teams)).delete(synchronize_session=False)

    # Delete all problem statements for this event
    ps_deleted = db.query(ProblemStatement).filter(ProblemStatement.eventId == current_user.eventId).delete(synchronize_session=False)

    log_audit(
        db=db,
        actor_id=current_user.id,
        action="ps.purge_test_data",
        entity_type="Event",
        entity_id=current_user.eventId,
        diff={"clearedSelections": selections_deleted, "deletedProblemStatements": ps_deleted}
    )

    db.commit()
    logger.info(f"Admin '{current_user.username}' purged {selections_deleted} selections and {ps_deleted} problem statements.")
    return {
        "message": f"Successfully cleared {selections_deleted} team selections and deleted {ps_deleted} problem statements.",
        "selectionsDeleted": selections_deleted,
        "problemStatementsDeleted": ps_deleted
    }


@router.put("/problem-statements/{ps_id}", response_model=ProblemStatementResponse)
@router.patch("/problem-statements/{ps_id}", response_model=ProblemStatementResponse)
def update_problem_statement(
    ps_id: str,
    payload: ProblemStatementUpdate,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('ps.manage'))
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
    current_user: Principal = Depends(require_permission('ps.manage'))
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
    current_user: Principal = Depends(require_permission('ps.export'))
):
    statements = (
        db.query(ProblemStatement)
        .options(
            joinedload(ProblemStatement.panel),
            joinedload(ProblemStatement.selections).joinedload(PSSelection.team).joinedload(Team.pod),
            joinedload(ProblemStatement.selections).joinedload(PSSelection.team).joinedload(Team.members)
        )
        .filter(ProblemStatement.eventId == current_user.eventId)
        .order_by(ProblemStatement.code)
        .all()
    )

    wb = openpyxl.Workbook()
    if "Sheet" in wb.sheetnames:
        wb.remove(wb["Sheet"])

    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    section_fill = PatternFill(start_color="334155", end_color="334155", fill_type="solid")
    sub_header_fill = PatternFill(start_color="475569", end_color="475569", fill_type="solid")
    meta_banner_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")

    title_font = Font(name="Calibri", size=12, bold=True, color="FFFFFF")
    section_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    header_font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
    meta_bold_font = Font(name="Calibri", size=10, bold=True, color="1E293B")
    data_font = Font(name="Calibri", size=10, color="0F172A")
    italic_note_font = Font(name="Calibri", size=10, italic=True, color="64748B")

    thin_border = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )

    # -------------------------------------------------------------
    # SHEET 1: PS OVERVIEW & FINGERTIPS ANALYSIS
    # -------------------------------------------------------------
    ws_summary = wb.create_sheet(title="PS Overview")

    ws_summary.append(["PROBLEM STATEMENTS MASTER OVERVIEW & ANALYSIS"])
    ws_summary.merge_cells(start_row=1, start_column=1, end_row=1, end_column=8)
    cell_title = ws_summary.cell(row=1, column=1)
    cell_title.fill = header_fill
    cell_title.font = title_font
    cell_title.alignment = Alignment(horizontal="center", vertical="center")
    ws_summary.row_dimensions[1].height = 28

    total_ps = len(statements)
    total_capacity = sum(s.capacity or 0 for s in statements)
    total_selected = sum(len(s.selections) for s in statements)
    fill_pct = (total_selected / total_capacity * 100) if total_capacity > 0 else 0

    kpi_row = [
        f"Total PS Challenges: {total_ps} | Total Capacity: {total_capacity} | Teams Selected: {total_selected} | Overall Fill Rate: {fill_pct:.1f}%",
        "", "", "", "", "", "", ""
    ]
    ws_summary.append(kpi_row)
    ws_summary.merge_cells(start_row=2, start_column=1, end_row=2, end_column=8)
    kpi_cell = ws_summary.cell(row=2, column=1)
    kpi_cell.fill = meta_banner_fill
    kpi_cell.font = meta_bold_font
    kpi_cell.alignment = Alignment(horizontal="left", vertical="center")
    ws_summary.row_dimensions[2].height = 22

    ws_summary.append([]) # Spacer row 3

    summary_headers = [
        "PS Code", "Problem Statement Title", "Discipline / Category",
        "Capacity", "Teams Selected", "Slots Remaining", "Fill %", "Assigned Panel"
    ]
    ws_summary.append(summary_headers)
    ws_summary.row_dimensions[4].height = 22

    for col_idx in range(1, len(summary_headers) + 1):
        c = ws_summary.cell(row=4, column=col_idx)
        c.fill = section_fill
        c.font = header_font
        c.alignment = Alignment(horizontal="left", vertical="center")
        c.border = thin_border

    if not statements:
        ws_summary.append(["No problem statements configured.", "", "", "", "", "", "", ""])
        c = ws_summary.cell(row=5, column=1)
        c.font = italic_note_font
    else:
        for s in statements:
            cap = s.capacity or 0
            sel_cnt = len(s.selections)
            rem = max(cap - sel_cnt, 0)
            ps_fill = (sel_cnt / cap * 100) if cap > 0 else 0
            disc_str = s.discipline.value if hasattr(s.discipline, 'value') else str(s.discipline or "BOTH")
            panel_name = s.panel.name if s.panel else "Unassigned"

            row_vals = [
                s.code,
                s.title,
                disc_str,
                cap,
                sel_cnt,
                rem,
                f"{ps_fill:.1f}%",
                panel_name
            ]
            ws_summary.append(row_vals)
            curr_row = ws_summary.max_row
            ws_summary.row_dimensions[curr_row].height = 20
            for col_idx in range(1, len(row_vals) + 1):
                c = ws_summary.cell(row=curr_row, column=col_idx)
                c.font = data_font
                c.border = thin_border
                c.alignment = Alignment(horizontal="left", vertical="center")

    for col in ws_summary.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            val_str = str(cell.value or '')
            if cell.row in [1, 2]:
                continue
            if len(val_str) > max_len:
                max_len = min(len(val_str), 40)
        ws_summary.column_dimensions[col_letter].width = min(max(max_len + 4, 14), 50)

    # -------------------------------------------------------------
    # PS-WISE SHEETS
    # -------------------------------------------------------------
    used_titles = {"ps overview"}
    for s in statements:
        raw_code = s.code or "PS"
        sheet_title = raw_code[:30]
        for char in [':', '\\', '/', '?', '*', '[', ']']:
            sheet_title = sheet_title.replace(char, '_')
        sheet_title = sheet_title.strip() or "PS"

        base_title = sheet_title
        counter = 1
        while sheet_title.lower() in used_titles:
            sheet_title = f"{base_title[:27]}_{counter}"
            counter += 1
        used_titles.add(sheet_title.lower())

        ws = wb.create_sheet(title=sheet_title)

        ws.append([f"PROBLEM STATEMENT: {s.code} - {s.title.upper()}"])
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=11)
        banner_cell = ws.cell(row=1, column=1)
        banner_cell.fill = header_fill
        banner_cell.font = title_font
        banner_cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[1].height = 28

        disc_str = s.discipline.value if hasattr(s.discipline, 'value') else str(s.discipline or "BOTH")
        cap = s.capacity or 0
        sel_cnt = len(s.selections)
        rem = max(cap - sel_cnt, 0)
        panel_name = s.panel.name if s.panel else "Unassigned"

        meta_row = [
            f"Discipline: {disc_str} | Capacity: {cap} | Teams Selected: {sel_cnt} | Slots Remaining: {rem} | Assigned Panel: {panel_name}",
            "", "", "", "", "", "", "", "", "", ""
        ]
        ws.append(meta_row)
        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=11)
        meta_cell = ws.cell(row=2, column=1)
        meta_cell.fill = meta_banner_fill
        meta_cell.font = meta_bold_font
        meta_cell.alignment = Alignment(horizontal="left", vertical="center")
        ws.row_dimensions[2].height = 22

        ws.append([]) # Row 3 spacer

        # Description & Requirements Block
        ws.append(["CHALLENGE DESCRIPTION & REQUIREMENTS"])
        desc_sec_row = ws.max_row
        ws.merge_cells(start_row=desc_sec_row, start_column=1, end_row=desc_sec_row, end_column=11)
        c_sec = ws.cell(row=desc_sec_row, column=1)
        c_sec.fill = section_fill
        c_sec.font = section_font
        ws.row_dimensions[desc_sec_row].height = 20

        req_str = s.requirements or "None specified"
        desc_str = s.description or "No description provided."
        
        ws.append(["Requirements:", req_str, "", "", "", "", "", "", "", "", ""])
        req_row = ws.max_row
        ws.merge_cells(start_row=req_row, start_column=2, end_row=req_row, end_column=11)
        ws.cell(row=req_row, column=1).font = meta_bold_font
        ws.cell(row=req_row, column=2).font = data_font

        ws.append(["Description:", desc_str, "", "", "", "", "", "", "", "", ""])
        desc_row = ws.max_row
        ws.merge_cells(start_row=desc_row, start_column=2, end_row=desc_row, end_column=11)
        ws.cell(row=desc_row, column=1).font = meta_bold_font
        ws.cell(row=desc_row, column=2).font = data_font
        ws.row_dimensions[desc_row].height = 28

        ws.append([]) # Spacer row

        # Section: Selected Teams
        ws.append(["TEAMS WHO SELECTED THIS PROBLEM STATEMENT"])
        teams_sec_row = ws.max_row
        ws.merge_cells(start_row=teams_sec_row, start_column=1, end_row=teams_sec_row, end_column=11)
        c_tsec = ws.cell(row=teams_sec_row, column=1)
        c_tsec.fill = section_fill
        c_tsec.font = section_font
        ws.row_dimensions[teams_sec_row].height = 22

        team_headers = [
            "#", "Selection Timestamp", "Team Code", "Team Name",
            "Leader Name", "Leader Email", "Leader Phone",
            "College Name", "Desk No.", "Status", "Assigned POD"
        ]
        ws.append(team_headers)
        th_row = ws.max_row
        ws.row_dimensions[th_row].height = 20
        for col_idx in range(1, len(team_headers) + 1):
            c = ws.cell(row=th_row, column=col_idx)
            c.fill = sub_header_fill
            c.font = header_font
            c.border = thin_border

        if not s.selections:
            ws.append(["No teams have selected this problem statement yet.", "", "", "", "", "", "", "", "", "", ""])
            empty_row = ws.max_row
            ws.merge_cells(start_row=empty_row, start_column=1, end_row=empty_row, end_column=11)
            c = ws.cell(row=empty_row, column=1)
            c.font = italic_note_font
            c.border = thin_border
        else:
            sorted_sels = sorted(s.selections, key=lambda sel: sel.selectedAt if sel.selectedAt else datetime.min)
            for idx, sel in enumerate(sorted_sels, 1):
                t = sel.team
                if not t:
                    continue
                sel_time = sel.selectedAt.strftime("%Y-%m-%d %H:%M:%S") if sel.selectedAt else "N/A"
                pod_name = t.pod.name if t.pod else "Unassigned"
                status_str = t.status.value if hasattr(t.status, 'value') else str(t.status or "")

                row_vals = [
                    idx,
                    sel_time,
                    t.registrationId or "",
                    t.name or "",
                    t.leaderName or "",
                    t.leaderEmail or "",
                    t.leaderPhone or "",
                    t.collegeName or "",
                    t.deskNumber or "",
                    status_str,
                    pod_name
                ]
                ws.append(row_vals)
                curr_row = ws.max_row
                ws.row_dimensions[curr_row].height = 19
                for col_idx in range(1, len(row_vals) + 1):
                    c = ws.cell(row=curr_row, column=col_idx)
                    c.font = data_font
                    c.border = thin_border
                    c.alignment = Alignment(horizontal="left", vertical="center")

        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                if cell.row in [1, 2, desc_sec_row, teams_sec_row, req_row, desc_row]:
                    continue
                val_str = str(cell.value or '')
                if len(val_str) > max_len:
                    max_len = min(len(val_str), 40)
            ws.column_dimensions[col_letter].width = min(max(max_len + 4, 14), 50)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    logger.info(f"Exported problem statements master workbook for event {current_user.eventId}")
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="problem_statements_master_workbook.xlsx"'}
    )


@router.post("/problem-statements/import/preview")
async def import_problem_statements_preview(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('ps.manage'))
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
        if "DESIGN" in discipline_raw or "[DESIGN]" in title.upper() or "DESIGN" in code:
            discipline = "DESIGN"
        elif "ENGINEERING" in discipline_raw or "ENG" in discipline_raw or "[ENGINEERING]" in title.upper() or "ENGINEERING" in code:
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
            
        cap_str = str(capacity_raw).strip().lower() if capacity_raw is not None and pd.notna(capacity_raw) else ""
        is_unlimited_text = any(kw in cap_str for kw in ["cap", "limit", "unlimit", "open", "free", "inf", "none", "n/a"]) or cap_str in ["-1", "0", ""]
        if is_unlimited_text or discipline == "DESIGN":
            capacity = 999999
        else:
            try:
                capacity = int(float(cap_str))
                if capacity <= 0:
                    capacity = 999999
            except (ValueError, TypeError):
                if discipline == "DESIGN":
                    capacity = 999999
                else:
                    capacity = None

        if capacity is None:
            preview_data["invalid"].append({"row": row_num, "reason": f"Capacity must be a positive integer or 'Unlimited'. Got '{capacity_raw}'"})
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
    current_user: Principal = Depends(require_permission('ps.manage'))
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
        # 1. Add or update new PS records safely (upsert logic)
        for row in new_statements:
            ps_code = str(row["code"]).strip().upper()
            existing_ps = db.query(ProblemStatement).filter(
                ProblemStatement.code == ps_code,
                ProblemStatement.eventId == current_user.eventId
            ).first()

            if existing_ps:
                existing_ps.title = row["title"]
                existing_ps.description = row["description"]
                existing_ps.capacity = row["capacity"]
                existing_ps.requirements = row.get("requirements")
                existing_ps.discipline = row.get("discipline")
            else:
                ps = ProblemStatement(
                    eventId=current_user.eventId,
                    code=ps_code,
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
        logger.error(f"[PS IMPORT CONFIRM FAILED] Error: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Database write error: {str(e)}")

@router.get("/problem-statements/{ps_id}/teams")
def get_ps_selected_teams(
    ps_id: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('ps.view'))
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
    current_user: Principal = Depends(require_permission('config.view'))
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
    current_user: Principal = Depends(require_permission('config.manage'))
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
    current_user: Principal = Depends(require_permission('checkpoint.view'))
):
    return db.query(CheckpointType).filter(CheckpointType.eventId == current_user.eventId).order_by(CheckpointType.name).all()

@router.post("/checkpoints", response_model=CheckpointTypeResponse)
def create_checkpoint(
    payload: CheckpointTypeCreate,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('checkpoint.manage'))
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
    current_user: Principal = Depends(require_permission('checkpoint.manage'))
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
    current_user: Principal = Depends(require_permission('checkpoint.manage'))
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
    current_user: Principal = Depends(require_permission('attendance.danger'))
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


@router.get("/checkpoints/export-master-workbook")
def export_attendance_master_workbook(
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('attendance.export'))
):
    """
    Exports a comprehensive multi-sheet Master Excel Workbook containing:
    1. Overall Checkpoint Summary
    2. Participant Attendance Matrix (all team members across all checkpoints)
    3. Volunteer Attendance Matrix (all volunteers across all checkpoints)
    4. Individual Sheets for each Checkpoint / Attendance Slot
    """
    try:
        checkpoints = db.query(CheckpointType).filter(
            CheckpointType.eventId == current_user.eventId
        ).order_by(CheckpointType.name).all()

        members = db.query(TeamMember).options(
            joinedload(TeamMember.team).joinedload(Team.pod),
            joinedload(TeamMember.attendance)
        ).join(Team).filter(
            Team.eventId == current_user.eventId
        ).order_by(Team.registrationId, TeamMember.isTeamLeader.desc(), TeamMember.name).all()

        volunteers = db.query(Volunteer).options(
            joinedload(Volunteer.pod),
            joinedload(Volunteer.attendanceRecords)
        ).filter(
            Volunteer.eventId == current_user.eventId
        ).order_by(Volunteer.name).all()

        wb = openpyxl.Workbook()
        if "Sheet" in wb.sheetnames:
            wb.remove(wb["Sheet"])

        header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
        sub_header_fill = PatternFill(start_color="475569", end_color="475569", fill_type="solid")
        meta_banner_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")

        title_font = Font(name="Calibri", size=12, bold=True, color="FFFFFF")
        header_font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
        meta_bold_font = Font(name="Calibri", size=10, bold=True, color="1E293B")
        data_font = Font(name="Calibri", size=10, color="0F172A")
        yes_font = Font(name="Calibri", size=10, bold=True, color="166534")
        no_font = Font(name="Calibri", size=10, color="991B1B")

        thin_border = Border(
            left=Side(style='thin', color='CBD5E1'),
            right=Side(style='thin', color='CBD5E1'),
            top=Side(style='thin', color='CBD5E1'),
            bottom=Side(style='thin', color='CBD5E1')
        )

        # -------------------------------------------------------------
        # SHEET 1: OVERALL ATTENDANCE SUMMARY
        # -------------------------------------------------------------
        ws_summary = wb.create_sheet(title="Attendance Overview")
        ws_summary.append(["ATTENDANCE & CHECKPOINT MASTER SUMMARY"])
        ws_summary.merge_cells(start_row=1, start_column=1, end_row=1, end_column=6)
        cell_title = ws_summary.cell(row=1, column=1)
        cell_title.fill = header_fill
        cell_title.font = title_font
        cell_title.alignment = Alignment(horizontal="center", vertical="center")
        ws_summary.row_dimensions[1].height = 28

        total_participants = len(members)
        total_vols = len(volunteers)

        ws_summary.append([f"Total Registered Participants: {total_participants}  |  Total Volunteers: {total_vols}  |  Total Slots: {len(checkpoints)}"])
        ws_summary.merge_cells(start_row=2, start_column=1, end_row=2, end_column=6)
        cell_meta = ws_summary.cell(row=2, column=1)
        cell_meta.fill = meta_banner_fill
        cell_meta.font = meta_bold_font
        cell_meta.alignment = Alignment(horizontal="center", vertical="center")
        ws_summary.row_dimensions[2].height = 20

        ws_summary.append([]) # Empty row

        summary_headers = [
            "Checkpoint / Slot Name", "Description", "Participants Checked In", 
            "Participant Rate %", "Volunteers Checked In", "Volunteer Rate %"
        ]
        ws_summary.append(summary_headers)
        ws_summary.row_dimensions[4].height = 22
        for col_idx in range(1, len(summary_headers) + 1):
            c = ws_summary.cell(row=4, column=col_idx)
            c.fill = sub_header_fill
            c.font = header_font
            c.alignment = Alignment(horizontal="center", vertical="center")
            c.border = thin_border

        row_idx = 5
        for cp in checkpoints:
            p_count = sum(1 for m in members if any(r.checkpointTypeId == cp.id for r in (m.attendance or [])))
            v_count = sum(1 for v in volunteers if any(r.checkpointTypeId == cp.id for r in (v.attendanceRecords or [])))
            
            p_pct = f"{(p_count / total_participants * 100):.1f}%" if total_participants > 0 else "0.0%"
            v_pct = f"{(v_count / total_vols * 100):.1f}%" if total_vols > 0 else "0.0%"

            ws_summary.append([cp.name, cp.description or "", p_count, p_pct, v_count, v_pct])
            ws_summary.row_dimensions[row_idx].height = 19
            for col_idx in range(1, len(summary_headers) + 1):
                c = ws_summary.cell(row=row_idx, column=col_idx)
                c.font = data_font
                c.border = thin_border
                if col_idx in [3, 4, 5, 6]:
                    c.alignment = Alignment(horizontal="center", vertical="center")
                else:
                    c.alignment = Alignment(horizontal="left", vertical="center")
            row_idx += 1

        for col in ws_summary.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws_summary.column_dimensions[col_letter].width = max(max_len + 4, 15)

        # -------------------------------------------------------------
        # SHEET 2: PARTICIPANTS MASTER ATTENDANCE
        # -------------------------------------------------------------
        ws_part = wb.create_sheet(title="Participants Master")
        ws_part.append(["PARTICIPANTS ATTENDANCE MATRIX"])
        max_part_cols = max(1, 6 + len(checkpoints) * 2)
        ws_part.merge_cells(start_row=1, start_column=1, end_row=1, end_column=max_part_cols)
        cell_title = ws_part.cell(row=1, column=1)
        cell_title.fill = header_fill
        cell_title.font = title_font
        cell_title.alignment = Alignment(horizontal="center", vertical="center")
        ws_part.row_dimensions[1].height = 28

        part_headers = ["Team Code", "Team Name", "Member Name", "Role", "Contact No.", "POD Group"]
        for cp in checkpoints:
            part_headers.extend([f"{cp.name} Status", f"{cp.name} Check-In Time"])
        
        ws_part.append(part_headers)
        ws_part.row_dimensions[2].height = 22
        for col_idx in range(1, len(part_headers) + 1):
            c = ws_part.cell(row=2, column=col_idx)
            c.fill = sub_header_fill
            c.font = header_font
            c.alignment = Alignment(horizontal="center", vertical="center")
            c.border = thin_border

        row_idx = 3
        for m in members:
            team_code = m.team.registrationId if m.team else ""
            team_name = m.team.name if m.team else ""
            pod_name = m.team.pod.name if (m.team and m.team.pod) else "Unassigned"
            role_str = "Leader" if m.isTeamLeader else "Member"

            row_vals = [team_code, team_name, m.name, role_str, m.phone or "", pod_name]
            att_map = {rec.checkpointTypeId: rec for rec in (m.attendance or [])}

            for cp in checkpoints:
                rec = att_map.get(cp.id)
                if rec:
                    ts_str = rec.timestamp.strftime("%Y-%m-%d %H:%M:%S") if rec.timestamp else "Yes"
                    row_vals.extend(["Yes", ts_str])
                else:
                    row_vals.extend(["No", "-"])

            ws_part.append(row_vals)
            ws_part.row_dimensions[row_idx].height = 19
            for col_idx in range(1, len(part_headers) + 1):
                c = ws_part.cell(row=row_idx, column=col_idx)
                c.font = data_font
                c.border = thin_border
                val_str = str(row_vals[col_idx - 1])
                if val_str == "Yes":
                    c.font = yes_font
                    c.alignment = Alignment(horizontal="center", vertical="center")
                elif val_str == "No":
                    c.font = no_font
                    c.alignment = Alignment(horizontal="center", vertical="center")
                else:
                    c.alignment = Alignment(horizontal="left", vertical="center")
            row_idx += 1

        for col in ws_part.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws_part.column_dimensions[col_letter].width = max(max_len + 3, 12)

        # -------------------------------------------------------------
        # SHEET 3: VOLUNTEERS MASTER ATTENDANCE
        # -------------------------------------------------------------
        ws_vol = wb.create_sheet(title="Volunteers Master")
        ws_vol.append(["VOLUNTEERS ATTENDANCE MATRIX"])
        max_vol_cols = max(1, 4 + len(checkpoints) * 2)
        ws_vol.merge_cells(start_row=1, start_column=1, end_row=1, end_column=max_vol_cols)
        cell_title = ws_vol.cell(row=1, column=1)
        cell_title.fill = header_fill
        cell_title.font = title_font
        cell_title.alignment = Alignment(horizontal="center", vertical="center")
        ws_vol.row_dimensions[1].height = 28

        vol_headers = ["Volunteer Name", "Role / Type", "Contact No.", "Assigned POD Group"]
        for cp in checkpoints:
            vol_headers.extend([f"{cp.name} Status", f"{cp.name} Check-In Time"])

        ws_vol.append(vol_headers)
        ws_vol.row_dimensions[2].height = 22
        for col_idx in range(1, len(vol_headers) + 1):
            c = ws_vol.cell(row=2, column=col_idx)
            c.fill = sub_header_fill
            c.font = header_font
            c.alignment = Alignment(horizontal="center", vertical="center")
            c.border = thin_border

        row_idx = 3
        for v in volunteers:
            vol_type = v.type.value if hasattr(v.type, 'value') else str(v.type or "")
            pod_name = v.pod.name if v.pod else "Unassigned"
            row_vals = [v.name, vol_type, v.contact or "", pod_name]
            att_map = {rec.checkpointTypeId: rec for rec in (v.attendanceRecords or [])}

            for cp in checkpoints:
                rec = att_map.get(cp.id)
                if rec:
                    ts_str = rec.timestamp.strftime("%Y-%m-%d %H:%M:%S") if rec.timestamp else "Yes"
                    row_vals.extend(["Yes", ts_str])
                else:
                    row_vals.extend(["No", "-"])

            ws_vol.append(row_vals)
            ws_vol.row_dimensions[row_idx].height = 19
            for col_idx in range(1, len(vol_headers) + 1):
                c = ws_vol.cell(row=row_idx, column=col_idx)
                c.font = data_font
                c.border = thin_border
                val_str = str(row_vals[col_idx - 1])
                if val_str == "Yes":
                    c.font = yes_font
                    c.alignment = Alignment(horizontal="center", vertical="center")
                elif val_str == "No":
                    c.font = no_font
                    c.alignment = Alignment(horizontal="center", vertical="center")
                else:
                    c.alignment = Alignment(horizontal="left", vertical="center")
            row_idx += 1

        for col in ws_vol.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws_vol.column_dimensions[col_letter].width = max(max_len + 3, 12)

        # -------------------------------------------------------------
        # SHEET 4+: INDIVIDUAL CHECKPOINT SHEETS
        # -------------------------------------------------------------
        for cp in checkpoints:
            clean_title = re.sub(r'[\/*?:\[\]]', '', cp.name)[:30]
            ws_cp = wb.create_sheet(title=clean_title)
            
            ws_cp.append([f"CHECKPOINT RECORDS: {cp.name.upper()}"])
            ws_cp.merge_cells(start_row=1, start_column=1, end_row=1, end_column=7)
            cell_title = ws_cp.cell(row=1, column=1)
            cell_title.fill = header_fill
            cell_title.font = title_font
            cell_title.alignment = Alignment(horizontal="center", vertical="center")
            ws_cp.row_dimensions[1].height = 28

            cp_headers = ["Record Type", "Code / Type", "Name", "Team / Pod Name", "Contact", "Check-in Timestamp", "Marked By"]
            ws_cp.append(cp_headers)
            ws_cp.row_dimensions[2].height = 22
            for col_idx in range(1, len(cp_headers) + 1):
                c = ws_cp.cell(row=2, column=col_idx)
                c.fill = sub_header_fill
                c.font = header_font
                c.alignment = Alignment(horizontal="center", vertical="center")
                c.border = thin_border

            row_idx = 3
            # Add participant records for this checkpoint
            for m in members:
                rec = next((r for r in (m.attendance or []) if r.checkpointTypeId == cp.id), None)
                if rec:
                    team_code = m.team.registrationId if m.team else ""
                    team_name = m.team.name if m.team else ""
                    ts_str = rec.timestamp.strftime("%Y-%m-%d %H:%M:%S") if rec.timestamp else ""
                    ws_cp.append(["Participant", team_code, m.name, team_name, m.phone or "", ts_str, rec.markedBy or ""])
                    ws_cp.row_dimensions[row_idx].height = 19
                    for col_idx in range(1, len(cp_headers) + 1):
                        c = ws_cp.cell(row=row_idx, column=col_idx)
                        c.font = data_font
                        c.border = thin_border
                    row_idx += 1

            # Add volunteer records for this checkpoint
            for v in volunteers:
                rec = next((r for r in (v.attendanceRecords or []) if r.checkpointTypeId == cp.id), None)
                if rec:
                    vol_type = v.type.value if hasattr(v.type, 'value') else str(v.type or "")
                    pod_name = v.pod.name if v.pod else "Unassigned"
                    ts_str = rec.timestamp.strftime("%Y-%m-%d %H:%M:%S") if rec.timestamp else ""
                    ws_cp.append(["Volunteer", vol_type, v.name, pod_name, v.contact or "", ts_str, rec.markedBy or ""])
                    ws_cp.row_dimensions[row_idx].height = 19
                    for col_idx in range(1, len(cp_headers) + 1):
                        c = ws_cp.cell(row=row_idx, column=col_idx)
                        c.font = data_font
                        c.border = thin_border
                    row_idx += 1

            for col in ws_cp.columns:
                max_len = max(len(str(cell.value or '')) for cell in col)
                col_letter = get_column_letter(col[0].column)
                ws_cp.column_dimensions[col_letter].width = max(max_len + 3, 14)

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)

        logger.info(f"Exported master attendance workbook across {len(checkpoints)} checkpoints for event {current_user.eventId}")
        headers = {
            'Content-Disposition': 'attachment; filename="attendance_master_workbook.xlsx"',
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
        return StreamingResponse(output, headers=headers)
    except Exception as e:
        logger.error(f"Failed to export master attendance workbook: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to export master attendance workbook: {str(e)}")


@router.get("/checkpoints/{id}/export")
def export_single_checkpoint_sheet(
    id: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('attendance.export'))
):
    """
    Exports a single checkpoint sheet workbook containing participant and volunteer check-in records for that specific checkpoint.
    """
    try:
        cp = db.query(CheckpointType).filter(
            CheckpointType.id == id,
            CheckpointType.eventId == current_user.eventId
        ).first()
        if not cp:
            raise HTTPException(status_code=404, detail="Checkpoint not found")

        members = db.query(TeamMember).options(
            joinedload(TeamMember.team),
            joinedload(TeamMember.attendance)
        ).join(Team).filter(
            Team.eventId == current_user.eventId
        ).order_by(Team.registrationId, TeamMember.name).all()

        volunteers = db.query(Volunteer).options(
            joinedload(Volunteer.pod),
            joinedload(Volunteer.attendanceRecords)
        ).filter(
            Volunteer.eventId == current_user.eventId
        ).order_by(Volunteer.name).all()

        wb = openpyxl.Workbook()
        if "Sheet" in wb.sheetnames:
            wb.remove(wb["Sheet"])

        header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
        sub_header_fill = PatternFill(start_color="475569", end_color="475569", fill_type="solid")
        title_font = Font(name="Calibri", size=12, bold=True, color="FFFFFF")
        header_font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
        data_font = Font(name="Calibri", size=10, color="0F172A")
        yes_font = Font(name="Calibri", size=10, bold=True, color="166534")
        no_font = Font(name="Calibri", size=10, color="991B1B")

        thin_border = Border(
            left=Side(style='thin', color='CBD5E1'),
            right=Side(style='thin', color='CBD5E1'),
            top=Side(style='thin', color='CBD5E1'),
            bottom=Side(style='thin', color='CBD5E1')
        )

        clean_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', cp.name).strip('_')

        # Participant sheet
        ws_p = wb.create_sheet(title="Participants")
        ws_p.append([f"CHECKPOINT: {cp.name.upper()} — PARTICIPANTS"])
        ws_p.merge_cells(start_row=1, start_column=1, end_row=1, end_column=7)
        cell_title = ws_p.cell(row=1, column=1)
        cell_title.fill = header_fill
        cell_title.font = title_font
        cell_title.alignment = Alignment(horizontal="center", vertical="center")
        ws_p.row_dimensions[1].height = 28

        headers_p = ["Team Code", "Team Name", "Member Name", "Role", "Check-in Status", "Check-in Timestamp", "Marked By"]
        ws_p.append(headers_p)
        ws_p.row_dimensions[2].height = 22
        for col_idx in range(1, len(headers_p) + 1):
            c = ws_p.cell(row=2, column=col_idx)
            c.fill = sub_header_fill
            c.font = header_font
            c.alignment = Alignment(horizontal="center", vertical="center")
            c.border = thin_border

        row_idx = 3
        for m in members:
            rec = next((r for r in (m.attendance or []) if r.checkpointTypeId == cp.id), None)
            team_code = m.team.registrationId if m.team else ""
            team_name = m.team.name if m.team else ""
            role_str = "Leader" if m.isTeamLeader else "Member"
            status_str = "Checked In" if rec else "Pending"
            ts_str = rec.timestamp.strftime("%Y-%m-%d %H:%M:%S") if (rec and rec.timestamp) else "-"
            marked_by = rec.markedBy if rec else "-"

            ws_p.append([team_code, team_name, m.name, role_str, status_str, ts_str, marked_by])
            ws_p.row_dimensions[row_idx].height = 19
            for col_idx in range(1, len(headers_p) + 1):
                c = ws_p.cell(row=row_idx, column=col_idx)
                c.font = data_font
                c.border = thin_border
                if col_idx == 5:
                    c.font = yes_font if rec else no_font
                    c.alignment = Alignment(horizontal="center", vertical="center")
            row_idx += 1

        for col in ws_p.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws_p.column_dimensions[col_letter].width = max(max_len + 3, 14)

        # Volunteer sheet
        ws_v = wb.create_sheet(title="Volunteers")
        ws_v.append([f"CHECKPOINT: {cp.name.upper()} — VOLUNTEERS"])
        ws_v.merge_cells(start_row=1, start_column=1, end_row=1, end_column=6)
        cell_title = ws_v.cell(row=1, column=1)
        cell_title.fill = header_fill
        cell_title.font = title_font
        cell_title.alignment = Alignment(horizontal="center", vertical="center")
        ws_v.row_dimensions[1].height = 28

        headers_v = ["Volunteer Name", "Role / Type", "Assigned Pod", "Check-in Status", "Check-in Timestamp", "Marked By"]
        ws_v.append(headers_v)
        ws_v.row_dimensions[2].height = 22
        for col_idx in range(1, len(headers_v) + 1):
            c = ws_v.cell(row=2, column=col_idx)
            c.fill = sub_header_fill
            c.font = header_font
            c.alignment = Alignment(horizontal="center", vertical="center")
            c.border = thin_border

        row_idx = 3
        for v in volunteers:
            rec = next((r for r in (v.attendanceRecords or []) if r.checkpointTypeId == cp.id), None)
            vol_type = v.type.value if hasattr(v.type, 'value') else str(v.type or "")
            pod_name = v.pod.name if v.pod else "Unassigned"
            status_str = "Checked In" if rec else "Pending"
            ts_str = rec.timestamp.strftime("%Y-%m-%d %H:%M:%S") if (rec and rec.timestamp) else "-"
            marked_by = rec.markedBy if rec else "-"

            ws_v.append([v.name, vol_type, pod_name, status_str, ts_str, marked_by])
            ws_v.row_dimensions[row_idx].height = 19
            for col_idx in range(1, len(headers_v) + 1):
                c = ws_v.cell(row=row_idx, column=col_idx)
                c.font = data_font
                c.border = thin_border
                if col_idx == 4:
                    c.font = yes_font if rec else no_font
                    c.alignment = Alignment(horizontal="center", vertical="center")
            row_idx += 1

        for col in ws_v.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws_v.column_dimensions[col_letter].width = max(max_len + 3, 14)

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)

        filename = f"{clean_name}_attendance_export.xlsx"
        headers = {
            'Content-Disposition': f'attachment; filename="{filename}"',
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
        return StreamingResponse(output, headers=headers)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to export single checkpoint sheet: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to export single checkpoint sheet: {str(e)}")


# ==========================================
# PANELS & EVALUATION ROSTER EXPORT
# ==========================================

@router.get("/panels", response_model=List[PanelResponse])
def get_panels(
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('panel.view'))
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
    res.sort(key=lambda p: natural_sort_key(p.name))
    return res

@router.post("/panels", response_model=PanelResponse)
def create_panel(
    payload: PanelCreate,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('panel.manage'))
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
    current_user: Principal = Depends(require_permission('panel.manage'))
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
    current_user: Principal = Depends(require_permission('panel.manage'))
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
    current_user: Principal = Depends(require_permission('round.export'))
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
        iter([output.getvalue().encode('utf-8-sig')]),
        headers={'Content-Disposition': 'attachment; filename="evaluation_roster.csv"', 'Content-Type': 'text/csv; charset=utf-8-sig'}
    )


# ==========================================
# EVALUATION ROUNDS MANAGEMENT
# ==========================================

@router.get("/evaluation-rounds", response_model=List[EvaluationRoundResponse])
def get_evaluation_rounds(
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('round.view'))
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
    current_user: Principal = Depends(require_permission('round.manage'))
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
    current_user: Principal = Depends(require_permission('round.manage'))
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
    current_user: Principal = Depends(require_permission('round.manage'))
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
    current_user: Principal = Depends(require_permission('round.export'))
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
    current_user: Principal = Depends(require_permission('round.export'))
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
    current_user: Principal = Depends(require_permission('panel.export'))
):
    panels = (
        db.query(Panel)
        .options(
            joinedload(Panel.problemStatement).joinedload(ProblemStatement.selections).joinedload(PSSelection.team).joinedload(Team.members),
            joinedload(Panel.volunteers)
        )
        .filter(Panel.eventId == current_user.eventId)
        .order_by(Panel.name)
        .all()
    )

    wb = openpyxl.Workbook()
    if "Sheet" in wb.sheetnames:
        wb.remove(wb["Sheet"])

    # Color Palette & Styles
    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    section_fill = PatternFill(start_color="334155", end_color="334155", fill_type="solid")
    sub_header_fill = PatternFill(start_color="475569", end_color="475569", fill_type="solid")
    meta_banner_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")

    title_font = Font(name="Calibri", size=12, bold=True, color="FFFFFF")
    section_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    header_font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
    meta_bold_font = Font(name="Calibri", size=10, bold=True, color="1E293B")
    data_font = Font(name="Calibri", size=10, color="0F172A")
    italic_note_font = Font(name="Calibri", size=10, italic=True, color="64748B")

    thin_border = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )

    # -------------------------------------------------------------
    # SHEET 1: PANELS OVERVIEW & ANALYSIS
    # -------------------------------------------------------------
    ws_summary = wb.create_sheet(title="Panels Overview")
    
    ws_summary.append(["EVALUATION PANELS MASTER OVERVIEW & ANALYSIS"])
    ws_summary.merge_cells(start_row=1, start_column=1, end_row=1, end_column=7)
    cell_title = ws_summary.cell(row=1, column=1)
    cell_title.fill = header_fill
    cell_title.font = title_font
    cell_title.alignment = Alignment(horizontal="center", vertical="center")
    ws_summary.row_dimensions[1].height = 28

    # KPI Banner
    total_panels = len(panels)
    total_assigned_ps = sum(1 for p in panels if p.problemStatementId)
    total_judges_faculty = sum((len(p.memberNames or []) + (1 if p.facultyMemberName else 0) + len(p.volunteers or [])) for p in panels)
    total_eval_teams = sum(len(p.problemStatement.selections) for p in panels if p.problemStatement and p.problemStatement.selections)

    kpi_row = [
        f"Total Panels: {total_panels} | Assigned PS: {total_assigned_ps} | Evaluators/Judges: {total_judges_faculty} | Total Teams to Evaluate: {total_eval_teams}",
        "", "", "", "", "", ""
    ]
    ws_summary.append(kpi_row)
    ws_summary.merge_cells(start_row=2, start_column=1, end_row=2, end_column=7)
    kpi_cell = ws_summary.cell(row=2, column=1)
    kpi_cell.fill = meta_banner_fill
    kpi_cell.font = meta_bold_font
    kpi_cell.alignment = Alignment(horizontal="left", vertical="center")
    ws_summary.row_dimensions[2].height = 22

    ws_summary.append([]) # Spacer row 3

    summary_headers = [
        "Panel Name", "Assigned PS Code", "Assigned PS Title",
        "Faculty Lead", "Assigned Judges / Evaluators", "Assigned Volunteers", "Total Teams to Evaluate"
    ]
    ws_summary.append(summary_headers)
    ws_summary.row_dimensions[4].height = 22

    for col_idx in range(1, len(summary_headers) + 1):
        cell = ws_summary.cell(row=4, column=col_idx)
        cell.fill = section_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="left", vertical="center")
        cell.border = thin_border

    if not panels:
        ws_summary.append(["No evaluation panels configured yet.", "", "", "", "", "", ""])
        cell = ws_summary.cell(row=5, column=1)
        cell.font = italic_note_font
    else:
        for p in panels:
            ps_code = p.problemStatement.code if p.problemStatement else "Unassigned"
            ps_title = p.problemStatement.title if p.problemStatement else "Unassigned"
            judges_str = ", ".join(p.memberNames) if p.memberNames else "None"
            vols_str = ", ".join([v.name for v in p.volunteers]) if p.volunteers else "None"
            teams_count = len(p.problemStatement.selections) if (p.problemStatement and p.problemStatement.selections) else 0

            row_vals = [
                p.name,
                ps_code,
                ps_title,
                p.facultyMemberName or "Unassigned",
                judges_str,
                vols_str,
                teams_count
            ]
            ws_summary.append(row_vals)
            curr_row = ws_summary.max_row
            ws_summary.row_dimensions[curr_row].height = 20
            for col_idx in range(1, len(row_vals) + 1):
                c = ws_summary.cell(row=curr_row, column=col_idx)
                c.font = data_font
                c.border = thin_border
                c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)

    for col in ws_summary.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            val_str = str(cell.value or '')
            if cell.row in [1, 2]:
                continue
            if len(val_str) > max_len:
                max_len = min(len(val_str), 40)
        ws_summary.column_dimensions[col_letter].width = min(max(max_len + 4, 16), 50)

    # -------------------------------------------------------------
    # PANEL-WISE SHEETS
    # -------------------------------------------------------------
    used_titles = {"panels overview"}
    for p in panels:
        raw_name = p.name or "Panel"
        sheet_title = raw_name[:30]
        for char in [':', '\\', '/', '?', '*', '[', ']']:
            sheet_title = sheet_title.replace(char, '_')
        sheet_title = sheet_title.strip() or "Panel"

        base_title = sheet_title
        counter = 1
        while sheet_title.lower() in used_titles:
            sheet_title = f"{base_title[:27]}_{counter}"
            counter += 1
        used_titles.add(sheet_title.lower())

        ws = wb.create_sheet(title=sheet_title)

        ws.append([f"EVALUATION PANEL: {p.name.upper()}"])
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=10)
        banner_cell = ws.cell(row=1, column=1)
        banner_cell.fill = header_fill
        banner_cell.font = title_font
        banner_cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[1].height = 28

        ps_code = p.problemStatement.code if p.problemStatement else "N/A"
        ps_title = p.problemStatement.title if p.problemStatement else "N/A"
        teams = p.problemStatement.selections if (p.problemStatement and p.problemStatement.selections) else []

        meta_row = [
            f"Assigned PS: {ps_code} - {ps_title} | Faculty Lead: {p.facultyMemberName or 'None'} | Teams to Evaluate: {len(teams)}",
            "", "", "", "", "", "", "", "", ""
        ]
        ws.append(meta_row)
        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=10)
        meta_cell = ws.cell(row=2, column=1)
        meta_cell.fill = meta_banner_fill
        meta_cell.font = meta_bold_font
        meta_cell.alignment = Alignment(horizontal="left", vertical="center")
        ws.row_dimensions[2].height = 22

        ws.append([]) # Spacer row 3

        # Section 1: Assigned Faculty & Judges
        ws.append(["PANEL EVALUATORS & FACULTY LEADS"])
        sec1_row = ws.max_row
        ws.merge_cells(start_row=sec1_row, start_column=1, end_row=sec1_row, end_column=4)
        sec1_cell = ws.cell(row=sec1_row, column=1)
        sec1_cell.fill = section_fill
        sec1_cell.font = section_font
        sec1_cell.alignment = Alignment(horizontal="left", vertical="center")
        ws.row_dimensions[sec1_row].height = 22

        eval_headers = ["Name", "Role / Designation", "Contact", "Source / Group"]
        ws.append(eval_headers)
        eval_hdr_row = ws.max_row
        ws.row_dimensions[eval_hdr_row].height = 20
        for c_idx in range(1, len(eval_headers) + 1):
            c = ws.cell(row=eval_hdr_row, column=c_idx)
            c.fill = sub_header_fill
            c.font = header_font
            c.border = thin_border

        eval_list = []
        if p.facultyMemberName:
            eval_list.append((p.facultyMemberName, "Faculty Lead", "", "Panel Config"))
        if p.memberNames:
            for j in p.memberNames:
                eval_list.append((j, "Judge / Evaluator", "", "Panel Config"))
        if p.volunteers:
            for v in p.volunteers:
                v_type = v.type.value if hasattr(v.type, 'value') else str(v.type or "Volunteer")
                eval_list.append((v.name, v_type, v.contact or "", "Assigned Volunteer"))

        if not eval_list:
            ws.append(["No evaluators or faculty currently assigned.", "", "", ""])
            empty_row = ws.max_row
            ws.merge_cells(start_row=empty_row, start_column=1, end_row=empty_row, end_column=4)
            c = ws.cell(row=empty_row, column=1)
            c.font = italic_note_font
            c.border = thin_border
        else:
            for item in eval_list:
                row_vals = [item[0], item[1], item[2], item[3]]
                ws.append(row_vals)
                curr_row = ws.max_row
                ws.row_dimensions[curr_row].height = 19
                for c_idx in range(1, len(row_vals) + 1):
                    c = ws.cell(row=curr_row, column=c_idx)
                    c.font = data_font
                    c.border = thin_border

        ws.append([]) # Spacer row

        # Section 2: Assigned Teams
        ws.append(["TEAMS ASSIGNED FOR EVALUATION"])
        sec2_row = ws.max_row
        ws.merge_cells(start_row=sec2_row, start_column=1, end_row=sec2_row, end_column=10)
        sec2_cell = ws.cell(row=sec2_row, column=1)
        sec2_cell.fill = section_fill
        sec2_cell.font = section_font
        sec2_cell.alignment = Alignment(horizontal="left", vertical="center")
        ws.row_dimensions[sec2_row].height = 22

        team_headers = [
            "Team Code", "Team Name", "Leader Name", "Leader Email",
            "Leader Phone", "College Name", "Desk No.", "Status", "Assigned POD", "Team Members"
        ]
        ws.append(team_headers)
        team_hdr_row = ws.max_row
        ws.row_dimensions[team_hdr_row].height = 20
        for c_idx in range(1, len(team_headers) + 1):
            c = ws.cell(row=team_hdr_row, column=c_idx)
            c.fill = sub_header_fill
            c.font = header_font
            c.border = thin_border

        if not teams:
            ws.append(["No teams assigned to this panel yet.", "", "", "", "", "", "", "", "", ""])
            empty_row = ws.max_row
            ws.merge_cells(start_row=empty_row, start_column=1, end_row=empty_row, end_column=10)
            c = ws.cell(row=empty_row, column=1)
            c.font = italic_note_font
            c.border = thin_border
        else:
            for sel in teams:
                t = sel.team
                if not t:
                    continue
                pod_name = t.pod.name if t.pod else "Unassigned"
                members_str = ", ".join([m.name for m in t.members if m.name]) if t.members else ""
                status_str = t.status.value if hasattr(t.status, 'value') else str(t.status or "")
                
                row_vals = [
                    t.registrationId or "",
                    t.name or "",
                    t.leaderName or "",
                    t.leaderEmail or "",
                    t.leaderPhone or "",
                    t.collegeName or "",
                    t.deskNumber or "",
                    status_str,
                    pod_name,
                    members_str
                ]
                ws.append(row_vals)
                curr_row = ws.max_row
                ws.row_dimensions[curr_row].height = 19
                for c_idx in range(1, len(row_vals) + 1):
                    c = ws.cell(row=curr_row, column=c_idx)
                    c.font = data_font
                    c.border = thin_border

        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                if cell.row in [1, 2, sec1_row, sec2_row]:
                    continue
                val_str = str(cell.value or '')
                if len(val_str) > max_len:
                    max_len = min(len(val_str), 40)
            ws.column_dimensions[col_letter].width = min(max(max_len + 4, 14), 50)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    logger.info(f"Exported panels master workbook with {len(panels)} panel sheets")
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="panels_master_workbook.xlsx"'}
    )

@router.post("/panels/import")
async def import_panels(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('panel.manage'))
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
    current_user: Principal = Depends(require_permission('round.export'))
):
    rounds = db.query(EvaluationRound).filter(EvaluationRound.eventId == current_user.eventId).order_by(EvaluationRound.roundNumber).all()
    output = io.StringIO()
    writer = csv.writer(output)
    safe_writerow(writer, ["Round Name", "Sequence Order", "Submissions Open"])
    for r in rounds:
        safe_writerow(writer, [r.name, r.roundNumber, "YES" if r.isSubmissionOpen else "NO"])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue().encode('utf-8-sig')]),
        headers={'Content-Disposition': 'attachment; filename="evaluation_rounds_export.csv"', 'Content-Type': 'text/csv; charset=utf-8-sig'}
    )

@router.post("/evaluation-rounds/import")
async def import_evaluation_rounds(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('round.manage'))
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
    current_user: Principal = Depends(require_permission('attendance.export'))
):
    slots = db.query(CheckpointType).filter(CheckpointType.eventId == current_user.eventId).order_by(CheckpointType.name).all()
    output = io.StringIO()
    writer = csv.writer(output)
    safe_writerow(writer, ["Slot Name", "Description"])
    for s in slots:
        safe_writerow(writer, [s.name, s.description or ""])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue().encode('utf-8-sig')]),
        headers={'Content-Disposition': 'attachment; filename="attendance_slots_export.csv"', 'Content-Type': 'text/csv; charset=utf-8-sig'}
    )

@router.post("/attendance-slots/import")
async def import_attendance_slots(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission('checkpoint.manage'))
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
