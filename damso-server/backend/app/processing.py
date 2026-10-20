import uuid
from datetime import timedelta
from pathlib import Path
from typing import Protocol

from pydantic import ValidationError
from sqlmodel import Session, col, select

from app.core.config import settings
from app.core.db import engine
from app.domain_models import Answer, Family, ProcessingJob, Question, now_utc
from app.domain_schemas import ModelResult
from app.follow_ups import issue_ai_follow_up
from app.llm import ProviderError, provider_status
from app.models import User
from app.summary_styles import SummaryStyle


class STTProvider(Protocol):
    def transcribe(self, audio: Path, *, language: str) -> str: ...


class LLMProvider(Protocol):
    def organize(
        self,
        *,
        question: str,
        original_text: str,
        author_name: str,
        summary_style: SummaryStyle,
    ) -> ModelResult: ...


def ensure_jobs(session: Session, answer: Answer) -> list[ProcessingJob]:
    kinds = (
        ["stt"]
        if answer.audio_id
        and not answer.transcript
        and not answer.edited_text
        and not answer.original_text
        else ["llm"]
    )
    jobs = []
    for kind in kinds:
        job = session.exec(
            select(ProcessingJob).where(
                ProcessingJob.answer_id == answer.id,
                ProcessingJob.kind == kind,
                ProcessingJob.revision == answer.revision,
            )
        ).first()
        if not job:
            job = ProcessingJob(
                answer_id=answer.id,
                kind=kind,
                revision=answer.revision,
                status="queued"
                if provider_status()[kind] == "configured"
                else "waiting_provider",
            )
            session.add(job)
            session.flush()
        jobs.append(job)
    return jobs


def process_one(
    *, stt: STTProvider | None = None, llm: LLMProvider | None = None
) -> bool:
    """Claim briefly, call outside the transaction, then apply only to that revision."""
    enabled = (["stt"] if stt else []) + (["llm"] if llm else [])
    if not enabled:
        return False
    with Session(engine) as session:
        job = session.exec(
            select(ProcessingJob)
            .join(Answer, col(Answer.id) == col(ProcessingJob.answer_id))
            .where(
                col(ProcessingJob.kind).in_(enabled),
                col(ProcessingJob.status).in_(["waiting_provider", "queued"])
                | (
                    (col(ProcessingJob.status) == "running")
                    & (col(ProcessingJob.updated_at) < now_utc() - timedelta(minutes=3))
                ),
            )
            .order_by(col(ProcessingJob.created_at))
            .limit(1)
            .with_for_update(skip_locked=True, of=Answer)
        ).first()
        if not job:
            return False
        answer = session.exec(
            select(Answer).where(Answer.id == job.answer_id).with_for_update()
        ).first()
        if not answer or answer.revision != job.revision:
            job.status = "superseded"
            session.add(job)
            session.commit()
            return True
        if job.attempts >= 3:
            job.status = "failed"
            job.error_code = "ATTEMPT_LIMIT"
            session.add(job)
            session.commit()
            return True
        question = session.get(Question, answer.question_id)
        question_text = question.text if question else ""
        author = session.get(User, answer.author_id)
        author_name = author.full_name or "" if author else ""
        summary_style: SummaryStyle = author.summary_style if author else "auto"
        source = answer.edited_text or answer.original_text or answer.transcript or ""
        audio_path = (
            settings.STORAGE_ROOT / f"{answer.audio_id}.bin"
            if answer.audio_id
            else None
        )
        job_id, answer_id, revision, kind = job.id, answer.id, job.revision, job.kind
        family_id = answer.family_id
        job.status = "running"
        job.attempts += 1
        claimed_attempt = job.attempts
        job.updated_at = now_utc()
        session.add(job)
        session.commit()

    transcription = None
    result = None
    error = None
    try:
        if kind == "stt" and stt and audio_path:
            transcription = stt.transcribe(audio_path, language="ko")
            if (
                not isinstance(transcription, str)
                or not transcription.strip()
                or len(transcription) > 20000
            ):
                raise ValueError("Invalid transcription")
        elif kind == "llm" and llm:
            result = ModelResult.model_validate(
                llm.organize(
                    question=question_text,
                    original_text=source,
                    author_name=author_name,
                    summary_style=summary_style,
                )
            )
        else:
            raise ValueError("Provider input missing")
    except ProviderError as exc:
        error = exc.code
    except ValueError, ValidationError:
        error = "INVALID_PROVIDER_OUTPUT"
    except Exception:
        # Do not store raw provider errors; they can contain credentials or source text.
        error = "PROVIDER_FAILED"

    with Session(engine) as session:
        # Match API lock order: family before answer, with no network under either lock.
        session.exec(
            select(Family).where(Family.id == family_id).with_for_update()
        ).first()
        answer = session.exec(
            select(Answer).where(Answer.id == answer_id).with_for_update()
        ).first()
        job = session.get(ProcessingJob, job_id)
        if not answer or not job:
            return True
        if answer.revision != revision or job.status == "superseded":
            job.status = "superseded"
        elif job.status != "running" or job.attempts != claimed_attempt:
            return True
        elif error:
            job.status = "failed"
            job.error_code = error
        else:
            if transcription:
                answer.transcript = transcription.strip()
                ensure_jobs(session, answer)
            if result:
                if answer.status == "draft":
                    answer.title = result.title if result.status == "ready" else None
                answer.organization_status = result.status
                answer.summary_draft = (
                    result.summary if result.status == "ready" else None
                )
                answer.follow_up_question = (
                    issue_ai_follow_up(session, answer, result.follow_up_question)
                    if result.status == "ready"
                    else None
                )
            answer.updated_at = now_utc()
            session.add(answer)
            job.status = "succeeded"
            job.error_code = None
        job.updated_at = now_utc()
        session.add(job)
        session.commit()
        return True


def retry_job(session: Session, answer: Answer, job_id: uuid.UUID) -> ProcessingJob:
    job = session.get(ProcessingJob, job_id)
    if not job or job.answer_id != answer.id or job.revision != answer.revision:
        raise ValueError("Job not found for current answer revision")
    if job.status == "failed" and job.attempts < 3:
        job.status = "waiting_provider"
        job.error_code = None
        session.add(job)
    return job
