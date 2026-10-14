import time
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.sessions import SESSION_COOKIE
from app.main import app
from app.services.cases import mark_interrupted_jobs

PASSWORD = "test-reviewer-password"


def _login(client: TestClient) -> None:
    assert client.post("/session/login", json={"password": PASSWORD}).status_code == 200


def _create(client: TestClient, fixture_id: str) -> dict[str, Any]:
    response = client.post("/cases/from-fixture", json={"fixture_id": fixture_id})
    assert response.status_code == 201, response.text
    return response.json()  # type: ignore[no-any-return]


def _process(client: TestClient, fixture_id: str) -> dict[str, Any]:
    case = _create(client, fixture_id)
    response = client.post(f"/cases/{case['case_id']}/process")
    assert response.status_code == 200, response.text
    return response.json()  # type: ignore[no-any-return]


def _review(
    client: TestClient, case: dict[str, Any], decision: str = "approve", note: str | None = None
) -> Any:
    revision = case["revision"]
    return client.post(
        f"/cases/{case['case_id']}/review",
        json={
            "revision_id": revision["revision_id"],
            "content_hash": revision["content_hash"],
            "decision": decision,
            "resolution_note": note,
        },
    )


def _codes(case: dict[str, Any]) -> set[str]:
    return {reason["code"] for reason in case["revision"]["gate"]["blocking_reasons"]}


# --- happy path ---


def test_fixtures_require_a_session(client: TestClient) -> None:
    assert client.get("/fixtures").status_code == 401
    client.post("/session")
    ids = [fixture["id"] for fixture in client.get("/fixtures").json()]
    assert "fx01_clear" in ids


def test_clear_case_flows_from_fixture_to_patient_view(client: TestClient) -> None:
    _login(client)
    case = _process(client, "fx01_clear")
    assert case["status"] == "needs_review"
    revision = case["revision"]
    assert revision["provider_mode"] == "mock"
    assert revision["gate"] == {
        "approvable": True,
        "requires_resolution_note": False,
        "blocking_reasons": [],
    }
    assert revision["timings"]["model_ms"] is not None
    assert case["source_documents"][0]["pages"][0]["text"].startswith("SYNTHETIC DOCUMENT")

    case_id = case["case_id"]
    assert client.get(f"/cases/{case_id}/patient-view").status_code == 409
    approved = _review(client, case)
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"

    view = client.get(f"/cases/{case_id}/patient-view")
    assert view.status_code == 200
    body = view.json()
    assert body["content_hash"] == revision["content_hash"]
    expected_rows = [
        {key: medication[key] for key in ("name", "dose", "unit", "route", "frequency", "duration")}
        for medication in revision["extracted_fields"]["medications"]
    ]
    assert body["medications"] == expected_rows


def test_content_hash_is_stable_and_returned(client: TestClient) -> None:
    _login(client)
    case = _process(client, "fx01_clear")
    again = client.get(f"/cases/{case['case_id']}").json()
    assert again["revision"]["content_hash"] == case["revision"]["content_hash"]
    assert len(case["revision"]["content_hash"]) == 64


# --- authorization ---


def test_other_sessions_get_404(client: TestClient) -> None:
    client.post("/session")
    case = _create(client, "fx01_clear")
    client.cookies.clear()
    client.post("/session")
    for method, path in (
        ("GET", f"/cases/{case['case_id']}"),
        ("POST", f"/cases/{case['case_id']}/process"),
        ("GET", f"/cases/{case['case_id']}/patient-view"),
        ("DELETE", f"/cases/{case['case_id']}"),
    ):
        assert client.request(method, path).status_code == 404, path
    assert client.get("/cases").json() == []


def test_login_after_creating_a_case_keeps_the_case(client: TestClient) -> None:
    client.post("/session")
    visitor_token = client.cookies[SESSION_COOKIE]
    case = _process(client, "fx01_clear")
    _login(client)
    reloaded = client.get(f"/cases/{case['case_id']}")
    assert reloaded.status_code == 200
    assert _review(client, reloaded.json()).status_code == 200
    # The old visitor token is revoked and cannot reach the case.
    client.cookies.set(SESSION_COOKIE, visitor_token)
    assert client.get(f"/cases/{case['case_id']}").status_code == 401


