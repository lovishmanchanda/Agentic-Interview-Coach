"""Interview engine.

Every state change goes through InterviewStateMachine (state_machine.py). One turn:

    INTRODUCTION/NEXT_TOPIC  pick a question (QuestionEngine: bank first, LLM on a miss)
    → QUESTION → WAITING_FOR_RESPONSE   QUESTION event
    → EVALUATING                         ANSWER received, Groq evaluates (fast tier)
    → FOLLOW_UP_DECISION                 EVALUATION event (practice); AdaptationEngine decides:
    → QUESTION (follow-up on a partial answer) | NEXT_TOPIC (difficulty adjusted) | INTERVIEW_COMPLETE
    → GENERATING_REPORT → REPORT_READY → index for the Mentor

`_drive()` moves a session forward from whatever state it is in, so the same code serves the first
connect, a reconnect, and a turn in progress. State lives in the database: if the browser goes away,
the engine still finishes its step, and the next connect picks up from there.

The interviewer agent (app/agents/interview_agent.py) writes the opening, the transitions, the follow-ups
and the closing line, and proposes each move; the engine checks every proposal and falls back to the
AdaptationEngine. The report's numbers are computed; its words are written by Groq (report_generator.py),
with a deterministic fallback. Events follow architecture.md §13 and go
through an `emit` callback, so the WebSocket handler and the tests drive the engine the same way.
"""
import logging
import uuid
from collections.abc import Awaitable, Callable
from datetime import timedelta

import anyio

from pymongo.errors import DuplicateKeyError

from app.core.evaluation.answer_evaluator import evaluate_answer
from app.agents.interview_agent import InterviewAgent
from app.agents.interview_agent_schemas import ACTION_TO_ADAPTATION
from app.core.interview.adaptation_engine import action_for_choice, allowed_actions, decide_next_action, update_performance
from app.core.interview.question_engine import QuestionEngine, role_key, target_difficulty
from app.db.models.interview import InterviewConfigRequest
from app.core.interview.report_generator import apply_narrative, build_report, write_narrative
from app.core.interview.state_machine import DRIVEN, SETTLED, WORKING, InterviewStateMachine, State, next_state_for_action
from app.core.mentor.indexer import index_session_report
from app.db.repositories.interview_repo import InterviewRepository, as_utc, utcnow
from app.db.repositories.question_repo import QuestionRepository
from app.gateway import AIGateway
from app.gateway.types import CallContext
from app.utils.exceptions import AppError, NotFoundError
from app.utils.logging import bind_context, log_event

log = logging.getLogger(__name__)

Emit = Callable[[dict], Awaitable[None]]

# WORKING states older than this are presumed abandoned (worker crashed) and taken over. Longer than a
# slow Groq call (60 s timeout, retried).
STALE_WORK = timedelta(minutes=2)
RESYNC_POLL_S = 0.25
# DRIVEN steps that make an LLM call (picking or writing a question, the interviewer agent's decision). A
# connection that finds one of these already under way waits for it instead of redoing it (and paying for
# the LLM call twice), unless it has been sitting there longer than this.
SLOW_DRIVEN_STALE = timedelta(seconds=20)
MAX_HINTS_PER_QUESTION = 1  # practice mode only
# Roughly one evaluation plus one generated question. Below this, wrap up instead of asking again.
QUESTION_TOKEN_RESERVE = 4_000

SETUP, INTRODUCTION, QUESTION = State.SETUP, State.INTRODUCTION, State.QUESTION
WAITING, EVALUATING, DECIDING = State.WAITING_FOR_RESPONSE, State.EVALUATING, State.FOLLOW_UP_DECISION
NEXT_TOPIC, COMPLETE = State.NEXT_TOPIC, State.INTERVIEW_COMPLETE
GENERATING_REPORT, REPORT_READY = State.GENERATING_REPORT, State.REPORT_READY
SLOW_DRIVEN = frozenset({INTRODUCTION, NEXT_TOPIC, DECIDING})


