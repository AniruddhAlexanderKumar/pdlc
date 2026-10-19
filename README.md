# Solution Velocity

A gamified product development lifecycle (PDLC) workspace. Teams move each product through
**Tell us → Track it → Improve it**:

1. **Tell us**: answer short question decks for each lifecycle stage (Idea → Research → Planning → Design → Prototype → Testing → Launch → Improvement). Answers earn XP, fill the stage quest, and give the insight engine context.
2. **Track it**: a bill of materials from a shared materials library, labour, packaging and overhead, a selling price, and live unit cost, profit and margin.
3. **Improve it**: suggestions such as a cheaper supplier quote, a price that hits your target margin, the biggest cost driver, overdue tasks, or "ready for the next stage". Apply one with a click.

Gamification is what keeps it simple: XP, levels, per-stage quests, a product health grade (A–D), badges, daily streaks and a team leaderboard.

---

## Stack

| Layer    | Choice                                                                                |
| -------- | ------------------------------------------------------------------------------------- |
| Web      | React 19, Vite, Tailwind CSS 4, TanStack Query, React Router                          |
| API      | Node.js (≥ 20), Express 5, Zod validation, Pino logs                                  |
| Database | PostgreSQL (your own server) via Kysely (typed SQL) with versioned migrations          |
| Auth     | Email + password stored in your DB: scrypt hashes, server-side sessions, httpOnly cookies |
| Shared   | `packages/shared`: stages, question bank, costing, XP rules, insight rules (used by API and web) |

```
apps/
  server/        Express API, also serves the built web app in production
    src/auth/      password hashing, sessions, CSRF origin check
    src/db/        Kysely schema + migrations (run automatically on boot)
    src/routes/    auth, products, materials/suppliers, workspace/team, game
    src/services/  XP ledger, insight provider (AI seam), sample data
  web/           React app
packages/
  shared/        domain logic + unit tests
legacy/          the original single-file prototype (reference only)
deploy/          Caddy and nginx examples
```

---

## Run it locally

Requirements: Node.js 20.19+ (tested on 26). No Docker or system Postgres needed for development.

```bash
npm install
cp .env.example .env
```

In one terminal, start a local PostgreSQL. It runs from `node_modules` and keeps its data in `.data/postgres`:

```bash
npm run dev:db
```

In a second terminal, start the API and the web app. Migrations apply automatically:

```bash
npm run dev
```

Open http://localhost:5173 and create an account. The first account can always be created, even when sign-up is turned off. On the empty dashboard, **Explore with sample products** loads a demo workspace.

### Checks

```bash
npm run typecheck
```

```bash
npm test
```

The API smoke test needs the dev server running and creates throwaway users:

```bash
npm run smoke --workspace @sv/server
```

---

## Deploy on your server

> **Server managers:** follow [SERVER_SETUP.md](SERVER_SETUP.md). It is the complete step-by-step guide (Docker or bare metal, HTTPS, first admin, upgrades, backups, troubleshooting). The summary below is for developers.

### Option A: Docker Compose (app + Postgres)

```bash
cp .env.production.example .env.production
```

Set `APP_URL` (your real `https://` address) and a long random `POSTGRES_PASSWORD` in `.env.production`, then:

```bash
docker compose --env-file .env.production up -d --build
```

Create the first owner account. The generated password is printed once, so change it after signing in:

```bash
docker compose exec app node dist/scripts/create-admin.js --email you@company.com --name "Your Name" --workspace "Your Company"
```

The app listens on `127.0.0.1:4000`. Put a TLS reverse proxy in front: [deploy/Caddyfile](deploy/Caddyfile) gets certificates automatically, or use [deploy/nginx.conf](deploy/nginx.conf).

### Option B: Node directly, with your existing PostgreSQL

```bash
npm ci
```

```bash
npm run build
```

Set the environment (see [.env.example](.env.example)), at minimum:

```
NODE_ENV=production
APP_URL=https://velocity.yourcompany.com
DATABASE_URL=postgres://user:pass@db-host:5432/velocity
TRUST_PROXY=1
ALLOW_SIGNUP=false
```

Then start it under systemd, pm2 or similar:

```bash
npm start
```

The server applies pending migrations on start (with a lock, so several instances can boot at once). To run them separately:

```bash
npm run migrate
```

### Configuration

