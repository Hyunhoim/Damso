"""Explicit sharing for original text; existing private sources stay private."""

from alembic import op
import sqlalchemy as sa

revision = "c9e202100001"
down_revision = "c8e202100001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "answer",
        sa.Column(
            "share_original", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.alter_column("answer", "share_original", server_default=None)


def downgrade():
    op.drop_column("answer", "share_original")
