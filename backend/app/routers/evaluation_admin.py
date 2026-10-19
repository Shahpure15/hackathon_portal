from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dto.evaluation_admin import (
    AssignableTeamDTO,
    AssignmentPreviewRequest,
    AssignmentCommitRequest,
    AssignmentManualRequest,
    AssignmentItemDTO,
    UnlockRequest,
    ReviseRubricRequest,
    ClearEvaluationRequest,
)
from app.models import (
    Event,
    Team,
    Pod,
    PSSelection,
    ProblemStatement,
    Volunteer,
    User,
    EvaluationRound,
    JudgeAssignment,
    Evaluation,
    EvaluationVersion,
    EvaluationScore,
    EvaluationText,
    RubricVersion,
    RubricField,
)
from app.rbac import Principal, require_permission, resolve_access
from app.routers.admin import log_audit
from app.services.assignment import (
    plan_distribution,
    detect_conflicts,
    load_report,
    make_preview_token,
    verify_preview_token,
)
from app.services.eligibility import is_team_eligible
from app.services.evaluation import (
    unlock as service_unlock,
    revise_rubric as service_revise_rubric,
    diff_versions,
)

router = APIRouter(tags=["evaluation-admin"])


@router.get("/admin/rounds/{rid}/assignable-teams", response_model=List[AssignableTeamDTO])
def get_assignable_teams(
    rid: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.assign")),
):
    round_obj = (
        db.query(EvaluationRound)
        .filter(EvaluationRound.id == rid, EvaluationRound.eventId == current_user.eventId)
        .first()
    )
    if not round_obj:
        raise HTTPException(status_code=404, detail="Round not found")

    all_teams = db.query(Team).filter(Team.eventId == current_user.eventId).all()
    teams = [t for t in all_teams if is_team_eligible(db, round_obj, t.id)]

    # Active judge assignments count per team
    active_counts = dict(
        db.query(JudgeAssignment.teamId, func.count(JudgeAssignment.id))
        .filter(
            JudgeAssignment.roundId == rid,
            JudgeAssignment.status == "active",
        )
        .group_by(JudgeAssignment.teamId)
        .all()
    )

    pods_map = {p.id: p.name for p in db.query(Pod).filter(Pod.eventId == current_user.eventId).all()}

    # PS selections
    selections = (
        db.query(PSSelection.teamId, ProblemStatement.id, ProblemStatement.title)
        .join(ProblemStatement, PSSelection.psId == ProblemStatement.id)
        .join(Team, PSSelection.teamId == Team.id)
        .filter(Team.eventId == current_user.eventId)
        .all()
    )
    ps_map = {s[0]: (s[1], s[2]) for s in selections}

    out = []
    for t in teams:
        ps_info = ps_map.get(t.id, (None, None))
        status_val = t.status.value if hasattr(t.status, "value") else str(t.status)
        out.append(
            AssignableTeamDTO(
                id=t.id,
                name=t.name,
                registrationId=t.registrationId,
                podId=t.podId,
                podName=pods_map.get(t.podId),
                psId=ps_info[0],
                psTitle=ps_info[1],
                status=status_val,
                collegeName=t.collegeName or "",
                activeJudgeCount=active_counts.get(t.id, 0),
            )
        )
    return out


