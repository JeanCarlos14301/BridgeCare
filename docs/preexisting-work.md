# Pre-existing work record

Recorded on: 2026-10-11 (America/Bogota), before the Oct 12–18, 2026 build window.

Phase A created the generic repository scaffold and developer tooling only:

- FastAPI health, readiness, and non-medical example endpoints.
- Mock and OpenAI-compatible provider boundary.
- Generic React status UI.
- SQLite connection/session plumbing with an empty baseline migration.
- Docker/Compose, CI configuration, scripts, contracts, generic fixture, and documentation.

Follow-up hardening on the same date, also before the build window (commits after `1b116c5`):

- Secret settings stored as `SecretStr`; settings validation errors no longer echo input values.
- Settings and API tests isolated from the developer shell; secret-masking regression tests.
- Executable script wrappers and LF line endings via `.gitattributes`.
- Project renamed to BridgeCare (package names `bridgecare-api`, `bridgecare-web`).
- Server-generated request IDs in logs and the `X-Request-ID` header; uvicorn access log disabled.
- CI concurrency and timeout; documentation updates.

No discharge workflow, health-specific prompt, extraction, citation validation, case state machine, authentication, approval, patient view, clinical fixture, benchmark, deployment, AMD execution, or event submission was implemented. Git commit timestamps were not changed.

