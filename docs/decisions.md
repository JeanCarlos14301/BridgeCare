# Architecture decisions

## ADR-001: CPU-first mock provider

Status: accepted. AMD credits are unapproved, so every local and CI path uses a deterministic mock by default. A configured real provider fails closed.

## ADR-002: SQLite and one API replica

Status: accepted for the hackathon scaffold. Compose uses one persistent volume and one API worker. Distributed jobs and horizontal replicas are out of scope.

## ADR-003: Browser uses a same-origin proxy

Status: accepted. Both Vite and nginx expose `/api`, preventing internal Docker hostnames and backend keys from entering frontend configuration.

## ADR-004: Contract is generated and checked

Status: accepted. FastAPI OpenAPI is the source; committed JSON and TypeScript artifacts make drift reviewable.

