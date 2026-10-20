"""Story photos and separate AI/family follow-up slots within the daily cap."""
from alembic import op
import sqlalchemy as sa

revision = "c8e202100001"
down_revision = "c7e202100001"
branch_labels = None
depends_on = None

def upgrade():
    op.drop_constraint("uq_follow_up_user_day", "dailyfollowup", type_="unique")
    op.create_unique_constraint("uq_follow_up_user_day_kind", "dailyfollowup", ["user_id", "day", "kind"])
    op.create_table("storyphoto",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("answer_id", sa.Uuid(), sa.ForeignKey("answer.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_storyphoto_answer_id", "storyphoto", ["answer_id"])
    op.create_index("ix_storyphoto_owner_id", "storyphoto", ["owner_id"])

def downgrade():
    op.drop_table("storyphoto")
    # Two kinds may share a date after this upgrade; retain the oldest slot on rollback.
    op.execute("DELETE FROM dailyfollowup a USING dailyfollowup b WHERE a.user_id=b.user_id AND a.day=b.day AND (a.created_at,a.id)>(b.created_at,b.id)")
    op.drop_constraint("uq_follow_up_user_day_kind", "dailyfollowup", type_="unique")
    op.create_unique_constraint("uq_follow_up_user_day", "dailyfollowup", ["user_id", "day"])
