from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.dependencies import get_provider
from app.providers.base import LLMProvider
from app.schemas.status import ExampleRequest, ExampleResponse

router = APIRouter(tags=["example"])
ProviderDependency = Annotated[LLMProvider, Depends(get_provider)]


@router.post("/example", response_model=ExampleResponse)
async def example(
    request: ExampleRequest, provider: ProviderDependency
) -> ExampleResponse:
    result = await provider.generate(request.text)
    return ExampleResponse(text=result.text, provider_mode=result.provider_mode)
