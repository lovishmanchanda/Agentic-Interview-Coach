import uuid
from datetime import datetime, timezone

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.db.models.profile import PREPARATION_TOPICS, ProfileCreate, ProfileUpdate
from app.utils.exceptions import ConflictError


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ProfileRepository:
    def __init__(self, db):
        self.profiles = db["candidate_profiles"]

    async def get_by_candidate(self, candidate_id: str) -> dict | None:
        return await self.profiles.find_one({"candidate_id": candidate_id})

    async def create(self, candidate_id: str, data: ProfileCreate) -> dict:
        now = _now()
        doc = {
            "_id": uuid.uuid4().hex, "candidate_id": candidate_id, **data.model_dump(),
            "preparation_scores": {topic: 0.0 for topic in PREPARATION_TOPICS},
            "created_at": now, "updated_at": now,
        }
        try:
            await self.profiles.insert_one(doc)
        except DuplicateKeyError as exc:
            raise ConflictError("Profile already exists; use PUT /profiles/me", code="profile_exists") from exc
        return doc

    async def update(self, candidate_id: str, data: ProfileUpdate) -> dict | None:
        changes = data.model_dump(exclude_none=True)
        changes["updated_at"] = _now()
        return await self.profiles.find_one_and_update(
            {"candidate_id": candidate_id}, {"$set": changes}, return_document=ReturnDocument.AFTER)
