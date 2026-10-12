import json
from pathlib import Path

from app.core.errors import ProviderError
from app.providers.base import (
    ExtractionRequest,
    ExtractionResult,
    GenerationResult,
    LLMProvider,
)

MOCK_MODEL = "mock-fixture-replay"


class MockProvider(LLMProvider):
    """Deterministic offline provider. Extraction replays each fixture's mock_response.json.

    It never runs a model, so its output must always be labelled as mock in the UI.
    """

    mode = "mock"

    def __init__(self, fixtures_dir: Path | None = None) -> None:
        self.fixtures_dir = fixtures_dir

    async def ready(self) -> tuple[bool, str]:
        return True, "Mock provider is ready"

    async def generate(self, text: str) -> GenerationResult:
        word_count = len(text.split())
        return GenerationResult(
            text=f"Mock response received {word_count} words.", provider_mode=self.mode
        )

    async def extract(self, request: ExtractionRequest) -> ExtractionResult:
        if self.fixtures_dir is None or request.fixture_id is None:
            raise ProviderError("Mock provider has no recorded response")
        folder = self.fixtures_dir / request.fixture_id
        try:
            meta = json.loads((folder / "fixture.json").read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise ProviderError("Mock provider has no recorded response") from exc
        behavior = meta.get("mock_behavior", "respond")
        if behavior == "timeout":
            raise ProviderError("Provider request timed out", status_code=504)
        if behavior == "invalid_json":
            return ExtractionResult(
                raw_text="{not valid json", truncated=False, model=MOCK_MODEL, provider_mode="mock"
            )
        try:
            raw = (folder / "mock_response.json").read_text(encoding="utf-8")
        except OSError as exc:
            raise ProviderError("Mock provider has no recorded response") from exc
        return ExtractionResult(
            raw_text=raw, truncated=False, model=MOCK_MODEL, provider_mode="mock"
        )
