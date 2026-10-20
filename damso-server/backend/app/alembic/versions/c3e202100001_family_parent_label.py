"""Store the child's display preference on the current family membership."""

from alembic import op
import sqlalchemy as sa

revision = "c3e202100001"
down_revision = "c2d191100001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "familymember",
        sa.Column("parent_label", sa.String(16), nullable=False, server_default="부모님"),
    )
    op.create_check_constraint(
        "ck_member_parent_label",
        "familymember",
        "parent_label IN ('부모님', '엄마', '아빠', '어머니', '아버지')",
    )
    op.alter_column("familymember", "parent_label", server_default=None)


def downgrade():
    op.drop_constraint("ck_member_parent_label", "familymember", type_="check")
    op.drop_column("familymember", "parent_label")
