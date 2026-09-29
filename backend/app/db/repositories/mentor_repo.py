"""mentor_conversations (implementation_plan.md 2.4): one document per conversation, the turns embedded.

A turn is written only once the Mentor has answered (user message + reply together), so a failed call
never leaves a question without its answer, and a brand-new conversation exists only once it has one.
"""
import re

from pymongo import DESCENDING, ReturnDocument

from app.db.repositories.interview_repo import utcnow

PREVIEW_CHARS = 140
_MARKUP = re.compile(r"\s?\[\d+\]|[*_#`>|]+")


def preview(text: str) -> str:
    """The sidebar's one-line preview: plain text, no markdown or citation markers."""
    return " ".join(_MARKUP.sub("", text).split())[:PREVIEW_CHARS]


class MentorConversationRepository:
    def __init__(self, db):
        self.conversations = db["mentor_conversations"]

    async def get(self, conversation_id: str, candidate_id: str) -> dict | None:
        """Scoped to the candidate: someone else's conversation reads as missing."""
        return await self.conversations.find_one({"conversation_id": conversation_id, "candidate_id": candidate_id},
                                                 {"_id": 0})

    async def list_for(self, candidate_id: str, *, limit: int = 30) -> list[dict]:
        cursor = self.conversations.find({"candidate_id": candidate_id}, {"_id": 0, "messages": 0})
        return await cursor.sort("updated_at", DESCENDING).to_list(length=limit)

    async def append_turn(self, *, conversation_id: str, candidate_id: str, title: str, messages: list[dict]) -> dict:
        """Creates the conversation on its first turn. Returns it without the messages."""
        now = utcnow()
        return await self.conversations.find_one_and_update(
            {"conversation_id": conversation_id, "candidate_id": candidate_id},
            {"$setOnInsert": {"title": title, "created_at": now},
             "$push": {"messages": {"$each": messages}},
             "$set": {"updated_at": now, "last_message_preview": preview(messages[-1]["content"])},
             "$inc": {"message_count": len(messages)}},
            upsert=True, return_document=ReturnDocument.AFTER, projection={"_id": 0, "messages": 0},
        )
