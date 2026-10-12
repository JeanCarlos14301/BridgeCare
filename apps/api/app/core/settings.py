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
    database_url: str = "sqlite:///./app.db"
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    evolus_enabled: bool = False
    evolus_api_key: SecretStr = SecretStr("")
    evolus_application_id: str = ""
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
