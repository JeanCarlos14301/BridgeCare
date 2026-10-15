# Architecture decisions

## ADR-001: Mock provider for development, fail closed in real mode

Status: accepted. Local development and CI use a deterministic mock that replays each fixture's recorded response and is always labelled MOCK. When a real provider is configured and a setting is missing, startup fails; the app never falls back to mock silently.

## ADR-002: SQLite and one API replica

Status: accepted. One persistent volume, one API worker, one processing job at a time. Distributed jobs and horizontal replicas are out of scope for the hackathon.

## ADR-003: Browser uses a same-origin proxy

Status: accepted. Both Vite and nginx expose `/api`, so internal hostnames and backend keys never enter frontend configuration.

## ADR-004: Contract is generated and checked

Status: accepted. FastAPI OpenAPI is the source; committed JSON and TypeScript artifacts make drift reviewable, and CI fails on drift.

## ADR-005: AMD Token Factory instead of a self-hosted vLLM VM

Status: accepted (2026-10-12). The event provides a team key for Token Factory, an OpenAI-compatible service on AMD GPUs. It needs no GPU VM or credits and works with the existing adapter by configuration only. A self-hosted vLLM runbook remains in `infra/amd/README.md` as an alternative.

## ADR-006: MiMo-V2.6-Flash with prompt extraction-v4

Status: accepted (2026-10-15). Compared with DeepSeek-V4-Flash on the same fixtures, MiMo-V2.6-Flash matched more medication fields and was faster. `LLM_REASONING_EFFORT=none` keeps the output budget for the JSON. Prompt v4 fixed an amount being placed in `frequency`. Evidence: `eval/README.md`.

## ADR-007: Evolus integration out of scope

Status: accepted. The Evolus partner track requires its own vLLM endpoint on AMD Developer Cloud and at least two Evolus building blocks. With the shared Token Factory endpoint and the time available, the team kept the core slice. An early disabled stub was removed because it was never used.

## ADR-008: Deterministic glossary for the Spanish patient sheet

Status: accepted. The Spanish sheet is derived from the approved English revision with a fixed, reviewable glossary, not a model. Medication names, doses and units are never translated; any phrase outside the glossary is shown in English and flagged. Reviewers can preview the Spanish sheet before approving.

## ADR-009: Azure VM with Caddy for the public demo

Status: accepted (2026-10-12). An Azure for Students VM (`Standard_B2ats_v2`, AMD EPYC) runs the production Compose overlay behind Caddy with automatic HTTPS. Releases are manual (`scripts/deploy-vm.sh`) so a merge never reaches the demo untested. A Cloudflare quick tunnel is the backup.

## ADR-010: No document uploads

Status: accepted. Token Factory terms forbid sensitive personal or health data, and a public demo cannot prevent a visitor from pasting a real record. Only synthetic fixtures are processed; `ALLOW_UPLOADS` stays false and the upload endpoint is not built.
