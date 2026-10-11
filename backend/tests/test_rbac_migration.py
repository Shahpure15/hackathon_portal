import os
from pathlib import Path
import tempfile
import uuid
import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from app.config import settings
from app.models import RbacRole, Role, RolePermission, RoleTemplate, UserRoleAssignment
from app.permissions import SEED_ROLES
from tests.factories import make_org_event, make_user, make_volunteer

ROOT = Path(__file__).resolve().parent.parent
ALEMBIC_INI = str(ROOT / 'alembic.ini')


def test_rbac_models_smoke(db):
    event = make_org_event(db, name='RBAC Event')
    user = make_user(db, event, Role.VOLUNTEER, username='vol_test')

    role = RbacRole(
        eventId=event.id,
        name='Custom Staff',
        description='Custom role description',
        isSystem=False,
    )
    db.add(role)
    db.flush()

    perm = RolePermission(roleId=role.id, permissionKey='team.view')
    db.add(perm)

    assignment = UserRoleAssignment(
        eventId=event.id,
        userId=user.id,
        roleId=role.id,
        scope={'teams': {'mode': 'all', 'ids': []}},
    )
    db.add(assignment)

    template = RoleTemplate(
        orgId=event.orgId,
        name='Staff Template',
        permissions=['team.view'],
    )
    db.add(template)
    db.commit()

    loaded_role = db.query(RbacRole).filter(RbacRole.id == role.id).first()
    assert loaded_role is not None
    assert len(loaded_role.permissions) == 1
    assert loaded_role.permissions[0].permissionKey == 'team.view'
    assert len(loaded_role.assignments) == 1

    loaded_tmpl = db.query(RoleTemplate).filter(RoleTemplate.id == template.id).first()
    assert loaded_tmpl is not None
    assert loaded_tmpl.permissions == ['team.view']


def test_migration_seed_constants_match_app_permissions():
    import importlib.util
    mig_path = ROOT / 'alembic' / 'versions' / '795a68c4c84f_p1_c04_rbac_tables_and_seeds.py'
    spec = importlib.util.spec_from_file_location('p1_c04_migration', mig_path)
    mig = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mig)
    assert set(mig.VOLUNTEER_PERMS) == set(SEED_ROLES['volunteer']['permissions'])
    assert set(mig.JUDGE_PERMS) == set(SEED_ROLES['judge']['permissions'])


@pytest.mark.xfail(
    reason="Pre-existing migration 3a1b2c4d5e6f calls op.add_column with sa.ForeignKey outside batch_alter_table: NotImplementedError on SQLite",
    strict=False,
)
def test_rbac_migration_seeds_and_backfill(monkeypatch):
    fd, tmp_path = tempfile.mkstemp(prefix="alembic_p1_", suffix=".db")
    os.close(fd)
    try:
        sqlite_url = f"sqlite:///{tmp_path}"
        monkeypatch.setattr(settings, 'DATABASE_URL', sqlite_url)
        cfg = Config(ALEMBIC_INI)
        cfg.set_main_option("sqlalchemy.url", sqlite_url)

        # 1. Upgrade to previous head
        command.upgrade(cfg, "8d6e5f4a3b2c")

        # 2. Raw insert event and users
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
            v_user_id = str(uuid.uuid4())
            conn.execute(
                sa.text("INSERT INTO users (id, \"eventId\", username, \"passwordHash\", role, status) VALUES (:id, :eid, 'vol_seed', 'hash', 'VOLUNTEER', 'active')"),
                {'id': v_user_id, 'eid': event_id},
            )
            a_user_id = str(uuid.uuid4())
            conn.execute(
                sa.text("INSERT INTO users (id, \"eventId\", username, \"passwordHash\", role, status) VALUES (:id, :eid, 'admin_seed', 'hash', 'ADMIN', 'active')"),
                {'id': a_user_id, 'eid': event_id},
            )
        eng.dispose()

        # 3. Upgrade to head (P1-C04 migration)
        command.upgrade(cfg, "head")

        eng = sa.create_engine(sqlite_url)
        with eng.begin() as conn:
            # Check system roles
            roles = conn.execute(
                sa.text("SELECT id, name, \"systemKey\", \"isSystem\" FROM roles WHERE \"eventId\" = :eid"),
                {'eid': event_id},
            ).fetchall()
            assert len(roles) == 2, f"Expected exactly 2 system roles per event, got {len(roles)}"

            vol_role = next(r for r in roles if r[2] == 'volunteer')
            perms = conn.execute(
                sa.text("SELECT \"permissionKey\" FROM role_permissions WHERE \"roleId\" = :rid"),
                {'rid': vol_role[0]},
            ).fetchall()
            perm_keys = {p[0] for p in perms}
            assert perm_keys == set(SEED_ROLES['volunteer']['permissions'])

            # Check user role assignments
            v_assignments = conn.execute(
                sa.text("SELECT \"roleId\", scope FROM user_role_assignments WHERE \"userId\" = :uid"),
                {'uid': v_user_id},
            ).fetchall()
            assert len(v_assignments) == 1
            assert v_assignments[0][0] == vol_role[0]

            a_assignments = conn.execute(
                sa.text("SELECT id FROM user_role_assignments WHERE \"userId\" = :uid"),
                {'uid': a_user_id},
            ).fetchall()
            assert len(a_assignments) == 0

            # Check templates
            templates = conn.execute(
                sa.text("SELECT name FROM role_templates WHERE \"orgId\" = :oid"),
                {'oid': org_id},
            ).fetchall()
            assert len(templates) == 2

        eng.dispose()

        # Re-running is a no-op
        command.upgrade(cfg, "head")

        # Downgrade and upgrade work
        command.downgrade(cfg, "8d6e5f4a3b2c")
        command.upgrade(cfg, "head")

    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