def test_visitors_cannot_review_or_edit(client: TestClient) -> None:
    client.post("/session")
    case = _process(client, "fx01_clear")
    assert _review(client, case).status_code == 403
    revision = case["revision"]
    response = client.patch(
        f"/cases/{case['case_id']}/draft",
        json={
            "revision_id": revision["revision_id"],
            "content_hash": revision["content_hash"],
            "extracted_fields": revision["extracted_fields"],
            "patient_draft": revision["patient_draft"],
        },
    )
    assert response.status_code == 403


def test_request_body_cannot_set_status(client: TestClient) -> None:
    _login(client)
    case = _process(client, "fx01_clear")
    revision = case["revision"]
    response = client.post(
        f"/cases/{case['case_id']}/review",
        json={
            "revision_id": revision["revision_id"],
            "content_hash": revision["content_hash"],
            "decision": "approve",
            "status": "approved",
        },
    )
    assert response.status_code == 422


# --- approval binding and invalidation ---


def test_stale_revision_cannot_be_approved(client: TestClient) -> None:
    _login(client)
    case = _process(client, "fx01_clear")
    stale = {**case, "revision": {**case["revision"], "content_hash": "0" * 64}}
    assert _review(client, stale).status_code == 409
    assert client.get(f"/cases/{case['case_id']}").json()["status"] == "needs_review"


def test_edit_after_approval_invalidates_patient_view(client: TestClient) -> None:
    _login(client)
    case = _process(client, "fx01_clear")
    assert _review(client, case).status_code == 200
    revision = case["revision"]
    fields = revision["extracted_fields"]
    fields["activity"]["text"] = "Rest at home for 3 days."
    edited = client.patch(
        f"/cases/{case['case_id']}/draft",
        json={
            "revision_id": revision["revision_id"],
            "content_hash": revision["content_hash"],
            "extracted_fields": fields,
            "patient_draft": {"summary": "Edited by the reviewer."},
        },
    )
    assert edited.status_code == 200
    body = edited.json()
    assert body["status"] == "needs_review"
    assert body["revision"]["origin"] == "reviewer_edit"
    assert body["revision"]["number"] == 2
    assert body["review"] is None
    assert client.get(f"/cases/{case['case_id']}/patient-view").status_code == 409
    # The old approval cannot be replayed against the new revision.
    assert _review(client, case).status_code == 409


def test_reprocessing_after_approval_invalidates_it(client: TestClient) -> None:
    _login(client)
    case = _process(client, "fx01_clear")
    assert _review(client, case).status_code == 200
    reprocessed = client.post(f"/cases/{case['case_id']}/process").json()
    assert reprocessed["status"] == "needs_review"
    assert reprocessed["revision"]["number"] == 2
    assert client.get(f"/cases/{case['case_id']}/patient-view").status_code == 409


# --- gate ---


def test_conflict_requires_a_resolution_note(client: TestClient) -> None:
    _login(client)
    case = _process(client, "fx02_conflict")
    assert _codes(case) == {"conflicting_field"}
    assert case["revision"]["gate"]["requires_resolution_note"] is True
    assert _review(client, case).status_code == 409
    assert _review(client, case, note="ok").status_code == 409
    approved = _review(client, case, note="Confirmed 250 mg with the discharging team.")
    assert approved.status_code == 200
    assert approved.json()["review"]["resolution_note"].startswith("Confirmed")


def test_altered_dose_blocks_approval(client: TestClient) -> None:
    _login(client)
    case = _process(client, "fx05_altered_dose")
    assert "medication_not_verbatim" in _codes(case)
    assert case["revision"]["gate"]["approvable"] is False
    response = _review(client, case, note="Trying to force approval anyway.")
    assert response.status_code == 409
    assert "medication_not_verbatim" in response.json()["detail"]


def test_nonexistent_citation_blocks_approval(client: TestClient) -> None:
    _login(client)
    case = _process(client, "fx06_fake_quote")
    assert "citation_not_found" in _codes(case)
    assert _review(client, case).status_code == 409


def test_rejection_does_not_unlock_patient_view(client: TestClient) -> None:
    _login(client)
    case = _process(client, "fx01_clear")
    assert _review(client, case, decision="reject").json()["status"] == "rejected"
    assert client.get(f"/cases/{case['case_id']}/patient-view").status_code == 409


# --- failures ---


