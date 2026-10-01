"""The Mentor (implementation_plan.md 2.3): chat grounded in the candidate's own reports.

`chat()` loads the conversation's recent turns, asks rag_tool (intent-routed retrieval over the
candidate's indexed reports, then one LLM call through the AI Gateway), and stores the turn with the
excerpts the answer drew on. The candidate ID always comes from the JWT, never from the client.

rag_tool's `RagService.answer` is synchronous and calls an `invoke_llm(prompt) -> str` callback, so it
runs in a worker thread and the callback hops back to the event loop to use the async AI Gateway.

When retrieval finds nothing in the candidate's reports, rag_tool returns a fixed no-data message. ARIA answers
instead (`mentor_answer`, prompt mentor/mentor_general): an honest "none of your reports cover that" for
questions about their performance, brief general advice for interview-preparation questions, or a polite
decline for anything off-topic. rag_tool itself is unchanged.
"""
import re
import time
import uuid
from urllib.parse import urlencode

import anyio
import anyio.from_thread

from app.agents.prep import intent as prep_intent
from app.agents.prep.orchestrator import PrepOrchestrator
from app.core.mentor.indexer import ReportIndexer, index_prep_plan
from app.core.mentor.rag_tool import MentorChatRequest, MentorChatResponse
from app.core.mentor.rag_tool.service import classify_intent
from app.core.prompts import render_for
from app.db.repositories.interview_repo import InterviewRepository, as_utc, utcnow
from app.db.repositories.mentor_repo import MentorConversationRepository
from app.gateway import AIGateway
from app.gateway.types import CallContext
from app.utils.exceptions import ConflictError, NotFoundError, ServiceUnavailableError
from app.utils.rate_limit import SlidingWindowLimiter, enforce

MENTOR_PROMPT_VERSION = "mentor/mentor_v2"           # answers grounded in report excerpts (v1 kept for rollback)
GENERAL_PROMPT_VERSION = "mentor/mentor_general_v1"  # when nothing in the reports matches
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


def general_prompt_note(report_count: int) -> str:
    return " (they haven't finished an interview yet, so they have no reports)" if report_count == 0 else ""


def mentor_answer(rag, request: MentorChatRequest, invoke_llm, system_prompt: str, general_prompt: str,
                  invoke_general=None) -> MentorChatResponse:
    """ARIA's reply: rag_tool's grounded, cited answer when the candidate's reports cover the question; otherwise
    one call with the general prompt (no excerpts, so no citations). Synchronous, like `RagService.answer`."""
    response = rag.answer(request, invoke_llm, system_prompt)
    if response.sources:
        return response
    history = "\n".join(f"{h.get('role', 'user')}: {h.get('content', '')}" for h in request.history[-6:]) or "(none)"
    prompt = (f"{general_prompt}\n\nRecent conversation:\n{history}\n\n"
              f"Candidate's message:\n<<<MESSAGE\n{request.message}\nMESSAGE>>>")
    answer = _CITATION.sub("", (invoke_general or invoke_llm)(prompt)).strip()
    return MentorChatResponse(answer=answer, sources=[])


def _strip_citations(text: str) -> str:
    """Earlier replies' [n] pointed at that turn's excerpts; left in, the model reuses stale numbers."""
    return _CITATION.sub("", text)


def previous_chunk_ids(messages: list[dict]) -> list[str]:
    """The excerpts the most recent grounded reply used, for a follow-up that finds nothing of its own.
    Turns saved before sources carried chunk_id: summary/recommendations IDs are rebuilt from the session."""
    for message in reversed(messages):
        sources = message.get("retrieved_chunks") if message["role"] == "assistant" else None
        if sources:
            ids = [s.get("chunk_id") or (f"{s['session_id']}:{s['chunk_type']}"
                                         if s.get("chunk_type") in ("summary", "recommendations") else None)
                   for s in sources]
            return [i for i in ids if i]
    return []


def _title(message: str) -> str:
    text = " ".join(message.split())
    return text if len(text) <= TITLE_CHARS else text[: TITLE_CHARS - 1].rsplit(" ", 1)[0] + "…"


