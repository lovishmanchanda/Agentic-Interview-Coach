"""3.4 Candidate profiler: who the candidate is and how they've actually scored, from the database.

Deterministic on purpose: the latest score per topic across their reports is exact, where retrieving it through
the Mentor's RAG index would only approximate it.
"""
from dataclasses import dataclass, field

from app.db.repositories.interview_repo import InterviewRepository
from app.db.repositories.profile_repo import ProfileRepository

MAX_REPORTS = 20


@dataclass
class CandidateSnapshot:
    name: str | None
    target_role: str
    experience_level: str
    skills: list[str]
    interviews_done: int
    scores: dict[str, float] = field(default_factory=dict)   # topic -> latest score (0-10)
    last_practised: dict[str, str] = field(default_factory=dict)  # topic -> ISO date


async def snapshot(candidate_id: str, *, profiles: ProfileRepository, interviews: InterviewRepository) -> CandidateSnapshot:
    profile = await profiles.get_by_candidate(candidate_id) or {}
    reports = await interviews.list_reports(candidate_id, limit=MAX_REPORTS)  # newest first
    scores: dict[str, float] = {}
    dates: dict[str, str] = {}
    for report in reports:
        for topic, score in (report.get("per_topic_scores") or {}).items():
            if topic not in scores:  # the newest report's score for a topic wins
                scores[topic] = score
                dates[topic] = report["generated_at"].date().isoformat()
    return CandidateSnapshot(
        name=(profile.get("personal") or {}).get("name"),
        target_role=(profile.get("target") or {}).get("role", "Software Engineer"),
        experience_level=(profile.get("personal") or {}).get("experience_level", "fresher"),
        skills=profile.get("skills", []), interviews_done=len(reports), scores=scores, last_practised=dates)
