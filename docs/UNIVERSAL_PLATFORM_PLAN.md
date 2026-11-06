# Universal platform audit and incremental migration plan

**Date: 2026-11-04.** This is an additive plan, not a claim that the complete universal platform exists. The first implementation slice is limited to honest workspace setup and navigation prioritisation.

## Existing architecture audit

| Area | Current source of truth / capability | Gaps and cautions |
|---|---|---|
| Identity and tenancy | `users`, `workspaces`, `memberships`, `sessions`; session selects active workspace. Solo/team modes are separate. | Roles are owner/admin/member; there is no generic per-record ACL. Workspace scoping must be enforced in every new query. |
| Work management | Workspace `projects` and project `issues` with fixed Task/Bug/Story types, statuses, assignee and Teamwork Graph links. | No configurable workflow, epics, releases, sprints or universal record type. Do not fabricate these. |
| Product lifecycle | Workspace `products`, product `tasks`, stage history and discovery answers. | Product checklist tasks and project issues overlap conceptually but differ in ownership and lifecycle; preserve both and define any future linking/migration explicitly rather than silently merging. |
| Physical-domain catalog | `materials`, `suppliers`, `material_quotes`, `product_materials`; product costs/BOM. | These remain real domain-specific capabilities; hiding a link cannot delete data or restrict direct access. |
| Dashboard and navigation | `users.dashboard_layout` and `users.app_layout`; account-scoped presets and navigation modes. Dashboard summaries use actual project/issue data. | Account preferences are not workspace defaults. Do not overwrite a user's saved layout or mutate shared project data when applying a setup recommendation. |
| Assistant and help | Workspace/user-scoped assistant conversations, explicitly confirmed project/issue actions, existing Help Centre and provider adapters. | Assistant has no first-class requirements, research, release, verification or document records to query; configuration alone must not make AI claim these exist. |
| Activity and collaboration | Existing product-stage history, analytics, issue relationships and selected external review grants. | Not a universal audit log, comments, attachments, notifications or approval engine. Reviewer grants are narrow and do not create workspace membership. |

Inspected `ARCHITECTURE.md`, server migrations/schema/routes, shared types/dashboard, web routes/layout/settings and assistant. The existing PostgreSQL/Kysely architecture is adequate for an additive foundation; there is no justification here to replace the database.

## This first bounded slice

- Persist optional, versioned workspace setup in a new workspace-keyed table. Capture multiple broad domains, an objective, optional working requirements and chosen navigation priorities. Choices represent **context and navigation preferences**, not enabling a non-existent module or removing access.
- Owner/admin can review and save workspace-wide settings; members can read but not modify. Optimistic version checks prevent silent overwrites. Existing and demo workspaces retain their behavior until explicitly configured; no data migration or dashboard-layout replacement.
- Provide a non-blocking guided setup for authorized users, with a review step and an accessible link from settings/dashboard. Suggest only actual links (projects, products, materials, suppliers, teamwork graph, help, assistant); mark requested missing capabilities as future, not enabled. Users can adjust the suggestions.
- Prioritise chosen existing links in navigation; keep all routes available and preserve existing role/permission checks. Existing per-user dashboard settings are not modified. A personal layout remains account-scoped, not shared workspace setup.
- Verify schema migration on a populated database, normal/invalid inputs, owner/admin/member and cross-workspace isolation, stale writes, persistence/reopen, navigation behavior, existing functionality and responsive/keyboard UI.

## Future stages and safe evolution

1. **Foundation follow-ups:** personal hide/pin preferences, richer workspace-specific dashboard recommendations, richer onboarding and explicit opt-in module visibility. Keep all existing routes and data; gate only presentation, never authorize via visibility.
2. **Flexible work management:** design versioned workflow definitions and typed custom-field definitions/values with scoped foreign keys, constraints and indexes. Changing a definition must preserve historical versions and issue state; validate transitions server-side. Decide how issue and product-task records relate before introducing a universal abstraction. Migrations require backward compatibility and reversible deployment/backup strategy.
3. **Domain slices:** implement real software, research, education and business capabilities one at a time, with domain-specific records only where necessary and reusable core entities elsewhere. Templates may create actual supported configuration, never invented records/statuses or placeholder reports.
4. **Adaptive intelligence/search:** query only real permitted records; bounded context and explicit consent, distinguish facts from suggestions, confirm writes through existing validation, and enforce permissions for each source. Add search/reporting only as underlying data exists.
5. **Advanced customization:** versioned reusable templates, relationships, reporting and automation after authorization, history and validation foundations are tested.

## Acceptance boundaries

The initial slice cannot pass the full SaaS-release, aerospace-verification, research-publication or custom-workflow acceptance tests: those domains lack essential first-class records. Stage 2+ requires separate implementation and tests. No change in this slice implies CAD licensing approval or modifies the pending CAD work. Existing uncommitted education/language and CAD research changes must be preserved and kept separate when staging or merging.

## First-slice implementation and verification

Implemented: migration `023_workspace_profiles`, an optional workspace-scoped profile and reviewable setup page with multiple domains, a custom or suggested objective, interests labelled when unavailable/limited, and user-adjustable prioritisation of real navigation links. Owner/admin writes require a revision match and active-workspace ID; members can read only. No profile is created for existing workspaces automatically. No supported feature is removed or enabled by this setting, and no user's personal dashboard layout is changed. An unsaved role-default dashboard omits product-specific widgets for workspaces without product focus; a saved personal layout always takes precedence. The setup prompt is non-blocking rather than a forced signup step. Changes are persisted on the server and apply to the current workspace; they do not automatically create projects, workflows, templates, reports or AI context.

Verification performed: migration on a disposable database populated under migrations 001–022 (existing user, workspace and project counts unchanged); automated profile API smoke including owner/admin/member, cross-workspace isolation, invalid input and racing revision writes; existing dashboard smoke; unit tests, typecheck, build and diff whitespace checks; browser setup/review/save/reopen and navigation order at 320, 390, 768 and 1440 CSS pixels; the unsaved dashboard adapts while a saved personal layout is preserved. These checks are not full Stage 1 or the user's five end-to-end domain acceptance scenarios. Dedicated custom workflows/records, domain modules, cross-module search, reports, onboarding-created dashboards and workspace-aware AI remain unimplemented. Configured users can still customise their personal dashboard using the existing settings.
