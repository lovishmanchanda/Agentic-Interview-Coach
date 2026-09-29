"""FastAPI entry point: `uvicorn app.main:app --reload` from backend/."""
import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.api.ws import router as ws_router
from app.config import Settings, get_settings
from app.core.mentor.indexer import ReportIndexer
from app.core.mentor.setup import build_rag_service
from app.db.client import create_client, ensure_schema
from app.gateway import build_gateway
from app.utils.exceptions import register_exception_handlers
from app.utils.logging import bind_context, clear_context, configure_logging
from app.utils.rate_limit import SlidingWindowLimiter
from app.utils.responses import fail

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
        app.state.rag = rag if rag is not None else build_rag_service(settings, app.state.gateway)
        app.state.indexer = ReportIndexer(app.state.rag, app.state.db)
        app.state.indexer.start_sweep()  # reports left unindexed by a restart or an outage
        log.info("app_started", extra={"fields": {"env": settings.app_env}})
        yield
        await app.state.indexer.close()
        if client is not None:
            await client.close()

    # The API map (/docs, /openapi.json) is for local development only.
    docs = settings.app_env in ("local", "test")
    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan,
                  docs_url="/docs" if docs else None, redoc_url="/redoc" if docs else None,
                  openapi_url="/openapi.json" if docs else None)
    app.state.settings = settings
    app.state.limiters = {
        "login_email": SlidingWindowLimiter(settings.login_failures_per_15_min, 15 * 60),
        "login_ip": SlidingWindowLimiter(settings.login_failures_per_15_min * 3, 15 * 60),
        "register_ip": SlidingWindowLimiter(settings.registrations_per_hour, 3600),
        "mentor": SlidingWindowLimiter(settings.mentor_messages_per_minute, 60),
        "interviews": SlidingWindowLimiter(settings.interviews_per_hour, 3600),
        "code_run": SlidingWindowLimiter(settings.code_runs_per_minute, 60),
        "prep": SlidingWindowLimiter(settings.prep_plans_per_hour, 3600),
    }

    app.add_middleware(
        CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
        allow_methods=["*"], allow_headers=["*"], expose_headers=["X-Request-ID"],
    )

    @app.middleware("http")
    async def limit_body_size(request: Request, call_next):
        """Reject oversized bodies before they're read (the biggest legitimate one is a JD or code, ~50 KB)."""
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > settings.max_request_bytes:
            return JSONResponse(fail("payload_too_large", "The request is too large."), status_code=413)
        return await call_next(request)

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
    from app.db.seed import load_seed_companies, load_seed_questions, seed_companies, seed_dev_user, seed_question_bank

    await seed_question_bank(db, load_seed_questions(settings.seed_dir))
    await seed_companies(db, load_seed_companies(settings.seed_dir))
    if settings.app_env == "local":
        await seed_dev_user(db, settings)


app = create_app()
