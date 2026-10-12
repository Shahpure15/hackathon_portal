import datetime
from pathlib import Path
import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

pytestmark = pytest.mark.postgres

ROOT = Path(__file__).resolve().parent.parent.parent
ALEMBIC_INI = str(ROOT / "alembic.ini")


def get_cfg(url: str) -> Config:
    cfg = Config(ALEMBIC_INI)
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


def reset_schema(engine):
    with engine.connect() as conn:
        conn.execute(sa.text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
        conn.commit()


def fill_row(table_name: str, conn, insp, overrides: dict = None) -> dict:
    """Generic filler that inspects table columns and provides default values for NOT NULL columns."""
    row = {}
    cols = insp.get_columns(table_name)
    now = datetime.datetime.utcnow()

    for col in cols:
        name = col["name"]
        if overrides and name in overrides:
            row[name] = overrides[name]
            continue
        if col.get("nullable", True) and col.get("default") is None:
            continue

        c_type = col["type"]
        if isinstance(c_type, sa.String):
            length = getattr(c_type, "length", 36) or 36
            row[name] = f"test_{name}"[:length]
        elif isinstance(c_type, (sa.Integer, sa.SmallInteger, sa.BigInteger)):
            row[name] = 1
        elif isinstance(c_type, sa.Boolean):
            row[name] = True
        elif isinstance(c_type, sa.DateTime):
            row[name] = now
        elif isinstance(c_type, sa.JSON):
            row[name] = {}
        elif isinstance(c_type, sa.Numeric):
            row[name] = 0
        else:
            row[name] = f"val_{name}"

    if overrides:
        for k, v in overrides.items():
            row[k] = v

    col_names = list(row.keys())
    placeholders = [f":{c}" for c in col_names]
    quoted_cols = [f'"{c}"' for c in col_names]
    sql = f'INSERT INTO "{table_name}" ({", ".join(quoted_cols)}) VALUES ({", ".join(placeholders)})'
    conn.execute(sa.text(sql), row)
    return row


def test_postgres_upgrade_head_on_empty_db(pg_url):
    engine = sa.create_engine(pg_url)
    reset_schema(engine)
    cfg = get_cfg(pg_url)

    command.upgrade(cfg, "head")

    with engine.connect() as conn:
        insp = sa.inspect(conn)
        tables = [t.lower() for t in insp.get_table_names()]
        assert "events" in tables
        assert "users" in tables
        assert "volunteer_attendance_records" in tables
        assert "result_releases" in tables
        assert "notifications" in tables


def test_postgres_old_head_preservation(pg_url):
    engine = sa.create_engine(pg_url)
    reset_schema(engine)
    cfg = get_cfg(pg_url)

    # 1. Upgrade to old head 7c5d4e3f2a1b
    command.upgrade(cfg, "7c5d4e3f2a1b")

    # 2. Insert test data
    with engine.connect() as conn:
        insp = sa.inspect(conn)
        ev = fill_row("events", conn, insp, {"id": "ev-01", "name": "Preserve Event"})
        fill_row("event_configs", conn, insp, {"id": "cfg-01", "eventId": ev["id"]})

        fill_row("users", conn, insp, {"id": "u-admin", "eventId": ev["id"], "username": "adm", "role": "ADMIN"})
        vol_user = fill_row("users", conn, insp, {"id": "u-vol", "eventId": ev["id"], "username": "v_user", "role": "VOLUNTEER"})
        fill_row("users", conn, insp, {"id": "u-lead", "eventId": ev["id"], "username": "l_user", "role": "LEADER"})

        fill_row("volunteers", conn, insp, {"id": "vol-01", "eventId": ev["id"], "name": "Vol One"})
        fill_row("teams", conn, insp, {"id": "team-01", "eventId": ev["id"], "name": "Team One", "registrationId": "REG-01"})
        fill_row("evaluation_rounds", conn, insp, {
            "id": "round-01", 
            "eventId": ev["id"], 
            "roundNumber": 1, 
            "name": "Round 1",
            "isSubmissionOpen": True
        })
        conn.commit()

    # 3. Upgrade to head
    command.upgrade(cfg, "head")

    # 4. Assert row counts unchanged, data backfilled & transformed correctly
    with engine.connect() as conn:
        insp = sa.inspect(conn)
        ev_count = conn.execute(sa.text("SELECT COUNT(*) FROM events")).scalar()
        u_count = conn.execute(sa.text("SELECT COUNT(*) FROM users")).scalar()
        t_count = conn.execute(sa.text("SELECT COUNT(*) FROM teams")).scalar()
        assert ev_count == 1
        assert u_count == 3
        assert t_count == 1

        ev_row = conn.execute(sa.text('SELECT "orgId", "status" FROM events WHERE id = :id'), {"id": "ev-01"}).mappings().one()
        assert ev_row["orgId"] is not None
        assert ev_row["status"] == "active"

        cfg_row = conn.execute(sa.text('SELECT "features" FROM event_configs WHERE id = :id'), {"id": "cfg-01"}).mappings().one()
        assert cfg_row["features"] is not None

        # Volunteer user holds exactly one assignment to Volunteer role
        vol_assignments = conn.execute(
            sa.text('SELECT COUNT(*) FROM user_role_assignments WHERE "userId" = :uid'),
            {"uid": vol_user["id"]}
        ).scalar()
        assert vol_assignments == 1

        # Evaluation round transformed
        r_row = conn.execute(
            sa.text('SELECT "submissionEnabled", "evaluationEnabled", "isSubmissionOpen" FROM evaluation_rounds WHERE id = :id'),
            {"id": "round-01"}
        ).mappings().one()
        assert r_row["submissionEnabled"] is True
        assert r_row["evaluationEnabled"] is False
        assert r_row["isSubmissionOpen"] is True


def test_postgres_single_alembic_head(pg_url):
    cfg = get_cfg(pg_url)
    script = ScriptDirectory.from_config(cfg)
    heads = script.get_heads()
    assert len(heads) == 1, f"Expected exactly 1 Alembic head revision, found {len(heads)}: {heads}"
