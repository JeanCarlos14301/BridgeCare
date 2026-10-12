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

## Where to start reading

- `docs/domain-spec.md`: fixture format, model output schema, gate rules, API v0.
- `docs/backlog.md`: status table and acceptance criteria.
- Backend flow: `apps/api/app/api/cases.py` -> `services/cases.py` -> `services/validation.py`; prompt in `prompts/extraction.py`.
- Tests that encode the safety rules: `apps/api/tests/test_cases.py`.
