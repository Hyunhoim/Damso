import uuid
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import col, select

from app.api.deps import CurrentUser, SessionDep
from app.domain_models import Answer, Question
from app.domain_schemas import CustomQuestionInput
from app.domain_service import active_family, notify, partner, question_for_today, today
from app.rate_limit import enforce_limit

router = APIRouter(prefix="/questions", tags=["questions"])


@router.get("/today")
def today_questions(session: SessionDep, current_user: CurrentUser) -> Any:
    family = active_family(session, current_user.id, lock=True)
    daily = question_for_today(session, current_user, family)
    custom = session.exec(
        select(Question)
        .where(
            Question.family_id == family.id,
            Question.target_id == current_user.id,
            Question.source == "custom",
            Question.available_date <= today(),
            col(Question.canceled).is_(False),
        )
        .order_by(col(Question.created_at))
    ).all()

    def view(item: Question) -> Any:
        result = item.model_dump()
        answer = session.exec(
            select(Answer).where(Answer.question_id == item.id)
        ).first()
        result["answer_id"] = answer.id if answer else None
        result["answer_status"] = answer.status if answer else None
        return result

    result = {
        "date": today(),
        "role": current_user.role,
        "daily": view(daily),
        "custom": [view(item) for item in custom],
    }
    session.commit()
    return result


@router.post("/custom", status_code=201)
def custom_question(
    body: CustomQuestionInput, session: SessionDep, current_user: CurrentUser
) -> Any:
    enforce_limit(f"custom-question:{current_user.id}", limit=20)
    if current_user.role != "parent":
        raise HTTPException(403, "Only parents can send custom questions")
    family = active_family(session, current_user.id, lock=True)
    child = partner(session, family.id, current_user.id)
    if not child:
        raise HTTPException(409, "Connect a child first")
    day = body.available_date or today()
    if not today() <= day <= today() + timedelta(days=30):
        raise HTTPException(422, "Choose a date within the next 30 days")
    item = Question(
        family_id=family.id,
        target_id=child.id,
        created_by=current_user.id,
        text=body.text,
        source="custom",
        available_date=day,
    )
    session.add(item)
    session.flush()
    notify(session, child.id, "custom_question", item.id)
    session.commit()
    session.refresh(item)
    return item


@router.get("/custom")
def list_custom(
    session: SessionDep, current_user: CurrentUser, skip: int = 0, limit: int = 30
) -> Any:
    family = active_family(session, current_user.id)
    return session.exec(
        select(Question)
        .where(Question.family_id == family.id, Question.source == "custom")
        .order_by(col(Question.created_at).desc())
        .offset(max(0, skip))
        .limit(min(100, max(1, limit)))
    ).all()


@router.delete("/custom/{question_id}")
def cancel_custom(
    question_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    family = active_family(session, current_user.id, lock=True)
    item = session.get(Question, question_id)
    if (
        not item
        or item.family_id != family.id
        or item.source != "custom"
        or item.created_by != current_user.id
    ):
        raise HTTPException(404, "Question not found")
    if session.exec(select(Answer).where(Answer.question_id == item.id)).first():
        raise HTTPException(409, "A question with an answer cannot be canceled")
    item.canceled = True
    session.add(item)
    session.commit()
    return {"status": "canceled"}
