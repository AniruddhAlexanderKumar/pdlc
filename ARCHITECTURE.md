# Solution Velocity Architecture

## Scope and baseline

This document describes the tracked application after the approved first projects/issues slice (2026-10-28). The product remains a product-development-lifecycle workspace, with an additive Jira-inspired project/issue capability. This is a description of the current code, not a claim that every route has been end-to-end tested.

## Technology and workspaces

- **Web:** React 19, TypeScript, Vite, React Router, React Query, and Tailwind CSS. Entry point and route tree: `apps/web/src/main.tsx`.
- **API:** Express 5, TypeScript, Zod request validation, Pino HTTP logging, and `express-rate-limit`. Entry point: `apps/server/src/index.ts`; app/middleware composition: `apps/server/src/app.ts`.
- **Persistence:** PostgreSQL via `pg` and Kysely. Database table types are in `apps/server/src/db/schema.ts`; migrations are statically registered in `apps/server/src/db/migrate.ts`.
- **Shared domain:** `packages/shared/src` exports TypeScript types, lifecycle stages, discovery questions, dashboard layouts, costing, insights, formatting, and gamification logic for the web and API.
- **Deployment/support:** Docker Compose and Dockerfile at the root; Caddy, nginx, and systemd examples under `deploy/`.

The root `package.json` defines the `apps/*` and `packages/*` npm workspaces. The tracked application uses Vite; untracked root Next.js-era files and build artifacts are not part of this architecture and were not inspected as application source.

## Runtime and dependency flow

```text
Browser
  └─ React Router pages/components
       ├─ React Query hooks and API client (same-origin /api)
       └─ shared domain types and pure functions
            ↓
Express middleware: Helmet → JSON/cookies → origin check → rate limit → session load
  └─ route handlers: validation, authorization, orchestration, HTTP mapping
       ├─ services: workspace/product read models, insights, analytics, XP
       └─ Kysely queries/transactions
            ↓
PostgreSQL
```

In development, Vite proxies `/api` to `http://localhost:4000`. In production, the server can serve the built Vite application from `apps/web/dist`. The API's `/api/health` route checks database connectivity.

## Layers and responsibilities

- **Pages and components (`apps/web/src`):** Route-level screens, reusable UI, local state, and React Query data presentation. The web client sends JSON requests and includes same-origin credentials.
- **API client/hooks (`apps/web/src/api`):** `client.ts` maps network and HTTP errors to `ApiError`; `hooks.ts` contains query/mutation integration for application data.
- **Routes (`apps/server/src/routes`):** Validate request bodies and parameters, check access, invoke database/service operations, and map results to API types. A repository/service boundary is used for common product/material read models, but some route modules (notably admin/auth) issue Kysely queries directly.
- **Services (`apps/server/src/services`):** Shared read-model loading, sample data, analytics, insight rules, and XP/health calculations. `routes/util.ts` provides mutation orchestration and XP ledger support.
- **Shared domain (`packages/shared/src`):** Framework-independent lifecycle model, answer validation, derived costs/insights/dashboard settings, and API-facing types.
- **Database (`apps/server/src/db`):** Kysely table types and append-only migration files. PostgreSQL is the supported database.

The current architecture has useful shared services but does not uniformly enforce a dedicated repository layer for every query. Jira-inspired entities should be introduced through additive migrations and explicit tenant-scoped service boundaries rather than extending unrelated route queries ad hoc.

## Current domain model

| Entity/table | Role and notable relationships |
|---|---|
| `users` | Account identity, password hash, disabled/lock state, profile, dashboard layout, explicit `is_admin` system privilege |
| `workspaces` | Tenant/team boundary and currency |
| `memberships` | User-to-workspace relationship and `owner`/`admin`/`member` role |
| `sessions` | Hashed session token, user/workspace, expiry, user-agent and IP |
| `invites`, `password_resets` | Hashed one-time tokens, expiry and redemption state |
| `email_verifications` | Hashed single-use email-confirmation tokens for new accounts |
| `workspaces.onboarding` | The two onboarding answers (what is being built, starting point) shared by the workspace |
| `products` | Workspace-scoped PDLC artifact with lifecycle stage, costs, price and description. The first product may be created during registration onboarding. |
| `answers` | Product discovery answers keyed by stable question identifier |
| `tasks` | Product-linked execution checklist; status is `todo`, `in_progress`, or `done` |
| `projects` | Workspace-scoped work project with a unique key within its workspace and transactional next-issue counter |
| `issues` | Project-scoped Task/Bug/Story with stable project-number key, status, priority, labels, reporter and workspace-member assignee |
| `stage_history` | Product lifecycle stage changes |
| `product_cad_models`, `product_cad_revisions` | Product-linked 3D CAD models and versioned STL binary artifacts with CADit embed integration |
| `materials`, `suppliers`, `material_quotes`, `product_materials` | Workspace-scoped catalog, quotes, and product BOM |
| `xp_events` | Workspace/user/product progress events |
| `analytics_events` | Product telemetry and admin audit-style activity |
| `access_requests` | Public access intake and admin review state |

Artifacts are generally workspace-scoped. Project keys are unique per workspace; issue numbers are unique and allocated per project. The initial project/issue API checks the active workspace on project and issue reads/writes, and only permits assigning a workspace member. It does not yet have project-specific roles, configurable issue types/workflows, custom fields, issue relationships, comments, attachments, or issue-level change history.

## Access policy, onboarding, and registration

