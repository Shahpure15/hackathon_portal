import os
import tempfile
from pathlib import Path
import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

from app.config import settings

ROOT = Path(__file__).resolve().parent.parent
ALEMBIC_INI = str(ROOT / 'alembic.ini')


def test_single_alembic_head():
    cfg = Config(ALEMBIC_INI)
    script = ScriptDirectory.from_config(cfg)
    heads = script.get_heads()
    assert len(heads) == 1, f"Expected exactly one Alembic head, found: {heads}"


@pytest.mark.xfail(
    reason="Pre-existing migration 3a1b2c4d5e6f calls op.add_column with sa.ForeignKey outside batch_alter_table: NotImplementedError on SQLite",
    strict=False
)
def test_upgrade_fresh_sqlite(monkeypatch):
    fd, tmp_path = tempfile.mkstemp(prefix="alembic_test_", suffix=".db")
    os.close(fd)
    try:
        sqlite_url = f"sqlite:///{tmp_path}"
        monkeypatch.setattr(settings, 'DATABASE_URL', sqlite_url)
        cfg = Config(ALEMBIC_INI)
        cfg.set_main_option("sqlalchemy.url", sqlite_url)
        command.upgrade(cfg, 'head')
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
