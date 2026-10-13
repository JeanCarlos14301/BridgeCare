"""Run fixture-based evaluation against a live BridgeCare API v0."""

from __future__ import annotations

import argparse
import json
import os
import statistics
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures" / "discharge"
DEFAULT_REPORTS = Path(__file__).resolve().parent / "reports"
DEFAULT_BASELINE = Path(__file__).resolve().parent / "baseline.json"
MEDICATION_FIELDS = ("name", "dose", "unit", "route", "frequency", "duration")


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def api_error(label: str, response: httpx.Response) -> str:
    return f"{label}: HTTP {response.status_code}: {response.text[:500]}"


def ratio(numerator: int, denominator: int) -> dict[str, int | float | None]:
    return {
        "numerator": numerator,
        "denominator": denominator,
        "percent": round(100 * numerator / denominator, 2) if denominator else None,
    }


def median_summary(values: list[float]) -> dict[str, float | int | None]:
    return {"n": len(values), "median": round(statistics.median(values), 2) if values else None}


def time_summary(baseline: dict[str, Any], processing_ms: list[float]) -> dict[str, Any]:
    """Combine measured processing time with human-recorded runs from baseline.json.

    Assisted time = median processing + median review. Saving is reported only when both
    manual and assisted medians come from measured runs; nothing is estimated.
    """
    runs = baseline.get("runs", [])
    manual = [float(run["seconds"]) for run in runs if run.get("mode") == "manual"]
    review = [float(run["seconds"]) for run in runs if run.get("mode") == "assisted_review"]
    processing_s = [ms / 1000 for ms in processing_ms]
    summary: dict[str, Any] = {
        "manual_s": median_summary(manual),
        "assisted_review_s": median_summary(review),
        "processing_s": median_summary(processing_s),
        "assisted_total_s": None,
        "saving_percent": None,
    }
    if review and processing_s:
        assisted = summary["assisted_review_s"]["median"] + summary["processing_s"]["median"]
        summary["assisted_total_s"] = round(assisted, 2)
        if manual:
            manual_median = summary["manual_s"]["median"]
            summary["saving_percent"] = round(100 * (manual_median - assisted) / manual_median, 2)
    return summary


def expected_outcome_matches(case: dict[str, Any], expected: dict[str, Any]) -> bool:
    outcome = expected["expected_outcome"]
    if outcome == "failed":
        return case["status"] == "failed" and case["failure_reason"] in expected["expected_block_reasons"]
    revision = case["revision"]
    if revision is None:
        return False
    gate = revision["gate"]
    if outcome == "approvable":
        return gate["approvable"] and not gate["requires_resolution_note"]
    return gate["requires_resolution_note"]


def run(base_url: str, baseline: dict[str, Any]) -> dict[str, Any]:
    password = os.environ.get("REVIEWER_PASSWORD")
    errors: list[str] = []
    if not password:
        return {"base_url": base_url, "errors": ["REVIEWER_PASSWORD is not set"], "cases": [], "metrics": {}}
    metrics = {field: {"numerator": 0, "denominator": 0} for field in MEDICATION_FIELDS}
    evidence = {"numerator": 0, "denominator": 0}
    outcome = {"numerator": 0, "denominator": 0}
    gate = {"numerator": 0, "denominator": 0}
    forbidden = {"found": 0, "checked": 0}
    cases: list[dict[str, Any]] = []
    end_to_end_ms: list[float] = []
    model_ms: list[float] = []
    total_ms: list[float] = []
    providers: set[tuple[str, str, str]] = set()

    with httpx.Client(base_url=base_url.rstrip("/"), timeout=150.0) as client:  # real model calls take ~25 s; matches nginx
        session = client.post("/session")
        if session.status_code >= 400:
            errors.append(api_error("POST /session", session))
            return {"base_url": base_url, "errors": errors, "cases": cases, "metrics": {}}
        login = client.post("/session/login", json={"password": password})
        if login.status_code >= 400:
            errors.append(api_error("POST /session/login", login))
            return {"base_url": base_url, "errors": errors, "cases": cases, "metrics": {}}

        for folder in sorted(path for path in FIXTURES.iterdir() if path.is_dir()):
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
            created_case = created.json()
            case_id = created_case.get("case_id") if isinstance(created_case, dict) else None
            if not isinstance(case_id, str):
                result["errors"].append("POST /cases/from-fixture: response has no case_id")
                errors.extend(result["errors"])
                cases.append(result)
                continue
            processed = client.post(f"/cases/{case_id}/process")
            elapsed = round((time.perf_counter() - started) * 1000, 2)
            if processed.status_code >= 400:
                result["errors"].append(api_error("POST /cases/{case_id}/process", processed))
            fetched = client.get(f"/cases/{case_id}")
            if fetched.status_code >= 400:
                result["errors"].append(api_error("GET /cases/{case_id}", fetched))
                errors.extend(result["errors"])
                cases.append(result)
                continue
            case = fetched.json()
            if not isinstance(case, dict) or not isinstance(case.get("status"), str):
                result["errors"].append("GET /cases/{case_id}: response does not match CaseView")
                errors.extend(result["errors"])
                cases.append(result)
                continue
            result["case_id"] = case_id
            result["end_to_end_ms"] = elapsed
            end_to_end_ms.append(elapsed)

            outcome["denominator"] += 1
            outcome["numerator"] += int(expected_outcome_matches(case, expected))
            revision = case.get("revision")
            if case["status"] == "failed":
                result["failure_reason"] = case.get("failure_reason")
                cases.append(result)
                continue
            if not isinstance(revision, dict):
                result["errors"].append("GET /cases/{case_id}: non-failed case has no revision")
                errors.extend(result["errors"])
                cases.append(result)
                continue
            result["provider_mode"] = revision.get("provider_mode")
            result["model"] = revision.get("model")
            result["prompt_version"] = revision.get("prompt_version")
            providers.add((str(revision.get("provider_mode")), str(revision.get("model")), str(revision.get("prompt_version"))))
            timings = revision.get("timings")
            if isinstance(timings, dict) and isinstance(timings.get("total_ms"), (int, float)):
                result["processing_ms"] = timings["total_ms"]
                total_ms.append(float(timings["total_ms"]))
            if isinstance(timings, dict) and isinstance(timings.get("model_ms"), (int, float)):
                result["model_latency_ms"] = timings["model_ms"]
                model_ms.append(float(timings["model_ms"]))
            elif isinstance(timings, dict) and timings.get("model_ms") is None:
                result["model_latency_ms"] = None
            else:
                result["errors"].append("GET /cases/{case_id}: revision timings.model_ms is absent")

            fields = revision["extracted_fields"]
            actual_meds = fields["medications"]
            for index, expected_med in enumerate(expected["medications"]):
                if index >= len(actual_meds):
                    result["errors"].append(f"GET /cases/{{case_id}}: medication {index} is absent")
                    continue
                actual_med = actual_meds[index]
                for field in MEDICATION_FIELDS:
                    metrics[field]["denominator"] += 1
                    metrics[field]["numerator"] += int(actual_med.get(field) == expected_med.get(field))
                evidence["denominator"] += 1
                evidence["numerator"] += int(actual_med.get("evidence_state") == expected_med.get("evidence_state"))

            actual_codes = {reason["code"] for reason in revision["gate"]["blocking_reasons"]}
            gate["denominator"] += 1
            gate["numerator"] += int(actual_codes == set(expected["expected_block_reasons"]))
            safe_output = {
                "extracted_fields": fields,
                "patient_draft": revision["patient_draft"],
                "uncertainties": revision["uncertainties"],
            }
            output_text = json.dumps(safe_output, ensure_ascii=False).lower()
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
        "providers": [
            {"provider_mode": mode, "model": model, "prompt_version": prompt}
            for mode, model, prompt in sorted(providers)
        ],
        "cases": cases,
        "metrics": {
            "medication_field_fidelity": {field: ratio(**values) for field, values in metrics.items()},
            "evidence_state_agreement": ratio(**evidence),
            "outcome_agreement": ratio(**outcome),
            "gate_agreement": ratio(**gate),
            "forbidden_substrings": forbidden,
            "end_to_end_latency_ms": end_to_end_ms,
            "model_latency_ms": model_ms,
            "processing_ms": total_ms,
            "latency_median_ms": {
                "end_to_end": median_summary(end_to_end_ms),
                "model": median_summary(model_ms),
                "processing": median_summary(total_ms),
            },
            "time": time_summary(baseline, total_ms),
        },
    }


