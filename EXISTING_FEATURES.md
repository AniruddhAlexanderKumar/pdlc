# Existing Feature Inventory

**Audit date:** 2026-10-28
**Source of truth:** tracked React/Vite, Express, shared TypeScript, and PostgreSQL migration code. “Present” means implemented in tracked source; it does not imply live database or end-to-end verification.

## Public, identity, and onboarding

| Feature | Current implementation |
|---|---|
| Marketing landing page | `apps/web/src/pages/Landing.tsx`; blue/white gradient style, supplied logo, “Connect the Tools. Accelerate the Build.” tagline, CTA to request access |
| Public demo | `/demo`, expandable-card demonstration component |
| Request access | `/request-access`; asks contact, company/team, role, industry, team size, product stage, current tools, and goals |
| Request review | Admin dashboard Access Requests tab; statuses pending/reviewing/approved/declined and internal note; approval is not account provisioning |
| Registration/sign-in | `/signup`, `/register`, `/login`; workspace creation or invite-based join; password hashing, rate limits, failed-login lockout |
| Invites | Admin creates expiring one-time invite links; join/register consumes invite and assigns workspace membership |
| Password reset | Token inspection and redemption routes; workspace admins can email member reset links when SMTP is configured |
| Session/profile | Server-side session lifecycle, workspace switching, profile update, password change, sign-out |

## PDLC workspace

| Feature | Current implementation |
|---|---|
| Workspace dashboard | Preset layouts and configurable dashboard setting among supported presets; widgets show product/workspace progress |
| Product portfolio | Create/list/search, update, delete, lifecycle stage selection, product detail routes |
| Lifecycle | Fixed Idea → Research → Planning → Design → Prototype → Testing → Launch → Improvement; Retired is terminal |
| Discovery answers | Shared question bank with typed answers, stage readiness, XP, and selected answer-to-product-field synchronization |
| Product overview | Product description, notes, image, target price, health/grade, stage quest progress |
| Materials | Workspace catalog, create/edit/delete, units, categories, price, source URL, notes |
| Suppliers and quotes | Workspace suppliers, contact details, quote records, minimum order quantities, alternate supplier pricing |
| BOM and cost | Product-material quantities; unit cost, price/margin derived from materials plus labour/packaging/overhead |
| Product tasks | Product-local tasks with title, description, due date, ordering/position, and todo/in-progress/done state |
| Improvement insights | Built-in rules for cost/price opportunities, with apply actions |
| Gamification | XP ledger, levels, achievements, product readiness/health, user statistics and workspace leaderboard |
| Sample data | One-click sample data loader guarded against adding to a non-empty workspace |

## Team and system administration

| Feature | Current implementation |
|---|---|
| Workspace settings | Workspace name and currency |
| Memberships | List members, change roles, remove self/other subject to role checks, owner safeguards |
| Workspace invites | Create/list/revoke active invites; invite roles are admin/member |
| System admin | Overview, global analytics, users, workspaces, products; add/edit/disable/delete users; manage workspaces/members; update/delete products. Global privilege is persisted in `users.is_admin` and bootstrapped by the operator CLI, not inferred from email. |
| Analytics | Page/action/login/logout event capture and admin views for overview, logins, activity, and users |
| Cookie/privacy UX | Cookie consent banner and local preference handling |

## Shared technical capabilities

- Shared PDLC stage/status, currency, role, question, product, dashboard, analytics, access-request, project/issue, and API types.
- Pure functions for answer normalization, costing, insight rules, dashboard layout validation, money formatting, XP/level progression, readiness, and next-stage recommendation.
- Standard API client with `ApiError`, same-origin cookies, and React Query-based app data fetching.
- PostgreSQL migrations `001_init` through `006_projects_issues`, statically bundled and applied by the migration runner/server startup.
- HTTP security headers, request body limits, request rate limiting, CSRF origin check, structured logging, and health check.

## Jira-relevant existing primitives

| Jira capability | Existing adjacent primitive | Important limitation |
|---|---|---|
| Project-like grouping | Workspace-scoped `projects` with unique project key; Projects page | No project settings, archive, project membership, or project-level permission configuration |
| Issue/task | Separate project-scoped `issues` with Task/Bug/Story, stable key, summary/description, reporter/assignee, priority, labels | No Epic/Sub-task hierarchy, custom fields, comments, attachment, or deletion UI |
| Workflow/status | Fixed Open/In Progress/Done status values and issue status updates | No configurable workflow, transition constraints, or board status mapping |
| Backlog/order | Project issue list ordered by descending issue number | No ranking contract, sprint, board, backlog grouping, or drag ordering |
| Users/roles | Workspace memberships and system admin; issue assignment limited to workspace members | No project role/permission scheme or per-project access control |
| History | Product stage history, analytics events | No complete per-issue field diff/activity feed; analytics is not an authoritative issue audit trail |
| Search | Issue summary/description search with bounded server pagination and optional status query | No shared query language, saved filter, or configurable sorting |
| Dashboard | Workspace dashboard presets and admin analytics | Not configurable Jira-style saved-filter gadgets/reports |

## Baseline verification

- Workspace typecheck passed after the project/issue addition: `npm run typecheck`.
- Production web/server build passed: `npm run build` (Vite reports the existing large-chunk and sourcemap warnings).
- Root `npm test` now discovers and passes 22 shared tests, including the project issue-key tests.
- No HTTP/API integration or browser test is configured. Isolated PostgreSQL migration verification status is tracked in `REGRESSION_TEST_PLAN.md`.
- See `REGRESSION_TEST_PLAN.md` for exact baseline and future coverage.
