"""P1-C04 rbac tables and seeds

Revision ID: 795a68c4c84f
Revises: 8d6e5f4a3b2c
Create Date: 2026-10-11 14:06:57.466399

"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '795a68c4c84f'
down_revision: Union[str, Sequence[str], None] = '8d6e5f4a3b2c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

VOLUNTEER_PERMS = [
    'team.view',
    'ps.view',
    'ps.assist',
    'checkpoint.view',
    'attendance.mark',
    'people.view',
    'people.checkin',
]
JUDGE_PERMS = ['evaluation.score']


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    # 1. Create tables if absent
    if 'roles' not in existing_tables:
        op.create_table(
            'roles',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('eventId', sa.String(36), sa.ForeignKey('events.id', ondelete='CASCADE'), nullable=False),
            sa.Column('name', sa.String(100), nullable=False),
            sa.Column('description', sa.String(500), nullable=True),
            sa.Column('isSystem', sa.Boolean(), server_default=sa.false(), nullable=False),
            sa.Column('systemKey', sa.String(30), nullable=True),
            sa.Column('sourceTemplateId', sa.String(36), nullable=True),
            sa.Column('createdAt', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column('updatedAt', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint('eventId', 'name', name='uq_roles_event_name'),
        )
        op.create_index('ix_roles_eventId', 'roles', ['eventId'])

    if 'role_permissions' not in existing_tables:
        op.create_table(
            'role_permissions',
            sa.Column('roleId', sa.String(36), sa.ForeignKey('roles.id', ondelete='CASCADE'), primary_key=True),
            sa.Column('permissionKey', sa.String(100), primary_key=True),
        )

    if 'role_templates' not in existing_tables:
        op.create_table(
            'role_templates',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('orgId', sa.String(36), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
            sa.Column('name', sa.String(100), nullable=False),
            sa.Column('description', sa.String(500), nullable=True),
            sa.Column('permissions', sa.JSON(), nullable=False),
            sa.Column('createdFromRoleId', sa.String(36), nullable=True),
            sa.Column('createdAt', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint('orgId', 'name', name='uq_role_templates_org_name'),
        )

    if 'user_role_assignments' not in existing_tables:
        op.create_table(
            'user_role_assignments',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('eventId', sa.String(36), sa.ForeignKey('events.id', ondelete='CASCADE'), nullable=False),
            sa.Column('userId', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('roleId', sa.String(36), sa.ForeignKey('roles.id', ondelete='CASCADE'), nullable=False),
            sa.Column('scope', sa.JSON(), nullable=True),
            sa.Column('createdBy', sa.String(100), nullable=True),
            sa.Column('createdAt', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint('userId', 'roleId', name='uq_user_role_assignments_user_role'),
        )
        op.create_index('ix_user_role_assignments_eventId', 'user_role_assignments', ['eventId'])
        op.create_index('ix_user_role_assignments_userId', 'user_role_assignments', ['userId'])

    # Lightweight table definitions for seeding
    roles_table = sa.table(
        'roles',
        sa.column('id', sa.String(36)),
        sa.column('eventId', sa.String(36)),
        sa.column('name', sa.String(100)),
        sa.column('description', sa.String(500)),
        sa.column('isSystem', sa.Boolean()),
        sa.column('systemKey', sa.String(30)),
    )
    role_permissions_table = sa.table(
        'role_permissions',
        sa.column('roleId', sa.String(36)),
        sa.column('permissionKey', sa.String(100)),
    )
    role_templates_table = sa.table(
        'role_templates',
        sa.column('id', sa.String(36)),
        sa.column('orgId', sa.String(36)),
        sa.column('name', sa.String(100)),
        sa.column('description', sa.String(500)),
        sa.column('permissions', sa.JSON()),
    )
    user_role_assignments_table = sa.table(
        'user_role_assignments',
        sa.column('id', sa.String(36)),
        sa.column('eventId', sa.String(36)),
        sa.column('userId', sa.String(36)),
        sa.column('roleId', sa.String(36)),
        sa.column('scope', sa.JSON()),
        sa.column('createdBy', sa.String(100)),
    )

    # 2. Seed system roles for all events
    events = bind.execute(sa.text('SELECT id FROM events')).fetchall()
    for ev in events:
        event_id = ev[0]

        # Volunteer role
        existing_v = bind.execute(
            sa.text('SELECT id FROM roles WHERE "eventId" = :eid AND ("systemKey" = :sk OR name = :name)'),
            {'eid': event_id, 'sk': 'volunteer', 'name': 'Volunteer'},
        ).first()

        if not existing_v:
            v_id = str(uuid.uuid4())
            bind.execute(
                roles_table.insert().values(
                    id=v_id,
                    eventId=event_id,
                    name='Volunteer',
                    description='Teams, attendance, problem statement assistance and people check-in.',
                    isSystem=True,
                    systemKey='volunteer',
                )
            )
            for perm in VOLUNTEER_PERMS:
                bind.execute(
                    role_permissions_table.insert().values(
                        roleId=v_id,
                        permissionKey=perm,
                    )
                )

        # Judge role
        existing_j = bind.execute(
            sa.text('SELECT id FROM roles WHERE "eventId" = :eid AND ("systemKey" = :sk OR name = :name)'),
            {'eid': event_id, 'sk': 'judge', 'name': 'Judge'},
        ).first()

        if not existing_j:
            j_id = str(uuid.uuid4())
            bind.execute(
                roles_table.insert().values(
                    id=j_id,
                    eventId=event_id,
                    name='Judge',
                    description='Scores the teams assigned to them.',
                    isSystem=True,
                    systemKey='judge',
                )
            )
            for perm in JUDGE_PERMS:
                bind.execute(
                    role_permissions_table.insert().values(
                        roleId=j_id,
                        permissionKey=perm,
                    )
                )

    # 3. Backfill user_role_assignments for VOLUNTEER users
    # Note Postgres enum trap: CAST(role AS VARCHAR)
    volunteer_users = bind.execute(
        sa.text('SELECT id, "eventId" FROM users WHERE CAST(role AS VARCHAR) = :r AND "eventId" IS NOT NULL'),
        {'r': 'VOLUNTEER'},
    ).fetchall()

    for u in volunteer_users:
        user_id, event_id = u[0], u[1]
        v_role = bind.execute(
            sa.text('SELECT id FROM roles WHERE "eventId" = :eid AND "systemKey" = :sk'),
            {'eid': event_id, 'sk': 'volunteer'},
        ).first()

        if v_role:
            v_role_id = v_role[0]
            existing_assignment = bind.execute(
                sa.text('SELECT id FROM user_role_assignments WHERE "userId" = :uid AND "roleId" = :rid'),
                {'uid': user_id, 'rid': v_role_id},
            ).first()

            if not existing_assignment:
                bind.execute(
                    user_role_assignments_table.insert().values(
                        id=str(uuid.uuid4()),
                        eventId=event_id,
                        userId=user_id,
                        roleId=v_role_id,
                        scope={'teams': {'mode': 'all', 'ids': []}},
                        createdBy='SYSTEM',
                    )
                )

    # 4. Seed role templates for default organization
    default_org = bind.execute(
        sa.text("SELECT id FROM organizations WHERE slug = 'default'")
    ).first()

    if default_org:
        org_id = default_org[0]

        # Volunteer template
        tmpl_v = bind.execute(
            sa.text('SELECT id FROM role_templates WHERE "orgId" = :oid AND name = :name'),
            {'oid': org_id, 'name': 'Volunteer'},
        ).first()
        if not tmpl_v:
            bind.execute(
                role_templates_table.insert().values(
                    id=str(uuid.uuid4()),
                    orgId=org_id,
                    name='Volunteer',
                    description='Teams, attendance, problem statement assistance and people check-in.',
                    permissions=VOLUNTEER_PERMS,
                )
            )

        # Judge template
        tmpl_j = bind.execute(
            sa.text('SELECT id FROM role_templates WHERE "orgId" = :oid AND name = :name'),
            {'oid': org_id, 'name': 'Judge'},
        ).first()
        if not tmpl_j:
            bind.execute(
                role_templates_table.insert().values(
                    id=str(uuid.uuid4()),
                    orgId=org_id,
                    name='Judge',
                    description='Scores the teams assigned to them.',
                    permissions=JUDGE_PERMS,
                )
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if 'user_role_assignments' in existing_tables:
        op.drop_table('user_role_assignments')
    if 'role_templates' in existing_tables:
        op.drop_table('role_templates')
    if 'role_permissions' in existing_tables:
        op.drop_table('role_permissions')
    if 'roles' in existing_tables:
        op.drop_table('roles')
