# Jira Capability Gap Analysis and Roadmap

**Audit/research date:** 2026-10-28
**Scope:** Compare tracked Solution Velocity capabilities against documented Jira Cloud concepts in `JIRA_FEATURE_SPEC.md`. No Jira tenant or live application was available for hands-on observation. The approved initial workspace-scoped project/issue slice is now implemented and smoke-tested; exact results and limits are in `REGRESSION_TEST_PLAN.md`.

## Classification legend

- **Already implemented and working:** present and verified for the relevant behavior.
- **Implemented but incomplete:** code exists but lacks a meaningful part of the comparable capability or was not runtime-verified.
- **Present but defective:** code exists with a confirmed correctness/safety issue.
- **Missing:** no corresponding domain/API/UI capability found.
- **Not applicable:** not needed for this product's current focus.

The initial API slice was exercised against a disposable embedded PostgreSQL database, including a cross-workspace 404 check. There are still no committed API/browser integration tests, so broader features are classified as incomplete rather than fully working.

## Capability-by-capability comparison

| Jira capability | Classification | Existing evidence / gap |
|---|---|---|
| Projects and project configuration | **Implemented but incomplete** | Additive workspace-scoped projects with workspace-unique keys, owner/admin creation, list/count API and Projects page. No settings, archive, project membership, or project-level configuration. |
| Issues: task/bug/story/epic/subtask types | **Implemented but incomplete** | Project-scoped Task/Bug/Story create/list/update, stable `PROJECTKEY-number`, issue list UI, and verified API smoke. No Epic/Sub-task hierarchy, issue detail page, or delete flow. |
| Issue fields, custom fields, priorities, labels, assignment | **Implemented but incomplete** | Fixed type/status/priority fields, summary/description, labels, reporter and workspace-member assignee are persisted and validated. No custom field configuration or project-specific user/permission model. |
| Backlogs, boards, columns, filters, ranking | **Missing** | Issue list is ordered by descending issue number and supports search/pagination; there is no board, backlog, saved filter, status-to-column mapping, ranking, or sprint association. |
| Configurable workflow/status transitions | **Implemented but incomplete** | Products have fixed shared lifecycle stages; tasks have fixed three-state status. Neither has a configurable workflow graph/transition policy or workflow-specific validation. |
| Comments, attachments, activity and change history | **Implemented but incomplete** | Product notes and analytics/stage history exist; no issue comments/attachments, full field-change snapshots, or user-facing issue activity feed. Analytics is not a substitute for an audit history. |
| Issue relationships/dependencies | **Missing** | Product BOM links materials to products; no typed issue-to-issue links, dependency semantics or hierarchy. |
| Search, filtering, sorting, pagination | **Implemented but incomplete** | Issue summary/description search, status filter, bounded limit/offset pagination and stable issue-number order exist and passed API smoke. No query language, saved filters, sort options, or committed API tests. |
| User roles and project permissions | **Implemented but incomplete** | Workspace authentication scopes project/issue reads and writes; workspace owners/admins create projects and assignees are validated as workspace members. No project role assignments/permission matrix. |
| System admin credential bootstrap | **Implemented but incomplete** | Fixed credential path was removed; persisted `users.is_admin` and explicit `create-admin --system-admin` bootstrap were added. Migration defaults existing accounts to non-admin; dedicated auth integration tests and operator rollout remain required. |
| Notifications | **Not applicable to first slice** | No general notification delivery service. It can be a later capability if product scope and transport are specified. |
| Automation | **Not applicable to first slice** | No rule engine/integration. Needs focused requirements and verified product research before implementation. |
| Reports and dashboards | **Implemented but incomplete** | Existing PDLC dashboard presets, admin analytics and health metrics exist. No issue filters/gadgets, sprint reports or configurable project dashboards. |
| API/integrations | **Implemented but incomplete** | Internal same-origin JSON API exists; no public/versioned issue API, external integration model, webhooks or developer credentials. |
| Jira-inspired issue state persistence | **Implemented but incomplete** | Additive `projects` and `issues` tables are in migration `006_projects_issues`; existing PDLC products/tasks are unchanged. No workflow, board, history, hierarchy, comment, or attachment schema. |

## Confirmed technical risks and failures

