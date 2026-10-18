import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import col, select

from app.api.deps import CurrentUser, SessionDep
from app.domain_models import Notification
from app.domain_schemas import ProfileUpdate
from app.domain_service import membership
from app.models import User, UserPublic

router = APIRouter(tags=["profile"])


@router.get("/profile", response_model=UserPublic)
def profile(current_user: CurrentUser) -> Any:
    return current_user


@router.patch("/profile", response_model=UserPublic)
def update_profile(
    body: ProfileUpdate, session: SessionDep, current_user: CurrentUser
) -> Any:
    current_user = session.exec(
        select(User)
        .where(User.id == current_user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).one()
    values = body.model_dump(exclude_none=True)
    if (
        "role" in values
        and values["role"] != current_user.role
        and membership(session, current_user.id)
    ):
        raise HTTPException(409, "Disconnect family before changing role")
    current_user.sqlmodel_update(values)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user


@router.get("/notifications")
def notifications(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
) -> Any:
    return session.exec(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(col(Notification.created_at).desc())
        .offset(skip)
        .limit(limit)
    ).all()


@router.patch("/notifications/{notification_id}/read")
def mark_read(
    notification_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    item = session.get(Notification, notification_id)
    if not item or item.user_id != current_user.id:
        raise HTTPException(404, "Notification not found")
    item.read = True
    session.add(item)
    session.commit()
    return {"read": True}
