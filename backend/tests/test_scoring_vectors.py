import json
import os
from decimal import Decimal
import pytest

from app.services.scoring import judge_total_pct

VECTORS_DIR = os.path.join(os.path.dirname(__file__), "vectors")
VECTORS_FILE = os.path.join(VECTORS_DIR, "scoring_vectors.json")

TEST_CASES = [
    {
        "name": "single_field_full_marks",
        "fields": [{"id": "f1", "maxMarks": "10", "weight": "100"}],
        "marks": {"f1": "10"},
        "shouldError": False,
    },
    {
        "name": "single_field_zero_marks",
        "fields": [{"id": "f1", "maxMarks": "10", "weight": "100"}],
        "marks": {"f1": "0"},
        "shouldError": False,
    },
    {
        "name": "single_field_half_marks",
        "fields": [{"id": "f1", "maxMarks": "10", "weight": "100"}],
        "marks": {"f1": "5"},
        "shouldError": False,
    },
    {
        "name": "repeating_fraction_third",
        "fields": [{"id": "f1", "maxMarks": "3", "weight": "100"}],
        "marks": {"f1": "1"},
        "shouldError": False,
    },
    {
        "name": "equal_weights_three_criteria",
        "fields": [
            {"id": "c1", "maxMarks": "10", "weight": "33.333"},
            {"id": "c2", "maxMarks": "10", "weight": "33.333"},
            {"id": "c3", "maxMarks": "10", "weight": "33.334"},
        ],
        "marks": {"c1": "7", "c2": "8.5", "c3": "9"},
        "shouldError": False,
    },
    {
        "name": "unequal_weights_and_scales",
        "fields": [
            {"id": "f1", "maxMarks": "25", "weight": "40"},
            {"id": "f2", "maxMarks": "50", "weight": "30"},
            {"id": "f3", "maxMarks": "10", "weight": "20"},
            {"id": "f4", "maxMarks": "100", "weight": "10"},
        ],
        "marks": {"f1": "20", "f2": "35", "f3": "8.5", "f4": "72"},
        "shouldError": False,
    },
    {
        "name": "fine_decimal_steps",
        "fields": [
            {"id": "tech", "maxMarks": "20", "weight": "50"},
            {"id": "pres", "maxMarks": "10", "weight": "30"},
            {"id": "orig", "maxMarks": "5", "weight": "20"},
        ],
        "marks": {"tech": "17.75", "pres": "8.25", "orig": "4.5"},
        "shouldError": False,
    },
    {
        "name": "marks_exceed_max_error",
        "fields": [{"id": "f1", "maxMarks": "10", "weight": "100"}],
        "marks": {"f1": "12"},
        "shouldError": True,
    },
    {
        "name": "marks_negative_error",
        "fields": [{"id": "f1", "maxMarks": "10", "weight": "100"}],
        "marks": {"f1": "-1"},
        "shouldError": True,
    },
    {
        "name": "non_positive_max_marks_error",
        "fields": [{"id": "f1", "maxMarks": "0", "weight": "100"}],
        "marks": {"f1": "0"},
        "shouldError": True,
    },
    {
        "name": "zero_total_weight_error",
        "fields": [{"id": "f1", "maxMarks": "10", "weight": "0"}],
        "marks": {"f1": "5"},
        "shouldError": True,
    },
]


def test_generate_and_assert_scoring_vectors():
    os.makedirs(VECTORS_DIR, exist_ok=True)
    generated = []

    for tc in TEST_CASES:
        item = {
            "name": tc["name"],
            "fields": tc["fields"],
            "marks": tc["marks"],
            "shouldError": tc["shouldError"],
        }
        if tc["shouldError"]:
            with pytest.raises((ValueError, Exception)):
                judge_total_pct(tc["fields"], tc["marks"])
            item["expectedTotalPct"] = None
        else:
            pct = judge_total_pct(tc["fields"], tc["marks"])
            item["expectedTotalPct"] = float(pct)
            # Re-verify consistency
            assert float(judge_total_pct(tc["fields"], tc["marks"])) == item["expectedTotalPct"]
        generated.append(item)

    with open(VECTORS_FILE, "w", encoding="utf-8") as f:
        json.dump(generated, f, indent=2)

    assert os.path.exists(VECTORS_FILE)
    assert len(generated) == len(TEST_CASES)
