"""The Mentor (implementation_plan.md 2.3): chat grounded in the candidate's own reports.

`chat()` loads the conversation's recent turns, asks rag_tool (intent-routed retrieval over the
candidate's indexed reports, then one LLM call through the AI Gateway), and stores the turn with the
excerpts the answer drew on. The candidate ID always comes from the JWT, never from the client.

rag_tool's `RagService.answer` is synchronous and calls an `invoke_llm(prompt) -> str` callback, so it
runs in a worker thread and the callback hops back to the event loop to use the async AI Gateway.
"""
import re
import time
import uuid
from urllib.parse import urlencode

import anyio
import anyio.from_thread

from app.core.mentor.indexer import ReportIndexer
from app.core.mentor.rag_tool import MentorChatRequest
from app.core.mentor.rag_tool.service import classify_intent
from app.core.prompts import render_prompt
from app.db.repositories.interview_repo import InterviewRepository, as_utc, utcnow
from app.db.repositories.mentor_repo import MentorConversationRepository
from app.gateway import AIGateway
from app.gateway.types import CallContext
from app.utils.exceptions import ConflictError, NotFoundError, ServiceUnavailableError

MENTOR_PROMPT_VERSION = "mentor/mentor_v1"
HISTORY_MESSAGES = 8          # rag_tool's MentorChatRequest cap; the prompt shows the last 6
MAX_MESSAGES = 200            # per conversation (100 turns); then start a new one
TITLE_CHARS = 60
STRONG = 7.5                  # the report's "strong" tier; below it a topic is worth drilling
DRILL_TOPICS = 3
RECENT_REPORTS = 3

# Questions a weak-area drill answers: asking to be drilled, or asking what to work on.
_DRILL_PATTERN = re.compile(
    r"\b(drill|quiz|test me|practi[cs]e|mock|weak(?:est|ness(?:es)?| ?(?:areas?|spots?|points?))|"
    r"study|focus on|work on|improve|prepare)\b", re.IGNORECASE)
_CITATION = re.compile(r"\s?\[\d+\]")


def _strip_citations(text: str) -> str:
    """Earlier replies' [n] pointed at that turn's excerpts; left in, the model reuses stale numbers."""
    return _CITATION.sub("", text)


def _title(message: str) -> str:
    text = " ".join(message.split())
    return text if len(text) <= TITLE_CHARS else text[: TITLE_CHARS - 1].rsplit(" ", 1)[0] + "…"


def public_message(message: dict) -> dict:
    out = {"message_id": message["message_id"], "role": message["role"], "content": message["content"],
           "timestamp": as_utc(message["timestamp"]).isoformat()}
    if message["role"] == "assistant":
        out["sources"] = message.get("retrieved_chunks", [])
        out["actions"] = message.get("actions", [])
    return out


def public_conversation(conversation: dict, *, with_messages: bool = False) -> dict:
    out = {"conversation_id": conversation["conversation_id"], "title": conversation["title"],
           "created_at": as_utc(conversation["created_at"]).isoformat(),
           "updated_at": as_utc(conversation["updated_at"]).isoformat(),
           "message_count": conversation.get("message_count", 0),
           "last_message_preview": conversation.get("last_message_preview", "")}
    if with_messages:
        out["messages"] = [public_message(m) for m in conversation.get("messages", [])]
    return out


