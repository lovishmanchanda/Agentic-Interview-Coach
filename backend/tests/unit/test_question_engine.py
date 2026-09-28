import random

import pytest

from app.core.interview.question_engine import rank_candidates, role_key, target_difficulty


@pytest.mark.parametrize("role, key", [
    ("Software Engineer", "software_engineer"),
    ("SDE 2", "software_engineer"),
    ("", "software_engineer"),
    ("Backend Developer", "backend"),
    ("Back-end engineer", "backend"),
    ("API Platform Engineer", "backend"),
    ("Full Stack Developer", "fullstack"),
    ("Frontend Engineer (React)", "frontend"),
    ("ML Engineer", "ml_engineer"),
    ("Machine Learning Engineer", "ml_engineer"),
    ("Data Scientist", "ml_engineer"),
    ("AI Engineer", "ml_engineer"),
    # Keys as stored by the profile form
    ("ml_engineer", "ml_engineer"),
    ("frontend", "frontend"),
    ("backend", "backend"),
    ("fullstack", "fullstack"),
    ("software_engineer", "software_engineer"),
    ("senior_ml_engineer", "ml_engineer"),
])
def test_role_key(role, key):
    assert role_key(role) == key


@pytest.mark.parametrize("preferred, level, expected", [
    ("hard", "fresher", "hard"),
    ("adaptive", "fresher", "easy"),
    ("adaptive", "1-2", "medium"),
    ("adaptive", "senior", "hard"),
    (None, None, "medium"),
])
def test_target_difficulty(preferred, level, expected):
    assert target_difficulty(preferred, level) == expected


def _q(qid, topic, difficulty="medium"):
    return {"question_id": qid, "topic": topic, "difficulty": difficulty}


def _best(candidates, **kwargs):
    defaults = {"topics_covered": [], "recently_seen": set(), "difficulty": "medium", "rng": random.Random(0)}
    return rank_candidates(candidates, **{**defaults, **kwargs})[0]["question_id"]


def test_prefers_a_topic_not_yet_covered():
    candidates = [_q("a", "dsa"), _q("b", "dbms")]
    assert _best(candidates, topics_covered=["dsa"]) == "b"


def test_prefers_questions_not_seen_recently():
    candidates = [_q("a", "dsa"), _q("b", "dbms")]
    assert _best(candidates, recently_seen={"a"}) == "b"


def test_prefers_the_target_difficulty():
    candidates = [_q("a", "dsa", "easy"), _q("b", "dbms", "hard"), _q("c", "os", "medium")]
    assert _best(candidates, difficulty="medium") == "c"
    assert _best(candidates, difficulty="hard") == "b"


def test_uncovered_topic_beats_difficulty_and_recency():
    candidates = [_q("a", "dsa", "medium"), _q("b", "dbms", "hard")]
    assert _best(candidates, topics_covered=["dsa"], recently_seen={"b"}) == "b"


def test_ties_are_broken_reproducibly():
    candidates = [_q(str(i), f"t{i}") for i in range(6)]
    first = [q["question_id"] for q in rank_candidates(candidates, topics_covered=[], recently_seen=set(),
                                                       difficulty="medium", rng=random.Random("s:0"))]
    again = [q["question_id"] for q in rank_candidates(candidates, topics_covered=[], recently_seen=set(),
                                                       difficulty="medium", rng=random.Random("s:0"))]
    assert first == again


def test_suggested_topic_outranks_coverage_recency_and_difficulty():
    candidates = [_q("a", "dbms", "medium"), _q("b", "dsa", "hard")]
    # dsa is covered, seen recently and the wrong difficulty, but the adaptation engine asked for it.
    assert _best(candidates, topics_covered=["dsa"], recently_seen={"b"}, preferred_topic="dsa") == "b"
    assert _best(candidates, topics_covered=["dsa"], recently_seen={"b"}) == "a"
