# Development guide

Everything a contributor needs to run, change and check BridgeCare. Ownership and safety rules are in `AGENTS.md`; the contract is in `docs/domain-spec.md`.

## 1. Tools

| Tool | Needed for | Check |
| --- | --- | --- |
| Git | Everything | `git --version` |
| Docker Desktop (Compose v2) | Running the app | `docker compose version` |
| [uv](https://docs.astral.sh/uv/) | API checks, scripts, evaluation | `uv --version` |
| Node.js 22.12+ and npm | Web checks and UI development | `node --version` |

`uv run --project apps/api python scripts/doctor.py` reports what is missing.

## 2. First run (mock provider, no key, no GPU)

```bash
git clone https://github.com/JeanCarlos14301/BridgeCare.git
cd BridgeCare
cp .env.example .env
```

Edit your own `.env` (never commit it, never send the file). Generate the two secrets:

```bash
python -c "import secrets; print(secrets.token_urlsafe(18))"   # REVIEWER_PASSWORD
python -c "import secrets; print(secrets.token_hex(32))"       # SESSION_SECRET
```

```bash
docker compose up --build
```

Open <http://localhost:5173>, pick a fixture, and log in as reviewer with your `REVIEWER_PASSWORD`. The mock replays each fixture's recorded response and the UI labels it MOCK. API docs: <http://localhost:8000/docs>. Stop with `docker compose down`; `--volumes` also deletes the SQLite data.

Without Docker (hot reload for UI work):

```bash
cd apps/api && uv sync --dev && uv run fastapi dev app/main.py --port 8000   # terminal 1
cd apps/web && npm ci && npm run dev                                         # terminal 2
```

The native API reads exported variables and an optional `apps/api/.env`, not the root `.env`; with no configuration it runs the mock and stores SQLite at `apps/api/app.db`. Never put secrets in `VITE_*` variables: Vite exposes them to the browser bundle.

## 3. Real inference on AMD Token Factory

The team shares one key; it is shared only by direct message, never in chats, issues, screenshots or commits. In `.env`:

```env
LLM_PROVIDER=openai_compatible
LLM_BASE_URL=https://developer.amd.com.cn/radeon/api
LLM_API_KEY=<team key>
LLM_MODEL=MiMo-V2.6-Flash
LLM_REASONING_EFFORT=none
```

Check with `uv run --project apps/api python scripts/smoke_amd.py` (it reads `LLM_*` from the shell environment), then `docker compose up -d --build`. `/api/ready` must report `openai_compatible` and that the model is listed; missing values stop startup and the app never falls back to mock.

Limits are shared by the whole team: about 20 requests per minute, a daily cap that resets at 03:00 UTC, and 15–40 seconds per case depending on endpoint load. Announce evaluation runs. Only synthetic documents may be sent. Details: `infra/amd/README.md`.

## 4. Workflow

1. `git switch main && git pull && git switch -c feat/<short-name>` (or `fix/...`).
2. Stay inside your ownership area. Coding agents follow `AGENTS.md`, and their author reviews what they write.
3. Run the checks for what you touched:

   ```bash
   uv run --project apps/api ruff check apps/api scripts eval
   uv run --project apps/api mypy apps/api/app
   uv run --project apps/api pytest apps/api/tests eval
   uv run --project apps/api python scripts/export_contract.py --check
   uv run --project apps/api python eval/check_fixtures.py
   npm --prefix ./apps/web run lint
   npm --prefix ./apps/web run typecheck
   npm --prefix ./apps/web test -- --run
   npm --prefix ./apps/web run build
   docker compose build
   ```

4. After changing API routes or schemas, run `uv run --project apps/api python scripts/export_contract.py` and `npm --prefix ./apps/web run contract:generate`, and commit both files.
5. Open a small PR; CODEOWNERS requests the owner's review and CI must be green.

Merging does not update the live demo. Releases are manual: see "Release process" in `docs/deploy.md`.

## 5. Fixtures and evaluation

Fixtures live in `fixtures/discharge/<id>/` (format in `docs/domain-spec.md` section 1). The six core fixtures are required; more may be added and must pass `eval/check_fixtures.py`. Write `expected.json` from the document, never from `mock_response.json`.

Evaluation against a running stack (reads `REVIEWER_PASSWORD` from the environment):

```bash
uv run --project apps/api python eval/run_eval.py --base-url http://localhost:5173/api --exclude-fx06
```

`--exclude-fx06` is for real providers (its failure only exists in the mock). Mock results only prove the pieces fit together. Method and results: `eval/README.md`.

## 6. Database migrations

The API applies pending SQL files from `apps/api/app/db/migrations/` at startup and records each version in `schema_migrations`.

- Name files `NNNN_short_name.sql`; they run in name order.
- Never edit a migration that is already on `main`; add a new one.
- Each file runs in one transaction with its ledger row; a failing migration stops startup and leaves no partial changes. Do not add `BEGIN`/`COMMIT`.
- `/ready` returns 503 with `Database is unavailable` if the database or ledger cannot be read.

## 7. Configuration reference

`.env.example` documents every variable.

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_ENV` | `development` | `production` enables secure cookies and requires `SESSION_SECRET` |
| `ALLOW_UPLOADS` | `false` | Uploads are not implemented and stay off |
| `LLM_PROVIDER` | `mock` | `mock` or `openai_compatible` |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | empty | Backend-only provider settings; mandatory for `openai_compatible` |
| `LLM_TIMEOUT_SECONDS` | `60` | Bounded HTTP timeout (1–300 seconds); at most one retry |
| `LLM_REASONING_EFFORT` | empty | Optional `reasoning_effort`; empty omits it |
| `LLM_MAX_OUTPUT_TOKENS` | `4096` | `max_tokens` for extraction; thinking tokens count toward it |
| `DATABASE_URL` | `sqlite:////data/app.db` | SQLite URL (Docker volume) |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated browser origins |
| `REVIEWER_PASSWORD` | empty | Reviewer login (12+ characters); empty disables login |
| `SESSION_SECRET` | empty | HMAC key for session tokens (32+ characters); rotating it ends all sessions |
| `PUBLIC_HOST` | empty | Hostname for the Caddy deployment only |
| `EVOLUS_*` | disabled | Reserved; no Evolus integration is implemented |

## 8. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Reviewer login returns 403 | `REVIEWER_PASSWORD` is empty in `.env`; set it and restart |
| API exits at startup with a settings error | A required value is missing or too short (`SESSION_SECRET` 32+, `REVIEWER_PASSWORD` 12+, all three `LLM_*` in real mode). The error names the variable, never its value |
| `/api/ready` says the model is not in the catalog | Token Factory changed its catalog; pick an id from `GET /v1/models` |
| Case ends `failed` with `provider_error` | Timeout, network error, or rate limit (429); wait a minute and check that nobody is running an evaluation |
| Case ends `failed` with `schema_invalid` | The model's JSON did not match the schema; retry, and if it repeats it is prompt work |
| Case ends `failed` with `truncated_output` | The model hit `LLM_MAX_OUTPUT_TOKENS`; raise it or lower `LLM_REASONING_EFFORT` |
| Visitor processing returns 429 | Visitor quota (3 per session, 10 per minute overall); log in as reviewer |
| Port 5173 or 8000 already in use | Stop the other process or the previous stack (`docker compose down`) |
| Web image build fails after a contract change | Regenerate `packages/contracts/openapi.d.ts` (workflow step 4) |
