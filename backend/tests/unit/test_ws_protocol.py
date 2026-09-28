import pytest

from app.api.ws_protocol import (
    Answer,
    AnswerDraft,
    HintRequest,
    Ping,
    ProtocolError,
    RateLimiter,
    parse_inbound,
)
from app.core.interview.engine import fallback_hint


@pytest.mark.parametrize("data, kind", [
    ({"type": "PING"}, Ping),
    ({"type": "ANSWER", "answer_text": "hi"}, Answer),
    ({"type": "ANSWER", "answer_text": "hi", "answer_type": "text", "extra": 1}, Answer),  # unknown fields ignored
    ({"type": "ANSWER_DRAFT", "answer_text": "half an answer"}, AnswerDraft),
    ({"type": "HINT_REQUEST"}, HintRequest),
    ({"type": "HINT_REQUEST", "draft_text": "so far"}, HintRequest),
])
def test_valid_messages(data, kind):
    assert isinstance(parse_inbound(data), kind)


@pytest.mark.parametrize("data, code", [
    ({"type": "DANCE"}, "unknown_event"),
    ({"type": "AUTH", "token": "x"}, "unknown_event"),       # only valid as the first frame
    (["PING"], "unknown_event"),
    ("PING", "unknown_event"),
    ({"type": "CODE_SUBMIT", "code": "x"}, "event_unavailable"),
    ({"type": "AUDIO_CHUNK"}, "event_unavailable"),
    ({"type": "ANSWER", "answer_text": "x", "answer_type": "voice"}, "bad_message"),
    ({"type": "ANSWER", "answer_text": 5}, "bad_message"),
    ({"type": "ANSWER_DRAFT", "answer_text": "x" * 10_001}, "bad_message"),
])
def test_invalid_messages(data, code):
    with pytest.raises(ProtocolError) as exc:
        parse_inbound(data)
    assert exc.value.code == code


def test_bad_message_says_which_field():
    with pytest.raises(ProtocolError) as exc:
        parse_inbound({"type": "ANSWER", "answer_text": 5})
    assert "answer_text" in exc.value.message


def test_rate_limiter_limits_then_flags_abuse_and_slides():
    now = [0.0]
    limiter = RateLimiter(limit=3, abuse=5, window_s=10, clock=lambda: now[0])
    assert [limiter.hit() for _ in range(6)] == ["ok", "ok", "ok", "limited", "limited", "abusive"]
    now[0] = 11  # the window has moved on
    assert limiter.hit() == "ok"


def test_fallback_hint_points_at_what_the_draft_is_missing():
    question = {"expected_concepts": ["hash function", "load factor", "resizing / rehashing"]}
    assert fallback_hint(question, "") == "Think about hash function and how it applies here."
    assert "load factor" in fallback_hint(question, "The hash function maps a key to a bucket.")
    assert "resizing" in fallback_hint(question, "hash function… load factor above 0.75")
    assert "concrete example" in fallback_hint(question, "hash function, load factor, rehashing on resize")
    assert "concrete example" in fallback_hint({}, "")
