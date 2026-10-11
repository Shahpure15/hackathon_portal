import os
from pathlib import Path
import tempfile
import uuid
from decimal import Decimal
import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from app.config import settings
from app.models import EvaluationRound, RubricField, RubricVersion
from tests.factories import make_org_event

ROOT = Path(__file__).resolve().parent.parent
ALEMBIC_INI = str(ROOT / 'alembic.ini')


def test_rounds_models_smoke(db):
    event = make_org_event(db, name='Rounds Test Event')

    rnd = EvaluationRound(
        eventId=event.id,
        name='Round 1 - Technical Evaluation',
        roundNumber=1,
        description='Evaluate tech stack and code architecture',
        fields=[{'name': 'repo_link', 'type': 'link'}],
        isSubmissionOpen=True,
        status='live',
        submissionEnabled=True,
        evaluationEnabled=True,
        aggregation='trimmed_mean',
        trimCount=1,
        totalScale=50,
        currentRubricVersion=1,
    )
    db.add(rnd)
    db.flush()

    rubric_ver = RubricVersion(
        eventId=event.id,
        roundId=rnd.id,
        version=1,
        reason='initial',
        createdBy='admin_user',
    )
    db.add(rubric_ver)
    db.flush()

    f1 = RubricField(
        eventId=event.id,
        rubricVersionId=rubric_ver.id,
        fieldKey=str(uuid.uuid4()),
        type='numeric',
        label='Code Quality',
        description='Adherence to best practices',
        sortOrder=1,
        isRequired=True,
        maxMarks=Decimal('20.00'),
        weight=Decimal('50.00'),
        anchors=[{'from': 0, 'to': 10, 'label': 'Basic'}, {'from': 11, 'to': 20, 'label': 'Production Ready'}],
    )
    f2 = RubricField(
        eventId=event.id,
        rubricVersionId=rubric_ver.id,
        fieldKey=str(uuid.uuid4()),
        type='text',
        label='Judge Feedback',
        description='Constructive notes for participants',
        sortOrder=2,
        isRequired=False,
        visibility='participant',
        maxLength=500,
    )
    db.add_all([f1, f2])
    db.commit()

    loaded_round = db.query(EvaluationRound).filter(EvaluationRound.id == rnd.id).first()
    assert loaded_round is not None
    assert loaded_round.submissionEnabled is True
    assert loaded_round.evaluationEnabled is True
    assert loaded_round.totalScale == 50
    assert len(loaded_round.rubricVersions) == 1

    loaded_ver = loaded_round.rubricVersions[0]
    assert loaded_ver.version == 1
    assert len(loaded_ver.fields) == 2
    assert loaded_ver.fields[0].label == 'Code Quality'
    assert loaded_ver.fields[0].maxMarks == Decimal('20.00')


@pytest.mark.xfail(
    reason="Pre-existing migration 3a1b2c4d5e6f calls op.add_column with sa.ForeignKey outside batch_alter_table: NotImplementedError on SQLite",
    strict=False,
)
def test_rounds_data_preservation_and_migration(monkeypatch):
    fd, tmp_path = tempfile.mkstemp(prefix="alembic_p2_", suffix=".db")
    os.close(fd)
    try:
        sqlite_url = f"sqlite:///{tmp_path}"
        monkeypatch.setattr(settings, 'DATABASE_URL', sqlite_url)
        cfg = Config(ALEMBIC_INI)
        cfg.set_main_option("sqlalchemy.url", sqlite_url)

        # 1. Upgrade to previous head (P1-C04)
        command.upgrade(cfg, "795a68c4c84f")

        # 2. Insert event and existing round
        eng = sa.create_engine(sqlite_url)
        with eng.begin() as conn:
            org_id = str(uuid.uuid4())
            conn.execute(
                sa.text("INSERT INTO organizations (id, name, slug) VALUES (:id, 'Default', 'default')"),
                {'id': org_id},
            )
            event_id = str(uuid.uuid4())
            conn.execute(
                sa.text("INSERT INTO events (id, name, \"startDate\", \"endDate\", \"isActive\", status, \"orgId\") VALUES (:id, 'Test Event', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 'active', :orgId)"),
                {'id': event_id, 'orgId': org_id},
            )
            round_id = str(uuid.uuid4())
            conn.execute(
                sa.text("""
                    INSERT INTO evaluation_rounds (id, "eventId", name, "roundNumber", fields, "isSubmissionOpen", "createdAt")
                    VALUES (:id, :eid, 'Existing Round', NULL, '[{"name": "repo", "type": "text"}]', 1, CURRENT_TIMESTAMP)
                """),
                {'id': round_id, 'eid': event_id},
            )
        eng.dispose()

        # 3. Upgrade to head (P2-C02)
        command.upgrade(cfg, "head")

        eng = sa.create_engine(sqlite_url)
        with eng.begin() as conn:
            row = conn.execute(
                sa.text('SELECT name, fields, "isSubmissionOpen", "roundNumber", status, "submissionEnabled", "evaluationEnabled", aggregation, "totalScale" FROM evaluation_rounds WHERE id = :id'),
                {'id': round_id},
            ).first()

            assert row is not None
            assert row[0] == 'Existing Round'
            assert 'repo' in str(row[1])
            assert row[2] == 1 or row[2] is True
            # Backfilled roundNumber
            assert row[3] == 1
            # Default columns
            assert row[4] == 'live'
            assert row[5] == 1 or row[5] is True
            assert row[6] == 0 or row[6] is False
            assert row[7] == 'mean'
            assert row[8] == 100

            # Verify tables exist
            insp = sa.inspect(conn)
            tables = insp.get_table_names()
            assert 'rubric_versions' in tables
            assert 'rubric_fields' in tables
        eng.dispose()

        # 4. Reversibility (downgrade -1)
        command.downgrade(cfg, "-1")
        eng = sa.create_engine(sqlite_url)
        with eng.begin() as conn:
            insp = sa.inspect(conn)
            tables = insp.get_table_names()
            assert 'rubric_versions' not in tables
            assert 'rubric_fields' not in tables
        eng.dispose()

        # 5. Re-run safety (upgrade head again)
        command.upgrade(cfg, "head")
        eng = sa.create_engine(sqlite_url)
        with eng.begin() as conn:
            insp = sa.inspect(conn)
            tables = insp.get_table_names()
            assert 'rubric_versions' in tables
            assert 'rubric_fields' in tables
        eng.dispose()

    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
