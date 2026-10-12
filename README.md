# BridgeCare

Phase A developer scaffold for a future discharge-instructions review assistant. This repository currently contains generic infrastructure and a non-medical provider example only. It does **not** diagnose, treat, calculate doses, approve output, or implement the Phase B workflow.

## Quick start with Docker

Prerequisite: Docker with Compose v2.

```bash
cp .env.example .env
docker compose up --build
```

Open <http://localhost:5173>. The API is also available directly at <http://localhost:8000/health>. The default configuration is CPU-only, offline after image/package installation, and uses the deterministic mock provider with no keys.

Stop the stack with `docker compose down`. The SQLite database remains in the `api-data` volume. Use `docker compose down --volumes` only when you intentionally want to delete local data.

## Local start without Docker

Prerequisites: Python 3.12 or 3.13, [uv](https://docs.astral.sh/uv/), Node.js 22.12 or newer, and npm.

Terminal 1:

```bash
cd apps/api
uv sync --dev
uv run fastapi dev app/main.py --host 0.0.0.0 --port 8000
```

Terminal 2:

```bash
cd apps/web
npm ci
npm run dev
```

The Vite server exposes the UI at <http://localhost:5173> and proxies browser calls from `/api/*` to the local API. The frontend never needs a Docker-only hostname or a secret.

The native API reads exported environment variables and an optional `apps/api/.env`. It does **not** read the root `.env`, which Docker Compose uses. With no configuration it runs the mock provider and stores SQLite at `apps/api/app.db`. Do not reuse the root `DATABASE_URL=sqlite:////data/app.db` for native runs: `/data` exists only inside the API container.

## Configuration

Copy `.env.example` to `.env`; never commit `.env`.

| Variable | Default/example | Purpose |
| --- | --- | --- |
| `APP_ENV` | `development` | Runtime label |
| `DEMO_MODE` | `true` | Marks the generic demo configuration |
| `ALLOW_UPLOADS` | `false` | Reserved for private Phase B environments |
| `LLM_PROVIDER` | `mock` | `mock` or `openai_compatible` |
| `LLM_BASE_URL` | empty | Backend-only OpenAI-compatible server URL |
| `LLM_API_KEY` | empty | Backend-only provider credential |
| `LLM_MODEL` | empty | Provider model identifier |
| `LLM_TIMEOUT_SECONDS` | `60` | Bounded HTTP timeout (1–300 seconds) |
| `DATABASE_URL` | `sqlite:////data/app.db` | SQLAlchemy SQLite URL |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated browser origins |
| `EVOLUS_ENABLED` | `false` | Disabled integration flag; no API behavior exists |
| `EVOLUS_API_KEY` | empty | Reserved backend-only value |
| `EVOLUS_APPLICATION_ID` | empty | Reserved backend-only value |
| `REVIEWER_PASSWORD` | empty | Reserved for Phase B reviewer authentication |
| `SESSION_SECRET` | empty | Reserved for Phase B server-side sessions |

When `LLM_PROVIDER=openai_compatible`, `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` are mandatory. Missing values stop startup; the application never falls back to mock mode.

## Checks

```bash
uv run --project apps/api ruff check apps/api scripts
uv run --project apps/api mypy apps/api/app
uv run --project apps/api pytest apps/api/tests
npm --prefix ./apps/web run lint
npm --prefix ./apps/web run typecheck
npm --prefix ./apps/web test -- --run
npm --prefix ./apps/web run build
uv run --project apps/api python scripts/export_contract.py --check
docker compose config --quiet
```

Regenerate a deliberately changed API contract with:

```bash
uv run --project apps/api python scripts/export_contract.py
npm --prefix ./apps/web run contract:generate
```

Run the local stack smoke test with `uv run --project apps/api python scripts/smoke.py`. The AMD smoke test is never automatic; see `infra/amd/README.md`.

## Repository map

- `apps/api`: FastAPI service, settings, SQLite plumbing, and provider boundary.
- `apps/web`: React/Vite status page.
- `packages/contracts`: exported OpenAPI and generated TypeScript types.
- `fixtures/generic`: non-medical sample data only.
- `infra`: CPU application images and the separate AMD runbook.
- `scripts`: doctor, smoke, AMD smoke, and contract export commands.
- `docs`: architecture, safety constraints, decisions, backlog, and handoff context.

See `AGENTS.md` for ownership and scope rules. This work has not been deployed and no AMD execution is claimed.