| Variable              | Default                 | Notes                                                                       |
| --------------------- | ----------------------- | --------------------------------------------------------------------------- |
| `APP_URL`             | `http://localhost:5173` | Public URL. Used for invite/reset links and the CSRF origin check. `https://` turns on secure cookies and HSTS. |
| `DATABASE_URL`        | required                | Add `?sslmode=require` for TLS to a remote database.                        |
| `ALLOW_SIGNUP`        | `true`                  | `false` = invite-only (recommended in production).                          |
| `TRUST_PROXY`         | `0`                     | Set to `1` behind nginx, Caddy or a load balancer so rate limits see real IPs. |
| `SESSION_TTL_DAYS`    | `30`                    | Sessions slide forward while in use.                                        |
| `DATABASE_POOL_MAX`   | `10`                    |                                                                             |
| `LOG_LEVEL`           | `info`                  | JSON logs to stdout. Cookies and passwords are redacted.                    |
| `INSIGHTS_PROVIDER`   | `rules`                 | `ai` once an AI provider is implemented (see below).                        |

### Operations

- **Health check:** `GET /api/health` returns 200 when the database is reachable. The Docker image uses it.
- **Backups:** `pg_dump` the database on a schedule. Everything (users, products, XP) lives there.
- **Locked-out owner:** run `create-admin` again with the same email. It resets that password and signs them out everywhere.
- **Forgotten passwords:** there is no email server dependency. An admin opens **Settings → Team → key icon** to create a one-time reset link (valid 24 h) and sends it to the person.

---

## Security model

- Passwords are hashed with scrypt (N=2¹⁵, per-hash salt; parameters are stored with each hash so they can be raised later). The policy is at least 10 characters, mixing letters with numbers or symbols.
- Sessions use a random 256-bit token in an `httpOnly`, `SameSite=Lax` cookie (`__Host-` prefixed and `Secure` on https). Only the token's SHA-256 is stored, and sessions can be revoked server-side. Changing or resetting a password revokes other sessions.
- Login and sign-up are rate-limited. An account locks for 15 minutes after 8 failed attempts, and unknown emails take the same time as known ones.
- CSRF: every state-changing request must come from `APP_URL`'s origin, bodies must be JSON, and cookies are SameSite.
- Every query is scoped to the caller's workspace, and roles are enforced server-side: **owner** (everything, including ownership), **admin** (settings, invites, members, reset links), **member** (product work).
- Helmet sets security headers: a strict CSP (`script-src 'self'`), `frame-ancestors 'none'`, nosniff, and HSTS on https.
- Invite and reset links are single-use, expire, and are stored hashed.

---

## Gamification rules

| Action                                   | XP                     |
| ---------------------------------------- | ---------------------- |
| Create a product                         | 20                     |
| Answer a discovery question              | 5–15 (per question)    |
| Complete a task                          | 15                     |
| Add a material to a product              | 5                      |
| Set a price / fill in all costs          | 10 / 20                |
| Move a product forward a stage           | 50                     |
| Complete a stage quest                   | 100                    |
| Apply an improvement suggestion          | 25                     |
| Add a supplier / library material        | 10 / 5                 |

Each award has a unique reference (for example, the product plus question key), so editing an answer or toggling a task never pays out twice. Levels need `50 × L × (L − 1)` total XP (L2 = 100, L3 = 300, L4 = 600…). The rules live in [packages/shared/src/gamification.ts](packages/shared/src/gamification.ts).

### Adding or changing questions

Edit [packages/shared/src/questions.ts](packages/shared/src/questions.ts). Keys are stored with answers, so **never rename a key**. Add a new question instead, and mark old ones `retired: true`. Supported types are text, longtext, number, money, date, yes/no, 1–5 scale, single choice and multi choice. `syncsTo` writes an answer into a product field (price, description, category).

---

## Adding AI later

The seam is already in place:

- [apps/server/src/services/insights.ts](apps/server/src/services/insights.ts) defines an `AiProvider` interface with `insights()` (market research, supplier discovery, pricing advice) and an optional `followUpQuestions()`. Implement it, return it from `aiProvider()`, and set `INSIGHTS_PROVIDER=ai` plus `AI_API_KEY`/`AI_MODEL`.
- The provider receives the product, every discovery answer, the bill of materials, supplier quotes and the workspace currency. That context is what the question decks are designed to collect.
- AI suggestions merge after the rule-based ones, are tagged with an **AI** badge in the UI, and time out after 15 s with a fallback to rules. The server only *applies* actions it can re-derive and verify itself, so AI output is advisory unless you add a verified action type.

Good first AI features: researching market prices from the Research answers, suggesting suppliers for the most expensive materials, generating follow-up questions from vague answers, and drafting launch plans.

---

## Roadmap ideas

- Email (SMTP) for invites and self-serve password reset
- SSO (OIDC/SAML) alongside password login
- File uploads for product images (currently image URLs)
- Activity feed and comments per product
- CSV import of materials and suppliers
- Create additional workspaces from the UI (today: invites, or one per sign-up)
