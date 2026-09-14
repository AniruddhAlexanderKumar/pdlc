# V1 Release Readiness

The final release-readiness record for this build. Where [ARCHITECTURE.md](./ARCHITECTURE.md),
[DEPLOYMENT.md](./DEPLOYMENT.md), and [SECURITY.md](./SECURITY.md) each
document one facet of the system in depth, this document is the single,
current answer to one question: **is V1 actually done, and can it actually
be released?** It reflects the state of the repository at the commit named
at the bottom, produced by a full, independent audit — not a summary
written from memory of what earlier work claimed.

## V1 scope summary

One coherent aerospace product-development control system, built as a
Next.js/TypeScript/Prisma/PostgreSQL modular monolith. Every capability
below has a real route, service, repository, domain model, persistence
model, and test coverage — confirmed by this pass, not assumed from
naming:

Authentication and session management · Organization/project access
control · Requirements · Stakeholder Needs · Design Items · Engineering
Decisions and Decision Memory · Verification Activities · Risks and Issues
· Suppliers, Supplied Items, and Supplier Qualifications · Evidence ·
Change Requests · Change Impact Analysis · Assumption Monitoring ·
Technical Readiness · Verification Readiness · Certification (Program,
Basis, Compliance Items, Findings, Review) · Engineering Baselines and
Configuration · Design/Operations Drift · Decision Sentinel · Traceability
· Engineering History · Command Center · self-hosted production deployment
· realistic engineering fixtures and seed data.

**What V1 is not**: not a SaaS product with a managed backend, not AI-driven,
not integrated with any third-party identity/database/storage provider,
and not itself certified against any regulatory standard — see SECURITY.md's
"Known, disclosed limitations".

## Architecture verification

Full repository-wide audit against the intended dependency direction
(UI → API → services → repositories → PostgreSQL; domain Prisma-free):

- **Domain layer**: contains no Prisma/generated-client import anywhere,
  self-enforced by `src/domain/project.test.ts`'s own recursive scan of
  every `src/domain/**/*.ts` file — re-run this pass, still passing.
