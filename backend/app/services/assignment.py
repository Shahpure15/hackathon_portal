import hashlib
import hmac
import json
import time
from typing import Dict, List, Optional, Sequence, Tuple

Pair = Tuple[str, str]  # (team_id, judge_volunteer_id)


def plan_distribution(
    team_ids: Sequence[str],
    judge_ids: Sequence[str],
    mode: str,
    judges_per_team: int = 1,
    group_map: Optional[Dict[str, List[str]]] = None
) -> Tuple[List[Pair], List[dict]]:
    """mode 'all': every allowed judge scores every team.
    mode 'split': balanced; each team gets judges_per_team judges with the lowest current load (ties by id).
    group_map optionally restricts the judges allowed per team (judges mapped to a pod, problem statement or panel).
    """
    teams = sorted(set(team_ids))
    judges = sorted(set(judge_ids))
    pairs: List[Pair] = []
    warnings: List[dict] = []
    load = {j: 0 for j in judges}

    for t in teams:
        allowed = [j for j in (group_map.get(t, judges) if group_map else judges) if j in load]
        if not allowed:
            warnings.append({"code": "no_judge", "teamId": t})
            continue

        if mode == "all":
            chosen = sorted(allowed)
            for j in chosen:
                load[j] += 1
                pairs.append((t, j))
        else:
            want = max(1, judges_per_team)
            chosen = sorted(allowed, key=lambda j: (load[j], j))[:want]
            if len(chosen) < want:
                warnings.append({
                    "code": "understaffed",
                    "teamId": t,
                    "wanted": want,
                    "got": len(chosen)
                })
            for j in chosen:
                load[j] += 1
                pairs.append((t, j))

    return pairs, warnings


def detect_conflicts(
    pairs: Sequence[Pair],
    team_attr: Dict[str, str],
    judge_attr: Dict[str, str]
) -> List[dict]:
    out = []
    for t, j in pairs:
        a = (team_attr.get(t) or "").strip().casefold()
        b = (judge_attr.get(j) or "").strip().casefold()
        if a and a == b:
            out.append({"teamId": t, "judgeId": j, "value": a})
    return out


def load_report(pairs: Sequence[Pair]) -> dict:
    counts: Dict[str, int] = {}
    for _, j in pairs:
        counts[j] = counts.get(j, 0) + 1
    values = list(counts.values())
    return {
        "perJudge": counts,
        "min": min(values) if values else 0,
        "max": max(values) if values else 0,
        "avg": (sum(values) / len(values)) if values else 0.0,
    }


def _message(round_id: str, event_id: str, pairs: Sequence[Pair], exp: int) -> bytes:
    return json.dumps([round_id, event_id, sorted(list(p) for p in pairs), exp], separators=(",", ":")).encode()


def make_preview_token(
    secret: str,
    round_id: str,
    event_id: str,
    pairs: Sequence[Pair],
    ttl: int = 600
) -> Tuple[str, int]:
    exp = int(time.time()) + ttl
    sig = hmac.new(
        ("assignment-preview:" + secret).encode(),
        _message(round_id, event_id, pairs, exp),
        hashlib.sha256
    ).hexdigest()
    return str(exp) + "." + sig, exp


def verify_preview_token(
    secret: str,
    token: str,
    round_id: str,
    event_id: str,
    pairs: Sequence[Pair]
) -> bool:
    try:
        exp_text, sig = token.split(".", 1)
        exp = int(exp_text)
    except (ValueError, AttributeError):
        return False
    if exp < int(time.time()):
        return False
    good = hmac.new(
        ("assignment-preview:" + secret).encode(),
        _message(round_id, event_id, pairs, exp),
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(good, sig)
