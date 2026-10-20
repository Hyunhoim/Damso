from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlmodel import Session, SQLModel

from app.core.config import settings
from app.core.db import engine
from app.main import app
from app.seed_questions import seed


@pytest.fixture(autouse=True)
def clean_test_database():
    # Never clear the developer's app database, even if pytest is called directly.
    if engine.url.database != "damso_test" or engine.url.host != "127.0.0.1":
        pytest.fail("Use scripts/test-backend.py; only damso_test may be reset")
    names = ", ".join(f'"{name}"' for name in SQLModel.metadata.tables)
    with engine.begin() as connection:
        connection.execute(text(f"TRUNCATE {names} CASCADE"))
    root = settings.STORAGE_ROOT.resolve()
    if root != (Path(__file__).resolve().parents[1] / "data/test-audio").resolve():
        pytest.fail("Unexpected test audio directory")
    root.mkdir(parents=True, exist_ok=True)
    key_file = settings.CLOVA_CONFIG_FILE.resolve()
    if (
        key_file
        != (
            Path(__file__).resolve().parents[1] / "data/test-integrations/clova.json"
        ).resolve()
    ):
        pytest.fail("Unexpected test key file")
    key_file.unlink(missing_ok=True)
    speech_file = settings.CLOVA_SPEECH_CONFIG_FILE.resolve()
    if (
        speech_file
        != (
            Path(__file__).resolve().parents[1]
            / "data/test-integrations/clova-speech.json"
        ).resolve()
    ):
        pytest.fail("Unexpected test Speech key file")
    speech_file.unlink(missing_ok=True)
    for path in root.glob("*"):
        if path.is_file():
            path.unlink()
    seed()
    yield


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db():
    with Session(engine) as session:
        yield session
