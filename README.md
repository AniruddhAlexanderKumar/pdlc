# Solution Velocity

**Connect the Tools. Accelerate the Build.**

A workspace for taking a product from a rough idea to a tested release and a next iteration. Start with the product you have today: a physical product, software, a service or an idea you are still exploring. Each short activity adds something you can read, share and revise in the product’s chapter brief.

**Try it:** open the field guide on the landing page, then choose **Explore demo** for a temporary sample workspace or **Start building** to create your own. On a closed-registration server, request access or use an invitation. See the [first-product walkthrough](BEGINNER_GUIDE.md).

| Chapter | What you leave with |
| --- | --- |
| Idea | A concept brief: the problem, customer and proposed product |
| Research | A research notebook: customer profile, comparison, interview plan and evidence gaps |
| Planning | A build roadmap: MVP scope, ranked features, responsibilities, budget and risks |
| Design | A design brief: user journey, behaviour, decisions and constraints |
| Prototype | A prototype log: learning goal, resources, build task and estimated costs |
| Testing | A test report: scenario, criteria, actual results and feedback |
| Launch | A launch plan: audience, channel, release checks, price and success measures |
| Improvement | An iteration brief: feedback, ordered changes and a chapter to revisit |

The building desk is a connected path of **eight worlds and 24 units**. Pick a product to see its current lesson, next checkpoint, real deliverables and personal quests. [Progression rules and migration runbook →](docs/operations/world-progression.md) A founder can keep a draft private, record an answer for the workspace, or ask for guidance without changing either. A chapter milestone counts recorded work, not market validation. The existing project dashboards, tasks, cost sheet, materials, suppliers, Design Studio and workspace settings remain available.

---

## CI scope and release status

