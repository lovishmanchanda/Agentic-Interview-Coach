"""Interview engine.

Text interview, practice mode, no follow-ups yet. Each turn:

    QUESTION (QuestionEngine: bank first, LLM on a miss) -> ANSWER -> evaluate (Groq, fast tier)
    -> EVALUATION -> NEXT_TOPIC -> next QUESTION ... until `question_count` questions are answered
    (or the session's token budget runs low) -> report -> INTERVIEW_COMPLETE -> index for the Mentor

Still thin, replaced by later Phase 1 tasks: state machine (1.3), interviewer agent phrasing and
follow-ups (1.6), adaptive difficulty (1.8), full report generator (1.10). Events follow
architecture.md §13 and are delivered through an `emit` callback, so the WebSocket handler and the
tests drive the engine the same way.
"""
import logging
import uuid
from collections.abc import Awaitable, Callable
from datetime import timedelta

from pymongo.errors import DuplicateKeyError

from app.core.evaluation.answer_evaluator import evaluate_answer
from app.core.interview.question_engine import QuestionEngine, role_key, target_difficulty
from app.db.models.interview import InterviewConfigRequest
from app.core.interview.report_generator import build_report
from app.core.mentor.indexer import index_session_report
from app.db.repositories.interview_repo import InterviewRepository, as_utc, utcnow
from app.db.repositories.question_repo import QuestionRepository
from app.gateway import AIGateway
from app.gateway.types import CallContext
from app.utils.exceptions import AppError, NotFoundError
from app.utils.logging import bind_context, log_event

log = logging.getLogger(__name__)

Emit = Callable[[dict], Awaitable[None]]

STALE_EVALUATION = timedelta(minutes=2)
# Roughly one evaluation plus one generated question. Below this, wrap up instead of asking again.
QUESTION_TOKEN_RESERVE = 4_000

# States (architecture.md §8.2). The engine walks a subset of them until the state machine (1.3) lands.
SETUP, WAITING, EVALUATING, NEXT_TOPIC = "SETUP", "WAITING_FOR_RESPONSE", "EVALUATING", "NEXT_TOPIC"
COMPLETE, GENERATING_REPORT, REPORT_READY = "INTERVIEW_COMPLETE", "GENERATING_REPORT", "REPORT_READY"


def event(type_: str, state: str, /, **payload) -> dict:
    """{type, state, payload}. Positional-only so a payload may carry its own `state` (SESSION_SNAPSHOT)."""
    return {"type": type_, "state": state, "payload": payload}


def _evaluation_view(evaluation: dict) -> dict:
    keys = ("question_id", "overall_score", "dimensions", "performance_tier", "strengths", "weaknesses",
            "feedback", "suggestion", "model_answer_outline")
    return {k: evaluation.get(k) for k in keys}


