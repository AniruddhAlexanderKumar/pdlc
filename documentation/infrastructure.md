# Infrastructure & Production Readiness

## Current Infrastructure

### 1. PostgreSQL 17
* **Role:** Single source of truth for all domain entities, relationships, sessions, and audit events.
* **Driver Adapter:** Connects via `@prisma/adapter-pg` using a connection pool.
* **Local Container:** Defined in `docker-compose.yml` (`postgres:17-alpine`) on host port `5432`.
* **Healthcheck:** Checked via `pg_isready -U postgres -d pdlc_dev` before executing migrations.

### 2. Prisma 7 Engine
* **Configuration:** Loaded via `prisma7.config.ts` and `prisma/schema.prisma`.
* **Migrations:** Applied via `npm run db:migrate:deploy` in production and CI.

### 3. Continuous Integration
* **Workflow:** `.github/workflows/ci.yml` running on Node 22 with separate static analysis (typecheck, lint, unit tests) and database verification (integration tests on PostgreSQL 17 service container, Playwright E2E tests).

---

## Production Containerization

The platform includes a multi-stage Docker build in `Dockerfile`:
* **Stage 1 (deps):** Installs production and build dependencies cleanly via `npm ci`.
* **Stage 2 (builder):** Compiles Next.js with `output: 'standalone'` and generates Prisma client.
* **Stage 3 (runner):** Minimalist Alpine runtime running as a non-root `nextjs` user, serving via `node server.js` on port `3000`.

---

## Recommended Infrastructure Extensions

| Component | Technology | Rationale |
| :--- | :--- | :--- |
| **Object Storage** | MinIO (local) / S3 (cloud) | Uploading binary test evidence, telemetry logs, and CAD diagrams. |
| **Async Task Queue** | Redis + BullMQ | Offloading computation of heavy traceability matrices and compliance PDF exports. |
| **Vector Search** | `pgvector` | Semantic search over requirements, decisions, and system specifications. |
| **Enterprise SSO** | WorkOS / SAML 2.0 | Connecting to Okta, Azure Active Directory, and corporate IAM. |
| **Observability** | OpenTelemetry + Prometheus | Request latency metrics, DB query profiling, and audit trail aggregation. |
