from fastapi.testclient import TestClient


def test_health_reports_mock_mode(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "provider_mode": "mock"}


def test_ready_checks_mock_provider(client: TestClient) -> None:
    response = client.get("/ready")
    assert response.status_code == 200
    assert response.json()["status"] == "ready"
    assert response.json()["provider_mode"] == "mock"


def test_generic_example_uses_provider(client: TestClient) -> None:
    response = client.post("/example", json={"text": "A short generic example"})
    assert response.status_code == 200
    assert response.json() == {
        "text": "Mock response received 4 words.",
        "provider_mode": "mock",
    }


def test_example_rejects_empty_input(client: TestClient) -> None:
    response = client.post("/example", json={"text": ""})
    assert response.status_code == 422

