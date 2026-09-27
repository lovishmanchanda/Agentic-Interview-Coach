import pytest

from app.config import Settings
from app.utils.exceptions import AuthError
from app.utils.security import create_token, decode_token, hash_password, hash_token_id, verify_password


def test_password_hash_roundtrip():
    hashed = hash_password("s3cret-pass")
    assert hashed != "s3cret-pass"
    assert verify_password("s3cret-pass", hashed)
    assert not verify_password("wrong", hashed)
    assert not verify_password("anything", "not-a-bcrypt-hash")


def test_token_roundtrip_and_type_check():
    settings = Settings(_env_file=None, app_env="test")
    token, jti, _ = create_token(settings, "user-1", "access", "admin")
    payload = decode_token(settings, token, "access")
    assert payload["sub"] == "user-1" and payload["role"] == "admin" and payload["jti"] == jti
    with pytest.raises(AuthError):
        decode_token(settings, token, "refresh")


def test_token_hash_is_stable_and_not_the_jti():
    assert hash_token_id("abc") == hash_token_id("abc") != "abc"


def test_prod_requires_strong_jwt_secret():
    with pytest.raises(ValueError):
        Settings(_env_file=None, app_env="prod", jwt_secret="short")
    Settings(_env_file=None, app_env="prod", jwt_secret="x" * 32)


def test_local_gets_dev_secret_and_fake_gateway():
    settings = Settings(_env_file=None, app_env="local")
    assert settings.jwt_secret and settings.fake_gateway
    assert not Settings(_env_file=None, app_env="dev", jwt_secret="x" * 32).fake_gateway


def test_inmemory_db_is_refused_outside_local():
    with pytest.raises(ValueError):
        Settings(_env_file=None, app_env="prod", jwt_secret="x" * 32, use_inmemory_db=True)
    assert Settings(_env_file=None, app_env="local", use_inmemory_db=True).use_inmemory_db


def test_relative_data_paths_are_anchored_to_project_root():
    from app.config import _REPO_ROOT
    settings = Settings(_env_file=None, app_env="test", chroma_path="data/chroma", seed_dir="data/seed")
    assert settings.chroma_path == str(_REPO_ROOT / "data" / "chroma")
    assert settings.seed_dir == str(_REPO_ROOT / "data" / "seed")
    assert Settings(_env_file=None, app_env="test", chroma_path="/tmp/x").chroma_path == "/tmp/x"
