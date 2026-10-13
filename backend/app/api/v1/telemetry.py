"""Client telemetry: how fast the site really is for its visitors (Core Web Vitals) and the errors their browsers
hit, so problems show up in the admin dashboard instead of going unseen. Self-hosted: no third-party service.

Anonymous on purpose (errors on the landing page matter too), and an error is never stored as free text:
  - its message is kept only when it matches a known browser/library error template whose variable parts are
    code names (`Cannot read properties of undefined (reading 'map')`); any other message is stored as
    "Unrecognised error message #<hash>", a one-way hash that groups identical errors without keeping any text
  - its stack is reduced to code locations (function, file path without IDs, line:column)
  - its type is kept only if it's an identifier (TypeError, ChunkLoadError)
Vitals must name a known metric and carry a value. Page paths have IDs replaced by ":id" and no query string.
Events expire after 14 days (TTL index). Rate-limited per IP.
"""
import hashlib
import re
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.utils.rate_limit import enforce

router = APIRouter(prefix="/telemetry", tags=["telemetry"])

_ID_SEGMENT = re.compile(r"/(?:[0-9a-f]{12,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{3,})(?=/|$)", re.IGNORECASE)
VITALS = ("LCP", "INP", "CLS", "FCP", "TTFB")


def normalize_path(path: str) -> str:
    """'/interview/report/9f3c…?x=1' -> '/interview/report/:id': groups pages and keeps IDs out of storage."""
    path = path.split("?", 1)[0].split("#", 1)[0] or "/"
    return _ID_SEGMENT.sub("/:id", path)[:200]


# A code name: an identifier or property path ('map', "user.profile", 'aria-label'). Never someone's text.
_NAME = r"[A-Za-z_$][\w$.\-]{0,60}"
_ERROR_TYPE = re.compile(r"^[A-Za-z_$][\w$]{0,39}$")
# Known error messages (V8, SpiderMonkey, JavaScriptCore, React, Next.js, fetch, three.js), matched at the
# start of the message, with what's kept. Variable parts are only ever code names, numbers or fixed words.
_TEMPLATES = [(re.compile(pattern), keep) for pattern, keep in [
    (rf"Cannot read properties of (undefined|null) \(reading '({_NAME})'\)", r"Cannot read properties of \1 (reading '\2')"),
    (rf"Cannot set properties of (undefined|null) \(setting '({_NAME})'\)", r"Cannot set properties of \1 (setting '\2')"),
    (rf"Cannot read property '({_NAME})' of (undefined|null)", r"Cannot read property '\1' of \2"),
    (rf"(undefined|null) is not an object \(evaluating '({_NAME})'\)", r"\1 is not an object (evaluating '\2')"),
    (rf"({_NAME}) is not (a function|defined|iterable|a constructor)\b", r"\1 is not \2"),
    (rf"Cannot access '({_NAME})' before initialization", r"Cannot access '\1' before initialization"),
    (rf"can't access property \"({_NAME})\", ({_NAME}) is (undefined|null)", r'can\'t access property "\1", \2 is \3'),
    (r"Minified React error #(\d{1,4})", r"Minified React error #\1"),
    (r"(Hydration failed|There was an error while hydrating|Text content does not match server-rendered HTML)",
     r"\1"),
    (r"(Maximum update depth exceeded|Maximum call stack size exceeded|too much recursion)", r"\1"),
    (r"(Failed to fetch|NetworkError when attempting to fetch resource|Load failed|Network request failed)", r"\1"),
    (r"Can't reach the server", "Can't reach the server"),  # this app's own network-error message
    (r"Loading (CSS )?chunk [\w-]+ failed", r"Loading \1chunk failed"),
    (r"(ResizeObserver loop (?:limit exceeded|completed with undelivered notifications))", r"\1"),
    (r"(The user aborted a request|The operation was aborted|signal is aborted without reason)", r"\1"),
    (r"(?:Unexpected token|Unexpected end of JSON input|JSON\.parse)", "JSON parse error"),
    (r"Script error", "Script error"),
    (r"(?:THREE\.WebGLRenderer: )?(Error creating WebGL context|Context Lost|WebGL context lost)", r"\1"),
]]


def fingerprint(message: str | None) -> str | None:
    """A known error's message (template with code names only), or a one-way hash of an unknown one, so
    identical errors still group but none of their text is kept."""
    if not message:
        return None
    text = " ".join(message.split())
    for pattern, keep in _TEMPLATES:
        match = pattern.match(text)
        if match:
            return match.expand(keep)
    digest = hashlib.sha256(re.sub(r"\d+", "N", text).encode()).hexdigest()[:12]
    return f"Unrecognised error message #{digest}"


# A stack frame: Chrome "at fn (https://host/path/file.js?v=1:12:34)" / "at https://…", Firefox/Safari "fn@https://…"
_FRAME = re.compile(r"(?:at\s+(?:(?P<fn>[\w$.<>\[\] ]{1,80}?)\s+\()?|(?P<fn2>[\w$.<>]{1,80})?@)"
                    r"(?P<url>[a-z-]+://[^\s()?#]+|/[^\s()?#]+)(?:[?#][^\s():]*)?:(?P<line>\d+):(?P<col>\d+)")


def error_type(name: str) -> str:
    """'TypeError', 'ChunkLoadError'; anything that isn't an identifier becomes 'Error'."""
    return name if _ERROR_TYPE.match(name) else "Error"


def code_frames(stack: str | None, limit: int = 8) -> str | None:
    """A stack reduced to where in the code it happened: 'fn (/_next/static/chunks/x.js:12:34)' per frame. Lines
    that aren't frames (the message again, anything else) are dropped."""
    if not stack:
        return None
    frames = []
    for match in _FRAME.finditer(stack):
        path = normalize_path(re.sub(r"^[a-z-]+://[^/]+", "", match["url"]))  # the file's path: no host, no IDs
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

    @model_validator(mode="after")
    def _vital_is_measurable(self):
        if self.kind == "vital" and (self.name not in VITALS or self.value is None):
            raise ValueError(f"a vital must be one of {', '.join(VITALS)} and carry a value")
        return self


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
        "kind": e.kind, "name": e.name if e.kind == "vital" else error_type(e.name), "value": e.value,
        "rating": e.rating, "path": e.path,
        "message": fingerprint(e.message), "stack": code_frames(e.stack), "at": now,
    } for e in body.events]
    await request.app.state.db["client_events"].insert_many(docs)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
