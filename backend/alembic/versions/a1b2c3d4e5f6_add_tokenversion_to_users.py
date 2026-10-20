"""Add tokenVersion to users table

Revision ID: a1b2c3d4e5f6
Revises: f1e2d3c4b5a6
Create Date: 2026-10-20 22:18:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'b9c0d1e2f3a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    tables = [t.lower() for t in insp.get_table_names()]
    dialect = conn.dialect.name

    if "users" in tables:
        user_cols = [c["name"].lower() for c in insp.get_columns("users")]
        if "tokenversion" not in user_cols:
            if dialect == "sqlite":
                with op.batch_alter_table("users") as batch_op:
                    batch_op.add_column(
                        sa.Column("tokenVersion", sa.Integer(), nullable=False, server_default="1")
                    )
            else:
                op.add_column(
                    "users",
                    sa.Column("tokenVersion", sa.Integer(), nullable=False, server_default="1")
                )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    tables = [t.lower() for t in insp.get_table_names()]
    dialect = conn.dialect.name

    if "users" in tables:
        user_cols = [c["name"].lower() for c in insp.get_columns("users")]
        if "tokenversion" in user_cols:
            if dialect == "sqlite":
                with op.batch_alter_table("users") as batch_op:
                    batch_op.drop_column("tokenVersion")
            else:
                op.drop_column("users", "tokenVersion")
