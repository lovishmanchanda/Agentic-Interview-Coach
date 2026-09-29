"""Report -> Mentor RAG index (implementation_plan.md 2.1).

`to_rag_report` maps the Cosmos report + its evaluations/questions/answers onto rag_tool's
`InterviewReport` contract. `index_session_report` runs rag_tool's blocking Chroma/HF calls in a
worker thread. On failure the Cosmos report is kept and `rag_indexed` stays False, so indexing can be
retried (the upsert is idempotent).

`ReportIndexer` runs that in the background: the engine schedules a report once the candidate has their
result, a failed attempt is retried with backoff, and reports still unindexed (a restart, an HF outage
that outlasted the retries) are picked up by a sweep at startup and when the candidate opens the Mentor.
"""
import asyncio
import logging

import anyio

from app.core.mentor.rag_tool import InterviewReport, QuestionFeedback, chunks_for_report
from app.db.repositories.interview_repo import InterviewRepository

log = logging.getLogger(__name__)

ANSWER_SUMMARY_CHARS = 400
RETRY_DELAYS_S = (2.0, 10.0, 30.0)  # after attempts 1, 2 and 3; then give up until the next sweep
SWEEP_LIMIT = 200


def to_rag_report(report: dict, questions: list[dict], answers: list[dict], evaluations: list[dict]) -> InterviewReport:
    by_question = {q["question_id"]: q for q in questions}
    latest_answer = {a["question_id"]: a for a in answers}  # later answers overwrite earlier retries
    feedback = []
    for e in evaluations:
        q = by_question.get(e["question_id"], {})
        answer = latest_answer.get(e["question_id"], {})
        answer_text = answer.get("answer_text", "")
        if answer.get("answer_type") == "code":  # the Mentor sees the result and the explanation, not the code
            run = answer.get("execution") or {}
            tests = f"{run.get('passed_tests', 0)}/{run.get('total_tests', 0)} tests passed" if run.get("graded") else "not graded"
            answer_text = f"[{answer.get('language')} solution: {run.get('status')}, {tests}] {answer_text}".strip()
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


class ReportIndexer:
    """Background Mentor indexing, one task per report (a report already pending isn't scheduled twice).
    One instance per app (app.state.indexer); tasks live on the app's event loop."""

    def __init__(self, rag, db, *, retry_delays: tuple[float, ...] = RETRY_DELAYS_S):
        self.rag = rag
        self.db = db
        self.retry_delays = tuple(retry_delays)
        self._tasks: dict[str, asyncio.Task] = {}
        self._background: set[asyncio.Task] = set()

    @property
    def repo(self) -> InterviewRepository:
        return InterviewRepository(self.db)

    def schedule(self, report_id: str) -> asyncio.Task | None:
        if self.rag is None:
            return None
        task = self._tasks.get(report_id)
        if task is None or task.done():
            task = asyncio.create_task(self._index_with_retry(report_id), name=f"rag-index:{report_id}")
            self._tasks[report_id] = task
            task.add_done_callback(lambda t: self._tasks.pop(report_id, None) if self._tasks.get(report_id) is t else None)
        return task

    def is_pending(self, report_id: str) -> bool:
        task = self._tasks.get(report_id)
        return task is not None and not task.done()

    async def _index_with_retry(self, report_id: str) -> bool:
        for attempt in range(len(self.retry_delays) + 1):
            report = await self.repo.get_report(report_id)
            if report is None:
                return False
            if report.get("rag_indexed") or await index_session_report(self.rag, self.repo, report):
                return True
            if attempt < len(self.retry_delays):
                await asyncio.sleep(self.retry_delays[attempt])
        log.warning("rag_index_gave_up", extra={"fields": {"report_id": report_id,
                                                            "attempts": len(self.retry_delays) + 1}})
        return False

    async def schedule_unindexed(self, candidate_id: str | None = None, *, limit: int = SWEEP_LIMIT) -> int:
        """Schedules every report not yet indexed (one candidate's, or everyone's at startup)."""
        if self.rag is None:
            return 0
        reports = await self.repo.unindexed_reports(candidate_id, limit=limit)
        for report in reports:
            self.schedule(report["report_id"])
        if reports:
            log.info("rag_index_sweep", extra={"fields": {"scheduled": len(reports), "candidate_id": candidate_id}})
        return len(reports)

    def start_sweep(self) -> None:
        """Startup: the sweep itself runs in the background so a slow database never delays boot."""
        if self.rag is None:
            return
        task = asyncio.create_task(self._sweep_safely(), name="rag-index:sweep")
        self._background.add(task)
        task.add_done_callback(self._background.discard)

    async def _sweep_safely(self) -> None:
        try:
            await self.schedule_unindexed()
        except Exception:  # noqa: BLE001 -- the next sweep (Mentor visit, restart) tries again
            log.exception("rag_index_sweep_failed")

    async def drain(self) -> None:
        """Waits for everything scheduled so far (tests; graceful shutdown)."""
        while pending := [t for t in (*self._background, *self._tasks.values()) if not t.done()]:
            await asyncio.gather(*pending, return_exceptions=True)

    async def close(self) -> None:
        tasks = [*self._background, *self._tasks.values()]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
