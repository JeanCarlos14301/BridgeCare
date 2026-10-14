from run_eval import calculate_case_cost, cost_summary, markdown, time_summary


def test_no_saving_without_measured_runs() -> None:
    summary = time_summary({"runs": []}, [2000.0])
    assert summary["processing_s"] == {"n": 1, "median": 2.0}
    assert summary["assisted_total_s"] is None
    assert summary["saving_percent"] is None


def test_saving_from_medians() -> None:
    runs = [
        {"mode": "manual", "seconds": 600},
        {"mode": "manual", "seconds": 400},
        {"mode": "assisted_review", "seconds": 90},
    ]
    summary = time_summary({"runs": runs}, [10000.0])
    assert summary["assisted_total_s"] == 100.0
    assert summary["saving_percent"] == 80.0


def test_calculate_case_cost() -> None:
    # 4000 prompt chars = ~1000 tokens; 2000 output chars = ~500 tokens
    # Rates: $1.00 per 1M input, $2.00 per 1M output
    # (1000/1M * 1.0) + (500/1M * 2.0) = 0.001 + 0.001 = 0.002
    cost_info = calculate_case_cost(
        prompt_chars=4000,
        output_chars=2000,
        input_rate_per_1m=1.0,
        output_rate_per_1m=2.0,
    )
    assert cost_info["prompt_tokens_est"] == 1000
    assert cost_info["output_tokens_est"] == 500
    assert cost_info["cost_usd"] == 0.002


def test_cost_summary() -> None:
    cases = [
        {"cost_usd": 0.001},
        {"cost_usd": 0.003},
        {"cost_usd": 0.005},
    ]
    summary = cost_summary(cases, {"runs": []}, input_rate_per_1m=0.14, output_rate_per_1m=0.28)
    assert summary["median_cost_usd"] == 0.003
    assert summary["total_cost_usd"] == 0.009
    assert summary["input_rate_per_1m"] == 0.14
    assert summary["output_rate_per_1m"] == 0.28


def test_markdown_includes_case_details_and_cost() -> None:
    report = {
        "base_url": "http://localhost:8000",
        "providers": [{"provider_mode": "mock", "model": "mock-model", "prompt_version": "v1"}],
        "excluded_fixtures": ["fx06_provider_failure"],
        "cases": [
            {
                "fixture_id": "fx01_clear_pneumonia",
                "status": "needs_review",
                "outcome_match": True,
                "gate_match": True,
                "model_latency_ms": 120.0,
                "processing_ms": 130.0,
                "end_to_end_ms": 150.0,
                "cost_usd": 0.0,
            }
        ],
        "metrics": {
            "medication_field_fidelity": {"name": {"numerator": 1, "denominator": 1, "percent": 100.0}},
            "evidence_state_agreement": {"numerator": 1, "denominator": 1, "percent": 100.0},
            "outcome_agreement": {"numerator": 1, "denominator": 1, "percent": 100.0},
            "gate_agreement": {"numerator": 1, "denominator": 1, "percent": 100.0},
            "forbidden_substrings": {"found": 0, "checked": 1},
            "latency_median_ms": {
                "end_to_end": {"n": 1, "median": 150.0},
                "model": {"n": 1, "median": 120.0},
                "processing": {"n": 1, "median": 130.0},
            },
            "time": time_summary({"runs": []}, [130.0]),
            "cost": {
                "input_rate_per_1m": 0.0,
                "output_rate_per_1m": 0.0,
                "median_cost_usd": 0.0,
                "total_cost_usd": 0.0,
            },
        },
        "errors": [],
    }
    md = markdown(report)
    assert "## Case details" in md
    assert "fx01_clear_pneumonia" in md
    assert "Excluded fixtures: fx06_provider_failure" in md
    assert "## Cost per case (USD)" in md
    assert "$0.00" in md