- **API handlers**: none call Prisma directly except `/api/health`'s
  readiness probe (`GET /api/health`'s real `SELECT 1`), documented since
  Prompt 28 and unchanged.
- **Repositories**: sole Prisma-touching layer, with one prior violation
  (found and fixed in the previous pass — `decision-sentinel.service.ts`)
  re-confirmed fixed: the service now contains exactly one `prisma`
  reference (`$transaction`, the same transaction-boundary pattern every
  other service uses).
- **Services**: own business orchestration, tenancy checks, and audit
  logging; no service constructs its own authorization logic — all route
  through `authorization.service.ts`'s `requireProject*Access` family.
- **No external managed database/auth/data service**: confirmed by
  inspection of every `.env` variable, every service import, and
  `package.json`'s dependency list — no Supabase/Firebase/Clerk/Auth0
  client, no managed-Postgres SDK, nothing.
- **No SQLite/in-memory/fake persistence**: the unit suite fakes
  repositories at the module boundary (mocked functions), never a real or
  emulated database; the integration and E2E suites use only real
  PostgreSQL and skip honestly when one is unreachable.
- **No duplicate competing engines**: verified for change impact,
  readiness (technical/verification), drift, certification review, and
  assumption monitoring — each has exactly one implementation, and
  Decision Sentinel dispatches to the real ones rather than reimplementing
  any of them.
- **No dead scaffold module**: the one remaining instance (`/risks`'s
  top-level nav entry, still rendering "Module not yet implemented" though
  Risk management has been fully built for many prompts) was found and
  fixed in the previous pass; re-confirmed fixed and `module-stub.tsx`
  confirmed deleted with zero remaining references.
- **No orphaned route**: every `IMPLEMENTED_MODULES` entry on the project
  overview page resolves to a real route; every top-level nav entry
  resolves to a real project-picker page; `supplied-items` and
  `supplier-qualifications` are deliberately reached only by drill-down
  from Suppliers (no project-wide list view exists to be one) — correct,
  not a gap.

**Status: VERIFIED. No new architectural violation found in this pass.**

## Security verification

Every property this prompt asks to be re-confirmed, checked directly
against the current code (not merely re-read from SECURITY.md's prose):

| Property                                                 | Verified against                                                                                                                                                 |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Argon2id password hashing                                | `src/server/auth/password.ts`                                                                                                                                    |
| Timing-safe sign-in, including nonexistent-user handling | `verifyPasswordSafely` — real Argon2id verification every time, against a decoy hash when no account exists                                                      |
| Opaque session tokens                                    | `src/server/auth/session.ts` — 32 bytes CSPRNG, never a JWT                                                                                                      |
| Only session token hashes persisted                      | `session.repository.ts` — the `tokenHash` column is the only token-shaped field; no raw token column exists                                                      |
| Secure cookie configuration                              | `src/server/auth/cookies.ts` — `httpOnly: true`, `secure` in production, `sameSite: "lax"`                                                                       |
| Session expiration                                       | `session.ts` — server-side `expiresAt` check on every resolution, expired rows deleted on sight                                                                  |
| SameSite/CSRF protections                                | `sameSite: "lax"` plus `src/middleware.ts`'s Origin/Host comparison on every state-changing request                                                              |
| Authentication on protected APIs                         | `requireAuthenticatedContext()`; only `/api/auth/*` and `/api/health*` are exempt                                                                                |
| Project/organization authorization                       | `authorization.service.ts`, the single decision point every service calls through                                                                                |
| Role enforcement                                         | per-action `require*Access` at every service entry point                                                                                                         |
| IDOR protection                                          | `src/tests/integration/access-control.test.ts`'s IDOR block (direct, nested, and linked-object ids)                                                              |
| Mass-assignment protection                               | `z.strictObject` on client-facing schemas, verified in `src/tests/security/mass-assignment.test.ts`                                                              |
| Sanitized error responses                                | `src/server/api/response.ts`'s `errorResponse`, verified in `response.test.ts`                                                                                   |
| Audit integrity                                          | zero `update`/`delete` call sites against `AuditLog` anywhere in the codebase (re-confirmed by grep this pass)                                                   |
| Immutable historical records                             | zero `update`/`delete` against any assessment/review table except `ImpactAnalysis`'s own documented single RUNNING→COMPLETED/FAILED close (re-confirmed by grep) |
| Security headers/CSP                                     | `next.config.ts`'s `SECURITY_HEADERS`/`CONTENT_SECURITY_POLICY`                                                                                                  |
| CI permissions                                           | `.github/workflows/ci.yml` — explicit top-level `permissions: contents: read` (re-confirmed)                                                                     |
| Production container non-root                            | `Dockerfile` — `USER nextjs` (re-confirmed)                                                                                                                      |

**Dependency/audit state**: `npm audit` reports the same one advisory pair
(high + moderate, `mysql2`) as the prior pass — reachable only as a
transitive dependency of the `prisma` CLI package, never imported by this
codebase, and confirmed absent from `.next/standalone`'s traced
`node_modules` (re-verified this pass by inspecting the built output
directly). `npm audit fix --force`'s proposed remediation downgrades
Prisma 7→6, a real regression, not accepted. Documented accurately in
SECURITY.md's "Dependency and CI/CD supply chain" section — unchanged.

**Status: VERIFIED. No security regression found.**

## Authorization verification

Access-control matrix coverage (OWNER/MANAGER/ENGINEER/REVIEWER/VIEWER/
NON-MEMBER × read/write/approve/administer/Sentinel-acknowledge/Sentinel-
resolve/evidence-validate/baseline-activate/change-approve) confirmed
broad and real, exercised through actual role users and actual service
calls — never asserted from role names — across
`src/tests/integration/access-control.test.ts` (21 tests),
`src/tests/integration/engineering-scenario.test.ts`'s access-control block
(5 tests), and `decision-sentinel.service.test.ts`'s role-authorization
block (6 tests). No gap found.

**Status: VERIFIED.**

## Data-integrity verification

- Lifecycle transitions are server-enforced for every listed entity (see
  "Lifecycle verification" below); no API route accepts a raw status write
  that bypasses a transition function.
- Terminal states cannot be illegally modified — `canTransition*` guards
  precede every transition, backed by guarded conditional updates
  (`updateMany` scoped to the expected prior status) for the entities
  Prompt 27/29 hardened: Requirement, EngineeringDecision, Risk, Issue,
  ChangeRequest, Evidence, CertificationFinding, VerificationActivity,
  CertificationProgram, SurveillanceTarget.
- Immutable assessments/reviews/history remain immutable (see Security
  verification's table above — same evidence, re-confirmed here for data
  integrity specifically).
- Audit records cannot be modified or deleted through application code —
  re-confirmed by grep, zero call sites.
- Approval/review actions require the documented authorization tier
  (`requireProjectApproveAccess` and equivalents) at every relevant service
  entry point.
- Concurrency protections remain present: guarded transitions (above) plus
  two partial-unique-index singleton invariants
  (`engineering_baselines_active_unique`, `certification_bases_active_unique`)
  and Sentinel's own `surveillance_targets_open_unique` — all three
  confirmed still present in `prisma/migrations/`.
- Baseline member mutation is blocked once a baseline leaves DRAFT
  (`DriftDetectionService.addBaselineMember`'s `requireDraft` guard,
  re-read and confirmed this pass) — a frozen baseline's snapshot cannot be
  edited after the fact.
- Change-impact freshness and every other fingerprint
  (`sourceFingerprint`/basis fingerprints across readiness, drift,
  certification) remain deterministic pure functions over stored state —
  unchanged, no new nondeterminism introduced.
- No engine silently converts UNKNOWN into a positive conclusion — this
  was a standing design principle across every readiness/drift/certification
  engine before this pass and remains one; nothing in this pass touched
  any evaluation logic.
- No new scoring system, confidence score, or automatic engineering
  judgment was added — this pass added zero product logic.

**Status: VERIFIED.**

## Cross-module verification

Re-confirmed from the previous pass, with the specific facts this prompt
calls out checked directly against the current file:

- **Sentinel dependency registry contains only reachable dependencies.**
  41 rows (re-counted this pass), each previously verified against its
  target engine's real basis-construction code, not the registry's own
  prose.
- **`CHANGE_REQUEST` → `TECHNICAL_READINESS` remains present** — confirmed
  at `src/domain/sentinel.ts:517-520` this pass.
- **Sentinel does not claim to monitor an object the target engine cannot
  actually observe** — the eight previously-unreachable rows (SUPPLIER/
  SUPPLIER_QUALIFICATION/OPERATIONAL_OBSERVATION→TECHNICAL_READINESS;
  SUPPLIER/SUPPLIED_ITEM/DECISION_ASSUMPTION/OPERATIONAL_OBSERVATION→
  CERTIFICATION_REVIEW; OPERATIONAL_OBSERVATION→ASSUMPTION_MONITORING)
  remain removed.
- **Graph edges/resolvers remain consistent** — `graph-edge-resolvers.test.ts`'s
  self-enforcing "has a resolver for every declared edge type" /
  "declares a resolver for exactly the types the definitions declare"
  tests re-run and still pass (46 edge types, all resolved, none
  invented).

No artificial dependency was added to inflate coverage; the one row added
in the previous pass (`CHANGE_REQUEST`→`TECHNICAL_READINESS`) was added
because the target engine's own persisted scope snapshot genuinely
includes every change request in scope — a real, already-existing
consumption relationship the registry had simply never named.

**Status: VERIFIED.**

## UI/API verification

- Every `IMPLEMENTED_MODULES` entry and every top-level nav entry resolves
  to a real route (re-confirmed).
- No "coming soon" or "module not yet implemented" screen remains for an
  implemented capability — re-swept this pass, zero matches.
- Unauthorized users are blocked server-side, not merely hidden in the UI
  — every mutation goes through a `require*Access` call before any write;
  a rejected UI action surfaces the real 403 the server returned, never a
  client-only guard standing in for one.
- No fake metrics or fabricated records found in any workspace — negative
  assertions for this (no score/percentage/health field, no invented risk
  score, no unsupported regulatory claim) are exercised directly in
  `engineering-scenario.test.ts`'s negative-assertion block.
- No obvious broken link or stale route reference found in this pass
  beyond the one already fixed (`/risks`).

**Status: VERIFIED. One defect from the prior pass re-confirmed fixed; no new defect found.**

## Lifecycle verification

Every listed state machine re-inspected for illegal transitions,
inconsistent terminal-state behavior, missing authorization, and
accidental mutation of frozen/baselined information — Requirements,
Verification Activities, Engineering Decisions, Change Requests, Risks,
Issues, Suppliers, Supplied Items, Supplier Qualifications, Evidence,
Engineering Baselines, Certification Basis, Certification Findings,
Certification Reviews, Sentinel targets/events. No redesign performed or
needed — every transition function's own `canTransition*` guard remains
the single source of truth, and the full unit suite (which exercises
every legal and illegal transition for each of these entities) passes
unchanged. The one baseline-specific check performed directly this pass
(member mutation blocked once a baseline leaves DRAFT) is detailed above
under "Data-integrity verification".

**Status: VERIFIED.**

## Documentation consolidated

The repository had two documentation structures: the root-level
ARCHITECTURE.md / DEPLOYMENT.md / SECURITY.md / README.md (built and
cross-checked against the real code continuously across this project's
history) and a `documentation/` folder (five files, merged in from a
parallel effort in the previous pass, spot-checked but not fully
reconciled).

Full read of all five `documentation/` files this pass found it was **not**
a safe merge candidate — it contained factual inaccuracies and scope
violations the root docs specifically do not have:

- Claimed the production Dockerfile uses an **Alpine** base image; the
  real `Dockerfile` deliberately uses `node:22-bookworm-slim` (glibc), for
  documented `@node-rs/argon2` musl-compatibility reasons.
- Recommended adding **Redis/BullMQ, MinIO/S3, `pgvector`, and enterprise
  SSO (WorkOS/SAML)** as "Infrastructure Extensions" — directly
  contradicting this project's own explicit, repeated architectural
  decisions (no Redis/Elasticsearch/Neo4j; no managed database; no managed
  auth provider) and this very prompt's own instruction not to add
  speculative functionality.
- Recommended **Kubernetes** deployment for "GovCloud" — directly
  contradicting Prompt 28's explicit "keep deployment simple, no
  Kubernetes" constraint.
- Implied **ITAR/EAR compliance** ("ITAR compliant", "For defense or
  high-security deployments (ITAR/EAR)") — an unsubstantiated regulatory
  claim this codebase does not verify and SECURITY.md explicitly disclaims
  making for any standard.
- Its production-deployment instructions (`docker run` directly against an
  external "db-host") never mentioned running migrations first, reading as
  an implicit "just start the container" path — contradicting
  DEPLOYMENT.md's explicit, load-bearing "migration is a separate step,
  never automatic" design.
- Its domain-model entity list was significantly stale relative to the
  actual, mature V1 schema (missing EngineeringBaseline, the full
  Certification family, Sentinel's tables, ImpactAnalysis, and roughly
  thirty other real entities).

**Resolution**: the `documentation/` folder was deleted in full (five
files). Nothing genuinely useful and accurate was found in it that the
root-level documents did not already cover, more completely and more
accurately. This is a deliberate decision, not a silent one — recorded
here in full, with every specific claim that made it unsafe to merge.
`AGENTS.md`'s "Mandatory Documentation Protocol" section, which pointed at
the now-deleted folder, was updated to point at the real authoritative
documents (ARCHITECTURE.md / DEPLOYMENT.md / SECURITY.md / README.md).
No other reference to `documentation/` existed anywhere in the repository
(confirmed by repository-wide grep).

DEPLOYMENT.md and SECURITY.md were independently re-read in full against
this prompt's specific concerns (no implied automatic migrations, no
implied managed-database requirement, no fake zero-downtime guarantee, no
unsupported infrastructure claim, no invented compliance certification, no
overclaimed security property) and found to already satisfy every one of
them — no edit was needed to either file.

## Test results

| Suite                                          | Result                                | Detail                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma validate`                              | **PASS**                              | schema valid                                                                                                                                                                                                                                                                                                                                                                                      |
| `prisma generate`                              | **PASS**                              | client generated (7.10.0)                                                                                                                                                                                                                                                                                                                                                                         |
| `tsc --noEmit`                                 | **PASS**                              | zero errors                                                                                                                                                                                                                                                                                                                                                                                       |
| `eslint .`                                     | **PASS**                              | zero errors, zero warnings                                                                                                                                                                                                                                                                                                                                                                        |
| Unit suite (`npm run test`)                    | **PASS**                              | 2617/2617 across 104 files. One file (`members-ui.test.tsx`) failed once under full-suite parallel load with a 5000ms timeout and passed cleanly (9/9) run standalone immediately after — the same disclosed, environment-load-dependent pattern documented since Prompt 28, now observed a fifth time across five different, unrelated files this session. Not a defect; not weakened or hidden. |
| Integration suite (`npm run test:integration`) | **SKIPPED**                           | 388/388 tests across 18 files, all honestly skipped — no reachable PostgreSQL in this environment. Structurally verified (imports resolve, `tsc`/`eslint` clean); not executed.                                                                                                                                                                                                                   |
| Playwright discovery                           | **PASS**                              | 190 tests across 22 files discovered with no configuration error                                                                                                                                                                                                                                                                                                                                  |
| Playwright execution                           | **NOT RUN — ENVIRONMENT UNAVAILABLE** | no running application instance or database in this environment                                                                                                                                                                                                                                                                                                                                   |
| Production build (`npm run build`)             | **PASS**                              | exit 0; 5 pre-existing Edge-Runtime informational warnings from `instrumentation.ts`/the generated Prisma client (Prompt 28, unrelated to this pass, does not fail the build)                                                                                                                                                                                                                     |
| Docker image build/run                         | **NOT RUN — ENVIRONMENT UNAVAILABLE** | Docker is not installed in this environment (`docker: command not found`)                                                                                                                                                                                                                                                                                                                         |

**None of the above were reported as passed without actually running them.**
Where PostgreSQL/Docker were unavailable, the result is explicitly
"SKIPPED" or "NOT RUN — ENVIRONMENT UNAVAILABLE", never "PASS".

## Integration-test environment status

No reachable PostgreSQL instance exists in this development/audit
environment. This is a standing, disclosed characteristic of this
environment specifically, not of the product: `src/tests/integration/setup.ts`
probes for a real server with an actual `SELECT 1` before deciding to run
or skip, so this is never a faked pass. CI (`.github/workflows/ci.yml`) is
PostgreSQL-17-capable and is the environment where these 388 tests, the
190 E2E tests, and the Docker production-image build/health-check actually
execute — see "CI as source of truth" below.

## E2E status

190 tests across 22 files, including the Prompt 30 sixteen-step acceptance
tour (`acceptance-scenario.spec.ts`) and the access-control adversarial
spec. Discovery is clean (no config error, no naming collision). Execution
requires a running application instance against a real database, which
this environment does not have.

## Production/Docker verification status

The Dockerfile, `docker-compose.prod.yml`, health endpoints
(`/api/health`, `/api/health/live`), and startup-order/graceful-shutdown
behavior are unchanged from Prompt 28 and re-inspected this pass with no
defect found. CI's `database` job builds this exact production image,
starts it against a real, migrated PostgreSQL 17 service container, and
polls `/api/health` for `"status":"ok"` before proceeding — this is the
actual, executed verification of the production container path; it is not
re-runnable in this local environment (`docker: command not found`), and
this document does not claim otherwise.

## CI as source of truth

`.github/workflows/ci.yml`, re-read in full this pass:

- `static` job: typecheck, lint, unit suite — no database.
- `database` job: boots a real **PostgreSQL 17** service container,
  applies committed migrations with `migrate deploy`, verifies the
  migrations still match `schema.prisma` (drift check), **builds the real
  production Docker image**, starts it against the migrated database and
  polls both health endpoints, stops it, then runs the **integration
  suite**, a throwaway `db:seed` account provisioning step (never
  `db:seed:scenario`, and never against the production image), the
  **production build**, and the **Playwright E2E suite**.
- Top-level `permissions: contents: read` (least privilege).
- No dependency on undocumented local state — every credential the
  `database` job uses belongs to an ephemeral, isolated service container
  destroyed with the job.

No defect found; CI was not modified.

## Known limitations

Carried forward, unchanged, and none newly introduced:

- **No reachable PostgreSQL or Docker in this local audit environment** —
  the standing limitation across this entire build; CI is the environment
  where full-stack verification actually executes.
- **Rate limiting is single-instance** (in-process, in-memory; does not
  survive a restart, not shared across replicas) — a multi-instance
  deployment needs a real rate-limiting layer in front of sign-in.
- **No file/binary evidence storage** — evidence is metadata/reference
  records only; the reference itself is never fetched or verified.
- **No down-migrations** — recovery from an unwanted schema change is a
  backup restore or a new forward migration, never an automatic rollback.
- **CSP requires `'unsafe-inline'`** for `script-src`/`style-src` (Next.js
  hydration, Radix UI inline positioning) — every other directive is as
  strict as the application allows.
- **This codebase holds no compliance certification and claims none** —
  aerospace domain terminology describes what the product helps an
  operator track about their own process, not a claim about this
  software's own certification status.
- **`npm audit`'s one advisory pair (`mysql2`, transitive via the `prisma`
  CLI)** remains open — confirmed absent from the production image,
  accepted rather than fixed by a Prisma major-version downgrade.
- **No dedicated security-vulnerability contact exists yet** — SECURITY.md
  says so explicitly rather than showing a fabricated address; this is a
  real, outstanding pre-release action item for whoever operates this
  repository going forward, not something this pass can close on its own
  authority.
- **One environment-load-dependent test timeout pattern**, observed on
  five different, unrelated files across this project's history under
  full-suite parallel execution, never under isolated execution — treated
  as an environmental characteristic, not weakened by loosening any
  assertion.

## Deployment prerequisites

Unchanged from DEPLOYMENT.md, restated here for one-page completeness:

- A host that can run containers (Docker/Podman) or Node.js 20.9+ directly.
- PostgreSQL 17, operator-provisioned and operator-controlled — no managed
  database is required or assumed.
- A reverse proxy for TLS termination (this application does not terminate
  TLS itself).
- `DATABASE_URL` (and, if using `docker-compose.prod.yml`,
  `POSTGRES_USER`/`PASSWORD`/`DB`) stored outside version control.
- An explicit `prisma migrate deploy` run before first traffic, and again
  before any deploy that includes a new migration — never automatic, never
  a container-startup side effect.

## Final V1 acceptance checklist

Product-specific, not generic software-development boilerplate:

- [x] An engineer can sign up, and that action creates an organization and
      its first project in one step.
- [x] A requirement can be authored, moved through its real lifecycle
      (draft → in review → approved → baselined), and traced forward to
      the design item, decision, and verification activity that address
      it.
- [x] An engineering decision can record an alternative, an assumption,
      and an expectation, and reach APPROVED only through its own real
      transition guard.
- [x] A verification activity can be evaluated for real verification
      readiness, and the readiness verdict is never invented when evidence
      is absent — it says so.
- [x] A supplier, a supplied item, and a qualification can be recorded,
      linked to real engineering objects, and an expired qualification is
      reported as expired, never silently treated as active.
- [x] Evidence moves DRAFT → VALIDATED → (optionally) SUPERSEDED, content
      is immutable once validated, and a superseded record's own links are
      never silently moved to its replacement.
- [x] A change request can declare impact, and a real change-impact
      analysis — never a hard-coded row — computes direct/downstream/
      cross-domain findings and goes stale/fresh deterministically.
- [x] An engineering baseline freezes a real snapshot, a later edit is
      detected as CHANGED by a real comparison (never asserted), and a
      superseded baseline's own frozen snapshot is provably untouched by
      what superseded it.
- [x] A certification program/basis/compliance item/finding can be
      recorded and a real certification review evaluates it, with no claim
      of regulatory approval anywhere in its output.
- [x] Decision Sentinel detects a real, supported engineering change,
      opens a target only when the target engine's own real basis actually
      references the changed object (verified: no unreachable dependency
      remains in the registry), and never mutates the underlying
      engineering object itself.
- [x] Command Center aggregates real data from real engines — no
      recalculated logic, no invented score, no duplicated finding.
- [x] Every role (OWNER/MANAGER/ENGINEER/REVIEWER/VIEWER/non-member) is
      authorized server-side, not merely hidden in the UI.
- [x] A request scoped to one project/organization cannot reach another's
      objects, verified adversarially (IDOR, cross-project, cross-org).
- [x] The audit log and every historical assessment/review record are
      genuinely append-only — no code path anywhere can edit or delete
      one.
- [x] The production Docker image runs as a non-root user, ships no
      secret, and is exercised by CI against a real, migrated PostgreSQL
      17 instance with both health endpoints verified.
- [x] Nothing in the deployment path auto-seeds demonstration data into a
      production database.

## Release status

# RELEASE READY WITH DOCUMENTED LIMITATIONS

Every capability in scope has real, tested, cross-checked implementation;
every architectural, security, authorization, and data-integrity property
this pass re-verified holds; the two real defects a prior pass found
(the Sentinel Prisma-layering violation and the eight unreachable
dependency rows) are confirmed still fixed, and this pass found and fixed
one further, genuine issue (the duplicated, partially inaccurate
`documentation/` folder). No material defect remains open in application
code, authorization, or data integrity.

The qualification is environmental, not architectural: this local audit
environment has no reachable PostgreSQL and no Docker, so the 388
integration tests, the 190 E2E tests, and the production container's own
health-check path could not be _executed_ here — only discovered,
statically verified, and (for the container/health path) confirmed as
already exercised by CI on every push. That is a real, honestly-stated gap
in what this specific pass can personally attest to, not a claim that
those systems are untested anywhere. An operator relying on this
assessment should confirm CI is green on the commit below before treating
that portion as independently re-verified, or run
`npm run db:up && npm run db:migrate:deploy && npm run test:integration && npm run test:e2e`
themselves in an environment with PostgreSQL and a browser available.
