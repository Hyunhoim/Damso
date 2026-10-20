"""Keep automatic tone and the plain diary style only."""
from alembic import op

revision = "c6e202100001"
down_revision = "c5e202100001"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("UPDATE \"user\" SET summary_style = 'auto' WHERE summary_style IN ('conversational', 'formal')")
    op.drop_constraint("ck_user_summary_style", "user", type_="check")
    op.create_check_constraint("ck_user_summary_style", "user", "summary_style IN ('auto', 'diary')")


def downgrade():
    op.drop_constraint("ck_user_summary_style", "user", type_="check")
    op.create_check_constraint("ck_user_summary_style", "user", "summary_style IN ('auto', 'diary', 'conversational', 'formal')")
