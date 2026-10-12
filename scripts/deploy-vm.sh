#!/usr/bin/env bash
# Deploy the latest main to the public VM. Run on the VM from the repository root:
#   bash scripts/deploy-vm.sh
# Fast-forwards to origin/main, rebuilds, waits for /api/ready through Caddy, and prints
# the rollback command. Never prints .env values.
set -euo pipefail

COMPOSE=(docker compose -f compose.yaml -f compose.prod.yaml)

if [ ! -f .env ] || [ ! -f compose.prod.yaml ]; then
  echo "Run from the repository root on the VM (.env and compose.prod.yaml required)." >&2
  exit 1
fi
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Tracked files have local changes; refusing to deploy. Inspect with: git status" >&2
  exit 1
fi

public_host=$(grep -E '^PUBLIC_HOST=' .env | cut -d= -f2-)
if [ -z "${public_host}" ]; then
  echo "PUBLIC_HOST is empty in .env." >&2
  exit 1
fi

# After a rollback HEAD is detached at the running commit; record it, then return to main.
previous=$(git rev-parse --short HEAD)
git switch --quiet main
git fetch --quiet origin main
target=$(git rev-parse --short origin/main)
if [ "${previous}" = "${target}" ]; then
  echo "Already at origin/main (${target}); rebuilding anyway."
else
  echo "Deploying ${previous} -> ${target}:"
  git log --oneline "${previous}..${target}"
fi
git merge --ff-only --quiet origin/main

"${COMPOSE[@]}" up -d --build

echo "Waiting for https://${public_host}/api/ready ..."
for _ in $(seq 1 30); do
  if body=$(curl -fsS --max-time 10 "https://${public_host}/api/ready" 2>/dev/null); then
    echo "Ready: ${body}"
    echo "${target} $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> .deploy-history
    echo "Deployed ${target}. Verify from your own machine:"
    echo "  uv run --project apps/api python scripts/check_deploy.py https://${public_host}"
    echo "Rollback if needed:"
    echo "  git checkout ${previous} && ${COMPOSE[*]} up -d --build"
    exit 0
  fi
  sleep 5
done

echo "API did not become ready. Inspect: ${COMPOSE[*]} logs --tail 50 api" >&2
echo "Rollback: git checkout ${previous} && ${COMPOSE[*]} up -d --build" >&2
exit 1