@router.post("/admin/rounds/{rid}/assignments/preview")
def preview_assignments(
    rid: str,
    payload: AssignmentPreviewRequest,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.assign")),
):
    round_obj = (
        db.query(EvaluationRound)
        .filter(EvaluationRound.id == rid, EvaluationRound.eventId == current_user.eventId)
        .first()
    )
    if not round_obj:
        raise HTTPException(status_code=404, detail="Round not found")

    # Validate team IDs
    teams = db.query(Team).filter(Team.id.in_(payload.teamIds), Team.eventId == current_user.eventId).all()
    if len(teams) != len(set(payload.teamIds)):
        raise HTTPException(status_code=422, detail="One or more team IDs do not belong to this event")

    ineligible_teams = [t.name for t in teams if not is_team_eligible(db, round_obj, t.id)]
    if ineligible_teams:
        raise HTTPException(
            status_code=422,
            detail=f"The following teams are not eligible for this round: {', '.join(ineligible_teams[:5])}",
        )

    # Validate judge IDs
    judges = (
        db.query(Volunteer)
        .filter(Volunteer.id.in_(payload.judgeVolunteerIds), Volunteer.eventId == current_user.eventId)
        .all()
    )
    if len(judges) != len(set(payload.judgeVolunteerIds)):
        raise HTTPException(status_code=422, detail="One or more judge volunteer IDs do not belong to this event")

    # Check judge logins and permissions
    judge_vol_ids = {j.id for j in judges}
    users = db.query(User).filter(User.volunteerId.in_(judge_vol_ids)).all()
    users_by_vol_id = {u.volunteerId: u for u in users}

    warnings_extra = []
    for j in judges:
        u = users_by_vol_id.get(j.id)
        if not u:
            warnings_extra.append({
                "code": "no_login",
                "judgeId": j.id,
                "message": f"Judge '{j.name}' does not have a user login yet.",
            })
        else:
            acc = resolve_access(db, u)
            if "evaluation.score" not in acc.permissions and not (u.role.value == "ADMIN" if hasattr(u.role, "value") else u.role == "ADMIN"):
                warnings_extra.append({
                    "code": "missing_permission",
                    "judgeId": j.id,
                    "message": f"Judge '{j.name}' lacks 'evaluation.score' permission.",
                })

    # Run planner
    pairs, planner_warnings = plan_distribution(
        team_ids=payload.teamIds,
        judge_ids=payload.judgeVolunteerIds,
        mode=payload.mode,
        judges_per_team=payload.judgesPerTeam,
        group_map=payload.groupMap,
    )

    # Detect conflicts
    team_attrs = {t.id: t.collegeName or "" for t in teams}
    judge_attrs = {j.id: j.remarks or "" for j in judges}
    conflicts = detect_conflicts(pairs, team_attrs, judge_attrs)

    report = load_report(pairs)
    token, exp = make_preview_token(settings.JWT_SECRET_KEY, rid, current_user.eventId, pairs)

    all_warnings = planner_warnings + warnings_extra

    return {
        "pairs": [list(p) for p in pairs],
        "loadReport": report,
        "warnings": all_warnings,
        "conflicts": conflicts,
        "token": token,
        "expiresAt": exp,
    }


