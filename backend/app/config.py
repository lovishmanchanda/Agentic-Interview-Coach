"""Application settings.

Locally these come from `.env` (repo root or backend/). In production, App Service injects them as
environment variables backed by Azure Key Vault references, so no Key Vault SDK is needed here.
"""
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
    piston_url: str = ""
    piston_api_key: str = ""

    # ── Voice ──
    speech_key: str = ""
    speech_region: str = ""

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
        if self.app_env in ("local", "test") and not self.jwt_secret:
            # Deterministic dev-only secret so local runs work without a .env.
            self.jwt_secret = "local-dev-only-secret-change-me-0123456789"
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
