from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dto.judge import (
    JudgeRoundItemDTO,
    JudgeTeamItemDTO,
    JudgeTeamDetailDTO,
    JudgeRubricSummaryDTO,
    JudgeRubricSectionDTO,
    JudgeRubricFieldDTO,
    JudgeTeamSubmissionDTO,
    JudgeMineDTO,
    JudgeDraftRequest,
    JudgeDraftResponse,
    JudgeSubmitRequest,
    JudgeSubmitResponse,
)
from app.limiter import limiter, user_key_func
from app.models import (
    Role,
    EvaluationRound,
    RubricVersion,
    RubricField,
    RubricPSGuidance,
    JudgeAssignment,
    Evaluation,
    EvaluationVersion,
    EvaluationScore,
    EvaluationText,
    Team,
    Submission,
    PSSelection,
    ProblemStatement,
)
from app.rbac import Principal, require_permission, JUDGE_PRINCIPAL_TYPES
from app.services.evaluation import (
    get_or_create_evaluation,
    save_draft,
    submit as service_submit,
    _token_from_version,
)
from app.services.rubric import applicable_fields
from app.services.eligibility import is_team_eligible

router = APIRouter(prefix="/judge", tags=["judge"])


def _get_judge_id(current_user: Principal) -> str:
    judge_id = getattr(current_user, "volunteerId", None)
    if not judge_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No judge profile associated with this account"
        )
    return judge_id


@router.get("/rounds", response_model=List[JudgeRoundItemDTO])
def get_judge_rounds(
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.score", principal_types=JUDGE_PRINCIPAL_TYPES)),
):
    judge_id = getattr(current_user, "volunteerId", None)
    if not judge_id:
        return []

    # Active assignments for this judge
    active_assignments = (
        db.query(JudgeAssignment)
        .filter(
            JudgeAssignment.judgeVolunteerId == judge_id,
            JudgeAssignment.status == "active",
            JudgeAssignment.eventId == current_user.eventId,
        )
        .all()
    )
    if not active_assignments:
        return []

    round_ids = {a.roundId for a in active_assignments}

    rounds = (
        db.query(EvaluationRound)
        .filter(
            EvaluationRound.id.in_(round_ids),
            EvaluationRound.eventId == current_user.eventId,
            EvaluationRound.status == "live",
            EvaluationRound.evaluationEnabled == True,
        )
        .order_by(EvaluationRound.roundNumber.asc())
        .all()
    )

    out = []
    for r in rounds:
        # Check rubric is published
        rubric = (
            db.query(RubricVersion)
            .filter(
                RubricVersion.roundId == r.id,
                RubricVersion.version == r.currentRubricVersion,
            )
            .first()
        )
        if not rubric:
            continue
        if rubric.publishedAt is None:
            if r.status == "live" and r.evaluationEnabled:
                rubric.publishedAt = datetime.utcnow()
                db.commit()
            else:
                continue

        judge_round_assigns = [a for a in active_assignments if a.roundId == r.id and is_team_eligible(db, r, a.teamId)]
        assigned_team_ids = {a.teamId for a in judge_round_assigns}

        # Check evaluations for this judge in this round
        evaluations = (
            db.query(Evaluation)
            .filter(
                Evaluation.roundId == r.id,
                Evaluation.judgeVolunteerId == judge_id,
                Evaluation.teamId.in_(assigned_team_ids),
            )
            .all()
        )
        eval_ids = [e.id for e in evaluations]

        versions = (
            db.query(EvaluationVersion)
            .filter(
                EvaluationVersion.evaluationId.in_(eval_ids),
                EvaluationVersion.status.in_(["draft", "final"]),
            )
            .all()
        )
        status_map: Dict[str, str] = {}
        for v in versions:
            if v.status == "final":
                status_map[v.evaluationId] = "final"
            elif v.status == "draft" and status_map.get(v.evaluationId) != "final":
                status_map[v.evaluationId] = "draft"

        submitted_cnt = sum(1 for s in status_map.values() if s == "final")
        draft_cnt = sum(1 for s in status_map.values() if s == "draft")

        out.append(
            JudgeRoundItemDTO(
                id=r.id,
                name=r.name,
                description=r.description,
                assigned=len(judge_round_assigns),
                drafts=draft_cnt,
                submitted=submitted_cnt,
                closesAt=r.closesAt,
            )
        )
    return out


