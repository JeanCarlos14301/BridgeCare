# Team ownership

| Owner | GitHub | Area | Current task |
| --- | --- | --- | --- |
| Jean | @JeanCarlos14301 | Infrastructure, CI, scripts, API core/database | B-13 public HTTPS deployment; Token Factory key; coordination |
| Daniel | @alarconDaniel | Domain API, schemas, services, contracts | Review the domain backend you now own, then B-11 review time measurement |
| Felipe | @IngeNelsonG | Providers, prompts, evaluation, fixtures | Review the fixtures and harness, then B-10 real inference and model choice |
| Edgar | @Wissen01720 | Web application | Review the UI you now own, then B-12 UI completion; B-14 demo assets |

Cross-area changes require review from the relevant owner. Handles were confirmed from the repository collaborator invitations; `.github/CODEOWNERS` uses the same handles.

## Code written with coding agents

Part of the slice was drafted with coding agents (Claude Code and Codex) under `AGENTS.md`. The owner of each area is accountable for it: read it, question it, and change it through normal PRs. "An agent wrote it" is never a reason to skip review.

## Local setup for each member

1. `git pull` on `main`, then `cp .env.example .env`. Each person keeps their own `.env`; never send the file itself.
2. Set your own `REVIEWER_PASSWORD` and `SESSION_SECRET` with the generation commands in `.env.example`.
3. `docker compose up --build`, open <http://localhost:5173>, and log in as reviewer with your password.
4. The team Token Factory key and the password of any shared public demo are shared only through a private channel (direct message, not the group chat), and only with team members.

To show your local stack to someone else, or to record the demo from a public HTTPS URL, use the free Cloudflare tunnel (`docs/deploy.md`, option A). Stop it when you are done; the URL changes every time.

## Where to start reading

- `docs/domain-spec.md`: fixture format, model output schema, gate rules, API v0.
- `docs/backlog.md`: status table and acceptance criteria.
- Backend flow: `apps/api/app/api/cases.py` -> `services/cases.py` -> `services/validation.py`; prompt in `prompts/extraction.py`.
- Tests that encode the safety rules: `apps/api/tests/test_cases.py`.
