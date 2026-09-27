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
