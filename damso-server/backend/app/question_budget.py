"""One role template and at most two other questions per Korean calendar day."""

import uuid
from datetime import date

from sqlmodel import Session, col, select

from app.domain_models import Question
from app.models import User


def has_question_capacity(
    session: Session, user_id: uuid.UUID, day: date, *, for_daily: bool = False
) -> bool:
    # Serialize all senders for this recipient, including workers and future reservations.
    session.exec(select(User).where(User.id == user_id).with_for_update()).one()
    sources = session.exec(
        select(Question.source).where(
            Question.target_id == user_id,
            Question.available_date == day,
        )
    ).all()
    # Reserve a basic question even before its first lookup; canceled sends still count.
    used = len(sources) + (0 if for_daily or "daily" in sources else 1)
    return used < 3


def extra_question_ids(
    session: Session, user_id: uuid.UUID, day: date
) -> list[uuid.UUID]:
    daily_count = len(
        session.exec(
            select(Question.id).where(
                Question.target_id == user_id,
                Question.available_date == day,
                Question.source == "daily",
            )
        ).all()
    )
    remaining = max(0, 3 - max(1, daily_count))
    return list(
        session.exec(
            select(Question.id)
            .where(
                Question.target_id == user_id,
                Question.available_date == day,
                Question.source != "daily",
            )
            .order_by(col(Question.created_at), col(Question.id))
            .limit(remaining)
        ).all()
    )
