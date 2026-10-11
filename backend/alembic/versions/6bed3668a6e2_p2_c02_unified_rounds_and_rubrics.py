"""p2_c02_unified_rounds_and_rubrics

Revision ID: 6bed3668a6e2
Revises: 795a68c4c84f
Create Date: 2026-10-11 16:18:48.172960

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6bed3668a6e2'
down_revision: Union[str, Sequence[str], None] = '795a68c4c84f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    # 1. Expand evaluation_rounds table
    if 'evaluation_rounds' in existing_tables:
        existing_cols = {c['name'].lower() for c in inspector.get_columns('evaluation_rounds')}
        with op.batch_alter_table('evaluation_rounds') as batch_op:
            if 'description' not in existing_cols:
                batch_op.add_column(sa.Column('description', sa.Text(), nullable=True))
            if 'roundnumber' not in existing_cols:
                batch_op.add_column(sa.Column('roundNumber', sa.Integer(), nullable=True))
            if 'status' not in existing_cols:
                batch_op.add_column(sa.Column('status', sa.String(20), server_default='live', nullable=False))
            if 'submissionenabled' not in existing_cols:
                batch_op.add_column(sa.Column('submissionEnabled', sa.Boolean(), server_default=sa.true(), nullable=False))
            if 'evaluationenabled' not in existing_cols:
                batch_op.add_column(sa.Column('evaluationEnabled', sa.Boolean(), server_default=sa.false(), nullable=False))
            if 'opensat' not in existing_cols:
                batch_op.add_column(sa.Column('opensAt', sa.DateTime(), nullable=True))
            if 'closesat' not in existing_cols:
                batch_op.add_column(sa.Column('closesAt', sa.DateTime(), nullable=True))
            if 'aggregation' not in existing_cols:
                batch_op.add_column(sa.Column('aggregation', sa.String(20), server_default='mean', nullable=False))
            if 'trimcount' not in existing_cols:
                batch_op.add_column(sa.Column('trimCount', sa.Integer(), server_default='1', nullable=False))
            if 'tiebreakorder' not in existing_cols:
                batch_op.add_column(sa.Column('tieBreakOrder', sa.JSON(), nullable=True))
            if 'eligibility' not in existing_cols:
                batch_op.add_column(sa.Column('eligibility', sa.JSON(), nullable=True))
            if 'currentrubricversion' not in existing_cols:
                batch_op.add_column(sa.Column('currentRubricVersion', sa.Integer(), server_default='0', nullable=False))
            if 'totalscale' not in existing_cols:
                batch_op.add_column(sa.Column('totalScale', sa.Integer(), server_default='100', nullable=False))
            if 'coirule' not in existing_cols:
                batch_op.add_column(sa.Column('coiRule', sa.JSON(), nullable=True))
            if 'resultsconfig' not in existing_cols:
                batch_op.add_column(sa.Column('resultsConfig', sa.JSON(), nullable=True))

        # Backfill roundNumber 1..n per event where roundNumber is null
        rounds_rows = bind.execute(
            sa.text('SELECT id, "eventId", "createdAt" FROM evaluation_rounds ORDER BY "eventId", "createdAt"')
        ).fetchall()
        event_counters = {}
        for r_id, ev_id, _ in rounds_rows:
            curr = event_counters.get(ev_id, 0) + 1
            event_counters[ev_id] = curr
            bind.execute(
                sa.text('UPDATE evaluation_rounds SET "roundNumber" = :num WHERE id = :rid AND "roundNumber" IS NULL'),
                {"num": curr, "rid": r_id}
            )

    # 2. Create rubric_versions table
    if 'rubric_versions' not in existing_tables:
        op.create_table(
            'rubric_versions',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('eventId', sa.String(36), nullable=False),
            sa.Column('roundId', sa.String(36), nullable=False),
            sa.Column('version', sa.Integer(), nullable=False),
            sa.Column('reason', sa.String(30), nullable=False),
            sa.Column('createdBy', sa.String(100), nullable=False),
            sa.Column('createdAt', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column('publishedAt', sa.DateTime(), nullable=True),
            sa.Column('lockedAt', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['eventId'], ['events.id'], ondelete='CASCADE', name='fk_rubric_versions_eventId_events'),
            sa.ForeignKeyConstraint(['roundId'], ['evaluation_rounds.id'], ondelete='CASCADE', name='fk_rubric_versions_roundId_evaluation_rounds'),
            sa.UniqueConstraint('roundId', 'version', name='uq_rubric_round_version'),
        )
        op.create_index('ix_rubric_versions_eventId', 'rubric_versions', ['eventId'])
        op.create_index('ix_rubric_versions_roundId', 'rubric_versions', ['roundId'])

    # 3. Create rubric_fields table
    if 'rubric_fields' not in existing_tables:
        op.create_table(
            'rubric_fields',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('eventId', sa.String(36), nullable=False),
            sa.Column('rubricVersionId', sa.String(36), nullable=False),
            sa.Column('fieldKey', sa.String(36), nullable=False),
            sa.Column('type', sa.String(10), nullable=False),
            sa.Column('label', sa.String(150), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('sortOrder', sa.Integer(), server_default='0', nullable=False),
            sa.Column('isRequired', sa.Boolean(), server_default=sa.true(), nullable=False),
            sa.Column('maxMarks', sa.Numeric(8, 2), nullable=True),
            sa.Column('weight', sa.Numeric(5, 2), nullable=True),
            sa.Column('anchors', sa.JSON(), nullable=True),
            sa.Column('visibility', sa.String(15), nullable=True),
            sa.Column('maxLength', sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(['eventId'], ['events.id'], ondelete='CASCADE', name='fk_rubric_fields_eventId_events'),
            sa.ForeignKeyConstraint(['rubricVersionId'], ['rubric_versions.id'], ondelete='CASCADE', name='fk_rubric_fields_rubricVersionId_rubric_versions'),
            sa.UniqueConstraint('rubricVersionId', 'fieldKey', name='uq_rubric_field_key'),
        )
        op.create_index('ix_rubric_fields_eventId', 'rubric_fields', ['eventId'])
        op.create_index('ix_rubric_fields_rubricVersionId', 'rubric_fields', ['rubricVersionId'])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if 'rubric_fields' in existing_tables:
        op.drop_table('rubric_fields')

    if 'rubric_versions' in existing_tables:
        op.drop_table('rubric_versions')

    if 'evaluation_rounds' in existing_tables:
        existing_cols = {c['name'].lower() for c in inspector.get_columns('evaluation_rounds')}
        cols_to_drop = [
            'resultsconfig', 'coirule', 'totalscale', 'currentrubricversion',
            'eligibility', 'tiebreakorder', 'trimcount', 'aggregation',
            'closesat', 'opensat', 'evaluationenabled', 'submissionenabled', 'status'
        ]
        with op.batch_alter_table('evaluation_rounds') as batch_op:
            for col in cols_to_drop:
                if col in existing_cols:
                    batch_op.drop_column(col)
