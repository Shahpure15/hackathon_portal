"""add_panels_eval_rounds_discipline_and_missing_columns

Revision ID: 3a1b2c4d5e6f
Revises: c0e98027c0af
Create Date: 2026-08-14 22:42:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3a1b2c4d5e6f'
down_revision: Union[str, Sequence[str], None] = 'c0e98027c0af'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add missing columns to event_configs, team_members, teams, problem_statements
    # Check if column psGateCheckpointTypeId already exists on event_configs before adding
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    ec_cols = [c['name'] for c in inspector.get_columns('event_configs')]
    if 'psGateCheckpointTypeId' not in ec_cols and 'psgatecheckpointtypeid' not in ec_cols:
        op.add_column('event_configs', sa.Column('psGateCheckpointTypeId', sa.String(length=36), sa.ForeignKey('checkpoint_types.id', ondelete='SET NULL'), nullable=True))

    tm_cols = [c['name'] for c in inspector.get_columns('team_members')]
    if 'isTeamLeader' not in tm_cols and 'isteamleader' not in tm_cols:
        op.add_column('team_members', sa.Column('isTeamLeader', sa.Boolean(), nullable=False, server_default='false'))

    t_cols = [c['name'] for c in inspector.get_columns('teams')]
    if 'deskNumber' not in t_cols and 'desknumber' not in t_cols:
        op.add_column('teams', sa.Column('deskNumber', sa.String(length=20), nullable=True))
    if 'category' not in t_cols:
        op.add_column('teams', sa.Column('category', sa.String(length=50), nullable=False, server_default='engineering'))

    ps_cols = [c['name'] for c in inspector.get_columns('problem_statements')]
    if 'discipline' not in ps_cols:
        op.add_column('problem_statements', sa.Column('discipline', sa.String(length=50), nullable=True))

    # 2. Create panels table
    tables = inspector.get_table_names()
    if 'panels' not in tables:
        op.create_table(
            'panels',
            sa.Column('id', sa.String(length=36), primary_key=True),
            sa.Column('eventId', sa.String(length=36), sa.ForeignKey('events.id', ondelete='CASCADE'), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('facultyMemberName', sa.String(length=255), nullable=True),
            sa.Column('memberNames', sa.JSON(), nullable=False),
            sa.Column('problemStatementId', sa.String(length=36), sa.ForeignKey('problem_statements.id', ondelete='SET NULL'), nullable=True, unique=True),
            sa.UniqueConstraint('eventId', 'name', name='uq_panel_event_name')
        )

    # 3. Create evaluation_rounds table
    if 'evaluation_rounds' not in tables:
        op.create_table(
            'evaluation_rounds',
            sa.Column('id', sa.String(length=36), primary_key=True),
            sa.Column('eventId', sa.String(length=36), sa.ForeignKey('events.id', ondelete='CASCADE'), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('roundNumber', sa.Integer(), nullable=False),
            sa.Column('isSubmissionOpen', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('createdAt', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint('eventId', 'roundNumber', name='uq_round_event_number')
        )

    # 4. Create submissions table
    if 'submissions' not in tables:
        op.create_table(
            'submissions',
            sa.Column('id', sa.String(length=36), primary_key=True),
            sa.Column('teamId', sa.String(length=36), sa.ForeignKey('teams.id', ondelete='CASCADE'), nullable=False),
            sa.Column('roundId', sa.String(length=36), sa.ForeignKey('evaluation_rounds.id', ondelete='CASCADE'), nullable=False),
            sa.Column('driveLink', sa.String(length=500), nullable=True),
            sa.Column('githubLink', sa.String(length=500), nullable=True),
            sa.Column('submittedAt', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('updatedAt', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint('teamId', 'roundId', name='uq_submission_team_round')
        )


def downgrade() -> None:
    op.drop_table('submissions')
    op.drop_table('evaluation_rounds')
    op.drop_table('panels')
    op.drop_column('problem_statements', 'discipline')
    op.drop_column('teams', 'category')
    op.drop_column('teams', 'deskNumber')
    op.drop_column('team_members', 'isTeamLeader')
    op.drop_column('event_configs', 'psGateCheckpointTypeId')
