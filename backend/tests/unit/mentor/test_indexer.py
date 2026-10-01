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


class WipedRag(FlakyRag):
    """A Mentor index whose folder may have been wiped: `count` chunks left, records upserts (prep plans)."""

    def __init__(self, count: int):
        super().__init__()
        self.upserts: list[str] = []
        self.collection = self  # rag.collection.count() / .upsert() as on the real RagService
        self._count = count

    def count(self) -> int:
        return self._count

    def upsert(self, ids, documents, metadatas):
        self.upserts.extend(ids)


def _plan(plan_id: str) -> dict:
    return {"plan_id": plan_id, "candidate_id": "u1", "company_name": "Stripe",
            "created_at": datetime(2026, 9, 2, tzinfo=timezone.utc),
            "plan": {"estimated_weeks": 2, "summary": "s", "weeks": [], "readiness_check": "", "company_tips": []},
            "analysis": {"gaps": []}}


def test_a_wiped_index_is_rebuilt_from_mongodb_at_startup():
    async def run():
        rag = WipedRag(count=0)
        db, indexer = await _setup(rag, _report("r1", rag_indexed=True), _report("r2", rag_indexed=True))
        await db["prep_plans"].insert_one(_plan("p1"))
        reopened = await indexer.heal_lost_index()
        await indexer.schedule_unindexed()
        await indexer.drain()
        return rag, reopened, await InterviewRepository(db).get_report("r1")

    rag, reopened, saved = asyncio.run(run())
    assert reopened == 2
    assert sorted(rag.calls) == ["s-r1", "s-r2"]  # both reports re-embedded
    assert rag.upserts == ["p1:prep_plan"]        # and the prep plan re-added
    assert saved["rag_indexed"] is True


def test_an_intact_index_is_left_alone():
    async def run():
        rag = WipedRag(count=5)
        db, indexer = await _setup(rag, _report("r1", rag_indexed=True))
        return rag, await indexer.heal_lost_index(), await InterviewRepository(db).get_report("r1")

    rag, reopened, saved = asyncio.run(run())
    assert reopened == 0 and rag.calls == [] and saved["rag_indexed"] is True
