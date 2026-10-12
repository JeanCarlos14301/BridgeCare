# BridgeCare

**An AI that knows when to stop.** BridgeCare helps nursing and discharge-coordination staff turn a discharge document into a clear patient sheet. Every extracted field cites its source, conflicts and unsupported values block the output, and nothing reaches the patient until a human reviewer approves the exact revision.

BridgeCare does **not** diagnose, recommend treatment, calculate doses, or approve its own output. All demo documents are synthetic.

Built for the AMD Developer Hackathon ACT III (Track 2, Health and Wellbeing). Model inference runs on AMD GPUs through AMD Token Factory.

## How it works

1. A reviewer picks a synthetic discharge document. The text is split by page.
2. The model returns JSON: medications, follow-up, warning signs, activity, diet, a plain-language summary, and uncertainties. Every item carries an `evidence_state` (`supported`, `missing`, `ambiguous`, `conflicting`) and citations (document, page, exact quote).
3. The backend validates the output and never trusts it:
   - strict schema (unknown keys such as `"status": "approved"` reject the whole output);
   - every quote must exist on the cited page;
   - every medication value (name, dose, unit, route, frequency, duration) must appear verbatim, on token boundaries, inside a verified quote, so an altered dose such as `50` for `500` is caught.
4. The result is an immutable **revision** with a SHA-256 content hash. A **gate** lists blocking reasons; a conflict needs a written resolution note.
5. Only an authenticated reviewer can approve, and only the exact `revision_id` + `content_hash`. Editing or reprocessing invalidates the approval.
6. The printable patient sheet renders medications only from validated fields, never from model prose, and returns 409 until a valid approval exists.

Document text is treated as untrusted data: instructions inside it never change the prompt, the schema, or the gate. A quote existing on the page proves documentary support, not clinical correctness; that judgement stays with the reviewer.

## Quick start (Docker, no GPU, no keys)

Prerequisite: Docker with Compose v2.

```bash
cp .env.example .env
# In .env set REVIEWER_PASSWORD (12+ characters) to enable reviewer login.
docker compose up --build
```

Open <http://localhost:5173>. The default provider is an offline **mock** that replays each fixture's recorded response; the UI labels it MOCK and it is never presented as model inference.

Try the six synthetic fixtures in `fixtures/discharge/`:

| Fixture | What you should see |
| --- | --- |
| `fx01`, `fx02` clear cases | `needs_review`, approvable; approve and print the patient sheet |
| `fx03` missing details | Values shown as not stated (`missing`); still reviewable |
| `fx04` contradictory dose | Gate requires a resolution note before approval |
| `fx05` prompt injection | The injected instruction is in the source but never in the output |
| `fx06` provider failure | Case ends `failed` with `provider_error` |

The API is also available at <http://localhost:8000/docs>. Stop with `docker compose down`; data stays in the `api-data` volume.

## Real inference on AMD (Token Factory)

Set these in `.env` (the team key goes only in `.env`, never in Git):

```env
LLM_PROVIDER=openai_compatible
LLM_BASE_URL=https://developer.amd.com.cn/radeon/api
LLM_API_KEY=<team key>
LLM_MODEL=DeepSeek-V4-Flash
```

Then run `uv run --project apps/api python scripts/smoke_amd.py` and restart the stack. Missing values stop startup; the app never falls back to mock silently. Details, limits and terms: `infra/amd/README.md`.

## Public deployment

- **Free, no account:** Cloudflare quick tunnel, `docker compose -f compose.yaml -f compose.tunnel.yaml up -d --build`.
- **Always-on VM:** Caddy with automatic HTTPS, `compose.prod.yaml`.

Both run in production mode (secure cookies, uploads off, no exposed API port). Follow `docs/deploy.md` and verify any URL with `uv run --project apps/api python scripts/check_deploy.py <url>`.

## Local start without Docker

Prerequisites: Python 3.12 or 3.13, [uv](https://docs.astral.sh/uv/), Node.js 22.12+, npm.

```bash
cd apps/api && uv sync --dev && uv run fastapi dev app/main.py --port 8000   # terminal 1
cd apps/web && npm ci && npm run dev                                         # terminal 2
```

The Vite dev server proxies `/api/*` to the API. The native API reads exported variables and an optional `apps/api/.env`, not the root `.env`; with no configuration it runs the mock provider and stores SQLite at `apps/api/app.db`.

## Configuration

Copy `.env.example` to `.env`; it documents every variable and how to generate secrets.

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_ENV` | `development` | `production` enables secure cookies and requires `SESSION_SECRET` |
| `ALLOW_UPLOADS` | `false` | Uploads are not implemented and stay off |
| `LLM_PROVIDER` | `mock` | `mock` or `openai_compatible` |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | empty | Backend-only provider settings; mandatory for `openai_compatible` |
| `LLM_TIMEOUT_SECONDS` | `60` | Bounded HTTP timeout (1–300 seconds); at most one retry |
| `LLM_REASONING_EFFORT` | empty | Optional `reasoning_effort` for reasoning models; empty omits it |
| `LLM_MAX_OUTPUT_TOKENS` | `4096` | `max_tokens` for extraction; thinking tokens count toward it |
| `DATABASE_URL` | `sqlite:////data/app.db` | SQLite URL (Docker volume) |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated browser origins |
| `REVIEWER_PASSWORD` | empty | Reviewer login (12+ characters); empty disables login |
| `SESSION_SECRET` | empty | HMAC key for session tokens (32+ characters); rotating it ends all sessions |
| `PUBLIC_HOST` | empty | Hostname for the Caddy deployment only |
| `EVOLUS_*` | disabled | Reserved; no Evolus integration is implemented |

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
uv run --project apps/api python eval/check_fixtures.py
docker compose build
```

After changing API routes or schemas, regenerate the contract with `scripts/export_contract.py` and `npm --prefix ./apps/web run contract:generate`, and commit both files.

Evaluation against a running stack: `REVIEWER_PASSWORD=... uv run --project apps/api python eval/run_eval.py --base-url http://localhost:5173/api`. With the mock provider the results only prove that the pieces fit together; they are not model accuracy.

## Repository map

- `apps/api`: FastAPI service: sessions, case lifecycle, validation gate, providers, prompts.
- `apps/web`: React review UI and printable patient sheet.
- `packages/contracts`: exported OpenAPI and generated TypeScript types.
- `fixtures/discharge`: six synthetic discharge fixtures with expected results.
- `eval`: fixture checker and evaluation harness.
- `infra`: Dockerfiles, nginx, Caddy, and the AMD runbook.
- `scripts`: doctor, smoke tests, deployment checker, VM bootstrap, contract export.
- `docs`: domain spec, backlog, deployment, security, team, and pre-existing work.

See `AGENTS.md` for ownership and safety rules and `docs/domain-spec.md` for the full contract.

## Status and limits

- Prototype for a hackathon; not a medical device and not validated clinically.
- Only synthetic documents are supported; uploads are disabled.
- Real AMD inference results and time measurements are reported in `eval/` only once measured; no accuracy or time savings are claimed before that.

## License

MIT. See `LICENSE`.
