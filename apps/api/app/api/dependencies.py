from collections.abc import Iterator
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.sessions import SESSION_COOKIE, LoginThrottle, SessionInfo, SessionStore
from app.core.settings import Settings, get_settings
from app.db.session import session_scope
from app.providers.base import LLMProvider


def get_provider(request: Request) -> LLMProvider:
    return request.app.state.provider  # type: ignore[no-any-return]


def get_db_session(request: Request) -> Iterator[Session]:
    yield from session_scope(request.app.state.db_sessions)


def get_session_store(request: Request) -> SessionStore:
    return request.app.state.session_store  # type: ignore[no-any-return]


def get_login_throttle(request: Request) -> LoginThrottle:
    return request.app.state.login_throttle  # type: ignore[no-any-return]


DbSession = Annotated[Session, Depends(get_db_session)]
SessionStoreDependency = Annotated[SessionStore, Depends(get_session_store)]
SettingsDependency = Annotated[Settings, Depends(get_settings)]
SessionToken = Annotated[str | None, Cookie(alias=SESSION_COOKIE, include_in_schema=False)]


def get_optional_session(
    db: DbSession, store: SessionStoreDependency, token: SessionToken = None
) -> SessionInfo | None:
    return store.resolve(db, token)


def require_session(
    current: Annotated[SessionInfo | None, Depends(get_optional_session)],
) -> SessionInfo:
    if current is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session required")
    return current


CurrentSession = Annotated[SessionInfo, Depends(require_session)]


def require_reviewer(current: CurrentSession) -> SessionInfo:
    if current.role != "reviewer":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Reviewer access required")
    return current


ReviewerSession = Annotated[SessionInfo, Depends(require_reviewer)]


def require_uploads_enabled(settings: SettingsDependency, reviewer: ReviewerSession) -> SessionInfo:
    """Gate for POST /cases/upload: private environments and reviewers only."""
    if not settings.allow_uploads:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Uploads are disabled")
    return reviewer


def ensure_case_owner(current: SessionInfo, owner_session_id: str) -> None:
    """Call on every case endpoint after loading the case.

    A case UUID is never authorization. Cases from other sessions answer 404, not 403,
    so their existence is not disclosed.
    """
    if current.id != owner_session_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
