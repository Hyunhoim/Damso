import uuid
from datetime import date
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import col, select

from app.api.deps import CurrentUser, SessionDep
from app.domain_models import Answer, StoryComment, StoryReaction
from app.domain_schemas import CommentInput
from app.domain_service import answer_view, library_query, notify, visible_story
from app.models import User
from app.rate_limit import enforce_limit

router = APIRouter(prefix="/library", tags=["library"])


@router.get("")
def list_stories(
    session: SessionDep,
    current_user: CurrentUser,
    role: Literal["parent", "child"] | None = None,
    start: date | None = None,
    end: date | None = None,
    skip: int = Query(0, ge=0, le=100000),
    limit: int = Query(20, ge=1, le=100),
) -> Any:
    query = library_query(session, current_user)
    if role:
        query = query.where(Answer.author_role == role)
    if start:
        query = query.where(col(Answer.story_date) >= start)
    if end:
        query = query.where(col(Answer.story_date) <= end)
    items = session.exec(
        query.order_by(col(Answer.story_date).desc(), col(Answer.created_at).desc())
        .offset(skip)
        .limit(limit + 1)
    ).all()
    return {
        "data": [answer_view(session, item, current_user) for item in items[:limit]],
        "has_more": len(items) > limit,
        "next_skip": skip + limit if len(items) > limit else None,
    }


@router.get("/{answer_id}")
def read_story(
    answer_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    answer = visible_story(session, answer_id, current_user)
    if answer.status != "submitted":
        raise HTTPException(404, "Shared story not found")
    data = answer_view(session, answer, current_user)
    comments = session.exec(
        select(StoryComment)
        .where(StoryComment.answer_id == answer.id)
        .order_by(col(StoryComment.created_at))
    ).all()
    data["comments"] = [
        {
            **item.model_dump(),
            "author_name": person.full_name
            if (person := session.get(User, item.author_id))
            else None,
        }
        for item in comments
    ]
    data["reactions"] = [
        item.user_id
        for item in session.exec(
            select(StoryReaction).where(StoryReaction.answer_id == answer.id)
        ).all()
    ]
    return data


@router.post("/{answer_id}/comments", status_code=201)
def add_comment(
    answer_id: uuid.UUID,
    body: CommentInput,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    enforce_limit(f"comment:{current_user.id}", limit=30)
    answer = visible_story(session, answer_id, current_user, lock=True)
    if answer.status != "submitted":
        raise HTTPException(409, "Only submitted stories accept comments")
    comment = StoryComment(
        answer_id=answer.id, author_id=current_user.id, text=body.text
    )
    session.add(comment)
    if current_user.id != answer.author_id:
        notify(session, answer.author_id, "story_comment", answer.id)
    session.commit()
    session.refresh(comment)
    return comment


@router.delete("/{answer_id}/comments/{comment_id}")
def delete_comment(
    answer_id: uuid.UUID,
    comment_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    visible_story(session, answer_id, current_user)
    comment = session.get(StoryComment, comment_id)
    if (
        not comment
        or comment.answer_id != answer_id
        or comment.author_id != current_user.id
    ):
        raise HTTPException(404, "Comment not found")
    session.delete(comment)
    session.commit()
    return {"status": "deleted"}


@router.put("/{answer_id}/reaction")
def react(answer_id: uuid.UUID, session: SessionDep, current_user: CurrentUser) -> Any:
    answer = visible_story(session, answer_id, current_user, lock=True)
    if answer.status != "submitted":
        raise HTTPException(409, "Only submitted stories accept reactions")
    item = session.exec(
        select(StoryReaction).where(
            StoryReaction.answer_id == answer.id,
            StoryReaction.user_id == current_user.id,
        )
    ).first()
    if not item:
        session.add(StoryReaction(answer_id=answer.id, user_id=current_user.id))
        if current_user.id != answer.author_id:
            notify(session, answer.author_id, "story_reaction", answer.id)
    session.commit()
    return {"reacted": True}


@router.delete("/{answer_id}/reaction")
def unreact(
    answer_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    visible_story(session, answer_id, current_user, lock=True)
    item = session.exec(
        select(StoryReaction).where(
            StoryReaction.answer_id == answer_id,
            StoryReaction.user_id == current_user.id,
        )
    ).first()
    if item:
        session.delete(item)
        session.commit()
    return {"reacted": False}