def event(type_: str, state: str, /, **payload) -> dict:
    """{type, state, payload}. Positional-only so a payload may carry its own `state` (SESSION_SNAPSHOT)."""
    return {"type": type_, "state": state, "payload": payload}


SUGGESTED_SECONDS = {"technical": 180, "behavioral": 240}


def suggested_seconds(question: dict) -> int:
    """A guide for the room's timer, not a limit: ~3 min technical, ~4 min behavioral (a STAR story), +1 min
    for hard questions, 2 min for a follow-up."""
    if question.get("is_follow_up"):
        return 120
    base = SUGGESTED_SECONDS.get(question.get("type", "technical"), 180)
    return base + (60 if question.get("difficulty") == "hard" else 0)


def fallback_hint(question: dict, draft_text: str = "") -> str:
    """A deterministic nudge: the first expected concept the draft doesn't mention yet."""
    draft = draft_text.lower()
    for concept in question.get("expected_concepts") or []:
        words = [w for w in concept.lower().replace("/", " ").split() if len(w) > 3] or [concept.lower()]
        if not any(w in draft for w in words):
            return f"Think about {concept} and how it applies here."
    return "Try walking through a small, concrete example step by step."


def _evaluation_view(evaluation: dict) -> dict:
    keys = ("question_id", "overall_score", "dimensions", "performance_tier", "strengths", "weaknesses",
            "feedback", "suggestion", "model_answer_outline")
    return {k: evaluation.get(k) for k in keys}


