from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Literal

ProviderMode = Literal["mock", "openai_compatible"]


@dataclass(frozen=True)
class GenerationResult:
    text: str
    provider_mode: ProviderMode


@dataclass(frozen=True)
class ExtractionRequest:
    system_prompt: str
    user_prompt: str
    # Used only by the mock provider to replay a fixture's recorded response.
    fixture_id: str | None = None


@dataclass(frozen=True)
class ExtractionResult:
    raw_text: str
    truncated: bool
    model: str
    provider_mode: ProviderMode


class LLMProvider(ABC):
    mode: ProviderMode
    # Hostname of the inference endpoint, shown in the UI; never the key or the full URL.
    host: str | None = None

    @abstractmethod
    async def ready(self) -> tuple[bool, str]:
        """Return provider readiness and a safe metadata-only message."""

    @abstractmethod
    async def generate(self, text: str) -> GenerationResult:
        """Generate a short generic response."""

    @abstractmethod
    async def extract(self, request: ExtractionRequest) -> ExtractionResult:
        """Return the raw JSON text for a structured extraction.

        Raises ProviderError on timeout, transport, or upstream failure. The caller validates
        the returned text; providers never interpret it.
        """
