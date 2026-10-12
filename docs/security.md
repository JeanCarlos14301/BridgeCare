# Security baseline

- Request logs contain method, path, status, and duration only. Bodies, prompts, documents, cookies, credentials, and secret headers are excluded.
- Secrets are backend-only environment variables. `.env` is ignored and `.env.example` contains empty placeholders.
- Real-provider configuration is fail-closed. Missing credentials cause startup validation failure; mock fallback is forbidden.
- The OpenAI-compatible client has a bounded timeout and at most one retry.
- CORS origins are explicit and uploads are disabled.
- Document content will be treated as untrusted data in Phase B and can never modify prompts, tools, or approval gates.
- The model never sets approval state.

This scaffold is not a production security review. Authentication, authorization, upload validation, retention, encryption, audit records, and clinical governance remain Phase B work.

