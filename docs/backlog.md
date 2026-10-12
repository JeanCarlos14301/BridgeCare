# Phase B backlog

Phase B is intentionally not implemented. Build one complete vertical slice before expanding. Each section below is a reviewable issue with acceptance criteria.

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