1. **Admin bootstrap rollout:** migration `005_system_admins` does not promote existing accounts. The intended system administrator must be explicitly provisioned/promoted after deploy; the operator must follow `SECURITY.md`.
2. **Integration test gap:** root unit discovery is fixed and an ad hoc API smoke passed, but no repeatable API/browser test harness exists. Add one before expanding workflows or permissions.
3. **PostgreSQL-version coverage:** migration and API smoke ran on embedded PostgreSQL 18.4, not the documented PostgreSQL 17 target. Validate on PG17 before release.
4. **Missing lint command:** no lint script is defined in the inspected manifests.
5. **Potential scale concern:** issue collection is paginated, but project list is unpaginated and no query-plan/performance test exists.
6. **Large web bundle warnings:** production build emits a >500 KB JS chunk warning and Tailwind sourcemap warning. Not a current failure, but may affect startup/performance.
7. **Stale contributor documentation:** `AGENTS.md` describes a Next.js/Prisma application while tracked app is Vite/Express/Kysely. The untracked root Next artifacts are not authoritative application sources; contributors may target the wrong app.
8. **Project permissions:** access currently follows workspace membership, not Jira-like project-specific roles. Confirm desired defaults before adding per-project grants.

## Recommended implementation roadmap

| Order | Priority | Work item | Dependencies and rationale | Risk/mitigation |
|---|---|---|---|---|
| 0 | Done; follow-up P0 | Remove fixed admin credential path and add explicit system-admin bootstrap | Code and additive migration are implemented; rollout and automated auth tests remain | Explicitly grant the intended admin after migration; never infer privileges from email. |
| 1 | In progress; P0 | Keep root tests discoverable and add repeatable PostgreSQL 17/API integration tests | Test discovery is fixed; ad hoc PG18 migration/API smoke passed, but no committed integration harness exists | Use a disposable PG17 DB and verify original data/tenant isolation. |
| 2 | Done | Adopt workspace (tenant) → project → issue, preserving existing PDLC products/tasks | User approved this additive domain boundary | Keep the `/api/products` and product task routes independent. |
| 3 | Partial; P1 | Complete project configuration/roles and project-scoped authorization | Initial project/issue tables and workspace scoping exist | Add project-level permissions only after defining the intended role model; test tenant/project IDORs. |
| 4 | Partial; P1 | Complete issue CRUD and detail UI around existing stable-key/type/status/priority/labels/assignee slice | Create/list/update and list UI exist; detail/delete and automated route tests are absent | Preserve the separate issue domain and validate all fields server-side. |
| 5 | P1 | Explicit transition model and immutable issue change history | Required before audit-sensitive status management, boards or workflow configuration | Define allowed transitions and transactionally record actor/time/old/new values. |
| 6 | Partial; P2 | Extend current server-side search/filter/pagination and add saved project filters | Basic summary/description search, status filter and bounded pagination exist | Parameterized filters, allowlisted fields, stable order; test permission-filtered totals. |
| 7 | P2 | Board/backlog, status-column mappings, drag ranking, then optional sprints/epics | Depends on issues, workflow statuses, ranking and permissions | Start with one Kanban view; use transactional rank strategy; avoid Scrum-specific assumptions until approved. |
| 8 | P2 | Comments, activity feed and issue links/dependencies | Depends on issue IDs, project checks, history | Separate event/comment/link models; enforce visibility on both linked issues and safe rendering. |
| 9 | P3 | Attachments, notifications, automation, reports/dashboards, public integration API | High operational/security scope; feature-level research and support decisions still required | Define storage/provider, quotas, email behavior, retries, webhooks, permissions, retention and SLOs before coding. |

### Implemented initial boundary and remaining scope

The approved initial slice is implemented additively: projects belong to workspaces, issues belong to projects, and existing PDLC products/tasks retain their routes and schemas. It includes a list/create Projects page, a project issue list/create page, stable issue keys, fixed types/statuses/priorities, labels, workspace-member assignment, search, pagination, status updates, migrations `005`/`006`, and removal of the fixed admin credential path. The slice passed typecheck, unit tests, production build, fresh-database migration, and a manual authenticated API smoke; see `REGRESSION_TEST_PLAN.md`.

The next recommended work is repeatable PostgreSQL 17/API tests and a product decision on whether initial workspace-level project access is sufficient or whether project roles are required. Then implement issue detail/change history and explicit workflow transitions. Defer boards, sprint planning, custom fields, attachments, notifications, automation and external API until the core model and permission behavior are covered by tests.
