"""Start PostgreSQL, migrate/seed idempotently, and run the API in this terminal."""

import os
import subprocess
import sys
from pathlib import Path

backend = Path(__file__).resolve().parents[1]
environment = {**os.environ, "PYTHONUTF8": "1"}
commands = [
    ["scripts/init-local-env.py"],
    ["scripts/postgres-local.py", "start"],
    ["-m", "alembic", "upgrade", "head"],
    ["-m", "app.initial_data"],
    ["-m", "app.seed_questions"],
    [
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        "8000",
        "--no-proxy-headers",
    ],
]
try:
    for command in commands:
        result = subprocess.run(
            [sys.executable, *command], cwd=backend, env=environment, check=False
        )
        if result.returncode:
            raise SystemExit(result.returncode)
except KeyboardInterrupt:
    pass
