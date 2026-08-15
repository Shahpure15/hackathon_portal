"""drop_volunteer_type_check_constraint

Revision ID: 5c3d4e5f6a7b
Revises: 4b2c3d4e5f6a
Create Date: 2026-08-15 13:50:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '5c3d4e5f6a7b'
down_revision: Union[str, Sequence[str], None] = '4b2c3d4e5f6a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    try:
        constraints = inspector.get_check_constraints('volunteers')
        for c in constraints:
            c_name = c['name']
            if 'type' in c_name.lower() or 'enum' in c_name.lower():
                op.drop_constraint(c_name, 'volunteers', type_='check')
    except Exception:
        pass

    try:
        op.execute(sa.text("ALTER TABLE volunteers DROP CONSTRAINT IF EXISTS volunteers_type_check;"))
        op.execute(sa.text("ALTER TABLE volunteers DROP CONSTRAINT IF EXISTS type_check;"))
    except Exception:
        pass


def downgrade() -> None:
    pass
