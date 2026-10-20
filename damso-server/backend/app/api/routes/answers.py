import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import col, select

from app.api.deps import CurrentUser, SessionDep
from app.core.config import settings
from app.domain_models import (
    Answer,
    AnswerInputRevision,
    AudioAsset,
    DailyFollowUp,
    ProcessingJob,
    Question,
    StoryPhoto,
    now_utc,
)
from app.domain_schemas import (
    AnswerCreate,
    AnswerEdit,
    AnswerReplacement,
    AnswerSharing,
    AnswerSubmit,
)
from app.domain_service import (
    active_family,
    answer_view,
    notify,
    owned_answer,
    partner,
    today,
    visible_story,
)
from app.llm import provider_status
from app.processing import ensure_jobs, retry_job
from app.question_budget import extra_question_ids
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
    if question.source != "daily" and question.id not in extra_question_ids(
        session, current_user.id, today()
    ):
        raise HTTPException(409, "This question is not in today's question budget")
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
        .where(
            Answer.author_id == current_user.id,
            Answer.status == "draft",
            col(Answer.skipped).is_(False),
        )
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
    answer.title = None
    answer.summary_draft = None
    answer.organization_status = None
    answer.skipped = False
    answer.follow_up_question = None
    for job in session.exec(
        select(ProcessingJob).where(
            ProcessingJob.answer_id == answer.id,
            col(ProcessingJob.status).in_(["waiting_provider", "queued", "running"]),
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
    if answer.organization_status in {"no_story", "declined"} or answer.skipped:
        raise HTTPException(409, "Provide a new answer before publishing this draft")
    text = (
        body.text
        or (answer.summary_draft if body.use_summary else None)
        or answer.edited_text
        or answer.original_text
        or answer.transcript
    )
    if not text and not (answer.audio_id and body.share_audio):
        raise HTTPException(
            422, "Provide the text to share, or explicitly share the original audio"
        )
    answer.published_text = text
    answer.share_audio = bool(answer.audio_id and body.share_audio)
    answer.share_original = body.share_original
    answer.title = (
        body.title
        or answer.title
        or ("오늘의 이야기" if text else "목소리로 남긴 이야기")
    )
    answer.story_date = today()
    answer.status = "submitted"
    answer.updated_at = now_utc()
    session.add(answer)
    other = partner(session, family.id, current_user.id)
    if other:
        notify(session, other.id, "story_shared", answer.id)
    session.commit()
    return answer_view(session, answer, current_user)


@router.patch("/{answer_id}/sharing")
def update_sharing(
    answer_id: uuid.UUID,
    body: AnswerSharing,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    family = (
        active_family(session, current_user.id, lock=True)
        if body.share_original or body.share_audio
        else None
    )
    answer = owned_answer(session, answer_id, current_user)
    if answer.status != "submitted":
        raise HTTPException(409, "Publish the story before changing sharing")
    if body.share_original is None and body.share_audio is None:
        raise HTTPException(422, "Choose the original text or audio sharing setting")
    if family and answer.family_id != family.id:
        raise HTTPException(409, "This story belongs to an ended connection")
    if body.share_audio and not answer.audio_id:
        raise HTTPException(422, "This story has no original recording")
    if body.share_original is not None:
        answer.share_original = body.share_original
    if body.share_audio is not None:
        answer.share_audio = body.share_audio
    answer.updated_at = now_utc()
    session.add(answer)
    session.commit()
    return answer_view(session, answer, current_user)


@router.delete("/{answer_id}")
def delete_answer(
    answer_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    answer = owned_answer(session, answer_id, current_user)
    for slot in session.exec(
        select(DailyFollowUp).where(DailyFollowUp.source_answer_id == answer.id)
    ).all():
        question = session.get(Question, slot.question_id) if slot.question_id else None
        if question:
            question.canceled = True
            session.add(question)
    photo_ids = session.exec(
        select(StoryPhoto.id).where(StoryPhoto.answer_id == answer.id)
    ).all()
    session.delete(answer)
    session.commit()
    for photo_id in photo_ids:
        (settings.STORAGE_ROOT / f"{photo_id}.jpg").unlink(missing_ok=True)
    return {"status": "deleted"}


@router.get("/{answer_id}/processing")
def processing_status(
    answer_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    answer = owned_answer(session, answer_id, current_user)
    return {
        "providers": provider_status(),
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
    return {"status": jobs[0].status if jobs else "waiting_provider", "jobs": jobs}


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


@router.post("/{answer_id}/replace-input")
def replace_input(
    answer_id: uuid.UUID,
    body: AnswerReplacement,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    enforce_limit(f"replace-answer:{current_user.id}", limit=20)
    active_family(session, current_user.id, lock=True)
    answer = owned_answer(session, answer_id, current_user)
    if answer.status != "draft":
        raise HTTPException(409, "Submitted stories cannot be replaced")
    family = active_family(session, current_user.id)
    if answer.family_id != family.id:
        raise HTTPException(409, "This answer belongs to an ended connection")
    if bool(body.text) == bool(body.audio_id):
        raise HTTPException(422, "Choose either text or a new recording")
    if body.audio_id:
        asset = session.get(AudioAsset, body.audio_id)
        if not asset or asset.owner_id != current_user.id:
            raise HTTPException(404, "Audio not found")
        if session.exec(select(Answer).where(Answer.audio_id == body.audio_id)).first():
            raise HTTPException(409, "Recording is already attached")
    session.add(
        AnswerInputRevision(
            answer_id=answer.id,
            revision=answer.revision,
            audio_id=answer.audio_id,
            original_text=answer.original_text,
            transcript=answer.transcript,
            edited_text=answer.edited_text,
        )
    )
    answer.audio_id = body.audio_id
    answer.original_text = body.text
    answer.title = None
    answer.transcript = answer.edited_text = answer.summary_draft = None
    answer.follow_up_question = answer.organization_status = None
    answer.skipped = False
    answer.revision += 1
    answer.updated_at = now_utc()
    for job in session.exec(
        select(ProcessingJob).where(
            ProcessingJob.answer_id == answer.id,
            col(ProcessingJob.status).in_(["waiting_provider", "queued", "running"]),
        )
    ):
        job.status = "superseded"
        session.add(job)
    session.add(answer)
    ensure_jobs(session, answer)
    session.commit()
    return answer_view(session, answer, current_user)


@router.post("/{answer_id}/skip")
def skip_answer(
    answer_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    answer = owned_answer(session, answer_id, current_user)
    if answer.status != "draft":
        raise HTTPException(409, "Submitted stories cannot be skipped")
    answer.skipped = True
    session.add(answer)
    session.commit()
    return {"status": "skipped"}
