# Development setup

Run `python scripts/doctor.py` to inspect local prerequisites. Use the Docker or native commands in the root README. The default provider requires no keys and no GPU.

After changing API routes or schemas:

1. Run `uv run --project apps/api python scripts/export_contract.py`.
2. Run `npm --prefix apps/web run contract:generate`.
3. Commit both generated files with the source change.

Do not place secrets in `VITE_*` variables: Vite exposes those values to browser bundles.

