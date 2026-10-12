import pytest
from pydantic import ValidationError

from app.core.settings import Settings

PROVIDER_VARIABLES = ("LLM_PROVIDER", "LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL")


@pytest.fixture(autouse=True)
def clean_provider_env(monkeypatch: pytest.MonkeyPatch) -> None:
    # Developers with a real endpoint exported in their shell must not mask the fail-closed check.
    for name in PROVIDER_VARIABLES:
        monkeypatch.delenv(name, raising=False)


def test_real_provider_requires_configuration() -> None:
    with pytest.raises(ValidationError, match="LLM_BASE_URL"):
        Settings(_env_file=None, llm_provider="openai_compatible")


def test_startup_error_does_not_echo_secrets(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "openai_compatible")
    monkeypatch.setenv("LLM_API_KEY", "leak-check-api-key")
    monkeypatch.setenv("SESSION_SECRET", "leak-check-session-secret-0123456789")
    with pytest.raises(ValidationError) as error:
        Settings(_env_file=None)
    message = str(error.value)
    assert "LLM_BASE_URL" in message
    assert "leak-check-api-key" not in message
    assert "leak-check-session-secret-0123456789" not in message


def test_secrets_are_masked_in_repr(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SESSION_SECRET", "leak-check-session-secret-0123456789")
    settings = Settings(_env_file=None)
    assert "leak-check-session-secret-0123456789" not in repr(settings)
    assert settings.session_secret.get_secret_value() == "leak-check-session-secret-0123456789"


def test_cors_origins_accept_comma_separated_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5173,https://example.test")
    settings = Settings(_env_file=None)
    assert settings.cors_origins == ["http://localhost:5173", "https://example.test"]
