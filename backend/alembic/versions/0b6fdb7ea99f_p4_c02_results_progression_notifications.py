"""p4_c02_results_progression_notifications

Revision ID: 0b6fdb7ea99f
Revises: 9b6e617bb694
Create Date: 2026-10-12 09:02:06.825340

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0b6fdb7ea99f'
down_revision: Union[str, Sequence[str], None] = '9b6e617bb694'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = set(inspector.get_table_names())

    # 1. team_round_status
    if 'team_round_status' not in existing_tables:
        op.create_table(
            'team_round_status',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('eventId', sa.String(36), sa.ForeignKey('events.id', name='fk_team_round_status_eventId_events', ondelete='CASCADE'), nullable=False),
            sa.Column('roundId', sa.String(36), sa.ForeignKey('evaluation_rounds.id', name='fk_team_round_status_roundId_rounds', ondelete='CASCADE'), nullable=False),
            sa.Column('teamId', sa.String(36), sa.ForeignKey('teams.id', name='fk_team_round_status_teamId_teams', ondelete='CASCADE'), nullable=False),
            sa.Column('state', sa.String(20), server_default='eligible', nullable=False),
            sa.Column('via', sa.String(20), server_default='initial', nullable=False),
            sa.Column('rankSnapshot', sa.Integer(), nullable=True),
            sa.Column('scoreSnapshot', sa.Numeric(6, 3), nullable=True),
            sa.Column('decidedBy', sa.String(100), nullable=True),
            sa.Column('decidedAt', sa.DateTime(), nullable=True),
            sa.UniqueConstraint('roundId', 'teamId', name='uq_team_round_status_round_team'),
        )
        op.create_index('ix_team_round_status_eventId', 'team_round_status', ['eventId'])

    # 2. result_releases
    if 'result_releases' not in existing_tables:
        op.create_table(
            'result_releases',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('eventId', sa.String(36), sa.ForeignKey('events.id', name='fk_result_releases_eventId_events', ondelete='CASCADE'), nullable=False),
            sa.Column('roundId', sa.String(36), sa.ForeignKey('evaluation_rounds.id', name='fk_result_releases_roundId_rounds', ondelete='CASCADE'), nullable=False),
            sa.Column('releaseNo', sa.Integer(), nullable=False),
            sa.Column('config', sa.JSON(), nullable=False),
            sa.Column('releasedBy', sa.String(100), nullable=False),
            sa.Column('releasedAt', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column('supersedesReleaseId', sa.String(36), nullable=True),
            sa.Column('retractedAt', sa.DateTime(), nullable=True),
            sa.UniqueConstraint('roundId', 'releaseNo', name='uq_result_releases_round_release_no'),
        )
        op.create_index('ix_result_releases_eventId', 'result_releases', ['eventId'])

    # 3. result_release_items
    if 'result_release_items' not in existing_tables:
        op.create_table(
            'result_release_items',
            sa.Column('releaseId', sa.String(36), sa.ForeignKey('result_releases.id', name='fk_result_release_items_releaseId', ondelete='CASCADE'), primary_key=True),
            sa.Column('teamId', sa.String(36), sa.ForeignKey('teams.id', name='fk_result_release_items_teamId', ondelete='CASCADE'), primary_key=True),
            sa.Column('payload', sa.JSON(), nullable=False),
        )

    # 4. notifications
    if 'notifications' not in existing_tables:
        op.create_table(
            'notifications',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('eventId', sa.String(36), sa.ForeignKey('events.id', name='fk_notifications_eventId_events', ondelete='CASCADE'), nullable=False),
            sa.Column('recipientUserId', sa.String(36), sa.ForeignKey('users.id', name='fk_notifications_recipientUserId_users', ondelete='CASCADE'), nullable=False),
            sa.Column('type', sa.String(40), nullable=False),
            sa.Column('title', sa.String(200), nullable=False),
            sa.Column('body', sa.Text(), nullable=False),
            sa.Column('link', sa.String(255), nullable=True),
            sa.Column('payload', sa.JSON(), nullable=True),
            sa.Column('readAt', sa.DateTime(), nullable=True),
            sa.Column('createdAt', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )
        op.create_index('ix_notifications_eventId', 'notifications', ['eventId'])
        op.create_index('ix_notifications_recipient_read', 'notifications', ['recipientUserId', 'readAt'])


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = set(inspector.get_table_names())

    if 'notifications' in existing_tables:
        op.drop_table('notifications')
    if 'result_release_items' in existing_tables:
        op.drop_table('result_release_items')
    if 'result_releases' in existing_tables:
        op.drop_table('result_releases')
    if 'team_round_status' in existing_tables:
        op.drop_table('team_round_status')
