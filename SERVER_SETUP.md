# Server setup guide

Step-by-step instructions for the people who install and run Solution Velocity on our own servers.
For what the product does and how to develop it, see [README.md](README.md).

**What you are deploying:** one Node.js service, which serves both the web app and the API on one port (default `4000`), plus a PostgreSQL database. A reverse proxy (Caddy or nginx) in front provides HTTPS.

```
Browser ──HTTPS──▶ Caddy / nginx ──HTTP──▶ Solution Velocity (127.0.0.1:4000) ──▶ PostgreSQL
```

There are two ways to install it. Pick one:

- **A. Docker Compose (recommended):** app and PostgreSQL in containers, upgraded with one command.
- **B. Directly on the host:** Node.js plus an existing or new PostgreSQL, run by systemd.

---

## 0. Before you start

| You need                | Notes                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------- |
| A Linux server          | 1 vCPU and 1 GB RAM is plenty for a small team. Ubuntu 22.04/24.04 or Debian 12 are fine. |
| A DNS name              | For example `velocity.yourcompany.com`, with an A/AAAA record pointing at the server.    |
| Ports 80 and 443 open   | For HTTPS and certificate issuance. Port 4000 should **not** be public.                  |
| Access to this repo     | `git clone https://github.com/The-5-man-mission/pdlc.git`                                |

Decide two values now. You will need them below:

- **`APP_URL`**: the exact public address, for example `https://velocity.yourcompany.com` (no trailing slash). Login only works when the browser's address matches this exactly.
- **Database password**: a long random string. You can generate one with `openssl rand -base64 32`.

---

## A. Docker Compose

### A1. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
```

### A2. Get the code and configure it

```bash
sudo git clone https://github.com/The-5-man-mission/pdlc.git /opt/solution-velocity
```

```bash
cd /opt/solution-velocity && sudo cp .env.production.example .env.production && sudo chmod 600 .env.production
```

Edit `.env.production`:

```
APP_URL=https://velocity.yourcompany.com
POSTGRES_PASSWORD=<the long random string>
ALLOW_SIGNUP=false
TRUST_PROXY=1
```

### A3. Build and start

```bash
sudo docker compose --env-file .env.production up -d --build
```

Check that it is healthy. It should print `{"status":"ok"}`:

```bash
curl -s http://127.0.0.1:4000/api/health
```

The database schema is created automatically on first start.

### A4. Create the first owner account

```bash
sudo docker compose --env-file .env.production exec app node dist/scripts/create-admin.js --email owner@yourcompany.com --name "Owner Name" --workspace "Your Company" --system-admin
```

It prints a temporary password once. Give it to the owner and ask them to change it right away (Settings → Your account → Change password).

Then set up HTTPS: see [section C](#c-https-reverse-proxy).

### A5. Day-to-day commands (Docker)

| Task          | Command                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| View logs     | `sudo docker compose logs -f app`                                           |
| Restart       | `sudo docker compose --env-file .env.production restart app`               |
| Stop          | `sudo docker compose --env-file .env.production down` (data is kept in the `pgdata` volume) |
| Upgrade       | see [section D](#d-upgrading)                                               |

---

## B. Directly on the host (no Docker)

### B1. Install Node.js 20 or newer, and PostgreSQL

On Ubuntu or Debian:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs git
```

```bash
sudo apt-get install -y postgresql
```

Skip the PostgreSQL install if you already run a database server. Any PostgreSQL 14+ works.

### B2. Create the database and user

```bash
sudo -u postgres psql -c "CREATE USER velocity WITH PASSWORD 'the-long-random-string';"
```

```bash
sudo -u postgres psql -c "CREATE DATABASE velocity OWNER velocity;"
```

### B3. Get the code and build it

```bash
sudo useradd --system --home /opt/solution-velocity --shell /usr/sbin/nologin velocity
```

```bash
sudo git clone https://github.com/The-5-man-mission/pdlc.git /opt/solution-velocity && sudo chown -R velocity:velocity /opt/solution-velocity
```

```bash
cd /opt/solution-velocity && sudo -u velocity npm ci && sudo -u velocity npm run build
```

### B4. Configure

Create `/etc/solution-velocity.env`, readable by root and the service only:

```
NODE_ENV=production
PORT=4000
HOST=127.0.0.1
APP_URL=https://velocity.yourcompany.com
DATABASE_URL=postgres://velocity:the-long-random-string@localhost:5432/velocity
ALLOW_SIGNUP=false
TRUST_PROXY=1
LOG_LEVEL=info
```

