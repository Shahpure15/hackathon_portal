import os
import sys
import json

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database import SessionLocal
from app.models import (
    EvaluationRound,
    RubricVersion,
    RubricField,
    RubricPSGuidance,
    ProblemStatement,
    PSSelection,
    Team,
    Volunteer,
    User,
    UserRoleAssignment,
    RolePermission,
    JudgeAssignment,
)

def run_preflight_check(round_id_or_number: str = "68217b7a-6ad8-4f5f-9079-00c284d275eb"):
    db = SessionLocal()
    issues = []
    try:
        # 1. Round
        round_obj = db.query(EvaluationRound).filter(
            (EvaluationRound.id == round_id_or_number) |
            (EvaluationRound.roundNumber == 2)
        ).first()

        if not round_obj:
            return {"status": "FAIL", "issues": [f"Round '{round_id_or_number}' not found"]}

        # 2. Rubric
        rubric_ver = (
            db.query(RubricVersion)
            .filter(
                RubricVersion.roundId == round_obj.id,
                RubricVersion.version == round_obj.currentRubricVersion,
            )
            .first()
        )
        if not rubric_ver:
            issues.append("No current rubric version configured for round.")
        elif rubric_ver.publishedAt is None:
            issues.append(f"Rubric Version {rubric_ver.version} is not published.")

        fields = db.query(RubricField).filter(RubricField.rubricVersionId == rubric_ver.id).all() if rubric_ver else []
        guidances = db.query(RubricPSGuidance).filter(RubricPSGuidance.rubricVersionId == rubric_ver.id).all() if rubric_ver else []

        general_numeric = [f for f in fields if f.type == "numeric" and f.problemStatementId is None]
        gen_sum = sum(f.maxMarks for f in general_numeric)
        if gen_sum != 60:
            issues.append(f"General numeric criteria total {gen_sum} marks, expected exactly 60.")

        ps_guidance_map = {g.problemStatementId: g for g in guidances}
        ps_grouped = {}
        for f in fields:
            if f.problemStatementId is not None:
                ps_grouped.setdefault(f.problemStatementId, []).append(f)

        for ps_id, ps_fields in ps_grouped.items():
            num_fields = [f for f in ps_fields if f.type == "numeric"]
            ps_sum = sum(f.maxMarks for f in num_fields)
            if ps_sum != 40:
                issues.append(f"PS {ps_id} criteria total {ps_sum} marks, expected exactly 40.")
            if ps_id not in ps_guidance_map:
                issues.append(f"PS {ps_id} is missing Decisive Test guidance.")

        # 3. Teams & Assignments
        assignments = (
            db.query(JudgeAssignment)
            .filter(JudgeAssignment.roundId == round_obj.id, JudgeAssignment.status == "active")
            .all()
        )
        assigned_team_ids = {a.teamId for a in assignments}
        missing_ps_teams = []
        for tid in assigned_team_ids:
            sel = db.query(PSSelection).filter(PSSelection.teamId == tid).first()
            if not sel or not sel.psId:
                team = db.query(Team).filter(Team.id == tid).first()
                missing_ps_teams.append(team.name if team else tid)

        if missing_ps_teams:
            issues.append(f"Teams with active assignments missing PS selection: {missing_ps_teams}")

        # 4. Judges
        assigned_judge_ids = {a.judgeVolunteerId for a in assignments}
        unqualified_judges = []
        for jid in assigned_judge_ids:
            vol = db.query(Volunteer).filter(Volunteer.id == jid).first()
            if not vol or vol.type != "JUDGE":
                unqualified_judges.append(f"Volunteer {jid} not of type JUDGE")
                continue
            user = db.query(User).filter(User.volunteerId == vol.id).first()
            if not user or user.status != "active":
                unqualified_judges.append(f"Judge '{vol.name}' has no active user account")
                continue
            # Check permission
            role_assigns = db.query(UserRoleAssignment).filter(UserRoleAssignment.userId == user.id).all()
            role_ids = [ra.roleId for ra in role_assigns]
            has_score_perm = db.query(RolePermission).filter(
                RolePermission.roleId.in_(role_ids),
                RolePermission.permissionKey == "evaluation.score"
            ).first()
            if not has_score_perm:
                unqualified_judges.append(f"Judge '{vol.name}' lacks 'evaluation.score' permission")

        if unqualified_judges:
            issues.extend(unqualified_judges)

        result = {
            "status": "PASS" if not issues else "FAIL",
            "round": {
                "id": round_obj.id,
                "name": round_obj.name,
                "number": round_obj.roundNumber,
                "status": round_obj.status,
                "evaluationEnabled": round_obj.evaluationEnabled,
            },
            "rubric": {
                "version": rubric_ver.version if rubric_ver else None,
                "published": rubric_ver.publishedAt is not None if rubric_ver else False,
                "generalMarks": float(gen_sum),
                "psCount": len(ps_grouped),
                "guidanceCount": len(guidances),
            },
            "teams": {
                "assigned": len(assigned_team_ids),
                "missingPsCount": len(missing_ps_teams),
            },
            "judges": {
                "distinctJudges": len(assigned_judge_ids),
                "totalAssignments": len(assignments),
            },
            "issues": issues,
        }
        return result
    finally:
        db.close()

if __name__ == '__main__':
    res = run_preflight_check()
    print(json.dumps(res, indent=2))
    if res["status"] != "PASS":
        sys.exit(1)
