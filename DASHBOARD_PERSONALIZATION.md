# Dashboard personalization

Dashboard settings are available under **Settings → Personalization → Dashboard** and from the dashboard's **Customize** action. Layouts are stored in the existing `users.dashboard_layout` JSONB column, scoped to the authenticated account. The ordered list of visible widgets provides position and width; compact/expanded controls spacing and the number of rows in project widgets. The five older presets and previously saved custom layouts remain readable. Unsaved edits are not stored until applied. Reset uses an executive layout for owners/admins and a personal layout for members.

The new project widgets query the current authenticated workspace, with assigned issues filtered to the signed-in user. Project counts and issue completion are derived from persisted project/issue records; open dependencies use recorded `depends_on` relationships. Lists are capped at six rows (three in compact mode), while totals are independent of those limits. Product-task deadlines come from existing product tasks and are workspace-wide, not personal assignments. The chart bars for projects link to their actual issue lists. Widget settings do not alter project or product records.

## Available data and gaps

The requested templates are available, but they cannot include every requested widget. This application does not currently have first-class persisted sprints, milestones, project deadlines, risks, requirements, engineering changes, design decisions, verification tests, evidence, reviews, non-conformities, or document-update history. Product health is not project health; issue completion is not verification coverage. The template previews explicitly note these limits. No placeholder numbers or inferred records are presented as real data. Project issue deadline, review status, project membership, and personal product-task assignment are also not tracked.

The personalization system builds on the existing dashboard renderer; it does not create the missing domain modules. Compact view reduces grid spacing and limits rows in the new project widgets; existing product widgets retain their own display behavior. There is no general per-widget filter editor or arbitrary chart selection.

## Verification

- `npm run typecheck`, `npm test`, and `npm run build`.
- For an isolated development database and server, run `DASHBOARD_SMOKE_URL=http://localhost:4000 DASHBOARD_SMOKE_ORIGIN=http://localhost:5173 node apps/server/scripts/dashboard-smoke.mjs`. The script creates test users, workspaces, projects and issues; **never point it at production**. It checks user isolation, persistence after logout/login, validation, scoped results, assignments and recorded dependencies.

## Layout settings

**Settings → Layout** contains both the active dashboard's widget editor and workspace-shell preferences. The shell supports expanded or compact desktop navigation and full or constrained content width; mobile navigation remains unchanged. Shell settings are account-specific, saved separately in `users.app_layout`, and do not replace dashboard preferences. Existing users retain the expanded, full-width layout until they choose otherwise. Unsaved edits prompt before leaving the settings section. Migration `009_app_layout` adds the nullable preference column and is applied by the server's normal migration process.

The Dashboard settings page presents the five role-oriented layouts as ready-to-use cards with visual previews. Selecting one applies it immediately; replacing a customized layout or unsaved widget edits requires confirmation. The individual widget editor and the earlier product-focused presets remain available in expandable sections.

Application layout offers four desktop navigation styles: expanded or compact sidebar, top tabs, and a top menu. The Layout settings page shows visual previews; changes are applied when saved. All styles retain access to the same workspace sections, account menu, and actions. The mobile navigation remains unchanged.
