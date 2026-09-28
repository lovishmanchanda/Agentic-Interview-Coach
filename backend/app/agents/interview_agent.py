"""Interviewer agent (implementation_plan.md 1.6, docs/interview-agent-implementation-plan.md).

It writes what the interviewer *says*, and proposes what happens after each answer. It never changes state:

    opening()   INTRODUCTION: greets the candidate and leads into the first question.
    decide()    FOLLOW_UP_DECISION: a hand-rolled ReAct loop on gateway.generate_with_tools() (Groq
                gpt-oss-120b). The agent may call read-only tools (get_performance_summary,
                get_question_details) and must finish with submit_decision(action, lead_in,
                follow_up_question). The proposal is checked against the moves the engine allows now and
                the state machine; an invalid one is sent back once with the reason, then the engine falls
                back to the AdaptationEngine.

What the agent sees is built in core/interview/context_builder.py: tiers and qualitative notes, never scores.
Bank and generated questions are shown word for word (the engine adds them after the agent's lead-in), so
what the evaluator grades is exactly what the candidate was asked. Every run is recorded in agent_runs.
Any failure returns None and the engine carries on with its own decision and plain wording.
"""
import json
import logging
import time
import uuid
from dataclasses import dataclass, field

from pydantic import ValidationError

from app.agents.interview_agent_schemas import (
    ACTION_TO_ADAPTATION,
    TOOLS,
    AgentDecision,
    HintOutput,
    OpeningOutput,
)
from app.core.interview.context_builder import (
    evaluation_summary,
    first_name,
    performance_summary,
    recommendation_text,
)
from app.core.interview.state_machine import InvalidTransitionError, State, next_state_for_action
from app.core.prompts import render_prompt
from app.db.repositories.agent_run_repo import AgentRunRepository
from app.db.repositories.interview_repo import utcnow
from app.gateway import AIGateway
from app.gateway.types import CallContext, FinalMessage, ToolCall
from app.utils.logging import log_event

log = logging.getLogger(__name__)

DECISION_PROMPT = "interviewer/interviewer_v1"
OPENING_PROMPT = "interviewer/opening_v1"
HINT_PROMPT = "interviewer/hint_v1"
MAX_STEPS = 4        # model calls per decision: at most 2 info tools, 1 rejected proposal, 1 accepted
MAX_REJECTIONS = 1   # "re-prompted once, then falls back to the AdaptationEngine"


def _bullets(items: list[str]) -> str:
    return "; ".join(items) if items else "(none noted)"


@dataclass
class AgentRun:
    """The outcome of one decide() call, also written to agent_runs."""
    decision: AgentDecision | None = None
    outcome: str = "fallback"                    # accepted | accepted_after_retry | fallback
    steps: int = 0
    tool_calls: list[str] = field(default_factory=list)
    rejections: list[str] = field(default_factory=list)
    error: str | None = None


