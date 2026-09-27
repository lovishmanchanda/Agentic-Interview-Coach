from app.core.mentor.rag_tool.schemas import InterviewReport, QuestionFeedback
from app.core.mentor.rag_tool.service import chunks_for_report


def test_report_creates_expected_semantic_chunks():
    report = InterviewReport(session_id="session-1", user_id="user-a", interview_type="technical", topic="python",
        overall_score=6, summary="Good foundations.", strengths=["syntax"], weaknesses=["tradeoffs"],
        question_feedback=[QuestionFeedback(question_id="q1", question="What is a generator?", topic="python", score=5, suggestion="Discuss lazy evaluation.")],
        recommended_study_areas=["Practise explaining tradeoffs."])
    chunks = chunks_for_report(report)
    assert [chunk.id for chunk in chunks] == ["session-1:summary", "session-1:question:q1", "session-1:recommendations"]
    assert all(chunk.metadata["user_id"] == "user-a" for chunk in chunks)
    assert chunks[1].metadata["chunk_type"] == "question_feedback"
