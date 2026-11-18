# Solution Velocity Architecture

## Scope and baseline

The deployed root application is Solution Velocity: a guided product lifecycle with a separate project/issue workspace. The founder journey uses the existing product, task, collaboration, costing and XP records. It is not a second project model, course enrollment system or privileged founder console.

## Technology and workspaces

- **Web:** React 19, TypeScript, Vite, React Router, React Query, and Tailwind CSS. Entry point and route tree: `apps/web/src/main.tsx`.
- **API:** Express 5, TypeScript, Zod request validation, Pino HTTP logging, and `express-rate-limit`. Entry point: `apps/server/src/index.ts`; app/middleware composition: `apps/server/src/app.ts`.
- **Persistence:** PostgreSQL via `pg` and Kysely. Database table types are in `apps/server/src/db/schema.ts`; migrations are statically registered in `apps/server/src/db/migrate.ts`.
- **Shared domain:** `packages/shared/src` exports TypeScript types, lifecycle stages, discovery questions, dashboard layouts, costing, insights, formatting, and gamification logic for the web and API.
- **Deployment/support:** Docker Compose and Dockerfile at the root; Caddy, nginx, and systemd examples under `deploy/`.

The root `package.json` defines the `apps/*` and `packages/*` npm workspaces. The tracked application uses Vite; the separate Next/Prisma source tree is not built by the root manifests, Dockerfile or CI.

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

## How a lesson becomes product work

- `questions.ts` is the stable curriculum, keyed by chapter and activity. Depth affects guidance, kind affects applicable questions; neither changes authorization. `stageQuest` checks core answers, sign-offs and record-backed actions. `buildJourney` expands that into an eight-chapter read model. `recommendNextActions` resolves blockers and overdue work; `nextWork` selects one destination for the building desk, product page and “what next?” response. None of these functions writes progress.
- The `/products/:id/discover?stage=…&q=…` web route edits one answer. `view=brief` reads the same stored answers, including historical sections no longer applicable to the current kind. Merely inspecting another chapter never changes the product stage. Project-focused and personally configured dashboards remain accessible independently of the building desk.
- Draft reads join the active workspace’s products and filter by the session user. The draft stores an incomplete value and its base answer. Completing an activity validates the final value, locks the product, checks assignment and the supplied prior value, then writes the answer, field sync, collaboration state, applicable XP and draft cleanup in one transaction. Manual and reviewed voice answers share `services/save-answer.ts`. A recorded answer is a snapshot: changing a live cost field later does not rewrite a brief.
- Selected decisions require explicit submission and approval. Editing one invalidates its review. Prerequisites explain blockers and can notify assignees; a dependency is not evidence of completion. Gate enforcement stays in the API, not in button state. Returning to an earlier position preserves the reach of prior chapters without treating them as finished. Retired is outside the eight milestones.
- `routes/lessons.ts` serves private drafts and lesson assistance. Its bounded product context is assembled server-side. Model generation uses the existing assistant allowance and usage transactions with a nullable conversation ID; it has no mutation tool. The guide fallback and “what next?” path need no inference.

## Current domain model

| Entity/table | Role and notable relationships |
|---|---|
| `users` | Account identity, password hash, disabled/lock state, profile, dashboard layout, explicit `is_admin` system privilege |
| `workspaces` | Tenant/team boundary and currency |
| `memberships` | User-to-workspace relationship and `owner`/`admin`/`member` role |
| `sessions` | Hashed session token, user/workspace, expiry, user-agent and IP |
| `invites`, `password_resets` | Hashed one-time tokens, expiry and redemption state |
| `products` | Workspace-scoped PDLC artifact with lifecycle stage, costs, price and description |
| `answers` | Shared chapter sections keyed by product/question, with recording user and timestamp |
| `activity_drafts` | Private partial response and base value, unique per product/user/question |
| `activity_records`, `activity_comments`, `activity_dependencies` | Ownership, status, review, discussions and explicit prerequisite relationships |
| `tasks` | Product-linked execution checklist with optional chapter; status is `todo`, `in_progress`, or `done` |
| `projects` | Workspace-scoped work project with a unique key within its workspace and transactional next-issue counter |
| `issues` | Project-scoped Task/Bug/Story with stable project-number key, status, priority, labels, reporter and workspace-member assignee |
| `stage_history` | Product lifecycle stage changes |
| `product_cad_models`, `product_cad_revisions` | Product-linked 3D CAD models and versioned STL binary artifacts with CADit embed integration |
| `materials`, `suppliers`, `material_quotes`, `product_materials` | Workspace-scoped catalog, quotes, and product BOM |
| `xp_events` | Attributed credit ledger; partial unique index fences future repeats across teammates while preserving older points |
| `analytics_events` | Product telemetry and admin audit-style activity |
| `access_requests` | Public access intake and admin review state |

