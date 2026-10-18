import uuid
from typing import Annotated, Any

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.security import OAuth2PasswordRequestForm

from app import crud
from app.api.deps import CurrentUser, SessionDep, TokenDep, get_current_active_superuser
from app.auth_sessions import issue_tokens, refresh_tokens, revoke_all
from app.core.config import settings
from app.domain_models import AuthSession
from app.domain_schemas import RefreshInput
from app.models import Message, NewPassword, Token, UserPublic, UserUpdate
from app.rate_limit import client_key, enforce_limit
from app.utils import (
    generate_password_reset_token,
    generate_reset_password_email,
    send_email,
    verify_password_reset_token,
)

router = APIRouter(tags=["login"])


@router.post("/login/access-token")
def login_access_token(
    request: Request,
    session: SessionDep,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
) -> Token:
    """
    OAuth2 compatible token login, get an access token for future requests
    """
    enforce_limit(client_key(request, "login"), limit=15)
    user = crud.authenticate(
        session=session, email=form_data.username, password=form_data.password
    )
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    elif not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return issue_tokens(session, user)


@router.post("/login/refresh", response_model=Token)
def refresh(request: Request, session: SessionDep, body: RefreshInput) -> Token:
    enforce_limit(client_key(request, "refresh"), limit=30)
    return refresh_tokens(session, body.refresh_token)


@router.post("/login/logout", response_model=Message)
def logout(session: SessionDep, current_user: CurrentUser, token: TokenDep) -> Message:
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    auth = session.get(AuthSession, uuid.UUID(payload["sid"]))
    if auth and auth.user_id == current_user.id:
        auth.revoked = True
        session.add(auth)
        session.commit()
    return Message(message="Logged out")


@router.post("/login/logout-all", response_model=Message)
def logout_all(session: SessionDep, current_user: CurrentUser) -> Message:
    current_user.token_version += 1
    session.add(current_user)
    revoke_all(session, current_user.id)
    session.commit()
    return Message(message="All sessions revoked")


@router.post("/login/test-token", response_model=UserPublic)
def test_token(current_user: CurrentUser) -> Any:
    """
    Test access token
    """
    return current_user


@router.post("/password-recovery/{email}")
def recover_password(email: str, request: Request, session: SessionDep) -> Message:
    """
    Password Recovery
    """
    enforce_limit(client_key(request, "password-recovery"), limit=5, seconds=600)
    if not settings.emails_enabled:
        raise HTTPException(503, "Email delivery is not configured")
    user = crud.get_user_by_email(session=session, email=email)

    # Always return the same response to prevent email enumeration attacks
    # Only send email if user actually exists
    if user:
        password_reset_token = generate_password_reset_token(
            email=email, version=user.token_version
        )
        email_data = generate_reset_password_email(
            email_to=user.email, email=email, token=password_reset_token
        )
        send_email(
            email_to=user.email,
            subject=email_data.subject,
            html_content=email_data.html_content,
        )
    return Message(
        message="If that email is registered, we sent a password recovery link"
    )


@router.post("/reset-password/")
def reset_password(request: Request, session: SessionDep, body: NewPassword) -> Message:
    """
    Reset password
    """
    enforce_limit(client_key(request, "password-reset"), limit=10, seconds=600)
    email = verify_password_reset_token(token=body.token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid token")
    user = crud.get_user_by_email(session=session, email=email)
    if not user:
        # Don't reveal that the user doesn't exist - use same error as invalid token
        raise HTTPException(status_code=400, detail="Invalid token")
    elif not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    payload = jwt.decode(body.token, settings.SECRET_KEY, algorithms=["HS256"])
    if payload.get("v", 0) != user.token_version:
        raise HTTPException(400, "Invalid token")
    user_in_update = UserUpdate(password=body.new_password)
    crud.update_user(
        session=session,
        db_user=user,
        user_in=user_in_update,
    )
    return Message(message="Password updated successfully")


@router.post(
    "/password-recovery-html-content/{email}",
    dependencies=[Depends(get_current_active_superuser)],
    response_class=HTMLResponse,
)
def recover_password_html_content(email: str, session: SessionDep) -> Any:
    """
    HTML Content for Password Recovery
    """
    user = crud.get_user_by_email(session=session, email=email)

    if not user:
        raise HTTPException(
            status_code=404,
            detail="The user with this username does not exist in the system.",
        )
    password_reset_token = generate_password_reset_token(
        email=email, version=user.token_version
    )
    email_data = generate_reset_password_email(
        email_to=user.email, email=email, token=password_reset_token
    )

    return HTMLResponse(
        content=email_data.html_content, headers={"subject:": email_data.subject}
    )
