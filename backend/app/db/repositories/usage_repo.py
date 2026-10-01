"""Usage and cost from llm_calls (implementation_plan.md 6.5): daily caps and the admin reports."""
from datetime import datetime, timedelta, timezone

from app.db.client import aggregate_list


def _day_start(days_ago: int = 0) -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days_ago)


class UsageRepository:
    def __init__(self, db):
        self.calls = db["llm_calls"]
        self.sessions = db["interview_sessions"]

    async def tokens_today(self, candidate_id: str) -> int:
        rows = await aggregate_list(self.calls, [
            {"$match": {"candidate_id": candidate_id, "at": {"$gte": _day_start()}}},
            {"$group": {"_id": None, "tokens": {"$sum": "$tokens"}}},
        ], length=1)
        return int(rows[0]["tokens"]) if rows else 0

    async def report(self, days: int = 7) -> dict:
        since = _day_start(days - 1)
        match = {"$match": {"at": {"$gte": since}}}

        async def group(key, extra=None):
            return await aggregate_list(self.calls, [match, {"$group": {
                "_id": key, "calls": {"$sum": 1}, "tokens": {"$sum": "$tokens"}, "cost_usd": {"$sum": "$cost_usd"},
                "errors": {"$sum": {"$cond": [{"$eq": ["$status", "ok"]}, 0, 1]}},
                "latency_ms": {"$avg": "$latency_ms"}, **(extra or {})}}], length=1000)

        def rows(items, name):
            out = [{name: r["_id"], "calls": r["calls"], "tokens": r["tokens"], "cost_usd": round(r["cost_usd"], 4),
                    "errors": r["errors"], "avg_latency_ms": round(r["latency_ms"] or 0)} for r in items]
            return sorted(out, key=lambda r: -r["tokens"])

        by_day = await group({"$dateToString": {"format": "%Y-%m-%d", "date": "$at"}})
        wrap_ups = await self.sessions.count_documents({"started_at": {"$gte": since},
                                                        "last_decision.reason": {"$regex": "^token budget"}})
        time_ups = await self.sessions.count_documents({"started_at": {"$gte": since},
                                                        "last_decision.reason": "time limit reached"})
        return {
            "days": days, "since": since.isoformat(),
            "by_day": sorted(rows(by_day, "day"), key=lambda r: r["day"]),
            "by_model": rows(await group("$model"), "model"),
            "by_prompt_version": rows(await group("$prompt_version"), "prompt_version"),
            "by_call_type": rows(await group("$call_type"), "call_type"),
            "top_candidates": rows(await group("$candidate_id"), "candidate_id")[:10],
            "budget_wrap_ups": wrap_ups, "time_limit_wrap_ups": time_ups,
        }
