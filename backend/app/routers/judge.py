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
from app.rbac import Principal, require_permission
from app.services.evaluation import (
    get_or_create_evaluation,
    save_draft,
    submit as service_submit,
    _token_from_version,
)

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
    current_user: Principal = Depends(require_permission("evaluation.score", principal_types=(Role.VOLUNTEER,))),
):
    judge_id = _get_judge_id(current_user)

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
        if not rubric or rubric.publishedAt is None:
            continue

        judge_round_assigns = [a for a in active_assignments if a.roundId == r.id]
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
    current_user: Principal = Depends(require_permission("evaluation.score", principal_types=(Role.VOLUNTEER,))),
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
    if not assignments:
        raise HTTPException(status_code=404, detail="No assigned teams in this round")

    team_ids = [a.teamId for a in assignments]
    teams = {t.id: t for t in db.query(Team).filter(Team.id.in_(team_ids)).all()}

    # PS Titles
    selections = (
        db.query(PSSelection.teamId, ProblemStatement.title)
        .join(ProblemStatement, PSSelection.psId == ProblemStatement.id)
        .filter(PSSelection.teamId.in_(team_ids))
        .all()
    )
    ps_map = {s[0]: s[1] for s in selections}

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

        out.append(
            JudgeTeamItemDTO(
                teamId=t.id,
                name=t.name,
                registrationId=t.registrationId,
                psTitle=ps_map.get(t.id),
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
    current_user: Principal = Depends(require_permission("evaluation.score", principal_types=(Role.VOLUNTEER,))),
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
        raise HTTPException(status_code=400, detail="Rubric is not published")

    rubric_fields = (
        db.query(RubricField)
        .filter(RubricField.rubricVersionId == rubric_ver.id)
        .order_by(RubricField.sortOrder.asc())
        .all()
    )
    field_dtos = []
    for f in rubric_fields:
        aud = "staff" if f.visibility == "staff" else "participants"
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
            )
        )
    rubric_summary = JudgeRubricSummaryDTO(version=rubric_ver.version, fields=field_dtos)

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
        psTitle=ps_obj.title if ps_obj else None,
        psDescription=ps_obj.description if ps_obj else None,
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
    current_user: Principal = Depends(require_permission("evaluation.score", principal_types=(Role.VOLUNTEER,))),
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

    ev = get_or_create_evaluation(db, round_obj, tid, judge_id)

    draft_ver, new_token = save_draft(
        db=db,
        evaluation=ev,
        payload=payload.dict(),
        token=payload.token,
        actor=current_user.username,
    )
    db.commit()

    return JudgeDraftResponse(token=new_token, savedAt=draft_ver.updatedAt or datetime.utcnow())


@router.post("/rounds/{rid}/teams/{tid}/submit", response_model=JudgeSubmitResponse)
@limiter.limit("20/minute", key_func=user_key_func)
def submit_judge_evaluation(
    request: Request,
    rid: str,
    tid: str,
    payload: JudgeSubmitRequest,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.score", principal_types=(Role.VOLUNTEER,))),
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

    ev = get_or_create_evaluation(db, round_obj, tid, judge_id)

    final_ver = service_submit(
        db=db,
        evaluation=ev,
        token=payload.token,
        actor=current_user.username,
    )
    db.commit()

    return JudgeSubmitResponse(
        status="submitted",
        totalPct=final_ver.totalPct or Decimal("0.000"),
        submittedAt=final_ver.submittedAt or datetime.utcnow(),
    )
