"""background runs: store selected tests and live progress

Revision ID: 0002
Revises: 0001
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("runs") as batch:
        batch.add_column(sa.Column("test_ids", sa.JSON))
        batch.add_column(sa.Column("progress", sa.JSON))


def downgrade() -> None:
    with op.batch_alter_table("runs") as batch:
        batch.drop_column("progress")
        batch.drop_column("test_ids")
