import hashlib
import hmac
import secrets
import uuid
from datetime import timedelta

from fastapi import HTTPException
from sqlmodel import Session, col, select

from app.core.config import settings
from app.core.security import create_access_token
from app.domain_models import AuthSession, now_utc
from app.models import Token, User


def secret_hash(value: str) -> str:
    return hmac.new(
        settings.SECRET_KEY.encode(), value.encode(), hashlib.sha256
    ).hexdigest()


def issue_tokens(session: Session, user: User) -> Token:
    refresh = secrets.token_urlsafe(48)
    auth = AuthSession(
        user_id=user.id,
        token_version=user.token_version,
        refresh_hash=secret_hash(refresh),
        expires_at=now_utc() + timedelta(days=30),
    )
    session.add(auth)
    session.flush()
    access = create_access_token(
        user.id,
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        session_id=auth.id,
        version=user.token_version,
    )
    session.commit()
    return Token(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


def refresh_tokens(session: Session, token: str) -> Token:
    auth = session.exec(
        select(AuthSession)
        .where(AuthSession.refresh_hash == secret_hash(token))
        .with_for_update()
    ).first()
    if auth is None or auth.revoked or auth.expires_at <= now_utc():
        raise HTTPException(401, "Refresh token is invalid or expired")
    user = session.get(User, auth.user_id)
    if user is None or not user.is_active or auth.token_version != user.token_version:
        raise HTTPException(401, "Account is unavailable")
    auth.revoked = True
    session.add(auth)
    return issue_tokens(session, user)


def revoke_all(session: Session, user_id: uuid.UUID) -> None:
    for auth in session.exec(
        select(AuthSession).where(
            AuthSession.user_id == user_id, col(AuthSession.revoked).is_(False)
        )
    ).all():
        auth.revoked = True
        session.add(auth)
