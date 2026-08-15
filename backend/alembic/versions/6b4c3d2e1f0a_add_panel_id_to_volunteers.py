"""add_panel_id_to_volunteers

Revision ID: 6b4c3d2e1f0a
Revises: 5c3d4e5f6a7b
Create Date: 2026-08-15 16:40:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '6b4c3d2e1f0a'
down_revision: Union[str, Sequence[str], None] = '5c3d4e5f6a7b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    vol_cols = [c['name'] for c in inspector.get_columns('volunteers')]
    if 'panelId' not in vol_cols and 'panelid' not in vol_cols:
        op.add_column('volunteers', sa.Column('panelId', sa.String(length=36), sa.ForeignKey('panels.id', ondelete='SET NULL'), nullable=True))


def downgrade() -> None:
    op.drop_column('volunteers', 'panelId')
