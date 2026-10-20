import secrets
import uuid
from datetime import date, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import or_
from sqlmodel import Session, col, select

from app.auth_sessions import secret_hash
from app.core.config import settings
from app.domain_models import (
    Answer,
    Family,
    FamilyInvite,
    FamilyMember,
    Notification,
    Question,
    QuestionBank,
    now_utc,
)
from app.models import User


def today() -> date:
    return now_utc().astimezone(ZoneInfo("Asia/Seoul")).date()


def membership(session: Session, user_id: uuid.UUID) -> FamilyMember | None:
    return session.exec(
        select(FamilyMember).where(FamilyMember.user_id == user_id)
    ).first()


def active_family(
    session: Session, user_id: uuid.UUID, *, lock: bool = False
) -> Family:
    member = membership(session, user_id)
    if not member:
        raise HTTPException(409, "Connect your family first")
    query = select(Family).where(
        Family.id == member.family_id, col(Family.ended_at).is_(None)
    )
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    family = session.exec(query).first()
    if not family:
        raise HTTPException(409, "Family connection has ended")
    return family


def partner(session: Session, family_id: uuid.UUID, user_id: uuid.UUID) -> User | None:
    member = session.exec(
        select(FamilyMember).where(
            FamilyMember.family_id == family_id, FamilyMember.user_id != user_id
        )
    ).first()
    return session.get(User, member.user_id) if member else None


def notify(
    session: Session,
    user_id: uuid.UUID,
    kind: str,
    resource_id: uuid.UUID | None = None,
) -> None:
    user = session.get(User, user_id)
    if user and user.notifications_enabled:
        session.add(Notification(user_id=user_id, kind=kind, resource_id=resource_id))


def family_view(session: Session, user: User) -> dict[str, object]:
    member = membership(session, user.id)
    if not member:
        return {"family_id": None, "status": "unlinked", "members": []}
    members = session.exec(
        select(FamilyMember).where(FamilyMember.family_id == member.family_id)
    ).all()
    people = []
    for item in members:
        person = session.get(User, item.user_id)
        if person:
            people.append(
                {"id": person.id, "full_name": person.full_name, "role": item.role}
            )
    return {
        "family_id": member.family_id,
        "status": "connected" if len(people) == 2 else "waiting",
        "members": people,
        "settings": {"parent_label": member.parent_label},
    }


