import pytest
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

from app.config import Settings
from app.gateway import FakeAIGateway
from app.main import create_app


@pytest.fixture
def settings() -> Settings:
    # _env_file=None: tests never read the developer's .env
    return Settings(_env_file=None, app_env="test", hf_token="", log_level="WARNING")


@pytest.fixture
def mock_db():
    return AsyncMongoMockClient()["interview_coach_test"]


@pytest.fixture
def gateway() -> FakeAIGateway:
    return FakeAIGateway(session_token_budget=1_000)


@pytest.fixture
def client(settings, mock_db, gateway):
    app = create_app(settings, db=mock_db, gateway=gateway)
    with TestClient(app) as test_client:  # runs lifespan (schema setup)
        yield test_client


@pytest.fixture
def register(client):
    """Registers a user and returns (auth_headers, response_data)."""
    def _register(email="ada@example.com", password="correct-horse-1", name="Ada"):
        response = client.post("/api/v1/auth/register", json={"email": email, "password": password, "name": name})
        assert response.status_code == 201, response.text
        data = response.json()["data"]
        return {"Authorization": f"Bearer {data['tokens']['access_token']}"}, data
    return _register