@router.get("/rounds/{rid}/teams", response_model=List[JudgeTeamItemDTO])
def get_judge_round_teams(
    rid: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.score", principal_types=JUDGE_PRINCIPAL_TYPES)),
):
    judge_id = _get_judge_id(current_user)

    round_obj = (
        db.query(EvaluationRound)
        .filter(
            EvaluationRound.id == rid,
            EvaluationRound.eventId == current_user.eventId,
            EvaluationRound.status == "live",
            EvaluationRound.evaluationEnabled == True,
        )
        .first()
    )
    if not round_obj:
        raise HTTPException(status_code=404, detail="Round not found")

    assignments = (
        db.query(JudgeAssignment)
        .filter(
            JudgeAssignment.roundId == rid,
            JudgeAssignment.judgeVolunteerId == judge_id,
            JudgeAssignment.status == "active",
        )
        .all()
    )
    assignments = [a for a in assignments if is_team_eligible(db, round_obj, a.teamId)]
    if not assignments:
        raise HTTPException(status_code=404, detail="No assigned teams in this round")

    team_ids = [a.teamId for a in assignments]
    teams = {t.id: t for t in db.query(Team).filter(Team.id.in_(team_ids)).all()}

    # PS details (code, title, description)
    selections = (
        db.query(PSSelection.teamId, ProblemStatement.code, ProblemStatement.title, ProblemStatement.description)
        .join(ProblemStatement, PSSelection.psId == ProblemStatement.id)
        .filter(PSSelection.teamId.in_(team_ids))
        .all()
    )
    ps_map = {s[0]: {"code": s[1], "title": s[2], "description": s[3]} for s in selections}

    # Evaluations
    evaluations = (
        db.query(Evaluation)
        .filter(
            Evaluation.roundId == rid,
            Evaluation.judgeVolunteerId == judge_id,
            Evaluation.teamId.in_(team_ids),
        )
        .all()
    )
    eval_by_team = {e.teamId: e for e in evaluations}
    eval_ids = [e.id for e in evaluations]

    versions = (
        db.query(EvaluationVersion)
        .filter(
            EvaluationVersion.evaluationId.in_(eval_ids),
            EvaluationVersion.status.in_(["draft", "final"]),
        )
        .all()
    )
    version_by_eval: Dict[str, EvaluationVersion] = {}
    for v in versions:
        existing = version_by_eval.get(v.evaluationId)
        if not existing or (v.status == "final" and existing.status != "final"):
            version_by_eval[v.evaluationId] = v

    out = []
    for tid in team_ids:
        t = teams.get(tid)
        if not t:
            continue
        ev = eval_by_team.get(tid)
        ver = version_by_eval.get(ev.id) if ev else None

        if ver:
            if ver.status == "final":
                item_status = "submitted"
                pct = ver.totalPct
            else:
                item_status = "draft"
                pct = None
            updated = ver.updatedAt or ver.createdAt
        else:
            item_status = "not_started"
            pct = None
            updated = None

        ps_info = ps_map.get(t.id, {})
        out.append(
            JudgeTeamItemDTO(
                teamId=t.id,
                name=t.name,
                registrationId=t.registrationId,
                psCode=ps_info.get("code"),
                psTitle=ps_info.get("title"),
                psDescription=ps_info.get("description"),
                status=item_status,
                myTotalPct=pct,
                updatedAt=updated,
            )
        )
    return out


