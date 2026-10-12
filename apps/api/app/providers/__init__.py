from app.core.settings import Settings
from app.providers.base import LLMProvider
from app.providers.mock import MockProvider
from app.providers.openai_compatible import OpenAICompatibleProvider


def build_provider(settings: Settings) -> LLMProvider:
    if settings.llm_provider == "mock":
        return MockProvider()
    return OpenAICompatibleProvider(settings)


__all__ = ["LLMProvider", "build_provider"]

