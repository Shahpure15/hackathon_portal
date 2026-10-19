"""Add isDefault to checkpoint_types

Revision ID: a8b9c0d1e2f3
Revises: f1e2d3c4b5a6
Create Date: 2026-10-19 19:04:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a8b9c0d1e2f3'
down_revision: Union[str, Sequence[str], None] = 'f1e2d3c4b5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    tables = [t.lower() for t in insp.get_table_names()]
    dialect = conn.dialect.name

    if "checkpoint_types" in tables:
        cp_cols = [c["name"].lower() for c in insp.get_columns("checkpoint_types")]
        if "isdefault" not in cp_cols:
            if dialect == "sqlite":
                with op.batch_alter_table("checkpoint_types") as batch_op:
                    batch_op.add_column(
                        sa.Column("isDefault", sa.Boolean(), server_default=sa.false(), nullable=False)
                    )
            else:
                op.add_column(
                    "checkpoint_types",
                    sa.Column("isDefault", sa.Boolean(), server_default=sa.false(), nullable=False)
                )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    tables = [t.lower() for t in insp.get_table_names()]
    dialect = conn.dialect.name

    if "checkpoint_types" in tables:
        cp_cols = [c["name"].lower() for c in insp.get_columns("checkpoint_types")]
        if "isdefault" in cp_cols:
            if dialect == "sqlite":
                with op.batch_alter_table("checkpoint_types") as batch_op:
                    batch_op.drop_column("isDefault")
            else:
                op.drop_column("checkpoint_types", "isDefault")
