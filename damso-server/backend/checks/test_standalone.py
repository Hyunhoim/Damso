from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.security import get_password_hash, verify_password
from app.main import app


def test_api_runs_without_built_web_frontend() -> None:
    with TestClient(app) as client:
        assert client.get("/api/v1/utils/health-check/").json() is True
        assert client.get("/docs").status_code == 200
        schema = client.get("/api/v1/openapi.json").json()
        assert "/api/v1/login/access-token" in schema["paths"]
        assert "/api/v1/users/signup" in schema["paths"]
        assert not any("/private" in path for path in schema["paths"])
        assert client.get("/").status_code == 404


def test_authentication_still_protects_user_data() -> None:
    with TestClient(app) as client:
        response = client.get("/api/v1/users/me")
        assert response.status_code == 401
        assert response.headers["www-authenticate"] == "Bearer"


def test_only_configured_web_origin_is_allowed() -> None:
    with TestClient(app) as client:
        headers = {
            "Origin": settings.FRONTEND_HOST,
            "Access-Control-Request-Method": "GET",
        }
        response = client.options("/api/v1/users/me", headers=headers)
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == settings.FRONTEND_HOST
        response = client.options(
            "/api/v1/users/me",
            headers={**headers, "Origin": "https://unrelated.example"},
        )
        assert response.status_code == 400
        assert "access-control-allow-origin" not in response.headers


def test_password_hashing_does_not_store_plaintext() -> None:
    password = "test-only-password"
    hashed = get_password_hash(password)
    assert hashed != password
    assert verify_password(password, hashed)[0] is True
    assert verify_password("wrong-password", hashed)[0] is False
