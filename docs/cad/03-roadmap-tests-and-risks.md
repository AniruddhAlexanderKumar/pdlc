# Roadmap, verification and risk register

All stages below are proposals. The current deliverable is research; **no application code before the research and architecture are reviewed and explicitly approved**. No fixed dates or feature-parity claim are credible before a kernel/solver proof of feasibility, staffed ownership and measured workload. Each stage requires a working integrated slice and tests; split a stage into smaller independently accepted pull requests. Do not expose unfinished commands, unsupported modes or pretend generated meshes are editable parametric solids.

## Staged roadmap and exit gates

### Stage 0 — discovery, approval and feasibility

- Review this research, conduct documented legitimate hands-on product research where useful, and resolve gaps in [inventory](01-research-and-inventory.md). Agree supported users/use cases, security boundary, priority, legally permissible libraries, deployment platform and explicit non-goals.
- Obtain legal and security review for kernel, solver and imports. Spike candidate OCCT builds and solver on representative cases without integrating into the app; measure numerical quality, scalability, crash containment, licenses and browser/server consistency. A spike is not a released feature and starts only after the user reviews the research package.
- **Exit:** recorded approval, dependency-license review, reproducible proof-of-feasibility, owned benchmarks and signed-off Stage 1 backlog. Fail the gate if solver/kernel cannot meet requirements; do not paper over the gap with meshes.

### Stage 1 — foundation, documents and viewport

- Add authenticated, workspace-scoped document/branch/revision foundation with durable empty documents, ACL checks, migrations and recovery; fit within existing React/Express/Kysely conventions. Basic tree, document navigation, selection model, camera orbit/pan/zoom/fit, orthographic presets and labelled coordinate axes.
- Introduce worker isolation and a render pipeline; use **real** geometry only when supplied by a tested kernel or supported genuine import. If no geometry is available, an honest empty viewport is acceptable. No primitive shaped as an editable parametric solid without its real source and kernel result.
- **Exit:** create/rename/open/reopen empty documents, cross-tenant denial, persistence after restart, responsive/accessible controls, tested camera and real selection for any supported real geometry, worker failure handling and no bogus feature buttons.

### Stage 2 — sketches, constraints, extrude, revolve and history

- Start with a plane, rectangle built from persistent lines/points, horizontal/vertical/coincident constraints and driving dimensions. Add circle/line/arc and further constraints only with matching solver coverage. Display under/fully/conflicted status and stop on invalid input.
- Generate a genuine B-rep solid by blind extrude of a valid supported profile; add revolve with a real axis after its full tests. Implement history, preview/cancel, typed references, undo/redo and dependency-aware reevaluation. Extend regions and modes incrementally; surface/thin/add/remove/intersect are not implied by a basic extrusion.
- **Exit:** the user can create a fully constrained 10 mm × 20 mm rectangle, extrude 5 mm, save, reopen, change 10 to 12 mm and get a validated 12 × 20 × 5 mm B-rep; correct volume changes 1000 → 1200 mm³ and downstream render/selection match. Undo/redo and a conflicted constraint are handled safely; round-trip works after server/worker restart. Revolve also passes a separate analytic oracle before claimed.

### Stage 3 — advanced part modeling

- Expand reference geometry, multi-body scopes and kernel features in independently gated increments: Boolean, fillet/chamfer, shell, draft, sweep/loft, pattern/mirror, holes and supported direct edits, then surfaces. Each ships with typed reference provenance, preview, edit, persistence, error and regression tests.
- **Exit:** representative multi-feature solids survive expected upstream edits; split/deleted topology is diagnosed instead of silently rebound; analytic geometry and B-rep validity tests pass. Clearly enumerate unsupported options.

### Stage 4 — assemblies

- Create instances from explicitly versioned parts, transforms and connector frames; solve fastened then selected motion mates with limits. Add subassemblies, interference, relations and motion only after each has independent solver/geometry coverage.
- **Exit:** grounded two-part assembly reloads identically, fastened and one supported 1-DOF mate solve correctly; conflicting mates and source changes are reported; access is checked on referenced documents. No dynamics or collision-free motion claim.

### Stage 5 — drawings

