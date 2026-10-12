from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import io
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dto.results import (
    ResultsConfigDTO,
    ResultsStatusDTO,
    ResultsUpdateCommitRequest,
    AdvancePreviewRequest,
    AdvanceCommitRequest,
    ProgressionItemDTO,
)
from app.models import (
    EvaluationRound,
    RubricVersion,
    RubricField,
    ResultRelease,
    ResultReleaseItem,
    TeamRoundStatus,
    Team,
)
from app.rbac import Principal, require_permission
from app.routers.admin import log_audit
from app.services.export_utils import safe_cell
from app.services.progression import select_top_n, select_threshold
from app.services.ranking import build_leaderboard
from app.services.results import (
    DEFAULT_RESULTS_CONFIG,
    build_release_items,
    diff_releases,
    release,
    update,
    retract,
)

router = APIRouter(prefix="/admin/rounds/{rid}", tags=["Results & Progression Admin"])


def _get_round(rid: str, event_id: str, db: Session) -> EvaluationRound:
    round_obj = (
        db.query(EvaluationRound)
        .filter(EvaluationRound.id == rid, EvaluationRound.eventId == event_id)
        .first()
    )
    if not round_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found.")
    return round_obj


def _generate_advance_token(rid: str, team_ids: List[str], tie_decision: Optional[str], has_tie: bool = False) -> str:
    sorted_ids = ",".join(sorted(team_ids))
    td = tie_decision or ""
    raw = f"{settings.JWT_SECRET_KEY}:{rid}:{sorted_ids}:{td}:{has_tie}"
    sig = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"{sig}:tie" if has_tie else sig


# ---------------------------------------------------------------------------
# 1. Leaderboard
# ---------------------------------------------------------------------------
@router.get("/leaderboard")
def get_leaderboard(
    rid: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.view_all")),
):
    round_obj = _get_round(rid, current_user.eventId, db)
    return build_leaderboard(db, round_obj)


# ---------------------------------------------------------------------------
# 2. Results Config (GET & PUT)
# ---------------------------------------------------------------------------
@router.get("/results-config", response_model=ResultsConfigDTO)
def get_results_config(
    rid: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.view_all")),
):
    round_obj = _get_round(rid, current_user.eventId, db)
    return round_obj.resultsConfig or DEFAULT_RESULTS_CONFIG


@router.put("/results-config", response_model=ResultsConfigDTO)
def update_results_config(
    rid: str,
    payload: ResultsConfigDTO,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.release")),
):
    round_obj = _get_round(rid, current_user.eventId, db)

    # Validate keys against rubric's text fields
    curr_rubric = (
        db.query(RubricVersion)
        .filter(
            RubricVersion.roundId == rid,
            RubricVersion.version == round_obj.currentRubricVersion,
        )
        .first()
    )
    txt_fields = (
        db.query(RubricField)
        .filter(RubricField.rubricVersionId == curr_rubric.id, RubricField.type == "text")
        .all()
        if curr_rubric
        else []
    )
    valid_keys = {f.fieldKey for f in txt_fields} | {f.id for f in txt_fields}

    for key in (payload.textFields or {}).keys():
        if key not in valid_keys:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown text field key in results-config: '{key}'",
            )

    cfg_dict = payload.model_dump()
    round_obj.resultsConfig = cfg_dict
    db.commit()
    db.refresh(round_obj)
    return round_obj.resultsConfig


# ---------------------------------------------------------------------------
# 3. Results Preview & Status
# ---------------------------------------------------------------------------
@router.post("/results/preview")
def preview_results(
    rid: str,
    payload: Optional[ResultsConfigDTO] = None,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.release")),
):
    round_obj = _get_round(rid, current_user.eventId, db)
    config = payload.model_dump() if payload else (round_obj.resultsConfig or DEFAULT_RESULTS_CONFIG)
    items = build_release_items(db, round_obj, config)

    # Up to 5 sample payloads
    samples = [dict(teamId=tid, **p) for tid, p in list(items.items())[:5]]
    return {
        "samplePayloads": samples,
        "totalTeams": len(items),
    }


