# Architecture

The Phase A system has two application containers and one persistent volume:

```text
Browser -> web:5173 (nginx or Vite) -> /api proxy -> api:8000 -> SQLite volume
                                                       |
                                                       +-> mock provider (default)
                                                       +-> OpenAI-compatible endpoint (optional)
```

The browser receives no backend credentials and never uses the Docker service hostname. The API is one process and one replica because SQLite is the only persistence layer. The provider boundary supports a deterministic CPU mock and a bounded OpenAI-compatible HTTP client intended for a future vLLM deployment.

Phase B domain entities, approval state, document handling, and review UI do not exist yet.

