# Evaluation Protocol & Metrics

This directory contains evaluation tooling, benchmark runbooks, and measured reports for BridgeCare.

> [!IMPORTANT]
> **Reporting Rule**: Never invent accuracy, latency, cost, or time-savings claims. All figures reported in slides, demo videos, and submissions must be real, measured numbers with exact numerators and denominators.

---

## 1. Review Time Measurement & Baseline Protocol (B-11)

To substantiate the core value proposition ("minutes saved per discharge while ensuring clinical review safety"), we compare the manual discharge sheet workflow against the AI-assisted + clinician review workflow on the identical synthetic fixtures.

### A. Manual Baseline Protocol
The manual baseline measures the time and error rate when a clinician (nurse or discharge coordinator) prepares a patient discharge instruction sheet without AI assistance:

1. **Input**: A synthetic discharge fixture from `fixtures/discharge/` (e.g. `fx01_clear_pneumonia`).
2. **Task**:
   - Clinician reads the source document pages.
   - Clinician identifies all prescribed discharge medications (name, dose, unit, route, frequency, duration).
   - Clinician notes follow-up appointments, activity restrictions, dietary instructions, and critical warning signs.
   - Clinician writes or types the patient-facing discharge sheet by hand.
3. **Timing**:
   - Stopwatch begins the moment the clinician opens and starts reading the source document.
   - Stopwatch stops the moment the final patient sheet is completed and signed off.
   - Recorded as `manual_duration_seconds`.
4. **Fidelity Verification**:
   - The manual sheet is checked against `expected.json` to record any manual omissions or transcription errors.

---

### B. Assisted Workflow Protocol (BridgeCare)
The assisted workflow measures the end-to-end time of AI extraction plus human clinician review:

1. **Model Extraction Phase**:
   - The case is ingested and processed via `POST /cases/{id}/process`.
   - Latencies are recorded automatically:
     - `revision.timings.model_ms`: Pure LLM inference latency on AMD Token Factory GPUs.
     - `revision.timings.total_ms`: Total server extraction, prompt assembly, and gate validation time.
2. **Clinician Review Phase (Server-Timed)**:
   - When the reviewer opens the case in the review interface (`GET /cases/{id}` while in `needs_review`), the server records `review_timers.opened_at`.
   - The reviewer audits each cited field against the source document on the left, checks gate flags (e.g., verifying conflicts or unverified citations), and resolves or approves the revision.
   - When the reviewer submits the decision (`POST /cases/{id}/review`), the server computes:
     $$\text{duration\_ms} = (\text{reviewed\_at} - \text{opened\_at}) \times 1000$$
   - The duration is persisted in `reviews.duration_ms` and exposed on `case.review.duration_ms`.
   - If a draft is updated via `PATCH /cases/{id}/draft` or reprocessed, a new revision is created and the timer resets.
3. **Total Assisted Time**:
   $$\text{total\_assisted\_ms} = \text{revision.timings.total\_ms} + \text{review.duration\_ms}$$

---

### C. Comparison Metric
For each evaluated fixture $i \in \{1 \dots N\}$:
$$\text{Time Saved}_i = \text{Manual Time}_i - \text{Total Assisted Time}_i$$
$$\text{Relative Efficiency} = \frac{\text{Manual Time} - \text{Total Assisted Time}}{\text{Manual Time}} \times 100\%$$

---

## 2. Running Automated Evaluation
To execute the automated evaluation harness against a running API instance:

```bash
# In local mock mode or against live AMD Token Factory instance
python eval/run_eval.py --base-url http://localhost:8000
```

The script runs all discharge fixtures against the API and produces timestamped JSON and Markdown reports in `eval/reports/`. It needs `REVIEWER_PASSWORD` in the environment. Each report names the provider mode, model and prompt version; a `mock` report only proves the plumbing and is never model accuracy.

### Recording time runs in `baseline.json`

The harness cannot time people, so humans record their runs in `eval/baseline.json`:

```json
{
  "runs": [
    {"fixture_id": "fx01_clear_pneumonia", "mode": "manual", "seconds": 0, "date": "2026-10-14"},
    {"fixture_id": "fx01_clear_pneumonia", "mode": "assisted_review", "seconds": 0, "date": "2026-10-14"}
  ]
}
```

- `manual`: stopwatch time for protocol A. Record no names or other personal data.
- `assisted_review`: the review time the UI shows after a decision ("review time"), which is the server-measured `review.duration_ms`.

The report shows medians with their `n`: assisted total = median processing (measured in the same run) + median review. The saving is printed only when both manual and assisted review runs exist; otherwise the report says it was not measured. Run at least 3 of each before quoting a number.
