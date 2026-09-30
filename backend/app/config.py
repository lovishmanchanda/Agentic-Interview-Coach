"""Application settings.

Locally these come from `.env` (repo root or backend/). In production, App Service injects them as
environment variables backed by Azure Key Vault references, so no Key Vault SDK is needed here.
"""
import secrets
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_REPO_ROOT = _BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(_REPO_ROOT / ".env", _BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── App ──
    app_env: Literal["local", "test", "dev", "prod"] = "local"
    app_name: str = "AI Interview Coach"
    cors_origins: list[str] = ["http://localhost:3000"]
    log_level: str = "INFO"

    # ── Auth ──
    jwt_secret: str = ""
    jwt_issuer: str = "ai-interview-coach"
    access_token_minutes: int = 30
    refresh_token_days: int = 7
    # Cookie mode (the web app): the refresh token lives in an httpOnly cookie that page scripts can't read.
    # SameSite "none" is needed only when the frontend and API are on different sites (e.g. two *.azurewebsites.net).
    refresh_cookie_name: str = "aic_refresh"
    refresh_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    refresh_cookie_secure: bool | None = None  # None: secure everywhere except local/test (plain http)

    # ── Database (Cosmos DB MongoDB API; plain MongoDB locally) ──
    cosmos_connection_string: str = "mongodb://localhost:27017"
    cosmos_database: str = "interview_coach"
    # Local only: run against an in-memory MongoDB double (no Docker/MongoDB needed). Data is lost on restart.
    use_inmemory_db: bool = False

    # ── AI Gateway (all LLM calls run on Groq; GROQ_API_KEY below is shared with the Mentor) ──
    llm_provider: Literal["groq"] = "groq"
    groq_interview_model: str = "openai/gpt-oss-120b"  # interviewer agent, report generator
    groq_fast_model: str = "openai/gpt-oss-20b"         # evaluate_answer and other high-volume calls
    session_token_budget: int = 60_000
    # Estimated USD per 1M tokens (input, output) for the cost reports. Check Groq's pricing page and override.
    groq_price_default_in: float = 0.15
    groq_price_default_out: float = 0.75
    groq_price_fast_in: float = 0.10
    groq_price_fast_out: float = 0.50
    # Per candidate per UTC day, checked when an interview, Mentor message or prep plan starts (0 = no limit).
    daily_token_limit_per_user: int = Field(default=400_000, ge=0)
    # Store full prompt/output text in llm_calls (debugging). Off by default: prompts contain candidates' answers.
    llm_trace_content: bool = False
    use_fake_gateway: bool | None = None  # None -> fake in local/test, real elsewhere

    # ── Mentor RAG (rag_tool) ──
    hf_token: str = ""
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    chat_provider: str = "groq"
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    chroma_path: str = str(_REPO_ROOT / "data" / "chroma")
    chroma_collection: str = "interview_reports_v2"

    # ── Code execution (Piston) ──
    # Base URL: a proxy that serves POST <url>/execute, or Piston itself as http://host:2000/api/v2.
    piston_url: str = ""
    piston_api_key: str = ""   # sent as X-API-Key when set
    piston_timeout_s: float = Field(default=30.0, gt=0)
    code_runs_per_minute: int = Field(default=12, ge=1)  # "Run" presses per candidate (Submit is limited by the flow)

    # ── Abuse limits (per process; see utils/rate_limit.py) ──
    login_failures_per_15_min: int = Field(default=10, ge=1)   # per email and per IP
    registrations_per_hour: int = Field(default=20, ge=1)      # per IP
    mentor_messages_per_minute: int = Field(default=10, ge=1)  # per candidate: each one is an LLM call
    interviews_per_hour: int = Field(default=20, ge=1)         # per candidate: each one is several LLM calls
    prep_plans_per_hour: int = Field(default=5, ge=1)          # per candidate: research + JD + plan (Phase 3)
    max_request_bytes: int = Field(default=1_000_000, ge=10_000)

    # ── Observability (Phase 6) ──
    admin_emails: list[str] = []            # these accounts can open the admin dashboard and prompt settings
    applicationinsights_connection_string: str = ""  # set in Azure to export traces/metrics to App Insights

    # ── Voice ──
    speech_key: str = ""
    speech_region: str = ""

    # ── Interview engine ──
    # Evaluation or report work older than this is presumed abandoned (worker crashed) and taken over.
    stale_work_seconds: int = Field(default=120, ge=1)
    # One follow-up after a partial answer (AdaptationEngine). Off switch, e.g. to save tokens.
    interview_follow_ups: bool = True
    # The interviewer agent (Groq gpt-oss-120b) writes the dialogue and proposes each move. Off: plain wording
    # and AdaptationEngine decisions only (fewer LLM calls).
    interview_agent: bool = True
    # Groq writes the report's summary, weak areas, recommendations and study plan (scores are always computed).
    # Off: the deterministic report stitched from the evaluator's notes.
    report_writer: bool = True
    # Wrap up after this long, whatever the question count (the state machine decides when; the agent what to say).
    max_interview_minutes: int = Field(default=60, ge=1)

    # ── Input limits (architecture.md §12.3) ──
    max_answer_chars: int = 5_000
    max_code_chars: int = 10_000
    max_jd_chars: int = 50_000

    seed_dir: str = Field(default=str(_REPO_ROOT / "data" / "seed"))

    @field_validator("chroma_path", "seed_dir")
    @classmethod
    def _anchor_to_repo_root(cls, value: str) -> str:
        """Relative paths (e.g. CHROMA_PATH=data/chroma) mean <project root>/..., whatever the working
        directory, so local data always lands in the gitignored <project>/data/."""
        path = Path(value).expanduser()
        return str(path if path.is_absolute() else (_REPO_ROOT / path).resolve())

    @model_validator(mode="after")
    def _check_secrets(self) -> "Settings":
        if self.app_env in ("dev", "prod") and len(self.jwt_secret) < 32:
            raise ValueError("JWT_SECRET must be set (>= 32 chars) outside local/test")
        if self.use_inmemory_db and self.app_env not in ("local", "test"):
            raise ValueError("USE_INMEMORY_DB is only allowed when APP_ENV is local or test")
        if self.app_env == "test" and not self.jwt_secret:
            self.jwt_secret = "test-only-secret-0123456789-0123456789"  # deterministic for the test suite
        elif self.app_env == "local" and not self.jwt_secret:
            # Random per process: a secret written in the repo would let anyone forge tokens if a deployment
            # ever ran with the default APP_ENV. The cost: sign in again after restarting the backend.
            self.jwt_secret = secrets.token_urlsafe(48)
        return self

    @property
    def fake_gateway(self) -> bool:
        """Explicit USE_FAKE_GATEWAY wins. Otherwise: tests always fake; local uses real Groq
        when GROQ_API_KEY is set and the fake when it isn't; dev/prod always real."""
        if self.use_fake_gateway is not None:
            return self.use_fake_gateway
        if self.app_env == "test":
            return True
        if self.app_env == "local":
            return not self.groq_api_key
        return False


@lru_cache
def get_settings() -> Settings:
    return Settings()
