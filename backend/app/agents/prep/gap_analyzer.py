"""3.5 Gap analyzer: what the company/role needs vs. how the candidate has scored. Pure and deterministic, so
the ranking is explainable and testable; the planner (an LLM) only turns it into a schedule."""
from dataclasses import asdict, dataclass

from app.agents.prep.candidate_profiler import CandidateSnapshot
from app.agents.prep.vocabulary import KIND_OF

STRONG, ADEQUATE = 7.5, 5.0  # the report tiers
IMPORTANCE_WEIGHT = {"high": 3, "medium": 2, "low": 1}
STATUS_WEIGHT = {"weak": 3, "untested": 2, "developing": 2, "strong": 0}
IMPORTANCE_ORDER = ["low", "medium", "high"]


@dataclass
class Requirement:
    area: str          # a topic key
    importance: str    # high | medium | low
    reason: str = ""   # why it matters ("Google: coding rounds", "JD: 'distributed systems'")

    @property
    def kind(self) -> str:
        return KIND_OF[self.area]


@dataclass
class Gap:
    area: str
    kind: str
    importance: str
    status: str               # untested | weak | developing | strong
    score: float | None
    priority: int
    reason: str

    def as_dict(self) -> dict:
        return asdict(self)


def merge(*groups: list[Requirement]) -> list[Requirement]:
    """One requirement per area, keeping the highest importance and every reason."""
    merged: dict[str, Requirement] = {}
    for group in groups:
        for req in group:
            if req.area not in KIND_OF:
                continue
            current = merged.get(req.area)
            if current is None:
                merged[req.area] = Requirement(req.area, req.importance, req.reason)
            else:
                if IMPORTANCE_ORDER.index(req.importance) > IMPORTANCE_ORDER.index(current.importance):
                    current.importance = req.importance
                if req.reason and req.reason not in current.reason:
                    current.reason = "; ".join(filter(None, [current.reason, req.reason]))
    return list(merged.values())


def status_for(score: float | None) -> str:
    if score is None:
        return "untested"
    if score >= STRONG:
        return "strong"
    return "developing" if score >= ADEQUATE else "weak"


def analyze(requirements: list[Requirement], candidate: CandidateSnapshot) -> dict:
    """{"gaps": [...] (most urgent first), "strengths": [...]} as plain dicts."""
    rows = []
    for req in requirements:
        score = candidate.scores.get(req.area)
        status = status_for(score)
        rows.append(Gap(area=req.area, kind=req.kind, importance=req.importance, status=status, score=score,
                        priority=IMPORTANCE_WEIGHT[req.importance] * STATUS_WEIGHT[status], reason=req.reason))
    gaps = sorted((g for g in rows if g.status != "strong"),
                  key=lambda g: (-g.priority, g.score if g.score is not None else 99, g.area))
    strengths = sorted((g for g in rows if g.status == "strong"), key=lambda g: -(g.score or 0))
    return {"gaps": [g.as_dict() for g in gaps], "strengths": [g.as_dict() for g in strengths]}


# ── building requirements ──
def jd_requirements(analysis: dict) -> list[Requirement]:
    return [Requirement(r["area"], r["importance"], f"JD: {r['evidence']}" if r.get("evidence") else "JD")
            for r in analysis.get("requirements", [])]


def company_requirements(company: dict) -> list[Requirement]:
    """A company's focus areas as requirements: its first two technical and coding areas matter most."""
    name = company["name"]
    reqs = [Requirement(t, "high" if i < 2 else "medium", f"{name}: technical interviews")
            for i, t in enumerate(company.get("technical_focus", []))]
    reqs += [Requirement(t, "high" if i < 2 else "medium", f"{name}: coding interviews")
             for i, t in enumerate(company.get("coding_focus", []))]
    reqs += [Requirement(t, "medium", f"{name}: behavioral interviews") for t in company.get("competencies", [])]
    return reqs
