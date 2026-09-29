"""interview_sessions, interview_questions, candidate_answers, evaluations, interview_reports."""
from datetime import datetime, timezone

from pymongo import ASCENDING, DESCENDING, ReturnDocument

_NO_ID = {"_id": 0}
STATE_HISTORY_LIMIT = 100


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _strip_id(doc: dict | None) -> dict | None:
    if doc is not None:
        doc.pop("_id", None)
    return doc


def as_utc(value: datetime) -> datetime:
    """Stored datetimes are UTC; some drivers/test doubles hand them back naive."""
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


class InterviewRepository:
    def __init__(self, db):
        self.sessions = db["interview_sessions"]
        self.questions = db["interview_questions"]
        self.answers = db["candidate_answers"]
        self.evaluations = db["evaluations"]
        self.reports = db["interview_reports"]

    # ── sessions ──
    async def create_session(self, doc: dict) -> dict:
        await self.sessions.insert_one({**doc})
        return doc

    async def get_session(self, session_id: str) -> dict | None:
        return await self.sessions.find_one({"session_id": session_id}, _NO_ID)

    async def list_sessions(self, candidate_id: str, limit: int = 50) -> list[dict]:
        cursor = self.sessions.find({"candidate_id": candidate_id}, _NO_ID).sort("started_at", DESCENDING)
        return await cursor.to_list(length=limit)

    async def transition(self, session_id: str, *, from_states: list[str], to_state: str,
                         extra: dict | None = None) -> dict | None:
        """Compare-and-set state change. Returns None if the session was not in one of `from_states`
        (e.g. a duplicate ANSWER while the first one is still being evaluated)."""
        # No projection here: the in-memory test double returns None for find_one_and_update when a
        # projection is combined with a filter on the field being updated. `_id` is dropped in Python.
        now = utcnow()
        doc = await self.sessions.find_one_and_update(
            {"session_id": session_id, "state": {"$in": from_states}},
            {"$set": {"state": to_state, "updated_at": now, **(extra or {})},
             # Every state entered, for debugging and the /state endpoint. Capped so it can't grow unbounded.
             "$push": {"state_history": {"$each": [{"state": to_state, "at": now}], "$slice": -STATE_HISTORY_LIMIT}}},
            return_document=ReturnDocument.AFTER)
        return _strip_id(doc)

    async def update_session(self, session_id: str, changes: dict) -> dict | None:
        doc = await self.sessions.find_one_and_update(
            {"session_id": session_id}, {"$set": {**changes, "updated_at": utcnow()}},
            return_document=ReturnDocument.AFTER)
        return _strip_id(doc)

    # ── questions / answers / evaluations ──
    async def add_question(self, doc: dict) -> dict:
        await self.questions.insert_one({**doc})
        return doc

    async def save_draft(self, session_id: str, question_id: str, text: str) -> bool:
        """Autosave of the answer being typed. Only while that question is still waiting for its answer, so a
        late draft can't land on the next question."""
        result = await self.sessions.update_one(
            {"session_id": session_id, "state": "WAITING_FOR_RESPONSE", "current_question_id": question_id},
            {"$set": {"draft_answer": {"question_id": question_id, "text": text, "saved_at": utcnow()}}})
        return result.modified_count == 1

    async def push_hint(self, question_id: str, hint: dict, *, max_hints: int) -> bool:
        """Adds a hint unless the question already has `max_hints` (checked in the same write, so two
        requests at once can't both get one)."""
        result = await self.questions.update_one(
            {"question_id": question_id, f"hints.{max_hints - 1}": {"$exists": False}},
            {"$push": {"hints": hint}})
        return result.modified_count == 1

    async def delete_question(self, question_id: str) -> None:
        """Only for a question written by a connection that then lost the race to ask it."""
        await self.questions.delete_one({"question_id": question_id})

    async def get_question(self, question_id: str) -> dict | None:
        return await self.questions.find_one({"question_id": question_id}, _NO_ID)

    async def recent_bank_question_ids(self, candidate_id: str, *, exclude_session_id: str | None = None,
                                       limit: int = 50) -> list[str]:
        """Bank questions this candidate was asked most recently (newest first), so new interviews vary."""
        query: dict = {"candidate_id": candidate_id, "bank_question_id": {"$ne": None}}
        if exclude_session_id:
            query["session_id"] = {"$ne": exclude_session_id}
        cursor = self.questions.find(query, {"_id": 0, "bank_question_id": 1}).sort("asked_at", DESCENDING)
        return list(dict.fromkeys(d["bank_question_id"] for d in await cursor.to_list(length=limit)))

    async def session_questions(self, session_id: str) -> list[dict]:
        return await self.questions.find({"session_id": session_id}, _NO_ID).sort("asked_at", ASCENDING).to_list(length=100)

    async def add_answer(self, doc: dict) -> dict:
        await self.answers.insert_one({**doc})
        return doc

    async def get_answer(self, answer_id: str) -> dict | None:
        return await self.answers.find_one({"answer_id": answer_id}, _NO_ID)

    async def session_answers(self, session_id: str) -> list[dict]:
        return await self.answers.find({"session_id": session_id}, _NO_ID).sort("submitted_at", ASCENDING).to_list(length=200)

    async def add_evaluation(self, doc: dict) -> dict:
        await self.evaluations.insert_one({**doc})
        return doc

    async def session_evaluations(self, session_id: str) -> list[dict]:
        return await self.evaluations.find({"session_id": session_id}, _NO_ID).sort("evaluated_at", ASCENDING).to_list(length=200)

    async def latest_evaluation(self, session_id: str, question_id: str) -> dict | None:
        cursor = self.evaluations.find({"session_id": session_id, "question_id": question_id}, _NO_ID)
        docs = await cursor.sort("evaluated_at", DESCENDING).to_list(length=1)
        return docs[0] if docs else None

    # ── reports ──
    async def save_report(self, doc: dict) -> dict:
        await self.reports.insert_one({**doc})
        return doc

    async def report_for_session(self, session_id: str) -> dict | None:
        return await self.reports.find_one({"session_id": session_id}, _NO_ID)

    async def get_report(self, report_id: str) -> dict | None:
        return await self.reports.find_one({"report_id": report_id}, _NO_ID)

    async def list_reports(self, candidate_id: str, limit: int = 50) -> list[dict]:
        cursor = self.reports.find({"candidate_id": candidate_id}, _NO_ID).sort("generated_at", DESCENDING)
        return await cursor.to_list(length=limit)

    async def report_ids_for_sessions(self, candidate_id: str, session_ids: list[str]) -> dict[str, str]:
        """session_id -> report_id, only for this candidate's reports."""
        cursor = self.reports.find({"candidate_id": candidate_id, "session_id": {"$in": session_ids}},
                                   {"_id": 0, "session_id": 1, "report_id": 1})
        return {r["session_id"]: r["report_id"] for r in await cursor.to_list(length=len(session_ids) or 1)}

    async def unindexed_reports(self, candidate_id: str | None = None, *, limit: int = 200) -> list[dict]:
        """Reports the Mentor hasn't indexed yet, oldest first (report_id only)."""
        query = {"rag_indexed": {"$ne": True}, **({"candidate_id": candidate_id} if candidate_id else {})}
        cursor = self.reports.find(query, {"_id": 0, "report_id": 1}).sort("generated_at", ASCENDING)
        return await cursor.to_list(length=limit)

    async def update_report(self, report_id: str, changes: dict) -> None:
        await self.reports.update_one({"report_id": report_id}, {"$set": changes})