class InterviewEngine:
    def __init__(self, *, repo: InterviewRepository, question_bank: QuestionRepository, gateway: AIGateway,
                 rag=None, max_answer_chars: int = 5_000, question_token_reserve: int = QUESTION_TOKEN_RESERVE):
        self.repo = repo
        self.question_bank = question_bank
        self.questions = QuestionEngine(bank=question_bank, repo=repo, gateway=gateway)
        self.gateway = gateway
        self.question_token_reserve = question_token_reserve
        self.rag = rag
        self.max_answer_chars = max_answer_chars

    # ── session lifecycle ────────────────────────────────────────────────────
    @staticmethod
    def resolve_config(request: InterviewConfigRequest, profile: dict) -> dict:
        """The stored config: the request's choices, with the profile filling anything left out."""
        role = request.role or profile["target"]["role"]
        return {
            "interview_type": request.interview_type,
            "interview_mode": request.interview_mode,
            "role": role,
            "role_key": role_key(role),
            "experience_level": request.experience_level or profile["personal"]["experience_level"],
            "company": request.company or profile["target"].get("company"),
            "difficulty": request.difficulty or profile.get("preferences", {}).get("preferred_difficulty", "adaptive"),
            "question_count": request.question_count,
            "input_mode": request.input_mode,
            "output_mode": request.output_mode,
        }

    async def create_session(self, *, candidate_id: str, profile: dict, request: InterviewConfigRequest) -> dict:
        now = utcnow()
        config = self.resolve_config(request, profile)
        session = {
            "session_id": uuid.uuid4().hex,
            "candidate_id": candidate_id,
            "config": config,
            # "adaptive" starts from the experience level; the adaptation engine (1.8) moves it per answer.
            "target_difficulty": target_difficulty(config["difficulty"], config["experience_level"]),
            "focus_topics": request.focus_topics,
            "state": SETUP,
            "current_topic": None,
            "topics_covered": [],
            "questions_asked": 0,
            "current_question_id": None,
            "asked_question_ids": [],
            "started_at": now,
            "updated_at": now,
            "completed_at": None,
            "report_id": None,
            "tokens_used": 0,
        }
        await self.repo.create_session(session)
        log_event(log, "session_created", session_id=session["session_id"])
        return session

    async def get_owned_session(self, session_id: str, candidate_id: str) -> dict:
        session = await self.repo.get_session(session_id)
        if session is None or session["candidate_id"] != candidate_id:
            raise NotFoundError("Interview session not found", code="session_not_found")
        return session

    async def transcript(self, session_id: str, *, include_evaluations: bool) -> list[dict]:
        questions = await self.repo.session_questions(session_id)
        answers = await self.repo.session_answers(session_id)
        evaluations = {e["answer_id"]: e for e in await self.repo.session_evaluations(session_id)} if include_evaluations else {}
        entries = []
        for q in questions:
            entries.append({"role": "interviewer", "question_id": q["question_id"], "content": q["interviewer_message"]})
            for a in (a for a in answers if a["question_id"] == q["question_id"]):
                entries.append({"role": "candidate", "question_id": q["question_id"], "content": a["answer_text"]})
                if a["answer_id"] in evaluations:
                    entries.append({"role": "evaluation", "question_id": q["question_id"],
                                    "evaluation": _evaluation_view(evaluations[a["answer_id"]])})
        return entries

    async def snapshot(self, session: dict) -> dict:
        """Everything the UI needs to rebuild the room after a (re)connect (SESSION_SNAPSHOT).
        Serious mode keeps evaluations hidden until the report is ready."""
        session_id = session["session_id"]
        reveal = session["config"]["interview_mode"] == "practice" or session["state"] == REPORT_READY
        transcript = await self.transcript(session_id, include_evaluations=reveal)
        questions = await self.repo.session_questions(session_id)
        current = next((q for q in questions if q["question_id"] == session.get("current_question_id")), None)
        return {
            "session_id": session_id,
            "state": session["state"],
            "config": session["config"],
            "focus_topics": session.get("focus_topics", []),
            "current_question": self._question_view(current) if current and session["state"] in (WAITING, EVALUATING) else None,
            "transcript": transcript,
            "report_id": session.get("report_id"),
            "questions_asked": session["questions_asked"],
            "total_questions": session["config"]["question_count"],
        }

    async def start(self, session: dict, emit: Emit) -> dict:
        """Called on every WebSocket connect, after SESSION_SNAPSHOT. Moves the session forward if needed."""
        bind_context(session_id=session["session_id"])
        state = session["state"]
        if state in (SETUP, NEXT_TOPIC):  # NEXT_TOPIC here means the server stopped between two questions
            return await self._ask_next_question(session, emit)
        if state == EVALUATING and utcnow() - as_utc(session["updated_at"]) > STALE_EVALUATION:
            # The server died mid-evaluation: let the candidate resubmit instead of hanging forever.
            session = await self.repo.transition(session["session_id"], from_states=[EVALUATING], to_state=WAITING) or session
        if state in (COMPLETE, GENERATING_REPORT) and not session.get("report_id"):
            session = await self._finish(session, emit)
        return session

    # ── the turn ─────────────────────────────────────────────────────────────
    async def handle_answer(self, session_id: str, candidate_id: str, answer_text: str, emit: Emit) -> None:
        answer_text = (answer_text or "").strip()
        session = await self.get_owned_session(session_id, candidate_id)
        if not answer_text:
            await emit(event("ERROR", session["state"], code="answer_empty", message="Type an answer before submitting."))
            return
        if len(answer_text) > self.max_answer_chars:
            await emit(event("ERROR", session["state"], code="answer_too_long",
                             message=f"Answers are limited to {self.max_answer_chars} characters."))
            return

        session = await self.repo.transition(session_id, from_states=[WAITING], to_state=EVALUATING)
        if session is None:
            current = await self.repo.get_session(session_id)
            await emit(event("ERROR", current["state"], code="not_accepting_answers",
                             message="This question isn't waiting for an answer right now."))
            return

        question = await self.repo.get_question(session["current_question_id"])
        answer = await self.repo.add_answer({
            "answer_id": uuid.uuid4().hex, "session_id": session_id, "question_id": question["question_id"],
            "candidate_id": candidate_id, "answer_text": answer_text, "answer_type": "text", "submitted_at": utcnow(),
        })
        practice = session["config"]["interview_mode"] == "practice"
        await emit(event("PROCESSING", EVALUATING,
                         message="Evaluating your answer…" if practice else "Answer recorded. Preparing the next step…"))

        context = CallContext(session_id=session_id, candidate_id=candidate_id)
        try:
            result = await evaluate_answer(self.gateway, question=question, answer_text=answer_text,
                                           profile={"target": {"role": session["config"]["role"]},
                                                    "personal": {"experience_level": session["config"]["experience_level"]}},
                                           context=context)
        except AppError as exc:
            await self.repo.transition(session_id, from_states=[EVALUATING], to_state=WAITING)
            await emit(event("ERROR", WAITING, code=exc.code, message=exc.message, retryable=True))
            return

        evaluation = await self.repo.add_evaluation({
            "evaluation_id": uuid.uuid4().hex, "session_id": session_id, "question_id": question["question_id"],
            "answer_id": answer["answer_id"], "candidate_id": candidate_id, "evaluation_type": "technical",
            "overall_score": result["overall_score"], "dimensions": result["dimensions"],
            "performance_tier": result["performance_tier"], "strengths": result["strengths"],
            "weaknesses": result["weaknesses"], "feedback": result["feedback"], "suggestion": result["suggestion"],
            "recommendations": [result["suggestion"]], "model_answer_outline": result["model_answer_outline"],
            "prompt_version_used": result["prompt_version"], "model_used": getattr(self.gateway, "models", {}).get("fast", "fake"),
            "latency_ms": result["latency_ms"], "evaluated_at": utcnow(),
        })
        topics_covered = list(dict.fromkeys([*session.get("topics_covered", []), question["topic"]]))
        session = await self.repo.update_session(session_id, {"tokens_used": self.gateway.tokens_used(session_id),
                                                              "topics_covered": topics_covered})
        if practice:  # serious mode: scores stay hidden until the report
            await emit(event("EVALUATION", EVALUATING, **_evaluation_view(evaluation)))

        if self._should_wrap_up(session):
            await self._complete(session_id, emit)
            return
        session = await self.repo.transition(session_id, from_states=[EVALUATING], to_state=NEXT_TOPIC)
        if session is not None:
            await self._ask_next_question(session, emit)

    # ── internals ────────────────────────────────────────────────────────────
    def _should_wrap_up(self, session: dict) -> bool:
        """Thin stand-in for AdaptationEngine._should_wrap_up (1.8): question count, then token budget."""
        if session["questions_asked"] >= session["config"]["question_count"]:
            return True
        remaining = self.gateway.budget_remaining(session["session_id"])
        if remaining < self.question_token_reserve:
            log_event(log, "wrap_up_token_budget", session_id=session["session_id"], budget_remaining=remaining)
            return True
        return False

    async def _complete(self, session_id: str, emit: Emit) -> dict | None:
        session = await self.repo.transition(session_id, from_states=[EVALUATING, NEXT_TOPIC], to_state=COMPLETE,
                                             extra={"completed_at": utcnow()})
        return await self._finish(session, emit) if session else None

    async def _resend_current_question(self, session_id: str, emit: Emit) -> dict:
        """Another connection asked already (or is asking): re-send the current question to this client."""
        current = await self.repo.get_session(session_id)
        existing = await self.repo.get_question(current["current_question_id"]) if current.get("current_question_id") else None
        if existing and current["state"] in (WAITING, EVALUATING):
            await emit(event("QUESTION", current["state"], **self._question_view(existing), is_follow_up=False,
                             question_number=current["questions_asked"],
                             total_questions=current["config"]["question_count"]))
        return current

    async def _ask_next_question(self, session: dict, emit: Emit) -> dict:
        session_id = session["session_id"]
        context = CallContext(session_id=session_id, candidate_id=session["candidate_id"])
        try:
            picked = await self.questions.next_question(session, context=context)
        except AppError as exc:
            log_event(log, "question_unavailable", level=logging.WARNING, session_id=session_id, code=exc.code)
            if session["questions_asked"] > 0:
                # Mid-interview: finish with the answers we have rather than leaving the candidate stuck.
                return await self._complete(session_id, emit) or session
            await emit(event("ERROR", session["state"], code="question_unavailable", retryable=False,
                             message="Couldn't prepare a question right now. Reload the page to try again."))
            return session

        question_id = uuid.uuid4().hex
        number = session["questions_asked"] + 1
        # Claim the transition before writing the question, so two connections racing on the same
        # session can't both ask. The loser re-sends whatever the winner asked.
        claimed = await self.repo.transition(
            session_id, from_states=[SETUP, NEXT_TOPIC], to_state=WAITING,
            extra={"current_question_id": question_id, "questions_asked": number, "current_topic": picked["topic"],
                   "asked_question_ids": [*session["asked_question_ids"], picked["question_id"]]})
        if claimed is None:
            return await self._resend_current_question(session_id, emit)

        # The interviewer agent (1.6) will phrase questions conversationally; for now the question text is used as is.
        lead = "Let's begin." if number == 1 else f"Question {number}."
        question = await self.repo.add_question({
            "question_id": question_id, "session_id": session_id, "candidate_id": session["candidate_id"],
            "source": picked["source"],
            "bank_question_id": picked["question_id"] if picked["source"] == "bank" else None,
            "generated_question_id": picked["question_id"] if picked["source"] != "bank" else None,
            "topic": picked["topic"], "subtopic": picked.get("subtopic", ""), "difficulty": picked["difficulty"],
            "question_text": picked["question_text"], "expected_concepts": picked.get("expected_concepts", []),
            "evaluation_rubric": picked.get("evaluation_rubric", {}),
            "follow_up_possibilities": picked.get("follow_up_possibilities", []), "is_follow_up": False,
            "interviewer_message": f"{lead} {picked['question_text']}",
            "question_number": number, "asked_at": utcnow(),
            "prompt_version_used": context.prompt_version,
        })
        await emit(event("QUESTION", WAITING, **self._question_view(question), is_follow_up=False,
                         question_number=number, total_questions=claimed["config"]["question_count"]))
        return claimed

    async def _finish(self, session: dict, emit: Emit) -> dict:
        session_id = session["session_id"]
        claimed = await self.repo.transition(session_id, from_states=[COMPLETE, GENERATING_REPORT], to_state=GENERATING_REPORT)
        if claimed is None:
            return session
        report = build_report(claimed, await self.repo.session_questions(session_id), await self.repo.session_evaluations(session_id))
        try:
            await self.repo.save_report(report)
        except DuplicateKeyError:  # a concurrent reconnect already wrote this session's report
            return await self.repo.get_session(session_id)
        session = await self.repo.transition(session_id, from_states=[GENERATING_REPORT], to_state=REPORT_READY,
                                             extra={"report_id": report["report_id"]})
        await emit(event("INTERVIEW_COMPLETE", REPORT_READY, report_id=report["report_id"]))
        # After the candidate has their result: index for the Mentor. Failures are logged, not raised.
        await index_session_report(self.rag, self.repo, report)
        return session

    @staticmethod
    def _question_view(question: dict) -> dict:
        return {"question_id": question["question_id"], "text": question["interviewer_message"],
                "topic": question["topic"], "difficulty": question["difficulty"]}
