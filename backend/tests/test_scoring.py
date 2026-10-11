from decimal import Decimal
import pytest

from app.services.scoring import (
    aggregate,
    display_score,
    judge_total_pct,
    rank_teams,
    validate_rubric,
)


def test_hand_computed_1():
    fields = [
        {'id': 'A', 'maxMarks': 10, 'weight': 60},
        {'id': 'B', 'maxMarks': 5, 'weight': 40},
    ]
    # marks 8 and 5 give 88.000
    res = judge_total_pct(fields, {'A': 8, 'B': 5})
    assert res == Decimal('88.000')

    # marks 10 and 5 give 100.000
    assert judge_total_pct(fields, {'A': 10, 'B': 5}) == Decimal('100.000')

    # marks 0 and 0 give 0.000
    assert judge_total_pct(fields, {'A': 0, 'B': 0}) == Decimal('0.000')


def test_hand_computed_2():
    fields = [
        {'id': 'A', 'maxMarks': 20, 'weight': 25},
        {'id': 'B', 'maxMarks': 10, 'weight': 25},
        {'id': 'C', 'maxMarks': 5, 'weight': 50},
    ]
    # marks 15, 5, 4 give 71.250
    res = judge_total_pct(fields, {'A': 15, 'B': 5, 'C': 4})
    assert res == Decimal('71.250')


def test_hand_computed_3_weights_normalization():
    # weights not totalling 100 are normalised
    fields = [
        {'id': 'A', 'maxMarks': 10, 'weight': 30},
        {'id': 'B', 'maxMarks': 10, 'weight': 20},
    ]
    # marks 5 and 10 give 70.000
    res = judge_total_pct(fields, {'A': 5, 'B': 10})
    assert res == Decimal('70.000')


def test_hand_computed_4_rounding():
    fields = [{'id': 'A', 'maxMarks': 3, 'weight': 100}]
    assert judge_total_pct(fields, {'A': 1}) == Decimal('33.333')
    assert judge_total_pct(fields, {'A': 2}) == Decimal('66.667')


def test_hand_computed_5_value_errors():
    fields = [{'id': 'A', 'maxMarks': 10, 'weight': 100}]
    # marks above max
    with pytest.raises(ValueError, match='marks out of range'):
        judge_total_pct(fields, {'A': 11})

    # negative marks
    with pytest.raises(ValueError, match='marks out of range'):
        judge_total_pct(fields, {'A': -1})

    # maxMarks = 0
    with pytest.raises(ValueError, match='maxMarks must be positive'):
        judge_total_pct([{'id': 'A', 'maxMarks': 0, 'weight': 100}], {'A': 0})

    # non-positive total weight
    with pytest.raises(ValueError, match='weights must be positive'):
        judge_total_pct([{'id': 'A', 'maxMarks': 10, 'weight': 0}], {'A': 5})


def test_hand_computed_6_aggregation():
    # mean of 80, 90, 100 is 90.000
    score, fell_back = aggregate([Decimal('80'), Decimal('90'), Decimal('100')], 'mean')
    assert score == Decimal('90.000')
    assert fell_back is False

    # median of 70, 80, 90, 100 is 85.000
    score, fell_back = aggregate([Decimal('70'), Decimal('80'), Decimal('90'), Decimal('100')], 'median')
    assert score == Decimal('85.000')
    assert fell_back is False

    # trimmed mean (trim 1) of 60, 80, 90, 100, 100 is 90.000 with fell_back False
    score, fell_back = aggregate(
        [Decimal('60'), Decimal('80'), Decimal('90'), Decimal('100'), Decimal('100')],
        'trimmed_mean',
        trim=1,
    )
    assert score == Decimal('90.000')
    assert fell_back is False

    # trimmed mean of 70 and 90 gives 80.000 with fell_back True (needs n >= 2*1+1 = 3)
    score, fell_back = aggregate([Decimal('70'), Decimal('90')], 'trimmed_mean', trim=1)
    assert score == Decimal('80.000')
    assert fell_back is True

    # empty input gives (None, False)
    score, fell_back = aggregate([], 'mean')
    assert score is None
    assert fell_back is False


