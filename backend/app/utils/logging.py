"""Structured JSON logging with request/user/session context.

Every log line carries `request_id`, `user_id` and `session_id` when they are bound, so an
interview can be traced end to end. Bind a value with `bind_context(session_id=...)`.
"""
import json
import logging
import sys
from contextvars import ContextVar
from datetime import datetime, timezone

_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)
_user_id: ContextVar[str | None] = ContextVar("user_id", default=None)
_session_id: ContextVar[str | None] = ContextVar("session_id", default=None)

_CONTEXT_VARS = {"request_id": _request_id, "user_id": _user_id, "session_id": _session_id}


def bind_context(**values: str | None) -> None:
    for key, value in values.items():
        _CONTEXT_VARS[key].set(value)


def get_context() -> dict[str, str]:
    return {key: var.get() for key, var in _CONTEXT_VARS.items() if var.get() is not None}


def clear_context() -> None:
    for var in _CONTEXT_VARS.values():
        var.set(None)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "ts": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            **get_context(),
        }
        extra = getattr(record, "fields", None)
        if extra:
            entry.update(extra)
        if record.exc_info:
            entry["exc"] = self.formatException(record.exc_info)
        return json.dumps(entry, default=str)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)


def log_event(logger: logging.Logger, msg: str, level: int = logging.INFO, **fields) -> None:
    """Log with structured fields: log_event(log, "tokens_used", tokens=120, call_type="eval")."""
    logger.log(level, msg, extra={"fields": fields})