@router.get("/rounds/{rid}/teams/{tid}", response_model=JudgeTeamDetailDTO)
def get_judge_team_detail(
    rid: str,
    tid: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.score", principal_types=JUDGE_PRINCIPAL_TYPES)),
):
    judge_id = _get_judge_id(current_user)

    round_obj = (
        db.query(EvaluationRound)
        .filter(
            EvaluationRound.id == rid,
            EvaluationRound.eventId == current_user.eventId,
            EvaluationRound.status == "live",
            EvaluationRound.evaluationEnabled == True,
        )
        .first()
    )
    if not round_obj:
        raise HTTPException(status_code=404, detail="Round not found")

    assignment = (
        db.query(JudgeAssignment)
        .filter(
            JudgeAssignment.roundId == rid,
            JudgeAssignment.teamId == tid,
            JudgeAssignment.judgeVolunteerId == judge_id,
            JudgeAssignment.status == "active",
        )
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Team assignment not found")

    if not is_team_eligible(db, round_obj, tid):
        raise HTTPException(status_code=403, detail="Team is not eligible for this round")

    team = db.query(Team).filter(Team.id == tid).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    # Problem Statement info
    ps_selection = db.query(PSSelection).filter(PSSelection.teamId == tid).first()
    ps_obj = db.query(ProblemStatement).filter(ProblemStatement.id == ps_selection.psId).first() if ps_selection else None

    # Submission info
    submission_dto = None
    if round_obj.submissionEnabled:
        sub = (
            db.query(Submission)
            .filter(Submission.roundId == rid, Submission.teamId == tid)
            .first()
        )
        if sub:
            submission_dto = JudgeTeamSubmissionDTO(
                driveLink=sub.driveLink,
                githubLink=sub.githubLink,
                answers=sub.answers or {},
            )

    # Current Rubric
    rubric_ver = (
        db.query(RubricVersion)
        .filter(
            RubricVersion.roundId == rid,
            RubricVersion.version == round_obj.currentRubricVersion,
        )
        .first()
    )
    if not rubric_ver or rubric_ver.publishedAt is None:
        if rubric_ver and round_obj.status == "live" and round_obj.evaluationEnabled:
            rubric_ver.publishedAt = datetime.utcnow()
            db.commit()
        else:
            raise HTTPException(status_code=400, detail="Rubric is not published")

    # Fetch applicable fields for this team (will raise 409 if multi-PS and team has no PS)
    rubric_fields = applicable_fields(db, rubric_ver, tid, require_ps=True)

    decisive_test = None
    guidance_notes = None
    if ps_selection:
        guidance = (
            db.query(RubricPSGuidance)
            .filter(
                RubricPSGuidance.rubricVersionId == rubric_ver.id,
                RubricPSGuidance.problemStatementId == ps_selection.psId,
            )
            .first()
        )
        if guidance:
            decisive_test = guidance.decisiveTest
            guidance_notes = guidance.notes

    has_ps_fields = any(f.problemStatementId is not None for f in rubric_fields)
    field_dtos = []
    sec_a_ids = []
    sec_b_ids = []
    sec_a_max = Decimal("0")
    sec_b_max = Decimal("0")

    for f in rubric_fields:
        aud = "staff" if f.visibility == "staff" else "participants"
        section_key = ("A" if f.problemStatementId is not None else "B") if has_ps_fields else None
        if section_key == "A":
            sec_a_ids.append(f.id)
            if f.maxMarks:
                sec_a_max += f.maxMarks
        elif section_key == "B":
            sec_b_ids.append(f.id)
            if f.maxMarks:
                sec_b_max += f.maxMarks

        field_dtos.append(
            JudgeRubricFieldDTO(
                id=f.id,
                type=f.type,
                label=f.label,
                description=f.description,
                maxMarks=f.maxMarks,
                weight=f.weight,
                anchors=f.anchors,
                isRequired=f.isRequired,
                maxLength=f.maxLength,
                sortOrder=f.sortOrder or 0,
                audience=aud,
                section=section_key,
                problemStatementId=f.problemStatementId,
            )
        )

    sections = None
    if has_ps_fields:
        sections = [
            JudgeRubricSectionDTO(
                key="A",
                title=f"Section A: {ps_obj.code} Specific Criteria" if ps_obj else "Section A: PS Specific Criteria",
                maxMarks=sec_a_max,
                weight=sec_a_max,
                fieldIds=sec_a_ids,
            ),
            JudgeRubricSectionDTO(
                key="B",
                title="Section B: General Evaluation Criteria",
                maxMarks=sec_b_max,
                weight=sec_b_max,
                fieldIds=sec_b_ids,
            ),
        ]

    rubric_summary = JudgeRubricSummaryDTO(
        version=rubric_ver.version,
        fields=field_dtos,
        sections=sections,
    )

    # Mine Evaluation
    ev = (
        db.query(Evaluation)
        .filter(
            Evaluation.roundId == rid,
            Evaluation.teamId == tid,
            Evaluation.judgeVolunteerId == judge_id,
        )
        .first()
    )

    mine_dto = JudgeMineDTO(status="not_started")
    if ev:
        curr_v = (
            db.query(EvaluationVersion)
            .filter(
                EvaluationVersion.evaluationId == ev.id,
                EvaluationVersion.status.in_(["draft", "final"]),
            )
            .order_by(EvaluationVersion.version.desc())
            .first()
        )
        if curr_v:
            scores = {
                s.fieldId: s.marks
                for s in db.query(EvaluationScore).filter(EvaluationScore.versionId == curr_v.id).all()
            }
            texts = {
                t.fieldId: t.value
                for t in db.query(EvaluationText).filter(EvaluationText.versionId == curr_v.id).all()
            }
            mine_dto = JudgeMineDTO(
                status=curr_v.status,
                token=_token_from_version(curr_v),
                scores=scores,
                texts=texts,
                totalPct=curr_v.totalPct if curr_v.status == "final" else None,
                submittedAt=curr_v.submittedAt,
            )

    return JudgeTeamDetailDTO(
        teamId=team.id,
        name=team.name,
        registrationId=team.registrationId,
        psCode=ps_obj.code if ps_obj else None,
        psTitle=ps_obj.title if ps_obj else None,
        psDescription=ps_obj.description if ps_obj else None,
        decisiveTest=decisive_test,
        guidanceNotes=guidance_notes,
        submission=submission_dto,
        rubric=rubric_summary,
        mine=mine_dto,
    )


@router.put("/rounds/{rid}/teams/{tid}/draft", response_model=JudgeDraftResponse)
@limiter.limit("120/minute", key_func=user_key_func)
def save_judge_draft(
    request: Request,
    rid: str,
    tid: str,
    payload: JudgeDraftRequest,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.score", principal_types=JUDGE_PRINCIPAL_TYPES)),
):
    judge_id = _get_judge_id(current_user)

    round_obj = (
        db.query(EvaluationRound)
        .filter(
            EvaluationRound.id == rid,
            EvaluationRound.eventId == current_user.eventId,
            EvaluationRound.status == "live",
            EvaluationRound.evaluationEnabled == True,
        )
        .first()
    )
    if not round_obj:
        raise HTTPException(status_code=404, detail="Round not found")

    assignment = (
        db.query(JudgeAssignment)
        .filter(
            JudgeAssignment.roundId == rid,
            JudgeAssignment.teamId == tid,
            JudgeAssignment.judgeVolunteerId == judge_id,
            JudgeAssignment.status == "active",
        )
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Team assignment not found")

    if not is_team_eligible(db, round_obj, tid):
        raise HTTPException(status_code=403, detail="Team is not eligible for this round")

    ev = get_or_create_evaluation(db, round_obj, tid, judge_id)

    draft_ver, _ = save_draft(
        db=db,
        evaluation=ev,
        payload=payload.dict(),
        token=payload.token,
        actor=current_user.username,
    )
    db.commit()
    db.refresh(draft_ver)
    new_token = _token_from_version(draft_ver)

    return JudgeDraftResponse(token=new_token, savedAt=draft_ver.updatedAt or datetime.utcnow())


@router.post("/rounds/{rid}/teams/{tid}/submit", response_model=JudgeSubmitResponse)
@limiter.limit("20/minute", key_func=user_key_func)
def submit_judge_evaluation(
    request: Request,
    rid: str,
    tid: str,
    payload: JudgeSubmitRequest,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.score", principal_types=JUDGE_PRINCIPAL_TYPES)),
):
    judge_id = _get_judge_id(current_user)

    round_obj = (
        db.query(EvaluationRound)
        .filter(
            EvaluationRound.id == rid,
            EvaluationRound.eventId == current_user.eventId,
            EvaluationRound.status == "live",
            EvaluationRound.evaluationEnabled == True,
        )
        .first()
    )
    if not round_obj:
        raise HTTPException(status_code=404, detail="Round not found")

    assignment = (
        db.query(JudgeAssignment)
        .filter(
            JudgeAssignment.roundId == rid,
            JudgeAssignment.teamId == tid,
            JudgeAssignment.judgeVolunteerId == judge_id,
            JudgeAssignment.status == "active",
        )
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Team assignment not found")

    if not is_team_eligible(db, round_obj, tid):
        raise HTTPException(status_code=403, detail="Team is not eligible for this round")

    ev = get_or_create_evaluation(db, round_obj, tid, judge_id)

    final_ver = service_submit(
        db=db,
        evaluation=ev,
        token=payload.token,
        actor=current_user.username,
    )
    db.commit()
    db.refresh(final_ver)

    return JudgeSubmitResponse(
        status="submitted",
        totalPct=final_ver.totalPct or Decimal("0.000"),
        submittedAt=final_ver.submittedAt or datetime.utcnow(),
    )
