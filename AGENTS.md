# Contributor Guide

## Ownership

- Jean: `infra/`, `.github/`, `scripts/`, `apps/api/app/core/`, `apps/api/app/db/`
- Daniel: `apps/api/app/api/`, `apps/api/app/schemas/`, `apps/api/app/services/`, `packages/contracts/`
- Felipe: `apps/api/app/providers/`, `apps/api/app/prompts/`, `eval/`, `fixtures/`
- Edgar: `apps/web/`

## Commands

- Full stack: `docker compose up --build`
- API: `cd apps/api && uv sync --dev && uv run fastapi dev app/main.py`
- Web: `cd apps/web && npm ci && npm run dev`
- API checks: `cd apps/api && uv run ruff check . && uv run mypy app && uv run pytest`
- Web checks: `cd apps/web && npm run lint && npm run typecheck && npm test -- --run && npm run build`
- Contract: `uv run --project apps/api python scripts/export_contract.py --check`
- Smoke test: `uv run --project apps/api python scripts/smoke.py`

## Scope and safety limits

- Phase A is generic scaffolding only. Health-specific behavior belongs in the Phase B backlog.
- The model never sets approval state. Approval belongs to authenticated server-side review logic.
- Never add diagnosis, treatment, dose calculation, or autonomous approval behavior.
- Never log request bodies, source documents, prompts, generated content, credentials, or secret headers.
- Never silently fall back from a configured real provider to mock mode.
- Never invent verification results, dependency versions, action SHAs, benchmarks, or deployment claims.
- All code, comments, documentation, UI text, and commit messages must be in English.
  Exception: `CODEX_PROMPT.md` and `Plan operativo — CarePath Bridge (Track 2).md` are internal planning records kept in their original language (the plan is in Spanish and uses the earlier working name CarePath Bridge). Do not translate, rename, or flag them; every other file follows the English rule.
- Keep changes inside the listed ownership area when possible and request review from the owner of shared contracts.

