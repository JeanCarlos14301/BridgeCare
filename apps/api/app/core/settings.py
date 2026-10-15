from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    # hide_input_in_errors keeps validation errors from echoing raw environment values,
    # including secrets, to stderr.
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
        hide_input_in_errors=True,
    )

    app_env: str = "development"
    demo_mode: bool = True
    allow_uploads: bool = False
    llm_provider: Literal["mock", "openai_compatible"] = "mock"
    llm_base_url: str = ""
    llm_api_key: SecretStr = SecretStr("")
    llm_model: str = ""
    llm_timeout_seconds: float = Field(default=60, gt=0, le=300)
    # Thinking tokens count toward max_tokens on reasoning models; empty omits the field.
    llm_reasoning_effort: Literal["", "none", "minimal", "low", "medium", "high"] = ""
    llm_max_output_tokens: int = Field(default=4096, ge=256, le=32768)
    database_url: str = "sqlite:///./app.db"
    # Empty means: search parent folders for fixtures/discharge (repository checkout).
    fixtures_dir: str = ""
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    reviewer_password: SecretStr = SecretStr("")
    session_secret: SecretStr = SecretStr("")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @model_validator(mode="after")
    def validate_provider(self) -> "Settings":
        if self.llm_provider == "openai_compatible":
            missing = [
                name
                for name, value in (
                    ("LLM_BASE_URL", self.llm_base_url),
                    ("LLM_API_KEY", self.llm_api_key.get_secret_value()),
                    ("LLM_MODEL", self.llm_model),
                )
                if not value
            ]
            if missing:
                raise ValueError(
                    "openai_compatible provider requires: " + ", ".join(missing)
                )
        return self

    @model_validator(mode="after")
    def validate_sessions(self) -> "Settings":
        session_secret = self.session_secret.get_secret_value()
        reviewer_password = self.reviewer_password.get_secret_value()
        if not self.is_development and not session_secret:
            raise ValueError("SESSION_SECRET is required when APP_ENV is not development")
        if session_secret and len(session_secret) < 32:
            raise ValueError("SESSION_SECRET must be at least 32 characters")
        if reviewer_password and len(reviewer_password) < 12:
            raise ValueError("REVIEWER_PASSWORD must be at least 12 characters")
        return self

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
