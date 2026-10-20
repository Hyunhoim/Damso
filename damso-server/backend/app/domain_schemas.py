import uuid
from datetime import date, time
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.summary_styles import SummaryStyle

NonemptyText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class InviteCode(StrictInput):
    code: str = Field(pattern=r"^[A-HJ-NP-Z2-9]{6}$")


class FamilySettingsUpdate(StrictInput):
    parent_label: Literal["부모님", "엄마", "아빠", "어머니", "아버지"]


class ProfileUpdate(StrictInput):
    full_name: NonemptyText | None = Field(default=None, max_length=50)
    role: Literal["parent", "child"] | None = None
    text_scale: float | None = Field(default=None, ge=1.0, le=1.5)
    reminder_time: time | None = None
    notifications_enabled: bool | None = None
    summary_style: SummaryStyle | None = None


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
    share_original: bool = False
    use_summary: bool = True


class AnswerSharing(StrictInput):
    share_original: bool | None = None
    share_audio: bool | None = None


class CommentInput(StrictInput):
    text: NonemptyText = Field(max_length=2000)


class RefreshInput(StrictInput):
    refresh_token: str = Field(min_length=32, max_length=256)


class AnswerReplacement(StrictInput):
    text: NonemptyText | None = Field(default=None, max_length=20000)
    audio_id: uuid.UUID | None = None


class ModelResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["ready", "no_story", "declined"]
    title: str = Field(max_length=40)
    summary: str = Field(max_length=10000)
    follow_up_question: NonemptyText | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def consistent_result(self) -> ModelResult:
        self.title = self.title.strip()
        self.summary = self.summary.strip()
        if "\n" in self.title or "\r" in self.title:
            raise ValueError("Title must be a single heading")
        if self.status == "ready" and (not self.summary or not self.title):
            raise ValueError("Ready results require a title and summary")
        if self.status != "ready" and (
            self.title or self.summary or self.follow_up_question
        ):
            raise ValueError("Non-story results must not contain a summary or question")
        return self
