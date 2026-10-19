from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
from typing import Dict, List, Optional, Any
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import (
    EvaluationRound,
    RubricVersion,
    RubricField,
    ResultRelease,
    ResultReleaseItem,
    Notification,
    TeamRoundStatus,
    Team,
    User,
    Role,
)
from app.services.evaluation import current_finals
from app.services.ranking import build_leaderboard
from app.services.scoring import display_score
from app.services.rubric import applicable_fields


DEFAULT_RESULTS_CONFIG = {
    "showScore": False,
    "showCriterionScores": False,
    "showRank": False,
    "showAdvancement": False,
    "textFields": {},
    "scale": "percent",  # "scaled" | "percent"
    "holdTeamIds": [],
}

PRIVATE_KEYWORDS = ("judge", "volunteer", "private", "pod")


def assert_no_private_keys(obj: Any) -> None:
    """Recursively validates that no dictionary keys or values contain private keywords."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            k_lower = str(k).lower()
            for kw in PRIVATE_KEYWORDS:
                if kw in k_lower:
                    raise ValueError(f"Private keyword '{kw}' found in payload key: '{k}'")
            assert_no_private_keys(v)
    elif isinstance(obj, list):
        for item in obj:
            assert_no_private_keys(item)


def build_release_items(
    db: Session,
    round_obj: EvaluationRound,
    config: Dict[str, Any],
) -> Dict[str, Dict[str, Any]]:
    """Builds release payloads per team strictly respecting visibility and privacy rules.
    
    Returns:
        {teamId: payload} for teams with >= 1 final and not in holdTeamIds.
    """
    hold_team_ids = set(config.get("holdTeamIds") or [])
    show_score = bool(config.get("showScore", False))
    show_criterion_scores = bool(config.get("showCriterionScores", False))
    show_rank = bool(config.get("showRank", False))
    show_advancement = bool(config.get("showAdvancement", False))
    scale_mode = config.get("scale", "percent")
    text_fields_config = config.get("textFields") or {}

    # Build leaderboard to obtain scores and ranks
    leaderboard = build_leaderboard(db, round_obj)
    rows_by_team = {r["teamId"]: r for r in leaderboard["rows"]}

    # Current rubric fields
    curr_rubric = (
        db.query(RubricVersion)
        .filter(
            RubricVersion.roundId == round_obj.id,
            RubricVersion.version == round_obj.currentRubricVersion,
        )
        .first()
    )
    if curr_rubric:
        all_rubric_fields = (
            db.query(RubricField)
            .filter(RubricField.rubricVersionId == curr_rubric.id)
            .all()
        )
        num_fields = [f for f in all_rubric_fields if f.type == "numeric"]
        txt_fields = [f for f in all_rubric_fields if f.type == "text" and f.visibility == "participant"]
    else:
        num_fields = []
        txt_fields = []

    # Active finals grouped by team
    finals = current_finals(db, round_obj)
    finals_by_team = defaultdict(list)
    for f in finals:
        finals_by_team[f.evaluation.teamId].append(f)

    # Status map for advancement
    status_rows = (
        db.query(TeamRoundStatus)
        .filter(TeamRoundStatus.roundId == round_obj.id)
        .all()
    )
    status_map = {s.teamId: s for s in status_rows}
    status_by_team = {s.teamId: s.state for s in status_rows}

    # All candidate team IDs: teams with finals, with progression status, or scored in leaderboard
    candidate_team_ids = set(finals_by_team.keys()) | set(status_by_team.keys()) | set(rows_by_team.keys())
    if not candidate_team_ids:
        all_teams = db.query(Team).filter(Team.eventId == round_obj.eventId).all()
        for t in all_teams:
            if is_team_eligible(db, round_obj, t.id):
                candidate_team_ids.add(t.id)

    items: Dict[str, Dict[str, Any]] = {}

    for team_id in candidate_team_ids:
        if team_id in hold_team_ids:
            continue

        team_finals = finals_by_team.get(team_id, [])
        row = rows_by_team.get(team_id)
        status_obj = status_map.get(team_id)

        payload: Dict[str, Any] = {}

        # 1. Score
        if show_score:
            if row and row.get("score") is not None:
                if scale_mode == "scaled":
                    payload["score"] = float(row["displayScore"])
                    payload["totalScale"] = round_obj.totalScale or 100
                    payload["scale"] = "scaled"
                else:
                    payload["score"] = float(row["score"])
                    payload["scale"] = "percent"
            elif status_obj and status_obj.scoreSnapshot is not None:
                payload["score"] = float(status_obj.scoreSnapshot)
                payload["scale"] = "percent"

        # 2. Rank
        if show_rank:
            if status_obj and status_obj.rankSnapshot is not None:
                payload["rank"] = int(status_obj.rankSnapshot)
            elif row and row.get("rank") is not None:
                payload["rank"] = int(row["rank"])

        # 3. Advancement
        if show_advancement:
            adv_state = status_by_team.get(team_id, "not_advanced")
            payload["advancement"] = "advanced" if adv_state == "advanced" else "not_advanced"

        # 4. Criteria scores
        team_rubric_fields = applicable_fields(db, curr_rubric, team_id, require_ps=False) if curr_rubric else []
        team_num_fields = [f for f in team_rubric_fields if f.type == "numeric"]
        team_txt_fields = [f for f in team_rubric_fields if f.type == "text" and f.visibility == "participant"]

        if show_criterion_scores and team_num_fields and team_finals:
            criteria_list = []
            for nf in team_num_fields:
                marks_list = []
                for f in team_finals:
                    score_entry = next((s for s in f.scores if s.fieldId == nf.id), None)
                    if score_entry is not None:
                        marks_list.append(Decimal(str(score_entry.marks)))
                if marks_list:
                    avg_m = sum(marks_list, Decimal("0")) / len(marks_list)
                    avg_m = avg_m.quantize(Decimal("0.01"))
                else:
                    avg_m = Decimal("0.00")
                criteria_list.append({
                    "label": nf.label,
                    "avgMarks": float(avg_m),
                    "maxMarks": float(nf.maxMarks),
                })
            payload["criteria"] = criteria_list

        # 5. Comments from text fields (strictly participant visibility, enabled in config, not hidden)
        comments_list = []
        if team_txt_fields and team_finals:
            for tf in team_txt_fields:
                # Check if this text field is enabled in results config
                is_enabled = bool(text_fields_config.get(tf.fieldKey) or text_fields_config.get(tf.id))
                if not is_enabled:
                    continue

                comment_items = []
                # Order finals deterministically by sha256(teamId:versionId)
                sorted_finals = sorted(
                    team_finals,
                    key=lambda f: hashlib.sha256(f"{team_id}:{f.id}".encode("utf-8")).hexdigest(),
                )

                for f in sorted_finals:
                    text_entry = next((t for t in f.texts if t.fieldId == tf.id), None)
                    if text_entry and not text_entry.hiddenByAdmin:
                        val = (text_entry.value or "").strip()
                        if val:
                            comment_items.append(val)

                if comment_items:
                    comments_list.append({
                        "label": tf.label,
                        "items": comment_items,
                    })

        if comments_list:
            payload["comments"] = comments_list

        # Run safety scan to guarantee no internal leakage
        assert_no_private_keys(payload)

        items[team_id] = payload

    return items


def diff_releases(
    old_items: Dict[str, Dict[str, Any]],
    new_items: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    """Computes differences between previous release snapshot and new items."""
    changed_teams = []
    per_team_changes: Dict[str, Dict[str, Any]] = {}

    all_team_ids = set(old_items.keys()) | set(new_items.keys())

    for tid in all_team_ids:
        old_val = old_items.get(tid)
        new_val = new_items.get(tid)

        if old_val != new_val:
            changed_teams.append(tid)
            per_team_changes[tid] = {
                "old": old_val,
                "new": new_val,
            }

    return {
        "changedTeams": sorted(changed_teams),
        "changedCount": len(changed_teams),
        "perTeamChanges": per_team_changes,
    }


def release(
    db: Session,
    round_obj: EvaluationRound,
    config: Dict[str, Any],
    admin_user: Any,
) -> ResultRelease:
    """Creates the initial results release (releaseNo = 1) and fans out notifications."""
    finals = current_finals(db, round_obj)
    status_rows = (
        db.query(TeamRoundStatus)
        .filter(TeamRoundStatus.roundId == round_obj.id)
        .all()
    )

    if not round_obj.evaluationEnabled and not status_rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Evaluation is not enabled for this round.",
        )

    curr_rubric = (
        db.query(RubricVersion)
        .filter(
            RubricVersion.roundId == round_obj.id,
            RubricVersion.version == round_obj.currentRubricVersion,
        )
        .first()
    )
    if finals and curr_rubric and curr_rubric.lockedAt is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rubric must be locked before releasing results.",
        )

    if not finals and not status_rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one final evaluation or team advancement status is required to release results.",
        )

    existing = (
        db.query(ResultRelease)
        .filter(ResultRelease.roundId == round_obj.id)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A release already exists for this round. Use update instead.",
        )

    items = build_release_items(db, round_obj, config)
    if not items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No team results available to release under current filters.",
        )

    rel = ResultRelease(
        eventId=round_obj.eventId,
        roundId=round_obj.id,
        releaseNo=1,
        config=config,
        releasedBy=admin_user.id if hasattr(admin_user, "id") else str(admin_user),
        releasedAt=datetime.now(timezone.utc),
    )
    db.add(rel)
    db.flush()

    for team_id, payload in items.items():
        item = ResultReleaseItem(
            releaseId=rel.id,
            teamId=team_id,
            payload=payload,
        )
        db.add(item)

    # Fan out notifications to leader users of teams with released items
    for team_id in items.keys():
        leader_user = (
            db.query(User)
            .filter(
                User.eventId == round_obj.eventId,
                User.teamId == team_id,
                User.role == Role.LEADER,
            )
            .first()
        )
        if leader_user:
            notif = Notification(
                eventId=round_obj.eventId,
                recipientUserId=leader_user.id,
                type="results_released",
                title=f"Results are out: {round_obj.name}",
                body=f"Evaluation results have been published for {round_obj.name}.",
                link=f"/leader?tab=rounds&round={round_obj.id}",
                payload={"roundId": round_obj.id, "releaseNo": 1},
            )
            db.add(notif)

    db.commit()
    db.refresh(rel)
    return rel


def update(
    db: Session,
    round_obj: EvaluationRound,
    config: Dict[str, Any],
    admin_user: Any,
    expected_release_no: int,
) -> ResultRelease:
    """Updates results release with a new snapshot and notifies only changed teams."""
    latest = (
        db.query(ResultRelease)
        .filter(
            ResultRelease.roundId == round_obj.id,
            ResultRelease.retractedAt == None,
        )
        .order_by(ResultRelease.releaseNo.desc())
        .first()
    )
    if not latest:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active release found to update.",
        )

    if latest.releaseNo != expected_release_no:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Release conflict: expected release #{expected_release_no}, but current is #{latest.releaseNo}",
        )

    old_items = {it.teamId: it.payload for it in latest.items}
    new_items = build_release_items(db, round_obj, config)
    diff = diff_releases(old_items, new_items)

    new_rel_no = latest.releaseNo + 1
    new_rel = ResultRelease(
        eventId=round_obj.eventId,
        roundId=round_obj.id,
        releaseNo=new_rel_no,
        config=config,
        releasedBy=admin_user.id if hasattr(admin_user, "id") else str(admin_user),
        releasedAt=datetime.now(timezone.utc),
        supersedesReleaseId=latest.id,
    )
    db.add(new_rel)
    db.flush()

    for team_id, payload in new_items.items():
        it = ResultReleaseItem(
            releaseId=new_rel.id,
            teamId=team_id,
            payload=payload,
        )
        db.add(it)

    # Fan out notifications ONLY to teams whose payload changed
    for team_id in diff["changedTeams"]:
        leader_user = (
            db.query(User)
            .filter(
                User.eventId == round_obj.eventId,
                User.teamId == team_id,
                User.role == Role.LEADER,
            )
            .first()
        )
        if leader_user:
            notif = Notification(
                eventId=round_obj.eventId,
                recipientUserId=leader_user.id,
                type="results_updated",
                title=f"Your results for {round_obj.name} were updated",
                body=f"Your evaluation results for {round_obj.name} have been updated.",
                link=f"/leader?tab=rounds&round={round_obj.id}",
                payload={"roundId": round_obj.id, "releaseNo": new_rel_no},
            )
            db.add(notif)

    db.commit()
    db.refresh(new_rel)
    return new_rel


def retract(
    db: Session,
    round_obj: EvaluationRound,
    admin_user: Any,
) -> ResultRelease:
    """Retracts the latest active release."""
    latest = (
        db.query(ResultRelease)
        .filter(
            ResultRelease.roundId == round_obj.id,
            ResultRelease.retractedAt == None,
        )
        .order_by(ResultRelease.releaseNo.desc())
        .first()
    )
    if not latest:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active release found to retract.",
        )

    latest.retractedAt = datetime.now(timezone.utc)
    db.commit()
    db.refresh(latest)
    return latest
