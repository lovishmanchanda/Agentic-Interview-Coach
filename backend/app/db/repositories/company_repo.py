"""companies: curated profiles and cached research (Phase 3)."""
from app.db.models.company import Company, company_key
from app.db.repositories.interview_repo import utcnow


class CompanyRepository:
    def __init__(self, db):
        self.companies = db["companies"]

    async def upsert(self, company: Company) -> bool:
        """Insert or replace by company_id. Returns True if newly inserted."""
        result = await self.companies.update_one(
            {"company_id": company.company_id},
            {"$set": {**company.model_dump(), "updated_at": utcnow()}, "$setOnInsert": {"created_at": utcnow()}},
            upsert=True)
        return result.upserted_id is not None

    async def find(self, name: str) -> dict | None:
        """By name or alias, case-insensitively."""
        key = company_key(name)
        if not key:
            return None
        found = await self.companies.find_one({"company_id": key}, {"_id": 0})
        return found or await self.companies.find_one({"aliases": name.strip().lower()}, {"_id": 0})

    async def names(self) -> list[tuple[str, list[str]]]:
        """(name, aliases) of every known company, for spotting one in a chat message."""
        docs = await self.companies.find({}, {"_id": 0, "name": 1, "aliases": 1}).to_list(length=2000)
        return [(d["name"], d.get("aliases", [])) for d in docs]
