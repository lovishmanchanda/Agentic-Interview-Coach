"""Question engine (implementation_plan.md 1.1 / 1.4).

Picks the next question for a session. The bank comes first (Cosmos `question_bank`, seeded from
data/seed/). When the bank has nothing left for the candidate's role, the LLM writes a question in
the same shape (`source: llm_generated`). Generated questions are stored with the session's
interview_questions, not written back to the shared bank: that needs a quality gate first.

A Weak-Area Drill (`session.focus_topics`) restricts both the bank and generation to those topics.
Selection is a plain heuristic, in this order of preference:
  1. a topic not yet covered in this session
  2. a question the candidate hasn't seen in their recent sessions
  3. the difficulty closest to the session's target difficulty
Ties are broken by a random draw seeded per session and turn, so repeat interviews vary but a given
turn is reproducible. Adapting difficulty to performance is 1.8 (AdaptationEngine).
"""
import logging
import random
import re
import uuid

from pydantic import BaseModel, Field

from app.core.prompts import render_prompt
from app.db.repositories.interview_repo import InterviewRepository
from app.db.repositories.question_repo import QuestionRepository
from app.gateway import AIGateway
from app.gateway.types import CallContext
from app.utils.logging import log_event

log = logging.getLogger(__name__)

GENERATION_PROMPT = "interviewer/question_generation_v1"
DIFFICULTIES = ("easy", "medium", "hard")
LEVEL_DIFFICULTY = {"fresher": "easy", "1-2": "medium", "3-5": "medium", "senior": "hard"}

# Free-text target role (profile.target.role) -> the role keys used in the bank's `roles`. First match wins.
_ROLE_PATTERNS = [
    ("ml_engineer", r"\b(ml|machine learning|ai|data scien\w*|deep learning|nlp|mlops)\b"),
    ("frontend", r"\b(front[- ]?end|ui|react|web developer)\b"),
    ("fullstack", r"\bfull[- ]?stack\b"),
    ("backend", r"\b(back[- ]?end|api|platform|server)\b"),
]
DEFAULT_ROLE = "software_engineer"

# Topics to generate on once the bank runs dry, per role, in rough order of interview frequency.
ROLE_TOPICS = {
    "software_engineer": ["dsa", "system_design", "dbms", "os", "oops", "networking"],
    "backend": ["system_design", "dbms", "dsa", "os", "networking", "api_design"],
    "fullstack": ["dsa", "system_design", "dbms", "javascript", "networking", "oops"],
    "frontend": ["javascript", "web_performance", "browser_internals", "dsa", "css_layout", "accessibility"],
    "ml_engineer": ["machine_learning", "system_design", "python", "statistics", "deep_learning", "dsa"],
}


class GeneratedQuestion(BaseModel):
    """What the LLM must return on a bank miss. Validated by the gateway."""
    topic: str = Field(min_length=2, max_length=60)
    subtopic: str = Field(default="", max_length=60)
    question_text: str = Field(min_length=20, max_length=600)
    expected_concepts: list[str] = Field(min_length=2, max_length=8)
    evaluation_rubric: dict[str, str] = Field(default_factory=dict)
    follow_up_possibilities: list[str] = Field(default_factory=list, max_length=4)


def role_key(role_text: str) -> str:
    """Profile roles are usually already a key ("ml_engineer", from the profile form's role list); the
    config API also takes free text ("Data Scientist")."""
    text = (role_text or "").strip().lower()
    if text in ROLE_TOPICS:
        return text
    text = text.replace("_", " ")  # "_" is a word character, so it would hide \bml\b in "ml_engineer"
    for key, pattern in _ROLE_PATTERNS:
        if re.search(pattern, text):
            return key
    return DEFAULT_ROLE


def target_difficulty(preferred: str | None, experience_level: str | None) -> str:
    """The profile's preferred difficulty, or one derived from experience when it is 'adaptive'."""
    if preferred in DIFFICULTIES:
        return preferred
    return LEVEL_DIFFICULTY.get(experience_level or "", "medium")


def rank_candidates(candidates: list[dict], *, topics_covered: list[str], recently_seen: set[str],
                    difficulty: str, rng: random.Random) -> list[dict]:
    """Best first. Pure, so the heuristic is unit-tested without a database."""
    target = DIFFICULTIES.index(difficulty) if difficulty in DIFFICULTIES else 1
    covered = set(topics_covered)

    def key(q: dict) -> tuple:
        distance = abs(DIFFICULTIES.index(q["difficulty"]) - target) if q["difficulty"] in DIFFICULTIES else 3
        return (q["topic"] in covered, q["question_id"] in recently_seen, distance, rng.random())

    return sorted(candidates, key=key)


class QuestionEngine:
    def __init__(self, *, bank: QuestionRepository, repo: InterviewRepository, gateway: AIGateway):
        self.bank = bank
        self.repo = repo
        self.gateway = gateway

    async def next_question(self, session: dict, *, context: CallContext) -> dict:
        """A question in the bank's shape plus `source` ("bank" | "llm_generated")."""
        config = session["config"]
        asked = session.get("asked_question_ids", [])
        focus = session.get("focus_topics") or None
        candidates = await self.bank.find(type="technical", role=config["role_key"], topic=focus,
                                          exclude_ids=asked, limit=500)
        if candidates:
            recently_seen = set(await self.repo.recent_bank_question_ids(session["candidate_id"],
                                                                         exclude_session_id=session["session_id"]))
            rng = random.Random(f"{session['session_id']}:{session.get('questions_asked', 0)}")
            best = rank_candidates(candidates, topics_covered=session.get("topics_covered", []),
                                   recently_seen=recently_seen, difficulty=session["target_difficulty"], rng=rng)[0]
            return {**best, "source": "bank"}
        return await self._generate(session, context=context)

    async def _generate(self, session: dict, *, context: CallContext) -> dict:
        config = session["config"]
        covered = set(session.get("topics_covered", []))
        topics = session.get("focus_topics") or ROLE_TOPICS.get(config["role_key"], ROLE_TOPICS[DEFAULT_ROLE])
        topic = next((t for t in topics if t not in covered), topics[session.get("questions_asked", 0) % len(topics)])
        already_asked = [q["question_text"] for q in await self.repo.session_questions(session["session_id"])]
        prompt = render_prompt(
            GENERATION_PROMPT,
            role=config["role"],
            experience_level=config["experience_level"],
            topic=topic,
            difficulty=session["target_difficulty"],
            already_asked="\n".join(f"- {text}" for text in already_asked) or "- (none yet)",
        )
        context.prompt_version = GENERATION_PROMPT
        generated = await self.gateway.generate_structured(prompt, GeneratedQuestion, context=context)
        log_event(log, "question_generated", topic=topic, difficulty=session["target_difficulty"])
        return {
            **generated,
            "question_id": f"gen_{uuid.uuid4().hex[:12]}",
            "type": "technical",
            "topic": topic,  # keep our label even if the model rephrased it, so topic coverage stays consistent
            "difficulty": session["target_difficulty"],
            "roles": [config["role_key"]],
            "source": "llm_generated",
        }


async def topics_for_role(bank: QuestionRepository, role: str) -> list[str]:
    """Topics a candidate can pick for a drill: the usual ones for the role first, then anything else the bank has."""
    return list(dict.fromkeys([*ROLE_TOPICS.get(role, ROLE_TOPICS[DEFAULT_ROLE]),
                               *await bank.topics(type="technical", role=role)]))