def public_message(message: dict) -> dict:
    out = {"message_id": message["message_id"], "role": message["role"], "content": message["content"],
           "timestamp": as_utc(message["timestamp"]).isoformat()}
    if message["role"] == "assistant":
        out["sources"] = message.get("retrieved_chunks", [])
        out["actions"] = message.get("actions", [])
        if message.get("prep_plan_id"):
            out["prep_plan_id"] = message["prep_plan_id"]
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
                 interviews: InterviewRepository, indexer: ReportIndexer | None = None,
                 prep: PrepOrchestrator | None = None, prep_limiter: SlidingWindowLimiter | None = None):
        self.prep = prep
        self.prep_limiter = prep_limiter
        self.rag = rag
        self.gateway = gateway
        self.conversations = conversations
        self.interviews = interviews
        self.indexer = indexer

    # ── chat ─────────────────────────────────────────────────────────────────
    async def _history(self, conversation_id: str | None, candidate_id: str) -> tuple[str, list[dict]]:
        """(conversation_id, recent messages) for an existing conversation, or a new id and no history."""
        if not conversation_id:
            return uuid.uuid4().hex, []
        conversation = await self.conversations.get(conversation_id, candidate_id)
        if conversation is None:
            raise NotFoundError("Conversation not found", code="conversation_not_found")
        if conversation.get("message_count", 0) + 2 > MAX_MESSAGES:
            raise ConflictError("This conversation is full. Start a new one to keep going.", code="conversation_full")
        return conversation_id, conversation.get("messages", [])[-HISTORY_MESSAGES:]

    async def chat(self, *, candidate_id: str, message: str, conversation_id: str | None = None) -> dict:
        if self.prep is not None:  # "Prepare me for Google" -> the company-prep workflow (Phase 3)
            request = prep_intent.detect(message, await self.prep.companies.names())
            if request is not None:
                return await self.prepare(candidate_id=candidate_id, company=request.company, weeks=request.weeks,
                                          conversation_id=conversation_id, user_message=message)
        if self.rag is None:
            raise ServiceUnavailableError("ARIA is offline: HF_TOKEN is not configured on the server.",
                                          code="mentor_disabled")
        conversation_id, recent = await self._history(conversation_id, candidate_id)
        history = [{"role": m["role"], "content": _strip_citations(m["content"])} for m in recent]
        previous = previous_chunk_ids(recent)

        drill = await self.drill_suggestion(candidate_id) if _DRILL_PATTERN.search(message) else None
        context = CallContext(candidate_id=candidate_id, extra={"conversation_id": conversation_id})
        system_prompt = render_for(context, MENTOR_PROMPT_VERSION, practice_note=self._practice_note(drill))
        general_context = CallContext(candidate_id=candidate_id, extra={"conversation_id": conversation_id})
        report_count = len(await self.interviews.list_reports(candidate_id, limit=1))
        general_prompt = render_for(general_context, GENERAL_PROMPT_VERSION, report_note=general_prompt_note(report_count))

        def invoke_llm(prompt: str) -> str:
            return anyio.from_thread.run(lambda: self.gateway.generate(prompt, context=context, temperature=0))

        def invoke_general(prompt: str) -> str:
            return anyio.from_thread.run(lambda: self.gateway.generate(prompt, context=general_context, temperature=0))

        asked_at = utcnow()
        started = time.perf_counter()
        request = MentorChatRequest(user_id=candidate_id, message=message, history=history,
                                    previous_chunk_ids=previous)
        response = await anyio.to_thread.run_sync(mentor_answer, self.rag, request, invoke_llm, system_prompt,
                                                   general_prompt, invoke_general)
        sources = await self._with_report_ids(candidate_id, response.sources)
        actions = [drill] if drill and sources else []  # no data -> nothing to drill yet

        turn = [
            {"message_id": uuid.uuid4().hex, "role": "user", "content": message, "timestamp": asked_at},
            {"message_id": uuid.uuid4().hex, "role": "assistant", "content": response.answer, "timestamp": utcnow(),
             "retrieved_chunks": sources, "actions": actions, "intent": classify_intent(message, bool(history)) if sources else "general",
             "prompt_version": context.prompt_version if sources else general_context.prompt_version, "latency_ms": int((time.perf_counter() - started) * 1000)},
        ]
        saved = await self.conversations.append_turn(conversation_id=conversation_id, candidate_id=candidate_id,
                                                     title=_title(message), messages=turn)
        return {"conversation_id": conversation_id, "title": saved["title"], "answer": response.answer,
                "sources": sources, "actions": actions, "messages": [public_message(m) for m in turn]}

    # ── company preparation (Phase 3) ────────────────────────────────────────
    async def prepare(self, *, candidate_id: str, company: str, jd_text: str | None = None, weeks: int | None = None,
                      conversation_id: str | None = None, user_message: str | None = None) -> dict:
        """Runs the prep workflow and posts the plan into the conversation as a Mentor reply, so follow-up questions
        happen in the same chat. The plan is also indexed so the Mentor can answer questions about it later."""
        if self.prep is None:
            raise ServiceUnavailableError("Company preparation isn't available right now.", code="prep_unavailable")
        if self.prep_limiter is not None:
            enforce(self.prep_limiter, candidate_id, "You've made several preparation plans in the last hour. Try again later.")
        conversation_id, _ = await self._history(conversation_id, candidate_id)
        asked_at = utcnow()
        started = time.perf_counter()
        doc = await self.prep.run(candidate_id=candidate_id, company_name=company, jd_text=jd_text, weeks=weeks)
        # Indexed for the Mentor, and recorded as this reply's source: a follow-up like "what's week 2 again?"
        # that finds nothing of its own is answered from the plan (previous_chunk_ids).
        plan_chunk = await index_prep_plan(self.rag, doc) if self.rag is not None else None
        text = user_message or f"Prepare me for {doc['company_name']}" + (" (with a job description)" if jd_text else "")
        turn = [
            {"message_id": uuid.uuid4().hex, "role": "user", "content": text, "timestamp": asked_at},
            {"message_id": uuid.uuid4().hex, "role": "assistant", "content": doc["markdown"], "timestamp": utcnow(),
             "retrieved_chunks": [plan_chunk] if plan_chunk else [], "actions": doc["actions"], "intent": "company_prep",
             "prep_plan_id": doc["plan_id"],
             "prompt_version": doc["prompt_versions"].get("planner"), "latency_ms": int((time.perf_counter() - started) * 1000)},
        ]
        saved = await self.conversations.append_turn(conversation_id=conversation_id, candidate_id=candidate_id,
                                                     title=_title(text), messages=turn)
        return {"conversation_id": conversation_id, "title": saved["title"], "answer": doc["markdown"], "sources": [],
                "actions": doc["actions"], "prep_plan_id": doc["plan_id"], "messages": [public_message(m) for m in turn]}

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
