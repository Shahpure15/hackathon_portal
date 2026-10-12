from collections import defaultdict
from decimal import Decimal
from typing import Dict, List, Any
from sqlalchemy.orm import Session

from app.models import EvaluationRound, JudgeAssignment, RubricVersion, RubricField, Team
from app.services.evaluation import current_finals
from app.services.scoring import aggregate, rank_teams, display_score
from app.services.eligibility import is_team_eligible


def build_leaderboard(db: Session, round_obj: EvaluationRound) -> Dict[str, Any]:
    """Builds the round leaderboard using current finals and the scoring engine.
    
    Returns:
        {
            "rows": [...],      # Ranked teams with >= 1 final
            "unscored": [...]   # Teams with 0 finals, never ranked
        }
    """
    finals = current_finals(db, round_obj)
    
    # Active assignments count per team in this round
    active_assignments = (
        db.query(JudgeAssignment)
        .filter(
            JudgeAssignment.roundId == round_obj.id,
            JudgeAssignment.status == "active",
        )
        .all()
    )
    needed_by_team: Dict[str, int] = defaultdict(int)
    for a in active_assignments:
        needed_by_team[a.teamId] += 1

    # Current rubric numeric fields for tie-breaks and per-criterion aggregation
    curr_rubric = (
        db.query(RubricVersion)
        .filter(
            RubricVersion.roundId == round_obj.id,
            RubricVersion.version == round_obj.currentRubricVersion,
        )
        .first()
    )
    numeric_fields = []
    if curr_rubric:
        numeric_fields = (
            db.query(RubricField)
            .filter(
                RubricField.rubricVersionId == curr_rubric.id,
                RubricField.type == "numeric",
            )
            .all()
        )

    # Group finals by team
    finals_by_team = defaultdict(list)
    for f in finals:
        finals_by_team[f.evaluation.teamId].append(f)

    # Fetch event teams
    all_teams = db.query(Team).filter(Team.eventId == round_obj.eventId).all()

    aggregation_method = round_obj.aggregation or "mean"
    trim_count = round_obj.trimCount or 1
    total_scale = round_obj.totalScale or 100

    rows_to_rank: List[Dict[str, Any]] = []
    unscored: List[Dict[str, Any]] = []

    for team in all_teams:
        team_finals = finals_by_team.get(team.id, [])
        needed = needed_by_team.get(team.id, 0)

        # Check if team is relevant to this round:
        # Either has finals, active assignments, or is eligible
        if not team_finals and needed == 0 and not is_team_eligible(db, round_obj, team.id):
            continue

        if not team_finals:
            unscored.append({
                "teamId": team.id,
                "name": team.name,
                "registrationId": team.registrationId,
                "score": None,
                "displayScore": None,
                "rank": None,
                "judgesCount": 0,
                "needed": needed,
                "provisional": True,
                "fellBack": False,
                "fieldScores": {},
            })
            continue

        judges_count = len(team_finals)
        provisional = (judges_count < needed) if needed > 0 else False

        # Aggregate team score across judges
        judge_pcts = [f.totalPct for f in team_finals]
        score, fell_back = aggregate(judge_pcts, aggregation_method, trim_count)

        # Aggregate per numeric field
        field_scores: Dict[str, Decimal] = {}
        for fld in numeric_fields:
            fld_vals: List[Decimal] = []
            fld_max = Decimal(str(fld.maxMarks))
            for f in team_finals:
                score_row = next((s for s in f.scores if s.fieldId == fld.id), None)
                if score_row is not None and fld_max > Decimal("0"):
                    fld_vals.append((Decimal(str(score_row.marks)) / fld_max) * Decimal("100"))
            if fld_vals:
                fld_agg, _ = aggregate(fld_vals, aggregation_method, trim_count)
                val = fld_agg if fld_agg is not None else Decimal("0")
            else:
                val = Decimal("0")
            field_scores[fld.fieldKey] = val
            field_scores[fld.id] = val

        disp_score = display_score(score, total_scale) if score is not None else Decimal("0")

        rows_to_rank.append({
            "teamId": team.id,
            "name": team.name,
            "registrationId": team.registrationId,
            "score": score or Decimal("0"),
            "displayScore": disp_score,
            "judgesCount": judges_count,
            "needed": needed,
            "provisional": provisional,
            "fellBack": fell_back,
            "fieldScores": field_scores,
        })

    # Rank scored rows using tie break keys
    tie_break_order = round_obj.tieBreakOrder or []
    ranked_rows = rank_teams(rows_to_rank, tie_break_order)

    # Sort unscored by registrationId
    unscored.sort(key=lambda u: u["registrationId"])

    return {
        "rows": ranked_rows,
        "unscored": unscored,
    }
