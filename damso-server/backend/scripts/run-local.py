"""Start PostgreSQL, migrate/seed idempotently, and run the API in this terminal."""

import os
import subprocess
import sys
from pathlib import Path

backend = Path(__file__).resolve().parents[1]
environment = {**os.environ, "PYTHONUTF8": "1", "ENABLE_LLM_SETUP_UI": "true"}
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
worker = None
try:
    for command in commands:
        if command[0:2] == ["-m", "uvicorn"]:
            worker = subprocess.Popen([sys.executable, "-m", "app.worker"], cwd=backend, env=environment, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        result = subprocess.run(
            [sys.executable, *command], cwd=backend, env=environment, check=False
        )
        if result.returncode:
            raise SystemExit(result.returncode)
except KeyboardInterrupt:
    pass
finally:
    if worker is not None:
        if worker.poll() is None and os.name == "nt":
            # Windows venv python is a launcher; stop its runtime child as well.
            subprocess.run(["taskkill", "/PID", str(worker.pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        elif worker.poll() is None:
            worker.terminate()
        worker.wait(timeout=10)
