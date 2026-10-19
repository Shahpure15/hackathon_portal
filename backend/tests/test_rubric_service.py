from datetime import datetime
from decimal import Decimal
import pytest
from fastapi import HTTPException

from app.models import EvaluationRound, RubricVersion
from app.services.rubric import (
    get_current_rubric,
    is_locked,
    publish_rubric,
    save_draft_rubric,
    unpublish_rubric,
)
from tests.factories import make_org_event


def test_rubric_version_1_created_and_key_stability(db):
    event = make_org_event(db, name='Rubric Test Event')
    rnd = EvaluationRound(
        eventId=event.id,
        name='Round 1',
        roundNumber=1,
        evaluationEnabled=True,
    )
    db.add(rnd)
    db.commit()

    # Initial save: version 1 should be created
    payload1 = [
        {'type': 'numeric', 'label': 'Innovation', 'maxMarks': 10, 'weight': 60},
        {'type': 'numeric', 'label': 'Execution', 'maxMarks': 20, 'weight': 40},
    ]
    rubric1 = save_draft_rubric(db, rnd, payload1, 'admin1')
    assert rubric1.version == 1
    assert rnd.currentRubricVersion == 1
    assert len(rubric1.fields) == 2

    key_innov = rubric1.fields[0].fieldKey
    key_exec = rubric1.fields[1].fieldKey
    assert key_innov is not None
    assert key_exec is not None

    # Second save with existing key for Innovation and a new field:
    # key stability should hold, and new field gets a new uuid
    payload2 = [
        {'fieldKey': key_innov, 'type': 'numeric', 'label': 'Innovation Renamed', 'maxMarks': 15, 'weight': 50},
        {'type': 'text', 'label': 'Notes', 'visibility': 'staff'},
    ]
    rubric2 = save_draft_rubric(db, rnd, payload2, 'admin1')
    assert rubric2.version == 1
    fields2 = sorted(rubric2.fields, key=lambda f: f.sortOrder)
    assert fields2[0].fieldKey == key_innov
    assert fields2[0].label == 'Innovation Renamed'
    assert fields2[1].fieldKey != key_exec
    assert fields2[1].fieldKey is not None


def test_locked_rubric_edits(db):
    event = make_org_event(db, name='Locked Rubric Event')
    rnd = EvaluationRound(
        eventId=event.id,
        name='Round 2',
        roundNumber=2,
        evaluationEnabled=True,
    )
    db.add(rnd)
    db.commit()

    payload = [
        {
            'type': 'numeric',
            'label': 'Criterion A',
            'description': 'Old desc',
            'maxMarks': 10,
            'weight': 100,
            'anchors': [{'from': 0, 'to': 10, 'label': 'Adequate'}],
        }
    ]
    rubric = save_draft_rubric(db, rnd, payload, 'admin1')
    f_key = rubric.fields[0].fieldKey

    # Lock the rubric (simulating Phase 3 lock)
    rubric.lockedAt = datetime.utcnow()
    db.commit()
    assert is_locked(rubric) is True

    # 1. Update only description and anchors -> Allowed
    update_ok = [
        {
            'fieldKey': f_key,
            'type': 'numeric',
            'label': 'Criterion A',
            'description': 'Updated desc',
            'maxMarks': 10,
            'weight': 100,
            'anchors': [{'from': 0, 'to': 5, 'label': 'Low'}, {'from': 6, 'to': 10, 'label': 'High'}],
        }
    ]
    saved = save_draft_rubric(db, rnd, update_ok, 'admin1')
    assert saved.fields[0].description == 'Updated desc'

    # 2. Update weight -> 409
    update_weight_bad = [
        {
            'fieldKey': f_key,
            'type': 'numeric',
            'label': 'Criterion A',
            'description': 'Updated desc',
            'maxMarks': 10,
            'weight': 80,
            'anchors': [{'from': 0, 'to': 10, 'label': 'Adequate'}],
        }
    ]
    with pytest.raises(HTTPException) as exc:
        save_draft_rubric(db, rnd, update_weight_bad, 'admin1')
    assert exc.value.status_code == 409

    # 3. Add field -> 409
    add_field_bad = [
        {
            'fieldKey': f_key,
            'type': 'numeric',
            'label': 'Criterion A',
            'maxMarks': 10,
            'weight': 100,
        },
        {'type': 'numeric', 'label': 'Criterion B', 'maxMarks': 10, 'weight': 0},
    ]
    with pytest.raises(HTTPException) as exc:
        save_draft_rubric(db, rnd, add_field_bad, 'admin1')
    assert exc.value.status_code == 409

    # 4. Remove field -> 409
    with pytest.raises(HTTPException) as exc:
        save_draft_rubric(db, rnd, [], 'admin1')
    assert exc.value.status_code == 409


