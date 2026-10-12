from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db.migrations import MigrationError, applied_versions, apply_migrations
from app.db.session import build_engine


def _write(directory: Path, name: str, sql: str) -> None:
    (directory / name).write_text(sql, encoding="utf-8")


def _database_url(tmp_path: Path) -> str:
    return f"sqlite:///{(tmp_path / 'app.db').as_posix()}"


def test_baseline_migration_is_recorded(tmp_path: Path) -> None:
    engine = build_engine(_database_url(tmp_path))
    assert apply_migrations(engine) == ["0001_initial"]
    assert applied_versions(engine) == {"0001_initial"}
    engine.dispose()


def test_migrations_apply_in_order_and_only_once(tmp_path: Path) -> None:
    migrations = tmp_path / "migrations"
    migrations.mkdir()
    _write(migrations, "0002_second.sql", "ALTER TABLE probe ADD COLUMN note TEXT;")
    _write(migrations, "0001_first.sql", "CREATE TABLE probe (id INTEGER PRIMARY KEY);")
    engine = build_engine(_database_url(tmp_path))

    assert apply_migrations(engine, migrations) == ["0001_first", "0002_second"]
    assert apply_migrations(engine, migrations) == []
    engine.dispose()


def test_rows_persist_across_engine_restarts(tmp_path: Path) -> None:
    migrations = tmp_path / "migrations"
    migrations.mkdir()
    _write(migrations, "0001_probe.sql", "CREATE TABLE probe (value TEXT NOT NULL);")
    url = _database_url(tmp_path)

    first = build_engine(url)
    apply_migrations(first, migrations)
    with first.begin() as connection:
        connection.execute(text("INSERT INTO probe (value) VALUES ('kept')"))
    first.dispose()

    second = build_engine(url)
    assert apply_migrations(second, migrations) == []
    with second.connect() as connection:
        assert connection.execute(text("SELECT value FROM probe")).scalar_one() == "kept"
    second.dispose()


def test_failed_migration_rolls_back_completely(tmp_path: Path) -> None:
    migrations = tmp_path / "migrations"
    migrations.mkdir()
    _write(
        migrations,
        "0001_broken.sql",
        "CREATE TABLE half (id INTEGER PRIMARY KEY);\nINSERT INTO missing_table VALUES (1);",
    )
    engine = build_engine(_database_url(tmp_path))

    with pytest.raises(MigrationError, match="0001_broken"):
        apply_migrations(engine, migrations)
    assert applied_versions(engine) == set()
    with engine.connect() as connection:
        tables = connection.execute(
            text("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'half'")
        ).all()
    assert tables == []
    engine.dispose()


def test_invalid_migration_name_is_rejected(tmp_path: Path) -> None:
    migrations = tmp_path / "migrations"
    migrations.mkdir()
    _write(migrations, "initial.sql", "SELECT 1;")
    engine = build_engine(_database_url(tmp_path))

    with pytest.raises(MigrationError, match="initial.sql"):
        apply_migrations(engine, migrations)
    engine.dispose()


def test_foreign_keys_are_enforced(tmp_path: Path) -> None:
    engine = build_engine(_database_url(tmp_path))
    with engine.connect() as connection:
        assert connection.execute(text("PRAGMA foreign_keys")).scalar_one() == 1
    engine.dispose()


def test_ready_reports_unavailable_database(client: TestClient) -> None:
    factory = client.app.state.db_sessions  # type: ignore[attr-defined]
    with factory() as session:
        session.execute(text("ALTER TABLE schema_migrations RENAME TO schema_migrations_off"))
        session.commit()
    try:
        response = client.get("/ready")
        assert response.status_code == 503
        assert response.json()["detail"] == "Database is unavailable"
    finally:
        with factory() as session:
            session.execute(text("ALTER TABLE schema_migrations_off RENAME TO schema_migrations"))
            session.commit()
