# Deployment and Operations

How to run PDLC Platform in production, on infrastructure you control. If
you are looking for how the system is built, see [ARCHITECTURE.md](./ARCHITECTURE.md);
for local development, see [README.md](./README.md). This document is the
third leg: how it actually gets deployed and kept running.

**Data ownership, stated plainly:** every piece of engineering data this
system holds — requirements, decisions, verification results, evidence
records, certification data, audit history, all of it — lives in the
PostgreSQL database you provision and control. Nothing is replicated to, or
dependent on, any third-party service for the application to function. There
is no managed database, no managed auth provider, and no external API this
system calls to do its job. The operator's PostgreSQL instance is the
complete, authoritative store of record.

## Prerequisites

- A host that can run containers (Docker/Podman) or Node.js 20.9+ directly.
- PostgreSQL 17. The schema and the driver adapter (`@prisma/adapter-pg`) are
  written against PostgreSQL specifically — there is no other supported
  database, in this deployment guide or anywhere in the codebase (see
  README.md's "The database is PostgreSQL"). An older major version may
  happen to work; only 17 is what CI runs against and what is documented
  here.
- A reverse proxy capable of TLS termination (nginx, Caddy, Traefik, a cloud
  load balancer — anything that speaks HTTP/1.1 or HTTP/2 to the app and
  HTTPS to the internet). This application does not terminate TLS itself.
- Ability to set environment variables and store one secret
  (`DATABASE_URL`, or the `POSTGRES_PASSWORD` that composes into it) outside
  version control.

## Environment variables

`.env.example` is the authoritative, current list — copy it and fill in real
values, never commit the copy. Every variable is validated at process
startup by `src/config/env.ts`; a missing or malformed required variable
fails startup immediately with a clear message rather than surfacing as an
obscure runtime error later (see "Environment validation" below).

The variables that matter for a production deployment specifically:

| Variable               | Required        | Production expectation                                                                                                                           |
| ---------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`             | effectively yes | `production`. `next build`/`next start` set this automatically; only override it if you run the compiled server through something that does not. |
| `DATABASE_URL`         | **yes**         | A real PostgreSQL connection string. No default exists — there is nothing for this to silently fall back to.                                     |
| `LOG_LEVEL`            | no              | `info` or `warn` in production; `debug` is development-only noise.                                                                               |
| `SESSION_TTL_DAYS`     | no              | Defaults to 30. Session expiry is enforced server-side regardless of this value's size — it only sets how long that is.                          |
| `NEXT_PUBLIC_APP_NAME` | no              | Cosmetic; inlined into the client bundle, so it is genuinely public — never put anything sensitive behind a `NEXT_PUBLIC_` name.                 |

`SEED_ADMIN_*` / `SEED_ORGANIZATION_NAME` are **not** production variables —
see "Data retention and deletion" below.

## PostgreSQL provisioning

Any PostgreSQL 17 instance you control: a package-managed install, a
container, a managed-VM-with-Postgres-on-it. What "you control" means here
specifically: the operator holds the credentials and the data directory; no
external party can read, export, or hold this database hostage. Using a
third party's managed Postgres offering does not violate anything in this
codebase, but it moves you outside the "infrastructure controlled by us"
model this guide assumes and documents.

`docker-compose.prod.yml` provisions one for you, wired to the `app`
container over an internal network with a persistent named volume — see
"Docker Compose" below if that is the path you want.

## Migration

The production migration procedure is exactly what CI already runs, once:

```bash
npx prisma migrate deploy
```

(`npm run db:migrate:deploy` is the same command.) This applies every
committed migration under `prisma/migrations/` in order and stops at the
first failure — it never guesses, never reorders, and never generates a new
migration on the fly (that is `prisma migrate dev`, development-only, never
run against a production database).

**This is a separate, explicit step — not something the application
container runs automatically on start.** See "Startup order" for why. Run it:

- once, before the very first deploy, against an empty database;
- again, before each subsequent deploy that includes new migrations, before
  traffic is routed to the new application version.

There is no `db push` in this procedure and no automatic reset. `prisma db
push` writes directly against the live schema with no migration record and
is a development convenience only; running it against a production database
would leave that database's schema unrepresented by any migration file,
which is the situation the whole `prisma/migrations/` history exists to
prevent.

**Rollback, stated honestly:** this project has no down-migrations. Every
migration in `prisma/migrations/` is forward-only, which is standard for
Prisma Migrate and is not a gap specific to this project. If a migration
needs to be undone, the real options are: (a) restore from a backup taken
before it was applied (see "Backups" below), or (b) author and commit a new,
forward migration that reverses the specific change. There is no
`prisma migrate rollback` in this project and this guide does not claim one
exists.

## Application startup

Two supported paths:

**Docker (recommended for production):**

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm app npx prisma migrate deploy
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

**Direct Node.js**, if you are not containerizing:

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm run start          # next start — binds :3000 by default
```

### Startup order

1. **Environment validation.** `src/config/env.ts` validates the process
   environment the moment any server module first imports it, which happens
   before the server accepts its first request. An invalid environment
   throws, and the process does not reach "serving traffic." `src/instrumentation.ts`
   (Next.js's own startup hook — not a custom process manager) makes this
   explicit by importing `env` and logging the outcome as the very first
   thing that happens.
2. **Application initialization.** Next.js's own server startup —
   unremarkable, no custom bootstrapping.
3. **Database availability.** Deliberately _not_ a startup gate. A
   temporarily-unreachable database at the exact moment of a rolling
   restart should not prevent the process from starting and later
   recovering once the database returns — it should make `/api/health`
   (readiness) fail until it does, so an orchestrator or load balancer stops
   routing traffic there without killing the process outright. `/api/health/live`
   (liveness) answers unconditionally, with no database dependency, for
   exactly this reason.
4. **Serving.** Only after 1–3.

Migration is not step 3 and is never automatic (see "Migration" above) —
running `migrate deploy` against a database that many replica instances are
about to start reading from is safer as one explicit, observable, "did it
succeed y/n" deployment action than as an implicit side effect racing
however many application instances happen to boot at once.

## Reverse proxy / TLS expectations

This application does not terminate TLS and does not implement HTTP/2 or
HTTP/3 itself — that is the reverse proxy's job. Point it at the app's port
(`3000` by default; `docker-compose.prod.yml` binds it to `127.0.0.1:3000`
specifically so the proxy is the only public entry point) and have it:

- terminate TLS with a real certificate (Let's Encrypt via your proxy of
  choice is the common self-hosted path);
- forward `Host`, and either forward `X-Forwarded-Proto`/`X-Forwarded-For`
  or terminate TLS such that the app sees `https` — the CSRF origin check in
  `src/middleware.ts` compares the request's `Origin` header against `Host`,
  so the proxy must not rewrite `Host` to something the app does not expect;
- **not** silently allow both HTTP and HTTPS to the app without redirecting
  HTTP to HTTPS — `secure` cookies (enforced in production, see
  `src/server/auth/cookies.ts`) are simply dropped by a browser talking
  plain HTTP, which would look like sign-in silently failing rather than a
  clear error.

## Health checks

- `GET /api/health` — **readiness.** Runs a real `SELECT 1` against
  PostgreSQL. Returns `200` with `{ "status": "ok", "checks": { "database": "ok" }, "latencyMs": <number> }`,
  or `503` with `{ "status": "error", "checks": { "database": "unreachable" } }`
  on failure. Never returns a connection string, a driver error message, or
  any other internal detail — a failure is logged server-side (see
  "Logs") and reported to the caller as the bare fact that it failed. Use
  this for load-balancer routing decisions: an instance reporting `503`
  here should stop receiving traffic, but does not need to be restarted.
- `GET /api/health/live` — **liveness.** No database call, no dependency on
  anything outside the process. Use this for "should the orchestrator
  restart this container" — a database blip must not trigger that.

Neither endpoint requires authentication (health checks cannot depend on a
session existing) and neither ever mutates any state.

## Logs

`src/lib/logger.ts` — one JSON object per line in production
(`{"timestamp", "level", "message", ...context}`), a readable colorless line
in development. No transport, no external log shipper is built in: pipe
container stdout/stderr into whatever log aggregation your platform already
provides (`docker logs`, `journald`, your cloud provider's log collector —
all of these already know how to capture a process's stdout).

What is logged: application startup and shutdown (`src/instrumentation.ts`),
every request's method/path/correlation id (`src/middleware.ts`),
authentication and rate-limit events (`src/server/services/auth.service.ts`),
and every unexpected server error, in full, server-side only
(`src/server/api/response.ts`).

What is never logged, by construction rather than by discipline alone:
passwords are hashed in-process and the plaintext never reaches a log call
anywhere in the codebase; session tokens are never persisted or logged in
raw form — only their SHA-256 hash is ever written to the database, and
`src/server/services/auth.service.ts`'s own log calls pass `userId`, never a
token or a password. `DATABASE_URL` is never logged (grep the codebase — it
is read once, into the Prisma adapter, and never passed to a log call).
Evidence content and other engineering document bodies are never logged;
this system stores evidence as metadata/reference records to begin with
(see "Evidence storage limitation" below), so there is no document body in
the process to accidentally log.

**Request correlation.** Every request gets a server-generated id
(`src/middleware.ts` — never one supplied by the client, which would let a
caller inject arbitrary values into server logs), logged once per request
and returned to the caller as the `x-request-id` response header. When a
user reports an error, that header is what support can grep the logs for.

## Upgrade procedure

1. Take a backup (see below) — always, before every upgrade that includes a
   migration.
2. Pull/build the new application version.
3. Run `prisma migrate deploy` against the production database with the new
   version's migration files.
4. Deploy the new application version (new container, or restart the
   process running the new build).
5. Confirm `/api/health` reports `ok` against the new version.

Because migrations are forward-only (see "Migration" above), an upgrade
that includes a schema change is not casually reversible — this is why step
1 is not optional. A deploy with no new migration is simpler: build, deploy,
confirm health, no separate migration step.

## Backups

The application does not implement backups — there is no database backup
code anywhere in this repository, and none is claimed. This section
documents the standard PostgreSQL procedure; automating it (a cron job, a
managed snapshot schedule) is an operator responsibility outside this
codebase.

**Logical backup**, the portable, restorable-anywhere option:

```bash
pg_dump --format=custom --file=pdlc-$(date +%Y%m%d-%H%M%S).dump "$DATABASE_URL"
```

`--format=custom` (not plain SQL) so it restores with `pg_restore` and
supports selective/parallel restore.

**Restore**, into a fresh, empty database — never restore over a live one
without deliberately intending to replace its contents:

```bash
createdb pdlc_restored
pg_restore --dbname=pdlc_restored --no-owner --jobs=4 pdlc-20260101-000000.dump
```

**Retention recommendation:** daily backups retained 14 days, weekly
backups retained 90 days — an ordinary, defensible starting point, not a
regulatory claim specific to any certification regime this system's domain
touches. Adjust to your own operator's actual retention and compliance
obligations.

**Test-restore requirement:** a backup that has never been restored is not
verified to be a backup. Restore each one into a scratch database on a
regular cadence (monthly is reasonable) and confirm the application can
start against the result — the same `prisma migrate deploy` + health-check
sequence this guide already describes for a fresh deployment works
unchanged as a restore-verification drill.

## Data retention / deletion

Production deployment must not run anything that resets or seeds data.
Concretely:

- `npm run db:seed` has **no production use**. It refuses to run without
  `SEED_ADMIN_PASSWORD` set (see `prisma/seed.ts`), so it cannot silently
  invent a well-known account, but it should simply never be invoked
  against a production database — the supported way to create the first
  account in a real deployment is registering through `/sign-up`, which
  creates an organization and its first administrator in one step, the same
  path every subsequent user goes through.
- `npm run db:seed:scenario` (`prisma/seed-scenario.ts`) has **no production
  use either**, and is deliberately more dangerous-looking than `db:seed` to
  make that obvious: it creates a full synthetic engineering project —
  fictional accounts, a fictional requirement/decision/supplier/
  certification programme, all clearly labeled `[DEMO]`/`(fictional)` — and
  prints every account password it creates to the terminal once. It refuses
  outright if `NODE_ENV=production`. Nothing in this deployment path (the
  Dockerfile, `docker-compose.prod.yml`, `instrumentation.ts`'s startup
  hook, or the steps in CI that build and start the production image) ever
  invokes it — the only way it runs is a developer typing the command by
  hand against a database they control. (CI's own database job does run
  plain `npm run db:seed` later, but only to provision a throwaway account
  for the end-to-end suite in CI's own disposable database — never against
  the production image, and never `db:seed:scenario`.)
- `npm run db:reset:local` / `docker compose down -v` are **local-only**
  commands, named and documented as such (see README.md) — they destroy the
  named Docker volume `docker-compose.yml` (development) or
  `docker-compose.prod.yml` (production) creates. Nothing in this codebase
  runs the equivalent of `prisma migrate reset` (which drops and recreates
  the schema) in any deploy path this guide describes.
- Several record types are intentionally immutable/append-only by domain
  design, not merely by convention — deleting or editing them in place
  would falsify the engineering record: `AuditLog` rows, every assessment
  table (`TechnicalReadinessAssessment`, `VerificationReadinessAssessment`,
  `DriftAssessment`, `ImpactAnalysis`/`ImpactFinding`,
  `AssumptionMonitoringRecord`, `CertificationReview`), and `Evidence`
  once `VALIDATED` (superseded, never edited or removed — see
  ARCHITECTURE.md's Evidence section). None of this is enforced by a
  deployment setting; it is enforced by the service layer having no
  update/delete path for these tables at all.

## Evidence storage limitation

Stated here because a deployment guide is exactly where someone would
otherwise assume backups cover it: **this system stores evidence as
metadata/reference records only. It has never stored evidence file
contents, and this prompt did not add that capability.** A `sourceReference`
is a pointer (a document id, a file path, a URL — whatever the recording
engineer typed) to something that lives outside this system. Backing up
this system's PostgreSQL database backs up every evidence _record_ —
title, type, status, links, the reference string itself — but **not** the
file or document that reference points to, because this system never had a
copy of it. See ARCHITECTURE.md's Evidence section ("Binary/file integrity —
not provided, and never claimed") for the full reasoning. If your process
relies on evidence source documents surviving alongside this system's
records, back those up separately, wherever they actually live.

## Known, disclosed deployment limitations

- **Rate limiting is single-instance.** `src/server/auth/rate-limit.ts` is
  an in-process, in-memory counter — real protection against casual
  password guessing on one running instance, and explicitly documented in
  that file as not surviving a restart and not shared across instances. A
  multi-instance deployment needs a real rate-limiting layer in front of
  the sign-in endpoint (a reverse proxy, a WAF, or a shared store) — this
  codebase does not provide one and does not claim to.
- **No down-migrations.** Covered above under "Migration."
- **No file/binary storage.** Covered above under "Evidence storage
  limitation."
- **No built-in backup automation.** Covered above under "Backups" — the
  procedure is documented; running it on a schedule is an operator task.
- **CSP requires `'unsafe-inline'`** for `script-src` and `style-src` (see
  `next.config.ts`'s own comment) — Next.js's inline hydration payload and
  Radix UI's inline positioning styles both need it. Every other directive
  is as strict as the application allows, and `frame-ancestors 'none'` plus
  `X-Frame-Options: DENY` both apply regardless.
