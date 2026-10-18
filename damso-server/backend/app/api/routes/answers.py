import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import col, select

from app.api.deps import CurrentUser, SessionDep
from app.domain_models import Answer, AudioAsset, ProcessingJob, Question, now_utc
from app.domain_schemas import AnswerCreate, AnswerEdit, AnswerSubmit
from app.domain_service import (
    active_family,
    answer_view,
    notify,
    owned_answer,
    partner,
    today,
    visible_story,
)
from app.processing import ensure_jobs, retry_job
from app.rate_limit import enforce_limit

router = APIRouter(prefix="/answers", tags=["answers"])


@router.post("", status_code=201)
def create_answer(
    body: AnswerCreate, session: SessionDep, current_user: CurrentUser
) -> Any:
    enforce_limit(f"answer:{current_user.id}", limit=30)
    family = active_family(session, current_user.id, lock=True)
    question = session.get(Question, body.question_id)
    if (
        not question
        or question.family_id != family.id
        or question.target_id != current_user.id
        or question.canceled
        or question.available_date > today()
    ):
        raise HTTPException(404, "Answerable question not found")
    if session.exec(select(Answer).where(Answer.question_id == question.id)).first():
        raise HTTPException(409, "An answer already exists for this question")
    if body.audio_id:
        asset = session.get(AudioAsset, body.audio_id)
        if not asset or asset.owner_id != current_user.id:
            raise HTTPException(404, "Audio not found")
        if session.exec(select(Answer).where(Answer.audio_id == body.audio_id)).first():
            raise HTTPException(409, "Audio is already attached to another answer")
    if not body.text and not body.audio_id:
        raise HTTPException(422, "Provide text or an uploaded audio file")
    answer = Answer(
        question_id=question.id,
        family_id=family.id,
        author_id=current_user.id,
        author_role=current_user.role,
        original_text=body.text,
        audio_id=body.audio_id,
    )
    session.add(answer)
    session.flush()
    ensure_jobs(session, answer)
    session.commit()
    return answer_view(session, answer, current_user)


@router.get("/drafts")
def drafts(session: SessionDep, current_user: CurrentUser, limit: int = 30) -> Any:
    items = session.exec(
        select(Answer)
        .where(Answer.author_id == current_user.id, Answer.status == "draft")
        .order_by(col(Answer.updated_at).desc())
        .limit(min(100, max(1, limit)))
    ).all()
    return [answer_view(session, item, current_user) for item in items]


@router.get("/{answer_id}")
def read_answer(
    answer_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    return answer_view(
        session, visible_story(session, answer_id, current_user), current_user
    )


@router.patch("/{answer_id}")
def edit_answer(
    answer_id: uuid.UUID,
    body: AnswerEdit,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    answer = owned_answer(session, answer_id, current_user)
    if answer.status != "draft":
        raise HTTPException(409, "Submitted stories cannot be silently overwritten")
    answer.edited_text = body.text
    answer.revision += 1
    answer.updated_at = now_utc()
    answer.summary_draft = None
    answer.follow_up_question = None
    for job in session.exec(
        select(ProcessingJob).where(
            ProcessingJob.answer_id == answer.id,
            col(ProcessingJob.status).in_(["waiting_provider", "queued"]),
        )
    ):
        job.status = "superseded"
        session.add(job)
    session.add(answer)
    ensure_jobs(session, answer)
    session.commit()
    return answer_view(session, answer, current_user)


@router.post("/{answer_id}/submit")
def submit_answer(
    answer_id: uuid.UUID,
    body: AnswerSubmit,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    family = active_family(session, current_user.id, lock=True)
    answer = owned_answer(session, answer_id, current_user)
    if answer.family_id != family.id:
        raise HTTPException(409, "This answer belongs to an ended connection")
    if answer.status == "submitted":
        return answer_view(session, answer, current_user)
    text = body.text or answer.edited_text or answer.original_text or answer.transcript
    if not text and not (answer.audio_id and body.share_audio):
        raise HTTPException(
            422, "Provide the text to share, or explicitly share the original audio"
        )
    answer.published_text = text
    answer.share_audio = bool(answer.audio_id and body.share_audio)
    answer.title = body.title or (text[:40] if text else "목소리로 남긴 이야기")
    answer.story_date = today()
    answer.status = "submitted"
    answer.updated_at = now_utc()
    session.add(answer)
    other = partner(session, family.id, current_user.id)
    if other:
        notify(session, other.id, "story_shared", answer.id)
    session.commit()
    return answer_view(session, answer, current_user)


@router.delete("/{answer_id}")
def delete_answer(
    answer_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    answer = owned_answer(session, answer_id, current_user)
    session.delete(answer)
    session.commit()
    return {"status": "deleted"}


@router.get("/{answer_id}/processing")
def processing_status(
    answer_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    answer = owned_answer(session, answer_id, current_user)
    return {
        "providers": {"stt": "not_configured", "llm": "not_configured"},
        "jobs": session.exec(
            select(ProcessingJob)
            .where(ProcessingJob.answer_id == answer.id)
            .order_by(col(ProcessingJob.created_at))
        ).all(),
    }


@router.post("/{answer_id}/processing")
def request_processing(
    answer_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    enforce_limit(f"process:{current_user.id}", limit=10)
    answer = owned_answer(session, answer_id, current_user)
    jobs = ensure_jobs(session, answer)
    session.commit()
    return {"status": "waiting_provider", "jobs": jobs}


@router.post("/{answer_id}/processing/{job_id}/retry")
def retry_processing(
    answer_id: uuid.UUID,
    job_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    enforce_limit(f"process:{current_user.id}", limit=10)
    answer = owned_answer(session, answer_id, current_user)
    try:
        result = retry_job(session, answer, job_id)
    except ValueError:
        raise HTTPException(404, "Job not found") from None
    session.commit()
    return result
