# Proposed architecture and contracts

**All architecture below is an independent proposal, not a description of Onshape's implementation or an existing capability of this repository.** Identifiers, routes and tables are drafts; none have been implemented. Detailed deployment, license and solver choices require review.

## System and dependency flow

```text
 Browser (existing React application)
 ├─ CAD document/tree/feature editors + accessible commands
 ├─ Local interaction state, typed sketch entities, optional solver worker
 ├─ Three.js tessellation display + topology-pick lookup (not B-rep)
 └─ same-origin /api client; version-tagged events (later)
             │ authenticated, authorized requests
             ▼
 Existing Express app: session + CSRF/origin + workspace authorization
 ├─ CAD services: document ACL, validated commands, revision CAS, audit
 ├─ evaluation coordinator: idempotent jobs, leases, transactional outbox
 ├─ artifact gateway: authorize every B-rep/mesh/download request
 └─ PostgreSQL: source intent, revisions, metadata, jobs and ACLs
             │ immutable source/revision input; no browser direct worker access
             ▼
 Isolated evaluation worker: solver adapter + OCCT kernel adapter
 ├─ sketch solve and profile topology
 ├─ dependency-ordered B-rep regeneration, reference mapping, diagnostics
 ├─ B-rep validity, tessellation + stable selection mapping
 └─ private artifact store: evaluated B-rep / meshes / provenance / checksum
```

The web app depends on typed contracts, not native kernel APIs. The API owns validation and permission decisions; workers have short-lived, narrowly scoped access, not ambient database credentials for arbitrary tenants. Initial deployment may use a private filesystem volume, if durable, backed up and access-controlled; an S3-compatible object store is a later deployment option. Nothing requires browser calls to localhost, direct object storage credentials or private Onshape services. Existing app routes and data remain separate. Enforce workspace membership and object-level permissions server-side using existing auth/session/CSRF conventions; do not assume the current workspace member role automatically conveys every CAD privilege.

## Technology evaluation (provisional, not approved)

