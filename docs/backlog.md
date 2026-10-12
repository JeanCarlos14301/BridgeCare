# Phase B backlog

The vertical slice runs end to end with the mock provider (fixture -> extraction -> validation -> review -> printable view). Each section below is a reviewable issue with acceptance criteria.

## Status (2026-10-12)

| Item | Status | Owner |
| --- | --- | --- |
| B-00 Migrations and persistence | Done | Jean |
| B-01 State machine and revisions | Done; owner review pending | Daniel |
| B-02 Six synthetic fixtures | Done; owner review pending | Felipe |
| B-03 Output validation and gate | Done; owner review pending | Daniel |
| B-04 Review and transactional approval | Done; owner review pending | Daniel |
| B-05 Sessions and reviewer access | Done (upload endpoint not built) | Jean |
| B-06 Domain API | Done except `POST /cases/upload` | Daniel |
| B-07 Review UI | First version; gaps in B-12 | Edgar |
| B-08 Safety tests | Done for the backend (72 tests) | Daniel |
| B-09 Evaluation report | Harness done; mock-only numbers so far | Felipe |
| B-10 Real inference on AMD Token Factory | Code ready; waiting for the team key | Felipe |
| B-11 Review time measurement | Not started | Daniel |
| B-12 UI completion | Not started | Edgar |
| B-13 Public HTTPS deployment | Done: Azure VM live with real AMD inference (15/15 checks); Cloudflare tunnel as backup | Jean |
| B-14 Demo video, slides and submission | Not started | Edgar and Jean |

Mock evaluation results only prove that the pieces fit together, because the mock replays each fixture's recorded response. Never present them as model accuracy.

## B-10: Real inference on AMD Token Factory

Owner: Felipe. Once every member has redeemed the team key, configure it as in `infra/amd/README.md` and run `scripts/smoke_amd.py`. Compare at least two models from `GET /v1/models` (suggested: `DeepSeek-V4-Flash`, and `MiMo-V2.6-Flash` with `LLM_REASONING_EFFORT=none`) by running `eval/run_eval.py` against the API with `LLM_PROVIDER=openai_compatible`. Iterate on `apps/api/app/prompts/extraction.py` (bump `PROMPT_VERSION`) until the real report is acceptable, then record the chosen model, prompt version, and the report with numerators and denominators. The key is shared by the team (about 30 requests per minute): announce eval runs in the team chat.

## B-11: Review time measurement

Owner: Daniel. The plan requires manual versus assisted time **including review**. Record server-side when a reviewer first opens the current revision and when the decision is saved, expose the review duration on the case, and include it in the evaluation report. Define the manual baseline protocol (same fixture, a person writes the patient sheet by hand, timed) in `eval/README.md`. Report only measured times.

## B-12: UI completion

Owner: Edgar. Gaps found in the first UI version:

1. Show the MOCK badge at all times when `provider_mode` is mock (read `/health`), not only after processing.
2. The printable patient view must include follow-up, warning signs, activity, diet, and the notice, not only summary and medications.
3. Show AMD evidence for the demo: `revision.model`, `revision.timings.model_ms`, and the `X-Request-ID` of the processing call.
4. Citation highlighting fails when the quote's whitespace differs from the page text; normalize whitespace the same way the backend does.
5. Split `App.tsx` into readable components; current lines are hundreds of characters long.
6. Clear the case view on logout.
7. Reviewer field editing through `PATCH /cases/{id}/draft` (for example, resolving a conflict by choosing the correct value).

Respect the production Content-Security-Policy (`docs/deploy.md`): no CDN assets, no inline scripts.

## B-13: Public HTTPS deployment

Owner: Jean. No AMD credits or paid hosting are needed: inference runs on Token Factory.

- Done: Cloudflare quick tunnel (`compose.tunnel.yaml`) gives a free public HTTPS URL from any machine running Docker; `scripts/check_deploy.py` passed 15/15 against it on 2026-10-12 (mock provider). Use it for testing, recording, and live demos.
- Remaining: for an always-on judging URL, apply for student cloud credits (GitHub Student Developer Pack offers) and follow option B in `docs/deploy.md`. If no free VM is available, submit with the tunnel and state the hours it will be up.

## B-14: Demo video, slides and submission

