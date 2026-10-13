"""Client telemetry: how fast the site really is for its visitors (Core Web Vitals) and the errors their browsers
hit, so problems show up in the admin dashboard instead of going unseen. Self-hosted: no third-party service.

Anonymous on purpose (errors on the landing page matter too), so it stores nothing personal: the page's path
with any IDs replaced by ":id" and no query string, the metric or error, and a trimmed message and stack.
Events expire after 14 days (TTL index). Rate-limited per IP.
"""
import re
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.utils.rate_limit import enforce

router = APIRouter(prefix="/telemetry", tags=["telemetry"])

_ID_SEGMENT = re.compile(r"/(?:[0-9a-f]{12,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{3,})(?=/|$)", re.I)
_URL_QUERY = re.compile(r"(https?://[^\s?#)]+)[?#][^\s)]*")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_TOKEN = re.compile(r"\beyJ[\w-]+\.[\w-]+\.[\w-]+")  # a JWT that slipped into an error message


def normalize_path(path: str) -> str:
    """'/interview/report/9f3c…?x=1' -> '/interview/report/:id': groups pages and keeps IDs out of storage."""
    path = path.split("?", 1)[0].split("#", 1)[0] or "/"
    return _ID_SEGMENT.sub("/:id", path)[:200]


def scrub(text: str | None, limit: int) -> str | None:
    """No query strings, emails or tokens in what's stored, and a bounded length."""
    if not text:
        return None
    text = _TOKEN.sub("[token]", _EMAIL.sub("[email]", _URL_QUERY.sub(r"\1", text)))
    return text[:limit]


class ClientEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["vital", "error"]
    name: str = Field(min_length=1, max_length=40)  # LCP, INP, CLS, FCP, TTFB; or the error's type
    value: float | None = Field(default=None, ge=0, le=600_000)  # ms (CLS: unitless)
    rating: Literal["good", "needs-improvement", "poor"] | None = None
    path: str = Field(min_length=1, max_length=2_000)
    message: str | None = Field(default=None, max_length=2_000)
    stack: str | None = Field(default=None, max_length=8_000)

    @field_validator("path")
    @classmethod
    def _path(cls, value: str) -> str:
        return normalize_path(value)


class TelemetryBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    events: list[ClientEvent] = Field(min_length=1, max_length=25)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("", status_code=status.HTTP_204_NO_CONTENT)
async def collect(body: TelemetryBatch, request: Request) -> Response:
    enforce(request.app.state.limiters["telemetry"], _client_ip(request), "Too many telemetry reports.")
    now = datetime.now(timezone.utc)
    docs = [{
        "kind": e.kind, "name": e.name, "value": e.value, "rating": e.rating, "path": e.path,
        "message": scrub(e.message, 500), "stack": scrub(e.stack, 2_000), "at": now,
    } for e in body.events]
    await request.app.state.db["client_events"].insert_many(docs)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
