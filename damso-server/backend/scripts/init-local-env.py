"""Create local backend secrets once; never overwrite existing settings."""

import secrets
from pathlib import Path

target = Path(__file__).resolve().parents[1] / ".env.local"
database_password = secrets.token_urlsafe(32)
content = "\n".join(
    [
        "PROJECT_NAME=Damso API",
        "FRONTEND_HOST=http://localhost:8081",
        f"SECRET_KEY={secrets.token_urlsafe(48)}",
        "FIRST_SUPERUSER=admin@example.com",
        f"FIRST_SUPERUSER_PASSWORD={secrets.token_urlsafe(32)}",
        f"POSTGRES_PASSWORD={database_password}",
        f"DATABASE_URL=postgresql://postgres:{database_password}@127.0.0.1:5433/app",
        "",
    ]
)
try:
    with target.open("x", encoding="utf-8") as handle:
        handle.write(content)
except FileExistsError:
    raise SystemExit(0) from None
