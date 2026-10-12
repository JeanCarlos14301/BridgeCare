# Public CPU deployment (HTTPS)

One small Linux VM runs the whole demo with Docker Compose. Caddy terminates HTTPS and is the only service with published ports. Inference runs remotely on AMD (Token Factory), so the VM needs no GPU.

```text
Browser ──HTTPS 443──> Caddy ──> web (nginx, UI + /api proxy) ──> api (FastAPI, SQLite volume)
                                                                    └──HTTPS──> AMD Token Factory
```

Nothing here has been deployed yet. Record the real URL, date and checks in this file once it is.

## 1. Host

- Any Linux VM with Docker Engine and the Compose plugin: 1 vCPU, 2 GB RAM, 20 GB disk is enough.
- Firewall: allow inbound 22 (SSH, ideally restricted to your IP), 80 and 443. Nothing else.
- Creating the VM may cost money. The team lead chooses the provider and sets a budget alert first.

## 2. Hostname

Caddy needs a public DNS name for a Let's Encrypt certificate:

- With a domain: create an `A` record pointing to the VM's public IP.
- Without a domain: use `<ip-with-dashes>.sslip.io` (for `203.0.113.10`, `203-0-113-10.sslip.io`), which resolves to that IP.

## 3. Configure

```bash
git clone https://github.com/JeanCarlos14301/BridgeCare.git && cd BridgeCare
cp .env.example .env
```

Edit `.env` on the server only:

```env
PUBLIC_HOST=203-0-113-10.sslip.io
SESSION_SECRET=<output of: openssl rand -hex 32>
REVIEWER_PASSWORD=<12+ characters, shared with judges through the submission form only>
LLM_PROVIDER=openai_compatible
LLM_BASE_URL=https://developer.amd.com.cn/radeon/api
LLM_API_KEY=<team Token Factory key>
LLM_MODEL=<id from GET /v1/models>
```

Run `chmod 600 .env`. Leave `LLM_PROVIDER=mock` until the key works; the UI then shows MOCK, which must never be presented as real inference.

`compose.prod.yaml` forces `APP_ENV=production` (secure cookies, mandatory `SESSION_SECRET`), `ALLOW_UPLOADS=false`, and CORS for `https://$PUBLIC_HOST`. Startup fails if `PUBLIC_HOST`, `SESSION_SECRET` or `REVIEWER_PASSWORD` is missing.

## 4. Start

```bash
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
docker compose -f compose.yaml -f compose.prod.yaml ps
```

## 5. Verify (from your own machine)

```bash
curl -sI https://$PUBLIC_HOST/ | head -n 1                    # HTTP/2 200
curl -s -o /dev/null -w "%{http_code}\n" http://$PUBLIC_HOST/  # 308 redirect
curl -s https://$PUBLIC_HOST/api/ready                         # status ready, provider_mode
nc -zv $PUBLIC_HOST 8000                                       # must fail: API not exposed
```

Then open the URL in an incognito window, pick a fixture, log in as reviewer, approve, and print the patient view. The plan's check for Wednesday is that the public URL opens from incognito.

Verified locally with `PUBLIC_HOST=localhost`: HTTPS 200, HTTP 308 to HTTPS, HSTS/CSP/nosniff/Referrer-Policy headers, `Secure; HttpOnly; SameSite=Strict` session cookie, reviewer login, ports 8000 and 5173 closed.

## 6. Operate

- Update: `git pull && docker compose -f compose.yaml -f compose.prod.yaml up -d --build`.
- Logs (metadata only): `docker compose -f compose.yaml -f compose.prod.yaml logs -f api`.
- Backup before risky changes: `docker compose -f compose.yaml -f compose.prod.yaml exec api python -c "import sqlite3; sqlite3.connect('/data/app.db').backup(sqlite3.connect('/data/backup.db'))"`.
- After judging: rotate `SESSION_SECRET` (ends every session) and `REVIEWER_PASSWORD`, then restart.

## 7. Teardown

Back up evidence first. `docker compose -f compose.yaml -f compose.prod.yaml down` stops the stack but keeps volumes; adding `--volumes` deletes the database and certificates. Destroy the VM from the provider console to stop billing; a stopped VM may still bill for disk and IP. No teardown runs automatically.

## UI constraints from the Content-Security-Policy

Caddy sends `default-src 'self'` with `style-src 'self' 'unsafe-inline'`. The UI must not load scripts, fonts or styles from CDNs, use inline `<script>`, or call any origin other than its own `/api`.