@router.post("/admin/rounds/{rid}/assignments/commit")
def commit_assignments(
    rid: str,
    payload: AssignmentCommitRequest,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.assign")),
):
    round_obj = (
        db.query(EvaluationRound)
        .filter(EvaluationRound.id == rid, EvaluationRound.eventId == current_user.eventId)
        .first()
    )
    if not round_obj:
        raise HTTPException(status_code=404, detail="Round not found")

    pairs_tuples = [(p[0], p[1]) for p in payload.pairs]
    if not verify_preview_token(settings.JWT_SECRET_KEY, payload.token, rid, current_user.eventId, pairs_tuples):
        raise HTTPException(status_code=400, detail="Invalid or expired preview token")

    team_ids = {p[0] for p in pairs_tuples}
    teams = db.query(Team).filter(Team.id.in_(team_ids)).all()
    ineligible_teams = [t.name for t in teams if not is_team_eligible(db, round_obj, t.id)]
    if ineligible_teams:
        raise HTTPException(
            status_code=422,
            detail=f"The following teams are not eligible for this round: {', '.join(ineligible_teams[:5])}",
        )

    # Conflict check
    if not payload.overrideConflicts:
        judge_ids = {p[1] for p in pairs_tuples}
        judges = db.query(Volunteer).filter(Volunteer.id.in_(judge_ids)).all()
        team_attrs = {t.id: t.collegeName or "" for t in teams}
        judge_attrs = {j.id: j.remarks or "" for j in judges}
        conflicts = detect_conflicts(pairs_tuples, team_attrs, judge_attrs)
        if conflicts:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Unresolved conflicts detected. Pass overrideConflicts=True to proceed."
            )

    selected_teams = {p[0] for p in pairs_tuples}
    now = datetime.utcnow()

    # Load existing assignments for these teams in this round
    existing_assignments = (
        db.query(JudgeAssignment)
        .filter(
            JudgeAssignment.roundId == rid,
            JudgeAssignment.teamId.in_(selected_teams),
        )
        .all()
    )
    existing_by_pair = {(a.teamId, a.judgeVolunteerId): a for a in existing_assignments}

    created = 0
    revived = 0
    skipped = 0
    revoked = 0

    pairs_set = set(pairs_tuples)

    # If replaceWizard, revoke existing active wizard assignments for selected teams that are not in pairs
    if payload.replaceWizard:
        for a in existing_assignments:
            if a.status == "active" and a.source == "wizard" and (a.teamId, a.judgeVolunteerId) not in pairs_set:
                a.status = "revoked"
                a.revokedAt = now
                a.revokedBy = current_user.username
                revoked += 1

    for t_id, j_id in pairs_tuples:
        pair_key = (t_id, j_id)
        existing = existing_by_pair.get(pair_key)
        if not existing:
            new_assign = JudgeAssignment(
                eventId=current_user.eventId,
                roundId=rid,
                teamId=t_id,
                judgeVolunteerId=j_id,
                source="wizard",
                status="active",
                createdBy=current_user.username,
                createdAt=now,
            )
            db.add(new_assign)
            created += 1
        elif existing.status == "active":
            skipped += 1
        else:
            # Revived
            existing.status = "active"
            existing.revokedAt = None
            existing.revokedBy = None
            existing.source = "wizard"
            revived += 1

    db.commit()

    log_audit(
        db,
        current_user.username,
        "commit_wizard_assignments",
        "evaluation_round",
        rid,
        diff={
            "created": created,
            "revived": revived,
            "skipped": skipped,
            "revoked": revoked,
            "total_pairs": len(pairs_tuples),
        },
        event_id=current_user.eventId,
    )

    return {
        "created": created,
        "revived": revived,
        "skipped": skipped,
        "revoked": revoked,
    }


@router.post("/admin/rounds/{rid}/assignments")
def manual_assign(
    rid: str,
    payload: AssignmentManualRequest,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.assign")),
):
    round_obj = (
        db.query(EvaluationRound)
        .filter(EvaluationRound.id == rid, EvaluationRound.eventId == current_user.eventId)
        .first()
    )
    if not round_obj:
        raise HTTPException(status_code=404, detail="Round not found")

    teams = db.query(Team).filter(Team.id.in_(payload.teamIds), Team.eventId == current_user.eventId).all()
    if len(teams) != len(set(payload.teamIds)):
        raise HTTPException(status_code=422, detail="One or more team IDs do not belong to this event")

    ineligible_teams = [t.name for t in teams if not is_team_eligible(db, round_obj, t.id)]
    if ineligible_teams:
        raise HTTPException(
            status_code=422,
            detail=f"The following teams are not eligible for this round: {', '.join(ineligible_teams[:5])}",
        )

    judges = (
        db.query(Volunteer)
        .filter(Volunteer.id.in_(payload.judgeVolunteerIds), Volunteer.eventId == current_user.eventId)
        .all()
    )
    if len(judges) != len(set(payload.judgeVolunteerIds)):
        raise HTTPException(status_code=422, detail="One or more judge IDs do not belong to this event")

    now = datetime.utcnow()
    created = 0
    upgraded = 0
    revived = 0
    skipped = 0

    for t_id in payload.teamIds:
        for j_id in payload.judgeVolunteerIds:
            existing = (
                db.query(JudgeAssignment)
                .filter(
                    JudgeAssignment.roundId == rid,
                    JudgeAssignment.teamId == t_id,
                    JudgeAssignment.judgeVolunteerId == j_id,
                )
                .first()
            )
            if not existing:
                a = JudgeAssignment(
                    eventId=current_user.eventId,
                    roundId=rid,
                    teamId=t_id,
                    judgeVolunteerId=j_id,
                    source="manual",
                    status="active",
                    createdBy=current_user.username,
                    createdAt=now,
                )
                db.add(a)
                created += 1
            elif existing.status == "revoked":
                existing.status = "active"
                existing.source = "manual"
                existing.revokedAt = None
                existing.revokedBy = None
                revived += 1
            elif existing.source != "manual":
                existing.source = "manual"
                upgraded += 1
            else:
                skipped += 1

    db.commit()

    log_audit(
        db,
        current_user.username,
        "manual_assign",
        "evaluation_round",
        rid,
        diff={"created": created, "upgraded": upgraded, "revived": revived, "skipped": skipped},
        event_id=current_user.eventId,
    )

    return {
        "created": created,
        "upgraded": upgraded,
        "revived": revived,
        "skipped": skipped,
    }