```bash
sudo chown root:velocity /etc/solution-velocity.env && sudo chmod 640 /etc/solution-velocity.env
```

If the database is on another machine and requires TLS, append `?sslmode=require` to `DATABASE_URL`. If the password contains special characters (`@ : / ? #`), URL-encode them.

### B5. Run it as a service

```bash
sudo cp /opt/solution-velocity/deploy/solution-velocity.service /etc/systemd/system/
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now solution-velocity
```

```bash
curl -s http://127.0.0.1:4000/api/health
```

### B6. Create the first owner account

```bash
cd /opt/solution-velocity/apps/server && sudo -u velocity bash -c 'set -a; . /etc/solution-velocity.env; set +a; node dist/scripts/create-admin.js --email owner@yourcompany.com --name "Owner Name" --workspace "Your Company" --system-admin'
```

As with Docker, it prints a temporary password once. The owner should change it after signing in.

### B7. Day-to-day commands (host)

| Task        | Command                                        |
| ----------- | ---------------------------------------------- |
| View logs   | `sudo journalctl -u solution-velocity -f`      |
| Restart     | `sudo systemctl restart solution-velocity`     |
| Status      | `systemctl status solution-velocity`           |

---

## C. HTTPS reverse proxy

The app must be reached over HTTPS in production: secure cookies and HSTS turn on when `APP_URL` starts with `https://`.

