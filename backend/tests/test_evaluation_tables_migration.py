from decimal import Decimal
import os
from pathlib import Path
import tempfile
import uuid
import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.models import (
    EvaluationRound,
    RubricVersion,
    RubricField,
    JudgeAssignment,
    Evaluation,
    EvaluationVersion,
    EvaluationScore,
    EvaluationText,
)
from tests.factories import make_org_event, make_volunteer, make_team

ROOT = Path(__file__).resolve().parent.parent
ALEMBIC_INI = str(ROOT / 'alembic.ini')


@pytest.fixture
def eval_setup(db):
    event = make_org_event(db, name="Eval Test Event")
    judge_vol = make_volunteer(db, event, name="Judge One", type="JUDGE")
    team = make_team(db, event, name="Team Alpha", registration_id="REG-EVAL-01")

    round_row = EvaluationRound(
        eventId=event.id,
        name="Round Eval",
        roundNumber=1,
        submissionEnabled=True,
        evaluationEnabled=True,
    )
    db.add(round_row)
    db.flush()

    rubric_ver = RubricVersion(
        eventId=event.id,
        roundId=round_row.id,
        version=1,
        reason="initial",
        createdBy="admin",
    )
    db.add(rubric_ver)
    db.flush()

    rf_num = RubricField(
        eventId=event.id,
        rubricVersionId=rubric_ver.id,
        fieldKey=str(uuid.uuid4()),
        type="numeric",
        label="Innovation",
        maxMarks=Decimal("20.00"),
        weight=Decimal("50.00"),
    )
    rf_txt = RubricField(
        eventId=event.id,
        rubricVersionId=rubric_ver.id,
        fieldKey=str(uuid.uuid4()),
        type="text",
        label="Feedback",
        visibility="participant",
    )
    db.add_all([rf_num, rf_txt])
    db.commit()
    return event, judge_vol, team, round_row, rubric_ver, rf_num, rf_txt


def test_evaluation_tables_and_cascade(db, eval_setup):
    event, judge_vol, team, round_row, rubric_ver, rf_num, rf_txt = eval_setup

    assignment = JudgeAssignment(
        eventId=event.id,
        roundId=round_row.id,
        teamId=team.id,
        judgeVolunteerId=judge_vol.id,
        source="manual",
        status="active",
    )
    db.add(assignment)
    db.commit()

    evaluation = Evaluation(
        eventId=event.id,
        roundId=round_row.id,
        teamId=team.id,
        judgeVolunteerId=judge_vol.id,
    )
    db.add(evaluation)
    db.commit()

    v1 = EvaluationVersion(
        eventId=event.id,
        evaluationId=evaluation.id,
        version=1,
        rubricVersionId=rubric_ver.id,
        status="final",
        totalPct=Decimal("85.000"),
    )
    db.add(v1)
    db.flush()

    s1 = EvaluationScore(versionId=v1.id, fieldId=rf_num.id, marks=Decimal("17.00"))
    t1 = EvaluationText(versionId=v1.id, fieldId=rf_txt.id, value="Great job!")
    db.add_all([s1, t1])
    db.commit()

    # Query back
    q_eval = db.query(Evaluation).filter(Evaluation.id == evaluation.id).first()
    assert q_eval is not None
    assert len(q_eval.versions) == 1
    assert q_eval.versions[0].scores[0].marks == Decimal("17.00")
    assert q_eval.versions[0].texts[0].value == "Great job!"

    # Cascade delete evaluation
    eval_id = evaluation.id
    v1_id = v1.id
    db.delete(q_eval)
    db.commit()

    assert db.query(Evaluation).filter(Evaluation.id == eval_id).first() is None
    assert db.query(EvaluationVersion).filter(EvaluationVersion.id == v1_id).first() is None
    assert db.query(EvaluationScore).filter(EvaluationScore.versionId == v1_id).first() is None
    assert db.query(EvaluationText).filter(EvaluationText.versionId == v1_id).first() is None


def test_partial_unique_indexes_draft_and_final(db, eval_setup):
    event, judge_vol, team, round_row, rubric_ver, rf_num, rf_txt = eval_setup

    evaluation = Evaluation(
        eventId=event.id,
        roundId=round_row.id,
        teamId=team.id,
        judgeVolunteerId=judge_vol.id,
    )
    db.add(evaluation)
    db.commit()

    # 1. Allow one final and one draft
    v_final = EvaluationVersion(
        eventId=event.id,
        evaluationId=evaluation.id,
        version=1,
        rubricVersionId=rubric_ver.id,
        status="final",
        totalPct=Decimal("80.000"),
    )
    v_draft = EvaluationVersion(
        eventId=event.id,
        evaluationId=evaluation.id,
        version=2,
        rubricVersionId=rubric_ver.id,
        status="draft",
    )
    db.add_all([v_final, v_draft])
    db.commit()

    # 2. Rejecting a second draft
    v_draft2 = EvaluationVersion(
        eventId=event.id,
        evaluationId=evaluation.id,
        version=3,
        rubricVersionId=rubric_ver.id,
        status="draft",
    )
    db.add(v_draft2)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    # 3. Rejecting a second final
    v_final2 = EvaluationVersion(
        eventId=event.id,
        evaluationId=evaluation.id,
        version=4,
        rubricVersionId=rubric_ver.id,
        status="final",
        totalPct=Decimal("90.000"),
    )
    db.add(v_final2)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


@pytest.mark.xfail(
    reason="Pre-existing migration 3a1b2c4d5e6f calls op.add_column with sa.ForeignKey outside batch_alter_table: NotImplementedError on SQLite",
    strict=False,
)
def test_evaluation_migration_reversibility(monkeypatch):
    fd, tmp_path = tempfile.mkstemp(prefix="alembic_p3_c03_", suffix=".db")
    os.close(fd)
    try:
        sqlite_url = f"sqlite:///{tmp_path}"
        monkeypatch.setattr(settings, 'DATABASE_URL', sqlite_url)
        cfg = Config(ALEMBIC_INI)
        cfg.set_main_option("sqlalchemy.url", sqlite_url)

        # 1. Upgrade to previous head (P3-C02: e5a8f81a9eb9)
        command.upgrade(cfg, "e5a8f81a9eb9")

        # 2. Upgrade to P3-C03 head
        command.upgrade(cfg, "9b6e617bb694")

        # 3. Verify tables exist
        eng = sa.create_engine(sqlite_url)
        insp = sa.inspect(eng)
        tables = set(insp.get_table_names())
        assert "judge_assignments" in tables
        assert "evaluations" in tables
        assert "evaluation_versions" in tables
        assert "evaluation_scores" in tables
        assert "evaluation_texts" in tables

        # 4. Downgrade to e5a8f81a9eb9
        eng.dispose()
        command.downgrade(cfg, "e5a8f81a9eb9")

        eng2 = sa.create_engine(sqlite_url)
        insp2 = sa.inspect(eng2)
        tables2 = set(insp2.get_table_names())
        assert "judge_assignments" not in tables2
        assert "evaluations" not in tables2
        assert "evaluation_versions" not in tables2
        eng2.dispose()

        # 5. Re-upgrade
        command.upgrade(cfg, "9b6e617bb694")
    finally:
        if os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
