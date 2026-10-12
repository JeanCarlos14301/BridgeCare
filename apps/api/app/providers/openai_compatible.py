import asyncio
from typing import Any

import httpx

from app.core.errors import ProviderError
from app.core.settings import Settings
from app.providers.base import GenerationResult, LLMProvider


class OpenAICompatibleProvider(LLMProvider):
    mode = "openai_compatible"

    def __init__(self, settings: Settings) -> None:
        self.base_url = settings.llm_base_url.rstrip("/")
        self.api_key = settings.llm_api_key.get_secret_value()
        self.model = settings.llm_model
        self.timeout = settings.llm_timeout_seconds

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"}

    async def ready(self) -> tuple[bool, str]:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(f"{self.base_url}/v1/models", headers=self.headers)
            if response.status_code == 401:
                return False, "Provider rejected authentication"
            if response.status_code == 429:
                return False, "Provider rate limit is active"
            if response.status_code >= 500:
                return False, "Provider returned a server error"
            response.raise_for_status()
            response.json()
            return True, "Provider is reachable"
        except (httpx.HTTPError, ValueError):
            return False, "Provider is unreachable or returned invalid JSON"

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

    async def _post_with_one_retry(self, payload: dict[str, Any]) -> httpx.Response:
        for attempt in range(2):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
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
            if response.status_code == 429:
                if attempt == 0:
                    await asyncio.sleep(0.1)
                    continue
                raise ProviderError("Provider rate limit exceeded", status_code=503)
            if response.status_code >= 500:
                if attempt == 0:
                    await asyncio.sleep(0.1)
                    continue
                raise ProviderError("Provider returned a server error", status_code=502)
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise ProviderError("Provider request was rejected", status_code=502) from exc
            return response
        raise ProviderError("Provider request failed")