| Area | Candidate | Strength | Gaps and gate |
|---|---|---|---|
| Solid kernel | [OCCT](https://github.com/Open-Cascade-SAS/OCCT), native worker | Real B-rep/topology, geometric operations and exchange, native crash isolation | Pin release and validate results/cross-platform reproducibility, resource caps, build/distribution; LGPL-2.1 + exception or commercial terms require legal review |
| Browser kernel alternative | [OpenCascade.js](https://github.com/donalffons/opencascade.js) (WASM) | Can reduce preview latency/offline dependence | Bundle/memory costs, browser worker isolation, API coverage and project maintenance, license obligations and consistency with native builds need measurement. Do not trust unverified client output as authoritative |
| Rendering | [Three.js BufferGeometry](https://threejs.org/docs/pages/BufferGeometry.html) | WebGL mesh, interaction, camera tooling; fits React | Triangles do not encode editable exact topology or a solver. Tessellation error and face/edge IDs must be tracked separately |
| Sketch solver | [SolveSpace](https://github.com/solvespace/solvespace) and [SolveSpaceLib](https://github.com/JacobStoren/SolveSpaceLib) candidate evaluations | Existing geometric constraint approaches to examine | GPL-3 obligations and upstream ownership/version details require legal review; embedding, service isolation, distribution and browser build are not presumed compliant or drop-in |
| Sketch solver alternative | [FreeCAD](https://github.com/FreeCAD/FreeCAD) PlaneGCS candidate | Established parametric ecosystem to investigate | Review exact component files, dependency licensing, compatibility and maintainability; do not assume license based on the whole project |
| Not recommended as complete sketch solver | [Ansatz](https://github.com/LAU-MARS/Ansatz) | MIT candidate for general constraints | Its own scope does not provide general 2D sketch constraints; not sufficient without additional work |
| API/data | Existing Express/Zod/Kysely/PostgreSQL | Fits authenticated workspace, migrations and existing UI | Add revision/CAS, policy, worker jobs, storage and quotas; avoid coupling CAD state to product tasks |

An original solver is also an option but represents major numerical/diagnostic work. Conduct a reproducible spike against the specified constraint corpus, singularities, contradiction detection, consistent solutions, performance and legal review before choosing. No exact dependency version has been selected. All third-party and transitive notices, source-offer/relinking duties and deployment/distribution obligations must be evaluated by counsel, not decided by this document.

## Canonical document, evaluation and mesh are different

```text
User intent (source revision, immutable)
  ├─ units, frame, IDs, sketch entities, equations, feature parameters,
  │  references, ordering, assemblies/drawings, schema version
  ▼
Evaluation context (engine + solver + tolerance/version/configuration)
  ├─ B-rep exact-ish kernel bodies, topology provenance, diagnostics
  ▼
Derived artifacts (discardable and revision-bound)
  ├─ B-rep/cache for correct modeling and measurement
  ├─ render triangles + tessellation tolerances + subshape/primitive mapping
  └─ thumbnails/exports
```

Only a canonical source revision is the edit/history authority. B-rep is kernel-computed and authoritative for geometry at that evaluation context, not an editable feature history. Mesh is a display/picking derivative and never substituted for a solid. Cache keys include workspace/document/revision, source hash, engine+solver versions, configuration, tolerance and tessellation options. No cross-tenant artifact access or shared cache namespace without a separately reviewed isolation design. Check content checksum before use; rebuild stale or missing artifacts; do not silently regenerate a historical revision using a new engine and present it as identical.

### Sketch and feature representation

- Use canonical SI lengths and radians internally, preserving original display units and expression text separately; numeric bounds and scale-aware tolerance must be selected from kernel studies. Reject NaN/infinity and mismatched units. Expressions are a bounded grammar/AST with dimensional checking, not JavaScript execution; prevent dependency cycles. Expressions and named variables are deferred until supported and tested.
- A sketch is a plane frame, typed entity IDs (point/line/arc/circle initially), construction flag, constraints and driving/reference dimensions. Solving is a constraint graph with explicit equation/residual/DOF classification, deterministic initialization and bounded iterations. Reject contradictory new constraints; report redundancies or singular/numerically uncertain states distinctly; do not report fully constrained if the solver cannot establish it. Canonical server results win over optional local prediction.
- Closed non-construction profiles must have valid winding/nesting, with toleranced joins and robust intersection checks; preserve holes as loops. No implicit close of gaps merely because triangles appear joined. Initial extrusion can limit profiles to one simple closed rectangle; other cases remain unavailable until supported.
- A feature stores ID, feature type/schema version, parameter AST/value, explicit typed upstream references, order and suppression. A Part Studio may own multiple bodies; each body is B-rep not just a display object. Different output body types (solid, surface, wire) must be explicit; no claimed support for solid operations on a triangle mesh.

## Regeneration, topology and failure semantics

1. Validate feature/solver schema and dependency edges. Detect cycles and invalid feature ordering. Editing input marks transitive descendants dirty; use cached unchanged prefix only when context and hashes match.
2. Resolve each reference against its producing feature, semantic role and available kernel operation history. Compute a new candidate result in order with bounded worker resources. Persist provenance from generated/modified/deleted subshapes, including split/merge candidates. Track sketch entity/profile IDs separately from kernel-generated topology IDs.
3. Accept a reference mapping only when it is unambiguous and passes type and geometric checks. A face index, tessellation triangle index or nearest match alone is **not** persistent identity. Deletion, split/merge or ambiguous candidates produce a broken/ambiguous reference with repair UI; never substitute a similar looking face silently. Some changes will necessarily require manual repair.
4. On successful valid evaluation, publish artifacts associated with the exact accepted source revision. On failure, report first error and mark dependent features blocked; preserve source and last known good evaluated artifact, clearly labelled stale, with no export as the failed revision. New preview errors do not mutate committed source. Decide before implementation whether a committed upstream edit that breaks downstream features is permitted as an explicitly invalid revision or rejected transactionally; default proposal is **reject** unless the user explicitly chooses a later designed broken-state workflow.
5. Result publication is compare-and-swap against the job's revision/evaluation identity. Older jobs cannot overwrite newer evaluations. Determinism is a tested target within a pinned context, not a guaranteed bitwise invariant across compiler/kernel/platform upgrades. Kernel upgrades require migration/replay comparison and user-visible failures, retaining the previous context where supportable.

### Command/preview/commit flow

```text
editor → preview(base revision + draft command) → ephemeral evaluation + diagnostics
editor → submit(base revision + idempotency key + command)
       → authenticate + authorize + validate + stage evaluation
       → re-check head and permission, atomically append revision + job/outbox
       → commit, then worker consumes outbox and publishes revision-scoped artifacts
       → clients learn revision/evaluation state, refresh only authorized resources
```

For commands requiring geometry validation, stage evaluation against the immutable base **before** the short DB commit; commit only if evaluation succeeds, the head and permissions still match, and staged artifact hashes match the accepted candidate. Store/promote results idempotently and clean orphaned staging artifacts after a grace period. If publication fails after commit, mark evaluation pending/failed and retry; never show an artifact from another revision as current. Undo/redo creates new validated revision(s), rather than erasing shared history. Per-user undo must fail with an explicit conflict if intervening edits make its inverse unsafe; no blind overwrite.

## Proposed data model

All rows below include tenant/workspace scope either directly or by an enforced composite foreign key; all IDs are opaque and server-generated. Unique keys and constraints shown are minimums; migrations and retention policy await approval. Tenant-scoped constraints must be enforced in queries and foreign keys—not just client filtering.

| Table/entity | Important fields and constraints | Purpose |
|---|---|---|
| `cad_documents` | id, workspace_id, name, owner_id, created_at, archived_at | Document identity and tenancy; optional links to existing products/projects via separate authorized relations |
| `cad_document_grants` | document_id, principal (member/group), permission, granted_by; unique tuple | Narrower document access; no access solely from knowing ID |
| `cad_elements` | id, document_id, type (part studio/assembly/drawing), name | Typed logical tab; element IDs stable across revisions |
| `cad_branches` | id, document_id, head_revision_id, name, lock_version | Mutable working line; update head with CAS and tenant-scoped FK |
| `cad_revisions` | id, document_id, parent(s), source_hash, schema_version, engine_context, author, timestamp | Immutable DAG; parents must belong to same document, graph acyclic |
| `cad_revision_elements` | revision_id, element_id, canonical_state or immutable blob reference, state_hash | Complete immutable intent or checked reconstructible snapshot; schema validation and migrations |
| `cad_commands` | id, document_id, branch_id, base_revision_id, result_revision_id, actor_id, idempotency_key, type, payload_hash | Auditable intent; unique `(document, actor, idempotency_key)`; same key/different payload is conflict |
| `cad_evaluations` | revision_id, context_hash, state, diagnostics, result_hash | One context-specific evaluation; pending/running/succeeded/failed, independent of revision identity |
| `cad_artifacts` | evaluation_id, kind, storage_key, checksum, bytes, format_version | Private B-rep/mesh/export artifacts, authorization through revision and context; no unauthenticated storage keys |
| `cad_jobs` / `cad_outbox` | job id, evaluation id, lease owner/expiry, attempts, status, event sequence | Durable retries, crash recovery, at-least-once delivery and idempotent publishing |
| `cad_versions` | id, document_id, revision_id, name, author, timestamp | Immutable named snapshot; version cannot be silently rewritten |
| `cad_comments` | id, document_id, revision_id, optional stable anchor, author, body, status | Permission-scoped, revision-aware review; dangling anchors explicit |
| later: assembly/drawing records | canonical content stored in revision element; relational indexes only as derived projections | Versioned source of truth rather than independently mutable live rows |

A canonical element's proposed source contains `features[]`, `sketches[]`, typed geometry references and dependencies; assembly instances/mates and drawing sheets/views/annotations become distinct element schemas when implemented. Record explicit schema version and validated migrations; preserve old revisions. Unique and foreign-key tenant constraints, controlled deletion, retention/backups, encryption in transit/at rest and audit policy require deployment-specific design. CAD read-only external reviewers, if ever supported, require separate narrow grants and must not become workspace members or gain unrelated issue/product access.

## Draft HTTP contract (not live endpoints)

All routes under `/api/cad`; authenticated session and existing CSRF/origin controls for mutations. All document/branch/revision/artifact operations perform workspace and document authorization on the server, including event subscriptions. Auth failures never return geometry or existence details to unauthorized users. Access revocation is checked for long-lived event streams and at artifact download; use private/no-store caching for sensitive responses.

| Method / path | Request → response | Checks / behavior |
|---|---|---|
| `POST /documents` | `{workspaceId,name}` → `201 {documentId,branchId,revisionId}` | membership and create permission; create initial empty immutable revision |
| `GET /documents?workspaceId=...` | → paginated document summaries | filter by workspace AND ACL server-side |
| `GET /documents/:id?branchId=...` | → metadata, visible elements, branch head | document read authorization; revision/branch belongs to doc |
| `GET /documents/:id/revisions/:revisionId` | → canonical state, schema/engine context and evaluation status | immutable read; validate document ownership of revision |
| `POST /documents/:id/branches/:branchId/previews` | `{baseRevision,command}` → `{previewId,state,diagnostics,expiresAt}` | editor permission, bounded ephemeral job, reject stale base; no source commit |
| `POST /documents/:id/branches/:branchId/commands` | `{baseRevision,idempotencyKey,command}` → `201 {revisionId,evaluationState}` | command-specific schema, authorization, candidate evaluation, CAS; `409` on stale head; duplicate key returns original result only for identical request |
| `GET /documents/:id/revisions/:revisionId/evaluations/:context` | → `{state,diagnostics,artifacts}` | report pending/failed explicitly; artifact IDs only, never raw storage credentials |
| `GET /documents/:id/artifacts/:artifactId` | → authorized stream and content type/checksum | document/revision membership and current grant; bounded sizes; no raw storage path disclosure |
| `POST /documents/:id/branches/:branchId/undo` | `{baseRevision,idempotencyKey,commandId}` → new revision | validate inverse and CAS; `409` when unsafe |
| `POST /documents/:id/versions` | `{revisionId,name}` → immutable version | editor privilege and document-scoped revision |
| Later: branch/merge, comments, grants, export and events | explicit typed schemas, ACLs, quotas and CAS specified before implementation | no future endpoint implied to exist or function now |

Error envelope (proposed): `{ "error": { "code": "STALE_REVISION", "message": "Document has changed", "details": { "currentRevision": "..." }, "requestId": "..." } }`. `400` malformed schema, `401` session required, `403` unauthorized, `404` hidden/not found, `409` revision/idempotency/repair conflict, `422` invalid constraints/geometry/units, `429` quota, `503` unavailable worker. Exact response policy must avoid existence leakage. Geometry errors contain feature IDs and stable reason codes, not native stack traces or other users' data. Rate and resource limits apply to preview, export and compute as well as HTTP.

## Security, reliability and operations

- Treat every document, reference, mesh, job and artifact as tenant-scoped; verify cross-document references and current permissions, prevent IDOR, protect object-store paths and log no raw model data by default. Existing session and CSRF conventions are a baseline, not evidence of CAD security.
- Workers run unprivileged with no arbitrary network egress, per-job CPU/memory/wall-time, input size and output size limits; imports are untrusted, with format allowlists, file scanning/sandboxing and parser patching. Kill and retry crashed jobs without losing committed intent. Reject zip bombs, oversized graphs and cyclic inputs.
- Use transactional outbox, leasing, bounded retries and dead-letter visibility; artifact writes are atomic/checksummed and cleanup is revision/reference aware. Back up PostgreSQL and artifact store consistently; rehearse recovery and verify tenant isolation. Document deletion and retention must handle versions, external links and legal policy.
- Metrics: queue depth, evaluation latency p50/p95/p99 per feature/document class, failure types, worker crashes, artifact misses, undo/conflict rate and permission denial counts; no production SLO until load targets and realistic fixtures are approved. Trace request → job → revision without recording proprietary geometry.
- Accessibility and UX: distinct select/draw/dialog modes, explicit hover/selection/preview/committed state, keyboard command alternatives, screen-reader labels for non-3D controls, touch support only once tested, visible stale/blocked state and cancellation. Never ship an enabled command that only draws a static lookalike or cannot persist and regenerate.
