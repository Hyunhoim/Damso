from collections.abc import Generator
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError
from sqlmodel import Session

from app.core import security
from app.core.config import settings
from app.core.db import engine
from app.domain_models import AuthSession, now_utc
from app.models import TokenPayload, User

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/login/access-token"
)


def get_db() -> Generator[Session]:
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_db)]
TokenDep = Annotated[str, Depends(reusable_oauth2)]


def get_current_user(session: SessionDep, token: TokenDep) -> User:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
        if (
            payload.get("purpose") != "access"
            or not token_data.sid
            or not token_data.sub
        ):
            raise ValueError("Wrong token purpose")
        session_id = UUID(token_data.sid)
        user_id = UUID(token_data.sub)
    except InvalidTokenError, ValidationError, ValueError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    auth = session.get(AuthSession, session_id)
    if (
        not auth
        or auth.revoked
        or auth.expires_at <= now_utc()
        or auth.user_id != user_id
    ):
        raise HTTPException(status_code=401, detail="Session expired or revoked")
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    if token_data.v != user.token_version or auth.token_version != user.token_version:
        raise HTTPException(status_code=401, detail="Session expired")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_current_active_superuser(current_user: CurrentUser) -> User:
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    return current_user
