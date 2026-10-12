# Public deployment (HTTPS)

Inference runs remotely on AMD (Token Factory), so the web host needs no GPU and no AMD credits. Two free options use the same images:

| Option | Cost | Use it for |
| --- | --- | --- |
| A. Cloudflare quick tunnel from any machine running Docker | Free, no account | Testing, recording the video, live demos while the machine is on |
| B. Small Linux VM with Caddy (student cloud credits) | Free with credits | The judging window: a stable URL that is always on |

Both force `APP_ENV=production` (secure cookies, mandatory `SESSION_SECRET`) and `ALLOW_UPLOADS=false`, publish no API or web ports, and refuse to start without `SESSION_SECRET` and `REVIEWER_PASSWORD`. nginx sends the security headers (HSTS, CSP, nosniff, Referrer-Policy) on every path.

## Deployment record

| Date (UTC-5) | Where | What was verified |
| --- | --- | --- |
| 2026-10-12 | Cloudflare quick tunnel from a team laptop | `check_deploy.py` 15/15, mock provider |
| 2026-10-12 | Azure for Students VM `Standard_B2ats_v2` (2 vCPU, AMD EPYC, 1 GiB) in North Central US, `https://bridgecare-team944.northcentralus.cloudapp.azure.com` | `check_deploy.py` 15/15 with `provider_mode=openai_compatible`; one real case through the public URL: processed by Token Factory (`self-dploy/DeepSeek-V4-Flash`, prompt `extraction-v2`, model 26.9 s), patient view 409 before approval and 200 after |

The Azure subscription only allows these regions: `spaincentral`, `chilecentral`, `germanywestcentral`, `northcentralus`, `italynorth`. The VM was created from Azure Cloud Shell with `az vm create` (image `Canonical:ubuntu-24_04-lts:server:latest`, Standard SSD), then `az vm open-port --port 80,443`.

## Option A: Cloudflare quick tunnel

```text
Browser ──HTTPS──> Cloudflare edge <──outbound tunnel── cloudflared ──> web ──> api
```

1. In `.env`, set a strong `REVIEWER_PASSWORD` and `SESSION_SECRET` (generation commands are in `.env.example`).
2. Start the stack and read the URL:

   ```bash
   docker compose -f compose.yaml -f compose.tunnel.yaml up -d --build
   docker compose -f compose.yaml -f compose.tunnel.yaml logs cloudflared | grep -o "https://[a-z0-9-]*\.trycloudflare\.com"
   ```

3. Verify from the same machine: `uv run --project apps/api python scripts/check_deploy.py <url>`.
4. Stop: `docker compose -f compose.yaml -f compose.tunnel.yaml down`.

Limits: the URL is random and changes on every restart, the machine must stay on and awake, and quick tunnels have no uptime guarantee. The tunnel only connects outward, so no router or firewall changes are needed.

## Option B: Linux VM with Caddy

One small Linux VM runs the whole demo with Docker Compose. Caddy terminates HTTPS and is the only service with published ports.

```text
Browser ──HTTPS 443──> Caddy ──> web (nginx, UI + /api proxy) ──> api (FastAPI, SQLite volume)
                                                                    └──HTTPS──> AMD Token Factory
```

The team uses **Azure for Students** (US$100 credit, no card). Create the VM in the Azure portal:

1. Virtual machines → Create → Azure virtual machine.
2. Image **Ubuntu Server 24.04 LTS**; size **B1s** or **B2s** (smallest that is listed for your subscription and region); authentication **SSH public key** (keep the private key on your machine only).
3. Inbound ports: allow **SSH (22)**, **HTTP (80)** and **HTTPS (443)**. After creation, restrict port 22 to your own IP in the network security group.
4. After creation, set a DNS name label on the public IP (Configuration) to get `<label>.<region>.cloudapp.azure.com`, or use `<ip-with-dashes>.sslip.io` as `PUBLIC_HOST`.
5. In Cost Management, create a budget alert well under the credit. Stop **and** delete the VM after judging; deallocated disks and public IPs can still consume credit.

## 1. Host

- An Ubuntu 22.04 or 24.04 VM: 1 vCPU, 2 GB RAM, 20 GB disk is enough (1 GB works with the swap the bootstrap adds).
- Provider firewall: allow inbound 22 (SSH, ideally restricted to your IP), 80 and 443. Nothing else.
- Creating the VM may cost money. The team lead chooses the provider and sets a budget alert first.

