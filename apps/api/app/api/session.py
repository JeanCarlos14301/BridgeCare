import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.api.dependencies import (
    CurrentSession,
    DbSession,
    SessionStoreDependency,
    SessionToken,
    SettingsDependency,
    get_login_throttle,
    get_optional_session,
)
from app.core.sessions import (
    LoginThrottle,
    SessionInfo,
    clear_session_cookie,
    reviewer_password_matches,
    set_session_cookie,
)
from app.schemas.session import LoginRequest, SessionResponse

router = APIRouter(prefix="/session", tags=["session"])
OptionalSession = Annotated[SessionInfo | None, Depends(get_optional_session)]
ThrottleDependency = Annotated[LoginThrottle, Depends(get_login_throttle)]
audit = logging.getLogger("bridgecare.session")


def _response(info: SessionInfo) -> SessionResponse:
    return SessionResponse(role=info.role, expires_at=info.expires_at)


@router.post("", response_model=SessionResponse)
async def start_session(
    response: Response,
    db: DbSession,
    store: SessionStoreDependency,
    settings: SettingsDependency,
    current: OptionalSession,
) -> SessionResponse:
    """Return the current session, or start an isolated visitor session."""
    if current is not None:
        return _response(current)
    token, info = store.create(db, "visitor")
    set_session_cookie(response, token, info, secure=not settings.is_development)
    return _response(info)


@router.get("", response_model=SessionResponse)
async def read_session(current: CurrentSession) -> SessionResponse:
    return _response(current)


@router.post(
    "/login",
    response_model=SessionResponse,
    responses={
        401: {"description": "Invalid credentials"},
        429: {"description": "Too many failed attempts"},
    },
)
async def login(
    payload: LoginRequest,
    response: Response,
    db: DbSession,
    store: SessionStoreDependency,
    settings: SettingsDependency,
    throttle: ThrottleDependency,
    token: SessionToken = None,
) -> SessionResponse:
    if not settings.reviewer_password.get_secret_value():
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Reviewer login is not configured")
    if not throttle.allowed():
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many failed login attempts")
    if not reviewer_password_matches(settings, payload.password):
        throttle.record_failure()
        audit.info(json.dumps({"event": "reviewer_login_failed"}))
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    # Always issue a fresh token on privilege change to prevent session fixation.
    store.revoke(db, token)
    new_token, info = store.create(db, "reviewer")
    set_session_cookie(response, new_token, info, secure=not settings.is_development)
    audit.info(json.dumps({"event": "reviewer_login", "session_id": info.id}))
    return _response(info)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    db: DbSession,
    store: SessionStoreDependency,
    settings: SettingsDependency,
    token: SessionToken = None,
) -> None:
    store.revoke(db, token)
    clear_session_cookie(response, secure=not settings.is_development)
