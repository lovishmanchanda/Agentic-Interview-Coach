"""Interview state machine (implementation_plan.md 1.3, architecture.md §8.2).

The backend owns every state change, never the LLM. The interviewer agent (1.6) will only propose an
*action*; `next_state_for_action()` maps it through ACTION_TO_STATE and checks it against TRANSITIONS,
and the engine's wrap-up rule can overrule it.

    SETUP → INTRODUCTION → QUESTION → WAITING_FOR_RESPONSE → EVALUATING → FOLLOW_UP_DECISION
                               ↑                                              │
                               ├──────────── follow-up (same topic) ──────────┤
                               └──── NEXT_TOPIC ←──────── next topic ─────────┤
                                                                              ↓
                              REPORT_READY ← GENERATING_REPORT ← INTERVIEW_COMPLETE

Two failure paths are added to the architecture.md table:
  EVALUATING → WAITING_FOR_RESPONSE   the evaluation failed (or its worker died): the candidate resubmits
  NEXT_TOPIC → INTERVIEW_COMPLETE     no next question could be prepared: finish with the answers so far

Everything here is pure except `InterviewStateMachine.transition()`, which persists through the
repository's compare-and-set, so two connections can never both make the same move.
"""
import logging
from enum import StrEnum

from app.db.repositories.interview_repo import InterviewRepository
from app.utils.logging import log_event

log = logging.getLogger(__name__)


class State(StrEnum):
    SETUP = "SETUP"
    INTRODUCTION = "INTRODUCTION"
    QUESTION = "QUESTION"
    WAITING_FOR_RESPONSE = "WAITING_FOR_RESPONSE"
    EVALUATING = "EVALUATING"
    FOLLOW_UP_DECISION = "FOLLOW_UP_DECISION"
    NEXT_TOPIC = "NEXT_TOPIC"
    INTERVIEW_COMPLETE = "INTERVIEW_COMPLETE"
    GENERATING_REPORT = "GENERATING_REPORT"
    REPORT_READY = "REPORT_READY"


S = State
TRANSITIONS: dict[State, frozenset[State]] = {
    S.SETUP: frozenset({S.INTRODUCTION}),
    S.INTRODUCTION: frozenset({S.QUESTION}),
    S.QUESTION: frozenset({S.WAITING_FOR_RESPONSE}),
    S.WAITING_FOR_RESPONSE: frozenset({S.EVALUATING}),
    S.EVALUATING: frozenset({S.FOLLOW_UP_DECISION, S.WAITING_FOR_RESPONSE}),
    S.FOLLOW_UP_DECISION: frozenset({S.QUESTION, S.NEXT_TOPIC, S.INTERVIEW_COMPLETE}),
    S.NEXT_TOPIC: frozenset({S.QUESTION, S.INTERVIEW_COMPLETE}),
    S.INTERVIEW_COMPLETE: frozenset({S.GENERATING_REPORT}),
    S.GENERATING_REPORT: frozenset({S.REPORT_READY}),
    S.REPORT_READY: frozenset(),
}

# How the engine treats each state when a client (re)connects:
# SETTLED - nothing to do; the snapshot already tells the client everything.
SETTLED = frozenset({S.WAITING_FOR_RESPONSE, S.REPORT_READY})
# WORKING - slow work with side effects (LLM calls, writes) that a live worker may still be doing.
#           Another connection waits for it, and takes over only once the session has gone stale.
WORKING = frozenset({S.EVALUATING, S.GENERATING_REPORT})
# Everything else is DRIVEN: short steps the engine can safely (re)do itself, because each one ends in a
# compare-and-set and a second connection doing the same step simply loses the race.
DRIVEN = frozenset(State) - SETTLED - WORKING

# The agent's proposal -> the state it leads to. None = said within the current turn, no state change.
ACTION_TO_STATE: dict[str, State | None] = {
    "deliver_question": S.NEXT_TOPIC,             # move on to a new topic
    "deliver_follow_up": S.QUESTION,              # probe deeper on the same topic
    "request_coding_challenge": S.NEXT_TOPIC,     # a coding problem is the next question (Phase 4)
    "wrap_up": S.INTERVIEW_COMPLETE,
    "deliver_hint": None,                         # practice mode, while the candidate is answering
    "deliver_feedback": None,
}
IN_TURN_STATES = frozenset({S.WAITING_FOR_RESPONSE})


class InvalidTransitionError(Exception):
    """A move the state machine doesn't allow. From the engine this is a bug; from the agent (1.6) it
    means the proposal is rejected and re-prompted."""


def can_transition(current: str, new: str) -> bool:
    try:
        return State(new) in TRANSITIONS[State(current)]
    except ValueError:  # not a state at all
        return False


def allowed_next(current: str) -> list[str]:
    return sorted(TRANSITIONS.get(State(current), frozenset()))


def next_state_for_action(current: str, action: str, *, force_wrap_up: bool = False) -> State | None:
    """Where a proposed action leads from `current`. None means "no state change" (a hint or feedback
    within the turn). `force_wrap_up` is the engine's override (question count, token budget, time):
    whatever was proposed, the interview ends."""
    if action not in ACTION_TO_STATE:
        raise InvalidTransitionError(f"unknown action {action!r}")
    target = S.INTERVIEW_COMPLETE if force_wrap_up else ACTION_TO_STATE[action]
    if target is None:
        if State(current) not in IN_TURN_STATES:
            raise InvalidTransitionError(f"{action!r} is only possible while the candidate is answering, not in {current}")
        return None
    if not can_transition(current, target):
        raise InvalidTransitionError(f"{action!r} leads to {target}, which isn't reachable from {current}")
    return target


class InterviewStateMachine:
    """Validates a move, then persists it with compare-and-set. Returns the updated session, or None if
    the session wasn't in `from_state` any more (another connection moved it first)."""

    def __init__(self, repo: InterviewRepository):
        self.repo = repo

    async def transition(self, session_id: str, from_state: str | list[str], to_state: str, *,
                         extra: dict | None = None) -> dict | None:
        from_states = [from_state] if isinstance(from_state, str) else list(from_state)
        for current in from_states:
            if not can_transition(current, to_state):
                raise InvalidTransitionError(f"{current} → {to_state} is not allowed")
        session = await self.repo.transition(session_id, from_states=from_states, to_state=to_state, extra=extra)
        if session is not None:
            log_event(log, "state_transition", session_id=session_id, to_state=to_state)
        return session
