import json
from collections.abc import Callable

import httpx
import pytest

from app.core.errors import ProviderError
from app.core.settings import Settings
from app.providers.base import ExtractionRequest
from app.providers.openai_compatible import OpenAICompatibleProvider

Handler = Callable[[httpx.Request], httpx.Response]
REQUEST = ExtractionRequest(system_prompt="system", user_prompt="user")
pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def _provider(handler: Handler, **overrides: object) -> OpenAICompatibleProvider:
    settings = Settings(
        _env_file=None,
        llm_provider="openai_compatible",
        llm_base_url="https://provider.test/api",
        llm_api_key="rc-test",
        llm_model="DeepSeek-V4-Flash",
        **overrides,  # type: ignore[arg-type]
    )
    return OpenAICompatibleProvider(settings, transport=httpx.MockTransport(handler))


def _completion(content: str | None, finish_reason: str = "stop") -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "model": "DeepSeek-V4-Flash",
            "choices": [{"message": {"content": content}, "finish_reason": finish_reason}],
        },
    )


@pytest.fixture(autouse=True)
def clean_provider_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("LLM_PROVIDER", "LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"):
        monkeypatch.delenv(name, raising=False)


async def test_extract_sends_json_mode_and_optional_reasoning_effort() -> None:
    seen: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v1/chat/completions"
        assert request.headers["Authorization"] == "Bearer rc-test"
        seen.append(json.loads(request.content))
        return _completion('{"ok": true}')

    result = await _provider(handler, llm_reasoning_effort="low").extract(REQUEST)
    assert result.raw_text == '{"ok": true}'
    assert result.truncated is False
    assert seen[0]["response_format"] == {"type": "json_object"}
    assert seen[0]["reasoning_effort"] == "low"
    assert seen[0]["messages"][0]["role"] == "system"  # type: ignore[index]

    seen.clear()
    await _provider(handler).extract(REQUEST)
    assert "reasoning_effort" not in seen[0]


async def test_empty_content_with_length_is_truncated() -> None:
    result = await _provider(lambda _: _completion(None, "length")).extract(REQUEST)
    assert result.truncated is True
    assert result.raw_text == ""


async def test_short_retry_after_is_honoured_once() -> None:
    calls = 0

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(429, headers={"Retry-After": "0"})
        return _completion("{}")

    await _provider(handler).extract(REQUEST)
    assert calls == 2


async def test_long_retry_after_fails_fast() -> None:
    calls = 0

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(429, headers={"Retry-After": "60"})

    with pytest.raises(ProviderError, match="rate limit"):
        await _provider(handler).extract(REQUEST)
    assert calls == 1


async def test_unknown_model_is_a_clear_error() -> None:
    with pytest.raises(ProviderError, match="LLM_MODEL"):
        await _provider(lambda _: httpx.Response(400, json={"error": {}})).extract(REQUEST)


async def test_ready_requires_the_model_in_the_catalog() -> None:
    def listed(models: list[str]) -> Handler:
        return lambda _: httpx.Response(200, json={"data": [{"id": m} for m in models]})

    ready, _ = await _provider(listed(["DeepSeek-V4-Flash"])).ready()
    assert ready is True
    ready, detail = await _provider(listed(["Other-Model"])).ready()
    assert ready is False
    assert "catalog" in detail
