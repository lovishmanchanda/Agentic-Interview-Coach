import asyncio
import json

import pytest
from mongomock_motor import AsyncMongoMockClient

from app.config import Settings
from app.db.client import ensure_schema
from app.db.repositories.question_repo import QuestionRepository
from app.db.seed import load_seed_questions, seed_dev_user, seed_question_bank

SANDBOX_PROBLEMS = {"two_sum", "reverse_linked_list", "valid_parentheses"}


@pytest.fixture
def repo_settings():
    return Settings(_env_file=None, app_env="test")


def test_repo_seed_files_are_valid(repo_settings):
    questions = load_seed_questions(repo_settings.seed_dir)
    by_type = {t: [q for q in questions if q.type == t] for t in ("technical", "behavioral", "coding")}
    assert all(by_type.values()), "every question type needs seed data"
    assert {q.question_id for q in by_type["coding"]} >= SANDBOX_PROBLEMS
    for q in by_type["coding"]:
        assert any(tc.is_hidden for tc in q.test_cases), f"{q.question_id} needs a hidden test"
        assert any(not tc.is_hidden for tc in q.test_cases), f"{q.question_id} needs a visible test"
    roles = {role for q in questions for role in q.roles}
    assert {"software_engineer", "ml_engineer"} <= roles


def test_seeding_is_idempotent_and_queryable(repo_settings):
    async def scenario():
        db = AsyncMongoMockClient()["seed_test"]
        await ensure_schema(db)
        questions = load_seed_questions(repo_settings.seed_dir)
        first = await seed_question_bank(db, questions)
        second = await seed_question_bank(db, questions)
        repo = QuestionRepository(db)
        coding = await repo.find(type="coding")
        ml = await repo.find(role="ml_engineer", exclude_ids=["ml_bias_variance"])
        return first, second, coding, ml, len(questions)

    first, second, coding, ml, total = asyncio.run(scenario())
    assert first == {"inserted": total, "updated": 0}
    assert second == {"inserted": 0, "updated": total}
    assert {q["question_id"] for q in coding} == SANDBOX_PROBLEMS
    assert ml and all("ml_engineer" in q["roles"] for q in ml)
    assert "ml_bias_variance" not in {q["question_id"] for q in ml}
    assert all("_id" not in q for q in coding)


def test_bad_seed_file_is_rejected(tmp_path):
    (tmp_path / "question_bank").mkdir()
    bad = [{"question_id": "broken", "type": "coding", "topic": "x", "difficulty": "easy",
            "roles": ["software_engineer"], "question_text": "A coding question with no tests"}]
    (tmp_path / "question_bank" / "bad.json").write_text(json.dumps(bad))
    with pytest.raises(ValueError, match="bad.json"):
        load_seed_questions(tmp_path)


def test_dev_user_only_in_local():
    db = AsyncMongoMockClient()["dev_user_test"]
    with pytest.raises(RuntimeError):
        asyncio.run(seed_dev_user(db, Settings(_env_file=None, app_env="test")))
    local = Settings(_env_file=None, app_env="local")
    first = asyncio.run(seed_dev_user(db, local))
    assert asyncio.run(seed_dev_user(db, local)) == first  # idempotent