Prepare the host (Docker Engine and Compose plugin from Docker's apt repository, ufw with 22/80/443 only, swap on small machines):

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/JeanCarlos14301/BridgeCare.git && cd BridgeCare
sudo bash scripts/vm-bootstrap.sh
```

While the repository is private, `git clone` needs credentials: use a fine-grained personal access token with read-only access to this repository, and do not store it on the VM.

## 2. Hostname

Caddy needs a public DNS name for a Let's Encrypt certificate:

- With a domain: create an `A` record pointing to the VM's public IP.
- Without a domain: use `<ip-with-dashes>.sslip.io` (for `203.0.113.10`, `203-0-113-10.sslip.io`), which resolves to that IP.

## 3. Configure

```bash
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

## 5. Verify (from your own machine, not the VM)

```bash
uv run --project apps/api python scripts/check_deploy.py https://$PUBLIC_HOST
```

It checks HTTPS, the HTTP-to-HTTPS redirect, the security headers, the session cookie flags (`Secure`, `HttpOnly`, `SameSite=Strict`), API health and readiness, the fixture list, and that ports 8000 and 5173 are unreachable. It warns when the deployment still runs the mock provider. Run it from outside the VM so the port checks are meaningful.

Then open the URL in an incognito window, pick a fixture, log in as reviewer, approve, and print the patient view. The plan's check for Wednesday is that the public URL opens from incognito.

Verified locally with `PUBLIC_HOST=localhost` and `check_deploy.py https://localhost --insecure` (Caddy's local CA): 15/15 checks passed, with the mock-provider warning.

## Release process

The VM never updates itself. Merging to `main` does not change the live demo until Jean deploys, so a broken merge cannot reach judges unnoticed.

1. Team merges to `main` at 12:30 and 18:30 through reviewed PRs with green CI.
2. After the 18:30 merge (or when a fix is urgent), Jean runs `main` locally with real inference and checks the fixtures.
3. On the VM: `cd ~/BridgeCare && bash scripts/deploy-vm.sh`. It refuses to run with local edits, fast-forwards to `origin/main`, rebuilds, waits for `/api/ready` through Caddy, appends the commit to `.deploy-history`, and prints the rollback command.
4. From your own machine: `uv run --project apps/api python scripts/check_deploy.py https://<PUBLIC_HOST>` must pass 15/15.
5. Freeze: no deploys while recording the video or during the judging window unless fixing an outage.

Rollback: run the printed `git checkout <previous> && docker compose ... up -d --build`. The next `deploy-vm.sh` returns to `main` by itself.

### One-time: read-only deploy key on the VM

So `git pull` works without personal tokens:

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/bridgecare_deploy -C "bridgecare-vm deploy key"
cat ~/.ssh/bridgecare_deploy.pub
```

In GitHub: repository **Settings → Deploy keys → Add deploy key**, paste the public key, leave **Allow write access unchecked**. Then on the VM:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/bridgecare_deploy
  IdentitiesOnly yes
EOF
cd ~/BridgeCare && git remote set-url origin git@github.com:JeanCarlos14301/BridgeCare.git
git fetch origin && echo "deploy key works"
```

Delete the deploy key in GitHub after the event.

## 6. Operate

- Update: `bash scripts/deploy-vm.sh` on the VM (see "Release process" below).
- Logs (metadata only): `docker compose -f compose.yaml -f compose.prod.yaml logs -f api`.
- Backup before risky changes: `docker compose -f compose.yaml -f compose.prod.yaml exec api python -c "import sqlite3; sqlite3.connect('/data/app.db').backup(sqlite3.connect('/data/backup.db'))"`.
- After judging: rotate `SESSION_SECRET` (ends every session) and `REVIEWER_PASSWORD`, then restart.

## 7. Teardown

Back up evidence first. `docker compose -f compose.yaml -f compose.prod.yaml down` stops the stack but keeps volumes; adding `--volumes` deletes the database and certificates. Destroy the VM from the provider console to stop billing; a stopped VM may still bill for disk and IP. No teardown runs automatically.

## UI constraints from the Content-Security-Policy

Caddy sends `default-src 'self'` with `style-src 'self' 'unsafe-inline'`. The UI must not load scripts, fonts or styles from CDNs, use inline `<script>`, or call any origin other than its own `/api`.
