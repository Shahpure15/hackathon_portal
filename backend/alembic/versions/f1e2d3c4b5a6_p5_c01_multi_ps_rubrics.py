"""P5-C01 multi-PS rubrics and guidance table

Revision ID: f1e2d3c4b5a6
Revises: 92d8a701a260
Create Date: 2026-10-19 13:21:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1e2d3c4b5a6'
down_revision: Union[str, Sequence[str], None] = '92d8a701a260'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    tables = [t.lower() for t in insp.get_table_names()]
    dialect = conn.dialect.name

    # 1. Add problemStatementId column to rubric_fields
    if "rubric_fields" in tables:
        rf_cols = [c["name"].lower() for c in insp.get_columns("rubric_fields")]
        if "problemstatementid" not in rf_cols:
            if dialect == "sqlite":
                with op.batch_alter_table("rubric_fields") as batch_op:
                    batch_op.add_column(
                        sa.Column("problemStatementId", sa.String(36), nullable=True)
                    )
                    batch_op.create_foreign_key(
                        "fk_rubric_fields_problemStatementId",
                        "problem_statements",
                        ["problemStatementId"],
                        ["id"],
                        ondelete="CASCADE",
                    )
                    batch_op.create_index(
                        "ix_rubric_fields_problemStatementId",
                        ["problemStatementId"],
                    )
            else:
                op.add_column(
                    "rubric_fields",
                    sa.Column(
                        "problemStatementId",
                        sa.String(36),
                        sa.ForeignKey(
                            "problem_statements.id",
                            ondelete="CASCADE",
                            name="fk_rubric_fields_problemStatementId",
                        ),
                        nullable=True,
                    ),
                )
                op.create_index(
                    "ix_rubric_fields_problemStatementId",
                    "rubric_fields",
                    ["problemStatementId"],
                    unique=False,
                )

    # 2. Create rubric_ps_guidance table
    if "rubric_ps_guidance" not in tables:
        op.create_table(
            "rubric_ps_guidance",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column(
                "rubricVersionId",
                sa.String(36),
                sa.ForeignKey(
                    "rubric_versions.id",
                    ondelete="CASCADE",
                    name="fk_rubric_ps_guidance_rubricVersionId",
                ),
                nullable=False,
            ),
            sa.Column(
                "problemStatementId",
                sa.String(36),
                sa.ForeignKey(
                    "problem_statements.id",
                    ondelete="CASCADE",
                    name="fk_rubric_ps_guidance_problemStatementId",
                ),
                nullable=False,
            ),
            sa.Column("decisiveTest", sa.Text(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.UniqueConstraint(
                "rubricVersionId", "problemStatementId", name="uq_rubric_ps_guidance"
            ),
        )
        op.create_index(
            "ix_rubric_ps_guidance_rubricVersionId",
            "rubric_ps_guidance",
            ["rubricVersionId"],
            unique=False,
        )
        op.create_index(
            "ix_rubric_ps_guidance_problemStatementId",
            "rubric_ps_guidance",
            ["problemStatementId"],
            unique=False,
        )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    tables = [t.lower() for t in insp.get_table_names()]
    dialect = conn.dialect.name

    if "rubric_ps_guidance" in tables:
        op.drop_table("rubric_ps_guidance")

    if "rubric_fields" in tables:
        rf_cols = [c["name"].lower() for c in insp.get_columns("rubric_fields")]
        if "problemstatementid" in rf_cols:
            if dialect == "sqlite":
                with op.batch_alter_table("rubric_fields") as batch_op:
                    batch_op.drop_index("ix_rubric_fields_problemStatementId")
                    batch_op.drop_column("problemStatementId")
            else:
                op.drop_index("ix_rubric_fields_problemStatementId", table_name="rubric_fields")
                op.drop_column("rubric_fields", "problemStatementId")