@pytest.mark.parametrize(
    ("fixture_id", "reason"),
    [
        ("fx03_timeout", "provider_error"),
        ("fx04_invalid_json", "schema_invalid"),
        ("fx07_injected_status", "schema_invalid"),
        ("fx08_short", "insufficient_text"),
    ],
)
def test_processing_failures_are_explicit(
    client: TestClient, fixture_id: str, reason: str
) -> None:
    client.post("/session")
    case = _process(client, fixture_id)
    assert case["status"] == "failed"
    assert case["failure_reason"] == reason
    assert case["revision"] is None


def test_model_cannot_approve_its_own_output(client: TestClient) -> None:
    _login(client)
    case = _process(client, "fx07_injected_status")
    assert case["status"] == "failed"
    assert client.get(f"/cases/{case['case_id']}/patient-view").status_code == 409


def test_concurrent_processing_is_rejected(client: TestClient) -> None:
    client.post("/session")
    case = _create(client, "fx01_clear")
    with app.state.db_sessions() as db:
        db.execute(
            text("UPDATE cases SET status = 'processing' WHERE id = :id"), {"id": case["case_id"]}
        )
        db.commit()
    assert client.post(f"/cases/{case['case_id']}/process").status_code == 409


def test_interrupted_jobs_are_marked_failed(client: TestClient) -> None:
    client.post("/session")
    case = _create(client, "fx01_clear")
    with app.state.db_sessions() as db:
        db.execute(
            text("UPDATE cases SET status = 'processing' WHERE id = :id"), {"id": case["case_id"]}
        )
        db.commit()
        engine = db.get_bind()
    assert mark_interrupted_jobs(engine) >= 1  # type: ignore[arg-type]
    body = client.get(f"/cases/{case['case_id']}").json()
    assert body["status"] == "failed"
    assert body["failure_reason"] == "interrupted"


def test_unknown_fixture_is_404(client: TestClient) -> None:
    client.post("/session")
    response = client.post("/cases/from-fixture", json={"fixture_id": "../secrets"})
    assert response.status_code == 404


def test_delete_removes_the_case(client: TestClient) -> None:
    client.post("/session")
    case = _create(client, "fx01_clear")
    assert client.delete(f"/cases/{case['case_id']}").status_code == 204
    assert client.get(f"/cases/{case['case_id']}").status_code == 404


def test_logout_hides_cases(client: TestClient) -> None:
    client.post("/session")
    case = _create(client, "fx01_clear")
    token = client.cookies[SESSION_COOKIE]
    client.post("/session/logout")
    client.cookies.set(SESSION_COOKIE, token)
    assert client.get(f"/cases/{case['case_id']}").status_code == 401


# --- B-11 review timing and visitor quota ---


def test_review_records_duration_and_opened_at(client: TestClient) -> None:
    _login(client)
    case = _process(client, "fx01_clear")
    case_id = case["case_id"]

    # Opening the case in needs_review records opened_at
    opened = client.get(f"/cases/{case_id}").json()
    assert opened["status"] == "needs_review"

    # Save review decision
    approved = _review(client, opened)
    assert approved.status_code == 200
    review = approved.json()["review"]
    assert review is not None
    assert review["opened_at"] is not None
    assert isinstance(review["duration_ms"], (int, float))
    assert review["duration_ms"] >= 0.0

def test_review_without_opening_leaves_duration_and_opened_at_null(
    client: TestClient,
) -> None:
    _login(client)
    case = _process(client, "fx01_clear")
    # Directly review without calling GET /cases/{id}
    approved = _review(client, case)
    assert approved.status_code == 200
    review = approved.json()["review"]
    assert review is not None
    assert review["opened_at"] is None
    assert review["duration_ms"] is None


def test_visitor_processing_burst_rate_limit(client: TestClient) -> None:
    client.post("/session")
    case1 = _create(client, "fx01_clear")
    case2 = _create(client, "fx01_clear")
    case3 = _create(client, "fx01_clear")

    res1 = client.post(f"/cases/{case1['case_id']}/process")
    assert res1.status_code == 200

    res2 = client.post(f"/cases/{case2['case_id']}/process")
    assert res2.status_code == 200

    # 3rd rapid attempt by visitor within 60s exceeds burst limit
    res3 = client.post(f"/cases/{case3['case_id']}/process")
    assert res3.status_code == 429
    assert "rate limit exceeded" in res3.json()["detail"].lower()


