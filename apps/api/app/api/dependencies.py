from collections.abc import Iterator

from fastapi import Request
from sqlalchemy.orm import Session

from app.db.session import session_scope
from app.providers.base import LLMProvider


def get_provider(request: Request) -> LLMProvider:
    return request.app.state.provider  # type: ignore[no-any-return]


def get_db_session(request: Request) -> Iterator[Session]:
    yield from session_scope(request.app.state.db_sessions)
