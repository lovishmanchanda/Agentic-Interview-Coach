"""The live-interview WebSocket protocol (architecture.md §13), as types.

Inbound messages are validated here before the engine sees them. Outbound payloads are described by
models too; the contract test replays a whole interview and checks every event the server sends
against them, so the docs, the server and the frontend can't drift apart silently.
"""
import time
from collections import deque
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError

MAX_FRAME_CHARS = 64_000          # an answer is ≤ 5,000 characters; JSON escaping can multiply that
MAX_DRAFT_CHARS = 10_000


# ── client → server ──────────────────────────────────────────────────────────
class _Inbound(BaseModel):
    model_config = ConfigDict(extra="ignore")


class Ping(_Inbound):
    type: Literal["PING"]


class Answer(_Inbound):
    type: Literal["ANSWER"]
    answer_text: str = ""       # length is checked by the engine, which answers with a friendly ERROR
    answer_type: Literal["text"] = "text"


class AnswerDraft(_Inbound):
    type: Literal["ANSWER_DRAFT"]
    answer_text: str = Field(default="", max_length=MAX_DRAFT_CHARS)


class HintRequest(_Inbound):
    type: Literal["HINT_REQUEST"]
    draft_text: str = Field(default="", max_length=MAX_DRAFT_CHARS)  # lets the hint build on what's written


Inbound = Annotated[Ping | Answer | AnswerDraft | HintRequest, Field(discriminator="type")]
_INBOUND = TypeAdapter(Inbound)

# Part of the contract, arriving in later phases (coding: Phase 4, voice: Phase 5).
NOT_YET_AVAILABLE = {"CODE_SUBMIT", "CODE_DRAFT", "AUDIO_CHUNK", "AUDIO_END"}
KNOWN = {"PING", "ANSWER", "ANSWER_DRAFT", "HINT_REQUEST", "AUTH"} | NOT_YET_AVAILABLE


class ProtocolError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def parse_inbound(data: Any) -> Ping | Answer | AnswerDraft | HintRequest:
    kind = data.get("type") if isinstance(data, dict) else None
    if kind not in KNOWN or kind == "AUTH":
        raise ProtocolError("unknown_event", f"Unsupported event: {kind!r}")
    if kind in NOT_YET_AVAILABLE:
        raise ProtocolError("event_unavailable", f"{kind} isn't available yet.")
    try:
        return _INBOUND.validate_python(data)
    except ValidationError as exc:
        first = exc.errors()[0]
        field = ".".join(str(p) for p in first["loc"][1:]) or "message"
        raise ProtocolError("bad_message", f"Invalid {kind}: {field}: {first['msg']}") from exc


class RateLimiter:
    """Per connection, sliding window. Past `limit` messages are refused with an ERROR; past `abuse` the
    connection is closed. Normal use (drafts every few seconds, a heartbeat, answers) stays far below."""

    def __init__(self, limit: int = 30, abuse: int = 90, window_s: float = 10.0, clock=time.monotonic):
        self.limit, self.abuse, self.window_s, self.clock = limit, abuse, window_s, clock
        self.hits: deque[float] = deque()

    def hit(self) -> Literal["ok", "limited", "abusive"]:
        now = self.clock()
        self.hits.append(now)
        while self.hits and now - self.hits[0] > self.window_s:
            self.hits.popleft()
        if len(self.hits) > self.abuse:
            return "abusive"
        return "limited" if len(self.hits) > self.limit else "ok"


# ── server → client payloads (for the contract test and as documentation) ────
class _Out(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TranscriptEntry(BaseModel):
    role: Literal["interviewer", "candidate", "evaluation", "hint"]
    question_id: str | None
    content: str | None = None
    evaluation: dict | None = None
    is_follow_up: bool | None = None
    is_closing: bool | None = None


class QuestionView(_Out):
    question_id: str
    text: str
    topic: str
    difficulty: str
    is_follow_up: bool
    hints_left: int
    asked_at: str | None
    suggested_seconds: int


class SessionSnapshotPayload(_Out):
    session_id: str
    state: str
    config: dict
    focus_topics: list[str]
    current_question: QuestionView | None
    draft_answer: str | None
    transcript: list[TranscriptEntry]
    report_id: str | None
    questions_asked: int
    total_questions: int
    started_at: str
    server_time: str


class QuestionPayload(QuestionView):
    question_number: int
    total_questions: int
    server_time: str


class ProcessingPayload(_Out):
    message: str


class EvaluationPayload(_Out):
    question_id: str
    overall_score: float
    dimensions: dict[str, float]
    performance_tier: Literal["strong", "adequate", "weak"]
    strengths: list[str]
    weaknesses: list[str]
    feedback: str
    suggestion: str
    model_answer_outline: list[str]


class HintPayload(_Out):
    question_id: str
    text: str
    hints_left: int


class InterviewCompletePayload(_Out):
    report_id: str
    closing_message: str | None


class ErrorPayload(_Out):
    code: str
    message: str
    retryable: bool | None = None


OUTBOUND: dict[str, type[BaseModel] | None] = {
    "SESSION_SNAPSHOT": SessionSnapshotPayload,
    "QUESTION": QuestionPayload,
    "PROCESSING": ProcessingPayload,
    "EVALUATION": EvaluationPayload,
    "HINT": HintPayload,
    "INTERVIEW_COMPLETE": InterviewCompletePayload,
    "ERROR": ErrorPayload,
    "PONG": None,
}
