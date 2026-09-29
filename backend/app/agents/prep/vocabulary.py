"""The topic keys every prep step speaks: the same keys interviews, reports and drills use, so a gap maps straight
to a practice interview. Grouped by the interview type that practises them."""
from app.core.interview.question_engine import BEHAVIORAL_COMPETENCIES, ROLE_TOPICS

TECHNICAL = sorted({t for topics in ROLE_TOPICS.values() for t in topics})
CODING = ["arrays", "strings", "hashing", "graphs", "dynamic_programming", "linked_list", "stack", "binary_search",
          "sorting", "two_pointers"]
BEHAVIORAL = list(BEHAVIORAL_COMPETENCIES)

KIND_OF: dict[str, str] = {**{t: "technical" for t in TECHNICAL}, **{t: "coding" for t in CODING},
                           **{t: "behavioral" for t in BEHAVIORAL}}
ALL_TOPICS = list(KIND_OF)


def known(topics: list[str], kind: str | None = None) -> list[str]:
    """Keep only known keys (of one kind, if given), in order, without duplicates."""
    return list(dict.fromkeys(t for t in topics if KIND_OF.get(t) and (kind is None or KIND_OF[t] == kind)))
