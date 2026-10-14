"""Validate synthetic discharge fixtures without external dependencies."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures" / "discharge"
ID_PATTERN = re.compile(r"^fx\d{2}_[a-z0-9_]+$")
SCENARIOS = {"clear", "missing_fields", "contradictory", "prompt_injection", "provider_failure"}
MOCK_BEHAVIORS = {"respond", "timeout", "invalid_json"}
EVIDENCE_STATES = {"supported", "missing", "ambiguous", "conflicting"}
OUTCOMES = {"approvable", "requires_resolution", "failed"}
BLOCK_REASONS = {
    "schema_invalid",
    "citation_not_found",
    "conflicting_field",
    "insufficient_text",
    "provider_error",
    "truncated_output",
}
MEDICATION_FIELDS = ("name", "dose", "unit", "route", "frequency", "duration")
REQUIRED_IDS = {
    "fx01_clear_pneumonia", "fx02_clear_wound_care", "fx03_missing_medication_details",
    "fx04_contradictory_lisinopril", "fx05_injection_attempt", "fx06_provider_failure",
}


def normalize(value: str) -> str:
    return " ".join(value.split())


def load_json(path: Path, errors: list[str]) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"{path.relative_to(ROOT)}: invalid JSON ({exc})")
        return None


def citations_in(value: Any) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    if isinstance(value, dict):
        citations = value.get("citations")
        if isinstance(citations, list):
            found.extend(item for item in citations if isinstance(item, dict))
        for child in value.values():
            found.extend(citations_in(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(citations_in(child))
    return found


def evidence_states_in(value: Any) -> list[Any]:
    found: list[Any] = []
    if isinstance(value, dict):
        if "evidence_state" in value:
            found.append(value["evidence_state"])
        for child in value.values():
            found.extend(evidence_states_in(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(evidence_states_in(child))
    return found


def check_fixture(folder: Path, errors: list[str]) -> None:
    prefix = folder.relative_to(ROOT).as_posix()
    required = ["fixture.json", "document.json", "expected.json"]
    for name in required:
        if not (folder / name).is_file():
            errors.append(f"{prefix}: missing {name}")
    if errors and any(error.startswith(prefix) and "missing" in error for error in errors):
        return
    fixture = load_json(folder / "fixture.json", errors)
    document = load_json(folder / "document.json", errors)
    expected = load_json(folder / "expected.json", errors)
    if not all(isinstance(item, dict) for item in (fixture, document, expected)):
        return
    fixture_id = fixture.get("id")
    if fixture_id != folder.name or not isinstance(fixture_id, str) or not ID_PATTERN.fullmatch(fixture_id):
        errors.append(f"{prefix}: fixture id must match its folder and {ID_PATTERN.pattern}")
    if fixture.get("scenario") not in SCENARIOS:
        errors.append(f"{prefix}: invalid scenario")
    if not isinstance(fixture.get("title"), str) or not isinstance(fixture.get("description"), str):
        errors.append(f"{prefix}: title and description must be strings")
    behavior = fixture.get("mock_behavior")
    if behavior not in MOCK_BEHAVIORS:
        errors.append(f"{prefix}: invalid mock_behavior")
    mock_path = folder / "mock_response.json"
    if behavior == "respond" and not mock_path.is_file():
        errors.append(f"{prefix}: respond fixtures require mock_response.json")
    if behavior != "respond" and mock_path.exists():
        errors.append(f"{prefix}: only respond fixtures may have mock_response.json")

    pages = document.get("pages")
    if not isinstance(pages, list) or not 1 <= len(pages) <= 3:
        errors.append(f"{prefix}: document must contain 1 to 3 pages")
        pages = []
    if pages:
        if [page.get("page") for page in pages if isinstance(page, dict)] != list(range(1, len(pages) + 1)):
            errors.append(f"{prefix}: page numbers must start at 1 and be consecutive")
        texts = [page.get("text") for page in pages if isinstance(page, dict)]
        if not all(isinstance(text, str) for text in texts):
            errors.append(f"{prefix}: every page needs text")
            texts = []
        if texts and not texts[0].startswith("SYNTHETIC DOCUMENT - NOT A REAL PATIENT"):
            errors.append(f"{prefix}: first page must start with the synthetic document line")
        if sum(len(text) for text in texts) > 6000:
            errors.append(f"{prefix}: document exceeds 6000 characters")
    else:
        texts = []

    if expected.get("fixture_id") != fixture_id:
        errors.append(f"{prefix}: expected fixture_id does not match")
    if expected.get("expected_outcome") not in OUTCOMES:
        errors.append(f"{prefix}: invalid expected_outcome")
    block_reasons = expected.get("expected_block_reasons")
    if not isinstance(block_reasons, list) or any(reason not in BLOCK_REASONS for reason in block_reasons):
        errors.append(f"{prefix}: invalid expected_block_reasons")
    for field in ("follow_up_count", "warning_signs_count"):
        if not isinstance(expected.get(field), int) or expected[field] < 0:
            errors.append(f"{prefix}: {field} must be a non-negative integer")
    document_text = normalize("\n".join(texts))
    medications = expected.get("medications")
    if not isinstance(medications, list):
        errors.append(f"{prefix}: expected medications must be a list")
    else:
        for index, medication in enumerate(medications):
            if not isinstance(medication, dict):
                errors.append(f"{prefix}: expected medication {index} must be an object")
                continue
            if medication.get("evidence_state") not in EVIDENCE_STATES:
                errors.append(f"{prefix}: medication {index} has invalid evidence_state")
            for field in MEDICATION_FIELDS:
                value = medication.get(field)
                if value is not None and (not isinstance(value, str) or normalize(value) not in document_text):
                    errors.append(f"{prefix}: medication {index} {field} is not verbatim in the document")

    forbidden = expected.get("forbidden_output_substrings")
    if not isinstance(forbidden, list) or not all(isinstance(item, str) for item in forbidden):
        errors.append(f"{prefix}: forbidden_output_substrings must be a list of strings")
    if fixture.get("scenario") == "provider_failure" and expected.get("expected_outcome") != "failed":
        errors.append(f"{prefix}: provider_failure fixtures must have failed expected_outcome")
    if fixture.get("scenario") == "contradictory" and "conflicting_field" not in block_reasons:
        errors.append(f"{prefix}: contradictory fixtures must block on conflicting_field")
    if fixture.get("scenario") == "prompt_injection" and not forbidden:
        errors.append(f"{prefix}: prompt_injection fixtures need forbidden output substrings")
    if behavior == "respond" and mock_path.is_file():
        mock = load_json(mock_path, errors)
        if not isinstance(mock, dict):
            return
        page_text = {
            page["page"]: normalize(page["text"])
            for page in pages
            if isinstance(page, dict) and isinstance(page.get("text"), str)
        }
        for item in citations_in(mock):
            page = item.get("page")
            quote = item.get("quote")
            if (
                item.get("document_id") != document.get("document_id")
                or not isinstance(page, int)
                or not isinstance(quote, str)
            ):
                errors.append(f"{prefix}: citation has invalid document_id, page, or quote")
            elif normalize(quote) not in page_text.get(page, ""):
                errors.append(f"{prefix}: citation quote is not verbatim on page {page}")
        for state in evidence_states_in(mock):
            if state not in EVIDENCE_STATES:
                errors.append(f"{prefix}: mock response has invalid evidence_state")


def main() -> int:
    errors: list[str] = []
    folders = sorted(path for path in FIXTURES.iterdir() if path.is_dir()) if FIXTURES.exists() else []
    ids = {folder.name for folder in folders}
    missing = REQUIRED_IDS - ids
    extra = ids - REQUIRED_IDS
    for fixture_id in sorted(missing):
        errors.append(f"fixtures/discharge: missing required fixture {fixture_id}")
    for fixture_id in sorted(extra):
        errors.append(f"fixtures/discharge: unexpected fixture {fixture_id}")
    for folder in folders:
        check_fixture(folder, errors)
    if errors:
        print("Fixture validation failed:")
        print("\n".join(f"- {error}" for error in errors))
        return 1
    print(f"Fixture validation passed: {len(folders)} fixtures")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
