from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.example import router as example_router
from app.api.health import router as health_router
from app.core.errors import install_error_handlers
from app.core.logging import configure_logging, metadata_logging_middleware
from app.core.settings import get_settings
from app.db.session import build_engine, build_session_factory
from app.providers import build_provider


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    engine = build_engine(settings.database_url)
    app.state.db_sessions = build_session_factory(engine)
    app.state.provider = build_provider(settings)
    yield
    engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging()
    application = FastAPI(
        title="BridgeCare API",
        version="0.1.0",
        description="Generic Phase A scaffold. Health-specific behavior is not implemented.",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "Authorization"],
    )
    application.middleware("http")(metadata_logging_middleware)
    application.include_router(health_router)
    application.include_router(example_router)
    install_error_handlers(application)
    return application


app = create_app()
