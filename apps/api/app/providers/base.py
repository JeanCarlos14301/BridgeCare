from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Literal

ProviderMode = Literal["mock", "openai_compatible"]


@dataclass(frozen=True)
class GenerationResult:
    text: str
    provider_mode: ProviderMode


class LLMProvider(ABC):
    mode: ProviderMode

    @abstractmethod
    async def ready(self) -> tuple[bool, str]:
        """Return provider readiness and a safe metadata-only message."""

    @abstractmethod
    async def generate(self, text: str) -> GenerationResult:
        """Generate a short generic response."""

