"""Standard API response envelope: { success, data, error, meta } (architecture.md §13)."""
from datetime import datetime, timezone
from typing import Any, Generic, TypeVar

from pydantic import BaseModel

from app.utils.logging import get_context

T = TypeVar("T")


class ErrorBody(BaseModel):
    code: str
    message: str
    details: Any | None = None


class Meta(BaseModel):
    request_id: str | None = None
    timestamp: str


class Envelope(BaseModel, Generic[T]):
    success: bool
    data: T | None = None
    error: ErrorBody | None = None
    meta: Meta


def _meta() -> Meta:
    return Meta(request_id=get_context().get("request_id"), timestamp=datetime.now(timezone.utc).isoformat())


def ok(data: Any = None) -> dict:
    return {"success": True, "data": data, "error": None, "meta": _meta().model_dump()}


def fail(code: str, message: str, details: Any | None = None) -> dict:
    return {
        "success": False,
        "data": None,
        "error": ErrorBody(code=code, message=message, details=details).model_dump(),
        "meta": _meta().model_dump(),
    }
