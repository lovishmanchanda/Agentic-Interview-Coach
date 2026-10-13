"""Browser telemetry: what's stored (nothing personal), what's refused, the rate limit, and the admin summary."""
from fastapi.testclient import TestClient

from app.api.v1.admin import _p75
from app.api.v1.telemetry import code_frames, error_type, fingerprint, normalize_path
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
            {"kind": "error", "name": "SyntaxError", "path": "/dashboard",
             "message": 'Unexpected token "my answer: a hash map with chaining" for ada@example.com '
                        "(token eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl) in JSON at position 1234",
             "stack": "SyntaxError: my answer: a hash map\n    at parse (https://interviewos.app/_next/chunk.js?v=123:1:2)"},
        ]})
        assert response.status_code == 204
        vital, error = _stored(client)
        assert vital["path"] == "/interview/report/:id"  # no IDs, no query string
        assert vital["value"] == 1830.5 and vital["rating"] == "good"
        # Never free text: a known error keeps only its template; nothing the user typed survives.
        assert error["message"] == "JSON parse error"
        assert error["stack"] == "parse (/_next/chunk.js:1:2)"
        assert "hash map" not in error["message"] + error["stack"]


def test_malformed_or_oversized_batches_are_refused(settings, mock_db, gateway):
    with _client(settings, mock_db, gateway) as client:
        assert client.post(URL, json={"events": []}).status_code == 422
        assert client.post(URL, json={"events": [{"kind": "click", "name": "x", "path": "/"}]}).status_code == 422
        assert client.post(URL, json={"events": [{"kind": "vital", "name": "LCP", "path": "/", "user_id": "u1"}]}).status_code == 422
        # A vital must be a known metric with a value (so it can't fill the admin's sample window with junk).
        assert client.post(URL, json={"events": [{"kind": "vital", "name": "LCP", "path": "/"}]}).status_code == 422
        assert client.post(URL, json={"events": [{"kind": "vital", "name": "FID", "value": 3, "path": "/"}]}).status_code == 422
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
        client.post(URL, json={"events": [{"kind": "error", "name": "TypeError", "message": "save is not a function", "path": p}
                                          for p in ("/dashboard", "/mentor", "/dashboard")]})

        assert client.get("/api/v1/admin/client-health", headers=user).status_code == 403
        data = client.get("/api/v1/admin/client-health", headers=boss).json()["data"]
        assert data["vital_samples"] == 8 and data["vitals_capped"] is False
        [row] = data["vitals"]
        assert row == {"path": "/", "name": "LCP", "samples": 8, "p75": 2100, "good_share": 0.75}
        [error] = data["errors"]
        assert error["count"] == 3 and error["paths"] == ["/dashboard", "/mentor"] and error["message"] == "save is not a function"


def test_helpers():
    assert _p75([]) is None and _p75([5]) == 5 and _p75([1, 2, 3, 4]) == 3
    assert normalize_path("/mentor/c/0123456789abcdef0123?x=1") == "/mentor/c/:id"
    assert normalize_path("/interview/session/123e4567-e89b-12d3-a456-426614174000") == "/interview/session/:id"
    assert normalize_path("/dashboard") == "/dashboard"
    assert fingerprint(None) is None


def test_errors_keep_known_templates_and_hash_everything_else():
    # Known browser / library errors keep their template, with code names only.
    assert fingerprint("Cannot read properties of undefined (reading 'map')") == "Cannot read properties of undefined (reading 'map')"
    assert fingerprint("handleSubmit is not a function") == "handleSubmit is not a function"
    assert fingerprint("Minified React error #418; visit https://react.dev/errors/418?args[]=secret") == "Minified React error #418"
    assert fingerprint("Loading chunk 8123-abc failed.") == "Loading chunk failed"
    assert fingerprint('Unexpected token "my answer" in JSON at position 12') == "JSON parse error"
    # Anything else, quoted or not, single word or sentence, is a one-way hash: identical errors still group.
    for text in ["my secret answer is hashing", "Value of 'privateAnswer' was wrong", '"privateAnswer"', "x " * 500]:
        stored = fingerprint(text)
        assert stored.startswith("Unrecognised error message #") and len(stored) == len("Unrecognised error message #") + 12
        assert "secret" not in stored and "privateAnswer" not in stored
    assert fingerprint("my secret answer") == fingerprint("my  secret   answer")  # same error, same group
    assert fingerprint("my secret answer") != fingerprint("another message")
    # The error's type is an identifier, or just "Error"; stack paths lose IDs too.
    assert error_type("ChunkLoadError") == "ChunkLoadError" and error_type("my answer: x") == "Error"
    assert code_frames("at f (https://x.app/interview/report/0123456789abcdef0123:1:2)") == "f (/interview/report/:id:1:2)"
    assert code_frames("no frames here") is None
    assert code_frames("render@https://x.app/_next/c.js:5:6") == "render (/_next/c.js:5:6)"
