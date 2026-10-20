"""Replace mandatory onboarding styles with source-tone preservation."""
from alembic import op

revision = "c5e202100001"
down_revision = "c4e202100001"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint("ck_user_summary_style", "user", type_="check")
    op.create_check_constraint(
        "ck_user_summary_style", "user",
        "summary_style IN ('auto', 'diary', 'conversational', 'formal')",
    )
    # The retired mandatory choice must not silently opt users into a fixed style.
    op.execute('UPDATE "user" SET summary_style = \'auto\'')


def downgrade():
    op.execute('UPDATE "user" SET summary_style = \'diary\' WHERE summary_style = \'auto\'')
    op.drop_constraint("ck_user_summary_style", "user", type_="check")
    op.create_check_constraint(
        "ck_user_summary_style", "user",
        "summary_style IN ('diary', 'conversational', 'formal')",
    )
