import re
import sqlite3
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import Engine

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"
VERSION_PATTERN = re.compile(r"^\d{4}_[a-z0-9_]+$")

_CREATE_LEDGER = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
)
"""


class MigrationError(RuntimeError):
    pass


def discover_migrations(directory: Path = MIGRATIONS_DIR) -> list[Path]:
    files = sorted(directory.glob("*.sql"))
    for path in files:
        if not VERSION_PATTERN.match(path.stem):
            raise MigrationError(f"Invalid migration file name: {path.name}")
    return files


def applied_versions(engine: Engine) -> set[str]:
    with engine.begin() as connection:
        connection.execute(text(_CREATE_LEDGER))
        rows = connection.execute(text("SELECT version FROM schema_migrations"))
        return {row[0] for row in rows}


def apply_migrations(engine: Engine, directory: Path = MIGRATIONS_DIR) -> list[str]:
    """Apply pending SQL migrations in file-name order and return the versions applied.

    Each migration runs in its own transaction together with its ledger row, so a failing
    migration leaves neither partial schema changes nor a recorded version. The API runs as
    a single replica, so no cross-process migration lock is taken.
    """
    if engine.dialect.name != "sqlite":
        raise MigrationError("Only SQLite migrations are supported")
    done = applied_versions(engine)
    applied: list[str] = []
    for path in discover_migrations(directory):
        version = path.stem
        if version in done:
            continue
        # The version is validated by VERSION_PATTERN, so embedding it in SQL is safe.
        script = (
            "BEGIN;\n"
            f"{path.read_text(encoding='utf-8')}\n;\n"
            f"INSERT INTO schema_migrations (version) VALUES ('{version}');\n"
            "COMMIT;\n"
        )
        raw = engine.raw_connection()
        try:
            driver = raw.driver_connection
            assert isinstance(driver, sqlite3.Connection)
            try:
                driver.executescript(script)
            except sqlite3.Error as exc:
                if driver.in_transaction:
                    driver.rollback()
                raise MigrationError(f"Migration {version} failed") from exc
        finally:
            raw.close()
        applied.append(version)
    return applied