class InterviewAgent:
    name = "interviewer"

    def __init__(self, gateway: AIGateway, runs: AgentRunRepository | None = None):
        self.gateway = gateway
        self.runs = runs

    # ── opening ──────────────────────────────────────────────────────────────
    async def opening(self, session: dict) -> str | None:
        config = session["config"]
        focus = session.get("focus_topics") or []
        prompt = render_prompt(
            OPENING_PROMPT,
            interview_type=config["interview_type"],
            candidate_name=first_name(session.get("candidate_name")),
            role=config["role"],
            experience_level=config["experience_level"],
            question_count=str(config["question_count"]),
            interview_mode=config["interview_mode"],
            focus_note=f" The candidate asked to practise: {', '.join(focus)}." if focus else "",
        )
        context = CallContext(session_id=session["session_id"], candidate_id=session["candidate_id"],
                              prompt_version=OPENING_PROMPT)
        started = time.perf_counter()
        try:
            result = await self.gateway.generate_structured(prompt, OpeningOutput, context=context)
            opening = result["opening"].strip()
            await self._record(session, "opening", started, outcome="accepted", output={"opening": opening})
            return opening
        except Exception as exc:  # noqa: BLE001 -- the interview must go on without the agent
            log.warning("interviewer_opening_failed", exc_info=True)
            await self._record(session, "opening", started, outcome="fallback", error=_describe(exc))
            return None

    # ── a hint (practice mode) ───────────────────────────────────────────────
    async def hint(self, session: dict, question: dict, draft_text: str) -> str | None:
        """One nudge towards what the draft is missing, without giving the answer. Fast tier: it's short."""
        prompt = render_prompt(
            HINT_PROMPT,
            interview_type=session["config"]["interview_type"],
            question_text=question["question_text"],
            expected_concepts=_bullets(question.get("expected_concepts") or []),
            draft_text=draft_text.strip() or "(nothing written yet)",
        )
        context = CallContext(session_id=session["session_id"], candidate_id=session["candidate_id"],
                              prompt_version=HINT_PROMPT)
        started = time.perf_counter()
        try:
            result = await self.gateway.generate_structured(prompt, HintOutput, context=context, tier="fast")
            hint = result["hint"].strip()
            await self._record(session, "hint", started, outcome="accepted", output={"hint": hint},
                               extra={"question_id": question["question_id"]})
            return hint
        except Exception as exc:  # noqa: BLE001 -- the engine has a deterministic fallback hint
            log.warning("interviewer_hint_failed", exc_info=True)
            await self._record(session, "hint", started, outcome="fallback", error=_describe(exc),
                               extra={"question_id": question["question_id"]})
            return None

    # ── after an answer ──────────────────────────────────────────────────────
    async def decide(self, *, session: dict, question: dict, answer_text: str, evaluation: dict,
                     allowed: set[str], recommended: str) -> AgentRun:
        """`allowed` and `recommended` use the AdaptationEngine's vocabulary (follow_up / next_topic / complete)."""
        run = AgentRun()
        started = time.perf_counter()
        summary = evaluation_summary(evaluation)
        config = session["config"]
        allowed_actions = [a for a, adapt in ACTION_TO_ADAPTATION.items() if adapt in allowed]
        prompt = render_prompt(
            DECISION_PROMPT,
            interview_type=config["interview_type"],
            role=config["role"],
            experience_level=config["experience_level"],
            interview_mode=config["interview_mode"],
            question_number=str(session["questions_asked"]),
            question_count=str(config["question_count"]),
            follow_up_note=" (this was a follow-up)" if question.get("is_follow_up") else "",
            topics_covered=", ".join(session.get("topics_covered") or []) or "(none yet)",
            question_text=question["question_text"],
            answer_text=answer_text.strip() or "(no answer)",
            performance_tier=summary["performance_tier"],
            strengths=_bullets(summary["strengths"]),
            weaknesses=_bullets(summary["weaknesses"]),
            allowed_actions=", ".join(allowed_actions),
            recommendation=recommendation_text(recommended),
        )
        messages: list[dict] = [{"role": "system", "content": prompt},
                                {"role": "user", "content": "The candidate has answered. Decide the next step."}]
        context = CallContext(session_id=session["session_id"], candidate_id=session["candidate_id"],
                              prompt_version=DECISION_PROMPT)
        tools = {
            "get_performance_summary": lambda: performance_summary(session),
            "get_question_details": lambda: {"expected_concepts": question.get("expected_concepts", []),
                                             "example_follow_ups": question.get("follow_up_possibilities", [])},
        }
        try:
            while run.steps < MAX_STEPS:
                run.steps += 1
                out = await self.gateway.generate_with_tools(messages, TOOLS, context=context, tool_choice="required")
                if isinstance(out, FinalMessage):  # plain text instead of a tool call
                    messages += [{"role": "assistant", "content": out.content},
                                 {"role": "user", "content": "Call submit_decision with your decision."}]
                    continue
                out.id = out.id or f"call_{uuid.uuid4().hex[:8]}"  # the tool result must reference the same id
                run.tool_calls.append(out.name)
                messages.append(_assistant_tool_call(out))
                if out.name in tools:
                    messages.append(_tool_result(out, tools.pop(out.name)()))  # each info tool at most once
                    continue
                if out.name != "submit_decision":
                    messages.append(_tool_result(out, {"error": f"unknown or already used tool {out.name!r}"}))
                    continue
                reason = None
                try:
                    decision = AgentDecision.model_validate(out.arguments)
                    reason = self._rejection_reason(decision, allowed)
                except ValidationError as exc:
                    reason = f"invalid arguments: {exc.errors()[0]['msg']}"
                if reason is None:
                    run.decision = decision
                    run.outcome = "accepted_after_retry" if run.rejections else "accepted"
                    break
                run.rejections.append(reason)
                if len(run.rejections) > MAX_REJECTIONS:
                    break
                messages.append(_tool_result(out, {"rejected": reason, "allowed_actions": allowed_actions}))
        except Exception as exc:  # noqa: BLE001 -- the engine falls back to the AdaptationEngine
            log.warning("interviewer_decision_failed", exc_info=True)
            run.error = _describe(exc)
        if run.decision is None and run.error is None and not run.rejections:
            run.error = f"no decision after {run.steps} steps"
        log_event(log, "interviewer_decision", session_id=session["session_id"], outcome=run.outcome,
                  action=run.decision.action if run.decision else None, steps=run.steps, rejections=len(run.rejections))
        await self._record(session, "decide", started, outcome=run.outcome, error=run.error,
                           output=run.decision.model_dump() if run.decision else None,
                           extra={"steps": run.steps, "tool_calls": run.tool_calls, "rejections": run.rejections,
                                  "allowed": sorted(allowed), "recommended": recommended,
                                  "question_id": question["question_id"]})
        return run

    @staticmethod
    def _rejection_reason(decision: AgentDecision, allowed: set[str]) -> str | None:
        """The engine's rules first (what's allowed right now), then the state machine itself."""
        wanted = ACTION_TO_ADAPTATION[decision.action]
        if wanted not in allowed:
            return f"{decision.action} isn't allowed now"
        try:
            next_state_for_action(State.FOLLOW_UP_DECISION, decision.action)
        except InvalidTransitionError as exc:
            return str(exc)
        return None

    async def _record(self, session: dict, step: str, started: float, *, outcome: str, error: str | None = None,
                      output: dict | None = None, extra: dict | None = None) -> None:
        if self.runs is None:
            return
        try:
            await self.runs.record({
                "run_id": uuid.uuid4().hex, "agent_name": self.name, "step": step,
                "session_id": session["session_id"], "candidate_id": session["candidate_id"],
                "prompt_version": {"decide": DECISION_PROMPT, "opening": OPENING_PROMPT, "hint": HINT_PROMPT}[step],
                "outcome": outcome, "error": error, "output": output, **(extra or {}),
                "latency_ms": int((time.perf_counter() - started) * 1000), "started_at": utcnow(),
            })
        except Exception:  # noqa: BLE001 -- observability must never break the interview
            log.warning("agent_run_record_failed", exc_info=True)


def _assistant_tool_call(call: ToolCall) -> dict:
    return {"role": "assistant", "content": None, "tool_calls": [{
        "id": call.id, "type": "function",
        "function": {"name": call.name, "arguments": json.dumps(call.arguments)}}]}


def _tool_result(call: ToolCall, result: dict) -> dict:
    return {"role": "tool", "tool_call_id": call.id, "content": json.dumps(result)}


def _describe(exc: Exception) -> str:
    code = getattr(exc, "code", None)
    return f"{type(exc).__name__}{f' ({code})' if code else ''}: {exc}"[:300]
