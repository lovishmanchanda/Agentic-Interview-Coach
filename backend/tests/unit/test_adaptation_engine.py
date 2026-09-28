"""AdaptationEngine rules (implementation_plan.md 1.8): pure, no database, no AI."""
import pytest

from app.core.interview.adaptation_engine import (
    AGENT_ACTION,
    decide_next_action,
    pick_follow_up,
    shift_difficulty,
    update_performance,
    weakest_focus_topic,
)
from app.core.interview.state_machine import State, next_state_for_action

QUESTION = {"question_id": "q1", "topic": "dsa", "is_follow_up": False,
            "follow_up_possibilities": ["What makes a good hash function?", "How does Python's dict differ?"]}


def _session(**overrides):
    base = {"target_difficulty": "medium", "config": {"difficulty": "adaptive", "question_count": 3},
            "questions_asked": 1, "asked_follow_ups": [], "topics_covered": ["dsa"], "focus_topics": [],
            "performance_vector": {}}
    return {**base, **overrides}


def _eval(score, tier):
    return {"overall_score": score, "performance_tier": tier}


def decide(evaluation, question=QUESTION, session=None, **kwargs):
    kwargs = {"budget_remaining": 50_000, "token_reserve": 4_000, **kwargs}
    return decide_next_action(evaluation, question, session or _session(), **kwargs)


@pytest.mark.parametrize("current, delta, expected", [
    ("easy", 1, "medium"), ("medium", 1, "hard"), ("hard", 1, "hard"),
    ("hard", -1, "medium"), ("easy", -1, "easy"), ("medium", 0, "medium"),
])
def test_shift_difficulty_is_bounded(current, delta, expected):
    assert shift_difficulty(current, delta) == expected


def test_performance_vector_is_a_running_mean():
    v = update_performance({}, "dsa", 4)
    v = update_performance(v, "dsa", 8)
    v = update_performance(v, "dbms", 6.5)
    assert v == {"dsa": {"mean": 6.0, "n": 2}, "dbms": {"mean": 6.5, "n": 1}}


def test_update_performance_does_not_mutate_its_input():
    original = {"dsa": {"mean": 5.0, "n": 1}}
    update_performance(original, "dsa", 9)
    assert original == {"dsa": {"mean": 5.0, "n": 1}}


def test_pick_follow_up_skips_ones_already_asked():
    assert pick_follow_up(QUESTION, []) == "What makes a good hash function?"
    assert pick_follow_up(QUESTION, ["What makes a good hash function?"]) == "How does Python's dict differ?"
    assert pick_follow_up(QUESTION, QUESTION["follow_up_possibilities"]) is None
    assert pick_follow_up({"follow_up_possibilities": ["  ", ""]}, []) is None


# ── difficulty ──

def test_strong_answer_raises_difficulty():
    d = decide(_eval(8.5, "strong"))
    assert (d.action, d.difficulty_delta, d.target_difficulty) == ("next_topic", 1, "hard")
    assert "harder" in d.reason


def test_weak_answer_lowers_difficulty():
    d = decide(_eval(3, "weak"))
    assert (d.action, d.difficulty_delta, d.target_difficulty) == ("next_topic", -1, "easy")


def test_difficulty_stops_at_the_ends():
    d = decide(_eval(9, "strong"), session=_session(target_difficulty="hard"))
    assert (d.difficulty_delta, d.target_difficulty) == (0, "hard")
    d = decide(_eval(1, "weak"), session=_session(target_difficulty="easy"))
    assert (d.difficulty_delta, d.target_difficulty) == (0, "easy")


def test_a_fixed_difficulty_never_moves():
    session = _session(config={"difficulty": "medium", "question_count": 3})
    for evaluation in (_eval(9, "strong"), _eval(2, "weak")):
        d = decide(evaluation, session=session)
        assert (d.difficulty_delta, d.target_difficulty) == (0, "medium")
        assert "fixed difficulty" in d.reason


# ── follow-ups ──

def test_partial_answer_gets_one_follow_up():
    d = decide(_eval(6.5, "adequate"))
    assert d.action == "follow_up" and d.follow_up_text == "What makes a good hash function?"
    assert (d.difficulty_delta, d.target_difficulty) == (0, "medium")  # a follow-up stays at the same level


def test_no_follow_up_on_a_follow_up():
    d = decide(_eval(6.5, "adequate"), question={**QUESTION, "is_follow_up": True})
    assert d.action == "next_topic"


@pytest.mark.parametrize("tier, score", [("strong", 8), ("weak", 3)])
def test_only_partial_answers_get_follow_ups(tier, score):
    assert decide(_eval(score, tier)).action == "next_topic"


def test_no_follow_up_when_none_left_or_disabled():
    assert decide(_eval(6, "adequate"), question={**QUESTION, "follow_up_possibilities": []}).action == "next_topic"
    assert decide(_eval(6, "adequate"), follow_ups_enabled=False).action == "next_topic"


def test_last_question_can_still_get_its_follow_up():
    session = _session(questions_asked=3)
    assert decide(_eval(6, "adequate"), session=session).action == "follow_up"
    assert decide(_eval(6, "adequate"), question={**QUESTION, "is_follow_up": True}, session=session).action == "complete"


# ── wrap-up ──

def test_question_count_completes():
    d = decide(_eval(8, "strong"), session=_session(questions_asked=3))
    assert d.action == "complete" and "all 3 questions" in d.reason


def test_token_budget_beats_everything_including_follow_ups():
    d = decide(_eval(6, "adequate"), budget_remaining=1_000)
    assert d.action == "complete" and "token budget" in d.reason


# ── drills ──

def test_drill_revisits_the_weakest_focus_topic_once_all_are_covered():
    session = _session(focus_topics=["dsa", "dbms", "os"], topics_covered=["dsa", "dbms", "os"],
                       performance_vector={"dsa": {"mean": 7.0, "n": 1}, "dbms": {"mean": 3.5, "n": 1},
                                           "os": {"mean": 6.0, "n": 1}})
    assert weakest_focus_topic(session) == "dbms"
    assert decide(_eval(8, "strong"), session=session).suggested_topic == "dbms"


def test_no_suggestion_until_every_focus_topic_is_covered_or_without_a_drill():
    assert weakest_focus_topic(_session(focus_topics=["dsa", "dbms"], topics_covered=["dsa"])) is None
    assert weakest_focus_topic(_session(focus_topics=[], topics_covered=["dsa", "dbms"])) is None
    assert weakest_focus_topic(_session(focus_topics=["dsa"], topics_covered=["dsa"])) is None  # one topic: nothing to pick


# ── the decision is always a legal move ──

@pytest.mark.parametrize("action", sorted(AGENT_ACTION))
def test_every_decision_maps_to_a_legal_transition(action):
    target = next_state_for_action(State.FOLLOW_UP_DECISION, AGENT_ACTION[action])
    assert target == {"follow_up": State.QUESTION, "next_topic": State.NEXT_TOPIC,
                      "complete": State.INTERVIEW_COMPLETE}[action]
