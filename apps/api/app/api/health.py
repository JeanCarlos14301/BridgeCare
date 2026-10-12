from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.dependencies import get_db_session, get_provider
from app.providers.base import LLMProvider
from app.schemas.status import HealthResponse, ReadyResponse

router = APIRouter(tags=["status"])
ProviderDependency = Annotated[LLMProvider, Depends(get_provider)]
SessionDependency = Annotated[Session, Depends(get_db_session)]


@router.get("/health", response_model=HealthResponse)
async def health(provider: ProviderDependency) -> HealthResponse:
    return HealthResponse(provider_mode=provider.mode)


@router.get("/ready", response_model=ReadyResponse)
async def ready(
    response: Response, provider: ProviderDependency, session: SessionDependency
) -> ReadyResponse:
    try:
        session.execute(text("SELECT 1 FROM schema_migrations LIMIT 1"))
    except SQLAlchemyError:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return ReadyResponse(
            status="not_ready", provider_mode=provider.mode, detail="Database is unavailable"
        )
    is_ready, detail = await provider.ready()
    if not is_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return ReadyResponse(
        status="ready" if is_ready else "not_ready",
        provider_mode=provider.mode,
        detail=detail,
    )