- Build model-derived views and managed sheets, revision pins, projection and annotation pipelines. First offer one tested projection before section/detail views or tolerance automation. Explicit stale/broken markers and a single-editor lease are acceptable initially.
- **Exit:** known geometry generates correctly scaled views and PDF/appropriate export; editable annotations persist, source update is detectable, stale/invalid views cannot be presented as current. Feature coverage is stated precisely.

### Stage 6 — collaboration and version control

- Immutable versions, branch heads, comments and history, event stream/presence; extend from serialized commands to tested multi-user workflows. Provide explicit branch diff/conflict resolution only where semantics are designed. Sharing is tenant- and document-authorized, not permission by URL alone.
- **Exit:** concurrent tests show no lost committed updates, stale commands return conflicts, reconnect replays authorized events and revoked users cannot keep streaming/downloading. Merge, if offered, has atomic CAS, audit and deterministic conflict behavior; no promise of Onshape's exact merge semantics.

### Stage 7 — advanced capabilities

- Assess sheet metal, advanced surfaces, configurations, external interchange, feature scripting, simulation, large assemblies and other integrations as separate products with their own design, legal and security review. No sandboxed scripting or analysis is safe merely because it is called advanced.
- **Exit:** each enabled capability has its own specification, validation corpus, operational limits and verified end-to-end behavior. Nothing is enabled solely to match a checklist.

## Verification strategy

### Test layers

| Layer | Required examples and oracles |
|---|---|
| Domain/schema | finite numbers/units, valid reference types, duplicate IDs, unsupported feature versions, graph acyclicity and deterministic serialization. Fuzz expressions without executing arbitrary code. |
| Sketch solver | coincident/horizontal/vertical/parallel/perpendicular/equal/tangent, dimensions, under/fully constrained DOF, redundant vs contradictory constraints, degenerate and singular geometry, solver timeouts, small/large coordinate scales. Verify numeric residuals independently, not only displayed status. |
| Geometry/kernel | analytic volumes, bounding boxes, face counts where stable, manifold/closedness, toleranced edge/face validity, self-intersections and failure diagnostics. Compare B-rep geometry independent of tessellation. |
| Topology/regeneration | downstream references survive supported benign edits; deletion, face splitting, merging and symmetric ambiguous candidates raise explicit repair state. Reordering/cycles, suppression, rollback and dependent failure. No rebind based on mesh index. |
| API/DB | typed payloads, authorization, CSRF, IDOR, cross-workspace references, schema migration round trips, transactional revision/CAS, idempotency, undo conflict, backup and recovery. |
| End-to-end | actual browser input → server persistence → worker → mesh and feature list → edit → regen → reload. Cancel preview makes no persistent change; offline/reconnect is explicit; multiple viewport sizes and keyboard-only non-3D operations. |
| Concurrency | simultaneous same-base commands, retries, head-change during evaluation, revocation during work, worker crash/restart, duplicate outbox delivery, stale evaluation publication, safe undo and permission-scoped event replay. |
| Interchange | supported STEP/STL round trip geometry/unit checks and declared loss of parametric history; malformed/untrusted imports, out-of-range and huge inputs, scan/size limits. |
| Security | object-level cross-tenant reads/writes/events/artifacts/imports/export, revoked permissions, guessed IDs, worker resource limits, parser sandbox, path traversal, private caching and log redaction. |
| Operations | process crash, partial artifact write, checksum mismatch, lease expiry, outbox retry, backup restore, pinned engine upgrade/replay and orphan cleanup. |
| Performance | benchmark representative bounded corpus with p50/p95/p99, memory, CPU, queue length, first load and cancellation latency. Agree thresholds only after sample size and environment are defined. |

### Concrete analytical test examples

