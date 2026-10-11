'''P0-C04 foundation: organizations, events.orgId, event_configs.features, users.status, volunteers.email, audit_logs.eventId

Revision ID: 8d6e5f4a3b2c
Revises: 7c5d4e3f2a1b
'''
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '8d6e5f4a3b2c'
down_revision: Union[str, Sequence[str], None] = '7c5d4e3f2a1b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_FEATURES = {'pods': True, 'evaluation': True}


def _cols(inspector, table):
    return [c['name'].lower() for c in inspector.get_columns(table)]


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if 'organizations' not in inspector.get_table_names():
        op.create_table(
            'organizations',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('name', sa.String(255), nullable=False),
            sa.Column('slug', sa.String(100), nullable=False, unique=True),
            sa.Column('createdAt', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )

    org_id = conn.execute(sa.text('SELECT id FROM organizations WHERE slug = :s'), {'s': 'default'}).scalar()
    if org_id is None:
        org_id = str(uuid.uuid4())
        conn.execute(
            sa.text('INSERT INTO organizations (id, name, slug) VALUES (:i, :n, :s)'),
            {'i': org_id, 'n': 'Default Organization', 's': 'default'},
        )

    if 'orgid' not in _cols(inspector, 'events'):
        with op.batch_alter_table('events') as batch:
            batch.add_column(sa.Column('orgId', sa.String(36), nullable=True))
            batch.create_foreign_key('fk_events_orgId_organizations', 'organizations', ['orgId'], ['id'])
        op.create_index('ix_events_orgId', 'events', ['orgId'])
    conn.execute(sa.text('UPDATE events SET "orgId" = :o WHERE "orgId" IS NULL'), {'o': org_id})

    if 'features' not in _cols(inspector, 'event_configs'):
        op.add_column('event_configs', sa.Column('features', sa.JSON(), nullable=True))
    configs = sa.table('event_configs', sa.column('features', sa.JSON()))
    conn.execute(sa.update(configs).where(configs.c.features.is_(None)).values(features=DEFAULT_FEATURES))

    if 'status' not in _cols(inspector, 'users'):
        op.add_column('users', sa.Column('status', sa.String(20), server_default='active', nullable=False))

    if 'email' not in _cols(inspector, 'volunteers'):
        op.add_column('volunteers', sa.Column('email', sa.String(255), nullable=True))

    if 'eventid' not in _cols(inspector, 'audit_logs'):
        op.add_column('audit_logs', sa.Column('eventId', sa.String(36), nullable=True))
        op.create_index('ix_audit_logs_eventId', 'audit_logs', ['eventId'])


def downgrade() -> None:
    op.drop_index('ix_audit_logs_eventId', table_name='audit_logs')
    with op.batch_alter_table('audit_logs') as batch:
        batch.drop_column('eventId')
    with op.batch_alter_table('volunteers') as batch:
        batch.drop_column('email')
    with op.batch_alter_table('users') as batch:
        batch.drop_column('status')
    with op.batch_alter_table('event_configs') as batch:
        batch.drop_column('features')
    op.drop_index('ix_events_orgId', table_name='events')
    with op.batch_alter_table('events') as batch:
        batch.drop_constraint('fk_events_orgId_organizations', type_='foreignkey')
        batch.drop_column('orgId')
    op.drop_table('organizations')