Artifacts are generally workspace-scoped. Project keys are unique per workspace; issue numbers are unique and allocated per project. The initial project/issue API checks the active workspace on project and issue reads/writes, and only permits assigning a workspace member. It does not yet have project-specific roles, configurable issue types/workflows, custom fields, issue relationships, comments, attachments, or issue-level change history.

## Authentication, authorization, and validation

- Session tokens are generated as random tokens; only hashes are stored. Cookies are HTTP-only, `SameSite=Lax`, path `/`, and secure when `APP_URL` is HTTPS. Sessions expire and slide forward at most hourly.
- API middleware loads sessions and checks request origin for state-changing requests. API routes use `requireAuth`, workspace roles, or `requireAdmin` as appropriate. System administrator status comes from persisted `users.is_admin`; public registration and email identity do not grant it.
- Workspace route queries generally scope by `workspaceId`; admin routes intentionally operate globally and are mounted behind admin authorization.
- Public registration/login are rate-limited. Passwords are hashed with scrypt (see `apps/server/src/auth/crypto.ts`); routes validate inputs using Zod.
- Error responses distinguish known HTTP/input errors and malformed/oversized bodies, map unique constraints to conflict, and log unexpected failures.
- **Remediated:** the former fixed `admin@gmail.com` / `admin` login path was removed. System-admin bootstrap now requires the operator-controlled `create-admin --system-admin` CLI option. Migration `005_system_admins` defaults existing accounts to non-admin; operators must explicitly provision/promote the intended system administrator after upgrading. See `SECURITY.md`.

## Critical user flows

1. **Register/sign in:** Auth page → `/api/auth/config` and register/login → account/workspace membership → session cookie → `/api/auth/me` → protected routes.
2. **Invite a teammate:** Workspace owner/admin creates a one-time invite → recipient registers/accepts → invite consumed transactionally → membership and session created.
3. **Develop a product:** Choose kind/chapter → edit or resume a lesson → record in a brief → resolve tasks and sign-offs → advance or revisit; read health and progress from those records.
4. **Manage team/catalog:** Settings or catalog pages → workspace-scoped API routes → Kysely transactions where linked data must remain consistent.
5. **Request access:** Public page → rate-limited validated POST → PostgreSQL → admin-only list/status/note endpoints → manual provisioning/contact (approval does not create an account).
6. **Create project issues:** Authenticated workspace member opens Projects → workspace owner/admin creates a project → workspace member creates, searches, paginates, assigns, and updates issue fields/status. This is separate from PDLC products and their checklist tasks.
7. **Design 3D CAD models:** Authenticated workspace member opens Product → 3D CAD tab → launches full-viewport CADit 3D Studio or uploads an existing STL artifact → inspects 3D mesh in interactive WebGL viewer → estimates prototyping costs and adds filament to Bill of Materials → downloads versioned STL snapshots.

## Jira expansion constraint

Preserve the current PDLC product lifecycle, product tasks, signup/session behavior, and workspace authorization. The Jira concepts do not map one-to-one: current workspaces are tenant boundaries, products are PDLC artifacts, and tasks are product checklists. The approved additive domain is workspace → project → issue; it coexists with current PDLC products and product tasks. The first slice is implemented via migration `006_projects_issues`, `/api/projects`, and the Projects/Issues pages. It is an initial capability, not Jira parity: workflow transitions are fixed statuses, and project configuration, hierarchy, boards, comments, history, and project-level permissions remain roadmap items.