1. **Extrusion:** rectangular profile 10 × 20 mm, blind depth 5 mm, expected bounding extents 10, 20, 5 mm and volume 1000 mm³; change width to 12 mm gives 1200 mm³, with current revision mesh mapped to the new B-rep. Test save/reopen, feature undo/redo and independent volume measurement. Units/tolerances must be explicit.
2. **Revolution:** closed radial/axial rectangle from radius 2 to 3 mm and axial length 2 mm, revolved 360° about its axial line, produces volume `π(3²−2²)×2 = 10π mm³`; also verify B-rep is valid. This checks a hollow cylindrical body rather than a mesh approximation.
3. **Constraint conflict:** constrain a line to length 10 mm, attempt an incompatible driving 12 mm dimension on the same line. Assert explicit conflict, no committed mutation, and original 10 mm geometry intact. Test a redundant compatible constraint separately without falsely calling it inconsistent.
4. **Topology ambiguity:** construct a feature that references one generated face, then apply an upstream change that splits/removes it. Expected behavior is a correct uniquely justified provenance mapping or a broken/ambiguous diagnostic; asserting a stable numeric face index alone is insufficient.
5. **CAS:** two authorized clients submit distinct commands at the same base. Exactly one can advance that head; the other receives a conflict or must explicitly rebase/retry after validation. Duplicate retries with the same idempotency key and same body return the same result; different body is rejected.
6. **Failure isolation:** kill a worker during regeneration; committed source remains readable, the evaluation has no falsely successful artifact, and retry only publishes for its matching revision/context. Repeat after an access revocation and assert no further artifact/event access.

Test oracles are proposed, not results already achieved. Numerical tolerances must be chosen based on units, model scale, kernel behavior and precision requirements; assertions should use combined absolute/relative tolerances and record the chosen threshold. Geometry differential tests can compare with independently derived analytic answers and legally available tools, but agreement with a second tool alone does not prove correctness.

## Risk register

| Risk | Consequence | Mitigation / gate | Residual uncertainty |
|---|---|---|---|
| Solver license or incomplete constraint coverage | Cannot ship or preserve requested edit semantics | Legal review plus a tested solver compatibility matrix before adoption; implement no fake full-constraint state | Selected solver and obligations unknown |
| B-rep algorithm robustness | Invalid shapes, crash, wrong dimensions | Isolated native workers, validity checks, tolerance corpus and robust failure messages | Pathological geometries still require support limits |
| Persistent topology naming | Wrong face picked after upstream edit | Provenance maps, type checks, explicit ambiguity, repair UI | No general guarantee that every reference survives |
| Kernel/compiler/solver upgrade | Model changes silently on replay | Pin context; differential replay, snapshot/upgrade policy, preserve prior artifacts/context | Exact cross-platform determinism unknown |
| Concurrency | Lost update, stale preview, unsafe undo | Revision CAS, idempotency, transactional outbox, explicit conflict, versioned artifact publication | Complex merges deferred |
| Tenant isolation | Proprietary designs leak | Object-level authorization on all endpoints/events/artifacts, scoped workers, adversarial tests and audits | External sharing model not yet approved |
| Resource exhaustion / malicious imports | Service outage or data breach | Worker sandbox, input/output/memory/CPU/time quotas, allowlists, rate limits and recovery | Deployment details and parser CVEs need ongoing review |
| Cost and latency | Unusable cloud system | Representative load benchmarks, caching and bounded previews; set targets after profiling | Hosting/size/volume not specified |
| Legal/IP | License violation or proprietary copying | Public behavior research only, original design and code, notices, independent legal review | Counsel decision pending |
| Product expectations | Users mistake prototype for certified CAD | Accurate stage/feature labels, non-goals, blocked controls absent; publish limitations | Engineering use cases need owner agreement |
| Drawings and interchange | Stale or lossy engineering deliverables | Revision pins, stale markers, no implicit associativity, loss warnings | Standards/projection conventions and export scope unchosen |

## Remaining review and research work

- Confirm public documentation for every specific operation/mate/drawing/view/import/export option desired and record date, product edition and exact verified behavior; conduct legitimate hands-on workflows where access is available. Pay special attention to errors, undo, multi-user conflict and upstream reference changes.
- Agree dimensional standards, scale range, precision, performance workloads, accessibility targets and browser/platform support; define acceptance thresholds from measurements rather than inventing them.
- Obtain legal sign-off on all selected artifacts and user-content handling. Decide data residency, backups, retention, deployment isolation and a suitable compute budget.
- Choose solver and kernel versions from measured feasibility studies; resolve feature-commit failure policy and historical engine upgrade policy.
- Review/approve Stage 1 scope and Stage 2 initial profile/constraint limits before writing application code. The roadmap is not an authorization to implement later stages automatically.
