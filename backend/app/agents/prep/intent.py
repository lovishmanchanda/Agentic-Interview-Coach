"""Spotting "prepare me for <company>" in a Mentor message.

Only a preparation verb followed by "for/at/with <name>" counts, and the name must be a company we know or look
like one (capitalised, not a topic): "prepare me for system design" or "prepare for DSA" are study questions for
the Mentor, not company prep.
"""
import re
from dataclasses import dataclass

from app.agents.prep.company_research import clean_company_name
from app.agents.prep.planner import label
from app.agents.prep.vocabulary import ALL_TOPICS

_PREP = re.compile(r"\b(?:prep(?:are)?|get\s+(?:me\s+)?ready|ready|preparation(?:\s+plan)?|study\s+plan|plan)\b"
                   r"(?:\s+[\w']+){0,4}?\s+(?:for|at|with)\s+(?P<target>.+)", re.IGNORECASE)
_WEEKS = re.compile(r"\b(\d{1,2})\s*(?:weeks?|wks?)\b", re.IGNORECASE)
_LEAD = re.compile(r"^(?:(?:an?|the|my|our|upcoming|next|interviews?|role|job|position|at|with|for)\s+)+", re.IGNORECASE)
_TAIL = re.compile(r"\s+(?:in|within|over|by|next|this|interviews?|role|job|position|as|for|please|asap)\b.*$|[?!.,;:].*$",
                   re.IGNORECASE)
_TOPIC_WORDS = {t.replace("_", " ") for t in ALL_TOPICS} | {label(t).lower() for t in ALL_TOPICS} | {
    "coding", "behavioral", "behavioural", "technical", "interviews", "interview", "an interview", "it", "this", "that",
    "system design interviews", "coding interviews", "faang", "maang", "product companies", "startups"}


_ROLE_WORDS = {"sde", "sde1", "sde2", "sde-1", "sde-2", "swe", "engineer", "engineering", "developer", "dev", "intern",
               "internship", "backend", "frontend", "fullstack", "full-stack", "software", "ml", "data", "senior", "junior",
               "new", "grad", "graduate", "placement", "placements", "drive", "offcampus", "campus"}


def _strip_role_words(name: str) -> str:
    words = name.split()
    while len(words) > 1 and words[-1].lower() in _ROLE_WORDS:
        words.pop()
    return " ".join(words)


@dataclass
class PrepRequest:
    company: str
    weeks: int | None


def weeks_in(message: str) -> int | None:
    match = _WEEKS.search(message)
    return max(1, min(12, int(match.group(1)))) if match else None


def detect(message: str, known: list[tuple[str, list[str]]]) -> PrepRequest | None:
    match = _PREP.search(message)
    if not match:
        return None
    target = match.group("target")
    for name, aliases in known:  # a known company anywhere after the verb
        for candidate in [name, *aliases]:
            if re.search(rf"(?<![\w]){re.escape(candidate)}(?![\w])", target, re.IGNORECASE):
                return PrepRequest(name, weeks_in(message))
    name = _TAIL.sub("", _LEAD.sub("", target.strip())).strip()
    name = clean_company_name(_strip_role_words(" ".join(name.split()[:4])))
    if not name or name.lower() in _TOPIC_WORDS or not name[0].isupper():
        return None
    return PrepRequest(name, weeks_in(message))
