"""Persist authentication version and the role at story creation."""
from alembic import op
import sqlalchemy as sa

revision = "c2d191100001"
down_revision = "c1f89e026c01"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("authsession", sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"))
    op.execute('UPDATE authsession SET token_version = "user".token_version FROM "user" WHERE "user".id = authsession.user_id')
    op.add_column("answer", sa.Column("author_role", sa.String(16), nullable=True))
    op.execute('UPDATE answer SET author_role = "user".role FROM "user" WHERE "user".id = answer.author_id')
    op.alter_column("answer", "author_role", nullable=False)


def downgrade():
    op.drop_column("answer", "author_role")
    op.drop_column("authsession", "token_version")
