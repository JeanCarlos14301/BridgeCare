# Security baseline

- Request logs contain a server-generated request ID, method, path, status, and duration only. Bodies, prompts, documents, cookies, credentials, secret headers, and client IP addresses are excluded; the uvicorn access log is disabled.
- Secrets are backend-only environment variables. `.env` is ignored and `.env.example` contains empty placeholders.
- Real-provider configuration is fail-closed. Missing credentials cause startup validation failure; mock fallback is forbidden.
- Secret settings use `SecretStr` and settings validation errors hide raw input, so a failed startup names missing variables without echoing values.
- CI runs gitleaks. `gitleaks-action` is free for personal-account repositories but requires a `GITLEAKS_LICENSE` secret if the repository moves to a GitHub organization.
- The OpenAI-compatible client has a bounded timeout and at most one retry.
- CORS origins are explicit and uploads are disabled.
- Document content will be treated as untrusted data in Phase B and can never modify prompts, tools, or approval gates.
- The model never sets approval state.

This scaffold is not a production security review. Authentication, authorization, upload validation, retention, encryption, audit records, and clinical governance remain Phase B work.

