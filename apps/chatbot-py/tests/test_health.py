"""Smoke test for the /health endpoint."""

from datetime import datetime

import pytest
from app.main import app
from fastapi.testclient import TestClient


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/health/")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "regalica-chatbot-py"
    assert isinstance(payload["uptime"], (int, float))
    assert payload["uptime"] >= 0
    assert isinstance(payload["timestamp"], str)
    datetime.fromisoformat(payload["timestamp"])
    assert isinstance(payload["version"], str)
