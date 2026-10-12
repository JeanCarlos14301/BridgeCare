# Development setup

Run `python scripts/doctor.py` to inspect local prerequisites. Use the Docker or native commands in the root README. The default provider requires no keys and no GPU.

After changing API routes or schemas:

1. Run `uv run --project apps/api python scripts/export_contract.py`.
2. Run `npm --prefix apps/web run contract:generate`.
3. Commit both generated files with the source change.

## Database migrations

The API applies pending SQL files from `apps/api/app/db/migrations/` at startup and records each version in `schema_migrations`.

- Name files `NNNN_short_name.sql` (four digits, lowercase, underscores). They run in name order.
- Never edit a migration that is already on `main`; add a new one instead.
- Each file runs in one transaction with its ledger row. A failing migration stops startup and leaves no partial changes.
- Do not put `BEGIN`/`COMMIT` in migration files; the runner adds them.
- `/ready` returns 503 with `Database is unavailable` if the database or ledger cannot be read.

Do not place secrets in `VITE_*` variables: Vite exposes those values to browser bundles.

