"""FastAPI entry point: `uvicorn app.main:app --reload` from backend/."""
import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.api.ws import router as ws_router
from app.config import Settings, get_settings
from app.core.mentor.setup import build_rag_service
from app.db.client import create_client, ensure_schema
from app.gateway import build_gateway
from app.utils.exceptions import register_exception_handlers
from app.utils.logging import bind_context, clear_context, configure_logging

log = logging.getLogger("app")


def create_app(settings: Settings | None = None, *, db=None, gateway=None, rag=None) -> FastAPI:
    """App factory. Tests pass an in-memory `db` and a `FakeAIGateway`; production passes nothing."""
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        configure_logging(settings.log_level)
        client = None
        if db is not None:
            app.state.db = db
        elif settings.use_inmemory_db:
            from mongomock_motor import AsyncMongoMockClient  # dev-only dependency

            app.state.db = AsyncMongoMockClient()[settings.cosmos_database]
            log.warning("inmemory_db_enabled")
        else:
            client = create_client(settings)
            app.state.db = client[settings.cosmos_database]
        try:
            await ensure_schema(app.state.db)
        except Exception:  # noqa: BLE001 -- start anyway; /health reports the database as down
            log.exception("db_schema_setup_failed")
        if settings.use_inmemory_db:
            await _seed_inmemory(app.state.db, settings)
        app.state.gateway = gateway or build_gateway(settings)
        app.state.rag = rag if rag is not None else build_rag_service(settings)
        log.info("app_started", extra={"fields": {"env": settings.app_env}})
        yield
        if client is not None:
            await client.close()

    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
    app.state.settings = settings

    app.add_middleware(
        CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
        allow_methods=["*"], allow_headers=["*"], expose_headers=["X-Request-ID"],
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        clear_context()
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        bind_context(request_id=request_id[:64])
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id[:64]
        return response

    register_exception_handlers(app)
    app.include_router(api_router)
    app.include_router(ws_router)
    return app


async def _seed_inmemory(db, settings: Settings) -> None:
    """The in-memory DB starts empty on every restart, so seed it automatically."""
    from app.db.seed import load_seed_questions, seed_dev_user, seed_question_bank

    await seed_question_bank(db, load_seed_questions(settings.seed_dir))
    if settings.app_env == "local":
        await seed_dev_user(db, settings)


app = create_app()
