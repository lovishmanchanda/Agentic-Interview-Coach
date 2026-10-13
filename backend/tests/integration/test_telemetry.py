"""Browser telemetry: what's stored (nothing personal), what's refused, the rate limit, and the admin summary."""
from fastapi.testclient import TestClient

from app.api.v1.admin import _p75
from app.api.v1.telemetry import normalize_path, scrub
from app.main import create_app
from tests.integration.test_walking_skeleton import _signup

URL = "/api/v1/telemetry"


def _client(settings, mock_db, gateway, **overrides):
    return TestClient(create_app(settings.model_copy(update={"admin_emails": ["boss@example.com"], **overrides}),
                                 db=mock_db, gateway=gateway))


def _stored(client):
    return client.portal.call(lambda: client.app.state.db["client_events"].find({}, {"_id": 0}).to_list(length=100))


def test_vitals_and_errors_are_stored_without_anything_personal(settings, mock_db, gateway):
    with _client(settings, mock_db, gateway) as client:
        response = client.post(URL, json={"events": [
            {"kind": "vital", "name": "LCP", "value": 1830.5, "rating": "good",
             "path": "/interview/report/9f3c2a1b0d4e5f67a8b9?tab=evidence#top"},
            {"kind": "error", "name": "TypeError", "path": "/dashboard",
             "message": "Cannot read 'x' for ada@example.com (token eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl)",
             "stack": "at f (https://interviewos.app/_next/chunk.js?v=123:1:2)"},
        ]})
        assert response.status_code == 204
        vital, error = _stored(client)
        assert vital["path"] == "/interview/report/:id"  # no IDs, no query string
        assert vital["value"] == 1830.5 and vital["rating"] == "good"
        assert "ada@example.com" not in error["message"] and "[email]" in error["message"]
        assert "eyJ" not in error["message"] and "[token]" in error["message"]
        assert "?v=123" not in error["stack"]


def test_malformed_or_oversized_batches_are_refused(settings, mock_db, gateway):
    with _client(settings, mock_db, gateway) as client:
        assert client.post(URL, json={"events": []}).status_code == 422
        assert client.post(URL, json={"events": [{"kind": "click", "name": "x", "path": "/"}]}).status_code == 422
        assert client.post(URL, json={"events": [{"kind": "vital", "name": "LCP", "path": "/", "user_id": "u1"}]}).status_code == 422
        many = [{"kind": "vital", "name": "CLS", "value": 0.01, "path": "/"}] * 26
        assert client.post(URL, json={"events": many}).status_code == 422
        assert _stored(client) == []


def test_reports_are_rate_limited_per_visitor(settings, mock_db, gateway):
    with _client(settings, mock_db, gateway, telemetry_per_minute=2) as client:
        event = {"events": [{"kind": "vital", "name": "CLS", "value": 0.02, "path": "/"}]}
        assert [client.post(URL, json=event).status_code for _ in range(3)] == [204, 204, 429]


def test_admin_sees_p75_vitals_per_page_and_grouped_errors(settings, mock_db, gateway):
    with _client(settings, mock_db, gateway) as client:
        _, user = _signup(client, "ada@example.com")
        _, boss = _signup(client, "boss@example.com")
        lcp = [1200, 1500, 2100, 2600, 4200, 1800, 1600, 2000]
        client.post(URL, json={"events": [{"kind": "vital", "name": "LCP", "value": v, "path": "/",
                                           "rating": "good" if v <= 2500 else "poor"} for v in lcp]})
        client.post(URL, json={"events": [{"kind": "error", "name": "TypeError", "message": "boom", "path": p}
                                          for p in ("/dashboard", "/mentor", "/dashboard")]})

        assert client.get("/api/v1/admin/client-health", headers=user).status_code == 403
        data = client.get("/api/v1/admin/client-health", headers=boss).json()["data"]
        [row] = data["vitals"]
        assert row == {"path": "/", "name": "LCP", "samples": 8, "p75": 2100, "good_share": 0.75}
        [error] = data["errors"]
        assert error["count"] == 3 and error["paths"] == ["/dashboard", "/mentor"] and error["message"] == "boom"


def test_helpers():
    assert _p75([]) is None and _p75([5]) == 5 and _p75([1, 2, 3, 4]) == 3
    assert normalize_path("/mentor/c/0123456789abcdef0123?x=1") == "/mentor/c/:id"
    assert normalize_path("/interview/session/123e4567-e89b-12d3-a456-426614174000") == "/interview/session/:id"
    assert normalize_path("/dashboard") == "/dashboard"
    assert scrub(None, 10) is None and scrub("a" * 50, 10) == "a" * 10
