import uuid
from datetime import datetime, timezone

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.utils.exceptions import ConflictError


def _now() -> datetime:
    return datetime.now(timezone.utc)


class UserRepository:
    def __init__(self, db):
        self.users = db["users"]

    async def create(self, *, email: str, name: str, password_hash: str, role: str = "user") -> dict:
        now = _now()
        doc = {
            "_id": uuid.uuid4().hex, "email": email.lower(), "name": name, "password_hash": password_hash,
            "role": role, "is_active": True, "created_at": now, "updated_at": now, "last_login": None,
        }
        try:
            await self.users.insert_one(doc)
        except DuplicateKeyError as exc:
            raise ConflictError("An account with this email already exists", code="email_taken") from exc
        return doc

    async def get_by_email(self, email: str) -> dict | None:
        return await self.users.find_one({"email": email.lower()})

    async def get_by_id(self, user_id: str) -> dict | None:
        return await self.users.find_one({"_id": user_id})

    async def mark_login(self, user_id: str) -> dict | None:
        return await self.users.find_one_and_update(
            {"_id": user_id}, {"$set": {"last_login": _now()}}, return_document=ReturnDocument.AFTER)


class RefreshTokenRepository:
    """Stores only a hash of each refresh token's jti. Consuming a token deletes it (rotation)."""

    def __init__(self, db):
        self.tokens = db["refresh_tokens"]

    async def store(self, *, user_id: str, token_hash: str, expires_at: datetime) -> None:
        await self.tokens.insert_one({"token_hash": token_hash, "user_id": user_id,
                                      "expires_at": expires_at, "created_at": _now()})

    async def consume(self, token_hash: str) -> dict | None:
        return await self.tokens.find_one_and_delete({"token_hash": token_hash})

    async def revoke_all(self, user_id: str) -> int:
        result = await self.tokens.delete_many({"user_id": user_id})
        return result.deleted_count
