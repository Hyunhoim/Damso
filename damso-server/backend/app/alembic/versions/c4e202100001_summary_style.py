"""Store the author's first-person summary style preference."""
from alembic import op
import sqlalchemy as sa

revision = "c4e202100001"
down_revision = "c3e202100001"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("user", sa.Column("summary_style", sa.String(24), nullable=False, server_default="diary"))
    op.create_check_constraint("ck_user_summary_style", "user", "summary_style IN ('diary', 'conversational', 'formal')")
    op.alter_column("user", "summary_style", server_default=None)

def downgrade():
    op.drop_constraint("ck_user_summary_style", "user", type_="check")
    op.drop_column("user", "summary_style")
