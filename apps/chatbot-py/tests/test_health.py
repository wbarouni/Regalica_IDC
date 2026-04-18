"""Smoke test for the /health endpoint."""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/health/")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "regalica-chatbot-py"
    assert "uptime" in payload
    assert "timestamp" in payload
    assert "version" in payload
