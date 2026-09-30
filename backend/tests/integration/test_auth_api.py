from app.config import Settings
from app.utils.security import create_token


def test_register_returns_user_and_tokens_without_password_hash(register):
    _, data = register()
    assert data["user"]["email"] == "ada@example.com"
    assert data["user"]["role"] == "user"
    assert "password_hash" not in data["user"]
    assert data["tokens"]["token_type"] == "bearer"


def test_register_duplicate_email_is_409_case_insensitive(client, register):
    register(email="ada@example.com")
    response = client.post("/api/v1/auth/register",
                           json={"email": "ADA@example.com", "password": "another-pass-1", "name": "Ada 2"})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "email_taken"


def test_register_validation_error_uses_envelope(client):
    response = client.post("/api/v1/auth/register", json={"email": "not-an-email", "password": "short", "name": ""})
    body = response.json()
    assert response.status_code == 422
    assert body["success"] is False and body["error"]["code"] == "validation_error"
    assert body["meta"]["request_id"]


def test_password_over_bcrypt_limit_rejected(client):
    response = client.post("/api/v1/auth/register", json={"email": "a@b.co", "password": "x" * 73, "name": "A"})
    assert response.status_code == 422


def test_login_success_and_wrong_password(client, register):
    register()
    good = client.post("/api/v1/auth/login", json={"email": "ada@example.com", "password": "correct-horse-1"})
    assert good.status_code == 200
    assert good.json()["data"]["user"]["last_login"] is not None

    bad = client.post("/api/v1/auth/login", json={"email": "ada@example.com", "password": "wrong-password"})
    unknown = client.post("/api/v1/auth/login", json={"email": "nobody@example.com", "password": "whatever-1"})
    # Same error for wrong password and unknown email: no account enumeration.
    assert bad.status_code == unknown.status_code == 401
    assert bad.json()["error"] == unknown.json()["error"]


def test_users_me_requires_valid_access_token(client, register):
    headers, _ = register()
    assert client.get("/api/v1/users/me", headers=headers).json()["data"]["name"] == "Ada"
    assert client.get("/api/v1/users/me").status_code == 401
    assert client.get("/api/v1/users/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_refresh_token_cannot_be_used_as_access_token(client, register):
    _, data = register()
    headers = {"Authorization": f"Bearer {data['tokens']['refresh_token']}"}
    assert client.get("/api/v1/users/me", headers=headers).status_code == 401


def test_expired_access_token_is_rejected(client, register, settings):
    _, data = register()
    expired_settings = settings.model_copy(update={"access_token_minutes": -1})
    token, _, _ = create_token(expired_settings, data["user"]["id"], "access")
    response = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "token_expired"


def test_token_signed_with_other_secret_is_rejected(client, register):
    _, data = register()
    other = Settings(_env_file=None, app_env="test", jwt_secret="a-completely-different-secret-0123456789")
    token, _, _ = create_token(other, data["user"]["id"], "access")
    assert client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_refresh_rotates_and_reuse_revokes_all_sessions(client, register):
    _, data = register()
    first_refresh = data["tokens"]["refresh_token"]

    rotated = client.post("/api/v1/auth/refresh", json={"refresh_token": first_refresh})
    assert rotated.status_code == 200
    second_refresh = rotated.json()["data"]["refresh_token"]
    assert second_refresh != first_refresh

    # Reusing the old token = likely theft: rejected, and the new one is revoked too.
    reuse = client.post("/api/v1/auth/refresh", json={"refresh_token": first_refresh})
    assert reuse.status_code == 401 and reuse.json()["error"]["code"] == "refresh_reused"
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": second_refresh}).status_code == 401


def test_logout_invalidates_refresh_token(client, register):
    _, data = register()
    refresh = data["tokens"]["refresh_token"]
    assert client.post("/api/v1/auth/logout", json={"refresh_token": refresh}).status_code == 200
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": refresh}).status_code == 401
    # Logging out twice (or with junk) is harmless.
    assert client.post("/api/v1/auth/logout", json={"refresh_token": "junk"}).status_code == 200


COOKIE = {"X-Auth-Mode": "cookie"}


def test_cookie_mode_keeps_the_refresh_token_out_of_javascripts_reach(client):
    created = client.post("/api/v1/auth/register", headers=COOKIE,
                          json={"email": "c@example.com", "password": "correct-horse-1", "name": "C"})
    assert created.status_code == 201
    assert created.json()["data"]["tokens"]["refresh_token"] is None  # not in the body
    set_cookie = created.headers["set-cookie"].lower()
    assert "aic_refresh=" in set_cookie and "httponly" in set_cookie and "path=/api/v1/auth" in set_cookie
    assert "samesite=lax" in set_cookie

    first = client.cookies.get("aic_refresh")
    refreshed = client.post("/api/v1/auth/refresh", headers={**COOKIE, "Origin": "http://localhost:3000"})
    assert refreshed.status_code == 200 and refreshed.json()["data"]["access_token"]
    assert refreshed.json()["data"]["refresh_token"] is None and client.cookies.get("aic_refresh") != first  # rotated

    # The old cookie is single-use: presenting it again revokes every session (reuse detection).
    client.cookies.set("aic_refresh", first, path="/api/v1/auth")
    assert client.post("/api/v1/auth/refresh", headers=COOKIE).json()["error"]["code"] == "refresh_reused"


def test_cookie_refresh_from_another_site_is_refused(client):
    client.post("/api/v1/auth/register", headers=COOKIE,
                json={"email": "d@example.com", "password": "correct-horse-1", "name": "D"})
    evil = client.post("/api/v1/auth/refresh", headers={**COOKIE, "Origin": "https://evil.example"})
    assert evil.status_code == 403 and evil.json()["error"]["code"] == "bad_origin"


def test_logout_clears_the_cookie(client):
    client.post("/api/v1/auth/login", headers=COOKIE, json={"email": "e@example.com", "password": "x"})  # no account
    client.post("/api/v1/auth/register", headers=COOKIE,
                json={"email": "e@example.com", "password": "correct-horse-1", "name": "E"})
    assert client.post("/api/v1/auth/logout", headers=COOKIE).status_code == 200
    assert client.cookies.get("aic_refresh") is None
    missing = client.post("/api/v1/auth/refresh", headers=COOKIE)
    assert missing.status_code == 401 and missing.json()["error"]["code"] == "missing_token"
