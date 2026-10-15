# Architecture

## Deployment

```text
                         Internet
                            │ HTTPS 443 (HTTP 80 redirects)
                            ▼
┌──────────────── Azure VM (Standard_B2ats_v2, AMD EPYC, Ubuntu 24.04) ────────────────┐
│  Docker Compose: compose.yaml + compose.prod.yaml                                    │
│                                                                                      │
│  Caddy ──► web (nginx: React build, security headers, /api proxy) ──► api (FastAPI)  │
│  TLS                                                                    │            │
│  (only published ports: 80, 443)                         SQLite on the api-data volume│
└─────────────────────────────────────────────────────────────────────────┼────────────┘
                                                                          │ HTTPS, team key
                                                                          ▼
                                            AMD Token Factory (AMD GPUs, OpenAI-compatible)
                                            MiMo-V2.6-Flash, prompt extraction-v4
```

- The browser only talks to its own origin; nginx proxies `/api/*`. No backend credential or internal hostname reaches the frontend.
- One API process and one replica: SQLite is the only store, and one processing job runs at a time.
- A Cloudflare quick tunnel (`compose.tunnel.yaml`) can publish the same stack from any machine as a backup.
- Local development and CI use a deterministic mock provider and need no key or GPU.

## Request flow for one case

1. `POST /session` creates a visitor session (HttpOnly, SameSite=Strict cookie; only an HMAC of the token is stored).
2. `POST /cases/from-fixture` creates a case owned by that session; other sessions get 404.
3. `POST /cases/{id}/process` sends the page text to the model inside random per-request boundaries, then validates the JSON: strict schema, verbatim citations, token-boundary verbatim medication values, conflicts. The result is an immutable revision with a SHA-256 content hash and a gate.
4. `GET /cases/{id}/preview?lang=en|es` lets a reviewer see the patient sheet before deciding.
5. `POST /cases/{id}/review` approves or rejects one exact `revision_id` + `content_hash`, in one transaction, and records the review time.
6. `GET /cases/{id}/patient-view?lang=en|es` returns 409 until a valid approval exists; medications come only from validated fields; Spanish uses a deterministic glossary that flags untranslated text.

The full contract is in `docs/domain-spec.md` and `packages/contracts/openapi.json`.

## Data

| Table | Holds |
| --- | --- |
| `sessions` | Session id, HMAC of the token, role, expiry |
| `cases` | Owner session, fixture, status, current revision, failure reason |
| `revisions` | Immutable canonical JSON content and its SHA-256 hash |
| `reviews` | Decision, resolution note, revision and hash approved, review timing |
| `review_timers` | When a reviewer first opened a revision |

Migrations live in `apps/api/app/db/migrations/` and run at startup.

## Costs and limits

- Inference: AMD Token Factory shared endpoints are free with a per-key daily cap and about 20 requests per minute. Visitors are limited (3 runs per session, 10 per minute overall) to protect the shared quota.
- Hosting: one small Azure for Students VM with a budget alert. Delete the VM after judging; a stopped VM can still bill for disk and IP.
