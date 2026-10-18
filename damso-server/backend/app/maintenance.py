"""Prune expired token/rate records; never remove users, stories, or recordings."""

import logging
from datetime import timedelta

from sqlmodel import Session, col, delete

from app.core.db import engine
from app.domain_models import AuthSession, FamilyInvite, RateBucket, now_utc


def main() -> None:
    with Session(engine) as session:
        for model in (AuthSession, FamilyInvite, RateBucket):
            session.exec(
                delete(model).where(
                    col(model.expires_at) < now_utc() - timedelta(days=1)
                )
            )
        session.commit()
    logging.basicConfig(level=logging.INFO)
    logging.info("Expired sessions, invitations, and rate buckets pruned")


if __name__ == "__main__":
    main()
