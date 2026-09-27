"""Seed data: question bank (all environments) and a dev user + profile (local only)."""
import json
from pathlib import Path

from app.config import Settings
from app.db.models.profile import Personal, Preferences, ProfileCreate, Target
from app.db.models.question import Question
from app.db.repositories.profile_repo import ProfileRepository
from app.db.repositories.question_repo import QuestionRepository
from app.db.repositories.user_repo import UserRepository
from app.utils.security import hash_password

DEV_USER_EMAIL = "dev@example.com"
DEV_USER_PASSWORD = "dev-password-123"  # local only; refused outside APP_ENV=local


def load_seed_questions(seed_dir: str | Path) -> list[Question]:
    """Validates every JSON file in <seed_dir>/question_bank. Raises on bad data or duplicate IDs."""
    questions: list[Question] = []
    for path in sorted(Path(seed_dir, "question_bank").glob("*.json")):
        for raw in json.loads(path.read_text()):
            try:
                questions.append(Question.model_validate(raw))
            except ValueError as exc:
                raise ValueError(f"{path.name}: {exc}") from exc
    ids = [q.question_id for q in questions]
    duplicates = {qid for qid in ids if ids.count(qid) > 1}
    if duplicates:
        raise ValueError(f"duplicate question_id(s): {sorted(duplicates)}")
    return questions


async def seed_question_bank(db, questions: list[Question]) -> dict[str, int]:
    repo = QuestionRepository(db)
    inserted = 0
    for question in questions:
        inserted += await repo.upsert(question)
    return {"inserted": inserted, "updated": len(questions) - inserted}


async def seed_dev_user(db, settings: Settings) -> str:
    """Creates dev@example.com with a completed profile so frontend work can skip onboarding."""
    if settings.app_env != "local":
        raise RuntimeError("The dev user is only seeded when APP_ENV=local")
    users, profiles = UserRepository(db), ProfileRepository(db)
    user = await users.get_by_email(DEV_USER_EMAIL)
    if user is None:
        user = await users.create(email=DEV_USER_EMAIL, name="Dev Candidate",
                                  password_hash=hash_password(DEV_USER_PASSWORD))
    if await profiles.get_by_candidate(user["_id"]) is None:
        await profiles.create(user["_id"], ProfileCreate(
            personal=Personal(name="Dev Candidate", education="BSc Computer Science", experience_level="1-2"),
            target=Target(role="Software Engineer"),
            skills=["python", "sql", "data structures"],
            preferences=Preferences(),
        ))
    return user["_id"]
