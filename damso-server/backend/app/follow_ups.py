"""Daily question budgets and prioritized family follow-ups."""

import uuid
from datetime import date, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session, col, select

from app.domain_models import (
    Answer,
    DailyFollowUp,
    Family,
    FamilyMember,
    Question,
    now_utc,
)
from app.domain_service import today
from app.models import User
from app.question_budget import extra_question_ids, has_question_capacity


def reserve_question(
    session: Session,
    *,
    answer: Answer,
    text: str,
    day: date,
    kind: str,
    requester: uuid.UUID | None = None,
) -> DailyFollowUp | None:
    if not has_question_capacity(session, answer.author_id, day):
        return None
    slot_id = uuid.uuid4()
    inserted = (
        session.connection()
        .execute(
            insert(DailyFollowUp)
            .values(
                id=slot_id,
                user_id=answer.author_id,
                family_id=answer.family_id,
                day=day,
                kind=kind,
                source_answer_id=answer.id,
                created_by=requester,
                created_at=now_utc(),
            )
            .on_conflict_do_nothing(constraint="uq_follow_up_user_day_kind")
            .returning(col(DailyFollowUp.id))
        )
        .scalar_one_or_none()
    )
    if inserted is None:
        return None
    question = Question(
        family_id=answer.family_id,
        target_id=answer.author_id,
        created_by=requester,
        text=text,
        source="follow_up",
        available_date=day,
    )
    session.add(question)
    session.flush()
    slot = session.get(DailyFollowUp, slot_id)
    assert slot is not None
    slot.question_id = question.id
    session.add(slot)
    return slot


def issue_ai_follow_up(
    session: Session, answer: Answer, text: str | None
) -> str | None:
    if not text or answer.skipped:
        return None
    question = session.get(Question, answer.question_id)
    family = session.get(Family, answer.family_id)
    member = session.exec(
        select(FamilyMember).where(
            FamilyMember.user_id == answer.author_id,
            FamilyMember.family_id == answer.family_id,
        )
    ).first()
    if (
        not question
        or question.source == "follow_up"
        or not family
        or family.ended_at
        or not member
    ):
        return None
    return (
        text
        if reserve_question(session, answer=answer, text=text, day=today(), kind="ai")
        else None
    )


def request_family_follow_up(
    session: Session, answer: Answer, requester: User
) -> DailyFollowUp:
    day = today() + timedelta(days=1)
    existing = session.exec(
        select(DailyFollowUp).where(
            DailyFollowUp.user_id == answer.author_id,
            DailyFollowUp.day == day,
            DailyFollowUp.kind == "family",
        )
    ).first()
    if existing:
        if (
            existing.family_id == answer.family_id
            and existing.source_answer_id == answer.id
            and existing.created_by == requester.id
        ):
            return existing
        raise HTTPException(409, "A follow-up is already reserved for tomorrow")
    title = answer.title or "이날의 이야기"
    text = f"‘{title}’ 이야기를 조금 더 들려주시겠어요?"
    slot = reserve_question(
        session,
        answer=answer,
        text=text,
        day=day,
        kind="family",
        requester=requester.id,
    )
    if slot is None:
        raise HTTPException(409, "A follow-up is already reserved for tomorrow")
    return slot


def follow_ups_for_today(
    session: Session, user: User, family: Family
) -> list[dict[str, Any]]:
    ids = extra_question_ids(session, user.id, today())
    slots = session.exec(
        select(DailyFollowUp)
        .where(
            DailyFollowUp.user_id == user.id,
            DailyFollowUp.family_id == family.id,
            DailyFollowUp.day == today(),
        )
        .order_by(col(DailyFollowUp.kind).desc(), col(DailyFollowUp.created_at))
    ).all()
    result = []
    for slot in slots:
        if (
            not slot.question_id
            or slot.question_id not in ids
            or not slot.source_answer_id
        ):
            continue
        story = session.get(Answer, slot.source_answer_id)
        question = session.get(Question, slot.question_id)
        if (
            not story
            or not question
            or question.canceled
            or (slot.kind == "family" and story.status != "submitted")
        ):
            continue
        answer = session.exec(
            select(Answer).where(Answer.question_id == question.id)
        ).first()
        result.append(
            {
                **question.model_dump(),
                "kind": slot.kind,
                "source_answer_id": story.id,
                "source_title": story.title,
                "source_text": story.published_text if slot.kind == "family" else None,
                "answer_id": answer.id if answer else None,
                "answer_status": "skipped"
                if answer and answer.skipped
                else answer.status
                if answer
                else None,
            }
        )
    return result
