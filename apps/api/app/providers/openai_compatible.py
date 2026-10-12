import asyncio
import random
from typing import Any

import httpx

from app.core.errors import ProviderError
from app.core.settings import Settings
from app.providers.base import (
    ExtractionRequest,
    ExtractionResult,
    GenerationResult,
    LLMProvider,
)

# Wait for Retry-After only when it is short (e.g. a concurrency limit). Per-minute limits
# answer Retry-After: 60, which would hold the request open too long; fail fast instead.
MAX_RETRY_AFTER_SECONDS = 5.0


def _retry_after(response: httpx.Response) -> float | None:
    try:
        return float(response.headers["Retry-After"])
    except (KeyError, ValueError):
        return None


class OpenAICompatibleProvider(LLMProvider):
    """OpenAI-compatible chat client (vLLM, AMD Token Factory shared endpoints)."""

    mode = "openai_compatible"

    def __init__(
        self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self.base_url = settings.llm_base_url.rstrip("/")
        self.api_key = settings.llm_api_key.get_secret_value()
        self.model = settings.llm_model
        self.timeout = settings.llm_timeout_seconds
        self.reasoning_effort = settings.llm_reasoning_effort
        self.max_output_tokens = settings.llm_max_output_tokens
        self.transport = transport

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"}

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=self.timeout, transport=self.transport)

    async def ready(self) -> tuple[bool, str]:
        try:
            async with self._client() as client:
                response = await client.get(f"{self.base_url}/v1/models", headers=self.headers)
            if response.status_code == 401:
                return False, "Provider rejected authentication"
            if response.status_code == 403:
                return False, "Provider account is not authorized"
            if response.status_code == 429:
                return False, "Provider rate limit is active"
            if response.status_code >= 500:
                return False, "Provider returned a server error"
            response.raise_for_status()
            listed = {item.get("id") for item in response.json().get("data", [])}
        except (httpx.HTTPError, ValueError, AttributeError):
            return False, "Provider is unreachable or returned invalid JSON"
        if self.model not in listed:
            # Shared catalogs change over time; a missing model must not look ready.
            return False, "Configured model is not in the provider catalog"
        return True, "Provider is reachable and the configured model is listed"

    async def generate(self, text: str) -> GenerationResult:
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": text}],
            "max_tokens": 80,
            "temperature": 0,
        }
        response = await self._post_with_one_retry(payload)
        try:
            body: dict[str, Any] = response.json()
            generated = body["choices"][0]["message"]["content"]
            if not isinstance(generated, str):
                raise TypeError
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise ProviderError("Provider returned invalid JSON") from exc
        return GenerationResult(text=generated, provider_mode=self.mode)

    async def extract(self, request: ExtractionRequest) -> ExtractionResult:
        payload: dict[str, Any] = {
            "model": self.model,
            # A single system message at index 0 is accepted by every Token Factory model.
            "messages": [
                {"role": "system", "content": request.system_prompt},
                {"role": "user", "content": request.user_prompt},
            ],
            "max_tokens": self.max_output_tokens,
            "temperature": 0,
            "response_format": {"type": "json_object"},
        }
        if self.reasoning_effort:
            payload["reasoning_effort"] = self.reasoning_effort
        response = await self._post_with_one_retry(payload)
        try:
            body: dict[str, Any] = response.json()
            choice = body["choices"][0]
            content = choice["message"]["content"]
            if content is None:
                content = ""
            if not isinstance(content, str):
                raise TypeError
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise ProviderError("Provider returned invalid JSON") from exc
        return ExtractionResult(
            raw_text=content,
            # Reasoning models can spend max_tokens on thinking and return empty content.
            truncated=choice.get("finish_reason") == "length",
            model=str(body.get("model") or self.model),
            provider_mode=self.mode,
        )

    async def _post_with_one_retry(self, payload: dict[str, Any]) -> httpx.Response:
        for attempt in range(2):
            try:
                async with self._client() as client:
                    response = await client.post(
                        f"{self.base_url}/v1/chat/completions",
                        headers=self.headers,
                        json=payload,
                    )
            except httpx.TimeoutException as exc:
                if attempt == 0:
                    await asyncio.sleep(0.1)
                    continue
                raise ProviderError("Provider request timed out", status_code=504) from exc
            except httpx.HTTPError as exc:
                raise ProviderError("Provider is unreachable") from exc

            if response.status_code == 401:
                raise ProviderError("Provider rejected authentication", status_code=502)
            if response.status_code == 403:
                raise ProviderError("Provider account is not authorized", status_code=502)
            if response.status_code == 400:
                raise ProviderError(
                    "Provider rejected the request; check LLM_MODEL against /v1/models",
                    status_code=502,
                )
            if response.status_code == 429:
                wait = _retry_after(response)
                if attempt == 0 and (wait is None or wait <= MAX_RETRY_AFTER_SECONDS):
                    delay = wait if wait is not None else 1.0
                    await asyncio.sleep(delay + random.uniform(0, 0.5))
                    continue
                raise ProviderError(
                    "Provider rate limit exceeded; try again later", status_code=503
                )
            if response.status_code >= 500:
                if attempt == 0:
                    await asyncio.sleep(0.5 + random.uniform(0, 0.5))
                    continue
                raise ProviderError("Provider returned a server error", status_code=502)
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise ProviderError("Provider request was rejected", status_code=502) from exc
            return response
        raise ProviderError("Provider request failed")
