from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.domain_models import Family, FamilyInvite, FamilyMember
from app.domain_schemas import FamilySettingsUpdate, InviteCode
from app.domain_service import (
    active_family,
    create_invite,
    end_family,
    family_view,
    invitation,
    membership,
    notify,
)
from app.models import User
from app.rate_limit import enforce_limit

router = APIRouter(prefix="/families", tags=["families"])


@router.get("/me")
def read_family(session: SessionDep, current_user: CurrentUser) -> Any:
    return family_view(session, current_user)


@router.patch("/me/settings")
def update_family_settings(
    body: FamilySettingsUpdate, session: SessionDep, current_user: CurrentUser
) -> Any:
    family = active_family(session, current_user.id, lock=True)
    member = membership(session, current_user.id)
    if not member or member.family_id != family.id:
        raise HTTPException(409, "Family connection has ended")
    if member.role != "child":
        raise HTTPException(403, "Only the child chooses how to address their parent")
    member.parent_label = body.parent_label
    session.add(member)
    session.commit()
    return family_view(session, current_user)


@router.post("/invitations", status_code=201)
def issue_invite(session: SessionDep, current_user: CurrentUser) -> Any:
    enforce_limit(f"invite:{current_user.id}", limit=5)
    return create_invite(session, current_user)


@router.post("/invitations/preview")
def preview_invite(
    body: InviteCode, session: SessionDep, current_user: CurrentUser
) -> Any:
    enforce_limit(f"code:{current_user.id}", limit=10)
    item = invitation(session, body.code)
    issuer = session.get(User, item.issuer_id)
    if not issuer:
        raise HTTPException(404, "Code unavailable")
    return {
        "full_name": issuer.full_name,
        "role": issuer.role,
        "expires_at": item.expires_at,
    }


@router.post("/join")
def join_family(
    body: InviteCode, session: SessionDep, current_user: CurrentUser
) -> Any:
    enforce_limit(f"code:{current_user.id}", limit=10)
    current_user = session.exec(
        select(User)
        .where(User.id == current_user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).one()
    if membership(session, current_user.id):
        raise HTTPException(
            409, "Leave the current connection before joining another family"
        )
    item = invitation(session, body.code)
    family = session.exec(
        select(Family).where(Family.id == item.family_id).with_for_update()
    ).one()
    # All pairing mutations lock family before invite rows.
    item = invitation(session, body.code, lock=True)
    members = session.exec(
        select(FamilyMember).where(FamilyMember.family_id == family.id)
    ).all()
    if (
        family.ended_at
        or len(members) != 1
        or members[0].role == current_user.role
        or members[0].user_id == current_user.id
    ):
        raise HTTPException(409, "A family must contain one parent and one child")
    session.add(
        FamilyMember(
            family_id=family.id, user_id=current_user.id, role=current_user.role
        )
    )
    for old in session.exec(
        select(FamilyInvite).where(FamilyInvite.family_id == family.id)
    ).all():
        old.used = True
        session.add(old)
    notify(session, item.issuer_id, "family_connected", family.id)
    session.commit()
    return family_view(session, current_user)


@router.delete("/me")
def disconnect_family(session: SessionDep, current_user: CurrentUser) -> Any:
    end_family(session, current_user.id)
    session.commit()
    return {
        "status": "unlinked",
        "message": "Each author retains their own stories; former partners lose access",
    }
