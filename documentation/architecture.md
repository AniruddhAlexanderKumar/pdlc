# System Architecture

## Overview

The PDLC platform is architected as a **modular monolith** optimized for aerospace systems engineering. The design prioritizes referential integrity, strong typing, strict multi-tenancy, and compliance-ready audit trails over distributed complexity.

---

## Architectural Layers

```
┌────────────────────────────────────────────────────────┐
│                   Presentation Layer                   │
│   Next.js 16 App Router (RSC, Client Components)       │
└──────────────────────────┬─────────────────────────────┘
                           │ Calls
┌──────────────────────────▼─────────────────────────────┐
│                 Route Handler Layer                    │
│   src/app/api — HTTP parsing, auth session context     │
└──────────────────────────┬─────────────────────────────┘
                           │ Delegates
┌──────────────────────────▼─────────────────────────────┐
│                 Application Services                   │
│   src/server/services — Business logic, authorization, │
│   transactions, audit logging orchestration            │
└─────────────┬───────────────────────────┬──────────────┘
              │ Uses                      │ Validates
┌─────────────▼─────────────┐ ┌───────────▼──────────────┐
│       Repositories        │ │       Domain Layer       │
│  src/server/repositories  │ │  src/domain — Pure types,│
│  Prisma persistence mapping│ │  Zod schemas, invariants │
└─────────────┬─────────────┘ └──────────────────────────┘
              │ Queries
┌─────────────▼──────────────────────────────────────────┐
│                   Database Layer                       │
│  PostgreSQL 17 via Prisma 7 & @prisma/adapter-pg       │
└────────────────────────────────────────────────────────┘
```

### Layer Boundaries & Constraints

1. **Presentation Layer (`src/app`, `src/components`)**:
   * Uses React Server Components (RSC) where possible for performance and security.
   * Client components (`"use client"`) are reserved for interactive forms, modals, and dynamic graphs.
   * UI components **must never import Prisma or database drivers**.
2. **Route Handlers (`src/app/api`)**:
   * Handle HTTP request/response semantics, query string / body parsing, and status code translation.
   * Do not execute database queries or domain logic directly; always delegate to application services.
3. **Application Services (`src/server/services`)**:
   * Responsible for enforcing cross-cutting business rules, tenancy checks (e.g. ensuring an artifact belongs to the user's active organization/project), and managing atomic transactions across multiple repositories.
   * Emits structured audit log entries upon state mutations.
4. **Repositories (`src/server/repositories`)**:
   * Encapsulate Prisma queries.
   * Convert between generated Prisma database rows and pure Domain entities.
   * Allows unit testing of application services with mock repositories without a database container.
5. **Domain Layer (`src/domain`)**:
   * Contains pure TypeScript interfaces, domain models, and Zod validation schemas.
   * Zero external dependencies on web frameworks or databases.

---

## Data Scoping & Multi-Tenancy

Every engineering artifact within the platform is strictly scoped in a multi-tenant hierarchy:

$$\text{Organization} \longrightarrow \text{Project} \longrightarrow \text{Artifact (Requirement, DesignItem, etc.)}$$

* Artifacts carry a human-readable `identifier` (e.g., `REQ-001`, `DEC-014`, `VER-003`).
* Artifact uniqueness is always composite: `(projectId, identifier)`.

---

## Security & Session Management

* **Passwords:** Salted and hashed using Argon2id (`@node-rs/argon2`).
* **Sessions:** Opaque, cryptographically secure random tokens stored hashed in PostgreSQL with server-side TTL expiration. No JWT signing secrets that can leak or require rotation.
* **Access Control:** Role-based access control (RBAC) scoped per project and organization.
