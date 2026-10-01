"""An unexpected server error still carries CORS headers, so the browser shows a real error, not "can't reach"."""
from fastapi.testclient import TestClient

from app.main import create_app


def test_a_crash_returns_the_500_envelope_with_cors_headers(settings, mock_db, gateway):
    app = create_app(settings.model_copy(update={"cors_origins": ["https://app.example.com"]}), db=mock_db, gateway=gateway)

    async def boom():
        raise RuntimeError("bug")

    app.add_api_route("/api/v1/_boom", boom)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/api/v1/_boom", headers={"Origin": "https://app.example.com"})
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "internal_error"
    assert "bug" not in response.text  # no internals leak
    assert response.headers["access-control-allow-origin"] == "https://app.example.com"