**Caddy (simplest, with automatic certificates).** Install Caddy (https://caddyserver.com/docs/install), put the contents of [deploy/Caddyfile](deploy/Caddyfile) in `/etc/caddy/Caddyfile` with your hostname, then:

```bash
sudo systemctl reload caddy
```

**nginx.** Use [deploy/nginx.conf](deploy/nginx.conf) as the site config, get a certificate (for example with `sudo certbot --nginx -d velocity.yourcompany.com`), then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Keep `TRUST_PROXY=1` when a proxy is in front. It lets rate limiting see real client IPs.

---

## D. Upgrading

Database migrations run automatically when the app starts. Take a backup first (section E).

**Docker:**

```bash
cd /opt/solution-velocity && sudo git pull && sudo docker compose --env-file .env.production up -d --build
```

**Host:**

```bash
cd /opt/solution-velocity && sudo -u velocity git pull && sudo -u velocity npm ci && sudo -u velocity npm run build && sudo systemctl restart solution-velocity
```

Then confirm `/api/health` returns `ok` and sign in once.

---

## E. Backups and restore

Everything (accounts, products, answers, XP) is in PostgreSQL. Back it up daily and keep copies off the server.

**Backup (Docker):**

```bash
sudo docker compose exec -T db pg_dump -U velocity -Fc velocity > velocity-$(date +%F).dump
```

**Backup (host):**

```bash
sudo -u postgres pg_dump -Fc velocity > velocity-$(date +%F).dump
```

**Restore** into an empty database. Stop the app first:

```bash
pg_restore --clean --if-exists --no-owner -d "postgres://velocity:PASSWORD@localhost:5432/velocity" velocity-YYYY-MM-DD.dump
```

With Docker, pipe the dump in instead: `sudo docker compose exec -T db pg_restore --clean --if-exists --no-owner -U velocity -d velocity < velocity-YYYY-MM-DD.dump`.

A cron entry for a nightly backup on the host (keeps 14 days):

```
0 2 * * * postgres pg_dump -Fc velocity > /var/backups/velocity-$(date +\%F).dump && find /var/backups -name 'velocity-*.dump' -mtime +14 -delete
```

---

## F. Users and access

- **Sign-up** is invite-only when `ALLOW_SIGNUP=false` (recommended). The very first account can always be created, so a fresh install is never locked out.
- **Inviting people:** an owner or admin goes to Settings → Team → **Invite link** and sends the link. Links work once and expire after 7 days.
- **Forgotten password:** an owner or admin uses Settings → Team → Send reset email next to the person. Configure `RESET_SMTP_HOST`, `RESET_SMTP_FROM` and optional SMTP credentials as described in SECURITY.md. The server sends a single-use link valid for 24 hours directly to the registered email address.
- **Owner locked out:** run the `create-admin` command again (A4 or B6) with the owner's email. It resets the password and signs them out everywhere.
- **System admin:** grant global admin access explicitly when creating or resetting an account with `--system-admin`. Email addresses do not grant admin access.
- **Roles:** owner (everything, including ownership), admin (settings, invites, members), member (product work).

---

## G. Configuration reference

| Variable            | Required | Default | Meaning                                                                         |
| ------------------- | -------- | ------- | ------------------------------------------------------------------------------- |
| `APP_URL`           | yes      | —       | Exact public URL. Used for invite links and to block cross-site requests.      |
| `DATABASE_URL`      | yes      | —       | `postgres://user:pass@host:5432/db`; add `?sslmode=require` for remote TLS.    |
| `NODE_ENV`          |          | `development` | Set to `production`.                                                     |
| `PORT` / `HOST`     |          | `4000` / `0.0.0.0` | Listen address. Use `HOST=127.0.0.1` when not in Docker.               |
| `ALLOW_SIGNUP`      |          | `true`  | `false` = invite-only.                                                          |
| `TRUST_PROXY`       |          | `0`     | `1` behind one reverse proxy.                                                   |
| `SESSION_TTL_DAYS`  |          | `30`    | How long a login lasts. It renews while in use.                                 |
| `DATABASE_POOL_MAX` |          | `10`    | Maximum DB connections per app instance.                                        |
| `LOG_LEVEL`         |          | `info`  | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`. Logs are JSON on stdout. |
| `INSIGHTS_PROVIDER` |          | `rules` | Leave as `rules` until the AI integration ships.                               |
| `LLAMA_CPP_URL`     |          | `http://127.0.0.1:8080` | Endpoint for llama-server OpenAI-compatible API (`/v1/chat/completions`). |
| `OLLAMA_HOST`       |          | `http://127.0.0.1:11434` | Fallback endpoint for local Ollama daemon.                           |

The app refuses to start, and lists the problem, if a required variable is missing or invalid.

---

## H. Monitoring and troubleshooting

- **Health check:** `GET /api/health` returns `200 {"status":"ok"}`, or `503` when the database is unreachable. Point your uptime monitor at `https://velocity.yourcompany.com/api/health`.
- **"Cross-origin request blocked" or login does nothing:** `APP_URL` does not exactly match the address in the browser (check `https` vs `http`, `www`, the port, and no trailing slash).
- **Logged out immediately over HTTPS:** the proxy is not passing HTTPS through correctly, or `APP_URL` starts with `http://`. Use `https://` in `APP_URL`.
- **"Invalid environment configuration" at start:** the log names the missing or bad variable.
- **Database connection errors:** check `DATABASE_URL`, that PostgreSQL is running, and that it accepts connections from the app's host (`pg_hba.conf`).
- **Too many requests (429):** the per-IP limits are 600 API calls/minute and 100 login attempts per 15 minutes. If everyone shows up as one IP, `TRUST_PROXY` is not set.

## Security checklist

- [ ] `APP_URL` uses `https://` and the proxy redirects HTTP to HTTPS
- [ ] Port 4000 and PostgreSQL (5432) are not reachable from the internet
- [ ] `ALLOW_SIGNUP=false`
- [ ] `.env.production` or `/etc/solution-velocity.env` is not world-readable
- [ ] Nightly database backups are running and a restore has been tested
- [ ] The temporary owner password was changed after first sign-in

---

## I. Hands-Free Voice AI with llama.cpp (CPU-Only)

For voice dictation and "Jira for Beginners" synthesis on a CPU-only server (e.g. 30 GB RAM with Qwen 30B A3B / MoE or Qwen 2.5 14B):

### 1. Run `llama-server` on the Host
Start the `llama-server` binary on port `8080`. `--mmap` ensures the Linux kernel memory-maps the GGUF file and only pages the active weights into RAM as needed:

```bash
llama-server \
  -m /path/to/qwen-30b-a3b-q3_k_m.gguf \
  --host 127.0.0.1 \
  --port 8080 \
  --ctx-size 8192 \
  --threads $(nproc) \
  --batch-size 512 \
  --ubatch-size 512 \
  --mmap \
  --cont-batching
```

### 2. Configure Solution Velocity
Ensure `.env` or `.env.production` contains:
```env
LLAMA_CPP_URL=http://127.0.0.1:8080
```

The Express API will automatically detect `llama-server` via its OpenAI-compatible endpoint (`/v1/chat/completions`) and route voice dictations through it. If `llama-server` is not running, it falls back to Ollama (`http://127.0.0.1:11434`) and then to the server fallback engine.

