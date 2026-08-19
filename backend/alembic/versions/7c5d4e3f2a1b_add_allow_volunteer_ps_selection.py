"""add_allow_volunteer_ps_selection
 
Revision ID: 7c5d4e3f2a1b
Revises: 6b4c3d2e1f0a
Create Date: 2026-08-19 21:50:00.000000
 
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
 
 
revision: str = '7c5d4e3f2a1b'
down_revision: Union[str, Sequence[str], None] = '6b4c3d2e1f0a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None
 
 
def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
 
    config_cols = [c['name'].lower() for c in inspector.get_columns('event_configs')]
    if 'allowvolunteerpsselection' not in config_cols:
        op.add_column('event_configs', sa.Column('allowVolunteerPsSelection', sa.Boolean(), server_default='0', nullable=False))
 
 
def downgrade() -> None:
    op.drop_column('event_configs', 'allowVolunteerPsSelection')
