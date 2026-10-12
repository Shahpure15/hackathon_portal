from typing import Any, Dict, Optional
from sqlalchemy.orm import Session

from app.models import (
    Team,
    TeamMember,
    TeamStatus,
    Discipline,
    Volunteer,
    ProblemStatement,
    PSSelection,
    AttendanceRecord,
    VolunteerAttendanceRecord,
    JudgeAssignment,
    Evaluation,
    EvaluationVersion,
    TeamRoundStatus,
    ResultReleaseItem,
    User,
)


def seed_demo_data(
    event_id: str,
    db: Session,
    teams_count: int = 6,
    judges_count: int = 3,
) -> Dict[str, Any]:
    """Generates isolated demonstration data with the DEMO- prefix."""
    teams_count = max(1, min(teams_count, 30))
    judges_count = max(1, min(judges_count, 10))

    ps_created = 0
    # 1. Demo Problem Statements
    ps_defs = [
        ("DEMO-PS01", "DEMO: AI Diagnostic Assistant", "Deep learning triage for medical scans", Discipline.ENGINEERING),
        ("DEMO-PS02", "DEMO: Urban Transit Optimizer", "Dynamic dispatch algorithms for green fleets", Discipline.ENGINEERING),
    ]
    ps_objs = []
    for code, title, desc, disc in ps_defs:
        existing_ps = (
            db.query(ProblemStatement)
            .filter(ProblemStatement.eventId == event_id, ProblemStatement.code == code)
            .first()
        )
        if not existing_ps:
            new_ps = ProblemStatement(
                eventId=event_id,
                code=code,
                title=title,
                description=desc,
                capacity=15,
                discipline=disc,
            )
            db.add(new_ps)
            db.flush()
            ps_objs.append(new_ps)
            ps_created += 1
        else:
            ps_objs.append(existing_ps)

    # 2. Demo Teams
    teams_created = 0
    for i in range(1, teams_count + 1):
        reg_id = f"DEMO-T{i:02d}"
        existing_t = (
            db.query(Team)
            .filter(Team.eventId == event_id, Team.registrationId == reg_id)
            .first()
        )
        if not existing_t:
            team_obj = Team(
                eventId=event_id,
                registrationId=reg_id,
                name=f"DEMO-Team {chr(64 + i)}",
                leaderName=f"Demo Leader {i}",
                leaderEmail=f"demo.leader.{i}@example.com",
                leaderPhone=f"+91 98000 000{i:02d}",
                collegeName="Demo Institute of Technology",
                status=TeamStatus.REGISTERED,
                category=Discipline.ENGINEERING,
            )
            db.add(team_obj)
            db.flush()

            # Leader Member
            member = TeamMember(
                teamId=team_obj.id,
                name=f"Demo Leader {i}",
                email=f"demo.leader.{i}@example.com",
                phone=f"+91 98000 000{i:02d}",
                isTeamLeader=True,
            )
            db.add(member)
            db.flush()

            # PS Assignment
            if ps_objs:
                assigned_ps = ps_objs[(i - 1) % len(ps_objs)]
                sel = PSSelection(teamId=team_obj.id, psId=assigned_ps.id)
                db.add(sel)

            teams_created += 1

    # 3. Demo Judges
    judges_created = 0
    for j in range(1, judges_count + 1):
        j_name = f"DEMO-Judge {chr(64 + j)}"
        existing_j = (
            db.query(Volunteer)
            .filter(Volunteer.eventId == event_id, Volunteer.name == j_name)
            .first()
        )
        if not existing_j:
            v_obj = Volunteer(
                eventId=event_id,
                name=j_name,
                type="JUDGE",
                contact=f"+91 97000 000{j:02d}",
                email=f"demo.judge.{j}@example.com",
            )
            db.add(v_obj)
            judges_created += 1

    db.commit()

    return {
        "teams_created": teams_created,
        "judges_created": judges_created,
        "problem_statements_created": ps_created,
        "message": f"Successfully seeded {teams_created} demo teams and {judges_created} demo judges.",
    }


def clear_demo_data(event_id: str, db: Session) -> Dict[str, int]:
    """Safely and cleanly removes only records with the DEMO- prefix for this event."""
    # 1. Identify Demo Teams
    demo_teams = (
        db.query(Team)
        .filter(Team.eventId == event_id, Team.registrationId.like("DEMO-%"))
        .all()
    )
    team_ids = [t.id for t in demo_teams]

    if team_ids:
        # Clear child dependencies
        member_ids = [
            m.id
            for m in db.query(TeamMember.id)
            .filter(TeamMember.teamId.in_(team_ids))
            .all()
        ]
        if member_ids:
            db.query(AttendanceRecord).filter(AttendanceRecord.teamMemberId.in_(member_ids)).delete(synchronize_session=False)

        # Delete evaluations for demo teams
        eval_ids = [
            e.id
            for e in db.query(Evaluation.id)
            .filter(Evaluation.teamId.in_(team_ids))
            .all()
        ]
        if eval_ids:
            db.query(EvaluationVersion).filter(EvaluationVersion.evaluationId.in_(eval_ids)).delete(synchronize_session=False)
            db.query(Evaluation).filter(Evaluation.id.in_(eval_ids)).delete(synchronize_session=False)

        db.query(JudgeAssignment).filter(JudgeAssignment.teamId.in_(team_ids)).delete(synchronize_session=False)
        db.query(TeamRoundStatus).filter(TeamRoundStatus.teamId.in_(team_ids)).delete(synchronize_session=False)
        db.query(ResultReleaseItem).filter(ResultReleaseItem.teamId.in_(team_ids)).delete(synchronize_session=False)
        db.query(PSSelection).filter(PSSelection.teamId.in_(team_ids)).delete(synchronize_session=False)
        db.query(TeamMember).filter(TeamMember.teamId.in_(team_ids)).delete(synchronize_session=False)
        db.query(Team).filter(Team.id.in_(team_ids)).delete(synchronize_session=False)

    # 2. Identify Demo Volunteers
    demo_vols = (
        db.query(Volunteer)
        .filter(Volunteer.eventId == event_id, Volunteer.name.like("DEMO-%"))
        .all()
    )
    vol_ids = [v.id for v in demo_vols]

    if vol_ids:
        db.query(JudgeAssignment).filter(JudgeAssignment.judgeVolunteerId.in_(vol_ids)).delete(synchronize_session=False)
        db.query(VolunteerAttendanceRecord).filter(VolunteerAttendanceRecord.volunteerId.in_(vol_ids)).delete(synchronize_session=False)
        db.query(User).filter(User.volunteerId.in_(vol_ids)).delete(synchronize_session=False)
        db.query(Volunteer).filter(Volunteer.id.in_(vol_ids)).delete(synchronize_session=False)

    # 3. Identify Demo Problem Statements
    demo_pss = (
        db.query(ProblemStatement)
        .filter(ProblemStatement.eventId == event_id, ProblemStatement.code.like("DEMO-%"))
        .all()
    )
    ps_ids = [p.id for p in demo_pss]
    if ps_ids:
        db.query(ProblemStatement).filter(ProblemStatement.id.in_(ps_ids)).delete(synchronize_session=False)

    db.commit()

    return {
        "teams_cleared": len(team_ids),
        "judges_cleared": len(vol_ids),
        "problem_statements_cleared": len(ps_ids),
    }
