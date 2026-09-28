"""Live interview WebSocket: /ws/interview/{session_id} (architecture.md §13).

Handshake: browsers can't set an Authorization header on a WebSocket and a token in the URL ends up
in logs, so the first client message must be {"type": "AUTH", "token": "<access token>"} within
AUTH_TIMEOUT_S. The server then sends SESSION_SNAPSHOT (on every connect, so reconnects resume),
moves the session forward if needed, and handles ANSWER / PING.

Close codes: 4400 bad handshake · 4401 unauthorized · 4404 session not found · 4408 auth timeout ·
4429 far too many messages. Messages are validated in ws_protocol.py (size, rate, schema) before the
engine sees them.
"""
import json
import logging
import uuid

import anyio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api.ws_protocol import (
    MAX_FRAME_CHARS,
    Answer,
    AnswerDraft,
    HintRequest,
    Ping,
    ProtocolError,
    RateLimiter,
    parse_inbound,
)
from app.core.interview.engine import event
from app.db.repositories.user_repo import UserRepository
from app.dependencies import build_engine
from app.utils.exceptions import AppError, AuthError, NotFoundError
from app.utils.logging import bind_context, clear_context, log_event
from app.utils.security import decode_token

log = logging.getLogger(__name__)
router = APIRouter()

AUTH_TIMEOUT_S = 10


async def _authenticate(websocket: WebSocket) -> dict | None:
    state = websocket.app.state
    try:
        with anyio.fail_after(AUTH_TIMEOUT_S):
            message = await websocket.receive_json()
    except TimeoutError:
        await websocket.close(code=4408, reason="auth timeout")
        return None
    except ValueError:
        await websocket.close(code=4400, reason="expected JSON")
        return None
    if not isinstance(message, dict) or message.get("type") != "AUTH":
        await websocket.close(code=4400, reason="first message must be AUTH")
        return None
    try:
        payload = decode_token(state.settings, str(message.get("token", "")), "access")
    except AuthError as exc:
        await websocket.close(code=4401, reason=exc.code)
        return None
    user = await UserRepository(state.db).get_by_id(payload["sub"])
    if user is None or not user.get("is_active", True):
        await websocket.close(code=4401, reason="invalid_token")
        return None
    return user


def best_effort_sender(websocket: WebSocket):
    """An `emit` that never raises. If the browser has gone, the engine must still finish its step (state
    is in the database and the next connect re-syncs from a snapshot), so a failed send only marks the
    socket closed and later sends are skipped."""
    closed = False

    async def emit(evt: dict) -> None:
        nonlocal closed
        if closed:
            return
        try:
            await websocket.send_text(json.dumps(evt, default=str))
        except (WebSocketDisconnect, RuntimeError, OSError):
            closed = True
            log_event(log, "ws_send_after_close", event_type=evt.get("type"))

    return emit


@router.websocket("/ws/interview/{session_id}")
async def interview_socket(websocket: WebSocket, session_id: str):
    clear_context()
    bind_context(request_id=uuid.uuid4().hex, session_id=session_id)
    await websocket.accept()

    emit = best_effort_sender(websocket)

    try:
        user = await _authenticate(websocket)
        if user is None:
            return
        bind_context(user_id=user["_id"])
        engine = build_engine(websocket.app.state)
        try:
            session = await engine.get_owned_session(session_id, user["_id"])
        except NotFoundError:
            await websocket.close(code=4404, reason="session_not_found")
            return

        await emit(event("SESSION_SNAPSHOT", session["state"], **await engine.snapshot(session)))
        await engine.start(session, emit)

        limiter = RateLimiter()
        while True:
            raw = await websocket.receive_text()
            verdict = limiter.hit()
            if verdict == "abusive":
                log_event(log, "ws_rate_abuse", level=logging.WARNING)
                await websocket.close(code=4429, reason="too_many_messages")
                return
            if verdict == "limited":
                await emit(event("ERROR", "", code="rate_limited", retryable=True,
                                 message="Too many messages. Slow down a little."))
                continue
            if len(raw) > MAX_FRAME_CHARS:
                await emit(event("ERROR", "", code="message_too_large", message="That message is too large."))
                continue
            try:
                message = parse_inbound(json.loads(raw))
            except ValueError:
                await emit(event("ERROR", "", code="bad_message", message="Messages must be JSON."))
                continue
            except ProtocolError as exc:
                await emit(event("ERROR", "", code=exc.code, message=exc.message))
                continue
            try:
                match message:
                    case Ping():
                        await emit({"type": "PONG", "state": "", "payload": {}})
                    case Answer():
                        await engine.handle_answer(session_id, user["_id"], message.answer_text, emit)
                    case AnswerDraft():
                        await engine.save_draft(session_id, user["_id"], message.answer_text)
                    case HintRequest():
                        await engine.handle_hint_request(session_id, user["_id"], message.draft_text, emit)
            except AppError as exc:
                await emit(event("ERROR", "", code=exc.code, message=exc.message))
            except WebSocketDisconnect:
                raise
            except Exception:  # noqa: BLE001 -- keep the socket alive; state is in the DB
                log.exception("ws_handler_error")
                await emit(event("ERROR", "", code="internal_error", message="Something went wrong. Please try again."))
    except WebSocketDisconnect:
        log.info("ws_disconnected")
    except RuntimeError:
        # Receiving after the client went away. Nothing to do: the session state is persisted.
        log.info("ws_closed")
    except Exception:  # noqa: BLE001 -- unexpected failure outside the message loop (e.g. snapshot)
        log.exception("ws_fatal_error")
        try:
            await websocket.close(code=1011, reason="internal_error")
        except RuntimeError:
            pass
