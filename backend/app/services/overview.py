from datetime import datetime
from typing import Any, Dict, List
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    Team,
    TeamMember,
    AttendanceRecord,
    Volunteer,
    EvaluationRound,
    JudgeAssignment,
    Evaluation,
    EvaluationVersion,
    PSSelection,
    EmailOutbox,
    EmailBatch,
    SmtpAccount,
    AuthToken,
    ResultRelease,
)


def get_overview_data(event_id: str, db: Session) -> Dict[str, Any]:
    now = datetime.utcnow()

    # 1. Counts
    total_teams = db.query(func.count(Team.id)).filter(Team.eventId == event_id).scalar() or 0

    checked_in_teams = (
        db.query(func.count(func.distinct(TeamMember.teamId)))
        .join(AttendanceRecord, AttendanceRecord.teamMemberId == TeamMember.id)
        .join(Team, Team.id == TeamMember.teamId)
        .filter(Team.eventId == event_id)
        .scalar()
        or 0
    )

    total_judges = (
        db.query(func.count(Volunteer.id))
        .filter(Volunteer.eventId == event_id, Volunteer.type == "JUDGE")
        .scalar()
        or 0
    )

    active_rounds_query = db.query(EvaluationRound).filter(
        EvaluationRound.eventId == event_id,
        EvaluationRound.status == "live",
    )
    active_rounds = active_rounds_query.count()
    active_round_objs = active_rounds_query.all()

    # Active judge assignments in this event
    total_active_assignments = (
        db.query(func.count(JudgeAssignment.id))
        .filter(
            JudgeAssignment.eventId == event_id,
            JudgeAssignment.status == "active",
        )
        .scalar()
        or 0
    )

    # Completed (final) evaluation versions linked to active assignments
    completed_eval_count = (
        db.query(func.count(EvaluationVersion.id))
        .join(Evaluation, EvaluationVersion.evaluationId == Evaluation.id)
        .join(
            JudgeAssignment,
            (Evaluation.roundId == JudgeAssignment.roundId)
            & (Evaluation.teamId == JudgeAssignment.teamId)
            & (Evaluation.judgeVolunteerId == JudgeAssignment.judgeVolunteerId),
        )
        .filter(
            JudgeAssignment.eventId == event_id,
            JudgeAssignment.status == "active",
            EvaluationVersion.status == "final",
        )
        .scalar()
        or 0
    )

    pending_evaluations = max(0, total_active_assignments - completed_eval_count)

    counts = {
        "total_teams": total_teams,
        "checked_in_teams": checked_in_teams,
        "total_judges": total_judges,
        "active_rounds": active_rounds,
        "pending_evaluations": pending_evaluations,
    }

    # 2. Attention items
    attention: List[Dict[str, Any]] = []

    # Rule 1: email_failing
    failed_emails = (
        db.query(func.count(EmailOutbox.id))
        .filter(EmailOutbox.eventId == event_id, EmailOutbox.status == "failed")
        .scalar()
        or 0
    )
    if failed_emails > 0:
        attention.append({
            "id": "email_failing",
            "level": "error",
            "title": "Email delivery failures",
            "description": f"{failed_emails} emails failed delivery. Review error messages in the Email module.",
            "count": failed_emails,
            "action_module": "email",
            "action_label": "View emails",
        })

    # Rule 2: no_email_account
    active_smtp = (
        db.query(func.count(SmtpAccount.id))
        .filter(SmtpAccount.status == "active")
        .scalar()
        or 0
    )
    if active_smtp == 0:
        attention.append({
            "id": "no_email_account",
            "level": "warning",
            "title": "No active email account",
            "description": "No active SMTP accounts configured. Notifications and invitations cannot be sent.",
            "count": 1,
            "action_module": "email",
            "action_label": "Configure SMTP",
        })

    # Rule 3: email_paused
    paused_batches = (
        db.query(func.count(EmailBatch.id))
        .filter(EmailBatch.eventId == event_id, EmailBatch.status == "paused")
        .scalar()
        or 0
    )
    if paused_batches > 0:
        attention.append({
            "id": "email_paused",
            "level": "warning",
            "title": "Email batches paused",
            "description": f"{paused_batches} email batches are currently paused.",
            "count": paused_batches,
            "action_module": "email",
            "action_label": "Review batches",
        })

    # Rule 4: invites_expired
    expired_invites = (
        db.query(func.count(AuthToken.id))
        .filter(
            AuthToken.eventId == event_id,
            AuthToken.kind == "invite",
            AuthToken.expiresAt < now,
            AuthToken.usedAt.is_(None),
        )
        .scalar()
        or 0
    )
    if expired_invites > 0:
        attention.append({
            "id": "invites_expired",
            "level": "info",
            "title": "Expired staff invitations",
            "description": f"{expired_invites} staff invitation links have expired.",
            "count": expired_invites,
            "action_module": "volunteers",
            "action_label": "Manage staff",
        })

    # Rule 5: rubric_unpublished
    unpublished_rounds = (
        db.query(EvaluationRound)
        .filter(
            EvaluationRound.eventId == event_id,
            EvaluationRound.status == "live",
            EvaluationRound.evaluationEnabled == True,
            EvaluationRound.currentRubricVersion == 0,
        )
        .all()
    )
    if unpublished_rounds:
        count = len(unpublished_rounds)
        attention.append({
            "id": "rubric_unpublished",
            "level": "error",
            "title": "Rounds missing rubric",
            "description": f"{count} active judging round(s) do not have a published rubric.",
            "count": count,
            "action_module": "evalRounds",
            "action_label": "Publish rubric",
        })

    # Rule 6: unassigned_teams
    unassigned_teams_count = 0
    if active_round_objs and total_teams > 0:
        for r in active_round_objs:
            if r.evaluationEnabled:
                assigned_team_ids = {
                    row[0]
                    for row in db.query(JudgeAssignment.teamId)
                    .filter(JudgeAssignment.roundId == r.id, JudgeAssignment.status == "active")
                    .distinct()
                    .all()
                }
                unassigned_in_round = total_teams - len(assigned_team_ids)
                if unassigned_in_round > 0:
                    unassigned_teams_count += unassigned_in_round

    if unassigned_teams_count > 0:
        attention.append({
            "id": "unassigned_teams",
            "level": "error",
            "title": "Teams without assigned judges",
            "description": f"{unassigned_teams_count} team slots in active rounds need judge assignments.",
            "count": unassigned_teams_count,
            "action_module": "evalRounds",
            "action_label": "Assign judges",
        })

    # Rule 7: judges_not_started
    if pending_evaluations > 0:
        attention.append({
            "id": "judges_not_started",
            "level": "warning",
            "title": "Pending judge evaluations",
            "description": f"{pending_evaluations} judge assignments have not been completed.",
            "count": pending_evaluations,
            "action_module": "evalRounds",
            "action_label": "View judging",
        })

    # Rule 8: results_pending
    results_pending_count = 0
    eval_rounds_in_event = (
        db.query(EvaluationRound)
        .filter(
            EvaluationRound.eventId == event_id,
            EvaluationRound.evaluationEnabled == True,
        )
        .all()
    )
    for r in eval_rounds_in_event:
        if r.status in ("concluded", "completed") or not r.isSubmissionOpen:
            release_count = (
                db.query(func.count(ResultRelease.id))
                .filter(
                    ResultRelease.roundId == r.id,
                    ResultRelease.retractedAt.is_(None),
                )
                .scalar()
                or 0
            )
            if release_count == 0:
                results_pending_count += 1

    if results_pending_count > 0:
        attention.append({
            "id": "results_pending",
            "level": "info",
            "title": "Unreleased results",
            "description": f"{results_pending_count} completed round(s) have unreleased results.",
            "count": results_pending_count,
            "action_module": "evalRounds",
            "action_label": "Release results",
        })

    # Rule 9: teams_without_ps
    teams_without_ps = (
        db.query(func.count(Team.id))
        .outerjoin(PSSelection, Team.id == PSSelection.teamId)
        .filter(Team.eventId == event_id, PSSelection.id.is_(None))
        .scalar()
        or 0
    )
    if teams_without_ps > 0:
        attention.append({
            "id": "teams_without_ps",
            "level": "info",
            "title": "Teams without problem statement",
            "description": f"{teams_without_ps} teams have not selected a problem statement.",
            "count": teams_without_ps,
            "action_module": "teams",
            "action_label": "Assign PS",
        })

    return {
        "counts": counts,
        "attention": attention,
    }