def create_invite(session: Session, user: User) -> dict[str, object]:
    user = session.exec(
        select(User)
        .where(User.id == user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).one()
    member = membership(session, user.id)
    if member:
        family = active_family(session, user.id, lock=True)
        if partner(session, family.id, user.id):
            raise HTTPException(409, "Family is already connected")
    else:
        family = Family()
        session.add(family)
        session.flush()
        session.add(FamilyMember(family_id=family.id, user_id=user.id, role=user.role))
    for old in session.exec(
        select(FamilyInvite).where(
            FamilyInvite.family_id == family.id, col(FamilyInvite.used).is_(False)
        )
    ).all():
        old.used = True
        session.add(old)
    code = "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6))
    invitation = FamilyInvite(
        family_id=family.id,
        issuer_id=user.id,
        code_hash=secret_hash("invite:" + code),
        expires_at=now_utc() + timedelta(minutes=settings.INVITE_TTL_MINUTES),
    )
    session.add(invitation)
    session.commit()
    return {"code": code, "expires_at": invitation.expires_at, "family_id": family.id}


def invitation(session: Session, code: str, *, lock: bool = False) -> FamilyInvite:
    query = select(FamilyInvite).where(
        FamilyInvite.code_hash == secret_hash("invite:" + code)
    )
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    result = session.exec(query).first()
    if result is None or result.used or result.expires_at <= now_utc():
        raise HTTPException(404, "Code is invalid, expired or already used")
    family = session.get(Family, result.family_id)
    if family is None or family.ended_at:
        raise HTTPException(404, "Code is invalid, expired or already used")
    return result


def end_family(session: Session, user_id: uuid.UUID) -> None:
    member = membership(session, user_id)
    if not member:
        return
    family = active_family(session, user_id, lock=True)
    family.ended_at = now_utc()
    session.add(family)
    for person in session.exec(
        select(FamilyMember).where(FamilyMember.family_id == family.id)
    ).all():
        session.delete(person)
    for item in session.exec(
        select(FamilyInvite).where(FamilyInvite.family_id == family.id)
    ).all():
        item.used = True
        session.add(item)
    session.flush()


def question_for_today(session: Session, user: User, family: Family) -> Question:
    existing = session.exec(
        select(Question).where(
            Question.family_id == family.id,
            Question.target_id == user.id,
            Question.daily_date == today(),
        )
    ).first()
    if existing:
        return existing
    from app.question_budget import has_question_capacity

    if not has_question_capacity(session, user.id, today(), for_daily=True):
        raise HTTPException(409, "Daily question limit reached")
    bank = session.exec(
        select(QuestionBank)
        .where(QuestionBank.role == user.role, col(QuestionBank.enabled).is_(True))
        .order_by(QuestionBank.seed_key)
    ).all()
    if not bank:
        raise HTTPException(503, "Daily questions have not been seeded")
    selected = bank[(today() - date(2026, 1, 1)).days % len(bank)]
    item = Question(
        family_id=family.id,
        target_id=user.id,
        text=selected.text,
        source="daily",
        daily_date=today(),
        available_date=today(),
    )
    session.add(item)
    session.flush()
    return item


def visible_story(
    session: Session, answer_id: uuid.UUID, user: User, *, lock: bool = False
) -> Answer:
    query = select(Answer).where(Answer.id == answer_id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    answer = session.exec(query).first()
    if answer is None:
        raise HTTPException(404, "Story not found")
    member = membership(session, user.id)
    if answer.author_id != user.id and not (
        answer.status == "submitted" and member and member.family_id == answer.family_id
    ):
        raise HTTPException(404, "Story not found")
    return answer


def owned_answer(session: Session, answer_id: uuid.UUID, user: User) -> Answer:
    answer = visible_story(session, answer_id, user, lock=True)
    if answer.author_id != user.id:
        raise HTTPException(403, "Only the author can change this answer")
    return answer


def answer_view(session: Session, answer: Answer, user: User) -> dict[str, object]:
    author = session.get(User, answer.author_id)
    question = session.get(Question, answer.question_id)
    if answer.author_id == user.id:
        display_name, story_label = "나", "나의 이야기"
    elif answer.author_role == "parent":
        member = membership(session, user.id)
        display_name = (
            member.parent_label
            if member and member.family_id == answer.family_id
            else "부모님"
        )
        story_label = f"{display_name}의 이야기"
    else:
        display_name = author.full_name if author and author.full_name else "자녀"
        story_label = f"{display_name}의 이야기"
    data: dict[str, object] = {
        "id": answer.id,
        "question_id": answer.question_id,
        "family_id": answer.family_id,
        "author_id": answer.author_id,
        "author_name": author.full_name if author else None,
        "author_display_name": display_name,
        "author_story_label": story_label,
        "author_role": answer.author_role,
        "question": question.text if question else None,
        "status": answer.status,
        "title": answer.title,
        "text": answer.published_text
        if answer.status == "submitted"
        else answer.edited_text or answer.original_text or answer.transcript,
        "story_date": answer.story_date,
        "created_at": answer.created_at,
        "updated_at": answer.updated_at,
    }
    if answer.audio_id and (answer.author_id == user.id or answer.share_audio):
        data["audio_url"] = f"/api/v1/audio/{answer.audio_id}/content"
    if answer.author_id == user.id:
        data.update(
            original_text=answer.original_text,
            transcript=answer.transcript,
            edited_text=answer.edited_text,
            summary_draft=answer.summary_draft,
            organization_status=answer.organization_status,
            skipped=answer.skipped,
            follow_up_question=answer.follow_up_question,
            revision=answer.revision,
            audio_id=answer.audio_id,
            share_audio=answer.share_audio,
            share_original=answer.share_original,
        )
    return data


def library_query(session: Session, user: User):  # type: ignore[no-untyped-def]
    member = membership(session, user.id)
    visible = col(Answer.author_id) == user.id
    if member:
        visible = or_(visible, col(Answer.family_id) == member.family_id)
    return select(Answer).where(Answer.status == "submitted", visible)
