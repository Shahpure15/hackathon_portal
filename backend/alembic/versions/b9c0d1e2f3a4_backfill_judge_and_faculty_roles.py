"""Backfill judge and faculty role assignments

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
Create Date: 2026-10-20 20:15:00.000000

"""
from typing import Sequence, Union
import uuid
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b9c0d1e2f3a4'
down_revision: Union[str, Sequence[str], None] = 'a8b9c0d1e2f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = [t.lower() for t in insp.get_table_names()]

    if 'user_role_assignments' not in tables or 'roles' not in tables or 'users' not in tables:
        return

    user_role_assignments_table = sa.table(
        'user_role_assignments',
        sa.column('id', sa.String(36)),
        sa.column('eventId', sa.String(36)),
        sa.column('userId', sa.String(36)),
        sa.column('roleId', sa.String(36)),
        sa.column('scope', sa.JSON()),
        sa.column('createdBy', sa.String(100)),
    )

    # 1. Backfill JUDGE users
    judge_users = bind.execute(
        sa.text('''
            SELECT u.id, u."eventId"
            FROM users u
            LEFT JOIN volunteers v ON u."volunteerId" = v.id
            WHERE (CAST(u.role AS VARCHAR) = 'JUDGE' OR CAST(v.type AS VARCHAR) = 'JUDGE')
              AND u."eventId" IS NOT NULL
        ''')
    ).fetchall()

    for u in judge_users:
        user_id, event_id = u[0], u[1]
        j_role = bind.execute(
            sa.text('SELECT id FROM roles WHERE "eventId" = :eid AND ("systemKey" = :sk OR name = :name)'),
            {'eid': event_id, 'sk': 'judge', 'name': 'Judge'},
        ).first()

        if j_role:
            j_role_id = j_role[0]
            existing_assignment = bind.execute(
                sa.text('SELECT id FROM user_role_assignments WHERE "userId" = :uid AND "eventId" = :eid'),
                {'uid': user_id, 'eid': event_id},
            ).first()

            if not existing_assignment:
                bind.execute(
                    user_role_assignments_table.insert().values(
                        id=str(uuid.uuid4()),
                        eventId=event_id,
                        userId=user_id,
                        roleId=j_role_id,
                        scope={'teams': {'mode': 'all', 'ids': []}},
                        createdBy='MIGRATION_BACKFILL',
                    )
                )

    # 2. Backfill FACULTY users
    faculty_users = bind.execute(
        sa.text('''
            SELECT u.id, u."eventId"
            FROM users u
            LEFT JOIN volunteers v ON u."volunteerId" = v.id
            WHERE (CAST(u.role AS VARCHAR) = 'FACULTY' OR CAST(v.type AS VARCHAR) = 'FACULTY')
              AND u."eventId" IS NOT NULL
        ''')
    ).fetchall()

    for u in faculty_users:
        user_id, event_id = u[0], u[1]
        f_role = bind.execute(
            sa.text('SELECT id FROM roles WHERE "eventId" = :eid AND ("systemKey" = :sk OR name = :name)'),
            {'eid': event_id, 'sk': 'faculty', 'name': 'Faculty Lead'},
        ).first()

        if f_role:
            f_role_id = f_role[0]
            existing_assignment = bind.execute(
                sa.text('SELECT id FROM user_role_assignments WHERE "userId" = :uid AND "eventId" = :eid'),
                {'uid': user_id, 'eid': event_id},
            ).first()

            if not existing_assignment:
                bind.execute(
                    user_role_assignments_table.insert().values(
                        id=str(uuid.uuid4()),
                        eventId=event_id,
                        userId=user_id,
                        roleId=f_role_id,
                        scope={'teams': {'mode': 'all', 'ids': []}},
                        createdBy='MIGRATION_BACKFILL',
                    )
                )


def downgrade() -> None:
    pass