def test_publish_and_unpublish_rules(db):
    event = make_org_event(db, name='Publish Test Event')
    rnd = EvaluationRound(
        eventId=event.id,
        name='Round 3',
        roundNumber=3,
        evaluationEnabled=False,  # Disabled initially
    )
    db.add(rnd)
    db.commit()

    # Save rubric with weights totalling 90
    payload_90 = [
        {'type': 'numeric', 'label': 'Field 1', 'maxMarks': 10, 'weight': 90},
    ]
    save_draft_rubric(db, rnd, payload_90, 'admin1')

    # Publish requires evaluationEnabled -> 400
    with pytest.raises(HTTPException) as exc:
        publish_rubric(db, rnd, 'admin1')
    assert exc.value.status_code == 400

    rnd.evaluationEnabled = True
    db.commit()

    # Publish rejects weights of 90 -> 422
    with pytest.raises(HTTPException) as exc:
        publish_rubric(db, rnd, 'admin1')
    assert exc.value.status_code == 422

    # Save rubric with weights totalling 100
    payload_100 = [
        {'type': 'numeric', 'label': 'Field 1', 'maxMarks': 10, 'weight': 100},
    ]
    save_draft_rubric(db, rnd, payload_100, 'admin1')

    # Publish passes at 100
    published = publish_rubric(db, rnd, 'admin1')
    assert published.publishedAt is not None

    # Unpublish passes when not locked
    unpublished = unpublish_rubric(db, rnd, 'admin1')
    assert unpublished.publishedAt is None

    # Lock and verify unpublish is refused
    published.lockedAt = datetime.utcnow()
    db.commit()
    with pytest.raises(HTTPException) as exc:
        unpublish_rubric(db, rnd, 'admin1')
    assert exc.value.status_code == 409


def test_anchors_range_validation(db):
    event = make_org_event(db, name='Anchors Validation Event')
    rnd = EvaluationRound(eventId=event.id, name='Round 4', roundNumber=4, evaluationEnabled=True)
    db.add(rnd)
    db.commit()

    # from > to -> 422
    bad_range = [
        {'type': 'numeric', 'label': 'A', 'maxMarks': 10, 'weight': 100, 'anchors': [{'from': 8, 'to': 5, 'label': 'Bad'}]}
    ]
    with pytest.raises(HTTPException) as exc:
        save_draft_rubric(db, rnd, bad_range, 'admin1')
    assert exc.value.status_code == 422

    # to > maxMarks -> 422
    exceed_max = [
        {'type': 'numeric', 'label': 'A', 'maxMarks': 10, 'weight': 100, 'anchors': [{'from': 0, 'to': 15, 'label': 'Exceeds'}]}
    ]
    with pytest.raises(HTTPException) as exc:
        save_draft_rubric(db, rnd, exceed_max, 'admin1')
    assert exc.value.status_code == 422


