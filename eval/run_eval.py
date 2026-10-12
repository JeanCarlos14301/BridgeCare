"""Run fixture-based evaluation against a live BridgeCare API."""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures" / "discharge"
REPORTS = Path(__file__).resolve().parent / "reports"
MEDICATION_FIELDS = ("name", "dose", "unit", "route", "frequency", "duration")


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def nested(value: Any, *keys: str) -> Any:
    for key in keys:
        if not isinstance(value, dict):
            return None
        value = value.get(key)
    return value


def current_content(case: dict[str, Any]) -> dict[str, Any]:
    for candidate in (case, nested(case, "current_revision"), nested(case, "revision")):
        if isinstance(candidate, dict):
            content = candidate.get("content")
            if isinstance(content, dict):
                return content
            return candidate
    return {}


def medications_from(case: dict[str, Any]) -> list[dict[str, Any]] | None:
    content = current_content(case)
    for key in ("extracted_fields", "fields"):
        fields = content.get(key)
        if isinstance(fields, dict) and isinstance(fields.get("medications"), list):
            return fields["medications"]
    if isinstance(content.get("medications"), list):
        return content["medications"]
    return None


def gate_from(case: dict[str, Any]) -> dict[str, Any] | None:
    content = current_content(case)
    gate = content.get("gate", case.get("gate"))
    return gate if isinstance(gate, dict) else None


def model_latency_ms(case: dict[str, Any]) -> float | int | None:
    timings = current_content(case).get("timings", case.get("timings"))
    if not isinstance(timings, dict):
        return None
    for key in ("model_latency_ms", "model_ms", "model_latency"):
        value = timings.get(key)
        if isinstance(value, (int, float)):
            return value
    return None


def case_id_from(payload: Any) -> str | None:
    if isinstance(payload, dict):
        for key in ("id", "case_id"):
            value = payload.get(key)
            if isinstance(value, str):
                return value
        case = payload.get("case")
        if isinstance(case, dict):
            return case_id_from(case)
    return None


def api_error(label: str, response: httpx.Response) -> str:
    return f"{label}: HTTP {response.status_code}: {response.text[:500]}"


def ratio(numerator: int, denominator: int) -> dict[str, int | None]:
    return {"numerator": numerator, "denominator": denominator, "percent": round(100 * numerator / denominator, 2) if denominator else None}