def test_visitor_processing_lifetime_cap(client: TestClient) -> None:
    client.post("/session")
    case = _create(client, "fx01_clear")

    # Simulate visitor having already used 3 processing runs in their session
    service = client.app.state.case_service  # type: ignore[attr-defined]
    client.get("/cases")
    factory = client.app.state.db_sessions  # type: ignore[attr-defined]
    with factory() as db:
        visitor_session_id = db.execute(
            text("SELECT session_id FROM cases WHERE id = :id"), {"id": case["case_id"]}
        ).scalar_one()
    service._visitor_processings[visitor_session_id] = [0.0, 0.0, 0.0]

    res = client.post(f"/cases/{case['case_id']}/process")
    assert res.status_code == 429
    assert "maximum 3 runs per session" in res.json()["detail"]


def test_global_visitor_processing_rate_limit(client: TestClient) -> None:
    client.post("/session")
    service = client.app.state.case_service  # type: ignore[attr-defined]
    # Simulate 10 global visitor processings in the current sliding window
    now = time.monotonic()
    service._global_visitor_processings = [now] * 10

    case = _create(client, "fx01_clear")
    res = client.post(f"/cases/{case['case_id']}/process")
    assert res.status_code == 429
    assert "Global visitor processing limit reached" in res.json()["detail"]


def test_reviewers_are_exempt_from_visitor_quota(client: TestClient) -> None:
    _login(client)
    # Reviewer can process multiple cases without hitting visitor limits
    for _ in range(4):
        case = _create(client, "fx01_clear")
        res = client.post(f"/cases/{case['case_id']}/process")
        assert res.status_code == 200


def test_visitor_quota_not_consumed_on_409(client: TestClient) -> None:
    client.post("/session")
    case = _create(client, "fx01_clear")
    case_id = case["case_id"]

    service = client.app.state.case_service  # type: ignore[attr-defined]
    factory = client.app.state.db_sessions  # type: ignore[attr-defined]
    with factory() as db:
        visitor_session_id = db.execute(
            text("SELECT session_id FROM cases WHERE id = :id"), {"id": case_id}
        ).scalar_one()

    # Pre-mark case as processing so subsequent process attempt hits 409
    with factory() as db:
        db.execute(text("UPDATE cases SET status = 'processing' WHERE id = :id"), {"id": case_id})
        db.commit()

    # Attempt to process already processing case
    res_409 = client.post(f"/cases/{case_id}/process")
    assert res_409.status_code == 409
    assert "already processing" in res_409.json()["detail"].lower()

    # Quota should NOT have been counted for the 409 failure
    assert len(service._visitor_processings.get(visitor_session_id, [])) == 0


# --- Reviewer preview & localization ---


def test_preview_patient_view_before_approval(client: TestClient) -> None:
    _login(client)
    case = _process(client, "fx01_clear")
    case_id = case["case_id"]
    # Case is still in needs_review (not approved)
    assert case["status"] == "needs_review"

    # Regular patient-view is blocked with 409
    assert client.get(f"/cases/{case_id}/patient-view").status_code == 409

    # Reviewer preview works before approval in English
    preview_en = client.get(f"/cases/{case_id}/preview").json()
    assert preview_en["language"] == "en"
    assert preview_en["medications"][0]["name"] == "Amoxicillin"
    assert preview_en["medications"][0]["route"] == "by mouth"

    # Reviewer preview works before approval in Spanish
    preview_es = client.get(f"/cases/{case_id}/preview?lang=es").json()
    assert preview_es["language"] == "es"
    assert preview_es["medications"][0]["name"] == "Amoxicillin"
    assert preview_es["medications"][0]["route"] == "vía oral"
    assert "preparada con asistencia de IA" in preview_es["notice"]


def test_preview_requires_reviewer_role(client: TestClient) -> None:
    client.post("/session")
    case = _create(client, "fx01_clear")
    # Visitor cannot preview
    res = client.get(f"/cases/{case['case_id']}/preview")
    assert res.status_code in (401, 403)


# --- Spanish patient view localization ---


def test_patient_view_defaults_to_english(client: TestClient) -> None:
    _login(client)
    case = _process(client, "fx01_clear")
    _review(client, case)
    view = client.get(f"/cases/{case['case_id']}/patient-view").json()
    assert view["language"] == "en"
    assert "prepared with AI assistance" in view["notice"]
    assert view["medications"][0]["route"] == "by mouth"


