"""Adaptation engine (implementation_plan.md 1.8, architecture.md §8.4).

Decides what happens after each evaluated answer. Pure and deterministic: no database, no LLM, so every
rule is unit-tested on its own. The engine calls it in FOLLOW_UP_DECISION and turns the result into a
state-machine action (follow_up → deliver_follow_up, next_topic → deliver_question, complete → wrap_up).

Rules, in order:
  1. Token budget nearly spent                       → complete
  2. Partial answer (adequate tier) to a main question, a follow-up is available, follow-ups enabled
                                                     → follow_up   (at most one per main question)
  3. All `question_count` main questions asked       → complete
  4. Otherwise                                       → next_topic
Difficulty (only when the configured difficulty is "adaptive"): strong → one level up, weak → one level
down, adequate → unchanged. It applies from the next main question; a follow-up stays at the same level.

The running per-topic score (`performance_vector`) feeds the report and, in a Weak-Area Drill, brings the
weakest focus topic back once every focus topic has been covered.

The interviewer agent (1.6) will write follow-ups from the candidate's actual answer; until then the
follow-up comes from the question's `follow_up_possibilities`.
"""
from dataclasses import asdict, dataclass
from typing import Literal

DIFFICULTIES = ("easy", "medium", "hard")
TIER_DELTA = {"strong": 1, "adequate": 0, "weak": -1}

Action = Literal["follow_up", "next_topic", "complete"]
# The state machine's vocabulary (state_machine.ACTION_TO_STATE) for each decision.
AGENT_ACTION = {"follow_up": "deliver_follow_up", "next_topic": "deliver_question", "complete": "wrap_up"}


@dataclass(frozen=True)
class NextAction:
    action: Action
    difficulty_delta: int            # applied to target_difficulty below (0 unless adaptive)
    target_difficulty: str           # for the next main question
    suggested_topic: str | None      # QuestionEngine prefers it when set
    reason: str
    follow_up_text: str | None = None

    @property
    def agent_action(self) -> str:
        return AGENT_ACTION[self.action]

    def as_record(self) -> dict:
        return asdict(self)


def shift_difficulty(current: str, delta: int) -> str:
    index = DIFFICULTIES.index(current) if current in DIFFICULTIES else 1
    return DIFFICULTIES[max(0, min(len(DIFFICULTIES) - 1, index + delta))]


def update_performance(vector: dict[str, dict], topic: str, score: float) -> dict[str, dict]:
    """Running mean score per topic: {topic: {"mean": float, "n": int}}. Returns a new dict."""
    current = vector.get(topic, {"mean": 0.0, "n": 0})
    n = current["n"] + 1
    mean = round(current["mean"] + (score - current["mean"]) / n, 2)
    return {**vector, topic: {"mean": mean, "n": n}}


def should_wrap_up(session: dict, *, budget_remaining: int, token_reserve: int,
                   time_limit_reached: bool = False) -> str | None:
    """Why the interview must end now, or None. The state machine decides when; the agent only what to say."""
    if time_limit_reached:
        return "time limit reached"
    if budget_remaining < token_reserve:
        return f"token budget nearly spent ({budget_remaining} left)"
    return None


def pick_follow_up(question: dict, asked_follow_ups: list[str]) -> str | None:
    """The first of the question's follow-ups not used yet in this session."""
    for text in question.get("follow_up_possibilities") or []:
        if text and text.strip() and text not in asked_follow_ups:
            return text.strip()
    return None


def weakest_focus_topic(session: dict) -> str | None:
    """In a drill, once every focus topic has been asked, revisit the one scored lowest."""
    focus = session.get("focus_topics") or []
    covered = set(session.get("topics_covered") or [])
    if len(focus) < 2 or not set(focus) <= covered:
        return None
    vector = session.get("performance_vector") or {}
    return min(focus, key=lambda t: (vector.get(t, {}).get("mean", 10.0), focus.index(t)))


def allowed_actions(question: dict, session: dict, *, budget_remaining: int, token_reserve: int,
                    follow_ups_enabled: bool = True, time_limit_reached: bool = False) -> set[Action]:
    """The moves the interviewer agent (1.6) may choose between. The same limits as decide_next_action,
    without its preferences: the agent may follow up on any answer, or skip a follow-up, but it can't end
    early, run past question_count, or follow up on a follow-up."""
    if should_wrap_up(session, budget_remaining=budget_remaining, token_reserve=token_reserve,
                      time_limit_reached=time_limit_reached):
        return {"complete"}
    allowed: set[Action] = set()
    if follow_ups_enabled and not question.get("is_follow_up"):
        allowed.add("follow_up")
    allowed.add("complete" if session["questions_asked"] >= session["config"]["question_count"] else "next_topic")
    return allowed


def next_difficulty(evaluation: dict, session: dict) -> tuple[int, str]:
    """(delta, target) for the next main question: strong +1, weak -1, only in adaptive mode, bounded."""
    current = session["target_difficulty"]
    delta = TIER_DELTA[evaluation["performance_tier"]] if session["config"].get("difficulty") == "adaptive" else 0
    target = shift_difficulty(current, delta)
    return (DIFFICULTIES.index(target) - DIFFICULTIES.index(current) if current in DIFFICULTIES else 0), target


def action_for_choice(action: Action, evaluation: dict, session: dict, *, reason: str,
                      follow_up_text: str | None = None) -> NextAction:
    """A NextAction for a move someone else chose (the interviewer agent). Difficulty and drill topic still
    follow this engine's rules; the chooser only picks the move."""
    current = session["target_difficulty"]
    if action == "follow_up":
        return NextAction("follow_up", 0, current, None, reason, follow_up_text=follow_up_text)
    if action == "complete":
        return NextAction("complete", 0, current, None, reason)
    delta, target = next_difficulty(evaluation, session)
    return NextAction("next_topic", delta, target, weakest_focus_topic(session), reason)


def decide_next_action(evaluation: dict, question: dict, session: dict, *, budget_remaining: int,
                       token_reserve: int, follow_ups_enabled: bool = True, time_limit_reached: bool = False) -> NextAction:
    tier = evaluation["performance_tier"]
    current = session["target_difficulty"]
    adaptive = session["config"].get("difficulty") == "adaptive"
    delta, target = next_difficulty(evaluation, session)
    score = evaluation["overall_score"]

    if reason := should_wrap_up(session, budget_remaining=budget_remaining, token_reserve=token_reserve,
                                time_limit_reached=time_limit_reached):
        return NextAction("complete", 0, current, None, reason)

    if follow_ups_enabled and tier == "adequate" and not question.get("is_follow_up"):
        text = pick_follow_up(question, session.get("asked_follow_ups") or [])
        if text:
            return NextAction("follow_up", 0, current, None,
                              f"partial answer ({score}/10): probe deeper on {question['topic']}", follow_up_text=text)

    if session["questions_asked"] >= session["config"]["question_count"]:
        return NextAction("complete", delta, target, None, f"all {session['config']['question_count']} questions asked")

    moved = {1: f"strong answer ({score}/10): harder next", -1: f"weak answer ({score}/10): easier next"}.get(
        delta, f"{tier} answer ({score}/10): same difficulty" if adaptive else f"fixed difficulty ({current})")
    return NextAction("next_topic", delta, target, weakest_focus_topic(session), moved)
