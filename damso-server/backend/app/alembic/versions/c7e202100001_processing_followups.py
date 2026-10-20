"""Structured organization outcomes, preserved inputs, and daily follow-ups."""
from alembic import op
import sqlalchemy as sa

revision="c7e202100001"
down_revision="c6e202100001"
branch_labels=None
depends_on=None


def upgrade():
    op.add_column("answer",sa.Column("organization_status",sa.String(16),nullable=True))
    op.add_column("answer",sa.Column("skipped",sa.Boolean(),nullable=False,server_default=sa.false()))
    op.alter_column("answer","skipped",server_default=None)
    op.create_check_constraint("ck_answer_organization","answer","organization_status IS NULL OR organization_status IN ('ready','no_story','declined')")
    op.drop_constraint("ck_question_source","question",type_="check")
    op.create_check_constraint("ck_question_source","question","source IN ('daily','custom','follow_up')")
    op.create_table("answerinputrevision",sa.Column("id",sa.Uuid(),primary_key=True),sa.Column("answer_id",sa.Uuid(),sa.ForeignKey("answer.id",ondelete="CASCADE"),nullable=False),sa.Column("revision",sa.Integer(),nullable=False),sa.Column("audio_id",sa.Uuid(),sa.ForeignKey("audioasset.id",ondelete="SET NULL")),sa.Column("original_text",sa.Text()),sa.Column("transcript",sa.Text()),sa.Column("edited_text",sa.Text()),sa.Column("created_at",sa.DateTime(timezone=True),nullable=False))
    op.create_index("ix_answerinputrevision_answer_id","answerinputrevision",["answer_id"])
    op.create_table("dailyfollowup",sa.Column("id",sa.Uuid(),primary_key=True),sa.Column("user_id",sa.Uuid(),sa.ForeignKey("user.id",ondelete="CASCADE"),nullable=False),sa.Column("family_id",sa.Uuid(),sa.ForeignKey("family.id",ondelete="CASCADE"),nullable=False),sa.Column("day",sa.Date(),nullable=False),sa.Column("kind",sa.String(16),nullable=False),sa.Column("source_answer_id",sa.Uuid(),sa.ForeignKey("answer.id",ondelete="SET NULL")),sa.Column("question_id",sa.Uuid(),sa.ForeignKey("question.id",ondelete="SET NULL")),sa.Column("created_by",sa.Uuid(),sa.ForeignKey("user.id",ondelete="SET NULL")),sa.Column("created_at",sa.DateTime(timezone=True),nullable=False),sa.UniqueConstraint("user_id","day",name="uq_follow_up_user_day"),sa.CheckConstraint("kind IN ('ai','family')",name="ck_follow_up_kind"))
    op.create_index("ix_dailyfollowup_user_id","dailyfollowup",["user_id"])


def downgrade():
    op.drop_table("dailyfollowup")
    op.drop_table("answerinputrevision")
    op.execute("DELETE FROM question WHERE source='follow_up'")
    op.drop_constraint("ck_question_source","question",type_="check")
    op.create_check_constraint("ck_question_source","question","source IN ('daily','custom')")
    op.drop_constraint("ck_answer_organization","answer",type_="check")
    op.drop_column("answer","skipped")
    op.drop_column("answer","organization_status")