class InterviewEngine:
    def __init__(self, *, repo: InterviewRepository, question_bank: QuestionRepository, gateway: AIGateway,
                 rag=None, max_answer_chars: int = 5_000, question_token_reserve: int = QUESTION_TOKEN_RESERVE,
                 stale_work: timedelta = STALE_WORK, follow_ups: bool = True, agent: InterviewAgent | None = None,
                 report_writer: bool = True):
        self.repo = repo
        self.report_writer = report_writer
        self.follow_ups = follow_ups
        self.agent = agent
        self.sm = InterviewStateMachine(repo)
        self.stale_work = stale_work
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
            "candidate_name": profile.get("personal", {}).get("name"),
            "config": config,
            # "adaptive" starts from the experience level; the adaptation engine (1.8) moves it per answer.
            "target_difficulty": target_difficulty(config["difficulty"], config["experience_level"]),
            "focus_topics": request.focus_topics,
            "state": SETUP,
            "state_history": [{"state": SETUP, "at": now}],
            "current_topic": None,
            "topics_covered": [],
            "questions_asked": 0,          # main questions; follow-ups are counted separately
            "follow_ups_asked": 0,
            "asked_follow_ups": [],
            "performance_vector": {},      # {topic: {"mean": score, "n": answers}}
            "last_decision": None,         # the latest NextAction and who chose it, for /state and debugging
            "closing_message": None,       # the interviewer's closing line, once the interview is over
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

    async def transcript(self, session_id: str, *, include_evaluations: bool, closing_message: str | None = None) -> list[dict]:
        questions = await self.repo.session_questions(session_id)
        answers = await self.repo.session_answers(session_id)
        evaluations = {e["answer_id"]: e for e in await self.repo.session_evaluations(session_id)} if include_evaluations else {}
        entries = []
        for q in questions:
            entries.append({"role": "interviewer", "question_id": q["question_id"], "content": q["interviewer_message"],
                            "is_follow_up": q.get("is_follow_up", False)})
            entries.extend({"role": "hint", "question_id": q["question_id"], "content": h["text"]}
                           for h in q.get("hints") or [])
            for a in (a for a in answers if a["question_id"] == q["question_id"]):
                entries.append({"role": "candidate", "question_id": q["question_id"], "content": a["answer_text"]})
                if a["answer_id"] in evaluations:
                    entries.append({"role": "evaluation", "question_id": q["question_id"],
                                    "evaluation": _evaluation_view(evaluations[a["answer_id"]])})
        if closing_message:
            entries.append({"role": "interviewer", "question_id": None, "content": closing_message, "is_closing": True})
        return entries

    async def snapshot(self, session: dict) -> dict:
        """Everything the UI needs to rebuild the room after a (re)connect (SESSION_SNAPSHOT).
        Serious mode keeps evaluations hidden until the report is ready."""
        session_id = session["session_id"]
        reveal = session["config"]["interview_mode"] == "practice" or session["state"] == REPORT_READY
        transcript = await self.transcript(session_id, include_evaluations=reveal,
                                           closing_message=session.get("closing_message"))
        questions = await self.repo.session_questions(session_id)
        current = next((q for q in questions if q["question_id"] == session.get("current_question_id")), None)
        return {
            "session_id": session_id,
            "state": session["state"],
            "config": session["config"],
            "focus_topics": session.get("focus_topics", []),
            "current_question": self._question_view(current, session) if current and session["state"] in (WAITING, EVALUATING) else None,
            "draft_answer": self._draft_for(session),
            "transcript": transcript,
            "report_id": session.get("report_id"),
            "questions_asked": session["questions_asked"],
            "total_questions": session["config"]["question_count"],
            "started_at": as_utc(session["started_at"]).isoformat(),
            "server_time": utcnow().isoformat(),  # lets the client correct its clock for the timers
        }

    async def start(self, session: dict, emit: Emit) -> dict:
        """Called on every WebSocket connect, after SESSION_SNAPSHOT. A slow step another connection started
        moments ago (e.g. React's double mount in development, or a reload mid-step) is left to it."""
        bind_context(session_id=session["session_id"])
        if session["state"] in SLOW_DRIVEN and not self._is_stale(session) and not session.get("stalled"):
            return await self._wait_and_resync(session["session_id"], emit)
        return await self._drive(session, emit)

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

        session = await self.sm.transition(session_id, WAITING, EVALUATING, extra={"draft_answer": None})
        if session is None:
            current = await self.repo.get_session(session_id)
            await emit(event("ERROR", current["state"], code="not_accepting_answers",
                             message="This question isn't waiting for an answer right now."))
            return

        question = await self.repo.get_question(session["current_question_id"])
        answer = await self.repo.add_answer({
            "answer_id": uuid.uuid4().hex, "session_id": session_id, "question_id": question["question_id"],
            "candidate_id": candidate_id, "answer_text": answer_text, "answer_type": "text", "submitted_at": (now := utcnow()),
            "time_taken_s": round((now - as_utc(question["asked_at"])).total_seconds()) if question.get("asked_at") else None,
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
            await self.sm.transition(session_id, EVALUATING, WAITING)
            await emit(event("ERROR", WAITING, code=exc.code, message=exc.message, retryable=True))
            return

        evaluation = await self.repo.add_evaluation({
            "evaluation_id": uuid.uuid4().hex, "session_id": session_id, "question_id": question["question_id"],
            "answer_id": answer["answer_id"], "candidate_id": candidate_id, "evaluation_type": result["evaluation_type"],
            "overall_score": result["overall_score"], "dimensions": result["dimensions"],
            "performance_tier": result["performance_tier"], "strengths": result["strengths"],
            "weaknesses": result["weaknesses"], "feedback": result["feedback"], "suggestion": result["suggestion"],
            "recommendations": [result["suggestion"]], "model_answer_outline": result["model_answer_outline"],
            "prompt_version_used": result["prompt_version"], "model_used": getattr(self.gateway, "models", {}).get("fast", "fake"),
            "latency_ms": result["latency_ms"], "evaluated_at": utcnow(),
        })
        session = await self.sm.transition(session_id, EVALUATING, DECIDING, extra={
            "tokens_used": self.gateway.tokens_used(session_id),
            "topics_covered": list(dict.fromkeys([*session.get("topics_covered", []), question["topic"]])),
            "performance_vector": update_performance(session.get("performance_vector") or {}, question["topic"],
                                                     result["overall_score"]),
            "interviewer_context": {"last_performance_tier": result["performance_tier"]},
        })
        if session is None:  # the evaluation went stale and another connection reopened the question
            return
        if practice:  # serious mode: scores stay hidden until the report
            await emit(event("EVALUATION", DECIDING, **_evaluation_view(evaluation)))
        await self._drive(session, emit)

    async def save_draft(self, session_id: str, candidate_id: str, text: str) -> None:
        """ANSWER_DRAFT: autosave, so a reload or dropped connection doesn't lose a half-written answer.
        Silently ignored when no question is waiting (e.g. a late save after submitting)."""
        session = await self.get_owned_session(session_id, candidate_id)
        if session["state"] == WAITING and session.get("current_question_id"):
            await self.repo.save_draft(session_id, session["current_question_id"], text[:self.max_answer_chars])

    async def handle_hint_request(self, session_id: str, candidate_id: str, draft_text: str, emit: Emit) -> None:
        """HINT_REQUEST (practice mode): one nudge per question, never the answer. The interviewer agent writes
        it from the question's concepts and what the candidate has written so far; without the agent (or if
        it fails) the hint points at a concept the draft hasn't touched yet."""
        session = await self.get_owned_session(session_id, candidate_id)
        if session["config"]["interview_mode"] != "practice":
            await emit(event("ERROR", session["state"], code="hints_unavailable",
                             message="Hints are only available in practice mode."))
            return
        if session["state"] != WAITING:
            await emit(event("ERROR", session["state"], code="no_active_question",
                             message="There's no question waiting for an answer right now."))
            return
        question = await self.repo.get_question(session["current_question_id"])
        if len(question.get("hints") or []) >= MAX_HINTS_PER_QUESTION:
            await emit(event("ERROR", session["state"], code="hint_limit_reached",
                             message="You've already had the hint for this question."))
            return
        text = await self.agent.hint(session, question, draft_text) if self.agent else None
        source = "agent" if text else "fallback"
        text = text or fallback_hint(question, draft_text)
        if not await self.repo.push_hint(question["question_id"], {"text": text, "source": source, "at": utcnow()},
                                         max_hints=MAX_HINTS_PER_QUESTION):
            await emit(event("ERROR", session["state"], code="hint_limit_reached",
                             message="You've already had the hint for this question."))
            return
        used = len(question.get("hints") or []) + 1
        log_event(log, "hint_given", session_id=session_id, question_id=question["question_id"], source=source)
        await emit(event("HINT", WAITING, question_id=question["question_id"], text=text,
                         hints_left=max(0, MAX_HINTS_PER_QUESTION - used)))

    # ── moving the session forward ───────────────────────────────────────────
    async def _drive(self, session: dict, emit: Emit) -> dict:
        """Take the session forward from its current state until it rests (waiting for an answer, or the
        report is ready) or can't go further. If another connection is doing the work, wait for it and
        re-sync this client with a fresh snapshot."""
        session_id = session["session_id"]
        for _ in range(len(State) * 2):  # every step changes state, so this bound is never reached normally
            state = session["state"]
            if state in SETTLED:
                return session
            if state in WORKING:
                if not self._is_stale(session):
                    return await self._wait_and_resync(session_id, emit)
                moved = await self._take_over(session, emit)
            elif state == SETUP:
                moved = await self.sm.transition(session_id, SETUP, INTRODUCTION)
            elif state in (INTRODUCTION, NEXT_TOPIC):
                moved = await self._ask_next_question(session, emit)
            elif state == QUESTION:
                moved = await self._deliver_question(session, emit)
            elif state == DECIDING:
                moved = await self._decide(session)
            elif state == COMPLETE:
                moved = await self._finish(session, emit)
            else:  # pragma: no cover -- every State is SETTLED, WORKING or DRIVEN
                raise AssertionError(f"unhandled state {state}")
            if moved is None:  # lost a race: another connection made this move
                return await self._wait_and_resync(session_id, emit)
            if moved["state"] == state:  # couldn't progress (e.g. no first question); stop here
                return moved
            session = moved
        log_event(log, "drive_loop_limit", level=logging.ERROR, session_id=session_id, state=session["state"])
        return session

    def _is_stale(self, session: dict) -> bool:
        """Presumed abandoned: WORKING states after `stale_work`, slow DRIVEN steps sooner (they're short)."""
        limit = min(self.stale_work, SLOW_DRIVEN_STALE) if session["state"] in SLOW_DRIVEN else self.stale_work
        return utcnow() - as_utc(session["updated_at"]) > limit

    async def _wait_and_resync(self, session_id: str, emit: Emit) -> dict:
        """Another worker owns the current step. Wait until the session rests (or its work goes stale),
        then send this client a fresh SESSION_SNAPSHOT so it shows exactly what the other worker did."""
        with anyio.move_on_after(self.stale_work.total_seconds() + 5):
            while True:
                session = await self.repo.get_session(session_id)
                if session["state"] in SETTLED:
                    break
                if session["state"] in WORKING and self._is_stale(session):
                    return await self._drive(session, emit)
                if session["state"] in DRIVEN and self._is_stale(session):
                    return await self._drive(session, emit)  # its worker died between two steps
                await anyio.sleep(RESYNC_POLL_S)
        session = await self.repo.get_session(session_id)
        await emit(event("SESSION_SNAPSHOT", session["state"], **await self.snapshot(session)))
        return session

    async def _take_over(self, session: dict, emit: Emit) -> dict | None:
        """A WORKING state whose worker died."""
        session_id = session["session_id"]
        log_event(log, "stale_work_taken_over", level=logging.WARNING, session_id=session_id, state=session["state"])
        if session["state"] == EVALUATING:
            # Let the candidate resubmit rather than hang. (The answer is kept in the transcript.)
            moved = await self.sm.transition(session_id, EVALUATING, WAITING)
            if moved is not None:
                await emit(event("ERROR", WAITING, code="evaluation_interrupted", retryable=True,
                                 message="Evaluating your last answer was interrupted."))
            return moved
        return await self._generate_report(session, emit)

    async def _decide(self, session: dict) -> dict | None:
        """FOLLOW_UP_DECISION. The interviewer agent proposes the move and writes what to say; the engine only
        offers it the moves its rules allow, checks the proposal against the state machine, and falls back to
        the AdaptationEngine if the agent is off, fails, or proposes something invalid twice. Difficulty and
        drill topics always follow the AdaptationEngine."""
        session_id = session["session_id"]
        question = await self.repo.get_question(session["current_question_id"])
        evaluation = await self.repo.latest_evaluation(session_id, question["question_id"])
        budget = self.gateway.budget_remaining(session_id)
        decision = decide_next_action(evaluation, question, session, budget_remaining=budget,
                                      token_reserve=self.question_token_reserve, follow_ups_enabled=self.follow_ups)
        decided_by, lead_in, agent_outcome, follow_up_points = "adaptation", "", None, []
        if self.agent is not None:
            allowed = allowed_actions(question, session, budget_remaining=budget,
                                      token_reserve=self.question_token_reserve, follow_ups_enabled=self.follow_ups)
            answer = await self.repo.get_answer(evaluation["answer_id"])
            run = await self.agent.decide(session=session, question=question, answer_text=answer["answer_text"],
                                          evaluation=evaluation, allowed=allowed, recommended=decision.action)
            agent_outcome = run.outcome
            if run.decision is not None:
                decided_by, lead_in = "agent", run.decision.lead_in
                follow_up_points = run.decision.follow_up_expected_points
                decision = action_for_choice(ACTION_TO_ADAPTATION[run.decision.action], evaluation, session,
                                             reason=f"interviewer agent chose {run.decision.action}",
                                             follow_up_text=run.decision.follow_up_question)
        target = next_state_for_action(DECIDING, decision.agent_action)  # the engine's own check, whoever chose
        extra = {"target_difficulty": decision.target_difficulty,
                 "last_decision": {**decision.as_record(), "lead_in": lead_in, "decided_by": decided_by,
                                   "agent_outcome": agent_outcome, "question_id": question["question_id"], "at": utcnow()}}
        log_event(log, "adaptation_decision", session_id=session_id, action=decision.action, reason=decision.reason,
                  target_difficulty=decision.target_difficulty, decided_by=decided_by)
        if target == QUESTION:
            return await self._ask_follow_up(session, question, decision.follow_up_text, extra, lead_in=lead_in,
                                             expected_points=follow_up_points)
        if target == COMPLETE:
            extra["completed_at"] = utcnow()
            extra["closing_message"] = lead_in or None
        return await self.sm.transition(session_id, DECIDING, target, extra=extra)

    async def _ask_follow_up(self, session: dict, parent: dict, text: str, extra: dict, *, lead_in: str = "",
                             expected_points: list[str] | None = None) -> dict | None:
        """FOLLOW_UP_DECISION → QUESTION with a follow-up on the same topic. It doesn't count towards
        `question_count`. It is graded against the points the agent gave for it, or, for a canned bank
        follow-up, against the parent question's concepts and rubric."""
        follow_up = await self.repo.add_question({
            "question_id": uuid.uuid4().hex, "session_id": session["session_id"], "candidate_id": session["candidate_id"],
            "source": "follow_up", "type": parent.get("type", "technical"), "parent_question_id": parent["question_id"],
            "bank_question_id": None, "generated_question_id": None,
            "topic": parent["topic"], "subtopic": parent.get("subtopic", ""), "difficulty": parent["difficulty"],
            "question_text": text, "expected_concepts": expected_points or parent.get("expected_concepts", []),
            "evaluation_rubric": {} if expected_points else parent.get("evaluation_rubric", {}),
            "follow_up_possibilities": [],
            "is_follow_up": True,
            # The agent's follow-up comes with its own lead-in; the bank's canned ones get a plain label.
            "interviewer_message": f"{lead_in} {text}".strip() if lead_in else f"Follow-up: {text}",
            "question_number": session["questions_asked"], "asked_at": utcnow(),
            "prompt_version_used": "interviewer/interviewer_v1" if extra["last_decision"]["decided_by"] == "agent" else None,
        })
        claimed = await self.sm.transition(session["session_id"], DECIDING, QUESTION, extra={
            **extra, "current_question_id": follow_up["question_id"],
            "follow_ups_asked": session.get("follow_ups_asked", 0) + 1,
            "asked_follow_ups": [*session.get("asked_follow_ups", []), text]})
        if claimed is None:
            await self.repo.delete_question(follow_up["question_id"])
        return claimed

    async def _ask_next_question(self, session: dict, emit: Emit) -> dict | None:
        """INTRODUCTION / NEXT_TOPIC → QUESTION."""
        session_id = session["session_id"]
        context = CallContext(session_id=session_id, candidate_id=session["candidate_id"])
        try:
            picked = await self.questions.next_question(session, context=context)
        except AppError as exc:
            log_event(log, "question_unavailable", level=logging.WARNING, session_id=session_id, code=exc.code)
            if session["state"] == NEXT_TOPIC:
                # Mid-interview: finish with the answers we have rather than leaving the candidate stuck.
                return await self.sm.transition(session_id, NEXT_TOPIC, COMPLETE, extra={"completed_at": utcnow()})
            await emit(event("ERROR", session["state"], code="question_unavailable", retryable=False,
                             message="Couldn't prepare a question right now. Reload the page to try again."))
            # No progress, and nobody is working on it: the reload should retry at once, not wait for it.
            return await self.repo.update_session(session_id, {"stalled": True}) or session

        number = session["questions_asked"] + 1
        # The question text is always shown word for word (it's what the evaluator grades); the interviewer
        # agent writes what comes before it: the opening for the first question, else the transition it chose.
        if session["state"] == INTRODUCTION:
            lead = (await self.agent.opening(session) if self.agent else None) or "Let's begin."
        else:
            lead = (session.get("last_decision") or {}).get("lead_in") or f"Question {number}."
        question = await self.repo.add_question({
            "question_id": uuid.uuid4().hex, "session_id": session_id, "candidate_id": session["candidate_id"],
            "source": picked["source"], "type": picked.get("type", "technical"),
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
        # The question is written first so QUESTION always points at a stored question; if another
        # connection claims the move first, this one is discarded.
        claimed = await self.sm.transition(session_id, session["state"], QUESTION, extra={
            "current_question_id": question["question_id"], "questions_asked": number, "current_topic": picked["topic"],
            "stalled": False,
            "asked_question_ids": [*session["asked_question_ids"], picked["question_id"]]})
        if claimed is None:
            await self.repo.delete_question(question["question_id"])
        return claimed

    async def _deliver_question(self, session: dict, emit: Emit) -> dict | None:
        """QUESTION → WAITING_FOR_RESPONSE, and send it."""
        moved = await self.sm.transition(session["session_id"], QUESTION, WAITING)
        if moved is not None:
            question = await self.repo.get_question(moved["current_question_id"])
            await emit(event("QUESTION", WAITING, **self._question_view(question, moved),
                             question_number=moved["questions_asked"], total_questions=moved["config"]["question_count"],
                             server_time=utcnow().isoformat()))
        return moved

    async def _finish(self, session: dict, emit: Emit) -> dict | None:
        """INTERVIEW_COMPLETE → GENERATING_REPORT, then the report."""
        claimed = await self.sm.transition(session["session_id"], COMPLETE, GENERATING_REPORT)
        return await self._generate_report(claimed, emit) if claimed else None

    async def _generate_report(self, session: dict, emit: Emit) -> dict | None:
        """GENERATING_REPORT → REPORT_READY. Also the take-over path, so it tolerates a report that a
        crashed worker already saved (one report per session is enforced by a unique index)."""
        session_id = session["session_id"]
        questions = await self.repo.session_questions(session_id)
        evaluations = await self.repo.session_evaluations(session_id)
        report = build_report(session, questions, evaluations, await self.repo.session_answers(session_id))
        if self.report_writer and (narrative := await write_narrative(self.gateway, session, report, questions, evaluations)):
            report = apply_narrative(report, narrative)
        try:
            await self.repo.save_report(report)
        except DuplicateKeyError:
            report = await self.repo.report_for_session(session_id)
        moved = await self.sm.transition(session_id, GENERATING_REPORT, REPORT_READY, extra={"report_id": report["report_id"]})
        if moved is None:
            return None
        await emit(event("INTERVIEW_COMPLETE", REPORT_READY, report_id=report["report_id"],
                         closing_message=moved.get("closing_message")))
        # After the candidate has their result: index for the Mentor. Failures are logged, not raised.
        await index_session_report(self.rag, self.repo, report)
        return moved

    @staticmethod
    def _question_view(question: dict, session: dict) -> dict:
        practice = session["config"]["interview_mode"] == "practice"
        return {"question_id": question["question_id"], "text": question["interviewer_message"],
                "topic": question["topic"], "difficulty": question["difficulty"],
                "is_follow_up": question.get("is_follow_up", False),
                # The room's timer: when it was asked (server clock) and a suggested answer time.
                "asked_at": as_utc(question["asked_at"]).isoformat() if question.get("asked_at") else None,
                "suggested_seconds": suggested_seconds(question),
                "hints_left": max(0, MAX_HINTS_PER_QUESTION - len(question.get("hints") or [])) if practice else 0}

    @staticmethod
    def _draft_for(session: dict) -> str | None:
        draft = session.get("draft_answer") or {}
        if session["state"] == WAITING and draft.get("question_id") == session.get("current_question_id"):
            return draft.get("text") or None
        return None