@router.get("/results/status", response_model=ResultsStatusDTO)
def get_results_status(
    rid: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.release")),
):
    round_obj = _get_round(rid, current_user.eventId, db)
    latest = (
        db.query(ResultRelease)
        .filter(ResultRelease.roundId == rid)
        .order_by(ResultRelease.releaseNo.desc())
        .first()
    )
    if not latest:
        return ResultsStatusDTO(
            releaseNo=0,
            releasedAt=None,
            retracted=False,
            pendingChanges=0,
        )

    retracted = latest.retractedAt is not None
    pending_changes = 0

    if not retracted:
        config = round_obj.resultsConfig or latest.config or DEFAULT_RESULTS_CONFIG
        fresh_items = build_release_items(db, round_obj, config)
        old_items = {it.teamId: it.payload for it in latest.items}
        diff = diff_releases(old_items, fresh_items)
        pending_changes = diff["changedCount"]

    return ResultsStatusDTO(
        releaseNo=latest.releaseNo,
        releasedAt=latest.releasedAt.isoformat() if latest.releasedAt else None,
        retracted=retracted,
        pendingChanges=pending_changes,
    )


# ---------------------------------------------------------------------------
# 4. Results Release, Update Preview, Update, Retract
# ---------------------------------------------------------------------------
@router.post("/results/release")
def release_results(
    rid: str,
    payload: Optional[ResultsConfigDTO] = None,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.release")),
):
    round_obj = _get_round(rid, current_user.eventId, db)
    config = payload.model_dump() if payload else (round_obj.resultsConfig or DEFAULT_RESULTS_CONFIG)
    rel = release(db, round_obj, config, current_user)
    log_audit(
        db,
        current_user.id,
        "results.released",
        "ResultRelease",
        rel.id,
        {"releaseNo": rel.releaseNo, "totalItems": len(rel.items)},
        event_id=current_user.eventId,
    )
    return {
        "releaseNo": rel.releaseNo,
        "releasedAt": rel.releasedAt.isoformat(),
        "totalItems": len(rel.items),
    }


@router.post("/results/update/preview")
def preview_update_results(
    rid: str,
    payload: Optional[ResultsConfigDTO] = None,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.release")),
):
    round_obj = _get_round(rid, current_user.eventId, db)
    latest = (
        db.query(ResultRelease)
        .filter(ResultRelease.roundId == rid, ResultRelease.retractedAt == None)
        .order_by(ResultRelease.releaseNo.desc())
        .first()
    )
    if not latest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active release found to update.")

    old_items = {it.teamId: it.payload for it in latest.items}
    config = payload.model_dump() if payload else (round_obj.resultsConfig or latest.config or DEFAULT_RESULTS_CONFIG)
    new_items = build_release_items(db, round_obj, config)
    return diff_releases(old_items, new_items)


@router.post("/results/update")
def update_results(
    rid: str,
    payload: ResultsUpdateCommitRequest,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.release")),
):
    round_obj = _get_round(rid, current_user.eventId, db)
    config = round_obj.resultsConfig or DEFAULT_RESULTS_CONFIG
    rel = update(db, round_obj, config, current_user, payload.expectedReleaseNo)
    log_audit(
        db,
        current_user.id,
        "results.updated",
        "ResultRelease",
        rel.id,
        {"releaseNo": rel.releaseNo},
        event_id=current_user.eventId,
    )
    return {
        "releaseNo": rel.releaseNo,
        "releasedAt": rel.releasedAt.isoformat(),
    }


