"""InterviewStateMachine as a pure class (implementation_plan.md 1.3): no database, no AI."""
import itertools

import pytest

from app.core.interview.state_machine import (
    ACTION_TO_STATE,
    DRIVEN,
    SETTLED,
    TRANSITIONS,
    WORKING,
    InvalidTransitionError,
    State,
    allowed_next,
    can_transition,
    next_state_for_action,
)

S = State
HAPPY_PATH = [S.SETUP, S.INTRODUCTION, S.QUESTION, S.WAITING_FOR_RESPONSE, S.EVALUATING, S.FOLLOW_UP_DECISION,
              S.NEXT_TOPIC, S.QUESTION, S.WAITING_FOR_RESPONSE, S.EVALUATING, S.FOLLOW_UP_DECISION,
              S.INTERVIEW_COMPLETE, S.GENERATING_REPORT, S.REPORT_READY]
ALLOWED = {(a, b) for a, targets in TRANSITIONS.items() for b in targets}


def test_every_state_has_an_entry():
    assert set(TRANSITIONS) == set(State)


def test_the_documented_table_plus_two_failure_paths():
    assert ALLOWED == {
        (S.SETUP, S.INTRODUCTION), (S.INTRODUCTION, S.QUESTION), (S.QUESTION, S.WAITING_FOR_RESPONSE),
        (S.WAITING_FOR_RESPONSE, S.EVALUATING), (S.EVALUATING, S.FOLLOW_UP_DECISION),
        (S.FOLLOW_UP_DECISION, S.QUESTION), (S.FOLLOW_UP_DECISION, S.NEXT_TOPIC),
        (S.FOLLOW_UP_DECISION, S.INTERVIEW_COMPLETE), (S.NEXT_TOPIC, S.QUESTION),
        (S.INTERVIEW_COMPLETE, S.GENERATING_REPORT), (S.GENERATING_REPORT, S.REPORT_READY),
        # additions: failed evaluation -> resubmit; no next question -> finish early
        (S.EVALUATING, S.WAITING_FOR_RESPONSE), (S.NEXT_TOPIC, S.INTERVIEW_COMPLETE),
    }


def test_happy_path_is_valid():
    for current, new in itertools.pairwise(HAPPY_PATH):
        assert can_transition(current, new), f"{current} -> {new}"


@pytest.mark.parametrize("current, new", [
    pair for pair in itertools.product(State, State) if pair not in ALLOWED
])
def test_everything_else_is_rejected(current, new):
    assert not can_transition(current, new)


def test_no_self_loops_and_report_ready_is_terminal():
    assert all(not can_transition(s, s) for s in State)
    assert allowed_next(S.REPORT_READY) == []


def test_every_state_can_reach_report_ready():
    def reachable(start):
        seen, stack = set(), [start]
        while stack:
            for nxt in TRANSITIONS[stack.pop()]:
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)
        return seen
    assert all(S.REPORT_READY in reachable(s) for s in State if s != S.REPORT_READY)


def test_unknown_states_are_rejected_not_crashing():
    assert not can_transition("DANCING", S.SETUP)
    assert not can_transition(S.SETUP, "DANCING")


def test_states_are_partitioned_for_reconnects():
    assert SETTLED | WORKING | DRIVEN == set(State)
    assert not (SETTLED & WORKING) and not (SETTLED & DRIVEN) and not (WORKING & DRIVEN)
    assert SETTLED == {S.WAITING_FOR_RESPONSE, S.REPORT_READY}
    assert WORKING == {S.EVALUATING, S.GENERATING_REPORT}


# ── the agent proposes, the engine decides ──

@pytest.mark.parametrize("action, target", [
    ("deliver_question", S.NEXT_TOPIC),
    ("deliver_follow_up", S.QUESTION),
    ("request_coding_challenge", S.NEXT_TOPIC),
    ("wrap_up", S.INTERVIEW_COMPLETE),
])
def test_actions_from_follow_up_decision(action, target):
    assert next_state_for_action(S.FOLLOW_UP_DECISION, action) == target


@pytest.mark.parametrize("action", sorted(ACTION_TO_STATE))
def test_wrap_up_override_wins_over_any_move(action):
    if ACTION_TO_STATE[action] is None:
        return  # in-turn actions happen while answering, where wrapping up isn't a move
    assert next_state_for_action(S.FOLLOW_UP_DECISION, action, force_wrap_up=True) == S.INTERVIEW_COMPLETE


@pytest.mark.parametrize("action", ["deliver_hint", "deliver_feedback"])
def test_in_turn_actions_change_nothing_while_answering(action):
    assert next_state_for_action(S.WAITING_FOR_RESPONSE, action) is None
    with pytest.raises(InvalidTransitionError):
        next_state_for_action(S.FOLLOW_UP_DECISION, action)


@pytest.mark.parametrize("current, action", [
    (S.WAITING_FOR_RESPONSE, "deliver_question"),   # can't skip the evaluation
    (S.EVALUATING, "wrap_up"),                      # the engine decides only after evaluating
    (S.SETUP, "deliver_follow_up"),
    (S.REPORT_READY, "deliver_question"),
])
def test_proposals_that_skip_steps_are_rejected(current, action):
    with pytest.raises(InvalidTransitionError):
        next_state_for_action(current, action)


def test_unknown_action_is_rejected():
    with pytest.raises(InvalidTransitionError):
        next_state_for_action(S.FOLLOW_UP_DECISION, "set_state_to_REPORT_READY")
