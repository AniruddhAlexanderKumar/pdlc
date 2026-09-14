<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# PDLC Platform — Autonomous Agent Guidelines

## 1. System Overview & Domain

The **PDLC Platform** is an Aerospace Product Development Life Cycle platform designed as a modular monolith:

- **Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Tailwind CSS v4, Prisma 7, PostgreSQL 17, and Argon2id self-hosted auth.
- **Domain:** Traceability across aerospace engineering lifecycles (`StakeholderNeed`, `Requirement`, `EngineeringDecision`, `DesignItem`, `InterfaceDefinition`, `VerificationActivity`, `Risk`, `Issue`, `ChangeRequest`, `Approval`, `Evidence`, `AuditLog`).

## 2. Mandatory Documentation Protocol for Agents

> [!IMPORTANT]
> **CRITICAL RULE FOR ALL CONTRIBUTING AGENTS:**
> This repository has exactly one authoritative documentation set, at the
> repository root — no `documentation/` subfolder exists (one was merged in
> from a parallel effort and removed as part of the V1 release-readiness
> pass: it duplicated and in places contradicted the maintained docs below,
> see RELEASE_READINESS.md). Whenever you modify domain entities, add/change
> database models or migrations, alter system layering, modify
> infrastructure, or introduce new features/routes, **you MUST update the
> corresponding root-level document**:
>
> - `ARCHITECTURE.md` (structural/architectural changes, domain entities, module layering)
> - `DEPLOYMENT.md` (environment, container, CI, or migration-procedure changes)
> - `SECURITY.md` (anything touching auth, authorization, or a security property)
> - `README.md` (developer-facing commands or setup steps)
>
> Never leave the codebase and documentation out of sync.

## 3. Layering & Architectural Invariants

- **Strict Separation of Concerns:**
  - **UI (`src/app`, `src/components`):** Client & Server components. Never import Prisma or database clients.
  - **Route Handlers (`src/app/api`):** Parse HTTP requests, validate input, and delegate to application services. No direct database queries.
  - **Application Services (`src/server/services`):** Implement business logic, verify multi-tenant scoping, run transactions, and log audit trails.
  - **Repositories (`src/server/repositories`):** Sole boundary for database queries via Prisma, mapping records to domain models.
  - **Domain (`src/domain`):** Pure TypeScript interfaces, enums, and Zod schemas with zero external framework/DB dependencies.
- **Database Invariant:**
  - **PostgreSQL is the only supported database.** No SQLite, no mock DB, no in-memory substitutes.
- **Scoping Invariant:**
  - All engineering artifacts must belong to an `Organization` and a `Project`. Artifact identity is composite: `(projectId, identifier)`.

## 4. Everyday Development Commands

- `npm run dev` — Start the development web server
- `docker compose up -d` / `npm run db:up` — Start local PostgreSQL 17
- `docker compose down` / `npm run db:down` — Stop local PostgreSQL
- `npm run db:migrate:deploy` — Apply committed database migrations
- `npm run db:seed` — Seed development admin user and sample project
- `npm run typecheck` — TypeScript check (`tsc --noEmit`)
- `npm run lint` — ESLint
- `npm run test` — Unit tests (repositories faked)
- `npm run test:integration` — Integration tests against real PostgreSQL
- `npm run build` — Production build
