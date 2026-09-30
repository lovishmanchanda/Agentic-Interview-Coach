"""Cosmos DB (MongoDB API) connection, collection setup and indexes.

Uses PyMongo's native async client (Motor is deprecated). Locally this points at plain MongoDB;
tests inject an in-memory database with the same async API.
"""
import logging

from pymongo import ASCENDING, DESCENDING, AsyncMongoClient

from app.config import Settings

log = logging.getLogger(__name__)

# Collections from architecture.md §5 (plus refresh_tokens for auth rotation).
COLLECTIONS = [
    "users", "refresh_tokens", "candidate_profiles", "roles", "companies",
    "interview_sessions", "interview_questions", "candidate_answers", "evaluations",
    "interview_reports", "agent_runs", "mentor_conversations", "question_bank", "prep_plans", "llm_calls",
    "prompt_settings",
]

# architecture.md §5.3 index strategy. (collection, keys, options)
INDEXES: list[tuple[str, list[tuple[str, int]], dict]] = [
    ("users", [("email", ASCENDING)], {"unique": True}),
    ("refresh_tokens", [("token_hash", ASCENDING)], {"unique": True}),
    ("refresh_tokens", [("user_id", ASCENDING)], {}),
    ("candidate_profiles", [("candidate_id", ASCENDING)], {"unique": True}),
    ("interview_sessions", [("session_id", ASCENDING)], {"unique": True}),
    ("interview_sessions", [("candidate_id", ASCENDING)], {}),
    ("interview_sessions", [("state", ASCENDING)], {}),
    ("interview_questions", [("session_id", ASCENDING)], {}),
    ("interview_questions", [("question_id", ASCENDING)], {}),
    ("interview_questions", [("candidate_id", ASCENDING), ("asked_at", DESCENDING)], {}),
    ("candidate_answers", [("session_id", ASCENDING)], {}),
    ("candidate_answers", [("question_id", ASCENDING)], {}),
    ("evaluations", [("session_id", ASCENDING)], {}),
    ("evaluations", [("candidate_id", ASCENDING)], {}),
    ("interview_reports", [("report_id", ASCENDING)], {"unique": True}),
    ("interview_reports", [("session_id", ASCENDING)], {"unique": True}),
    ("interview_reports", [("candidate_id", ASCENDING)], {}),
    ("mentor_conversations", [("conversation_id", ASCENDING)], {"unique": True}),
    ("mentor_conversations", [("candidate_id", ASCENDING), ("updated_at", DESCENDING)], {}),
    ("agent_runs", [("candidate_id", ASCENDING)], {}),
    ("agent_runs", [("agent_name", ASCENDING)], {}),
    ("agent_runs", [("started_at", DESCENDING)], {}),
    ("llm_calls", [("candidate_id", ASCENDING), ("at", DESCENDING)], {}),
    ("llm_calls", [("at", DESCENDING)], {}),
    ("llm_calls", [("session_id", ASCENDING)], {}),
    ("llm_calls", [("prompt_version", ASCENDING), ("at", DESCENDING)], {}),
    ("prompt_settings", [("name", ASCENDING)], {"unique": True}),
    ("question_bank", [("question_id", ASCENDING)], {"unique": True}),
    ("question_bank", [("type", ASCENDING), ("topic", ASCENDING), ("difficulty", ASCENDING), ("roles", ASCENDING)], {}),
    ("companies", [("company_id", ASCENDING)], {"unique": True}),
    ("companies", [("aliases", ASCENDING)], {}),
    ("prep_plans", [("plan_id", ASCENDING)], {"unique": True}),
    ("prep_plans", [("candidate_id", ASCENDING), ("created_at", DESCENDING)], {}),
]


def create_client(settings: Settings) -> AsyncMongoClient:
    # retryWrites=False is required by Cosmos DB's MongoDB API; harmless for plain MongoDB.
    return AsyncMongoClient(settings.cosmos_connection_string, retryWrites=False,
                            serverSelectionTimeoutMS=5_000, tz_aware=True)


async def ensure_schema(db) -> None:
    """Create missing collections and indexes. Idempotent; run at startup.

    Cosmos DB note: unique indexes can only be added while a collection is empty, which is why
    collections are created explicitly here before any data is written.
    """
    existing = set(await db.list_collection_names())
    for name in COLLECTIONS:
        if name not in existing:
            await db.create_collection(name)
    for collection, keys, options in INDEXES:
        await db[collection].create_index(keys, **options)
    log.info("db_schema_ready")


async def ping(db) -> bool:
    try:
        await db.command("ping")
        return True
    except Exception:  # noqa: BLE001 -- health check must never raise
        log.warning("db_ping_failed", exc_info=True)
        return False
