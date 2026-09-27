from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.db.client import ping
from app.gateway import gateway_kind
from app.utils.responses import fail, ok

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(request: Request):
    """Liveness + dependency check. Returns 503 when the database is unreachable (App Service health probe)."""
    state = request.app.state
    db_ok = await ping(state.db)
    data = {
        "status": "ok" if db_ok else "degraded",
        "env": state.settings.app_env,
        "database": "up" if db_ok else "down",
        "gateway": gateway_kind(state.gateway),
        "mentor_rag": "ready" if state.rag is not None else "disabled",
    }
    if not db_ok:
        return JSONResponse({**fail("database_unavailable", "Database is unreachable"), "data": data}, status_code=503)
    return ok(data)
