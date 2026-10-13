"""Client telemetry: how fast the site really is for its visitors (Core Web Vitals) and the errors their browsers
hit, so problems show up in the admin dashboard instead of going unseen. Self-hosted: no third-party service.

Anonymous on purpose (errors on the landing page matter too), and an error is stored as a fingerprint, never as
free text: its type, its message with quoted text and long numbers replaced (only short code names such as
'map' are kept), and its stack reduced to code locations (function, file path, line). The page's path has IDs
replaced by ":id" and no query string. Events expire after 14 days (TTL index). Rate-limited per IP.
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


_QUOTED = re.compile(r"""(['"`])(.{0,200}?)\1""")
_CODE_NAME = re.compile(r"^[A-Za-z_$][\w$.\-]{0,40}$")  # 'map', "user.profile", 'aria-label': code, not content
_LONG_NUMBER = re.compile(r"\d{3,}")
# A stack frame: Chrome "at fn (https://host/path/file.js?v=1:12:34)" / "at https://…", Firefox/Safari "fn@https://…"
_FRAME = re.compile(r"(?:at\s+(?:(?P<fn>[\w$.<>\[\] ]{1,80}?)\s+\()?|(?P<fn2>[\w$.<>]{1,80})?@)"
                    r"(?P<url>[a-z-]+://[^\s()?#]+|/[^\s()?#]+)(?:[?#][^\s():]*)?:(?P<line>\d+):(?P<col>\d+)")


def fingerprint(message: str | None) -> str | None:
    """An error message with anything that could be someone's text taken out: quoted strings (unless they're a
    short code name), long numbers, emails, tokens and query strings."""
    if not message:
        return None
    text = _TOKEN.sub("[token]", _EMAIL.sub("[email]", _URL_QUERY.sub(r"\1", message)))
    text = _QUOTED.sub(lambda m: m.group(0) if _CODE_NAME.match(m.group(2)) else f"{m.group(1)}…{m.group(1)}", text)
    return " ".join(_LONG_NUMBER.sub("N", text).split())[:300] or None


def code_frames(stack: str | None, limit: int = 8) -> str | None:
    """A stack reduced to where in the code it happened: 'fn (/_next/static/chunks/x.js:12:34)' per frame. Lines
    that aren't frames (the message again, anything else) are dropped."""
    if not stack:
        return None
    frames = []
    for match in _FRAME.finditer(stack):
        path = re.sub(r"^[a-z-]+://[^/]+", "", match["url"])  # the file's path, not the host
        fn = (match["fn"] or match["fn2"] or "").strip()
        frames.append(f"{fn} ({path}:{match['line']}:{match['col']})" if fn else f"{path}:{match['line']}:{match['col']}")
        if len(frames) == limit:
            break
    return "\n".join(frames) or None


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
        "message": fingerprint(e.message), "stack": code_frames(e.stack), "at": now,
    } for e in body.events]
    await request.app.state.db["client_events"].insert_many(docs)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
