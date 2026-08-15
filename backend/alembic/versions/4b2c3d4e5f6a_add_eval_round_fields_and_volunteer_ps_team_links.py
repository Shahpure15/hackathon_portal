"""add_eval_round_fields_and_volunteer_ps_team_links

Revision ID: 4b2c3d4e5f6a
Revises: 3a1b2c4d5e6f
Create Date: 2026-08-15 12:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '4b2c3d4e5f6a'
down_revision: Union[str, Sequence[str], None] = '3a1b2c4d5e6f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # 1. evaluation_rounds
    er_cols = [c['name'] for c in inspector.get_columns('evaluation_rounds')]
    if 'description' not in er_cols:
        op.add_column('evaluation_rounds', sa.Column('description', sa.Text(), nullable=True))
    if 'fields' not in er_cols:
        op.add_column('evaluation_rounds', sa.Column('fields', sa.JSON(), nullable=True, server_default='[]'))

    # 2. submissions
    sub_cols = [c['name'] for c in inspector.get_columns('submissions')]
    if 'answers' not in sub_cols:
        op.add_column('submissions', sa.Column('answers', sa.JSON(), nullable=True, server_default='{}'))

    # 3. volunteers
    vol_cols = [c['name'] for c in inspector.get_columns('volunteers')]
    if 'remarks' not in vol_cols:
        op.add_column('volunteers', sa.Column('remarks', sa.Text(), nullable=True))
    if 'problemStatementId' not in vol_cols and 'problemstatementid' not in vol_cols:
        op.add_column('volunteers', sa.Column('problemStatementId', sa.String(length=36), sa.ForeignKey('problem_statements.id', ondelete='SET NULL'), nullable=True))
    if 'teamId' not in vol_cols and 'teamid' not in vol_cols:
        op.add_column('volunteers', sa.Column('teamId', sa.String(length=36), sa.ForeignKey('teams.id', ondelete='SET NULL'), nullable=True))
    
    # Drop any legacy check constraint on volunteers.type (allowing custom/new roles JUDGE, STUDENT_COORDINATOR, etc.)
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
    
    # 4. event_configs
    ec_cols = [c['name'] for c in inspector.get_columns('event_configs')]
    if 'peopleRoles' not in ec_cols and 'peopleroles' not in ec_cols:
        op.add_column('event_configs', sa.Column('peopleRoles', sa.JSON(), nullable=True, server_default='[]'))


def downgrade() -> None:
    op.drop_column('event_configs', 'peopleRoles')
    op.drop_column('volunteers', 'teamId')
    op.drop_column('volunteers', 'problemStatementId')
    op.drop_column('volunteers', 'remarks')
    op.drop_column('submissions', 'answers')
    op.drop_column('evaluation_rounds', 'fields')
    op.drop_column('evaluation_rounds', 'description')
