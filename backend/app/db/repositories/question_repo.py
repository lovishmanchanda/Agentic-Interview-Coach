from datetime import datetime, timezone

from app.db.models.question import Question


class QuestionRepository:
    def __init__(self, db):
        self.questions = db["question_bank"]

    async def upsert(self, question: Question) -> bool:
        """Insert or replace by question_id, keeping usage stats. Returns True if newly inserted."""
        doc = question.model_dump()
        result = await self.questions.update_one(
            {"question_id": question.question_id},
            {"$set": doc, "$setOnInsert": {"times_used": 0, "created_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
        return result.upserted_id is not None

    async def get(self, question_id: str) -> dict | None:
        return await self.questions.find_one({"question_id": question_id}, {"_id": 0})

    async def find(self, *, type: str | None = None, topic: str | list[str] | None = None,
                   subtopic: str | list[str] | None = None, difficulty: str | None = None,
                   role: str | None = None, exclude_ids: list[str] | None = None, limit: int = 50) -> list[dict]:
        query: dict = {}
        if type:
            query["type"] = type
        if topic:
            query["topic"] = {"$in": topic} if isinstance(topic, list) else topic
        if subtopic:
            query["subtopic"] = {"$in": subtopic} if isinstance(subtopic, list) else subtopic
        if difficulty:
            query["difficulty"] = difficulty
        if role:
            query["roles"] = role
        if exclude_ids:
            query["question_id"] = {"$nin": exclude_ids}
        return await self.questions.find(query, {"_id": 0}).to_list(length=limit)

    async def topics(self, *, type: str, role: str) -> list[str]:
        """Distinct topics the bank has for this question type and role."""
        return sorted(await self.questions.distinct("topic", {"type": type, "roles": role}))

    async def subtopics(self, *, type: str, role: str) -> list[str]:
        return sorted(t for t in await self.questions.distinct("subtopic", {"type": type, "roles": role}) if t)
