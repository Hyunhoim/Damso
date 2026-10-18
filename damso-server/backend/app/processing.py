import uuid
from pathlib import Path
from typing import Protocol

from pydantic import ValidationError
from sqlmodel import Session, col, select

from app.core.config import settings
from app.core.db import engine
from app.domain_models import Answer, ProcessingJob, now_utc
from app.domain_schemas import ModelResult


class STTProvider(Protocol):
    def transcribe(self, audio: Path, *, language: str) -> str: ...


class LLMProvider(Protocol):
    def organize(self, *, question: str, original_text: str) -> ModelResult: ...


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
                answer_id=answer.id, kind=kind, revision=answer.revision
            )
            session.add(job)
            session.flush()
        jobs.append(job)
    return jobs


def process_one(
    *, stt: STTProvider | None = None, llm: LLMProvider | None = None
) -> bool:
    """Providers are deliberately absent until a model is chosen; no fake outputs."""
    enabled = (["stt"] if stt else []) + (["llm"] if llm else [])
    if not enabled:
        return False
    # Lock one answer so workers and edits cannot apply conflicting revisions.
    with Session(engine) as session:
        job = session.exec(
            select(ProcessingJob)
            .join(Answer, col(Answer.id) == col(ProcessingJob.answer_id))
            .where(
                col(ProcessingJob.kind).in_(enabled),
                col(ProcessingJob.status).in_(["waiting_provider", "queued"]),
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
        else:
            job.attempts += 1
            try:
                if job.kind == "stt" and stt and answer.audio_id:
                    text = stt.transcribe(
                        settings.STORAGE_ROOT / f"{answer.audio_id}.bin", language="ko"
                    )
                    if (
                        not isinstance(text, str)
                        or not text.strip()
                        or len(text) > 20000
                    ):
                        raise ValueError("Invalid transcription")
                    answer.transcript = text.strip()
                    ensure_jobs(session, answer)
                elif job.kind == "llm" and llm:
                    from app.domain_models import Question

                    question = session.get(Question, answer.question_id)
                    result = ModelResult.model_validate(
                        llm.organize(
                            question=question.text if question else "",
                            original_text=answer.edited_text
                            or answer.original_text
                            or answer.transcript
                            or "",
                        )
                    )
                    answer.summary_draft = result.summary
                    answer.follow_up_question = result.follow_up_question
                else:
                    raise ValueError("Provider input missing")
                job.status = "succeeded"
                job.error_code = None
                session.add(answer)
            except ValueError, ValidationError:
                job.status = "failed"
                job.error_code = "INVALID_PROVIDER_OUTPUT"
            except Exception:
                # Never expose provider exceptions: they may contain keys or transcripts.
                job.status = "failed"
                job.error_code = "PROVIDER_FAILED"
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