def test_hand_computed_7_ranking():
    # scores 90, 85, 85, 70 give ranks 1, 2, 2, 4
    rows = [
        {'teamId': 't1', 'score': Decimal('90'), 'fieldScores': {}},
        {'teamId': 't2', 'score': Decimal('85'), 'fieldScores': {}},
        {'teamId': 't3', 'score': Decimal('85'), 'fieldScores': {}},
        {'teamId': 't4', 'score': Decimal('70'), 'fieldScores': {}},
    ]
    ranked = rank_teams(rows, [])
    assert [r['rank'] for r in ranked] == [1, 2, 2, 4]

    # two teams at 85 with tie-break field design 9 versus 7 give ranks 2 and 3
    rows_tb = [
        {'teamId': 't1', 'score': Decimal('90'), 'fieldScores': {'design': Decimal('8')}},
        {'teamId': 't2', 'score': Decimal('85'), 'fieldScores': {'design': Decimal('7')}},
        {'teamId': 't3', 'score': Decimal('85'), 'fieldScores': {'design': Decimal('9')}},
        {'teamId': 't4', 'score': Decimal('70'), 'fieldScores': {'design': Decimal('5')}},
    ]
    ranked_tb = rank_teams(rows_tb, ['design'])
    assert [r['rank'] for r in ranked_tb] == [1, 2, 3, 4]
    assert ranked_tb[1]['teamId'] == 't3'  # 85 score, 9 design
    assert ranked_tb[2]['teamId'] == 't2'  # 85 score, 7 design


def test_hand_computed_8_display_score():
    assert display_score(Decimal('88.000'), 20) == Decimal('17.60')


def test_hand_computed_9_validate_rubric():
    # weights 60 and 30 report an error
    f_err = [
        {'id': 'f1', 'type': 'numeric', 'label': 'A', 'maxMarks': 10, 'weight': 60},
        {'id': 'f2', 'type': 'numeric', 'label': 'B', 'maxMarks': 10, 'weight': 30},
    ]
    errs = validate_rubric(f_err)
    assert any('weights must total exactly 100' in e for e in errs)

    # 60 and 40 pass
    f_ok = [
        {'id': 'f1', 'type': 'numeric', 'label': 'A', 'maxMarks': 10, 'weight': 60},
        {'id': 'f2', 'type': 'numeric', 'label': 'B', 'maxMarks': 10, 'weight': 40},
    ]
    assert validate_rubric(f_ok) == []

    # no numeric field errors
    f_no_num = [{'id': 'f1', 'type': 'text', 'label': 'Notes', 'visibility': 'staff'}]
    assert any('At least one numeric field' in e for e in validate_rubric(f_no_num))

    # duplicate labels (case-insensitive) error
    f_dup = [
        {'id': 'f1', 'type': 'numeric', 'label': 'Code Quality', 'maxMarks': 10, 'weight': 50},
        {'id': 'f2', 'type': 'numeric', 'label': 'code quality', 'maxMarks': 10, 'weight': 50},
    ]
    assert any('Duplicate field label' in e for e in validate_rubric(f_dup))

    # text field without visibility errors
    f_text_bad = [
        {'id': 'f1', 'type': 'numeric', 'label': 'Score', 'maxMarks': 10, 'weight': 100},
        {'id': 'f2', 'type': 'text', 'label': 'Comment', 'visibility': 'invalid'},
    ]
    assert any("visibility 'staff' or 'participant'" in e for e in validate_rubric(f_text_bad))

    # a tie-break key naming a text field errors
    f_tb_text = [
        {'id': 'f1', 'type': 'numeric', 'label': 'Score', 'maxMarks': 10, 'weight': 100},
        {'id': 'f2', 'type': 'text', 'label': 'Comment', 'visibility': 'staff'},
    ]
    assert any('is not a numeric field' in e for e in validate_rubric(f_tb_text, ['f2']))
