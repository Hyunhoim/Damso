import uuid
from datetime import UTC, date, datetime
from typing import cast

from sqlalchemy import CheckConstraint, Column, DateTime, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


def now_utc() -> datetime:
    return datetime.now(UTC)


def timestamp() -> datetime:
    return cast(
        datetime,
        Field(
            default_factory=now_utc,
            sa_column=Column(DateTime(timezone=True), nullable=False),
        ),
    )


class AuthSession(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    refresh_hash: str = Field(unique=True, max_length=64)
    expires_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    revoked: bool = False
    token_version: int = 0
    created_at: datetime = timestamp()


class Family(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = timestamp()
    ended_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True))
    )


class FamilyMember(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("family_id", "role", name="uq_family_role"),
        CheckConstraint("role IN ('parent', 'child')", name="ck_member_role"),
    )
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    family_id: uuid.UUID = Field(
        foreign_key="family.id", ondelete="CASCADE", index=True
    )
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", unique=True)
    role: str = Field(max_length=16)


class FamilyInvite(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    family_id: uuid.UUID = Field(
        foreign_key="family.id", ondelete="CASCADE", index=True
    )
    issuer_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE")
    code_hash: str = Field(unique=True, max_length=64)
    expires_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    used: bool = False


class QuestionBank(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    seed_key: str = Field(unique=True, max_length=64)
    role: str = Field(max_length=16)
    text: str = Field(max_length=500)
    enabled: bool = True


class Question(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint(
            "family_id", "target_id", "daily_date", name="uq_daily_question"
        ),
        CheckConstraint("source IN ('daily', 'custom')", name="ck_question_source"),
    )
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    family_id: uuid.UUID = Field(
        foreign_key="family.id", ondelete="CASCADE", index=True
    )
    target_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    created_by: uuid.UUID | None = Field(
        default=None, foreign_key="user.id", ondelete="SET NULL"
    )
    text: str = Field(max_length=500)
    source: str = Field(max_length=16)
    daily_date: date | None = None
    available_date: date
    canceled: bool = False
    created_at: datetime = timestamp()


class AudioAsset(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    media_type: str = Field(max_length=80)
    size_bytes: int
    duration_seconds: float | None = None
    created_at: datetime = timestamp()


class Answer(SQLModel, table=True):
    __table_args__ = (
        CheckConstraint("status IN ('draft', 'submitted')", name="ck_answer_status"),
    )
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    question_id: uuid.UUID = Field(
        foreign_key="question.id", ondelete="CASCADE", unique=True
    )
    family_id: uuid.UUID = Field(
        foreign_key="family.id", ondelete="CASCADE", index=True
    )
    author_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    author_role: str = Field(max_length=16)
    audio_id: uuid.UUID | None = Field(
        default=None, foreign_key="audioasset.id", ondelete="SET NULL"
    )
    original_text: str | None = Field(default=None, sa_column=Column(Text))
    transcript: str | None = Field(default=None, sa_column=Column(Text))
    edited_text: str | None = Field(default=None, sa_column=Column(Text))
    summary_draft: str | None = Field(default=None, sa_column=Column(Text))
    follow_up_question: str | None = Field(default=None, max_length=500)
    published_text: str | None = Field(default=None, sa_column=Column(Text))
    title: str | None = Field(default=None, max_length=100)
    status: str = Field(default="draft", max_length=16)
    share_audio: bool = False
    revision: int = 1
    story_date: date | None = Field(default=None, index=True)
    created_at: datetime = timestamp()
    updated_at: datetime = timestamp()


class ProcessingJob(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint(
            "answer_id", "kind", "revision", name="uq_answer_job_revision"
        ),
        CheckConstraint("kind IN ('stt', 'llm')", name="ck_job_kind"),
        CheckConstraint(
            "status IN ('waiting_provider','queued','running','succeeded','failed','superseded')",
            name="ck_job_status",
        ),
    )
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    answer_id: uuid.UUID = Field(
        foreign_key="answer.id", ondelete="CASCADE", index=True
    )
    kind: str = Field(max_length=16)
    revision: int
    status: str = Field(default="waiting_provider", max_length=32)
    error_code: str | None = Field(default=None, max_length=64)
    attempts: int = 0
    created_at: datetime = timestamp()
    updated_at: datetime = timestamp()


class StoryComment(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    answer_id: uuid.UUID = Field(
        foreign_key="answer.id", ondelete="CASCADE", index=True
    )
    author_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE")
    text: str = Field(max_length=2000)
    created_at: datetime = timestamp()


class StoryReaction(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("answer_id", "user_id", name="uq_story_reaction"),
    )
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    answer_id: uuid.UUID = Field(
        foreign_key="answer.id", ondelete="CASCADE", index=True
    )
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE")


class Notification(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    kind: str = Field(max_length=32)
    resource_id: uuid.UUID | None = None
    read: bool = False
    created_at: datetime = timestamp()


class RateBucket(SQLModel, table=True):
    key: str = Field(primary_key=True, max_length=64)
    count: int = 1
    expires_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )
