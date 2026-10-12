from datetime import UTC, datetime

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import text

from app.api.dependencies import ensure_case_owner, require_reviewer, require_uploads_enabled
from app.core.sessions import SESSION_COOKIE, Role, SessionInfo
from app.core.settings import Settings, get_settings
from app.main import app

PASSWORD = "test-reviewer-password"


def _visitor(client: TestClient) -> str:
    response = client.post("/session")
    assert response.status_code == 200
    return client.cookies[SESSION_COOKIE]


def test_visitor_session_cookie_is_http_only_and_strict(client: TestClient) -> None:
    response = client.post("/session")
    assert response.status_code == 200
    assert response.json()["role"] == "visitor"
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "samesite=strict" in cookie


def test_start_session_reuses_a_valid_session(client: TestClient) -> None:
    token = _visitor(client)
    response = client.post("/session")
    assert "set-cookie" not in response.headers
    assert client.cookies[SESSION_COOKIE] == token


def test_session_is_required(client: TestClient) -> None:
    assert client.get("/session").status_code == 401


def test_only_token_hash_is_stored(client: TestClient) -> None:
    token = _visitor(client)
    with app.state.db_sessions() as db:
        stored = db.execute(text("SELECT token_hash FROM sessions")).scalars().all()
    assert token not in stored


def test_reviewer_login_rotates_the_session(client: TestClient) -> None:
    visitor_token = _visitor(client)
    response = client.post("/session/login", json={"password": PASSWORD})
    assert response.status_code == 200
    assert response.json()["role"] == "reviewer"
    assert client.cookies[SESSION_COOKIE] != visitor_token

    client.cookies.set(SESSION_COOKIE, visitor_token)
    assert client.get("/session").status_code == 401


def test_wrong_password_is_rejected(client: TestClient) -> None:
    response = client.post("/session/login", json={"password": "not-the-password"})
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid credentials"}


def test_failed_logins_are_throttled(client: TestClient) -> None:
    for _ in range(10):
        assert client.post("/session/login", json={"password": "wrong"}).status_code == 401
    assert client.post("/session/login", json={"password": PASSWORD}).status_code == 429


def test_login_is_disabled_without_configured_password(client: TestClient) -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None, reviewer_password="")
    try:
        response = client.post("/session/login", json={"password": "anything"})
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 403


def test_logout_revokes_the_session(client: TestClient) -> None:
    token = _visitor(client)
    assert client.post("/session/logout").status_code == 204
    client.cookies.set(SESSION_COOKIE, token)
    assert client.get("/session").status_code == 401


def test_expired_sessions_are_rejected(client: TestClient) -> None:
    _visitor(client)
    with app.state.db_sessions() as db:
        db.execute(text("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000000+00:00'"))
        db.commit()
    assert client.get("/session").status_code == 401


def _session(role: Role, session_id: str = "a" * 32) -> SessionInfo:
    return SessionInfo(id=session_id, role=role, expires_at=datetime.now(UTC))


def test_other_sessions_cannot_see_a_case() -> None:
    ensure_case_owner(_session("visitor"), "a" * 32)
    with pytest.raises(HTTPException) as error:
        ensure_case_owner(_session("reviewer"), "b" * 32)
    assert error.value.status_code == 404


def test_visitors_cannot_act_as_reviewers() -> None:
    with pytest.raises(HTTPException) as error:
        require_reviewer(_session("visitor"))
    assert error.value.status_code == 403


def test_uploads_are_blocked_when_disabled() -> None:
    settings = Settings(_env_file=None, allow_uploads=False)
    with pytest.raises(HTTPException) as error:
        require_uploads_enabled(settings, _session("reviewer"))
    assert error.value.status_code == 403


def test_production_requires_a_session_secret() -> None:
    with pytest.raises(ValidationError, match="SESSION_SECRET is required"):
        Settings(_env_file=None, app_env="production", session_secret="")


def test_weak_secrets_are_rejected() -> None:
    with pytest.raises(ValidationError, match="at least 32"):
        Settings(_env_file=None, session_secret="short")
    with pytest.raises(ValidationError, match="at least 12"):
        Settings(_env_file=None, reviewer_password="short")
