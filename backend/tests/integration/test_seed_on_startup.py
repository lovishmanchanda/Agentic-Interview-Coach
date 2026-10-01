"""SEED_ON_STARTUP: hosts without a shell (Render's free plan) load the question bank and companies at boot."""
import asyncio

from fastapi.testclient import TestClient

from app.main import create_app


def _counts(db):
    async def count():
        return (await db["question_bank"].count_documents({}), await db["companies"].count_documents({}),
                await db["users"].count_documents({}))
    return asyncio.run(count())


def test_seed_on_startup_loads_the_catalogue_but_never_a_user(settings, mock_db, gateway):
    with TestClient(create_app(settings.model_copy(update={"seed_on_startup": True}), db=mock_db, gateway=gateway)):
        pass
    questions, companies, users = _counts(mock_db)
    assert questions > 0 and companies > 0
    assert users == 0  # the dev user is a local-only, in-memory convenience


def test_seed_on_startup_is_off_by_default(settings, mock_db, gateway):
    with TestClient(create_app(settings, db=mock_db, gateway=gateway)):
        pass
    assert _counts(mock_db)[:2] == (0, 0)