@router.post("/results/retract")
def retract_results(
    rid: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.release")),
):
    round_obj = _get_round(rid, current_user.eventId, db)
    rel = retract(db, round_obj, current_user)
    log_audit(
        db,
        current_user.id,
        "results.retracted",
        "ResultRelease",
        rel.id,
        {"releaseNo": rel.releaseNo},
        event_id=current_user.eventId,
    )
    return {
        "success": True,
        "retractedAt": rel.retractedAt.isoformat(),
    }


# ---------------------------------------------------------------------------
# 5. Advancement (Preview & Commit)
# ---------------------------------------------------------------------------
@router.post("/advance/preview")
def preview_advance(
    rid: str,
    payload: AdvancePreviewRequest,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.advance")),
):
    round_obj = _get_round(rid, current_user.eventId, db)
    lb = build_leaderboard(db, round_obj)
    rows = lb["rows"]

    if payload.mode == "top_n":
        selected_ids, warnings = select_top_n(
            rows,
            payload.n or 0,
            include_provisional=payload.includeProvisional,
            tie_decision=payload.tieDecision,
        )
    elif payload.mode == "threshold":
        selected_ids, warnings = select_threshold(
            rows,
            payload.minScore or Decimal("0"),
            include_provisional=payload.includeProvisional,
        )
    elif payload.mode == "manual":
        selected_ids = payload.teamIds or []
        warnings = []
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported advance mode: {payload.mode}")

    has_tie = any(w.get("type") == "tie_at_cutoff" for w in warnings)
    token = _generate_advance_token(rid, selected_ids, payload.tieDecision, has_tie=has_tie)

    return {
        "selectedTeamIds": selected_ids,
        "warnings": warnings,
        "token": token,
    }


@router.post("/advance/commit")
def commit_advance(
    rid: str,
    payload: AdvanceCommitRequest,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.advance")),
):
    round_obj = _get_round(rid, current_user.eventId, db)
    lb = build_leaderboard(db, round_obj)
    rows = lb["rows"]
    unscored = lb["unscored"]

    # Validate token
    has_tie = payload.token.endswith(":tie")
    expected_token = _generate_advance_token(rid, payload.teamIds, payload.tieDecision, has_tie=has_tie)
    if payload.token != expected_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Advance token mismatch or selection has been tampered with.",
        )

    # Check if a cutoff tie was detected and if tieDecision is required
    if has_tie and payload.tieDecision not in ("include_all_tied", "exclude_tied", "confirmed_manual"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A tie was detected at the cutoff. You must specify a tieDecision ('include_all_tied', 'exclude_tied', or 'confirmed_manual').",
        )

    selected_set = set(payload.teamIds)
    scored_team_map = {r["teamId"]: r for r in rows}
    all_teams = db.query(Team).filter(Team.eventId == current_user.eventId).all()

    old_statuses = (
        db.query(TeamRoundStatus)
        .filter(TeamRoundStatus.roundId == rid)
        .all()
    )
    old_advanced_count = sum(1 for s in old_statuses if s.state == "advanced")

    existing_status_map = {s.teamId: s for s in old_statuses}
    via_val = f"auto_{payload.mode}" if payload.mode in ("top_n", "threshold") else "manual"
    now_utc = datetime.now(timezone.utc)

    for t in all_teams:
        if t.id in selected_set:
            state = "advanced"
        elif t.id in scored_team_map:
            state = "not_advanced"
        else:
            state = "eligible"

        row_info = scored_team_map.get(t.id)
        rank_snap = row_info["rank"] if row_info else None
        score_snap = row_info["score"] if row_info else None

        existing = existing_status_map.get(t.id)
        if existing:
            existing.state = state
            existing.via = via_val
            existing.rankSnapshot = rank_snap
            existing.scoreSnapshot = score_snap
            existing.decidedBy = current_user.id
            existing.decidedAt = now_utc
        else:
            new_status = TeamRoundStatus(
                eventId=current_user.eventId,
                roundId=rid,
                teamId=t.id,
                state=state,
                via=via_val,
                rankSnapshot=rank_snap,
                scoreSnapshot=score_snap,
                decidedBy=current_user.id,
                decidedAt=now_utc,
            )
            db.add(new_status)

    log_audit(
        db,
        current_user.id,
        "round.progression_committed",
        "EvaluationRound",
        rid,
        {"oldAdvancedCount": old_advanced_count, "newAdvancedCount": len(selected_set)},
        event_id=current_user.eventId,
    )
    db.commit()

    return {
        "success": True,
        "advancedCount": len(selected_set),
    }