@router.delete("/admin/rounds/{rid}/assignments/{aid}")
def revoke_assignment(
    rid: str,
    aid: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.assign")),
):
    assignment = (
        db.query(JudgeAssignment)
        .filter(
            JudgeAssignment.id == aid,
            JudgeAssignment.roundId == rid,
            JudgeAssignment.eventId == current_user.eventId,
        )
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    has_eval = (
        db.query(Evaluation)
        .filter(
            Evaluation.roundId == rid,
            Evaluation.teamId == assignment.teamId,
            Evaluation.judgeVolunteerId == assignment.judgeVolunteerId,
        )
        .first()
        is not None
    )

    assignment.status = "revoked"
    assignment.revokedAt = datetime.utcnow()
    assignment.revokedBy = current_user.username
    db.commit()

    log_audit(
        db,
        current_user.username,
        "revoke_assignment",
        "judge_assignment",
        aid,
        diff={"hasEvaluation": has_eval},
        event_id=current_user.eventId,
    )

    return {"hasEvaluation": has_eval, "id": aid}


@router.get("/admin/rounds/{rid}/assignments", response_model=List[AssignmentItemDTO])
def list_assignments(
    rid: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.assign")),
):
    assignments = (
        db.query(JudgeAssignment)
        .filter(
            JudgeAssignment.roundId == rid,
            JudgeAssignment.eventId == current_user.eventId,
        )
        .order_by(JudgeAssignment.createdAt.desc())
        .all()
    )

    team_ids = {a.teamId for a in assignments}
    judge_ids = {a.judgeVolunteerId for a in assignments}

    teams = {t.id: t for t in db.query(Team).filter(Team.id.in_(team_ids)).all()}
    judges = {j.id: j for j in db.query(Volunteer).filter(Volunteer.id.in_(judge_ids)).all()}

    # Check which assignments have evaluations
    eval_pairs = set(
        db.query(Evaluation.teamId, Evaluation.judgeVolunteerId)
        .filter(Evaluation.roundId == rid)
        .all()
    )

    out = []
    for a in assignments:
        t = teams.get(a.teamId)
        j = judges.get(a.judgeVolunteerId)
        out.append(
            AssignmentItemDTO(
                id=a.id,
                roundId=a.roundId,
                teamId=a.teamId,
                teamName=t.name if t else "Unknown",
                teamRegistrationId=t.registrationId if t else "",
                judgeVolunteerId=a.judgeVolunteerId,
                judgeName=j.name if j else "Unknown",
                source=a.source,
                status=a.status,
                createdAt=a.createdAt,
                hasEvaluation=(a.teamId, a.judgeVolunteerId) in eval_pairs,
            )
        )
    return out


@router.get("/admin/rounds/{rid}/progress")
def get_round_progress(
    rid: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.view_all")),
):
    round_obj = (
        db.query(EvaluationRound)
        .filter(EvaluationRound.id == rid, EvaluationRound.eventId == current_user.eventId)
        .first()
    )
    if not round_obj:
        raise HTTPException(status_code=404, detail="Round not found")

    assignments = (
        db.query(JudgeAssignment)
        .filter(
            JudgeAssignment.roundId == rid,
            JudgeAssignment.status == "active",
            JudgeAssignment.eventId == current_user.eventId,
        )
        .all()
    )

    # Map evaluations
    evaluations = (
        db.query(Evaluation)
        .filter(Evaluation.roundId == rid, Evaluation.eventId == current_user.eventId)
        .all()
    )
    eval_map = {(e.teamId, e.judgeVolunteerId): e for e in evaluations}
    eval_ids = [e.id for e in evaluations]

    # Map versions: latest version per evaluation determines current status
    versions = (
        db.query(EvaluationVersion)
        .filter(
            EvaluationVersion.evaluationId.in_(eval_ids),
            EvaluationVersion.status.in_(["draft", "final"]),
        )
        .order_by(EvaluationVersion.version.desc())
        .all()
    )
    status_by_eval = {}
    for v in versions:
        if v.evaluationId not in status_by_eval:
            status_by_eval[v.evaluationId] = v.status

    judges_map: Dict[str, dict] = {}
    teams_map: Dict[str, dict] = {}

    for a in assignments:
        j_id = a.judgeVolunteerId
        t_id = a.teamId

        if j_id not in judges_map:
            judges_map[j_id] = {"assigned": 0, "notStarted": 0, "drafts": 0, "finals": 0}
        judges_map[j_id]["assigned"] += 1

        if t_id not in teams_map:
            teams_map[t_id] = {"needed": 0, "submitted": 0}
        teams_map[t_id]["needed"] += 1

        ev = eval_map.get((t_id, j_id))
        if not ev:
            judges_map[j_id]["notStarted"] += 1
        else:
            v_status = status_by_eval.get(ev.id)
            if v_status == "final":
                judges_map[j_id]["finals"] += 1
                teams_map[t_id]["submitted"] += 1
            elif v_status == "draft":
                judges_map[j_id]["drafts"] += 1
            else:
                judges_map[j_id]["notStarted"] += 1

    total_assigned = len(assignments)
    total_submitted = sum(j["finals"] for j in judges_map.values())
    pct = round((total_submitted / total_assigned * 100), 1) if total_assigned > 0 else 0.0

    return {
        "overallPercentage": pct,
        "totalAssigned": total_assigned,
        "totalSubmitted": total_submitted,
        "perJudge": judges_map,
        "perTeam": teams_map,
    }


@router.get("/admin/evaluations/team/{team_id}")
def get_team_evaluation_trail(
    team_id: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.view_all")),
):
    team = (
        db.query(Team)
        .filter(Team.id == team_id, Team.eventId == current_user.eventId)
        .first()
    )
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    evaluations = (
        db.query(Evaluation)
        .filter(Evaluation.teamId == team_id, Evaluation.eventId == current_user.eventId)
        .all()
    )

    judge_ids = {e.judgeVolunteerId for e in evaluations}
    judges = {j.id: j.name for j in db.query(Volunteer).filter(Volunteer.id.in_(judge_ids)).all()}

    rounds_map = {
        r.id: r.name
        for r in db.query(EvaluationRound).filter(EvaluationRound.eventId == current_user.eventId).all()
    }

    trail = []
    for ev in evaluations:
        versions = (
            db.query(EvaluationVersion)
            .filter(EvaluationVersion.evaluationId == ev.id)
            .order_by(EvaluationVersion.version.asc())
            .all()
        )
        version_items = []
        prev_ver = None
        for v in versions:
            diff = diff_versions(prev_ver, v, db) if prev_ver else diff_versions(None, v, db)
            version_items.append({
                "id": v.id,
                "version": v.version,
                "status": v.status,
                "totalPct": str(v.totalPct) if v.totalPct is not None else None,
                "submittedAt": v.submittedAt,
                "supersededAt": v.supersededAt,
                "supersededReason": v.supersededReason,
                "diff": diff,
            })
            prev_ver = v

        trail.append({
            "evaluationId": ev.id,
            "roundId": ev.roundId,
            "roundName": rounds_map.get(ev.roundId, "Unknown Round"),
            "judgeVolunteerId": ev.judgeVolunteerId,
            "judgeName": judges.get(ev.judgeVolunteerId, "Unknown Judge"),
            "versions": version_items,
        })

    return {"teamId": team_id, "teamName": team.name, "evaluations": trail}


@router.get("/admin/rounds/{round_id}/evaluations/trail")
def get_round_team_evaluation_trail(
    round_id: str,
    teamId: str = Query(...),
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.view_all")),
):
    team = (
        db.query(Team)
        .filter(Team.id == teamId, Team.eventId == current_user.eventId)
        .first()
    )
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    evaluations = (
        db.query(Evaluation)
        .filter(
            Evaluation.teamId == teamId,
            Evaluation.roundId == round_id,
            Evaluation.eventId == current_user.eventId,
        )
        .all()
    )

    judge_ids = {e.judgeVolunteerId for e in evaluations}
    judges = {j.id: j.name for j in db.query(Volunteer).filter(Volunteer.id.in_(judge_ids)).all()}

    rounds_map = {
        r.id: r.name
        for r in db.query(EvaluationRound).filter(EvaluationRound.eventId == current_user.eventId).all()
    }

    trail = []
    for ev in evaluations:
        versions = (
            db.query(EvaluationVersion)
            .filter(EvaluationVersion.evaluationId == ev.id)
            .order_by(EvaluationVersion.version.asc())
            .all()
        )
        version_items = []
        prev_ver = None
        for v in versions:
            diff = diff_versions(prev_ver, v, db) if prev_ver else diff_versions(None, v, db)
            version_items.append({
                "id": v.id,
                "version": v.version,
                "status": v.status,
                "totalPct": str(v.totalPct) if v.totalPct is not None else None,
                "submittedAt": v.submittedAt,
                "supersededAt": v.supersededAt,
                "supersededReason": v.supersededReason,
                "diff": diff,
            })
            prev_ver = v

        trail.append({
            "evaluationId": ev.id,
            "roundId": ev.roundId,
            "roundName": rounds_map.get(ev.roundId, "Unknown Round"),
            "judgeVolunteerId": ev.judgeVolunteerId,
            "judgeName": judges.get(ev.judgeVolunteerId, "Unknown Judge"),
            "versions": version_items,
        })

    return {"teamId": teamId, "teamName": team.name, "evaluations": trail}


@router.post("/admin/evaluations/{eid}/unlock")
def unlock_evaluation(
    eid: str,
    payload: UnlockRequest,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.unlock")),
):
    evaluation = (
        db.query(Evaluation)
        .filter(Evaluation.id == eid, Evaluation.eventId == current_user.eventId)
        .first()
    )
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")

    new_draft = service_unlock(db, evaluation, payload.reason, current_user.username)
    db.commit()
    return {"ok": True, "draftVersion": new_draft.version, "draftId": new_draft.id}


@router.post("/admin/evaluation-texts/{version_id}/{field_id}/hide")
def hide_evaluation_text(
    version_id: str,
    field_id: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.moderate")),
):
    text_row = (
        db.query(EvaluationText)
        .join(EvaluationVersion, EvaluationText.versionId == EvaluationVersion.id)
        .filter(
            EvaluationText.versionId == version_id,
            EvaluationText.fieldId == field_id,
            EvaluationVersion.eventId == current_user.eventId,
        )
        .first()
    )
    if not text_row:
        raise HTTPException(status_code=404, detail="Evaluation text not found")

    text_row.hiddenByAdmin = True
    text_row.hiddenBy = current_user.username
    text_row.hiddenAt = datetime.utcnow()
    db.commit()

    log_audit(
        db,
        current_user.username,
        "hide_evaluation_text",
        "evaluation_text",
        f"{version_id}:{field_id}",
        event_id=current_user.eventId,
    )
    return {"ok": True, "hidden": True}


@router.post("/admin/evaluation-texts/{version_id}/{field_id}/unhide")
def unhide_evaluation_text(
    version_id: str,
    field_id: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.moderate")),
):
    text_row = (
        db.query(EvaluationText)
        .join(EvaluationVersion, EvaluationText.versionId == EvaluationVersion.id)
        .filter(
            EvaluationText.versionId == version_id,
            EvaluationText.fieldId == field_id,
            EvaluationVersion.eventId == current_user.eventId,
        )
        .first()
    )
    if not text_row:
        raise HTTPException(status_code=404, detail="Evaluation text not found")

    text_row.hiddenByAdmin = False
    text_row.hiddenBy = current_user.username
    text_row.hiddenAt = datetime.utcnow()
    db.commit()

    log_audit(
        db,
        current_user.username,
        "unhide_evaluation_text",
        "evaluation_text",
        f"{version_id}:{field_id}",
        event_id=current_user.eventId,
    )
    return {"ok": True, "hidden": False}


@router.post("/admin/rounds/{rid}/rubric/revise")
def revise_round_rubric(
    rid: str,
    payload: ReviseRubricRequest,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("round.manage")),
):
    round_obj = (
        db.query(EvaluationRound)
        .filter(EvaluationRound.id == rid, EvaluationRound.eventId == current_user.eventId)
        .first()
    )
    if not round_obj:
        raise HTTPException(status_code=404, detail="Round not found")

    result = service_revise_rubric(
        db=db,
        round_obj=round_obj,
        mode=payload.mode,
        confirm_text=payload.confirmText or "",
        actor=current_user.username,
    )
    db.commit()
    return result


