from app.providers.base import GenerationResult, LLMProvider


class MockProvider(LLMProvider):
    mode = "mock"

    async def ready(self) -> tuple[bool, str]:
        return True, "Mock provider is ready"

    async def generate(self, text: str) -> GenerationResult:
        word_count = len(text.split())
        return GenerationResult(
            text=f"Mock response received {word_count} words.", provider_mode=self.mode
        )