def test_patient_view_spanish_localization(client: TestClient) -> None:
    _login(client)
    case = _process(client, "fx01_clear")
    _review(client, case)
    view_es = client.get(f"/cases/{case['case_id']}/patient-view?lang=es").json()
    assert view_es["language"] == "es"
    assert "preparada con asistencia de IA" in view_es["notice"]

    # Check medications
    med0 = view_es["medications"][0]
    assert med0["name"] == "Amoxicillin"  # drug name kept exact
    assert med0["dose"] == "500"  # dose kept exact
    assert med0["unit"] == "mg"  # unit kept exact
    assert med0["route"] == "vía oral"
    assert med0["frequency"] == "tres veces al día"
    assert "días" in med0["duration"]

    # Check warning signs
    assert "Dificultad para respirar" in view_es["warning_signs"]

    # Check activity & diet
    assert view_es["activity"] == "Descanse en casa durante 3 días."
    assert view_es["diet"] == "Sin restricciones."


def test_patient_view_spanish_preserves_untranslated_clinical_instructions(
    client: TestClient,
) -> None:
    _login(client)
    case = _process(client, "fx01_clear")
    fields = dict(case["revision"]["extracted_fields"])
    fields["follow_up"] = [
        {
            "instruction": "Cardiology follow-up in 2 weeks for echocardiogram review",
            "timeframe": "in 2 weeks",
            "evidence_state": "missing",
            "citations": [],
        }
    ]
    patch_res = client.patch(
        f"/cases/{case['case_id']}/draft",
        json={
            "revision_id": case["revision"]["revision_id"],
            "content_hash": case["revision"]["content_hash"],
            "extracted_fields": fields,
            "patient_draft": case["revision"]["patient_draft"],
        },
    )
    assert patch_res.status_code == 200
    updated_case = patch_res.json()
    _review(client, updated_case)

    view_es = client.get(f"/cases/{case['case_id']}/patient-view?lang=es").json()
    # Check that cardiology & echocardiogram details are NOT replaced with generic primary care text
    follow_up_es = view_es["follow_up"][0]["instruction"]
    assert "Cardiology" in follow_up_es
    assert "echocardiogram" in follow_up_es
    assert "[en]" in follow_up_es
    assert view_es["follow_up"][0]["timeframe"] == "en 2 semanas"


def test_patient_view_spanish_expanded_glossary(client: TestClient) -> None:
    _login(client)
    case = _process(client, "fx01_clear")
    fields = dict(case["revision"]["extracted_fields"])
    fields["warning_signs"] = [
        {"text": "Fainting", "evidence_state": "missing", "citations": []},
        {"text": "Swelling of the face", "evidence_state": "missing", "citations": []},
        {"text": "Drainage with a bad smell", "evidence_state": "missing", "citations": []},
    ]
    fields["activity"] = {
        "text": "Keep the dressing clean and dry.",
        "evidence_state": "missing",
        "citations": [],
    }
    fields["diet"] = {
        "text": "Resume usual meals as tolerated.",
        "evidence_state": "missing",
        "citations": [],
    }
    fields["follow_up"] = [
        {
            "instruction": "Arrange follow-up",
            "timeframe": "within 14 days",
            "evidence_state": "missing",
            "citations": [],
        }
    ]
    patch_res = client.patch(
        f"/cases/{case['case_id']}/draft",
        json={
            "revision_id": case["revision"]["revision_id"],
            "content_hash": case["revision"]["content_hash"],
            "extracted_fields": fields,
            "patient_draft": {
                "summary": (
                    "Follow wound-care instructions, use the listed medicines, "
                    "and attend follow-up."
                )
            },
        },
    )
    assert patch_res.status_code == 200
    updated_case = patch_res.json()
    _review(client, updated_case)

    view_es = client.get(f"/cases/{case['case_id']}/patient-view?lang=es").json()
    # Verify no unwanted [en] markers on translated terms
    assert view_es["warning_signs"] == [
        "Desmayos o pérdida del conocimiento",
        "Hinchazón de la cara",
        "Secreción o drenaje con mal olor",
    ]
    assert view_es["activity"] == "Mantenga el vendaje limpio y seco."
    assert view_es["diet"] == "Reanude sus comidas habituales según tolere."
    assert view_es["follow_up"][0]["instruction"] == "Coordine una cita de seguimiento"
    assert view_es["follow_up"][0]["timeframe"] == "dentro de 14 días"
    assert "Siga las instrucciones para el cuidado de heridas" in view_es["summary"]