@router.post("/admin/evaluations/{eid}/clear")
def clear_evaluation(
    eid: str,
    payload: Optional[ClearEvaluationRequest] = None,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.unlock")),
):
    evaluation = (
        db.query(Evaluation)
        .filter(Evaluation.id == eid, Evaluation.eventId == current_user.eventId)
        .first()
    )
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")

    reason = (payload.reason if payload and payload.reason else "Admin cleared evaluation for re-evaluation").strip()
    now = datetime.utcnow()

    active_versions = (
        db.query(EvaluationVersion)
        .filter(
            EvaluationVersion.evaluationId == eid,
            EvaluationVersion.status.in_(["draft", "final"]),
        )
        .all()
    )

    if not active_versions:
        return {"ok": True, "message": "No active evaluation versions to clear", "archivedVersions": 0}

    archived_count = 0
    for v in active_versions:
        if v.status == "final":
            v.status = "superseded"
        else:
            v.status = "discarded"
        v.supersededAt = now
        v.supersededReason = "admin_clear"
        archived_count += 1

    evaluation.currentVersionId = None
    db.commit()

    log_audit(
        db,
        current_user.username,
        "evaluation.admin_clear",
        "evaluation",
        eid,
        {
            "roundId": evaluation.roundId,
            "teamId": evaluation.teamId,
            "judgeVolunteerId": evaluation.judgeVolunteerId,
            "reason": reason,
            "archivedVersions": archived_count,
        },
        event_id=current_user.eventId,
    )

    return {
        "ok": True,
        "message": f"Successfully archived {archived_count} version(s). Team can now be re-evaluated.",
        "archivedVersions": archived_count,
        "evaluationId": eid,
    }


