"""Synthetic test fixtures, including adversarial model responses.

These are test data for the backend only. The demo fixtures live in fixtures/discharge.
"""

import copy
import json
from pathlib import Path
from typing import Any

PAGE_ONE = (
    "SYNTHETIC DOCUMENT - NOT A REAL PATIENT\n"
    "Discharge instructions for a test patient.\n"
    "Medications:\n"
    "Amoxicillin 500 mg by mouth three times a day for 5 days.\n"
    "Ibuprofen 400 mg by mouth every 8 hours as needed for pain.\n"
    "Follow-up: See your primary care clinician within 7 days.\n"
    "Warning signs: Return if you have trouble breathing.\n"
    "Activity: Rest at home for 3 days.\n"
    "Diet: No restrictions."
)
PAGE_TWO_CONFLICT = (
    "Medication update: Amoxicillin 250 mg by mouth three times a day for 5 days."
)


def _cite(quote: str, page: int = 1) -> list[dict[str, Any]]:
    return [{"document_id": "discharge_summary", "page": page, "quote": quote}]


BASE_RESPONSE: dict[str, Any] = {
    "medications": [
        {
            "name": "Amoxicillin",
            "dose": "500",
            "unit": "mg",
            "route": "by mouth",
            "frequency": "three times a day",
            "duration": "5 days",
            "evidence_state": "supported",
            "citations": _cite("Amoxicillin 500 mg by mouth three times a day for 5 days."),
        },
        {
            "name": "Ibuprofen",
            "dose": "400",
            "unit": "mg",
            "route": "by mouth",
            "frequency": "every 8 hours as needed for pain",
            "duration": None,
            "evidence_state": "supported",
            "citations": _cite("Ibuprofen 400 mg by mouth every 8 hours as needed for pain."),
        },
    ],
    "follow_up": [
        {
            "instruction": "See your primary care clinician",
            "timeframe": "within 7 days",
            "evidence_state": "supported",
            "citations": _cite("See your primary care clinician within 7 days."),
        }
    ],
    "warning_signs": [
        {
            "text": "Trouble breathing",
            "evidence_state": "supported",
            "citations": _cite("Return if you have trouble breathing."),
        }
    ],
    "activity": {
        "text": "Rest at home for 3 days.",
        "evidence_state": "supported",
        "citations": _cite("Rest at home for 3 days."),
    },
    "diet": {
        "text": "No restrictions.",
        "evidence_state": "supported",
        "citations": _cite("Diet: No restrictions."),
    },
    "patient_summary": "You are going home. Rest and watch for the warning signs below.",
    "uncertainties": [{"field": "medications[1].duration", "note": "Duration is not stated."}],
}


def _response(**changes: Any) -> dict[str, Any]:
    response = copy.deepcopy(BASE_RESPONSE)
    response.update(changes)
    return response


def _medication(index: int, **changes: Any) -> list[dict[str, Any]]:
    medications = copy.deepcopy(BASE_RESPONSE["medications"])
    medications[index].update(changes)
    return medications


FIXTURES: dict[str, dict[str, Any]] = {
    "fx01_clear": {"response": _response()},
    "fx02_conflict": {
        "pages": [PAGE_ONE, PAGE_TWO_CONFLICT],
        "response": _response(
            medications=_medication(
                0,
                dose=None,
                evidence_state="conflicting",
                citations=_cite("Amoxicillin 500 mg by mouth three times a day for 5 days.")
                + _cite(
                    "Amoxicillin 250 mg by mouth three times a day for 5 days.", page=2
                ),
            )
        ),
    },
    "fx03_timeout": {"behavior": "timeout"},
    "fx04_invalid_json": {"behavior": "invalid_json"},
    "fx05_altered_dose": {"response": _response(medications=_medication(0, dose="50"))},
    "fx06_fake_quote": {
        "response": _response(
            medications=_medication(
                0, citations=_cite("Amoxicillin 500 mg by mouth twice a day for 5 days.")
            )
        )
    },
    "fx07_injected_status": {"response": {**_response(), "status": "approved"}},
    "fx08_short": {"pages": ["SYNTHETIC DOCUMENT - NOT A REAL PATIENT\nRest."]},
}


def write_fixtures(directory: Path) -> None:
    for fixture_id, spec in FIXTURES.items():
        folder = directory / fixture_id
        folder.mkdir(parents=True, exist_ok=True)
        behavior = spec.get("behavior", "respond")
        meta = {
            "id": fixture_id,
            "title": fixture_id.replace("_", " "),
            "scenario": "clear",
            "description": "Backend test fixture.",
            "mock_behavior": behavior,
        }
        pages = spec.get("pages", [PAGE_ONE])
        document = {
            "document_id": "discharge_summary",
            "title": "Discharge summary",
            "pages": [{"page": i + 1, "text": text} for i, text in enumerate(pages)],
        }
        (folder / "fixture.json").write_text(json.dumps(meta), encoding="utf-8")
        (folder / "document.json").write_text(json.dumps(document), encoding="utf-8")
        if behavior == "respond":
            response = spec.get("response", BASE_RESPONSE)
            (folder / "mock_response.json").write_text(json.dumps(response), encoding="utf-8")
