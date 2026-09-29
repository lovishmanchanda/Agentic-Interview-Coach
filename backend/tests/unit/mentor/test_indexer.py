"""ReportIndexer: background Mentor indexing with retry and the unindexed-report sweep (2.1)."""
import asyncio
from datetime import datetime, timezone

from mongomock_motor import AsyncMongoMockClient

from app.core.mentor.indexer import ReportIndexer
from app.db.repositories.interview_repo import InterviewRepository


class FlakyRag:
    """Fails the first `failures` index calls, then succeeds."""

    def __init__(self, failures: int = 0):
        self.failures = failures
        self.calls: list[str] = []

    def index_report(self, report):
        self.calls.append(report.session_id)
        if len(self.calls) <= self.failures:
            raise ConnectionError("HF is down")


def _report(report_id: str, candidate_id: str = "u1", **extra) -> dict:
    return {"report_id": report_id, "session_id": f"s-{report_id}", "candidate_id": candidate_id,
            "interview_type": "technical", "scores": {"overall": 6.0}, "per_topic_scores": {"dsa": 6.0},
            "summary": "ok", "strong_areas": [], "weak_areas": [], "recommendations": [],
            "rag_indexed": False, "rag_chunk_ids": [], "generated_at": datetime(2026, 9, 1, tzinfo=timezone.utc),
            **extra}


async def _setup(rag, *reports):
    db = AsyncMongoMockClient()["indexer_test"]
    for report in reports:
        await InterviewRepository(db).save_report(report)
    return db, ReportIndexer(rag, db, retry_delays=(0, 0, 0))


def test_failed_indexing_is_retried_until_it_succeeds():
    async def run():
        rag = FlakyRag(failures=2)
        db, indexer = await _setup(rag, _report("r1"))
        assert await indexer.schedule("r1") is True
        saved = await InterviewRepository(db).get_report("r1")
        return rag, saved

    rag, saved = asyncio.run(run())
    assert len(rag.calls) == 3
    assert saved["rag_indexed"] is True and saved["rag_chunk_ids"] == ["s-r1:summary", "s-r1:recommendations"]


def test_indexing_gives_up_after_the_last_retry_and_keeps_the_report():
    async def run():
        rag = FlakyRag(failures=99)
        db, indexer = await _setup(rag, _report("r1"))
        ok = await indexer.schedule("r1")
        return rag, ok, await InterviewRepository(db).get_report("r1")

    rag, ok, saved = asyncio.run(run())
    assert ok is False and len(rag.calls) == 4  # first try + 3 retries
    assert saved is not None and saved["rag_indexed"] is False


def test_a_pending_report_is_not_scheduled_twice_and_an_indexed_one_is_skipped():
    async def run():
        rag = FlakyRag()
        _, indexer = await _setup(rag, _report("r1"), _report("r2", rag_indexed=True))
        first, second = indexer.schedule("r1"), indexer.schedule("r1")
        assert first is second and indexer.is_pending("r1")
        await indexer.schedule("r2")
        await indexer.drain()
        return rag

    assert asyncio.run(run()).calls == ["s-r1"]


def test_sweep_schedules_only_unindexed_reports_for_that_candidate():
    async def run():
        rag = FlakyRag()
        db, indexer = await _setup(rag, _report("a1"), _report("a2", rag_indexed=True), _report("b1", candidate_id="u2"))
        assert await indexer.schedule_unindexed("u1") == 1
        await indexer.drain()
        assert rag.calls == ["s-a1"]
        assert await indexer.schedule_unindexed() == 1  # everyone's: only b1 is left
        await indexer.drain()
        return rag

    assert asyncio.run(run()).calls == ["s-a1", "s-b1"]


def test_without_rag_nothing_is_scheduled():
    async def run():
        _, indexer = await _setup(None, _report("r1"))
        indexer.start_sweep()
        return indexer.schedule("r1"), await indexer.schedule_unindexed()

    assert asyncio.run(run()) == (None, 0)
