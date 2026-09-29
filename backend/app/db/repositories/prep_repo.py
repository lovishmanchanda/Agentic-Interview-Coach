"""prep_plans: personalised preparation plans (Phase 3), one document per plan."""
from pymongo import DESCENDING


class PrepPlanRepository:
    def __init__(self, db):
        self.plans = db["prep_plans"]

    async def save(self, doc: dict) -> dict:
        await self.plans.insert_one({**doc})
        return doc

    async def get(self, plan_id: str, candidate_id: str) -> dict | None:
        return await self.plans.find_one({"plan_id": plan_id, "candidate_id": candidate_id}, {"_id": 0})

    async def list_for(self, candidate_id: str, *, limit: int = 30) -> list[dict]:
        cursor = self.plans.find({"candidate_id": candidate_id},
                                 {"_id": 0, "plan_id": 1, "company_name": 1, "created_at": 1, "estimated_weeks": 1,
                                  "sources": 1})
        return await cursor.sort("created_at", DESCENDING).to_list(length=limit)
