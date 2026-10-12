from fastapi import Request

from app.providers.base import LLMProvider


def get_provider(request: Request) -> LLMProvider:
    return request.app.state.provider  # type: ignore[no-any-return]

