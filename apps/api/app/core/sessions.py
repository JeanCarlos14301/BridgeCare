import hashlib
import hmac
import secrets
import time
import uuid
from collections import deque
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Literal

from fastapi import Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.settings import Settings

Role = Literal["visitor", "reviewer"]

SESSION_COOKIE = "bridgecare_session"
SESSION_TTL: dict[Role, timedelta] = {
    "visitor": timedelta(hours=4),
    "reviewer": timedelta(hours=12),
}


@dataclass(frozen=True)
class SessionInfo:
    id: str
    role: Role
    expires_at: datetime


def _now() -> datetime:
    return datetime.now(UTC)


def _timestamp(value: datetime) -> str:
    # One fixed format so stored timestamps compare correctly as strings.
    return value.astimezone(UTC).isoformat(timespec="microseconds")


@lru_cache
def _ephemeral_key() -> bytes:
    return secrets.token_bytes(32)


def session_key(settings: Settings) -> bytes:
    """Return the HMAC key for session tokens.

    Settings validation requires SESSION_SECRET outside development. In development an
    empty secret falls back to a per-process random key, so sessions end on restart.
    """
    secret = settings.session_secret.get_secret_value()
    return secret.encode() if secret else _ephemeral_key()


class SessionStore:
    def __init__(self, key: bytes) -> None:
        self._key = key

    def _hash(self, token: str) -> str:
        return hmac.new(self._key, token.encode(), hashlib.sha256).hexdigest()

    def create(self, db: Session, role: Role) -> tuple[str, SessionInfo]:
        now = _now()
        token = secrets.token_urlsafe(32)
        info = SessionInfo(id=uuid.uuid4().hex, role=role, expires_at=now + SESSION_TTL[role])
        db.execute(text("DELETE FROM sessions WHERE expires_at <= :now"), {"now": _timestamp(now)})
        db.execute(
            text(
                "INSERT INTO sessions (id, token_hash, role, created_at, expires_at) "
                "VALUES (:id, :token_hash, :role, :created_at, :expires_at)"
            ),
            {
                "id": info.id,
                "token_hash": self._hash(token),
                "role": role,
                "created_at": _timestamp(now),
                "expires_at": _timestamp(info.expires_at),
            },
        )
        db.commit()
        return token, info

    def resolve(self, db: Session, token: str | None) -> SessionInfo | None:
        if not token:
            return None
        row = db.execute(
            text(
                "SELECT id, role, expires_at FROM sessions "
                "WHERE token_hash = :token_hash AND expires_at > :now"
            ),
            {"token_hash": self._hash(token), "now": _timestamp(_now())},
        ).mappings().one_or_none()
        if row is None:
            return None
        role: Role = "reviewer" if row["role"] == "reviewer" else "visitor"
        return SessionInfo(
            id=row["id"], role=role, expires_at=datetime.fromisoformat(row["expires_at"])
        )

    def revoke(self, db: Session, token: str | None) -> None:
        if not token:
            return
        db.execute(
            text("DELETE FROM sessions WHERE token_hash = :token_hash"),
            {"token_hash": self._hash(token)},
        )
        db.commit()


def set_session_cookie(response: Response, token: str, info: SessionInfo, *, secure: bool) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(SESSION_TTL[info.role].total_seconds()),
        httponly=True,
        secure=secure,
        samesite="strict",
        path="/",
    )


def clear_session_cookie(response: Response, *, secure: bool) -> None:
    response.delete_cookie(
        SESSION_COOKIE, httponly=True, secure=secure, samesite="strict", path="/"
    )


def reviewer_password_matches(settings: Settings, candidate: str) -> bool:
    expected = settings.reviewer_password.get_secret_value()
    return bool(expected) and hmac.compare_digest(candidate.encode(), expected.encode())


class LoginThrottle:
    """Process-wide cap on failed reviewer logins.

    The API runs as a single replica, so in-memory state is sufficient. The cap is global
    rather than per client because client addresses are not reliable behind the web proxy.
    """

    def __init__(self, max_failures: int = 10, window_seconds: float = 300) -> None:
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self._failures: deque[float] = deque()

    def _prune(self) -> None:
        cutoff = time.monotonic() - self.window_seconds
        while self._failures and self._failures[0] < cutoff:
            self._failures.popleft()

    def allowed(self) -> bool:
        self._prune()
        return len(self._failures) < self.max_failures

    def record_failure(self) -> None:
        self._failures.append(time.monotonic())
