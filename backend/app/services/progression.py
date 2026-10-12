from decimal import Decimal
from typing import Dict, List, Optional, Sequence, Tuple, Any


def select_top_n(
    rows: Sequence[Dict[str, Any]],
    n: int,
    include_provisional: bool = False,
    tie_decision: Optional[str] = None,
) -> Tuple[List[str], List[Dict[str, Any]]]:
    """Pure selection of top N teams by rank from leaderboard rows.
    
    Args:
        rows: Ranked rows from build_leaderboard (must have 'teamId', 'rank', 'score', 'provisional').
        n: Number of teams to advance.
        include_provisional: If False, provisional teams are excluded with a warning.
        tie_decision: One of None, 'include_all_tied', 'exclude_tied', 'confirmed_manual'.
    
    Returns:
        (team_ids, warnings)
    """
    if n <= 0 or not rows:
        return [], []

    warnings: List[Dict[str, Any]] = []

    # 1. Filter provisional if not included
    if not include_provisional:
        candidates = [r for r in rows if not r.get("provisional", False)]
        provisional_in_top = [r for r in rows[:n] if r.get("provisional", False)]
        if provisional_in_top:
            warnings.append({
                "type": "provisional_excluded",
                "team_ids": [r["teamId"] for r in provisional_in_top],
                "message": f"{len(provisional_in_top)} provisional teams were excluded from advancement.",
            })
    else:
        candidates = list(rows)

    if not candidates:
        return [], warnings

    if len(candidates) <= n:
        return [c["teamId"] for c in candidates], warnings

    # 2. Check for tie at cutoff position
    pos_n = candidates[n - 1]
    pos_next = candidates[n]

    if pos_n["rank"] == pos_next["rank"]:
        tied_rank = pos_n["rank"]
        tied_team_ids = [c["teamId"] for c in candidates if c["rank"] == tied_rank]
        warnings.append({
            "type": "tie_at_cutoff",
            "tied_team_ids": tied_team_ids,
            "rank": tied_rank,
            "message": f"Tie detected at cutoff rank {tied_rank} between {len(tied_team_ids)} teams.",
        })

        if tie_decision == "include_all_tied":
            # Include all teams with rank <= tied_rank
            selected = [c["teamId"] for c in candidates if c["rank"] <= tied_rank]
            return selected, warnings
        elif tie_decision == "exclude_tied":
            # Only include teams strictly better than tied_rank
            selected = [c["teamId"] for c in candidates if c["rank"] < tied_rank]
            return selected, warnings
        else:
            # Default before decision: teams strictly above the tie
            selected = [c["teamId"] for c in candidates if c["rank"] < tied_rank]
            return selected, warnings

    return [c["teamId"] for c in candidates[:n]], warnings


def select_threshold(
    rows: Sequence[Dict[str, Any]],
    min_score: Decimal,
    include_provisional: bool = False,
) -> Tuple[List[str], List[Dict[str, Any]]]:
    """Pure selection of teams meeting or exceeding min_score.
    
    Args:
        rows: Ranked rows from build_leaderboard.
        min_score: Minimum required score (Decimal).
        include_provisional: If False, provisional teams meeting threshold are excluded with a warning.
    
    Returns:
        (team_ids, warnings)
    """
    if not rows:
        return [], []

    min_score_dec = Decimal(str(min_score))
    warnings: List[Dict[str, Any]] = []
    selected: List[str] = []
    provisional_excluded: List[str] = []

    for r in rows:
        score = Decimal(str(r.get("score", 0)))
        if score >= min_score_dec:
            is_prov = bool(r.get("provisional", False))
            if is_prov and not include_provisional:
                provisional_excluded.append(r["teamId"])
            else:
                selected.append(r["teamId"])

    if provisional_excluded:
        warnings.append({
            "type": "provisional_excluded",
            "team_ids": provisional_excluded,
            "message": f"{len(provisional_excluded)} provisional teams met the score threshold but were excluded.",
        })

    return selected, warnings
