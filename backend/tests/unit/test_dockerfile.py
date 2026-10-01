"""The backend image must contain every repo-root folder the app reads at runtime. Locally they're simply there,
so a missing COPY only shows in production (it once shipped without prompts/: every interview failed to start)."""
from pathlib import Path

from app.config import Settings
from app.core.prompts import PROMPTS_DIR

BACKEND = Path(__file__).resolve().parents[2]
REPO = BACKEND.parent


def _copies() -> dict[str, str]:
    """source -> destination for every COPY in backend/Dockerfile."""
    out = {}
    for line in (BACKEND / "Dockerfile").read_text().splitlines():
        parts = line.split()
        if parts[:1] == ["COPY"] and not any(p.startswith("--") for p in parts):
            out[parts[1].rstrip("/")] = parts[2]
    return out


def test_image_copies_the_prompts_where_the_app_looks_for_them():
    rel = PROMPTS_DIR.relative_to(REPO).as_posix()  # "prompts"
    assert _copies().get(rel) == f"/srv/{rel}"


def test_image_copies_the_seed_data_where_the_app_looks_for_it():
    rel = Path(Settings(_env_file=None).seed_dir).relative_to(REPO).as_posix()  # "data/seed"
    assert _copies().get(rel) == f"/srv/{rel}"


def test_image_copies_the_backend_into_srv_backend():
    assert _copies().get("backend") == "."  # WORKDIR /srv/backend, so the repo root is /srv as in development
