# PDLC Platform

Aerospace Product Development Life Cycle platform. Modular monolith:
Next.js (App Router) · TypeScript · Tailwind · Prisma · **PostgreSQL** ·
self-hosted authentication.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how the system is put together,
and [DEPLOYMENT.md](./DEPLOYMENT.md) for running it in production —
provisioning PostgreSQL, migrations, the production container, backups, and
what is and is not covered by this repository's own tooling.

## The database is PostgreSQL

PostgreSQL is the only supported database, in development and in tests.
The schema uses PostgreSQL-native enums and the client connects through the
`@prisma/adapter-pg` driver adapter. There is no SQLite fallback, no in-memory
substitute, and no emulation layer anywhere in this repository — tests that
need a database either talk to a real PostgreSQL server or skip and say so.

## What runs without a database

Most day-to-day work needs no database at all:

```bash
npm ci
npx prisma generate     # generates the typed client from prisma/schema.prisma
npm run typecheck
npm run lint
npm run test            # unit suite: repositories are faked
npm run build
```

`prisma generate` is required before the first typecheck or build because the
generated client is not committed.

## Running PostgreSQL locally (Docker — the supported path)

Docker is not required to edit the code, but it is the supported way to
reproduce the real database environment.

```bash
docker compose up -d --wait      # or: npm run db:up
```

That starts PostgreSQL 17 on `localhost:5432` with database `pdlc_dev`, using
the local-only credentials in `docker-compose.yml`. If port 5432 is already
taken:

```bash
PDLC_DB_PORT=5433 docker compose up -d --wait
# then set the port in your .env DATABASE_URL to match
```

Then configure the environment and apply the schema:

```bash
cp .env.example .env             # then edit it (see below)
npm run db:migrate:deploy        # applies the committed migrations
```

`.env` is gitignored. `.env.example` is the documented template and contains
no real credentials.

### Seeding a local account

The seed refuses to run without credentials supplied by you — it will not
invent a password, so no well-known account can ever reach a deployed
database. Set these in `.env` first:

```dotenv
SEED_ORGANIZATION_NAME="Example Aerospace"
SEED_ADMIN_NAME="Your Name"
SEED_ADMIN_EMAIL="you@example.test"
SEED_ADMIN_PASSWORD="choose at least 12 characters"
```

```bash
npm run db:seed
npm run dev            # then sign in at http://localhost:3000/sign-in
```

You can skip the seed entirely and register through `/sign-up`, which creates
an organization and its first administrator in one step. That is the preferred
path for anything other than local development.

### Everyday database commands

| Command | What it does |
| --- | --- |
| `npm run db:up` / `npm run db:down` | Start / stop the PostgreSQL container |
| `npm run db:migrate` | Create and apply a migration during development |
| `npm run db:migrate:deploy` | Apply committed migrations (what CI and deploys run) |
| `npm run db:seed` | Create the local bootstrap account |
| `npm run db:studio` | Browse the data |
| `npm run db:reset:local` | **Destroys the local volume**, restarts, re-migrates |

`db:reset:local` is deliberately named: it only ever affects the local Docker
volume. Nothing in this repository resets a database it did not create.

## Tests that need PostgreSQL

```bash
npm run test:integration   # repository layer against real PostgreSQL
npm run test:e2e           # full browser flows against real PostgreSQL
```

Both **skip rather than fail** when no database is reachable, and say why. A
skipped suite is never reported as a passing one. With `docker compose up -d`
and migrations applied, they execute for real.

The split is deliberate:

| Suite | Needs a database | What it proves |
| --- | --- | --- |
| `npm run test` | no | Domain rules, service logic, API contracts, UI behavior (repositories faked) |
| `npm run test:integration` | **yes** | The Prisma queries themselves: composite keys, `include`/`select` shapes, unique constraints, cascades, project scoping |
| `npm run test:e2e` | **yes** | Real browser against the running app and a real database |

## Continuous integration

`.github/workflows/ci.yml` runs two jobs:

- **static** — typecheck, lint and the unit suite. No database.
- **database** — boots a **PostgreSQL 17 service container**, applies the
  committed migrations with `migrate deploy`, verifies the migrations still
  match `schema.prisma`, builds the actual production Docker image and
  starts it against that migrated database to confirm both health endpoints
  respond, then runs the integration suite, the build and the end-to-end
  suite against it.

CI uses real PostgreSQL, not SQLite and not a mock. The credentials in the
workflow belong to an ephemeral container on an isolated runner and are
destroyed with the job; deployments read `DATABASE_URL` from their own secret
store.

## Secrets

- `.env` is gitignored; `.env.example` is a template with no real values.
- The seed has no default password and refuses to run without one.
- Sessions are opaque random tokens stored hashed in PostgreSQL, so there is
  no signing secret to configure, leak or rotate.
- Passwords are hashed with Argon2id in-process; no credential leaves the
  application.
