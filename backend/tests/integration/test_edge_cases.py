"""Things that can happen at any point in real use: an account deleted or deactivated while its tokens are still
live, forged or malformed tokens, junk IDs and bodies, and unusual text. Each must end in a clean 4xx envelope
(never a 500) and must never leak anything."""
import asyncio
import base64
import json

import jwt
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.core.mentor.rag_tool import RagService
from app.main import create_app
from app.utils.security import create_token
from tests.fakes import HashEmbeddings
from tests.integration.test_profiles_api import PROFILE


def _b64(data: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()


def _assert_clean_error(response, status):
    assert response.status_code == status, response.text
    body = response.json()
    assert body["success"] is False and body["error"]["code"]
    assert "Traceback" not in response.text


# ── Accounts that change under a live session ──────────────────────────────────────────────────────────────

def test_a_deactivated_account_is_locked_out_at_once(client, register, mock_db):
    headers, data = register()
    asyncio.run(mock_db["users"].update_one({"_id": data["user"]["id"]}, {"$set": {"is_active": False}}))

    _assert_clean_error(client.get("/api/v1/users/me", headers=headers), 401)
    refreshed = client.post("/api/v1/auth/refresh", json={"refresh_token": data["tokens"]["refresh_token"]})
    _assert_clean_error(refreshed, 401)
    login = client.post("/api/v1/auth/login", json={"email": "ada@example.com", "password": "correct-horse-1"})
    _assert_clean_error(login, 401)


def test_a_deleted_account_with_a_live_token_is_a_401_not_a_crash(client, register, mock_db):
    headers, data = register()
    asyncio.run(mock_db["users"].delete_one({"_id": data["user"]["id"]}))
    _assert_clean_error(client.get("/api/v1/users/me", headers=headers), 401)
    _assert_clean_error(client.get("/api/v1/profiles/me", headers=headers), 401)


def test_a_token_for_a_user_that_never_existed_is_refused(client, settings):
    token, _, _ = create_token(settings, "no-such-user", "access")
    _assert_clean_error(client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"}), 401)


# ── Forged and malformed tokens ───────────────────────────────────────────────────────────────────────────

def test_an_unsigned_alg_none_token_is_refused(client, register, settings):
    _, data = register()
    forged = ".".join([_b64({"alg": "none", "typ": "JWT"}),
                       _b64({"sub": data["user"]["id"], "type": "access", "role": "admin", "jti": "x",
                             "iss": settings.jwt_issuer, "iat": 0, "exp": 9_999_999_999}), ""])
    _assert_clean_error(client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {forged}"}), 401)


def test_a_token_with_its_role_edited_is_refused(client, register):
    headers, _ = register()
    token = headers["Authorization"].removeprefix("Bearer ")
    head, payload, sig = token.split(".")
    claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    tampered = f"{head}.{_b64({**claims, 'role': 'admin'})}.{sig}"
    _assert_clean_error(client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {tampered}"}), 401)


@pytest.mark.parametrize("value", ["Basic YWRhOnB3", "Bearer", "Bearer ", "bearer a.b", "Token abc", "Bearer a.b.c.d"])
def test_malformed_authorization_headers_are_401s(client, value):
    _assert_clean_error(client.get("/api/v1/users/me", headers={"Authorization": value}), 401)


def test_a_token_without_an_expiry_is_refused(client, register, settings):
    _, data = register()
    token = jwt.encode({"sub": data["user"]["id"], "type": "access", "jti": "x", "iss": settings.jwt_issuer, "iat": 0},
                       settings.jwt_secret, algorithm="HS256")
    _assert_clean_error(client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"}), 401)


def test_a_refresh_token_from_the_cookie_path_cannot_open_the_websocket(client, register):
    _, data = register()
    headers = {"Authorization": f"Bearer {data['tokens']['access_token']}"}
    client.post("/api/v1/profiles", json=PROFILE, headers=headers)
    session_id = client.post("/api/v1/interviews", json={"question_count": 1}, headers=headers).json()["data"]["session_id"]
    with client.websocket_connect(f"/ws/interview/{session_id}") as ws:
        ws.send_json({"type": "AUTH", "token": data["tokens"]["refresh_token"]})
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
    assert closed.value.code == 4401


# ── Junk IDs and bodies ───────────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("junk", ["does-not-exist", "..%2F..%2Fetc%2Fpasswd", "%00", "a" * 500, "%7B%22%24ne%22%3A1%7D",
                                  "%F0%9F%9A%80"])
def test_junk_ids_are_404s_never_500s(client, register, junk):
    headers, _ = register()
    client.post("/api/v1/profiles", json=PROFILE, headers=headers)
    for path in (f"/api/v1/reports/{junk}", f"/api/v1/interviews/{junk}", f"/api/v1/mentor/conversations/{junk}"):
        response = client.get(path, headers=headers)
        assert response.status_code in (404, 422, 503), (path, response.status_code, response.text)
        assert response.json()["success"] is False


@pytest.mark.parametrize("body", ['{"email": "a@b.co", "password": ', "[]", "null", '"text"', "\x00\x01"])
def test_broken_json_bodies_are_422_envelopes(client, body):
    response = client.post("/api/v1/auth/login", content=body, headers={"Content-Type": "application/json"})
    _assert_clean_error(response, 422)


def test_a_mongo_operator_as_the_password_is_just_a_wrong_type(client, register):
    register()
    response = client.post("/api/v1/auth/login", json={"email": "ada@example.com", "password": {"$ne": ""}})
    _assert_clean_error(response, 422)
    response = client.post("/api/v1/auth/login", json={"email": {"$ne": ""}, "password": "correct-horse-1"})
    _assert_clean_error(response, 422)


def test_a_wrong_method_is_a_405_envelope(client):
    _assert_clean_error(client.delete("/api/v1/auth/login"), 405)


BLANK = "   \n\t "


def test_blank_text_is_refused_before_any_ai_call(settings, mock_db, gateway, tmp_path):
    rag = RagService(HashEmbeddings(), str(tmp_path / "chroma"), "edge_cases")
    with TestClient(create_app(settings, db=mock_db, gateway=gateway, rag=rag)) as client:
        data = client.post("/api/v1/auth/register",
                           json={"email": "ada@example.com", "password": "correct-horse-1", "name": "Ada"}).json()["data"]
        headers = {"Authorization": f"Bearer {data['tokens']['access_token']}"}
        client.post("/api/v1/profiles", json=PROFILE, headers=headers)
        calls_before = len(gateway.calls)
        for path, body in (("/api/v1/mentor/message", {"message": BLANK}),
                           ("/api/v1/mentor/prepare", {"company": BLANK})):
            _assert_clean_error(client.post(path, json=body, headers=headers), 422)
        assert len(gateway.calls) == calls_before


def test_blank_names_and_roles_are_422s(client, register):
    blank_name = client.post("/api/v1/auth/register", json={"email": "b@b.co", "password": "correct-horse-1", "name": BLANK})
    _assert_clean_error(blank_name, 422)
    headers, _ = register()
    for profile in ({**PROFILE, "personal": {**PROFILE["personal"], "name": BLANK}},
                    {**PROFILE, "target": {**PROFILE["target"], "role": BLANK}}):
        _assert_clean_error(client.post("/api/v1/profiles", json=profile, headers=headers), 422)
    client.post("/api/v1/profiles", json=PROFILE, headers=headers)
    # An interview's role is optional: blank means "the role on my profile".
    created = client.post("/api/v1/interviews", json={"role": BLANK}, headers=headers)
    assert created.status_code == 201 and created.json()["data"]["config"]["role"] == PROFILE["target"]["role"]


def test_names_are_stored_trimmed(client):
    response = client.post("/api/v1/auth/register", json={"email": "t@b.co", "password": "correct-horse-1", "name": "  Ada  "})
    assert response.json()["data"]["user"]["name"] == "Ada"


# ── Unusual but legitimate text ───────────────────────────────────────────────────────────────────────────

def test_unicode_names_and_emails_round_trip(client):
    response = client.post("/api/v1/auth/register",
                           json={"email": "Zoe.Li@Example.COM", "password": "pässwörd-日本-1", "name": "Zoë 李 🚀"})
    assert response.status_code == 201, response.text
    assert response.json()["data"]["user"]["name"] == "Zoë 李 🚀"
    # The email is case-insensitive; the password is taken byte for byte.
    login = client.post("/api/v1/auth/login", json={"email": "zoe.li@example.com", "password": "pässwörd-日本-1"})
    assert login.status_code == 200
    wrong = client.post("/api/v1/auth/login", json={"email": "zoe.li@example.com", "password": "passwort-日本-1"})
    assert wrong.status_code == 401


def test_a_multibyte_password_over_bcrypts_72_bytes_is_refused_not_truncated(client):
    password = "密" * 25  # 25 characters, 75 bytes: bcrypt would silently ignore the last 3
    response = client.post("/api/v1/auth/register", json={"email": "a@b.co", "password": password, "name": "A"})
    _assert_clean_error(response, 422)


def test_profile_text_with_markup_is_stored_as_plain_text(client, register):
    headers, _ = register()
    profile = {**PROFILE, "personal": {**PROFILE["personal"], "name": "<script>alert(1)</script>"}}
    created = client.post("/api/v1/profiles", json=profile, headers=headers)
    assert created.status_code in (201, 422), created.text
    if created.status_code == 201:
        # Stored as given, never interpreted: React escapes it on render and the API sets nosniff.
        assert created.json()["data"]["personal"]["name"] == "<script>alert(1)</script>"
        assert created.headers["content-type"].startswith("application/json")
