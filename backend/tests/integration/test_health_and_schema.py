from fastapi.testclient import TestClient

from app.db.client import COLLECTIONS
from app.main import create_app


def test_health_ok_with_envelope_and_request_id(client):
    response = client.get("/api/v1/health", headers={"X-Request-ID": "req-123"})
    body = response.json()
    assert response.status_code == 200
    assert body["success"] is True
    assert body["data"]["database"] == "up"
    assert body["data"]["gateway"] == "fake"
    assert body["data"]["mentor_rag"] == "disabled"  # no HF_TOKEN in tests
    assert body["meta"]["request_id"] == "req-123"
    assert response.headers["X-Request-ID"] == "req-123"


def test_health_returns_503_when_database_down(settings, gateway):
    class DeadDb:
        async def command(self, *_):
            raise ConnectionError("down")

        async def list_collection_names(self):
            raise ConnectionError("down")

    with TestClient(create_app(settings, db=DeadDb(), gateway=gateway)) as client:
        response = client.get("/api/v1/health")
    assert response.status_code == 503
    assert response.json()["data"]["database"] == "down"


def test_startup_creates_all_collections_and_unique_indexes(client, mock_db):
    import asyncio

    names = asyncio.run(mock_db.list_collection_names())
    assert set(COLLECTIONS) <= set(names)
    user_indexes = asyncio.run(mock_db["users"].index_information())
    assert any(ix.get("unique") and ix["key"] == [("email", 1)] for ix in user_indexes.values())


def test_unknown_route_uses_envelope(client):
    body = client.get("/api/v1/nope").json()
    assert body["success"] is False and body["error"]["code"] == "http_404"
