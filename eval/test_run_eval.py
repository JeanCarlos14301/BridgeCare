from run_eval import time_summary


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
