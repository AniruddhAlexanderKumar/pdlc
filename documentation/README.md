# PDLC Platform Documentation

Welcome to the technical and domain documentation for the **Aerospace Product Development Life Cycle (PDLC) Platform**.

> [!IMPORTANT]
> **Directive for All Contributing AI Agents & Engineers:**
> Whenever you modify domain entities, add database tables or migrations, change system layering, alter infrastructure, or introduce new endpoints/features, you **MUST update the relevant documents in this `documentation/` folder**. Keeping documentation synchronized with the codebase is a core operational requirement.

---

## Documentation Index

| Document | Purpose |
| :--- | :--- |
| [`architecture.md`](./architecture.md) | Architectural layering (Clean Architecture), module structure, request lifecycles, and design constraints. |
| [`domain-model.md`](./domain-model.md) | Domain entities (Requirements, Design Items, Decisions, Verification, etc.) and relationship graph strategy. |
| [`infrastructure.md`](./infrastructure.md) | Database (PostgreSQL 17), containerization, CI/CD pipelines, and recommended enterprise additions (MinIO, Redis). |
| [`deployment.md`](./deployment.md) | Local development, container deployment (Docker/Kubernetes), environment configuration, and air-gapped operations. |

---

## Key System Tenets

1. **Modular Monolith:** No microservices or external message queues needed for core domain operations. Everything runs as a coherent Next.js + PostgreSQL system.
2. **Strict Layering:**
   * **UI (`src/app`, `src/components`)** — React Server Components & client components. Never accesses the database or Prisma directly.
   * **Route Handlers (`src/app/api`)** — HTTP translation, parsing input, calling application services.
   * **Application Services (`src/server/services`)** — Business rules, tenancy checks, transactions, and audit logging.
   * **Repositories (`src/server/repositories`)** — Persistence boundary. Maps between database records and domain entities.
   * **Domain Models (`src/domain`)** — Pure TypeScript domain entities, validation schemas, and enums with no Prisma dependencies.
   * **Persistence Layer (`src/lib/db.ts`)** — Prisma 7 connected to PostgreSQL via `@prisma/adapter-pg`.
3. **Database is PostgreSQL:** PostgreSQL 17 is the only supported database. No SQLite, mock, or in-memory DB is used in production or integration tests.
4. **Zero Vendor Lock-In:** Self-hosted authentication, standard Docker containers, and standard relational storage allow the platform to run on-premise, in cloud environments (AWS, GCP, Azure), or in air-gapped defense enclaves (ITAR compliant).