def run(base_url: str) -> dict[str, Any]:
    metrics = {field: {"numerator": 0, "denominator": 0} for field in MEDICATION_FIELDS}
    evidence = {"numerator": 0, "denominator": 0}
    outcome = {"numerator": 0, "denominator": 0}
    gate = {"numerator": 0, "denominator": 0}
    forbidden = {"found": 0, "checked": 0}
    cases: list[dict[str, Any]] = []
    errors: list[str] = []
    end_to_end_ms: list[float] = []
    model_ms: list[float] = []
    with httpx.Client(base_url=base_url.rstrip("/"), timeout=30.0) as client:
        session = client.post("/session")
        if session.status_code >= 400:
            errors.append(api_error("POST /session", session))
            return {"base_url": base_url, "errors": errors, "cases": cases, "metrics": {}}
        for folder in sorted(FIXTURES.iterdir()):
            if not folder.is_dir():
                continue
            fixture = load_json(folder / "fixture.json")
            expected = load_json(folder / "expected.json")
            result: dict[str, Any] = {"fixture_id": fixture["id"], "errors": []}
            started = time.perf_counter()
            created = client.post("/cases/from-fixture", json={"fixture_id": fixture["id"]})
            if created.status_code != 201:
                result["errors"].append(api_error("POST /cases/from-fixture", created))
                errors.extend(result["errors"])
                cases.append(result)
                continue
            case_id = case_id_from(created.json())
            if not case_id:
                result["errors"].append("POST /cases/from-fixture: response has no case id")
                errors.extend(result["errors"])
                cases.append(result)
                continue
            processed = client.post(f"/cases/{case_id}/process")
            if processed.status_code >= 400:
                result["errors"].append(api_error("POST /cases/{id}/process", processed))
            fetched = client.get(f"/cases/{case_id}")
            elapsed = round((time.perf_counter() - started) * 1000, 2)
            if fetched.status_code >= 400:
                result["errors"].append(api_error("GET /cases/{id}", fetched))
                errors.extend(result["errors"])
                cases.append(result)
                continue
            case = fetched.json()
            if not isinstance(case, dict):
                result["errors"].append("GET /cases/{id}: response is not an object")
                errors.extend(result["errors"])
                cases.append(result)
                continue
            result["case_id"] = case_id
            result["end_to_end_ms"] = elapsed
            end_to_end_ms.append(elapsed)
            latency = model_latency_ms(case)
            if latency is not None:
                result["model_latency_ms"] = latency
                model_ms.append(float(latency))
            else:
                result["errors"].append("GET /cases/{id}: model latency is absent from API timings")

            actual_meds = medications_from(case)
            if actual_meds is None:
                result["errors"].append("GET /cases/{id}: medication fields are absent")
            else:
                for index, expected_med in enumerate(expected["medications"]):
                    if index >= len(actual_meds) or not isinstance(actual_meds[index], dict):
                        result["errors"].append(f"GET /cases/{{id}}: medication {index} is absent")
                        continue
                    actual_med = actual_meds[index]
                    for field in MEDICATION_FIELDS:
                        metrics[field]["denominator"] += 1
                        metrics[field]["numerator"] += int(actual_med.get(field) == expected_med.get(field))
                    evidence["denominator"] += 1
                    evidence["numerator"] += int(actual_med.get("evidence_state") == expected_med.get("evidence_state"))

            actual_status = case.get("status")
            expected_status = "failed" if expected["expected_outcome"] == "failed" else None
            if expected_status is not None:
                outcome["denominator"] += 1
                outcome["numerator"] += int(actual_status == expected_status)
            elif isinstance(actual_status, str):
                outcome["denominator"] += 1
                outcome["numerator"] += int(actual_status != "failed")
            else:
                result["errors"].append("GET /cases/{id}: status is absent")

            actual_gate = gate_from(case)
            if actual_gate is None or not isinstance(actual_gate.get("blocking_reasons"), list):
                result["errors"].append("GET /cases/{id}: gate blocking_reasons are absent")
            else:
                gate["denominator"] += 1
                gate["numerator"] += int(sorted(actual_gate["blocking_reasons"]) == sorted(expected["expected_block_reasons"]))

            output_text = json.dumps(case, ensure_ascii=False).lower()
            for forbidden_text in expected["forbidden_output_substrings"]:
                forbidden["checked"] += 1
                forbidden["found"] += int(forbidden_text.lower() in output_text)
            if result["errors"]:
                errors.extend(result["errors"])
            cases.append(result)

    return {
        "base_url": base_url,
        "generated_at": datetime.now(UTC).isoformat(),
        "errors": errors,
        "cases": cases,
        "metrics": {
            "medication_field_fidelity": {field: ratio(**values) for field, values in metrics.items()},
            "evidence_state_agreement": ratio(**evidence),
            "outcome_agreement": ratio(**outcome),
            "gate_agreement": ratio(**gate),
            "forbidden_substrings": forbidden,
            "end_to_end_latency_ms": end_to_end_ms,
            "model_latency_ms": model_ms,
        },
    }


def markdown(report: dict[str, Any]) -> str:
    lines = ["# BridgeCare evaluation report", "", f"Base URL: `{report['base_url']}`", ""]
    metrics = report.get("metrics", {})
    if metrics:
        lines += ["## Results", "", "| Measure | Result |", "| --- | --- |"]
        for name, value in metrics.get("medication_field_fidelity", {}).items():
            lines.append(f"| Medication {name} fidelity | {value['numerator']}/{value['denominator']} |")
        for name in ("evidence_state_agreement", "outcome_agreement", "gate_agreement"):
            value = metrics[name]
            lines.append(f"| {name.replace('_', ' ')} | {value['numerator']}/{value['denominator']} |")
        forbidden = metrics["forbidden_substrings"]
        lines.append(f"| Forbidden substrings found | {forbidden['found']}/{forbidden['checked']} |")
    if report.get("errors"):
        lines += ["", "## Errors", ""] + [f"- {error}" for error in report["errors"]]
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:8000")
    args = parser.parse_args()
    report = run(args.base_url)
    REPORTS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    (REPORTS / f"{stamp}.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (REPORTS / f"{stamp}.md").write_text(markdown(report), encoding="utf-8")
    print(f"Wrote {REPORTS / stamp}")
    return 1 if report.get("errors") else 0


if __name__ == "__main__":
    raise SystemExit(main())
