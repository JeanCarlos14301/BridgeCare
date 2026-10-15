# BridgeCare

**An AI that knows when to stop.** BridgeCare helps nursing and discharge-coordination staff turn a discharge document into a clear patient sheet. Every extracted field cites its source, conflicts and unsupported values block the output, and nothing reaches the patient until a human reviewer approves the exact revision.

BridgeCare does **not** diagnose, recommend treatment, calculate doses, or approve its own output. All demo documents are synthetic.

Built for the AMD Developer Hackathon ACT III (Track 2, Health and Wellbeing). Model inference runs on AMD GPUs through **AMD Token Factory**.

## Contents

1. [How it works](#how-it-works)
2. [Architecture](#architecture)
3. [Team guide: first run](#team-guide-first-run)
4. [Using real AMD inference](#using-real-amd-inference)
5. [Daily development workflow](#daily-development-workflow)
6. [Try the demo fixtures](#try-the-demo-fixtures)
7. [Public deployment](#public-deployment)
8. [Configuration reference](#configuration-reference)
9. [Troubleshooting](#troubleshooting)
10. [Repository map](#repository-map)
11. [Status and limits](#status-and-limits)

## How it works

1. A user picks a synthetic discharge document. The text is split by page.
2. The model returns JSON: medications, follow-up, warning signs, activity, diet, a plain-language summary, and uncertainties. Every item carries an `evidence_state` (`supported`, `missing`, `ambiguous`, `conflicting`) and citations (document, page, exact quote).
3. The backend validates the output and never trusts it:
   - strict schema: unknown keys such as `"status": "approved"` reject the whole output;
   - every quote must exist on the cited page;
   - every medication value (name, dose, unit, route, frequency, duration) must appear verbatim, on token boundaries, inside a verified quote, so an altered dose such as `50` for `500` is caught.
4. The result is an immutable **revision** with a SHA-256 content hash. A **gate** lists blocking reasons; a conflict needs a written resolution note.
5. Only an authenticated reviewer can approve, and only the exact `revision_id` + `content_hash`. Editing or reprocessing invalidates the approval.
6. The printable patient sheet renders medications only from validated fields, never from model prose, and returns 409 until a valid approval exists.

Document text is untrusted data: instructions inside it never change the prompt, the schema, or the gate. A quote on the page proves documentary support, not clinical correctness; that judgement stays with the reviewer.

## Architecture

```text
                 ┌──────────── Host (local Docker, Azure VM, or any PC) ─────────────┐
Browser ─HTTPS─> │ Caddy (VM) or Cloudflare Tunnel ──> web (nginx + UI) ──> api       │
                 │                                     /api proxy      FastAPI+SQLite │
                 └──────────────────────────────────────────────────────────┬─────────┘
                                                                            │ HTTPS + team key
                                                                            ▼
                                        AMD Token Factory (OpenAI-compatible, AMD GPUs)
```

| Piece | Role |
| --- | --- |
| **AMD Token Factory** | Model inference on AMD GPUs. Required for the hackathon; the only external dependency in real mode. |
| `apps/api` | FastAPI: sessions, case lifecycle, validation gate, provider adapters, versioned prompt, SQLite. |
| `apps/web` | React review UI and printable patient sheet; talks only to its own `/api`. |
| Mock provider | Offline replay of each fixture's recorded response, for development without a key. Always labelled MOCK. |
| Azure VM + Caddy | Always-on public HTTPS for judging (Azure for Students credit). |
| Cloudflare quick tunnel | Free temporary public HTTPS URL from any machine, for testing and recording. |

## Team guide: first run

### 1. Install the tools

| Tool | Needed for | Check |
| --- | --- | --- |
| Git | Everything | `git --version` |
| Docker Desktop (Compose v2) | Running the app | `docker compose version` |
| [uv](https://docs.astral.sh/uv/) | API checks, scripts, evaluation | `uv --version` |
| Node.js 22.12+ and npm | Web checks and UI development | `node --version` |

`uv run --project apps/api python scripts/doctor.py` reports what is missing.

### 2. Clone and configure

```bash
git clone https://github.com/JeanCarlos14301/BridgeCare.git
cd BridgeCare
cp .env.example .env
```

Edit **your own** `.env` (never commit it, never send the file to anyone). Generate the two secrets:

```bash
python -c "import secrets; print(secrets.token_urlsafe(18))"   # REVIEWER_PASSWORD
python -c "import secrets; print(secrets.token_hex(32))"       # SESSION_SECRET
```

Leave `LLM_PROVIDER=mock` for your first run.

### 3. Start the stack

```bash
docker compose up --build
```

Open <http://localhost:5173>. Pick a fixture; with the mock provider the case shows a **MOCK** badge. Log in as reviewer with the `REVIEWER_PASSWORD` from your `.env`. API docs: <http://localhost:8000/docs>.

Stop with `docker compose down` (data stays in the `api-data` volume; `--volumes` deletes it).

## Using real AMD inference

The team shares **one** Token Factory key. Ask Jean for it by direct message. Never paste it in the group chat, an issue, a screenshot, or a commit.

In `.env`:

```env
LLM_PROVIDER=openai_compatible
LLM_BASE_URL=https://developer.amd.com.cn/radeon/api
LLM_API_KEY=<team key>
LLM_MODEL=MiMo-V2.6-Flash
LLM_REASONING_EFFORT=none
```

This is the evaluated configuration (prompt `extraction-v4`). `MiMo-V2.6-Flash` thinks by default; `LLM_REASONING_EFFORT=none` turns that off so the output budget goes to the JSON.

Check the connection (the script reads the `LLM_*` variables from your shell environment), then restart:

```bash
uv run --project apps/api python scripts/smoke_amd.py
docker compose up -d --build
```

`/api/ready` must report `provider_mode: openai_compatible` and that the model is listed. Missing values stop startup; the app never falls back to mock silently.

Shared limits apply to the whole team: about **20 requests per minute**, a small daily spend cap, and a daily reset at 03:00 UTC (22:00 in Colombia). Each processed case is one request and takes about 15–20 seconds. Announce evaluation runs in the team chat. Only synthetic documents may be sent: the Token Factory terms forbid sensitive personal or health data. Details: `infra/amd/README.md`.

## Daily development workflow

1. Update and branch: `git switch main && git pull && git switch -c feat/<short-name>` (or `fix/...`).
2. Work only inside your ownership area (`AGENTS.md`, `docs/team.md`). Coding agents must follow `AGENTS.md`, and you review what they write.
3. Run the checks for what you touched:

   ```bash
   # API
   uv run --project apps/api ruff check apps/api scripts
   uv run --project apps/api mypy apps/api/app
   uv run --project apps/api pytest apps/api/tests
   uv run --project apps/api python scripts/export_contract.py --check
   # Web
   npm --prefix ./apps/web run lint
   npm --prefix ./apps/web run typecheck
   npm --prefix ./apps/web test -- --run
   npm --prefix ./apps/web run build
   # Fixtures and images
   uv run --project apps/api python eval/check_fixtures.py
   docker compose build
   ```

4. If you changed API routes or schemas, regenerate and commit the contract with `uv run --project apps/api python scripts/export_contract.py` and `npm --prefix ./apps/web run contract:generate`, and tell Edgar and Felipe.
5. Open a small PR. CODEOWNERS requests the owner's review; CI must be green. Team merges happen at 12:30 and 18:30.

## Try the demo fixtures

| Fixture | Expected behaviour |
| --- | --- |
| `fx01`, `fx02` clear cases | `needs_review`, approvable; approve and print the patient sheet |
| `fx03` missing details | Values shown as not stated (`missing`); still reviewable |
| `fx04` contradictory dose | Gate requires a resolution note before approval |
| `fx05` prompt injection | The injected instruction is in the source but never in the output |
| `fx06` provider failure | Mock only: the case ends `failed` with `provider_error` |
| `fx07` emergency department discharge (cough) | Three medicines including an inhaler (2 puffs), return precautions; try the Spanish patient sheet |

Also try opening a case from an incognito window (another session gets 404) and opening the patient sheet before approving (409).

Evaluation against a running stack (reads `REVIEWER_PASSWORD` from the environment):

```bash
uv run --project apps/api python eval/run_eval.py --base-url http://localhost:5173/api
```

With the mock provider the results only prove that the pieces fit together; they are not model accuracy.

## Public deployment

**Live demo:** <https://bridgecare-team944.northcentralus.cloudapp.azure.com> (Azure VM, real inference on AMD Token Factory). The reviewer password is provided in the submission form, not in this repository.

Merging to `main` does **not** update the live demo. Jean deploys tested `main` to the VM with `scripts/deploy-vm.sh`; see "Release process" in `docs/deploy.md`.

Both options run in production mode (secure cookies, uploads off, no exposed API port) and need `REVIEWER_PASSWORD` and `SESSION_SECRET` in `.env`.

- **Cloudflare quick tunnel** (free, temporary URL, the machine must stay on): `docker compose -f compose.yaml -f compose.tunnel.yaml up -d --build`, then read the `trycloudflare.com` URL from `docker compose -f compose.yaml -f compose.tunnel.yaml logs cloudflared`.
- **Azure VM with Caddy** (always on, for judging): follow `docs/deploy.md` option B with `compose.prod.yaml`.

Verify any public URL from your own machine with `uv run --project apps/api python scripts/check_deploy.py <url>`. With real inference enabled, anyone with the URL spends the team's Token Factory quota, so stop temporary tunnels when you are done.

## Configuration reference

`.env.example` documents every variable.

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

Running without Docker (UI development with hot reload):

```bash
cd apps/api && uv sync --dev && uv run fastapi dev app/main.py --port 8000   # terminal 1
cd apps/web && npm ci && npm run dev                                         # terminal 2
```

The native API reads exported variables and an optional `apps/api/.env`, **not** the root `.env`; with no configuration it runs the mock provider and stores SQLite at `apps/api/app.db`.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Reviewer login returns 403 | `REVIEWER_PASSWORD` is empty in `.env`; set it and restart |
| API exits at startup with a settings error | A required value is missing or too short (`SESSION_SECRET` 32+, `REVIEWER_PASSWORD` 12+, all three `LLM_*` in real mode). The error names the variable, never its value |
| `/api/ready` says the model is not in the catalog | Token Factory changed its catalog; pick an id from `GET /v1/models` |
| Case ends `failed` with `provider_error` | Timeout, network error, or rate limit (429). Wait a minute and check that nobody is running an evaluation |
| Case ends `failed` with `schema_invalid` | The model's JSON did not match the schema. Retry; if it repeats, it is prompt work (Felipe) |
| Case ends `failed` with `truncated_output` | The model hit `LLM_MAX_OUTPUT_TOKENS`; raise it or lower `LLM_REASONING_EFFORT` |
| Port 5173 or 8000 already in use | Stop the other process or the previous stack (`docker compose down`) |
| Web image build fails after a contract change | Regenerate `packages/contracts/openapi.d.ts` (workflow step 4) |

## Repository map

- `apps/api`: FastAPI service: sessions, case lifecycle, validation gate, providers, prompts.
- `apps/web`: React review UI and printable patient sheet.
- `packages/contracts`: exported OpenAPI and generated TypeScript types.
- `fixtures/discharge`: six synthetic discharge fixtures with expected results.
- `eval`: fixture checker and evaluation harness.
- `infra`: Dockerfiles, nginx, Caddy, and the AMD runbook.
- `scripts`: doctor, smoke tests, deployment checker, VM bootstrap, contract export.
- `docs`: domain spec, backlog, deployment, security, team, and pre-existing work.

See `AGENTS.md` for ownership and safety rules, `docs/domain-spec.md` for the full contract, and `docs/backlog.md` for current status.

## Results (real inference on AMD)

Three consecutive runs on 2026-10-15 with AMD Token Factory (`MiMo-V2.6-Flash`, prompt `extraction-v4`) over five synthetic fixtures:

| Measure | Total over 3 runs |
| --- | --- |
| Medication fields matching the document (name, dose, unit, route, frequency, duration) | 142/144 |
| Evidence states matching | 24/24 |
| Contradictory dose (fx04) blocked until a resolution note | 3/3 runs |
| Outcome and gate as expected | 15/15 |
| Injected instruction repeated in the output | 0/6 |
| Median model latency per run | 15.0–17.1 s |

Method, prompt history and limits: `eval/README.md`. Raw reports: `eval/reports/`. This is a small synthetic sample and measures extraction fidelity, not clinical correctness.

## Status and limits

- Hackathon prototype; not a medical device and not clinically validated.
- Only synthetic documents are supported; uploads are disabled.
- Real AMD inference works end to end. Accuracy and time figures are reported only from measured runs (`eval/`), with numerators and denominators; nothing is claimed before it is measured.

## License

MIT. See `LICENSE`.
