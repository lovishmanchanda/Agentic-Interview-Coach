"""Report -> Mentor RAG index (implementation_plan.md 2.1; used thinly by the walking skeleton).

`to_rag_report` maps the Cosmos report + its evaluations/questions/answers onto rag_tool's
`InterviewReport` contract. `index_session_report` runs rag_tool's blocking Chroma/HF calls in a
worker thread. On failure the Cosmos report is kept and `rag_indexed` stays False, so indexing can be
retried later (the upsert is idempotent).
"""
import logging

import anyio

from app.core.mentor.rag_tool import InterviewReport, QuestionFeedback, chunks_for_report
from app.db.repositories.interview_repo import InterviewRepository

log = logging.getLogger(__name__)

ANSWER_SUMMARY_CHARS = 400


def to_rag_report(report: dict, questions: list[dict], answers: list[dict], evaluations: list[dict]) -> InterviewReport:
    by_question = {q["question_id"]: q for q in questions}
    latest_answer = {a["question_id"]: a for a in answers}  # later answers overwrite earlier retries
    feedback = []
    for e in evaluations:
        q = by_question.get(e["question_id"], {})
        answer_text = latest_answer.get(e["question_id"], {}).get("answer_text", "")
        feedback.append(QuestionFeedback(
            question_id=e["question_id"],
            question=q.get("question_text", ""),
            topic=q.get("topic", "general"),
            score=e["overall_score"],
            answer_summary=answer_text[:ANSWER_SUMMARY_CHARS],
            strengths=e.get("strengths", []),
            weaknesses=e.get("weaknesses", []),
            feedback=e.get("feedback", ""),
            suggestion=e.get("suggestion", ""),
        ))
    topics = list(dict.fromkeys(q.get("topic", "general") for q in questions))
    return InterviewReport(
        session_id=report["session_id"],
        user_id=report["candidate_id"],
        created_at=report["generated_at"].isoformat(),
        interview_type=report.get("interview_type", "technical"),
        topic=", ".join(topics) or "general",  # shown on Mentor citation chips, e.g. "dsa, oops, system_design"
        overall_score=report["scores"]["overall"],
        summary=report.get("summary", ""),
        strengths=report.get("strong_areas", []),
        weaknesses=[f"{w['topic']}: {w['reason']}" for w in report.get("weak_areas", [])],
        topics_covered=topics,
        question_feedback=feedback,
        recommended_study_areas=[r["action"] for r in report.get("recommendations", [])],
    )


async def index_session_report(rag, repo: InterviewRepository, report: dict) -> bool:
    """Indexes one report. Returns True on success. Never raises: the interview is already complete."""
    if rag is None:
        log.info("rag_index_skipped", extra={"fields": {"reason": "mentor disabled", "report_id": report["report_id"]}})
        return False
    try:
        session_id = report["session_id"]
        rag_report = to_rag_report(report, await repo.session_questions(session_id),
                                   await repo.session_answers(session_id), await repo.session_evaluations(session_id))
        await anyio.to_thread.run_sync(rag.index_report, rag_report)
        chunk_ids = [c.id for c in chunks_for_report(rag_report)]
        await repo.update_report(report["report_id"], {"rag_indexed": True, "rag_chunk_ids": chunk_ids})
        log.info("rag_indexed", extra={"fields": {"report_id": report["report_id"], "chunks": len(chunk_ids)}})
        return True
    except Exception:  # noqa: BLE001 -- keep the report; indexing is retryable
        log.exception("rag_index_failed", extra={"fields": {"report_id": report["report_id"]}})
        return False
