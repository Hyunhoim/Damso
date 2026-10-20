"""Run destructive integration checks only against the dedicated local test DB."""

import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from dotenv import dotenv_values

backend = Path(__file__).resolve().parents[1]
config = dotenv_values(backend / ".env.local")
parsed = urlsplit(config["DATABASE_URL"] or "")
if parsed.hostname != "127.0.0.1" or parsed.port != 5433:
    raise SystemExit("Tests require the local PostgreSQL instance on 127.0.0.1:5433")
test_url = urlunsplit(parsed._replace(path="/damso_test"))
env = {**os.environ, "DATABASE_URL": test_url, "PYTHONUTF8": "1"}
env["STORAGE_ROOT"] = str(backend / "data" / "test-audio")
env["CLOVA_CONFIG_FILE"] = str(backend / "data" / "test-integrations" / "clova.json")
env["CLOVA_SPEECH_CONFIG_FILE"] = str(
    backend / "data" / "test-integrations" / "clova-speech.json"
)
env["ENABLE_LLM_SETUP_UI"] = "false"
for args in (
    ["-m", "alembic", "upgrade", "head"],
    [
        "-m",
        "pytest",
        "integration",
        "checks",
        "-q",
        "--basetemp",
        str(backend / "data" / "pytest-tmp"),
    ],
):
    result = subprocess.run([sys.executable, *args], cwd=backend, env=env, check=False)
    if result.returncode:
        raise SystemExit(result.returncode)
