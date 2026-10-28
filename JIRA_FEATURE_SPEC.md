# Jira Feature Specification (Cloud reference)

**Research date:** 2026-10-28
**Evidence boundary:** Reviewed publicly accessible official Atlassian support and REST API documentation. No Jira account, tenant, or authorized test environment was supplied. Therefore this document describes documented behavior and API contracts, not first-hand inspection of a private environment or the complete Jira UI. Jira's implementation/source code was not inspected.

## Evidence and terminology

Atlassian Cloud documentation uses both **project** and, in some current Jira Software help pages, **space** and **work item** terminology. API resources continue to expose issue/project concepts. This specification uses *project* and *issue* for familiar domain names, while noting that UI wording can vary by Jira edition/rollout.

Official references consulted:

- [Jira REST API v3 introduction](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/) — resource expansion, pagination metadata, ordering.
- [Jira REST API v3 issues](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/) — issue resources and operations.
- [Projects](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-projects/) — project resources.
- [Issue fields](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-fields/) — standard/custom field metadata and schemas.
- [Priorities](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-priorities/) — priority resource examples.
- [Issue search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/) — issue search API/JQL.
- [Comments](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/) — paginated comments, authors, timestamps, visibility and rich-text document bodies.
- [Attachments](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-attachments/) — attachment metadata and content resources.
- [Issue links](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-links/) — typed inward/outward issue relationships.
- [Project roles](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-project-roles/) — project role actors and relation to permission schemes.
- [Dashboards](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-dashboards/) — dashboard resources and sharing metadata.
- [Boards](https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/) and [sprints](https://developer.atlassian.com/cloud/jira/software/rest/api-group-sprint/) — Agile board/sprint resources.
- [Scrum backlog](https://support.atlassian.com/jira-software-cloud/docs/use-your-scrum-backlog/) — backlog visibility rules, ranking, sprint/epic assignment and permission-dependent actions.
- [Kanban backlog](https://support.atlassian.com/jira-software-cloud/docs/use-your-kanban-backlog/) — filter/status-mapped backlog behavior and moving work from backlog to selected.
- [Configure columns](https://support.atlassian.com/jira-software-cloud/docs/configure-columns/) — columns, status mapping, ordering, board-admin permissions, and unmapped items hidden from board/backlog.

Some candidate support URLs for project/workflow/JQL pages returned 404 during this review; no claims below rely on those unavailable pages as direct evidence. Workflow transition behavior is grounded in the Jira issue REST resource/API contract; automation and report UX details are marked as requiring follow-up verification.

## Capability specification

| Capability | Documented behavior / inputs and outputs | Edge cases and acceptance criteria |
|---|---|---|
| Projects and configuration | Project resources group work and expose identifiers/keys and configuration context. Project-scoped issue operations identify project. | Project creation requires a stable unique key and tenant scope. Verify duplicate key, rename, archived state, deletion/retention, and permissions before implementing. |
| Issues and hierarchy | Issue creation/update carries project, issue type, summary/description, fields, and relationships. Jira concepts include tasks, bugs, stories, epics, and subtasks; issue types carry hierarchy/configuration. | Enforce project scope, required fields and parent constraints; prevent cross-project/cyclic hierarchy; keep stable identifier/key; preserve valid data when type/config changes. |
| Fields, custom fields, priorities, labels, assignments | Fields have identifiers, names, schemas, and configuration contexts; issues store field values. Priority is a distinct resource. Assignment/reporter are user references; labels are searchable tags. | Validate field type/options and project applicability; distinguish unassigned from unknown user; handle disabled users/deleted options; sanitize text and validate label count/length. |
| Backlog, boards, columns, filters, ordering | Board is associated with a saved filter; backlog shows matching issues. Scrum backlog groups backlog/sprints and supports ranking and sprint/epic/version assignment. Board columns map one or more statuses; unmapped statuses may hide work items. Admin permissions are required for board configuration. | List order must be stable; ranking concurrent updates need deterministic behavior. Clearly indicate when filter/status mapping excludes an item; protect board configuration; handle empty columns/backlogs and items moving out of the selected filter. |
| Workflow and transitions | Issue status is not merely an arbitrary field update: workflow actions/transitions are exposed as operations; workflow statuses and transition configuration govern state movement. | Reject unavailable transitions; validate required conditions/fields at transition time; record actor/time and field changes atomically; prevent terminal-state assumptions from breaking custom workflows. Exact Jira UI administration rules require live/docs follow-up. |
| Comments and activity | Comments have author, timestamps, rich-text body, and optional visibility restrictions. Issue changes and history are available as issue resources/operations. | Restrict private/restricted comments to authorized viewers; preserve edit/delete audit history; render rich text safely; keep comment author/timestamps on edit. |
| Attachments | Attachment records expose author, creation time, file name, MIME type, size and content resource; upload uses a dedicated API operation. | Enforce size/type limits, auth, malware policy, safe content disposition, tenant ownership and deletion behavior. Never trust filename/MIME supplied by client. |
| Issue relationships/dependencies | Links are typed and directional, with inward/outward issue endpoints. Hierarchy is distinct from general issue links. | Reject self-links and invalid/cyclic hierarchy; preserve inverse display semantics; enforce both endpoint project permissions; avoid assuming all links block progress. |
| Search, filtering, sorting, pagination | Jira issue search supports query language (JQL) and field selection; list APIs use page metadata such as `startAt`, `maxResults`, `total`, `isLast`; ordering is endpoint-specific. | Parse/parameterize expressions (never SQL concatenate), cap page size, stable tie-break ordering, define empty pages while totals change, validate unknown fields/operators and permission-filter results before totals. |
| Roles and permissions | Project roles associate users/groups to projects; permission schemes and role grants affect access. Board/project administration is permission-gated. | Enforce authorization server-side on every read/write and related-object lookup; prevent access through IDs, filters, links, comments, and attachments; permission updates should take effect promptly. |
| Notifications and automation | Product areas exist in Jira; details, editions, quotas, event semantics, and rule execution were not verified in this source-only review. | Before building, define event delivery, retries/idempotency, rate limits, recipients, opt-outs, permissions and audit. Do not imply email delivery without configured integration. |
| Reports and dashboards | Dashboard API documents dashboards with owner, favorite and sharing permissions. Jira Software has board/sprint analytics; individual report behavior varies by product tier. | Enforce dashboard/filter visibility, empty/loading states, scoped aggregation, and no data leak through a shared dashboard. Follow-up research required for chosen report set. |
| APIs and integrations | Jira Cloud REST v3 uses resource operations, JSON, pagination, expansion and documented permission scopes; Jira Software Agile REST exposes boards, backlogs and sprints. | External API parity is not required for initial local feature slice. If added, use explicit versioning, auth, rate limits, pagination, idempotency and backward-compatible schemas. |

## Suggested acceptance criteria for a minimal comparable slice

1. A workspace admin can create a project with name and unique key without changing existing workspace/product flows.
2. A project member can create/list/update/archive issues in that project with stable issue key, type, status, priority, assignee, labels and description.
3. All issue routes enforce project membership/permissions on every operation; cross-workspace/project access returns a non-disclosing not-found/forbidden response.
4. A list view supports server-side filtering/sorting/pagination and deterministic ordering; invalid query inputs return validation errors.
5. Status change is an explicit validated transition and creates immutable actor/time history.
6. Comments and typed issue links are scoped and visible to permitted project members only.
7. Existing product lifecycle, product tasks, workspace membership, login, admin routes and access requests remain unchanged and pass regression tests.

These are recommended acceptance criteria, not claims that Jira behaves identically in all editions or that the current application implements them.
