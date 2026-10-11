"""P3-C02 email core

Revision ID: e5a8f81a9eb9
Revises: 6bed3668a6e2
Create Date: 2026-10-11 22:05:15.226158

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5a8f81a9eb9'
down_revision: Union[str, Sequence[str], None] = '6bed3668a6e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = set(inspector.get_table_names())

    # 1. smtp_accounts
    if 'smtp_accounts' not in existing_tables:
        op.create_table(
            'smtp_accounts',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('orgId', sa.String(36), sa.ForeignKey('organizations.id', name='fk_smtp_accounts_orgId_organizations', ondelete='CASCADE'), nullable=True),
            sa.Column('label', sa.String(100), nullable=False),
            sa.Column('host', sa.String(255), nullable=False),
            sa.Column('port', sa.Integer(), nullable=False),
            sa.Column('security', sa.String(20), nullable=False),
            sa.Column('username', sa.String(255), nullable=False),
            sa.Column('passwordEnc', sa.Text(), nullable=False),
            sa.Column('fromEmail', sa.String(255), nullable=False),
            sa.Column('fromName', sa.String(255), nullable=False),
            sa.Column('replyTo', sa.String(255), nullable=True),
            sa.Column('dailyLimit', sa.Integer(), nullable=True),
            sa.Column('perMinuteLimit', sa.Integer(), nullable=True),
            sa.Column('sentToday', sa.Integer(), server_default='0', nullable=False),
            sa.Column('windowStartedAt', sa.DateTime(), nullable=True),
            sa.Column('resetsAt', sa.DateTime(), nullable=True),
            sa.Column('status', sa.String(20), server_default='active', nullable=False),
            sa.Column('lastError', sa.Text(), nullable=True),
            sa.Column('priority', sa.Integer(), server_default='0', nullable=False),
            sa.Column('createdAt', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )

    # 2. email_templates
    if 'email_templates' not in existing_tables:
        op.create_table(
            'email_templates',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('eventId', sa.String(36), sa.ForeignKey('events.id', name='fk_email_templates_eventId_events', ondelete='CASCADE'), nullable=True),
            sa.Column('key', sa.String(60), nullable=False),
            sa.Column('subject', sa.String(255), nullable=False),
            sa.Column('body', sa.Text(), nullable=False),
            sa.Column('version', sa.Integer(), server_default='1', nullable=False),
            sa.Column('updatedBy', sa.String(100), nullable=True),
            sa.Column('updatedAt', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint('eventId', 'key', name='uq_email_templates_event_key'),
        )

    # 3. email_batches
    if 'email_batches' not in existing_tables:
        op.create_table(
            'email_batches',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('eventId', sa.String(36), sa.ForeignKey('events.id', name='fk_email_batches_eventId_events', ondelete='CASCADE'), nullable=False),
            sa.Column('templateKey', sa.String(60), nullable=False),
            sa.Column('templateSnapshot', sa.JSON(), nullable=True),
            sa.Column('audience', sa.JSON(), nullable=True),
            sa.Column('category', sa.String(20), nullable=False),
            sa.Column('status', sa.String(20), nullable=False),
            sa.Column('counts', sa.JSON(), nullable=True),
            sa.Column('pausedReason', sa.String(255), nullable=True),
            sa.Column('resumeAt', sa.DateTime(), nullable=True),
            sa.Column('createdBy', sa.String(100), nullable=True),
            sa.Column('createdAt', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )

    # 4. email_outbox
    if 'email_outbox' not in existing_tables:
        op.create_table(
            'email_outbox',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('eventId', sa.String(36), sa.ForeignKey('events.id', name='fk_email_outbox_eventId_events', ondelete='CASCADE'), nullable=False),
            sa.Column('batchId', sa.String(36), sa.ForeignKey('email_batches.id', name='fk_email_outbox_batchId_email_batches', ondelete='SET NULL'), nullable=True),
            sa.Column('toEmail', sa.String(255), nullable=False),
            sa.Column('toUserId', sa.String(36), sa.ForeignKey('users.id', name='fk_email_outbox_toUserId_users', ondelete='SET NULL'), nullable=True),
            sa.Column('templateKey', sa.String(60), nullable=False),
            sa.Column('subject', sa.String(255), nullable=False),
            sa.Column('body', sa.Text(), nullable=False),
            sa.Column('priority', sa.Integer(), server_default='5', nullable=False),
            sa.Column('status', sa.String(20), server_default='queued', nullable=False),
            sa.Column('attempts', sa.Integer(), server_default='0', nullable=False),
            sa.Column('nextAttemptAt', sa.DateTime(), nullable=False),
            sa.Column('expiresAt', sa.DateTime(), nullable=True),
            sa.Column('accountId', sa.String(36), sa.ForeignKey('smtp_accounts.id', name='fk_email_outbox_accountId_smtp_accounts', ondelete='SET NULL'), nullable=True),
            sa.Column('error', sa.Text(), nullable=True),
            sa.Column('sentAt', sa.DateTime(), nullable=True),
            sa.Column('createdAt', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )
        op.create_index('ix_email_outbox_due', 'email_outbox', ['status', 'nextAttemptAt', 'priority'])
        op.create_index('ix_email_outbox_eventId', 'email_outbox', ['eventId'])

    # 5. auth_tokens
    if 'auth_tokens' not in existing_tables:
        op.create_table(
            'auth_tokens',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('eventId', sa.String(36), sa.ForeignKey('events.id', name='fk_auth_tokens_eventId_events', ondelete='CASCADE'), nullable=True),
            sa.Column('userId', sa.String(36), sa.ForeignKey('users.id', name='fk_auth_tokens_userId_users', ondelete='CASCADE'), nullable=False),
            sa.Column('kind', sa.String(10), nullable=False),
            sa.Column('tokenHash', sa.String(64), nullable=False, unique=True),
            sa.Column('expiresAt', sa.DateTime(), nullable=False),
            sa.Column('usedAt', sa.DateTime(), nullable=True),
            sa.Column('createdAt', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )
        op.create_index('ix_auth_tokens_userId', 'auth_tokens', ['userId'])


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = set(inspector.get_table_names())

    if 'auth_tokens' in existing_tables:
        op.drop_table('auth_tokens')
    if 'email_outbox' in existing_tables:
        op.drop_index('ix_email_outbox_due', table_name='email_outbox')
        op.drop_index('ix_email_outbox_eventId', table_name='email_outbox')
        op.drop_table('email_outbox')
    if 'email_batches' in existing_tables:
        op.drop_table('email_batches')
    if 'email_templates' in existing_tables:
        op.drop_table('email_templates')
    if 'smtp_accounts' in existing_tables:
        op.drop_table('smtp_accounts')
