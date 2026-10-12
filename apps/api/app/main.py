import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.cases import router as cases_router
from app.api.example import router as example_router
from app.api.health import router as health_router
from app.api.session import router as session_router
from app.core.errors import install_error_handlers
from app.core.logging import configure_logging, metadata_logging_middleware
from app.core.sessions import LoginThrottle, SessionStore, session_key
from app.core.settings import get_settings
from app.db.migrations import apply_migrations
from app.db.session import build_engine, build_session_factory
from app.providers import build_provider
from app.services.cases import CaseService, mark_interrupted_jobs
from app.services.fixtures import FixtureCatalog, resolve_fixtures_dir


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    engine = build_engine(settings.database_url)
    applied = apply_migrations(engine)
    interrupted = mark_interrupted_jobs(engine)
    logging.getLogger("bridgecare.db").info(
        json.dumps(
            {"event": "migrations_applied", "versions": applied, "interrupted_jobs": interrupted}
        )
    )
    app.state.db_sessions = build_session_factory(engine)
    fixtures_dir = resolve_fixtures_dir(settings)
    app.state.provider = build_provider(settings, fixtures_dir)
    app.state.case_service = CaseService(FixtureCatalog(fixtures_dir), app.state.provider)
    app.state.session_store = SessionStore(session_key(settings))
    app.state.login_throttle = LoginThrottle()
    yield
    engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging()
    application = FastAPI(
        title="BridgeCare API",
        version="0.1.0",
        description=(
            "Discharge-instructions review assistant. The model drafts; only a human reviewer "
            "approves. No diagnosis, treatment, or dose calculation."
        ),
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "Authorization"],
    )
    application.middleware("http")(metadata_logging_middleware)
    application.include_router(health_router)
    application.include_router(example_router)
    application.include_router(session_router)
    application.include_router(cases_router)
    install_error_handlers(application)
    return application


app = create_app()
