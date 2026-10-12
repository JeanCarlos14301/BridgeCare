import pytest
from pydantic import ValidationError

from app.core.settings import Settings


def test_real_provider_requires_configuration() -> None:
    with pytest.raises(ValidationError, match="LLM_BASE_URL"):
        Settings(llm_provider="openai_compatible")


def test_cors_origins_accept_comma_separated_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5173,https://example.test")
    settings = Settings()
    assert settings.cors_origins == ["http://localhost:5173", "https://example.test"]
