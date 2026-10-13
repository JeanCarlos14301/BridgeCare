from fastapi.testclient import TestClient


def test_health_reports_mock_mode(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "provider_mode": "mock", "inference_host": None}


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


def test_responses_carry_server_generated_request_id(client: TestClient) -> None:
    response = client.get("/health", headers={"X-Request-ID": "client-supplied"})
    request_id = response.headers["X-Request-ID"]
    assert request_id != "client-supplied"
    assert len(request_id) == 32
    assert request_id != client.get("/health").headers["X-Request-ID"]

