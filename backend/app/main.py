"""FastAPI entry point: `uvicorn app.main:app --reload` from backend/."""
import asyncio
import logging
import time
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
from app.core.prompts import PromptRegistry, set_registry
from app.gateway.usage import LLMCallRecorder
from app.utils.metrics import Metrics
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
        elif settings.seed_on_startup:
            await _seed_catalogue(app.state.db, settings)
        app.state.gateway = gateway or build_gateway(settings)
        # Every AI call is recorded in llm_calls (6.1); writes are batched in the background.
        app.state.gateway.recorder = LLMCallRecorder(app.state.db, trace_content=settings.llm_trace_content)
        app.state.gateway.recorder.start()
        app.state.gateway.metrics = app.state.metrics
        # Prompt versions and A/B splits (6.4), refreshed so a change on any worker reaches every worker.
        app.state.prompts = PromptRegistry(app.state.db)
        await app.state.prompts.refresh()
        set_registry(app.state.prompts)
        refresher = asyncio.create_task(_refresh_prompts(app.state.prompts), name="prompt-registry-refresh")
        app.state.rag = rag if rag is not None else build_rag_service(settings, app.state.gateway)
        app.state.indexer = ReportIndexer(app.state.rag, app.state.db)
        app.state.indexer.start_sweep()  # reports left unindexed by a restart or an outage
        log.info("app_started", extra={"fields": {"env": settings.app_env}})
        yield
        refresher.cancel()
        set_registry(None)
        await app.state.indexer.close()
        await app.state.gateway.recorder.close()
        if client is not None:
            await client.close()

    # The API map (/docs, /openapi.json) is for local development only.
    docs = settings.app_env in ("local", "test")
    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan,
                  docs_url="/docs" if docs else None, redoc_url="/redoc" if docs else None,
                  openapi_url="/openapi.json" if docs else None)
    app.state.settings = settings
    app.state.metrics = Metrics()
    _configure_azure_monitor(settings)
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
        started = time.perf_counter()
        response = await call_next(request)
        if request.method != "OPTIONS":  # CORS preflights aren't traffic
            app.state.metrics.observe_http(f"{request.method} {_route_template(request)}", response.status_code,
                                           (time.perf_counter() - started) * 1000)
        response.headers["X-Request-ID"] = request_id[:64]
        return response

    register_exception_handlers(app)
    app.include_router(api_router)
    app.include_router(ws_router)
    return app


PROMPT_REFRESH_S = 30


def _route_template(request: Request) -> str:
    """"/api/v1/interviews/abc/state" -> "/api/v1/interviews/{session_id}/state", so metrics group by endpoint, not
    by ID. The matched route's path is relative to its router here; its router prefix comes from the URL."""
    route = request.scope.get("route")
    template = getattr(route, "path", None)
    if not template:
        return "unmatched"
    parts, route_parts = request.url.path.split("/"), template.split("/")
    prefix = "/".join(parts[:max(1, len(parts) - (len(route_parts) - 1))])
    return template if not prefix or template.startswith(prefix + "/") else prefix + template


async def _refresh_prompts(registry: PromptRegistry) -> None:
    while True:
        await asyncio.sleep(PROMPT_REFRESH_S)
        await registry.refresh()


def _configure_azure_monitor(settings: Settings) -> None:
    """Exports traces, metrics and logs to Application Insights when a connection string is set (deployment).
    The package is installed in the deployment image: pip install azure-monitor-opentelemetry."""
    if not settings.applicationinsights_connection_string:
        return
    try:
        from azure.monitor.opentelemetry import configure_azure_monitor
    except ImportError:
        log.warning("azure_monitor_unavailable", extra={"fields": {"fix": "pip install azure-monitor-opentelemetry"}})
        return
    configure_azure_monitor(connection_string=settings.applicationinsights_connection_string)
    log.info("azure_monitor_enabled")


async def _seed_catalogue(db, settings: Settings) -> None:
    """SEED_ON_STARTUP: the question bank and companies (never the dev user). A failure is logged, not fatal."""
    from app.db.seed import load_seed_companies, load_seed_questions, seed_companies, seed_question_bank

    try:
        questions = await seed_question_bank(db, load_seed_questions(settings.seed_dir))
        companies = await seed_companies(db, load_seed_companies(settings.seed_dir))
        log.info("seeded_on_startup", extra={"fields": {"questions": questions, "companies": companies}})
    except Exception:  # noqa: BLE001 -- the app still serves; /health shows whether the DB is reachable
        log.exception("seed_on_startup_failed")


async def _seed_inmemory(db, settings: Settings) -> None:
    """The in-memory DB starts empty on every restart, so seed it automatically."""
    from app.db.seed import load_seed_companies, load_seed_questions, seed_companies, seed_dev_user, seed_question_bank

    await seed_question_bank(db, load_seed_questions(settings.seed_dir))
    await seed_companies(db, load_seed_companies(settings.seed_dir))
    if settings.app_env == "local":
        await seed_dev_user(db, settings)


app = create_app()
