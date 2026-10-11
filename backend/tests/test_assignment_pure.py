import time
import pytest

from app.services.assignment import (
    plan_distribution,
    detect_conflicts,
    load_report,
    make_preview_token,
    verify_preview_token,
)


def test_plan_distribution_split_and_all():
    judges = ["j1", "j2", "j3"]
    teams = [f"t{i}" for i in range(1, 7)]

    # Split with 1 judge per team: t1->j1, t2->j2, t3->j3, t4->j1, t5->j2, t6->j3
    pairs_1, warnings_1 = plan_distribution(teams, judges, mode="split", judges_per_team=1)
    assert warnings_1 == []
    expected_1 = [("t1", "j1"), ("t2", "j2"), ("t3", "j3"), ("t4", "j1"), ("t5", "j2"), ("t6", "j3")]
    assert pairs_1 == expected_1

    # Split with 2 judges per team
    pairs_2, warnings_2 = plan_distribution(teams, judges, mode="split", judges_per_team=2)
    assert warnings_2 == []
    team_judges = {}
    for t, j in pairs_2:
        team_judges.setdefault(t, set()).add(j)

    assert team_judges["t1"] == {"j1", "j2"}
    assert team_judges["t2"] == {"j1", "j3"}
    assert team_judges["t3"] == {"j2", "j3"}
    assert team_judges["t4"] == {"j1", "j2"}
    assert team_judges["t5"] == {"j1", "j3"}
    assert team_judges["t6"] == {"j2", "j3"}

    # Every judge ends with exactly 4 teams
    rep = load_report(pairs_2)
    assert rep["perJudge"] == {"j1": 4, "j2": 4, "j3": 4}

    # Mode all with 2 teams and 2 judges gives 4 pairs
    pairs_all, warnings_all = plan_distribution(["t1", "t2"], ["j1", "j2"], mode="all")
    assert len(pairs_all) == 4
    assert set(pairs_all) == {("t1", "j1"), ("t1", "j2"), ("t2", "j1"), ("t2", "j2")}

    # group_map test: {t1: [j1], t2: [j2, j3]} in split mode gives t1->j1 and t2->j2
    group_map = {"t1": ["j1"], "t2": ["j2", "j3"]}
    pairs_grp, warnings_grp = plan_distribution(["t1", "t2"], judges, mode="split", judges_per_team=1, group_map=group_map)
    assert pairs_grp == [("t1", "j1"), ("t2", "j2")]

    # Wanting 3 judges per team with only 2 candidates yields understaffed warning
    pairs_under, warnings_under = plan_distribution(["t1"], ["j1", "j2"], mode="split", judges_per_team=3)
    assert len(warnings_under) == 1
    assert warnings_under[0]["code"] == "understaffed"
    assert warnings_under[0]["got"] == 2

    # A team with no allowed judge yields no_judge
    pairs_none, warnings_none = plan_distribution(["t1"], ["j1"], mode="split", judges_per_team=1, group_map={"t1": []})
    assert len(warnings_none) == 1
    assert warnings_none[0]["code"] == "no_judge"


def test_detect_conflicts():
    pairs = [("t1", "j1"), ("t2", "j2"), ("t3", "j3")]
    team_attr = {"t1": "MIT ", "t2": "Stanford", "t3": ""}
    judge_attr = {"j1": "mit", "j2": "Harvard", "j3": ""}

    conflicts = detect_conflicts(pairs, team_attr, judge_attr)
    assert len(conflicts) == 1
    assert conflicts[0] == {"teamId": "t1", "judgeId": "j1", "value": "mit"}


def test_preview_token():
    secret = "secret-key-12345"
    round_id = "r-001"
    event_id = "e-001"
    pairs = [("t1", "j1"), ("t2", "j2")]

    token, exp = make_preview_token(secret, round_id, event_id, pairs, ttl=600)
    assert verify_preview_token(secret, token, round_id, event_id, pairs) is True

    # Changing pairs fails
    assert verify_preview_token(secret, token, round_id, event_id, [("t1", "j2")]) is False

    # Changing round id fails
    assert verify_preview_token(secret, token, "r-other", event_id, pairs) is False

    # Changing event id fails
    assert verify_preview_token(secret, token, round_id, "e-other", pairs) is False

    # Expired token fails
    expired_token, _ = make_preview_token(secret, round_id, event_id, pairs, ttl=-10)
    assert verify_preview_token(secret, expired_token, round_id, event_id, pairs) is False

    # Garbage token fails
    assert verify_preview_token(secret, "garbage", round_id, event_id, pairs) is False
    assert verify_preview_token(secret, "abc.def", round_id, event_id, pairs) is False