- **Access policy.** `packages/shared/src/access-policy.ts` is the single description of who may register and what an unpaid account receives. `ACCESS_POLICY` (`beta-open` default, `registered`, `invite-only`) selects it at boot; the legacy `ALLOW_SIGNUP=false` still means `invite-only`. `GET /api/auth/config` reports the policy, whether a payment step is required (never, in the shipping policies), whether email verification is enforced, and whether password recovery is available — the UI never promises a capability the deployment lacks.
- **Entitlements vs. policy.** No code path requires a paid subscription to use the standard workspace, and no pricing, subscription, billing-history or entitlement table was removed. The pricing engine (`packages/shared/src/pricing.ts`, `apps/server/src/lib/pricing.ts`), education pricing, `access_requests` intake and admin proposals remain intact; only the public pricing surface was withdrawn. When paid plans are reintroduced they can read the same records.
- **Registration transaction.** Account → workspace → membership (`owner`) → optional invite consumption → workspace profile derived from the onboarding answer → first product at the onboarding starting stage with its `stage_history` row and the ordinary 20 XP `product_created` award. Everything commits together or not at all; the unique email index is the final duplicate guard.
- **Email verification.** Tokens are random, stored only as SHA-256 hashes in `email_verifications`, expire in 24 hours and are single use. A token is issued whenever `RESET_SMTP_*` is configured; verification is *enforced* only when `REQUIRE_EMAIL_VERIFICATION=true`. Sending happens after the registration transaction commits, and a failed delivery downgrades to a session so an account is never stranded unverifiable.
- **Password recovery.** `POST /api/auth/forgot-password` reuses the existing `password_resets` table and `/reset` flow. It answers `202` with the same body for known and unknown addresses (no enumeration) and never reveals whether SMTP is configured.

## Authentication, authorization, and validation

- Session tokens are generated as random tokens; only hashes are stored. Cookies are HTTP-only, `SameSite=Lax`, path `/`, and secure when `APP_URL` is HTTPS. Sessions expire and slide forward at most hourly.
- API middleware loads sessions and checks request origin for state-changing requests. API routes use `requireAuth`, workspace roles, or `requireAdmin` as appropriate. System administrator status comes from persisted `users.is_admin`; public registration and email identity do not grant it.
- Workspace route queries generally scope by `workspaceId`; admin routes intentionally operate globally and are mounted behind admin authorization.
- Public registration/login are rate-limited. Passwords are hashed with Argon2id (see `apps/server/src/auth/crypto.ts`); routes validate inputs using Zod.
- Error responses distinguish known HTTP/input errors and malformed/oversized bodies, map unique constraints to conflict, and log unexpected failures.
- **Remediated:** the former fixed `admin@gmail.com` / `admin` login path was removed. System-admin bootstrap now requires the operator-controlled `create-admin --system-admin` CLI option. Migration `005_system_admins` defaults existing accounts to non-admin; operators must explicitly provision/promote the intended system administrator after upgrading. See `SECURITY.md`.

## Critical user flows

1. **Register/sign in:** Public landing → **Get Started** → `/signup` (name, email, password + confirmation, Terms/Privacy acceptance, two onboarding questions) → `/api/auth/register` creates the account, workspace, membership, workspace-setup profile and first product in one transaction → optional verification email → session cookie → `/api/auth/me` → the gamified PDLC journey. Authentication policy (open registration vs. invite-only) is described by `ACCESS_POLICY`; see "Access policy and entitlements" below.
2. **Invite a teammate:** Workspace owner/admin creates a one-time invite → recipient registers/accepts → invite consumed transactionally → membership and session created.
3. **Develop a product:** Create product → answer stage questions → capture BOM/materials and costs → manage tasks and stage → calculate health/insights and XP.
4. **Manage team/catalog:** Settings or catalog pages → workspace-scoped API routes → Kysely transactions where linked data must remain consistent.
5. **Request access:** Public page → rate-limited validated POST → PostgreSQL → admin-only list/status/note endpoints → manual provisioning/contact (approval does not create an account).
6. **Create project issues:** Authenticated workspace member opens Projects → workspace owner/admin creates a project → workspace member creates, searches, paginates, assigns, and updates issue fields/status. This is separate from PDLC products and their checklist tasks.
7. **Design 3D CAD models:** Authenticated workspace member opens Product → 3D CAD tab → launches full-viewport CADit 3D Studio or uploads an existing STL artifact → inspects 3D mesh in interactive WebGL viewer → estimates prototyping costs and adds filament to Bill of Materials → downloads versioned STL snapshots.

## Jira expansion constraint

Preserve the current PDLC product lifecycle, product tasks, signup/session behavior, and workspace authorization. The Jira concepts do not map one-to-one: current workspaces are tenant boundaries, products are PDLC artifacts, and tasks are product checklists. The approved additive domain is workspace → project → issue; it coexists with current PDLC products and product tasks. The first slice is implemented via migration `006_projects_issues`, `/api/projects`, and the Projects/Issues pages. It is an initial capability, not Jira parity: workflow transitions are fixed statuses, and project configuration, hierarchy, boards, comments, history, and project-level permissions remain roadmap items.

## Project Journey work and releases

The Express Journey records service extends the project path with project-owned step records and versioned file content (migration `038_journey_records`). Existing names, progress, review state and diagram/sketch history retain their original rows. Designs can be referenced by several steps while each design keeps one revision history. A release stores a read-consistent snapshot of design revision contents, immutable file version IDs, parts and test results. The API compares a hash of the reviewed snapshot before inserting the release.

Design Studio also stores built-in 3D models in the existing design documents and revisions. Migration `039_native_designs` extends the allowed record types while retaining the previous data. A model revision stores a shape and dimensions in millimetres. The browser and release download use the same STL generator. Models share the existing workspace permissions, version history, Journey links and release snapshots with diagrams.
