from datetime import datetime, timezone
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status, Request, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import text, or_
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.logger import logger
from app.models import (
    Role, Team, TeamMember, ProblemStatement, PSSelection, 
    EventConfig, Volunteer, AttendanceRecord, EvaluationRound, Submission
)
from app.auth import require_role, CurrentUser
from app.schemas import ProblemStatementResponse, SubmissionCreate
from app.limiter import limiter, team_key_func

router = APIRouter(prefix="/leader", tags=["leader"])



def _is_ps_released(config: Any) -> bool:
    if not config or not config.psReleaseAt:
        return False
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    ps_release = config.psReleaseAt.replace(tzinfo=None)
    return now_utc >= ps_release



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
                    "type": m.type.value if hasattr(m.type, 'value') else str(m.type or ""),
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
            "requirements": team.psSelection.ps.requirements,
            "discipline": team.psSelection.ps.discipline.value if hasattr(team.psSelection.ps.discipline, 'value') else str(team.psSelection.ps.discipline or ""),
            "capacity": team.psSelection.ps.capacity,
            "selectedAt": team.psSelection.selectedAt.replace(tzinfo=timezone.utc) if team.psSelection.selectedAt else None
        }
        
    return {
        "id": team.id,
        "registrationId": team.registrationId,
        "name": team.name,
        "collegeName": team.collegeName,
        "status": team.status.value,
        "category": team.category.value,
        "deskNumber": team.deskNumber,
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
    
    if not _is_ps_released(config):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Problem statements are not yet released"
        )

    team = db.query(Team).filter(Team.id == current_user.teamId).first()
    team_cat_str = team.category.value if hasattr(team.category, 'value') else str(team.category) if (team and team.category) else None

    query = db.query(ProblemStatement).filter(ProblemStatement.eventId == current_user.eventId)
    if team_cat_str:
        query = query.filter(or_(ProblemStatement.discipline == team_cat_str, ProblemStatement.discipline.is_(None)))

    statements = query.order_by(ProblemStatement.code).all()
    
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
            requirements=s.requirements,
            discipline=s.discipline
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

    team = db.query(Team).filter(Team.id == current_user.teamId).first()

    # 1. Enforce Server-side release time
    config = db.query(EventConfig).filter(EventConfig.eventId == current_user.eventId).first()
    if not _is_ps_released(config):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Problem statements have not been released yet"
        )


    # 1b. Discipline guard
    ps_obj = db.query(ProblemStatement).filter(ProblemStatement.id == ps_id).first()
    if not ps_obj:
        raise HTTPException(status_code=404, detail="Problem statement not found")

    team_cat_str = team.category.value if hasattr(team.category, 'value') else str(team.category) if (team and team.category) else None
    if ps_obj.discipline and team_cat_str and ps_obj.discipline != team_cat_str:
        logger.warn(f"leader.select_ps Cross-discipline attempt: team={team.id} ({team_cat_str}) ps={ps_obj.code} ({ps_obj.discipline})")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This problem statement is for {ps_obj.discipline}, but your team is registered as {team_cat_str}"
        )

    # 1c. Enforce Server-side check-in gate
    if config and config.psGateCheckpointTypeId:
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


# ==========================================
# EVALUATION ROUNDS (LEADER SUBMISSION)
# ==========================================

@router.get("/evaluation-rounds")
def get_evaluation_rounds_for_leader(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.LEADER))
):
    team = db.query(Team).filter(Team.id == current_user.teamId).first()
    if not team:
        raise HTTPException(status_code=400, detail="Team not found")

    rounds = db.query(EvaluationRound).filter(EvaluationRound.eventId == current_user.eventId).order_by(EvaluationRound.roundNumber).all()
    submissions = {s.roundId: s for s in db.query(Submission).filter(Submission.teamId == team.id).all()}

    res = []
    for r in rounds:
        sub = submissions.get(r.id)
        res.append({
            "id": r.id,
            "name": r.name,
            "roundNumber": r.roundNumber,
            "description": r.description,
            "fields": r.fields or [],
            "isOpen": r.isSubmissionOpen,
            "submission": {
                "id": sub.id,
                "driveLink": sub.driveLink if sub else None,
                "githubLink": sub.githubLink if sub else None,
                "answers": sub.answers or {} if sub else {},
                "submittedAt": sub.submittedAt.isoformat() if sub and sub.submittedAt else None,
                "updatedAt": sub.updatedAt.isoformat() if sub and sub.updatedAt else None
            } if sub else None
        })
    return res

@router.post("/evaluation-rounds/{round_id}/submit")
def submit_evaluation_round(
    round_id: str,
    payload: SubmissionCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role(Role.LEADER))
):
    round_obj = db.query(EvaluationRound).filter(
        EvaluationRound.id == round_id,
        EvaluationRound.eventId == current_user.eventId
    ).first()
    if not round_obj:
        raise HTTPException(status_code=404, detail="Evaluation round not found")

    if not round_obj.isSubmissionOpen:
        logger.warn(f"leader.submit_round Submission attempt on closed round: team={current_user.teamId} round={round_id}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Submissions are closed for this round")

    team_id = current_user.teamId
    existing = db.query(Submission).filter(Submission.teamId == team_id, Submission.roundId == round_id).first()

    if existing:
        existing.driveLink = payload.driveLink
        existing.githubLink = payload.githubLink
        if payload.answers is not None:
            existing.answers = payload.answers
        logger.info(f"leader.submit_round Updated submission for team={team_id} round={round_id}")
    else:
        submission = Submission(
            teamId=team_id,
            roundId=round_id,
            driveLink=payload.driveLink,
            githubLink=payload.githubLink,
            answers=payload.answers or {}
        )
        db.add(submission)
        logger.info(f"leader.submit_round Created submission for team={team_id} round={round_id}")

    db.commit()
    return {"success": True}