GitHub CI runs the root `apps/*` / `packages/*` Solution Velocity workspace: typechecks, unit tests, production build, Kysely migrations against disposable PostgreSQL 17, Docker image health, and the named API/browser regression smokes. There is currently no root `lint` script. The separate Next/Prisma source tree present on `main` is not built or tested by this workflow; its dependencies and npm scripts are not defined by the current root manifest and require an independent ownership/CI decision. CI success is not live CADit, founder-security, backup, or production rollout approval; see the [verification record](RELEASE_READINESS.md#founder-journey--local-verification) and [CADit release gates](docs/cadit-design-studio.md).

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

## Requesting access

The public landing page links to `/request-access`. Prospective teams can share their
contact details, role, industry, team size, product stage, current tools, and goals.
Requests are stored in PostgreSQL and reviewed by an administrator in the **Access
Requests** tab of `/admin`. The tab supports pending, reviewing, approved, and declined
statuses, plus internal review notes. Approval records the review only; an administrator
must still provision an account or workspace invitation and contact the requester.
Public submissions are rate-limited.

---

## Run it locally

Requirements: Node.js 20.19+ (Node 22 in CI). No Docker or system Postgres needed for development.

```bash
npm ci
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

Open http://localhost:5173 and create an account. The first account can always be created, even when sign-up is turned off. During setup, choose a workspace type and either start a product at its current chapter or skip to the dashboard. **Explore sample products** adds sample records to your workspace; **Explore demo** on the public page instead creates an isolated expiring workspace.

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

Create the first owner and system administrator account. The generated password is printed once, so change it after signing in:

```bash
docker compose exec app node dist/scripts/create-admin.js --email you@company.com --name "Your Name" --workspace "Your Company" --system-admin
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
| `INSIGHTS_PROVIDER`   | `rules`                 | `ai` enables configured product insight generation; separate from lesson assistance.                        |

### Operations

- **Health check:** `GET /api/health` returns 200 when the database is reachable. The Docker image uses it.
- **Backups:** `pg_dump` the database on a schedule. Everything (users, products, XP) lives there.
- **Locked-out owner:** run `create-admin` again with the same email. It resets that password and signs them out everywhere. Add `--system-admin` only when intentionally granting system-wide admin access.
- **Forgotten passwords:** an owner or admin opens **Settings → Team → Send reset email**. The server emails a one-time link (valid 24 hours) directly to the member’s registered address. Configure `RESET_SMTP_HOST`, `RESET_SMTP_FROM`, and any needed SMTP credentials; see [SECURITY.md](SECURITY.md).

---

## Security model

- Passwords are hashed with scrypt (N=2¹⁵, per-hash salt; parameters are stored with each hash so they can be raised later). The policy is at least 10 characters, mixing letters with numbers or symbols.
- Sessions use a random 256-bit token in an `httpOnly`, `SameSite=Lax` cookie (`__Host-` prefixed and `Secure` on https). Only the token's SHA-256 is stored, and sessions can be revoked server-side. Changing or resetting a password revokes other sessions.
- Login and sign-up are rate-limited. An account locks for 15 minutes after 8 failed attempts, and unknown emails take the same time as known ones.
- CSRF: every state-changing request must come from `APP_URL`'s origin, bodies must be JSON, and cookies are SameSite.
- Every query is scoped to the caller's workspace, and roles are enforced server-side: **owner** (everything, including ownership), **admin** (settings, invites, members, reset links), **member** (product work).
- Helmet sets security headers: a strict CSP (`script-src 'self'`), `frame-ancestors 'none'`, nosniff, and HSTS on https.
- Invite and reset links are single-use, expire, and are stored hashed.
- System-wide admin access is stored on the user record and can only be granted through the explicit `create-admin --system-admin` operator command. A matching email address alone never grants privileges; system admin accounts cannot be disabled or deleted through the user-management UI.

---

## Gamification rules

| Action                                   | XP                     |
| ---------------------------------------- | ---------------------- |
| Create a product                         | 20                     |
| Answer a discovery question              | 5–30 (per question)    |
| Complete a task                          | 15                     |
| Add a material to a product              | 5                      |
| Set a price / complete a cost estimate          | 10 / 20                |
| Move to the next chapter after completing the current one           | 50                     |
| Complete a unit / pass a checkpoint / finish a world | 50 / 100 / 200 |
| Complete a daily / weekly quest          | 20 / 75                |
| Apply an improvement suggestion          | 25                     |
| Add a supplier / library material        | 10 / 5                 |

New credit is unique across the workspace for the work reference (for example, the product plus question key). Revising, clearing/refilling, changing assignee or repeating a cycle cannot earn that credit again. Drafts earn no credit. Historical credits are retained on upgrade. Levels need `50 × L × (L − 1)` total XP (L2 = 100, L3 = 300, L4 = 600…). The rules live in [packages/shared/src/gamification.ts](packages/shared/src/gamification.ts).

An operator can tune future awards with `BUILDER_XP_RULES`. See the [cutover and reward rules](docs/operations/world-progression.md) for defaults, ledger scope, historical recognition, and pre/post upgrade reports.

### Adding or changing questions

Edit [packages/shared/src/questions.ts](packages/shared/src/questions.ts). Keys are stored with answers, so **never rename a key**. Add a new question instead, and mark old ones `retired: true`. Supported types are text, longtext, number, money, date, yes/no, 1–5 scale, single/multiple choice, ranked lists, an evidence note and a two-alternative comparison. A question also specifies the output heading, plain-language guidance, worked example, advanced prompt, applicability and first-answer XP. `syncsTo` can update a live product field (price, description, category or per-unit overhead) when the answer is recorded.

---

## Lesson copilot and product insights

The lesson copilot works without a model or credits. It can explain a question with an example, reference the product’s recorded cost estimate, and link to the same next step as the building desk. When a user asks, an enabled, funded assistant may send a limited excerpt of the selected product and the submitted draft to the configured provider. A model reply is a suggestion: copying it into a text field does **not** save an answer. See [AI_ASSISTANT.md](AI_ASSISTANT.md) for backend-only provider configuration and token accounting.

The **Improve it** tab is separate. Its deterministic suggestions use recorded costs, quotes, tasks and answers. `INSIGHTS_PROVIDER=ai` can add suggestions, but the server only applies changes that its own rules can re-derive. A pricing estimate is not a quote, sale or promise of profitability.

---

## Roadmap ideas

- Email (SMTP) for invitations and self-serve password reset requests (administrator-initiated reset emails are supported when configured)
- SSO (OIDC/SAML) alongside password login
- File uploads for product images (currently image URLs)
- Activity feed and comments per product
- CSV import of materials and suppliers
- Create additional workspaces from the UI (today: invites, or one per sign-up)

### Personal and team workspaces

At sign-up, choose a **personal** workspace for one member or a **team** workspace for collaboration. Existing workspaces remain team workspaces. Workspace type is fixed: to collaborate from a personal workspace, create a separate team workspace under Settings → Workspace & account. The same screen lets you switch workspaces, including on mobile. Each workspace has its own products and projects; creating one does not copy or move data. Owners and admins can invite members only to team workspaces. Personal workspaces allow only one member, including through admin membership APIs. System administrators retain their existing administrative access.
