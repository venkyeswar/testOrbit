"""initial schema: users, model configs, projects, tests, runs

Revision ID: 0001
Revises:
"""
import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "model_configs",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("provider", sa.String(40), nullable=False),
        sa.Column("model", sa.String(200), nullable=False),
        sa.Column("base_url", sa.String(500)),
        sa.Column("api_version", sa.String(40)),
        sa.Column("deployment", sa.String(200)),
        sa.Column("temperature", sa.Float, nullable=False),
        sa.Column("is_default", sa.Boolean, nullable=False),
        sa.Column("api_key_enc", sa.Text),
        sa.Column("api_key_hint", sa.String(40)),
        sa.Column("created_at", sa.String(40), nullable=False),
    )
    op.create_index("ix_model_configs_user_id", "model_configs", ["user_id"])

    op.create_table(
        "projects",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("model_config_id", sa.String(32), sa.ForeignKey("model_configs.id", ondelete="SET NULL")),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("base_url", sa.String(500), nullable=False),
        sa.Column("spec_url", sa.String(1000)),
        sa.Column("spec", sa.JSON, nullable=False),
        sa.Column("endpoints", sa.JSON, nullable=False),
        sa.Column("auth", sa.JSON, nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
    )
    op.create_index("ix_projects_user_id", "projects", ["user_id"])

    op.create_table(
        "test_cases",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("project_id", sa.String(32), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order", sa.Integer, nullable=False),
        sa.Column("approved", sa.Boolean, nullable=False),
        sa.Column("data", sa.JSON, nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
    )
    op.create_index("ix_test_cases_project_id", "test_cases", ["project_id"])

    op.create_table(
        "runs",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("project_id", sa.String(32), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("started_at", sa.String(40), nullable=False),
        sa.Column("finished_at", sa.String(40)),
        sa.Column("summary", sa.JSON, nullable=False),
        sa.Column("auth", sa.JSON),
        sa.Column("results", sa.JSON, nullable=False),
        sa.Column("error", sa.Text),
    )
    op.create_index("ix_runs_project_id", "runs", ["project_id"])


def downgrade() -> None:
    for table in ("runs", "test_cases", "projects", "model_configs", "users"):
        op.drop_table(table)