# ---------------------------------------------------------------------------
# 6. Progression List
# ---------------------------------------------------------------------------
@router.get("/progression", response_model=List[ProgressionItemDTO])
def get_progression(
    rid: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.view_all")),
):
    round_obj = _get_round(rid, current_user.eventId, db)
    statuses = (
        db.query(TeamRoundStatus, Team.name, Team.registrationId)
        .join(Team, TeamRoundStatus.teamId == Team.id)
        .filter(TeamRoundStatus.roundId == rid)
        .order_by(Team.registrationId)
        .all()
    )

    out = []
    for s, t_name, t_reg in statuses:
        out.append(
            ProgressionItemDTO(
                id=s.id,
                teamId=s.teamId,
                name=t_name,
                registrationId=t_reg,
                state=s.state,
                via=s.via,
                rankSnapshot=s.rankSnapshot,
                scoreSnapshot=s.scoreSnapshot,
                decidedBy=s.decidedBy,
                decidedAt=s.decidedAt.isoformat() if s.decidedAt else None,
            )
        )
    return out


# ---------------------------------------------------------------------------
# 7. Leaderboard Export (Formula-hardened)
# ---------------------------------------------------------------------------
@router.get("/leaderboard/export")
def export_leaderboard(
    rid: str,
    db: Session = Depends(get_db),
    current_user: Principal = Depends(require_permission("evaluation.export")),
):
    round_obj = _get_round(rid, current_user.eventId, db)
    lb = build_leaderboard(db, round_obj)
    rows = lb["rows"]
    unscored = lb["unscored"]

    wb = openpyxl.Workbook()
    if "Sheet" in wb.sheetnames:
        wb.remove(wb["Sheet"])

    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    data_font = Font(name="Calibri", size=10)
    thin_border = Border(
        left=Side(style="thin", color="E2E8F0"),
        right=Side(style="thin", color="E2E8F0"),
        top=Side(style="thin", color="E2E8F0"),
        bottom=Side(style="thin", color="E2E8F0"),
    )

    ws = wb.create_sheet(title=f"Round {round_obj.roundNumber} Leaderboard"[:31])

    headers = [
        "Rank",
        "Team Code",
        "Team Name",
        "Score (%)",
        "Display Score",
        "Judges Count",
        "Needed",
        "Provisional",
        "Fell Back to Mean",
    ]
    ws.append(headers)

    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="left", vertical="center")

    current_row = 2
    for r in rows:
        ws.append([
            r["rank"],
            safe_cell(r["registrationId"]),
            safe_cell(r["name"]),
            float(r["score"]),
            float(r["displayScore"]),
            r["judgesCount"],
            r["needed"],
            "Yes" if r["provisional"] else "No",
            "Yes" if r["fellBack"] else "No",
        ])
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=current_row, column=col_idx)
            cell.font = data_font
            cell.border = thin_border
        current_row += 1

    for u in unscored:
        ws.append([
            "-",
            safe_cell(u["registrationId"]),
            safe_cell(u["name"]),
            "-",
            "-",
            0,
            u["needed"],
            "Unscored",
            "-",
        ])
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=current_row, column=col_idx)
            cell.font = data_font
            cell.border = thin_border
        current_row += 1

    # Auto-fit column widths
    for col in ws.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    filename = f"round_{round_obj.roundNumber}_leaderboard.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
