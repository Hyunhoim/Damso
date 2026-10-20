"""One real HCX call through the worker and story API, only in damso_test."""
import json
import os
import subprocess
import sys
import uuid
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from dotenv import dotenv_values

backend = Path(__file__).resolve().parents[1]
uri = urlsplit(dotenv_values(backend / ".env.local")["DATABASE_URL"] or "")
if uri.hostname != "127.0.0.1" or uri.port != 5433:
    raise SystemExit("Only the dedicated local damso_test database is allowed")
os.environ["DATABASE_URL"] = urlunsplit(uri._replace(path="/damso_test"))
os.environ["CLOVA_CONFIG_FILE"] = str(backend / "data/integrations/clova.json")
os.environ["ENABLE_LLM_SETUP_UI"] = "false"

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402
from app.core.db import engine  # noqa: E402
from app.llm import configured_provider, PROMPT_VERSION  # noqa: E402
from app.main import app  # noqa: E402
from app.seed_questions import seed  # noqa: E402

if configured_provider() is None:
    raise SystemExit("Register a key first; no API was called")
if engine.url.database != "damso_test" or engine.url.host != "127.0.0.1":
    raise SystemExit("Refusing to reset a non-test database")
with engine.begin() as connection:
    names = ", ".join(f'"{name}"' for name in SQLModel.metadata.tables)
    connection.execute(text(f"TRUNCATE {names} CASCADE"))
seed()
api = "/api/v1"
password = "Synthetic-test-only-123!"
source = "첫 월급으로 어머니께 내복을 사드렸어요. 어머니께서는 좋아하셨어요."

with TestClient(app) as client:
    people = []
    try:
        for role in ("parent", "child"):
            email = f"hcx-test-{uuid.uuid4().hex}@example.com"
            assert client.post(api + "/users/signup", json={"email": email, "password": password, "role": role}).status_code == 200
            login = client.post(api + "/login/access-token", data={"username": email, "password": password})
            assert login.status_code == 200
            people.append({"Authorization": "Bearer " + login.json()["access_token"]})
        parent, child = people
        code = client.post(api + "/families/invitations", headers=parent).json()["code"]
        assert client.post(api + "/families/join", headers=child, json={"code": code}).status_code == 200
        question = client.get(api + "/questions/today", headers=parent).json()["daily"]
        created = client.post(api + "/answers", headers=parent, json={"question_id": question["id"], "text": source})
        assert created.status_code == 201
        answer_id = created.json()["id"]
        # Use the same worker entrypoint used by run-local.py and Docker.
        worker = subprocess.run([sys.executable, "-m", "app.worker", "--once"], cwd=backend, env={**os.environ, "PYTHONUTF8": "1"}, capture_output=True, timeout=120)
        assert worker.returncode == 0, "Worker failed"
        private = client.get(api + f"/answers/{answer_id}", headers=parent).json()
        assert private["summary_draft"] and private["original_text"] == source
        assert client.get(api + f"/answers/{answer_id}", headers=child).status_code == 404
        assert client.post(api + f"/answers/{answer_id}/submit", headers=parent, json={}).status_code == 200
        stories = client.get(api + "/library", headers=child).json()["data"]
        assert stories[0]["text"] == private["summary_draft"]
        assert "original_text" not in stories[0]
        report = {"model": "HCX-007", "prompt_version": PROMPT_VERSION, "question": question["text"], "original_text": source, "summary": private["summary_draft"], "follow_up_question": private["follow_up_question"], "private_before_submit": True, "library_text_matches_summary": True, "original_preserved": True, "database": "damso_test"}
        target = backend / "data/llm-tests/storage.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print("Real HCX -> private draft -> confirmed submission -> counterpart library: OK")
        print("Original preserved; synthetic accounts removed. Report:", target)
    finally:
        for person in people:
            client.delete(api + "/users/me", headers=person)
