# Regression Test Plan

**Audit date:** 2026-10-28
**Purpose:** Record the pre-change baseline, current verification, and required regression coverage for the approved initial workspace-scoped Projects/Issues slice. Do not treat unexecuted items as passing.

## Executed baseline

| Command | Result |
|---|---|
| Baseline `npm run typecheck` | Passed in shared, server, and web workspaces |
| Current `npm run typecheck` | Passed in shared, server, and web workspaces after auth and project/issue changes |
| Baseline/current `npm run build` | Passed for web and server. Vite emits a >500 KB chunk warning and a Tailwind sourcemap warning. |
| Baseline `npm test` | Exit code 0 but discovered **0 tests** |
| Current `npm test` | **22 passed, 0 failed**, including `projects.test.ts` |
| `npm run smoke --workspace @sv/server` | Failed: connection refused on localhost:4000 because the API was not running |
| Lint | Not run: no lint script is declared in the inspected root/workspace manifests |
| Current migrations | All migrations `001_init` through `006_projects_issues` applied successfully to a fresh isolated embedded PostgreSQL 18.4 database on port 55433. No existing or production database was used. |
| Current API smoke | Passed against that isolated database: registration, project creation, issue creation (`BUILD-1`), status update, combined text/status query with pagination, and cross-workspace access returning 404. This was an ad hoc smoke, not a committed automated integration test. |

## Existing behavior that must remain stable

### Identity, sessions, and access

- Registration allowed/denied based on `ALLOW_SIGNUP` and invite state; invite registration adds the intended membership.
- Login, lockout, disabled-user handling, logout, session expiry/refresh, and workspace switch.
- Password reset token expiry and one-time use.
- Workspace owner/admin/member authorization; last-owner protection; workspace scoping and cross-workspace 404 behavior.
- System admin route authorization distinct from workspace roles; persisted `is_admin`, explicit CLI bootstrap, and no email-based privilege grants.
- Origin checks, HTTP-only cookie properties, rate limits, JSON size cap, and error response semantics.

### PDLC workflows

- Product create/list/search/update/delete and stage transitions/history.
- Discovery answer validation, persistence, synchronization to selected product fields, readiness, and XP idempotency.
- Materials, supplier quotes, BOM quantities, costs/margins, and deletion rules.
- Product task create/update/delete/status/due-date/order behavior.
- Product insights generation/application and analytics/XP recording.
- Dashboard preset resolution/customized-item sanitation.
- Sample data only into empty workspace, without partial writes.

### Public and admin screens

- Landing CTA and logo/tagline unchanged.
- Public request form validates and can submit; database persistence still requires API/PostgreSQL integration coverage.
- Admin Access Requests list, filters, pending count, status/note updates, admin protection, and truthful provisioning disclaimer.
- Existing user/workspace/product admin tools, analytics, theme, cookie consent, responsive navigation and layout.
- Projects list/create and project-scoped issue create, summary/description search, bounded API pagination, workspace-member assignment, and status updates. API smoke and cross-workspace isolation passed; automated API coverage remains absent.

## Required automated test layers

1. **Shared domain unit tests:** retain existing 20 plus issue-key tests; add issue field/status validation, workflow graph validity, permission evaluator, ranking tie-breaking, filter parser, and cycle-safe hierarchy/dependency rules as those features are introduced.
2. **API integration tests against isolated PostgreSQL:** run migrations from empty DB; create tenant fixtures; exercise route schemas, transactions, authorization, constraints, pagination, sorting, and data retention.
3. **Web component/route tests:** signed-out/public routes and authenticated/role-specific pages; loading/error/empty states; keyboard accessible forms and interaction.
4. **End-to-end acceptance:** representative owner/admin/member flows across projects, issues, board/backlog, filtering, workflow transitions, comments, and history, plus existing PDLC workflow.
5. **Security tests:** cross-tenant IDOR, role bypass, invalid/missing session, CSRF origin rejection, rate limiting, XSS-safe text/attachment metadata, attachment size/type boundaries, and permission changes taking effect.
6. **Migration/data compatibility:** upgrade a copy of existing schema/data; assert original users, workspaces, products, answers, tasks, costs, stage history, and access requests are preserved; rollback only in a disposable DB.

## Acceptance smoke matrix

| Persona | Existing baseline | Jira-style future checks |
|---|---|---|
| Signed-out visitor | Landing/request access usable without API session; protected routes redirect | Cannot read private projects/issues; public request endpoint remains available |
| Workspace member | Manage own workspace PDLC data within current rules | Only view/create/update issues when project permissions allow; cannot configure project/workflow |
| Workspace admin/owner | Manage team/workspace as currently authorized | Assign project roles and configure projects/boards/workflows only within granted scope |
| System admin | Existing global admin functionality remains available | Global management does not bypass tenant/project constraints accidentally |

## Baseline caveats

- Root test discovery is fixed to include shared package tests; they currently exercise pure functions, not API/database behavior.
- There are no API or browser test scripts configured. The ad hoc API smoke used embedded PostgreSQL 18.4; the documented production baseline is PostgreSQL 17, so validate migrations against PostgreSQL 17 in CI before release.
- The original server smoke check failed because the API was not running at port 4000; the new routes were separately exercised on port 4400 against an isolated database.
- System-admin backdoor remediation has been implemented, but auth bootstrap/authorization still needs dedicated integration coverage.
