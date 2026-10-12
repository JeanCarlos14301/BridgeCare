import os
import sys
import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# A file database: an in-memory one is per connection, so migrations would not be visible
# to request threads.
_DATABASE_DIR = Path(tempfile.mkdtemp(prefix="bridgecare-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(_DATABASE_DIR / 'app.db').as_posix()}"
# Force the offline mock so tests never reach a real endpoint exported in the developer's shell.
os.environ["LLM_PROVIDER"] = "mock"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
