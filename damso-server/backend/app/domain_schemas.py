import uuid
from datetime import date, time
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

NonemptyText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class InviteCode(StrictInput):
    code: str = Field(pattern=r"^[A-HJ-NP-Z2-9]{6}$")


class ProfileUpdate(StrictInput):
    full_name: NonemptyText | None = Field(default=None, max_length=50)
    role: Literal["parent", "child"] | None = None
    text_scale: float | None = Field(default=None, ge=1.0, le=1.5)
    reminder_time: time | None = None
    notifications_enabled: bool | None = None


class CustomQuestionInput(StrictInput):
    text: NonemptyText = Field(max_length=500)
    available_date: date | None = None


class AnswerCreate(StrictInput):
    question_id: uuid.UUID
    text: NonemptyText | None = Field(default=None, max_length=20000)
    audio_id: uuid.UUID | None = None


class AnswerEdit(StrictInput):
    text: NonemptyText = Field(max_length=20000)


class AnswerSubmit(StrictInput):
    title: NonemptyText | None = Field(default=None, max_length=100)
    text: NonemptyText | None = Field(default=None, max_length=20000)
    share_audio: bool = False


class CommentInput(StrictInput):
    text: NonemptyText = Field(max_length=2000)


class RefreshInput(StrictInput):
    refresh_token: str = Field(min_length=32, max_length=256)


class ModelResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: NonemptyText = Field(max_length=10000)
    follow_up_question: NonemptyText | None = Field(default=None, max_length=500)