class MentorAgent:
    def __init__(self, *, rag, gateway: AIGateway, conversations: MentorConversationRepository,
                 interviews: InterviewRepository, indexer: ReportIndexer | None = None):
        self.rag = rag
        self.gateway = gateway
        self.conversations = conversations
        self.interviews = interviews
        self.indexer = indexer

    # ── chat ─────────────────────────────────────────────────────────────────
    async def chat(self, *, candidate_id: str, message: str, conversation_id: str | None = None) -> dict:
        if self.rag is None:
            raise ServiceUnavailableError("The mentor is not available: HF_TOKEN is not configured.",
                                          code="mentor_disabled")
        history: list[dict] = []
        if conversation_id:
            conversation = await self.conversations.get(conversation_id, candidate_id)
            if conversation is None:
                raise NotFoundError("Conversation not found", code="conversation_not_found")
            if conversation.get("message_count", 0) + 2 > MAX_MESSAGES:
                raise ConflictError("This conversation is full. Start a new one to keep going.",
                                    code="conversation_full")
            history = [{"role": m["role"], "content": _strip_citations(m["content"])}
                       for m in conversation.get("messages", [])[-HISTORY_MESSAGES:]]
        else:
            conversation_id = uuid.uuid4().hex

        drill = await self.drill_suggestion(candidate_id) if _DRILL_PATTERN.search(message) else None
        system_prompt = render_prompt(MENTOR_PROMPT_VERSION, practice_note=self._practice_note(drill))
        context = CallContext(candidate_id=candidate_id, prompt_version=MENTOR_PROMPT_VERSION,
                              extra={"conversation_id": conversation_id})

        def invoke_llm(prompt: str) -> str:
            return anyio.from_thread.run(lambda: self.gateway.generate(prompt, context=context, temperature=0))

        asked_at = utcnow()
        started = time.perf_counter()
        request = MentorChatRequest(user_id=candidate_id, message=message, history=history)
        response = await anyio.to_thread.run_sync(self.rag.answer, request, invoke_llm, system_prompt)
        sources = await self._with_report_ids(candidate_id, response.sources)
        actions = [drill] if drill and sources else []  # no data -> nothing to drill yet

        turn = [
            {"message_id": uuid.uuid4().hex, "role": "user", "content": message, "timestamp": asked_at},
            {"message_id": uuid.uuid4().hex, "role": "assistant", "content": response.answer, "timestamp": utcnow(),
             "retrieved_chunks": sources, "actions": actions, "intent": classify_intent(message, bool(history)),
             "prompt_version": MENTOR_PROMPT_VERSION, "latency_ms": int((time.perf_counter() - started) * 1000)},
        ]
        saved = await self.conversations.append_turn(conversation_id=conversation_id, candidate_id=candidate_id,
                                                     title=_title(message), messages=turn)
        return {"conversation_id": conversation_id, "title": saved["title"], "answer": response.answer,
                "sources": sources, "actions": actions, "messages": [public_message(m) for m in turn]}

    async def _with_report_ids(self, candidate_id: str, sources: list[dict]) -> list[dict]:
        """Citation chips link to the report; only this candidate's reports are looked up."""
        if not sources:
            return []
        by_session = await self.interviews.report_ids_for_sessions(
            candidate_id, list({s["session_id"] for s in sources}))
        return [{**s, "report_id": by_session.get(s["session_id"])} for s in sources]

    @staticmethod
    def _practice_note(drill: dict | None) -> str:
        if drill is None:
            return "Point them to starting a practice interview instead."
        topics = ", ".join(t.replace("_", " ") for t in drill["topics"])
        return (f'Under your reply the app shows a "Start a weak-area drill" button, a practice interview on: {topics}. '
                "Point them to it, and say in a sentence why those topics, citing the excerpts.")

    # ── weak-area drill ──────────────────────────────────────────────────────
    async def drill_suggestion(self, candidate_id: str) -> dict | None:
        """The topics to drill: the latest score per topic across recent reports of the latest interview's
        type (behavioral competencies and technical topics don't mix), weakest first."""
        reports = await self.interviews.list_reports(candidate_id, limit=RECENT_REPORTS)
        if not reports:
            return None
        interview_type = reports[0].get("interview_type", "technical")
        latest_score: dict[str, float] = {}
        for report in reports:  # newest first, so the first score seen for a topic is its latest
            if report.get("interview_type", "technical") == interview_type:
                for topic, score in report.get("per_topic_scores", {}).items():
                    latest_score.setdefault(topic, score)
        if not latest_score:
            return None
        ranked = sorted(latest_score, key=lambda t: latest_score[t])
        topics = [t for t in ranked if latest_score[t] < STRONG][:DRILL_TOPICS] or ranked[:1]
        session = await self.interviews.get_session(reports[0]["session_id"])
        role = (session or {}).get("config", {}).get("role")
        query = urlencode({"focus": ",".join(topics), **({"role": role} if role else {}), "type": interview_type},
                          safe=",")
        return {"type": "drill", "topics": topics, "role": role, "interview_type": interview_type,
                "href": f"/interview/configure?{query}"}

    # ── the Mentor page's opening state ──────────────────────────────────────
    async def welcome(self, candidate_id: str) -> dict:
        """What the Mentor page opens with: no history (welcome + first-interview CTA), or a greeting built
        from the latest report. Also re-queues any report the Mentor hasn't indexed yet."""
        reports = await self.interviews.list_reports(candidate_id, limit=50)
        pending = await self.indexer.schedule_unindexed(candidate_id) if self.indexer else 0
        out = {"mentor_available": self.rag is not None, "report_count": len(reports), "pending_reports": pending,
               "latest": None}
        if reports:
            latest = reports[0]
            ranked = sorted(latest.get("per_topic_scores", {}).items(), key=lambda kv: kv[1])
            weakest = ranked[0][0] if ranked and ranked[0][1] < STRONG else None
            strongest = ranked[-1][0] if ranked and ranked[-1][1] >= 5 and ranked[-1][0] != weakest else None
            out["latest"] = {
                "report_id": latest["report_id"], "session_id": latest["session_id"],
                "generated_at": as_utc(latest["generated_at"]).isoformat(),
                "interview_type": latest.get("interview_type", "technical"), "overall": latest["scores"]["overall"],
                "weakest_topic": weakest, "strongest_topic": strongest,
            }
        return out
