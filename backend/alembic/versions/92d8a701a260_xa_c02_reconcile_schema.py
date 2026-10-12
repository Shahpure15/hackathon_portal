"""XA-C02 reconcile schema

Revision ID: 92d8a701a260
Revises: 0b6fdb7ea99f
Create Date: 2026-10-12 10:37:17.578532

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '92d8a701a260'
down_revision: Union[str, Sequence[str], None] = '0b6fdb7ea99f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    tables = [t.lower() for t in insp.get_table_names()]
    dialect = conn.dialect.name

    # 1. volunteer_attendance_records table
    if "volunteer_attendance_records" not in tables:
        op.create_table(
            "volunteer_attendance_records",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("volunteerId", sa.String(36), sa.ForeignKey("volunteers.id", ondelete="CASCADE", name="fk_var_volunteerId_volunteers"), nullable=False),
            sa.Column("checkpointTypeId", sa.String(36), sa.ForeignKey("checkpoint_types.id", ondelete="CASCADE", name="fk_var_checkpointTypeId_checkpoint_types"), nullable=False),
            sa.Column("markedBy", sa.String(100), nullable=False),
            sa.Column("timestamp", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint("volunteerId", "checkpointTypeId", name="uq_volunteer_checkpoint"),
        )

    # 2. events.status column
    if "events" in tables:
        events_cols = [c["name"].lower() for c in insp.get_columns("events")]
        if "status" not in events_cols:
            if dialect == "sqlite":
                with op.batch_alter_table("events") as batch_op:
                    batch_op.add_column(
                        sa.Column("status", sa.String(20), server_default="active", nullable=False)
                    )
            else:
                op.add_column(
                    "events",
                    sa.Column("status", sa.String(20), server_default="active", nullable=False)
                )

    # 3. Postgres column type widenings
    if dialect == "postgresql":
        if "volunteers" in tables:
            vol_cols = {c["name"].lower(): c for c in insp.get_columns("volunteers")}
            if "type" in vol_cols:
                col_type = vol_cols["type"]["type"]
                length = getattr(col_type, "length", None)
                if length is not None and length < 100:
                    op.execute(sa.text('ALTER TABLE volunteers ALTER COLUMN "type" TYPE VARCHAR(100)'))

        if "problem_statements" in tables:
            ps_cols = {c["name"].lower(): c for c in insp.get_columns("problem_statements")}
            if "description" in ps_cols:
                desc_type = ps_cols["description"]["type"]
                if not isinstance(desc_type, sa.Text):
                    op.execute(sa.text('ALTER TABLE problem_statements ALTER COLUMN "description" TYPE TEXT'))

    # 4. ix_email_batches_eventId index
    if "email_batches" in tables:
        batch_indexes = [idx["name"].lower() for idx in insp.get_indexes("email_batches") if idx.get("name")]
        if "ix_email_batches_eventid" not in batch_indexes:
            op.create_index(
                "ix_email_batches_eventId",
                "email_batches",
                ["eventId"],
                unique=False
            )


def downgrade() -> None:
    # Downgrade is intentionally a documented no-op because this is an idempotent
    # schema reconciliation migration that brings fresh databases into parity with
    # what existing production databases already have. Reverting these additions
    # would destroy production operational tables and columns.
    pass
