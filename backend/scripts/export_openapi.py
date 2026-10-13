"""Write the API's OpenAPI schema (every route, request body and response model) to a JSON file.

The frontend generates its TypeScript API types from it (frontend: `npm run api:types`), and CI regenerates it
and fails if the committed copy is out of date, so a backend change can't silently break the frontend's types.

    cd backend
    python -m scripts.export_openapi                      # -> ../frontend/types/api.schema.json
    python -m scripts.export_openapi path/to/schema.json
"""
import json
import sys
from pathlib import Path

from app.config import Settings
from app.main import create_app

DEFAULT_OUT = Path(__file__).resolve().parents[2] / "frontend" / "types" / "api.schema.json"


def main(out: Path) -> None:
    # Building the schema needs no database, model or keys: the app is constructed, never started.
    app = create_app(Settings(app_env="test", use_inmemory_db=True))
    schema = app.openapi()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {len(schema.get('paths', {}))} paths, {len(schema.get('components', {}).get('schemas', {}))} schemas to {out}")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT)
