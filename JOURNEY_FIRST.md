# Journey-first Product Model

**Status:** implemented (migration `037_journey_first`, routes `/api/journeys`, Journey page at `/`).
This document describes the actual code: what the three primary destinations are, how a project's
Journey is modelled and computed, which APIs exist, and how existing data is preserved.

---

## 1. Three primary destinations

Solution Velocity now has exactly three primary destinations in the main navigation
(`apps/web/src/components/Layout.tsx` → `NAV`):

| Destination | Route | Role |
|---|---|---|
| **Journey** | `/` (default landing page) | Per-project development path: stages, activities, tasks, approvals, deliverables, blockers, milestones — with the project selector and **New project** at the top. |
| **AI Assistant** | `/assistant` | Conversation workspace. Deep-linkable per project (`/assistant?project=<id>&prompt=…`), shows a journey chip (template · % · next action), journey-aware starter prompts, and journey MCP tools for proposing/doing work. |
| **Design Studio** | `/designs` | Studio home, diagrams and experimental sketches. Every page carries a project context bar; lists can be filtered with `?projectId=`; new designs/sketches are created under the selected project. |

Everything else (Dashboard, Projects list, Products, Teamwork Graph, Materials, Suppliers,
Achievements, Help, Settings, Admin…) still exists and is fully routable — it lives in the
workspace menu's **Explore** section (`SECONDARY_NAV`) instead of the primary nav. Nothing was
deleted: no routes, tables, columns, endpoints or data were removed by this change.

Post-login navigation and the authenticated `/` route go to the Journey page
(`apps/web/src/main.tsx`, `RequireAuth` redirect after login).

## 2. The per-project Journey

### 2.1 Model

Each workspace project owns **one independent Journey** (`journey_stages`, `journey_activities`,
`journey_activity_dependencies`, `journey_artifact_links` in migration
`apps/server/src/db/migrations/037_journey_first.ts`):

- **Stages** — an ordered lifecycle path (e.g. hardware: Discover & Define → … → Launch & Operate).
  Stages come from a template when the project is created and can be extended with custom stages
  (`POST /journeys/projects/:id/stages`).
- **Activities** — the work inside a stage, kinds: `requirement`, `design`, `research`, `analysis`,
  `prototype`, `test`, `manufacture`, `build`, `decision`, `review`, `approval`, `risk`,
  `milestone`, `deliverable`, `learning`, `other`. Each has status
  (`todo | in_progress | blocked | completed`), optional blocker reason, assignee, due date,
  review state (`none | pending | approved | changes_requested`), progress notes and checklist.
- **Tasks/issues** — issues remain the task system; they now carry `stage_id` so a stage shows its
  tasks alongside its activities. Issue statuses map to journey units (`Done`/`Completed` count as
  complete; `Blocked` blocks the stage; `In Progress` is work in flight).
- **Dependencies** — activities can depend on other activities (`waitingOn`); cycles are rejected.
- **Artifact links** — activities link to tasks, diagrams, sketches and documents
  (`journey_artifact_links`); designs accept `journeyActivityId` and CAD documents accept
  `projectId` + `journeyActivityId`.
- **Reviews/approvals** — review-kind activities support request → approve/changes workflows;
  approving completes the activity.

### 2.2 Progress is computed from real state

`deriveJourneyView` in `packages/shared/src/projectJourney.ts` (unit-tested in
`projectJourney.test.ts`) computes everything server-side from stored rows — there is no stored
or fake progress:

- A stage's **units** = its activities + its issues.
- **Percent** = completed units / total units (stage and overall journey).
- Stage **state**: all units done → `completed`; first not-done stage → `active`
  (→ `blocked` when it has blocked work); the rest → `upcoming`.
- Journey **summary**: counts (stages, activities, issues, completed/blocked), `blockers`,
  `pendingApprovals` (review activities awaiting action), `nextAction` (first actionable activity,
  skipping blocked/waiting work), and `upcomingMilestones` (next 3 incomplete milestones by due date).

### 2.3 Seeding and backfill

- `POST /api/projects` accepts `template: hardware | software | service | research | general`
  (recorded on the project as `template`). Creating a project seeds its journey immediately via
  `ensureProjectJourney` (`apps/server/src/services/journey-first.ts`).
