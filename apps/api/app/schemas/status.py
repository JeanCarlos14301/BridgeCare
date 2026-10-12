from typing import Literal

from pydantic import BaseModel, Field

from app.providers.base import ProviderMode


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    provider_mode: ProviderMode


class ReadyResponse(BaseModel):
    status: Literal["ready", "not_ready"]
    provider_mode: ProviderMode
    detail: str


class ExampleRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)


class ExampleResponse(BaseModel):
    text: str
    provider_mode: ProviderMode