@router.post("/admin/rounds/{round_id}/teams/{team_id}/clear-evaluations")
def clear_team_evaluations(
    round_id: str,
    team_id: str,
    payload: Optional[ClearEvaluationRequest] = None,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.unlock")),
):
    evaluations = (
        db.query(Evaluation)
        .filter(
            Evaluation.roundId == round_id,
            Evaluation.teamId == team_id,
            Evaluation.eventId == current_user.eventId,
        )
        .all()
    )
    if not evaluations:
        raise HTTPException(status_code=404, detail="No evaluations found for this team in this round")

    reason = (payload.reason if payload and payload.reason else "Admin cleared team evaluations for re-evaluation").strip()
    now = datetime.utcnow()
    total_archived = 0

    for ev in evaluations:
        active_versions = (
            db.query(EvaluationVersion)
            .filter(
                EvaluationVersion.evaluationId == ev.id,
                EvaluationVersion.status.in_(["draft", "final"]),
            )
            .all()
        )
        for v in active_versions:
            if v.status == "final":
                v.status = "superseded"
            else:
                v.status = "discarded"
            v.supersededAt = now
            v.supersededReason = "admin_clear"
            total_archived += 1
        ev.currentVersionId = None

    db.commit()

    log_audit(
        db,
        current_user.username,
        "evaluation.admin_clear_team",
        "team",
        team_id,
        {
            "roundId": round_id,
            "evaluationsCount": len(evaluations),
            "totalArchived": total_archived,
            "reason": reason,
        },
        event_id=current_user.eventId,
    )

    return {
        "ok": True,
        "message": f"Successfully cleared evaluations for team. Archived {total_archived} version(s).",
        "archivedVersions": total_archived,
        "teamId": team_id,
        "roundId": round_id,
    }