Owners: Edgar and Jean. Follow the plan's 3-minute script; the blocked contradictory case gets the most time. Use a recorded real AMD run, never the mock, for "Powered by AMD". Find one health professional for 15 minutes of feedback (no name or quote without permission).

## B-00: Apply migrations and verify SQLite persistence

Owner: Jean. Blocks B-01. The Phase A engine is lazy: nothing applies `apps/api/app/db/migrations/0001_initial.sql`, `session_scope()` is unused, and the `api-data` volume stays empty after startup. Add a startup migration runner that records applied versions, wire the session dependency into routes, and add a test that writes a row, restarts the stack with `docker compose restart api`, and reads it back from `/data/app.db`.

## B-01: Case state machine and revision persistence

Implement server-owned transitions: `received -> processing -> needs_review -> approved | rejected`, plus `processing -> failed`. The server must never accept `approved` from a model or request body. Editing or reprocessing an approved case creates a revision, returns the case to `needs_review`, and invalidates the former output.

Persist versioned JSON containing `case_id`, `revision_id`, `content_hash`, `status`, `source_documents`, `extracted_fields`, `patient_draft`, `uncertainties`, `citations`, `provider_mode`, `timings`, and `review`. Allow one concurrent processing job per API instance; jobs interrupted by restart become `failed`.

## B-02: Synthetic fixture ingestion and text extraction

Create six synthetic fixtures first: two clear, one missing fields, one contradictory, one prompt-injection attempt, and one provider failure. Each has `expected.json`. Expand to 12 only if time permits. Implement the vertical-slice start: preloaded synthetic case to text extraction by page. Treat document content as untrusted data whose instructions never change prompts, tools, or gates.

## B-03: Structured model output and evidence validation

Require model JSON with citations, then validate it in the backend. Every field has `evidence_state: supported | missing | ambiguous | conflicting`; supported means documentary support, not clinical correctness. Do not produce model confidence percentages.

Medication name, dose, unit, route, frequency, and duration are copied verbatim and are `null` when absent. Never infer dates, doses, durations, diagnoses, urgency, or schedules. Each citation includes document, page, and exact quote; the backend verifies that the quote exists while explicitly noting that quote presence does not prove semantic correctness.

Invalid schema, insufficient text, timeout, truncation, or detected contradiction blocks approval.

## B-04: Human review and transactional approval

Add authenticated human review of the exact current revision. Approval must be transactional over `revision_id + content_hash`. A critical conflict requires a recorded resolution note. The model never writes approval state.

The patient medication table is rendered deterministically from validated fields, never generated prose. The model may rewrite non-critical text only. The printable patient view is unavailable until the current revision has valid approval.

## B-05: Session isolation and reviewer access

Public visitors may select fixtures only within an isolated session and cannot upload. Reviewer login uses a server-side password and an HttpOnly session cookie. Check both session and case authorization on every endpoint; knowledge of a UUID is never sufficient.

`POST /cases/upload` is private-only, limited to 5 MB and 10 pages, and disabled whenever `ALLOW_UPLOADS=false`.

## B-06: Domain API

Implement and export contracts for:

- `GET /fixtures`
- `POST /cases/from-fixture`
- `POST /cases/upload`
- `GET /cases/{id}`
- `POST /cases/{id}/process` (409 while already processing)
- `PATCH /cases/{id}/draft` (creates a revision)
- `POST /cases/{id}/review`
- `GET /cases/{id}/patient-view` (409 without valid current approval)
- `DELETE /cases/{id}`

## B-07: Review UI and printable patient view

Complete the vertical slice: fixture selection -> processing status -> cited field review -> explicit human decision -> printable approved view. Clearly display unsupported, missing, ambiguous, and conflicting evidence. Never present draft or stale content as approved.

## B-08: Safety and authorization test suite

Cover cross-session access, export before approval, stale-revision approval, invalidation after edit, unresolved conflict, nonexistent citation, altered dose, prompt injection, timeout, invalid JSON, hidden fallback to mock, and blocked public upload. These tests are release gates.

## B-09: Measured evaluation report

Report real numerators and denominators for critical-field fidelity, supported claims, gate blocks, omissions, manual-versus-assisted time including review, end-to-end latency, model latency, and cost per case. Never invent accuracy, time savings, latency, or cost.

