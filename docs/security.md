# Security baseline

- Request logs contain a server-generated request ID, method, path, status, and duration only. Bodies, prompts, documents, cookies, credentials, secret headers, and client IP addresses are excluded; the uvicorn access log is disabled.
- Secrets are backend-only environment variables. `.env` is ignored and `.env.example` contains empty placeholders.
- Real-provider configuration is fail-closed. Missing credentials cause startup validation failure; mock fallback is forbidden.
- Secret settings use `SecretStr` and settings validation errors hide raw input, so a failed startup names missing variables without echoing values.
- CI runs gitleaks. `gitleaks-action` is free for personal-account repositories but requires a `GITLEAKS_LICENSE` secret if the repository moves to a GitHub organization.
- The OpenAI-compatible client has a bounded timeout and at most one retry.
- CORS origins are explicit and uploads are disabled.
- The AMD Token Factory shared endpoints forbid sensitive personal, health, or financial data and retain prompts and outputs for about 2 days. Only synthetic fixtures are ever sent to the model; uploads stay disabled in every environment that uses the shared endpoints.
- Sessions are server-side. The `bridgecare_session` cookie is `HttpOnly`, `SameSite=Strict`, and `Secure` outside development; only an HMAC of the token (keyed by `SESSION_SECRET`) is stored. Visitor sessions last 4 hours, reviewer sessions 12 hours.
- Reviewer login compares the password in constant time, issues a new token on success (no session fixation), and is disabled when `REVIEWER_PASSWORD` is empty. After 10 failed attempts in 5 minutes, all logins return 429 until the window passes; this cap is process-wide because the API is a single replica.
- Every case endpoint must call `ensure_case_owner`. A case from another session answers 404, so a UUID never grants access or reveals existence.
- Cookie authentication relies on `SameSite=Strict` and explicit CORS origins against cross-site requests; no separate CSRF token is used.
- Document content is untrusted data: pages are wrapped in random per-request boundaries, the output schema rejects unknown keys, and instructions inside a document can never modify prompts, tools, or approval gates (fixture fx05 and the evaluation check this).
- The model never sets approval state.

This is a hackathon prototype, not a production security review. Sessions, reviewer authentication, per-case authorization and a hashed approval record exist; upload validation, data retention policies, encryption at rest, full audit logging, and clinical governance are not implemented.

