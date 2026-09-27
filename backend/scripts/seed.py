"""Seed the database.

    cd backend
    python -m scripts.seed               # question bank (safe to re-run; upserts by question_id)
    python -m scripts.seed --dev-user    # + dev@example.com / dev-password-123 with a profile (APP_ENV=local only)
    python -m scripts.seed --check       # validate seed JSON only, no database needed
"""
import argparse
import asyncio
import sys

from app.config import get_settings
from app.db.client import create_client, ensure_schema
from app.db.seed import DEV_USER_EMAIL, DEV_USER_PASSWORD, load_seed_questions, seed_dev_user, seed_question_bank


async def main(dev_user: bool, check: bool) -> int:
    settings = get_settings()
    questions = load_seed_questions(settings.seed_dir)
    print(f"Validated {len(questions)} seed questions from {settings.seed_dir}/question_bank")
    if check:
        return 0

    client = create_client(settings)
    try:
        db = client[settings.cosmos_database]
        await ensure_schema(db)
        counts = await seed_question_bank(db, questions)
        print(f"question_bank: {counts['inserted']} inserted, {counts['updated']} updated")
        if dev_user:
            await seed_dev_user(db, settings)
            print(f"dev user ready: {DEV_USER_EMAIL} / {DEV_USER_PASSWORD}")
    finally:
        await client.close()
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dev-user", action="store_true", help="also create the local dev user + profile")
    parser.add_argument("--check", action="store_true", help="only validate the seed files")
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.dev_user, args.check)))