- **Migration 037 inserts no rows.** Existing projects get their journey lazily on first
  `GET /journeys/projects/:id` (or first open of the Journey page), using the recommended
  general-purpose template (or the project's `template` when set). Existing records — products,
  issues, designs, documents, permissions — are untouched; issues only gain an optional
  `stage_id` (nullable), and design/CAD documents gain nullable link columns.
- `requireCurrentMigrations()` fails closed: the migration is registered in
  `apps/server/src/db/migrate.ts` alongside the rest, so deploys cannot run a schema that is
  missing the journey tables.

### 2.4 Isolation and permissions

Every `/api/journeys` handler resolves the target project first and verifies current-workspace
membership — a foreign workspace gets `404` for reads *and* writes (covered by
`apps/server/scripts/journey-smoke.mjs`). Journey data never crosses workspace boundaries, and the
selected project context (`sv-selected-project` in localStorage, mirrored in `?project=`) is scoped
per workspace.

## 3. API surface (`/api/journeys`)

Mounted in `apps/server/src/app.ts`; implementation in `apps/server/src/routes/journeys.ts`
(+ `services/journey-first.ts`). See `ROUTE_AND_API_INVENTORY.md` for the endpoint table.
Highlights:

- `GET /projects/:projectId` — full journey view (summary + stages with units/issues/activities/
  dependencies/artifacts).
- Stages: `POST /projects/:id/stages`, `PATCH /stages/:stageId`.
- Activities: `POST /projects/:id/activities`, `PATCH|DELETE /activities/:id`.
- Reviews: `POST /activities/:id/review` with `{action: request|approve|changes, note?}`.
- Dependencies: `POST /activities/:id/dependencies`, `DELETE …/:dependsOnId`.
- Links: `POST /activities/:id/link`, `DELETE /activities/:id/link/:type/:artifactId`.
- `GET /projects/:projectId/members` — assignee options.

Related endpoints outside the journey router: `POST /projects` (`template`),
`POST /projects/:id/issues` (`stageId`), `POST /designs` (`projectId`, `journeyActivityId`),
`GET /designs?projectId=`, `POST|GET /cad-documents` (`projectId`, `journeyActivityId`).

### AI Assistant integration

`apps/server/src/services/assistant-mcp.ts` exposes three MCP tools the assistant can propose and
execute against the **current** project context only:

- `get_project_journey` — read the journey/summary for the addressed project.
- `create_journey_activity` — add an activity to a stage.
- `update_journey_activity` — change status/blocker/due/review fields.

`routes/assistant.ts` injects journey context (template, percent, next action, blockers, pending
approvals) into the prompt and rewrites project deep links as `/?project=<id>` /
`/assistant?project=<id>`. The web Assistant page (`apps/web/src/pages/Assistant.tsx`) reads
`?project`/`?prompt` deep links once on mount, keeps the shared project context in sync, and offers
journey-first starter prompts ("Summarise this journey", "What should I work on next?", …).

## 4. Frontend map

| Area | Files |
|---|---|
| Journey page | `apps/web/src/pages/Journey.tsx` (header + selector + summary cards + stage path + contextual footer) |
| Stage detail (in place) | `apps/web/src/components/journey/StageDetail.tsx` — activities, tasks/issues, approvals, blockers, dependencies, linked artifacts, add forms |
| Project selector / creation | `components/journey/ProjectSelector.tsx`, `components/journey/NewProjectModal.tsx` (key + name + type → recommended lifecycle) |
| Shared project context | `lib/projectContext.ts` (`sv-selected-project`, workspace-scoped), `lib/useProjectParam.ts` (`?project=` ↔ context), `components/journey/ProjectContextBar.tsx` |
| API client | `apps/web/src/api/projectJourney.ts` |
| Journey-aware pages | `pages/Assistant.tsx`, `pages/StudioHome.tsx`, `pages/CadDocuments.tsx`, `pages/CaditStudio.tsx`, `pages/DesignStudio.tsx` |
| Navigation | `components/Layout.tsx` — `NAV` (3 destinations) + `SECONDARY_NAV` (Explore) + New-project buttons |

Deep-link contract: `/?project=<id>` is the shareable Journey URL; `/assistant?project=&prompt=`
deep-links into a conversation; Design Studio pages use `?project=`/`?projectId=` and keep the same
context. All three stay in sync through `sv-selected-project`.

## 5. Verification performed

- `npm run typecheck` (root, all workspaces) — pass.
- `npm test` (root, all workspaces) — pass, including the new shared journey tests
  (`packages/shared/src/projectJourney.test.ts`, 6 cases) and the existing web/server suites.
- `npm run build` — pass (Vite web bundle + server bundle).
- Migrations: `npm run migrate` applies `037_journey_first` on a fresh PostgreSQL and on a copy of
  an existing database (`founders_boundary_test`), no data loss.
- API smoke: `npm run journey-smoke --workspace @sv/server` — 35 checks covering seeding,
  progress-from-state, tasks, approvals, blockers, dependencies, custom stages, artifact links,
  design filtering and cross-workspace isolation.
- Browser smoke: `node apps/web/scripts/journey-ui-smoke.mjs` — journey landing, exactly three
  primary destinations, stage detail, project switching and creation, mobile layout without
  horizontal overflow (screenshots in `.data/screenshots/`).
- Regression smokes re-run against the branch: `design-studio`, `founders-boundary`,
  `studio-home-integration`, `studio-home-browser`, `cadit-browser`, `design-autosave-integration`,
  `project-workflow` — all pass.

## 6. Acceptance criteria mapping

| Criterion | Where satisfied |
|---|---|
| Exactly 3 primary destinations | `Layout.tsx` `NAV` = Journey / AI Assistant / Design Studio; asserted by `journey-ui-smoke` |
| Journey is the default landing page | `/` → `JourneyPage` in `main.tsx`; post-login redirect → `/` |
| Project selector + creation at top of Journey | `JourneyHeader` (`ProjectSelector`, `New project`) |
| One Journey per project, independent | `journey_*` tables keyed by `project_id`; lazy per-project seeding |
| Progress from actual states | `deriveJourneyView` (shared, unit-tested) — no stored/fake percentages |
| Multi-project switching without leakage | workspace-scoped handlers + `sv-selected-project` context + 404 isolation smoke |
| Artifacts linked to project & Journey | `stage_id` on issues, `journeyActivityId` on designs/CAD docs, artifact links |
| AI Assistant project-context-aware | journey context in prompt, MCP tools, deep links, journey chip/starters |
| Design Studio project-linked | context bars, `?projectId=` filters, create-under-project |
| Existing data/functionality preserved | nullable columns only, no drops, secondary nav keeps every old destination |
| Safe migrations | registered in `migrate.ts`, `requireCurrentMigrations` fails closed, verified up/down-free apply |
| Responsive desktop + mobile | mobile bottom nav with the same 3 destinations; overflow-checked in smoke |
