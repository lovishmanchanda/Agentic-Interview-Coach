import tempfile
from datetime import datetime, timedelta, timezone

import pytest
from langchain_core.embeddings import Embeddings

from app.core.mentor.rag_tool.schemas import InterviewReport, MentorChatRequest, QuestionFeedback
from app.core.mentor.rag_tool.service import (
    RagService,
    classify_intent,
    is_generic_self_assessment,
    dedupe_by_session,
    normalize_citations,
)


class FakeEmbeddings(Embeddings):
    """Deterministic bag-of-words style vector so similarity search behaves predictably
    without any network call. Two texts sharing more words score closer together."""

    _VOCAB = [
        "sql", "joins", "python", "generator", "recursion", "system", "design",
        "database", "index", "cache", "network", "latency", "cooking", "recipe",
    ]

    def _vector(self, text: str) -> list[float]:
        lowered = text.lower()
        return [float(lowered.count(word)) for word in self._VOCAB]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._vector(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._vector(text)


def _report(session_id: str, user_id: str, days_ago: int, topic: str, summary: str, feedback: str = "") -> InterviewReport:
    created = (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()
    return InterviewReport(
        session_id=session_id, user_id=user_id, created_at=created,
        interview_type="technical", topic=topic, overall_score=6,
        summary=summary, strengths=["clarity"], weaknesses=["depth"],
        question_feedback=[QuestionFeedback(question_id="q1", question=f"Explain {topic}", topic=topic,
                                             score=6, answer_summary=summary, feedback=feedback)],
        recommended_study_areas=[f"Practice more {topic}"],
    )


@pytest.fixture
def service():
    with tempfile.TemporaryDirectory() as tmp:
        yield RagService(FakeEmbeddings(), tmp, "test_collection")


def test_classify_intent_comparison():
    assert classify_intent("Compare my last two interviews", has_history=False) == "comparison"
    assert classify_intent("How have I been improving?", has_history=False) == "comparison"


def test_classify_intent_vague_only_without_history():
    assert classify_intent("How am I doing?", has_history=False) == "vague"
    assert classify_intent("How am I doing?", has_history=True) == "specific"


def test_classify_intent_specific():
    assert classify_intent("How did I do on SQL joins?", has_history=False) == "specific"


@pytest.mark.parametrize("message", [
    "Where am I weakest?", "What should I practise next?", "What should I practice next?",
    "What are my weak areas", "What are my biggest weaknesses?", "What should I focus on first?",
    "So where do I need to improve?", "What are my strengths?",
    "Drill me on my weak spots", "Quiz me", "Test me on my weaknesses", "drill me on my weakest topics",
])
def test_generic_self_assessment_is_vague_without_history(message):
    assert is_generic_self_assessment(message)
    assert classify_intent(message, has_history=False) == "vague"


@pytest.mark.parametrize("message", [
    "What are my weaknesses in SQL?", "What should I practise for system design?",
    "How's my cooking skill?", "Where am I weakest in recursion?", "Drill me on SQL joins",
])
def test_topic_scoped_questions_stay_specific(message):
    assert not is_generic_self_assessment(message)
    assert classify_intent(message, has_history=False) == "specific"


def test_generic_question_mid_conversation_falls_back_to_recency(service):
    service.index_report(_report("s1", "alice", days_ago=1, topic="python", summary="Generators and recursion in python."))
    request = MentorChatRequest(user_id="alice", message="Where am I weakest?",
                                history=[{"role": "user", "content": "tell me about cooking"}])
    response = service.answer(request, invoke_llm=lambda prompt: "Depth on recursion [1].")
    assert {s["session_id"] for s in response.sources} == {"s1"}


def test_off_topic_question_mid_conversation_still_gets_no_data(service):
    service.index_report(_report("s1", "alice", days_ago=1, topic="python", summary="Generators and recursion in python."))
    request = MentorChatRequest(user_id="alice", message="Any good cooking recipe?",
                                history=[{"role": "user", "content": "How am I doing?"}])
    response = service.answer(request, invoke_llm=lambda prompt: "should not be called")
    assert response.sources == []


def test_retrieve_by_recency_sorts_newest_first(service):
    service.index_report(_report("s-old", "alice", days_ago=10, topic="python", summary="Old session."))
    service.index_report(_report("s-new", "alice", days_ago=1, topic="sql", summary="New session."))

    hits = service.retrieve_by_recency("alice", n_sessions=2)
    session_order = list(dict.fromkeys(h["metadata"]["session_id"] for h in hits))
    assert session_order == ["s-new", "s-old"]


def test_retrieve_by_recency_limits_to_n_sessions(service):
    for i in range(4):
        service.index_report(_report(f"s-{i}", "alice", days_ago=i, topic="python", summary=f"Session {i}"))

    hits = service.retrieve_by_recency("alice", n_sessions=2)
    session_ids = {h["metadata"]["session_id"] for h in hits}
    assert session_ids == {"s-0", "s-1"}


def test_dedupe_by_session_caps_per_session():
    hits = [{"metadata": {"session_id": "s1"}} for _ in range(5)] + [{"metadata": {"session_id": "s2"}}]
    kept = dedupe_by_session(hits, max_per_session=2)
    assert sum(1 for h in kept if h["metadata"]["session_id"] == "s1") == 2
    assert sum(1 for h in kept if h["metadata"]["session_id"] == "s2") == 1


def test_retrieve_by_similarity_drops_hits_above_threshold(service):
    service.index_report(_report("s1", "alice", days_ago=1, topic="python", summary="Generators and recursion in python."))

    hits = service.retrieve_by_similarity("alice", "Tell me about my cooking recipe", limit=5, score_threshold=0.35)
    assert hits == []


def test_answer_returns_no_data_message_for_empty_result(service):
    request = MentorChatRequest(user_id="bob", message="How am I doing?")
    response = service.answer(request, invoke_llm=lambda prompt: "should not be called")
    assert response.sources == []
    assert "don't have interview feedback" in response.answer


def test_cross_user_isolation(service):
    service.index_report(_report("s-alice", "alice", days_ago=1, topic="sql", summary="Alice's SQL session."))
    service.index_report(_report("s-bob", "bob", days_ago=1, topic="sql", summary="Bob's SQL session."))

    hits = service.retrieve_by_similarity("alice", "How did I do on SQL joins?", limit=5, score_threshold=1.0)
    assert all(h["metadata"]["user_id"] == "alice" for h in hits)
    assert all(h["metadata"]["session_id"] != "s-bob" for h in hits)


def test_normalize_citations_converts_fullwidth_brackets():
    assert normalize_citations("You did well 【1】 but missed 【3】.") == "You did well [1] but missed [3]."
    assert normalize_citations("Already fine [1].") == "Already fine [1]."
    assert normalize_citations("No citations here.") == "No citations here."


def test_answer_specific_query_invokes_llm_with_citations(service):
    service.index_report(_report("s1", "alice", days_ago=1, topic="sql", summary="Solid understanding of SQL joins."))

    captured_prompt = {}

    def fake_llm(prompt: str) -> str:
        captured_prompt["prompt"] = prompt
        return "You did well on joins [1]."

    request = MentorChatRequest(user_id="alice", message="How did I do on SQL joins?")
    response = service.answer(request, invoke_llm=fake_llm)

    assert response.sources
    assert response.sources[0]["citation"] == 1
    assert "[1]" in captured_prompt["prompt"]
    assert response.answer == "You did well on joins [1]."
