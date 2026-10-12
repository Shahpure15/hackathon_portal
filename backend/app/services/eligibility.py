from typing import Optional
from sqlalchemy.orm import Session

from app.models import EvaluationRound, TeamRoundStatus


def is_team_eligible(db: Session, round_obj: EvaluationRound, team_id: str) -> bool:
    """Evaluates whether a team is eligible for an evaluation round.
    
    Modes:
    - 'all' (or None/empty): all teams are eligible.
    - 'advanced_from': team must have state == 'advanced' in team_round_status for fromRoundId.
    - 'manual': teamId must be in round.eligibility['teamIds'].
    """
    eligibility = round_obj.eligibility or {}
    mode = eligibility.get("mode") or "all"

    if mode == "all":
        return True

    if mode == "advanced_from":
        from_round_id = eligibility.get("fromRoundId")
        if not from_round_id:
            return True
        status_row = (
            db.query(TeamRoundStatus)
            .filter(
                TeamRoundStatus.roundId == from_round_id,
                TeamRoundStatus.teamId == team_id,
            )
            .first()
        )
        return status_row is not None and status_row.state == "advanced"

    if mode == "manual":
        team_ids = eligibility.get("teamIds") or []
        return team_id in team_ids

    return True