def test_multi_ps_rubric_save_publish_and_applicable_fields(db):
    from app.models import ProblemStatement, PSSelection
    from app.services.rubric import applicable_fields
    from app.services.evaluation import revise_rubric
    from tests.factories import make_team

    event = make_org_event(db, name='Multi PS Test Event')
    rnd = EvaluationRound(eventId=event.id, name='Delhi Round', roundNumber=2, evaluationEnabled=True)
    db.add(rnd)
    db.flush()

    ps1 = ProblemStatement(eventId=event.id, code='PSE01', title='Problem 1', description='Desc 1', capacity=10)
    ps2 = ProblemStatement(eventId=event.id, code='PSE02', title='Problem 2', description='Desc 2', capacity=10)
    db.add_all([ps1, ps2])
    db.flush()

    team1 = make_team(db, event, 'Team 1', 'REG001')
    db.add(PSSelection(teamId=team1.id, psId=ps1.id))
    db.commit()

    # Section B: 2 general numeric fields totaling 60
    general_fields = [
        {'type': 'numeric', 'label': 'General Feasibility', 'maxMarks': 30, 'weight': 30, 'problemStatementId': None},
        {'type': 'numeric', 'label': 'General Presentation', 'maxMarks': 30, 'weight': 30, 'problemStatementId': None},
    ]
    # Section A for PS1: 2 fields totaling 40
    ps1_fields = [
        {'type': 'numeric', 'label': 'PS1 Novelty', 'maxMarks': 20, 'weight': 20, 'problemStatementId': ps1.id},
        {'type': 'numeric', 'label': 'PS1 Impact', 'maxMarks': 20, 'weight': 20, 'problemStatementId': ps1.id},
    ]
    # Section A for PS2: 2 fields totaling 40
    ps2_fields = [
        {'type': 'numeric', 'label': 'PS2 Depth', 'maxMarks': 25, 'weight': 25, 'problemStatementId': ps2.id},
        {'type': 'numeric', 'label': 'PS2 Architecture', 'maxMarks': 15, 'weight': 15, 'problemStatementId': ps2.id},
    ]
    all_fields = general_fields + ps1_fields + ps2_fields

    guidances = [
        {'problemStatementId': ps1.id, 'decisiveTest': 'Test PS1 live demo', 'notes': 'Check GPU memory'},
        {'problemStatementId': ps2.id, 'decisiveTest': 'Test PS2 latency', 'notes': 'Check round-trip time'},
    ]

    saved = save_draft_rubric(db, rnd, all_fields, 'admin1', guidance_payload=guidances)
    assert saved.version == 1
    assert len(saved.fields) == 6
    assert len(saved.guidances) == 2

    # Publish rubric should pass because general=60, ps1=40, ps2=40
    published = publish_rubric(db, rnd, 'admin1')
    assert published.publishedAt is not None

    # Test applicable_fields for team1 (selected ps1)
    team1_fields = applicable_fields(db, published, team1.id, require_ps=True)
    assert len(team1_fields) == 4
    ps_ids = {f.problemStatementId for f in team1_fields}
    assert ps_ids == {None, ps1.id}
    assert all(f.problemStatementId != ps2.id for f in team1_fields)

    # Test applicable_fields without PS
    team_no_ps = make_team(db, event, 'No PS Team', 'REG002')

    with pytest.raises(HTTPException) as exc:
        applicable_fields(db, published, team_no_ps.id, require_ps=True)
    assert exc.value.status_code == 409

    general_only = applicable_fields(db, published, team_no_ps.id, require_ps=False)
    assert len(general_only) == 2
    assert all(f.problemStatementId is None for f in general_only)

    # Test revise_rubric copies problemStatementId and guidances
    published.lockedAt = datetime.utcnow()
    db.commit()
    res = revise_rubric(db, rnd, mode="archive", confirm_text="", actor="admin1")
    assert res["newVersion"] == 2
    revised = (
        db.query(RubricVersion)
        .filter(RubricVersion.roundId == rnd.id, RubricVersion.version == 2)
        .first()
    )
    assert revised is not None
    assert len(revised.fields) == 6
    assert len(revised.guidances) == 2
    assert {g.problemStatementId for g in revised.guidances} == {ps1.id, ps2.id}

