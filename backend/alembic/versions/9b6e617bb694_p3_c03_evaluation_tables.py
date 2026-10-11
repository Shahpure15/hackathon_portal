"""P3-C03 evaluation tables

Revision ID: 9b6e617bb694
Revises: e5a8f81a9eb9
Create Date: 2026-10-11 22:15:20.123456

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9b6e617bb694'
down_revision: Union[str, Sequence[str], None] = 'e5a8f81a9eb9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = set(inspector.get_table_names())

    # 1. judge_assignments
    if 'judge_assignments' not in existing_tables:
        op.create_table(
            'judge_assignments',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('eventId', sa.String(36), sa.ForeignKey('events.id', name='fk_judge_assignments_eventId_events', ondelete='CASCADE'), nullable=False),
            sa.Column('roundId', sa.String(36), sa.ForeignKey('evaluation_rounds.id', name='fk_judge_assignments_roundId_rounds', ondelete='CASCADE'), nullable=False),
            sa.Column('teamId', sa.String(36), sa.ForeignKey('teams.id', name='fk_judge_assignments_teamId_teams', ondelete='CASCADE'), nullable=False),
            sa.Column('judgeVolunteerId', sa.String(36), sa.ForeignKey('volunteers.id', name='fk_judge_assignments_judge_volunteers', ondelete='CASCADE'), nullable=False),
            sa.Column('source', sa.String(20), server_default='wizard', nullable=False),
            sa.Column('status', sa.String(20), server_default='active', nullable=False),
            sa.Column('createdBy', sa.String(100), nullable=True),
            sa.Column('createdAt', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column('revokedAt', sa.DateTime(), nullable=True),
            sa.Column('revokedBy', sa.String(100), nullable=True),
            sa.UniqueConstraint('roundId', 'teamId', 'judgeVolunteerId', name='uq_judge_assignments_round_team_judge'),
        )
        op.create_index('ix_judge_assignments_eventId', 'judge_assignments', ['eventId'])
        op.create_index('ix_judge_assignments_round_judge', 'judge_assignments', ['roundId', 'judgeVolunteerId'])

    # 2. evaluations
    if 'evaluations' not in existing_tables:
        op.create_table(
            'evaluations',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('eventId', sa.String(36), sa.ForeignKey('events.id', name='fk_evaluations_eventId_events', ondelete='CASCADE'), nullable=False),
            sa.Column('roundId', sa.String(36), sa.ForeignKey('evaluation_rounds.id', name='fk_evaluations_roundId_rounds', ondelete='CASCADE'), nullable=False),
            sa.Column('teamId', sa.String(36), sa.ForeignKey('teams.id', name='fk_evaluations_teamId_teams', ondelete='CASCADE'), nullable=False),
            sa.Column('judgeVolunteerId', sa.String(36), sa.ForeignKey('volunteers.id', name='fk_evaluations_judge_volunteers', ondelete='CASCADE'), nullable=False),
            sa.Column('currentVersionId', sa.String(36), nullable=True),
            sa.Column('createdAt', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint('roundId', 'teamId', 'judgeVolunteerId', name='uq_evaluations_round_team_judge'),
        )
        op.create_index('ix_evaluations_eventId', 'evaluations', ['eventId'])

    # 3. evaluation_versions
    if 'evaluation_versions' not in existing_tables:
        op.create_table(
            'evaluation_versions',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('eventId', sa.String(36), sa.ForeignKey('events.id', name='fk_evaluation_versions_eventId_events', ondelete='CASCADE'), nullable=False),
            sa.Column('evaluationId', sa.String(36), sa.ForeignKey('evaluations.id', name='fk_evaluation_versions_eval_evaluations', ondelete='CASCADE'), nullable=False),
            sa.Column('version', sa.Integer(), nullable=False),
            sa.Column('rubricVersionId', sa.String(36), sa.ForeignKey('rubric_versions.id', name='fk_eval_versions_rubric_versions', ondelete='SET NULL'), nullable=True),
            sa.Column('status', sa.String(20), nullable=False),
            sa.Column('totalPct', sa.Numeric(6, 3), nullable=True),
            sa.Column('submittedAt', sa.DateTime(), nullable=True),
            sa.Column('supersededAt', sa.DateTime(), nullable=True),
            sa.Column('supersededReason', sa.String(30), nullable=True),
            sa.Column('createdAt', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column('updatedAt', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint('evaluationId', 'version', name='uq_evaluation_versions_eval_version'),
        )
        op.create_index('ix_evaluation_versions_eventId', 'evaluation_versions', ['eventId'])
        op.create_index(
            'uq_eval_version_single_draft',
            'evaluation_versions',
            ['evaluationId'],
            unique=True,
            postgresql_where=sa.text("status = 'draft'"),
            sqlite_where=sa.text("status = 'draft'"),
        )
        op.create_index(
            'uq_eval_version_single_final',
            'evaluation_versions',
            ['evaluationId'],
            unique=True,
            postgresql_where=sa.text("status = 'final'"),
            sqlite_where=sa.text("status = 'final'"),
        )

    # 4. evaluation_scores
    if 'evaluation_scores' not in existing_tables:
        op.create_table(
            'evaluation_scores',
            sa.Column('versionId', sa.String(36), sa.ForeignKey('evaluation_versions.id', name='fk_evaluation_scores_versionId', ondelete='CASCADE'), primary_key=True),
            sa.Column('fieldId', sa.String(36), sa.ForeignKey('rubric_fields.id', name='fk_evaluation_scores_fieldId', ondelete='CASCADE'), primary_key=True),
            sa.Column('marks', sa.Numeric(8, 2), nullable=False),
        )

    # 5. evaluation_texts
    if 'evaluation_texts' not in existing_tables:
        op.create_table(
            'evaluation_texts',
            sa.Column('versionId', sa.String(36), sa.ForeignKey('evaluation_versions.id', name='fk_evaluation_texts_versionId', ondelete='CASCADE'), primary_key=True),
            sa.Column('fieldId', sa.String(36), sa.ForeignKey('rubric_fields.id', name='fk_evaluation_texts_fieldId', ondelete='CASCADE'), primary_key=True),
            sa.Column('value', sa.Text(), nullable=True),
            sa.Column('hiddenByAdmin', sa.Boolean(), server_default=sa.false(), nullable=False),
            sa.Column('hiddenBy', sa.String(100), nullable=True),
            sa.Column('hiddenAt', sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = set(inspector.get_table_names())

    if 'evaluation_texts' in existing_tables:
        op.drop_table('evaluation_texts')
    if 'evaluation_scores' in existing_tables:
        op.drop_table('evaluation_scores')
    if 'evaluation_versions' in existing_tables:
        op.drop_index('uq_eval_version_single_final', table_name='evaluation_versions')
        op.drop_index('uq_eval_version_single_draft', table_name='evaluation_versions')
        op.drop_index('ix_evaluation_versions_eventId', table_name='evaluation_versions')
        op.drop_table('evaluation_versions')
    if 'evaluations' in existing_tables:
        op.drop_index('ix_evaluations_eventId', table_name='evaluations')
        op.drop_table('evaluations')
    if 'judge_assignments' in existing_tables:
        op.drop_index('ix_judge_assignments_round_judge', table_name='judge_assignments')
        op.drop_index('ix_judge_assignments_eventId', table_name='judge_assignments')
        op.drop_table('judge_assignments')
