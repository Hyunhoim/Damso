from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Request
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import col

from app.auth_sessions import secret_hash
from app.core.db import engine
from app.domain_models import RateBucket


def enforce_limit(key: str, *, limit: int, seconds: int = 60) -> None:
    now = datetime.now(UTC)
    window = int(now.timestamp()) // seconds
    expires = datetime.fromtimestamp((window + 1) * seconds, UTC)
    digest = secret_hash(f"rate:{key}:{window}")
    statement = insert(RateBucket).values(
        key=digest, count=1, expires_at=expires + timedelta(hours=1)
    )
    count_query = statement.on_conflict_do_update(
        index_elements=["key"], set_={"count": col(RateBucket.count) + 1}
    ).returning(col(RateBucket.count))
    # Commit separately so rejected logins and guesses still consume the quota.
    with engine.begin() as connection:
        count = connection.execute(count_query).scalar_one()
    if count > limit:
        raise HTTPException(
            429,
            "Too many attempts; please try again later",
            headers={"Retry-After": str(max(1, int((expires - now).total_seconds())))},
        )


def client_key(request: Request, action: str) -> str:
    return f"{action}:{request.client.host if request.client else 'unknown'}"