def markdown(report: dict[str, Any]) -> str:
    lines = ["# BridgeCare evaluation report", "", f"Base URL: `{report['base_url']}`", ""]
    for provider in report.get("providers", []):
        label = provider["provider_mode"]
        if label == "mock":
            label += " (replays recorded responses; not model accuracy)"
        lines.append(f"- Provider: {label}; model `{provider['model']}`; prompt `{provider['prompt_version']}`")
    if report.get("providers"):
        lines.append("")
    metrics = report.get("metrics", {})
    if metrics:
        lines += ["## Results", "", "| Measure | Result |", "| --- | --- |"]
        for name, value in metrics["medication_field_fidelity"].items():
            lines.append(f"| Medication {name} fidelity | {value['numerator']}/{value['denominator']} |")
        for name in ("evidence_state_agreement", "outcome_agreement", "gate_agreement"):
            value = metrics[name]
            lines.append(f"| {name.replace('_', ' ')} | {value['numerator']}/{value['denominator']} |")
        forbidden = metrics["forbidden_substrings"]
        lines.append(f"| Forbidden substrings found | {forbidden['found']}/{forbidden['checked']} |")
        for name, value in metrics["latency_median_ms"].items():
            lines.append(f"| Median {name} latency (ms) | {value['median']} (n={value['n']}) |")
        time = metrics["time"]
        lines += ["", "## Time per case (seconds)", "", "| Measure | Median | n |", "| --- | --- | --- |"]
        for name in ("manual_s", "assisted_review_s", "processing_s"):
            value = time[name]
            lines.append(f"| {name.removesuffix('_s').replace('_', ' ')} | {value['median']} | {value['n']} |")
        lines.append(f"| assisted total (processing + review) | {time['assisted_total_s']} | |")
        if time["saving_percent"] is None:
            lines.append("")
            lines.append("Saving not reported: needs measured manual and assisted review runs in `eval/baseline.json`.")
        else:
            lines.append(f"| saving vs manual (%) | {time['saving_percent']} | |")
    if report.get("errors"):
        lines += ["", "## Errors", ""] + [f"- {error}" for error in report["errors"]]
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_REPORTS)
    parser.add_argument("--baseline", type=Path, default=DEFAULT_BASELINE)
    args = parser.parse_args()
    baseline = load_json(args.baseline) if args.baseline.exists() else {"runs": []}
    report = run(args.base_url, baseline)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    (args.output_dir / f"{stamp}.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (args.output_dir / f"{stamp}.md").write_text(markdown(report), encoding="utf-8")
    print(f"Wrote {args.output_dir / stamp}")
    return 1 if report.get("errors") else 0


if __name__ == "__main__":
    raise SystemExit(main())
