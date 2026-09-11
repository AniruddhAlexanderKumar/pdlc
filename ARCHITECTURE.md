# Architecture

Foundation and domain model for the PDLC platform. Modular monolith — no
services, queues, or external infra beyond PostgreSQL.

## Stack

Next.js 16 (App Router, RSC) · TypeScript (strict) · Tailwind CSS v4 · Prisma 7 +
PostgreSQL (via `@prisma/adapter-pg`) · Zod · Vitest + React Testing Library ·
Playwright (smoke test).

## Layering

```
UI (src/app, src/components)
  → route handlers (src/app/api)          HTTP only: parse, delegate, translate errors
    → application services (src/server/services)   rules, tenancy, transactions, audit
      → repositories (src/server/repositories)     persistence, returns domain entities
        → domain model (src/domain)                types, enums, validation — no Prisma
          → persistence (src/lib/db.ts → Prisma → PostgreSQL)
```

UI components never import Prisma. Route handlers contain no queries.
Repositories are the only place where domain concepts and generated
persistence types meet.

## Core domain entities

The system records a connected engineering history, not a set of independent
lists. The canonical entities are:

| Entity | Purpose |
| --- | --- |
| `Organization`, `User` | Tenancy and attribution |
| `Project` | A program; every artifact is scoped to exactly one |
| `StakeholderNeed` | Originating need or problem a requirement answers |
| `Requirement` | Formal requirement: statement, rationale, status, priority, owner |
| `EngineeringDecision` | Decision with rationale, alternatives, assumptions |
| `DesignItem` | System / subsystem / assembly / component / software element |
| `InterfaceDefinition` | Interface between design elements |
| `VerificationActivity` | Planned or executed verification, with method and outcome |
| `Risk`, `Issue` | Engineering risk register and open problems |
| `ChangeRequest` | Proposed change, with the artifacts it affects |
| `Approval` | Approval/rejection recorded against one artifact |
| `Evidence` | External supporting artifact (document, test result, analysis) |
| `AuditLog` | Append-only event stream (preserved from the foundation) |

Artifacts carry a human-facing `identifier` ("REQ-001") that is unique **per
project** — identity is the (project, identifier) pair, never the string alone.

## Relationship strategy

Traceability lives in explicit relationship tables, so every edge is queryable
and carries its own provenance (`createdAt`, `createdById`, and a `note` where
the link encodes an engineering judgement). Two shapes are used:

1. **Fixed-endpoint links** — both ends are known types, so each pair gets its
   own join table: need→requirement, requirement→requirement, requirement→design,
   requirement→verification, requirement↔decision, decision→design/risk/issue,
   design→design, design→interface, risk→requirement/design,
   issue→requirement/design.

   Requirement↔decision is deliberately **one** table with a direction marker
   rather than two mirrored tables; the two directions are the same edge read
   from opposite ends.

2. **Varying-endpoint links** — `ChangeRequestImpact`, `EvidenceLink` and
   `Approval` attach to one of several artifact types. These use **one real,
   nullable foreign key per type** plus a CHECK constraint that exactly one is
   set — not an opaque `entityType`/`entityId` pair. The database therefore
   still enforces that the referenced artifact exists. The domain sees a tagged
   `{ type, id }` union; repositories translate.

   `AuditLog` does use `entityType`/`entityId`, which is appropriate there: it
   is an append-only event log, not a traceability relationship.

Each link table has a unique constraint on its endpoints (idempotent linking)
and a reverse index, so the graph can be walked from either end.

## Domain / persistence separation

`src/domain` is plain TypeScript and Zod with **zero** Prisma imports — a test
enforces this by scanning the directory. It holds entity types, enums (as value
lists + union types + Zod schemas), identifier rules, and input validation.

`src/server/repositories/mappers.ts` is the single seam. Assigning a Prisma enum
column to a domain union only compiles while the two agree, so schema/domain
drift becomes a build failure instead of a runtime surprise.

Validation schemas live next to the repository that uses them; entities without
an application service yet are types only, so no unused validation is shipped.

## Repository pattern

Explicit repositories, no generic base class: `project`, `requirement`,
`engineering-decision`, `change-request`. Each validates input through
`parseOrThrow` (Zod → `ValidationError`), returns domain entities, and
translates Prisma constraint violations into domain errors (`ConflictError` for
a duplicate identifier). Prisma query shapes never leak past this layer.

## Application services

Explicit services, no generic factory. `ProjectService` is the built example
and the pattern later entities follow. A service owns what is neither domain
shape nor storage detail:

- **Input contracts.** `createProjectRequestSchema` / `updateProjectRequestSchema`
  are `z.strictObject`, so a caller sending `organizationId`, `status`, `id` or
  `createdAt` gets a 400 rather than having it silently dropped. Identity comes
  from context; status changes only through the archive transition; timestamps
  are database-generated.
- **State rules.** An archived project is a closed record: updating it, or
  re-archiving it, is a `ConflictError`. Archiving never deletes.
- **Orchestration.** Validation, existence checks, persistence, and audit in
  one place. Route handlers pass raw input straight through, so validation is
  never restated per endpoint.

## API layer

REST route handlers under `src/app/api`. Each handler resolves the request
context, calls a service, and hands the result to `src/server/api/response.ts`.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/projects` | List the organization's projects, newest first |
| `POST /api/projects` | Create (201) |
| `GET /api/projects/[projectId]` | Fetch one, scoped to the organization |
| `PATCH /api/projects/[projectId]` | Update name and/or description |
| `POST /api/projects/[projectId]/archive` | Transition to ARCHIVED |
| `GET|POST /api/projects/[id]/requirements` | List (optional `?status=`) / create |
| `GET|PATCH /api/projects/[id]/requirements/[rid]` | Detail (owner, links, transitions, history) / content update |
| `POST …/requirements/[rid]/transition` | The only path that changes status |
| `POST …/requirements/[rid]/owner` | Assign or clear the owner |
| `GET|POST|DELETE …/requirements/[rid]/links` | Typed traceability edges |
| `GET /api/projects/[id]/link-targets` | Read-only lookup for the link selectors |
| `GET /api/organization/members` | Owner selector; id, name, email only |
| `GET\|POST /api/projects/[id]/stakeholder-needs` | List / create |
| `GET\|PATCH …/stakeholder-needs/[needId]` | Detail (derived requirements, history) / update |
| `GET\|POST /api/projects/[id]/design-items` | List / create |
| `GET\|PATCH …/design-items/[designItemId]` | Detail (allocations, decisions, history) / update |
| `POST …/design-items/[designItemId]/owner` | Assign or clear the owner |
| `GET\|POST /api/projects/[id]/verification-activities` | List / create (always PLANNED) |
| `GET\|PATCH …/verification-activities/[activityId]` | Detail (transitions, evidence, history) / update plan |
| `POST …/verification-activities/[activityId]/transition` | The only path that changes status |
| `POST …/verification-activities/[activityId]/owner` | Assign or clear the owner |
| `GET\|POST /api/projects/[id]/decisions` | List (`?status=`) / create (always PROPOSED) |
| `GET\|PATCH …/decisions/[decisionId]` | Full decision memory / content update |
| `POST …/decisions/[decisionId]/transition` | The only path that changes status |
| `POST …/decisions/[decisionId]/owner` | Assign or clear the owner |
| `GET\|POST …/decisions/[id]/alternatives` + `PATCH\|DELETE …/[alternativeId]` | Alternatives considered |
| `GET\|POST …/decisions/[id]/assumptions` + `PATCH\|DELETE …/[assumptionId]` | Assumptions and their status |
| `GET\|PUT\|DELETE …/decisions/[id]/expectation` | The single expected outcome |
| `GET\|POST\|DELETE …/decisions/[id]/links` | Typed traceability and evidence |
| `GET /api/projects/[id]/decision-link-targets` | Read-only selector lookup |
| `GET\|POST /api/projects/[id]/changes` | List (`?status=`, newest first) / raise (always DRAFT) |
| `GET\|PATCH …/changes/[changeId]` | Detail (declared impacts, transitions, history) / definition update |
| `POST …/changes/[changeId]/transition` | The only path that changes status |
| `GET\|POST …/changes/[changeId]/impacts` | Declared impacts — list / declare |
| `DELETE …/changes/[changeId]/impacts/[impactId]` | Withdraw a declared impact |
| `GET /api/projects/[id]/change-impact-targets` | Read-only selector lookup |
| `POST\|GET …/changes/[changeId]/impact-analysis` | Run an analysis (201) / list run history |
| `GET …/changes/[changeId]/impact-analysis/latest` | Latest run, with derived freshness |
| `GET /api/projects/[id]/impact-analyses/[analysisId]` | One analysis in full |

Status codes come from the error hierarchy rather than being restated at each
call site: `ValidationError` → 400, `NotFoundError` → 404, `ConflictError` →
409, anything unrecognized → logged server-side and returned as a generic 500.
Responses use `{ project }` / `{ projects }`, errors `{ error: { code, message } }`.
All project routes are `force-dynamic` — they read the database per request and
must never be prerendered.

## Authentication

Self-hosted and database-backed. No third-party identity or backend platform is
involved: user records, password hashes, sessions and organization membership
all live in our PostgreSQL database, and no credential or customer engineering
data is sent anywhere else. The only external code in the path is
`@node-rs/argon2`, an open-source hashing library running in our own process.

**Request flow**

```
browser  ──HttpOnly cookie (opaque token)──▶  middleware (cheap: cookie present? origin ok?)
                                              │
                                              ▼
                          getAuthenticatedContext()   ← the one place this happens
                          sha256(token) ─▶ sessions row ─▶ user ─▶ organization
                                              │
                                              ▼
                                    AuthenticatedContext
                                              │
                        ProjectService ──▶ repository (organization-scoped) ──▶ Prisma
```

**Passwords.** Argon2id (19 MiB, t=2, p=1 — OWASP's recommendation), salted per
hash, stored as a PHC string in `user_credentials` so the parameters travel
with the hash and can be raised later. Credentials are a separate table from
`users`, so an ordinary user read cannot accidentally load a password hash. A
minimum length of 12 is the only rule; composition requirements were rejected
as security theatre.

**Sessions.** 32 bytes of CSPRNG output, not a JWT and not a UUID. The database
stores only `sha256(token)`, so a leaked dump yields no usable cookies. SHA-256
rather than Argon2 is deliberate: the token is already full-entropy, so there
is nothing to brute-force, and this lookup runs on every request. Lifetime is
finite (`SESSION_TTL_DAYS`, default 30) and expiry is checked server-side
against the stored `expiresAt` — the cookie's own lifetime is never trusted.
Expired rows are deleted on sight. Sign-out deletes the row, so invalidation is
real rather than a client-side cookie wipe.

**Cookie.** `HttpOnly` (an XSS bug cannot read the token), `Secure` outside
development, `SameSite=Lax`, `Path=/`, explicit expiry. Nothing is kept in
localStorage, sessionStorage, React state or the URL.

**Session-only tenancy.** `AuthenticatedContext` structurally satisfies
`OrganizationContext`, so services take it directly and `organizationId` can
only ever originate from a resolved session. Request bodies are parsed with
`z.strictObject`, so a client that sends `organizationId` gets a 400 rather
than having it honoured or quietly dropped. Audit events take their actor and
organization from the same context, so an API caller cannot spoof another
actor.

**Separation.** Authentication knows nothing about the PDLC domain, and the
domain knows nothing about authentication: `src/domain` holds only the request
schemas and the safe identity shape, with no session or credential concepts and
no Prisma. Route handlers deal in HTTP and cookies; the auth service deals in
identity; neither reaches into the other's layer.

**CSRF.** `SameSite=Lax` is the primary defence — the session cookie is not
attached to cross-site POSTs at all. A second layer lives centrally in
`src/middleware.ts`: any state-changing `/api` request whose `Origin` disagrees
with its `Host` is rejected with 403. A request with no `Origin` is allowed,
because browsers always attach one to cross-site state-changing fetches, so its
absence means the caller is not a cross-site browser context. No token
framework was introduced for this.

**Rate limiting.** `src/server/auth/rate-limit.ts` throttles repeated failed
sign-ins per email, in memory, per process. That is genuinely all it is: it
does not survive a restart and is not shared between instances. **A
multi-instance deployment must place a real rate-limiting layer in front of
`/api/auth/sign-in`.** No Redis was added for this.

**Not implemented:** SSO, OAuth, MFA, password reset, email verification,
invitations, organization switching, RBAC beyond the coarse `UserRole` column.
Expired session rows are deleted when encountered but nothing sweeps them on a
schedule yet (`deleteExpiredSessions` exists for when something does).

## Tenancy boundary

Every project operation is scoped by `organizationId`, and the scoping lives in
the *query* (`findProjectInOrganization`), not in a post-fetch comparison — a
project in another organization simply does not match. A project the caller
cannot see returns 404, never 403, so the API does not confirm the existence of
records outside the tenancy.

Access control has two layers, and only one is authoritative. Middleware
redirects a cookie-less visitor away from workspace routes, which is a UX
shortcut and proves nothing. The real check is server-side: the workspace
layout resolves the session before any page renders, and every API route calls
`requireAuthenticatedContext()`. Unauthenticated page access redirects to
`/sign-in`; unauthenticated API access returns a 401 JSON error.

## Requirements

The first real engineering workflow, and the pattern the remaining PDLC
modules follow. Requirements are scoped to a project, which is itself scoped to
the session's organization — so `requireProject()` runs first in every service
operation, and no requirement query ever executes against a project the caller
has not been shown to own.

**Lifecycle.** `REQUIREMENT_TRANSITIONS` in `src/domain/requirement.ts` is a
deterministic table: DRAFT → IN_REVIEW → APPROVED → BASELINED, with OBSOLETE
reachable from any live state and terminal. A requirement cannot jump from
DRAFT to APPROVED, because the intermediate states are where review actually
happens. Status changes only through `POST .../transition`; the PATCH contract
has no `status` field at all, so a content update cannot move a requirement
through its lifecycle even by accident. An illegal move is a 409 that names
what would have been allowed.

**Editability** is derived from status and enforced server-side, independently
of what the UI offers: content is editable in DRAFT and IN_REVIEW only (editing
approved text would silently invalidate the approval); ownership stays
assignable through APPROVED because stewardship is bookkeeping, not a change to
what the requirement says; BASELINED and OBSOLETE are frozen.

**Traceability** uses the existing typed join tables — stakeholder needs,
design items, verification activities and engineering decisions. The API takes
a discriminated union on `relation`, *not* an `entityType + entityId` pair:
each variant names one real table with its own foreign key and its own valid
link types, and each carries exactly the metadata its table can store (the
stakeholder-need edge has no note column, so a note is rejected rather than
dropped). Every target is checked to exist *in the same project* against its
own table before the edge is written, so a cross-project link is impossible.
The authenticated actor is recorded as `createdById`.

**Owners** must be members of the session's organization, checked against
`isMemberOfOrganization`; an id from anywhere else is a 400. The owner selector
reads `GET /api/organization/members`, which returns id, name and email only.

**Audit.** Creation, content update, status transition, owner assign/clear and
link add/remove each write an `AuditLog` row in the same transaction as the
mutation, attributed to the session actor and organization. The detail endpoint
returns that history, organization-scoped, for the requirement's History panel.

## Foundational artifact modules

Stakeholder needs, design items and verification activities — the three things
a requirement traces to. Each is a full vertical slice (domain → service →
repository → API → UI) but deliberately smaller than Requirements: they exist
so traceability has real objects at the other end, not to carry comparable
process weight.

All three share the non-negotiables: `requireProjectInOrganization` first (one
implementation, in `src/server/services/project-scope.ts`, so this security
boundary cannot drift between services), identifiers unique per project,
`strictObject` request contracts, and an audit event committed in the same
transaction as every mutation.

Where they differ is deliberate:

- **Stakeholder needs** have no lifecycle gate and no owner. Accepting or
  rejecting a need is one editorial act, so status is an ordinary PATCH field —
  a transition endpoint would be ceremony without meaning.
- **Design items** have an owner (organization-checked, with its own audited
  endpoint) but a descriptive status, since a design item's state is a label
  rather than a governed sequence. Hierarchy edges exist in the schema but no
  interface manages them, and the detail page says so instead of drawing an
  empty tree.
- **Verification activities** have a real lifecycle:
  `PLANNED → IN_PROGRESS → PASSED | FAILED`, with `WAIVED` reachable while the
  activity is still open. **All three outcomes are terminal.** An outcome is a
  statement about one execution, so `FAILED → PASSED` is refused: re-verifying
  means planning a new activity, not rewriting an old verdict. The transition
  that reaches an outcome stamps `completedDate` from the server clock, and
  neither status nor `completedDate` is a PATCH field, so they cannot disagree.

**Dates.** `plannedDate` is entered as a calendar date and stored as an
instant, read as UTC midnight — the same convention `formatIsoDate` renders
back, so a date does not shift between entry and display.

**Reverse traceability.** Each detail page lists the requirements pointing at
it, read from the same link tables the requirement module writes. Those views
are read-only: edges are created and removed from a requirement's own
traceability panel, so there is one place that edits a link. Design items and
verification activities also surface any decisions or evidence already in the
database — read-only, since neither module exists yet — and show nothing at all
when there are none.

## Decision memory

A decision is a first-class engineering object, not a note. Its value is not
the sentence describing it but the ability to reconstruct, years later, *why*
it was made — so the reasoning around it is stored as structured records
rather than prose:

- **Alternatives** (`DecisionAlternative`) — options weighed and rejected, each
  with its reason. A paragraph cannot be counted, linked or revisited; a row
  can.
- **Assumptions** (`DecisionAssumption`) — what had to be true. Addressable in
  their own right, with an explicit status. **`UNKNOWN` is the default and the
  honest one**: recording an assumption is not the same as having checked it.
  `VALIDATED` / `INVALIDATED` are only ever set by a person. Nothing in this
  build infers or monitors them.
- **Expectation** (`DecisionExpectation`, 1:1) — what was expected, and what
  was later observed, in **separate columns**. Recording an outcome never
  overwrites the prediction, and the system never compares them: supplying an
  `actualValue` does not mark an expectation `HELD`. That judgement is a
  person's.

The legacy `alternativesConsidered` / `assumptions` text columns remain in the
schema so existing rows survive, but the structured records are authoritative:
the detail response strips those columns at runtime, and no write path
populates them. One source of truth, not two.

**Evidence and traceability** reuse the existing typed join tables — a decision
links to requirements, design items, risks, issues and evidence through
`RequirementDecisionLink`, `DecisionDesignLink`, `DecisionRiskLink`,
`DecisionIssueLink` and `EvidenceLink`. The API takes a discriminated union on
`relation`, never an `entityType + entityId` pair, and every target is checked
to exist *in the same project* before an edge is written. Requirement and
design-item pages read the same edges from their side; there is one
relationship store, not two.

**History** is the existing `AuditLog`. Creation, content update, transition,
owner change, and every alternative, assumption, expectation and link mutation
writes an event in the same transaction as the change itself, attributed to
the session actor. The detail page renders a short readable summary from known
metadata keys — never raw JSON.

**Why the structure matters.** Because these are rows rather than prose, a
later surveillance layer can watch assumptions by status, and a change-impact
engine can traverse decision edges, without re-parsing text. That work is not
built; this is the shape it will need.

## Change requests

A change request is a **first-class engineering event**, not a ticket. It records
that some part of the product's engineering state or basis is proposed to alter:
what is changing, why, who asked, when, and what they believe it touches.

It is deliberately not an engineering decision. A decision answers "what choice
are we adopting, and why"; a change answers "what existing engineering state are
we proposing to alter". A change may later produce or invalidate a decision, but
nothing here creates one automatically — inferring a decision from a change would
put words in an engineer's mouth.

### Declared impact vs computed impact

This is the distinction the whole module is built around, and it exists in the
type names, the API, and the UI headings — not just in prose.

- **Declared impact** — what an engineer *asserted* this change affects. A human
  claim, recorded as a `ChangeRequestImpact` row with its author and the reason
  they gave. It is not evidence that the artifact is actually affected, and not a
  claim that the list is complete.
- **Computed impact** — what traversing the engineering graph from the change
  *implies* is affected. **Not implemented.** No count, no blast radius, no
  score, and no placeholder card that resembles a result.

The change detail page states this plainly in a "Computed impact" section whose
only content is that nothing has been computed. That section is asserted in the
unit tests to contain no digits at all, because a single stray number there would
read as a finding.

Keeping the two separable is the point. When the impact engine arrives it must be
able to compare its derivation against what a person believed — which requires
knowing which is which. A UI that blurred them would make it impossible to tell
what an engineer knew from what the system worked out, and an engine trained to
trust its own output as ground truth is worse than no engine.

### Lifecycle

```
DRAFT ──▶ SUBMITTED ──▶ UNDER_REVIEW ──┬──▶ APPROVED ──▶ IMPLEMENTED
  │           │              │         └──▶ REJECTED
  └───────────┴──────────────┴──▶ CANCELLED
```

Approval is reachable **only** from review. No path skips that step, so a change
that alters the engineering basis cannot be approved without having been looked
at. `REJECTED`, `IMPLEMENTED` and `CANCELLED` are terminal — a rejected change is
not quietly reopened and approved later; a new change request is raised, so the
record of what was refused survives.

Status moves only through `POST …/transition`. The update contract has **no
status field at all**, so an ordinary PATCH cannot advance a change — this is
enforced by the schema shape rather than by a guard someone can forget.

### Editability

Two rules, not a configuration system:

- **The definition** (title, description, reason) is editable in `DRAFT` and
  `SUBMITTED`, frozen from review onward. A change already in front of a reviewer
  must not silently become a different change; otherwise the thing approved is
  not the thing examined.
- **The declared scope** stays editable through `UNDER_REVIEW` and freezes at
  approval. Deliberately wider than the definition: getting the declared scope
  right is much of what a review is *for* — a reviewer saying "this also touches
  the thermal interface" is the process working, not the change mutating.

The project and identifier are editable in no state at all, which is why no
update contract carries them rather than guarding them per status.

### Requester identity

`requestedById` comes from the authenticated session and from nowhere else. The
create contract is a `strictObject` with no such field, so a client that sends one
is **rejected outright** rather than having it silently dropped — a silent drop
hides an attempt worth failing loudly on. Membership needs no separate check: the
session binds actor to organization, and the project has already been proved to
belong to that same organization.

### Declared impact targets

`ChangeRequestImpact` is polymorphic across six target types — requirement,
design item, engineering decision, verification activity, risk, issue — each in
its own real foreign key column, with a CHECK constraint enforcing exactly one.
There is no opaque `entityType + entityId` pair, so the database still guarantees
the referenced artifact exists and cascades the declaration away with it.

Every target is validated against the change's **own project** before anything is
written, so a declaration cannot reach an artifact in another project and
therefore cannot reach another organization's data through a change the caller
legitimately owns. A missing artifact and an out-of-project artifact produce the
same message, because the API does not confirm the existence of things outside
the caller's project.

Children are always reached through their parent change: `findDeclaredImpactForChange`
takes both ids, so an impact id guessed from a different change cannot be deleted.

### As a graph edge

`ChangeRequestImpact` is already the `CHANGE_IMPACTS_OBJECT` edge in the
cross-domain graph — the same rows, read by the graph resolvers. There is no
second store and no duplicated write path. A change created through this module is
immediately traversable:

```
ChangeRequest ──CHANGE_IMPACTS_OBJECT──▶ Requirement | DesignItem | …
```

and in reverse, so an impacted artifact can answer "what changes claim to touch
me?". The integration suite asserts both directions, that the edge carries the
impact row's own id as provenance, and that a declared impact reaching into
another project is refused by the traversal and reported by the consistency check.

That matters because the impact engine will start from a change request and walk
this edge. If declared impacts were not visible through the graph, that engine
would have to read the impact table directly and the graph would stop being the
single way relationships are traversed.

### Audit

Creation, update, transition, declaration and withdrawal each write an audit event
in the **same transaction** as the mutation, attributed to the authenticated actor.
A transition records both endpoints and the rationale given, so the history answers
who moved the change, when, from what, and why.

## Change-impact analysis

The first deterministic impact engine. It takes a change's declared scope, walks
the engineering graph under an explicit propagation policy, and records what it
reached and why.

### Three impact concepts, kept apart

| | What it is | Where it lives |
| --- | --- | --- |
| **Declared impact** | What an engineer *asserted* the change affects | `change_request_impacts` |
| **Computed impact** | What the engine *derived* by walking the graph | `impact_findings` |
| **Consequence** | What actually happened | Not built |

The engine reads declared impacts as its roots and never writes back to them.
That separation is the whole point: when the engine and the engineer disagree,
someone needs to be able to see that they disagree. A UI or a schema that merged
the two would destroy the only signal that matters.

### What it refuses to conclude

Reachability is not damage. The vocabulary is chosen so that no field name
overstates what the system knows:

- `POTENTIALLY_AFFECTED` -- reachable under the policy. Not "affected".
- `NOT_EVALUATED` -- the V1 rule set deliberately did not assess this.
- `UNKNOWN` -- the engine could not classify it, e.g. a declared target that does
  not resolve inside the project.

There is no `CONFIRMED`, because confirmation would need evidence this system
does not gather. There is no severity, score, probability or confidence
anywhere -- a domain test asserts the entire vocabulary is free of those words,
because a fabricated number gets read as a measurement.

Three cases are called out explicitly, each pairing a "this is here" marker with
an "and we did not judge it" marker:

- A **verification activity** in the path is marked
  `VERIFICATION_ACTIVITY_AFFECTED` + `VERIFICATION_OUTCOME_NOT_EVALUATED`.
  Missing evidence is not failure.
- A **decision assumption** is marked `ASSUMPTION_PRESENT` +
  `ASSUMPTION_VALIDITY_NOT_EVALUATED`. Invalidating assumptions belongs to the
  assumption-monitoring engine, which does not exist.
- A **decision expectation** is marked `EXPECTATION_PRESENT` +
  `EXPECTATION_OUTCOME_NOT_EVALUATED`.

### Propagation policy

`IMPACT_PROPAGATION` in `src/domain/impact-analysis.ts` is the single
authoritative table: one rule per canonical edge type, each with a rationale in
engineering terms. Nothing outside it decides whether an edge carries impact.
The graph registry says what an edge *means*; this says what an analysis should
*do* with it.

Each rule has two independent flags, read against the edge's canonical
direction:

- `propagates` -- walked **outbound, multi-hop**. This is impact.
- `context` -- walked **inbound, one hop from a root only**. This is *not*
  impact. One hop keeps it bounded by the number of declared roots rather than
  by the size of the reachable set, and the separate classification means
  context can never be mistaken for propagation.

Two edges carry no impact at all. `CHANGE_IMPACTS_OBJECT` is excluded because it
*is* the declared-impact edge -- the roots are its targets, so walking it would
restate the change's own scope, and following it inbound would drag in every
other change touching the same object. `APPROVAL_RELATES_TO_OBJECT` does not
propagate forward, because changing an approval record does not alter what it
approved; it is context in the other direction.

### Classification

| Classification | Meaning |
| --- | --- |
| `DIRECT` | Explicitly declared on the change |
| `CROSS_DOMAIN` | Reached by propagation, having left the root's artifact domain |
| `DOWNSTREAM` | Reached by propagation, staying inside the root's domain |
| `UPSTREAM_CONTEXT` | Surfaced by walking against an edge -- context, not impact |
| `UNKNOWN` | Could not be classified |

**Precedence.** An object that is both declared and discovered stays `DIRECT`:
what the engineer asserted outranks what the walk inferred. Below that, a
crossing outranks staying inside a domain, and any propagated finding outranks
context.

**Cross-domain is measured against the root, not the previous hop.** From a
requirement root, a decision's assumption two hops out is still a crossing,
because the question an engineer is asking is whether this change reached out of
the domain it was declared in. A last-hop comparison would not answer that.
Multi-hop alone is never treated as cross-domain.

### Provenance

Every finding stores the canonical shortest path from its root as ordered
traversal steps, each naming the **relationship row** it was walked through. An
engineer can therefore always answer "why is this here?" with real ids, and the
integration suite asserts the cited rows genuinely exist.

Where an object is reachable by several paths, the shortest is kept and the
others are counted rather than stored -- keeping every path is how provenance
turns into an unbounded blob. The path is the one JSON column in an otherwise
fully relational finding, because an ordered heterogeneous list whose only query
is "show it to me" is exactly what JSON is for.

### Determinism and reproducibility

Same graph + same change + same engine version = same result. Declared impacts
are sorted before the walk, the graph traversal is already deterministic, and
findings are totally ordered by classification, depth, node type and id.
`analysisSignature()` defines equivalence over engine version, roots, objects,
classifications and provenance -- deliberately excluding row ids and timestamps,
which differ between equivalent runs and say nothing about whether the engine
reached the same conclusion. Both the unit and integration suites run an
analysis twice and compare signatures.

`IMPACT_ENGINE_VERSION` records which rule set produced a result. Findings are
only comparable within a version.

### Limits

`IMPACT_LIMITS` caps depth (5), nodes (500) and edges (2000), inside the graph
engine's own ceilings. A request above a cap is **rejected, not clamped** --
being told an answer is complete when the server shrank the question is worse
than being refused. When a limit does stop the walk, the analysis records which
one, and the UI says the result is partial.

### Freshness

An analysis is immutable, so freshness is **derived at read time**, never stored
as a mutable flag: the run records a SHA-256 fingerprint of the project's source
state, and reading compares it against the current one.

The fingerprint is a project-level digest -- row count and newest timestamp for
every artifact and relationship table in the project. That is deliberately
conservative: an edit anywhere in the project marks the analysis stale, even one
that could not have affected it. False *stale* costs one re-run; false *current*
would present an out-of-date assessment as though it still held. It is also
cheap, where a per-finding fingerprint would mean re-walking the graph just to
answer "is this still valid?" -- as expensive as re-running it.

Counts as well as timestamps, so a deletion moves the digest even though it
leaves no newer row behind.

### Immutable history

Every explicit run creates a new analysis. Nothing is overwritten, no finding is
editable, and "latest" is a query rather than a destructive replacement. An
`ImpactAnalysisRoot` snapshots what the run started from and references its
declaration with `SetNull`, so withdrawing a declared impact later does not
rewrite what an earlier analysis was run against.

Persistence is transactional: roots, findings, summary counts and the audit
event commit together. A run that fails is recorded as `FAILED` with a
caller-safe reason -- never left `RUNNING`, never reported as a partial success,
and never carrying a database message.

### Separation of concerns

- **The graph** owns topology, batching and the project boundary. The impact
  engine issues no relationship queries of its own; every read goes through
  `EngineeringGraphService`, so there is one BFS in the system.
- **The engine** owns policy, classification, persistence and freshness.
- **Surveillance is not implemented.** Analyses run only when someone asks. There
  are no queues, workers or triggers, and reading a stale result reports it as
  stale rather than quietly refreshing it -- asserted in both the unit and E2E
  suites. Automatic re-evaluation is later work.

## Projects UI

`/projects` and `/projects/[projectId]` are the first complete user-facing
module. Both are thin server pages rendering client components that talk to the
application only over HTTP — no UI file imports a service, repository or Prisma,
and the browser is never told about organizations.

- **Data access.** `src/lib/api/client.ts` turns the API's error envelope into a
  typed `ApiError`, and `describeApiError` maps codes to user-facing text
  (validation and conflict messages pass through; anything unexpected becomes a
  generic line so internals never surface). `src/lib/api/projects.ts` holds the
  endpoint calls plus the `useProjects` / `useProject` hooks, shared by the
  Projects pages and the dashboard card so there is one loading path, not three.
  No data-fetching library was added.
- **Validation.** The project form validates with
  `createProjectRequestSchema` / `updateProjectRequestSchema` imported from
  `src/domain` — the same schemas the API enforces. They live in the domain
  layer precisely so the browser can share them; the server remains
  authoritative and its rejections are always displayed.
- **State.** Views hold one copy of a project: whatever the API last returned.
  Edit and archive replace it with the object from their own response rather
  than patching a local guess, and creation refreshes the list from the server
  instead of inserting optimistically.
- **Archived projects** stay listed with visible status, and the UI reflects the
  backend's read-only rule: Edit is disabled, Archive is withdrawn, and a notice
  explains why.

## Project audit behavior

Create, update and archive each write an `AuditLog` row — organization, actor,
action (`project.created` / `project.updated` / `project.archived`), entity type
and id, timestamp, plus small metadata (changed field names, previous status).

The mutation and its audit event share one `prisma.$transaction`, so neither can
exist without the other. Repositories accept an optional `DbClient` (client or
transaction client) purely to make that possible — there is no custom
transaction abstraction.

This is the pattern later entities reuse; it is not yet a general audit
framework, and nothing logs reads.

## Why PostgreSQL for a graph

The traceability model is a graph, and it is now read as one — but the workload
is still not graph-shaped. The queries needed are bounded neighbourhoods ("what
verifies this requirement", "what does this change touch"), which relational
joins handle well at this size, and the traversal caps keep them bounded by
design. PostgreSQL also gives what a traceability record actually needs — foreign
keys, unique and CHECK constraints, transactions — and recursive CTEs remain
available if deeper traversal is required.

A graph database would add an operational component, a second store, and a
consistency boundary between the relationship rows the domain writes and the
edges the graph reads. That boundary is the real cost: today there is exactly one
copy of every edge, so it cannot drift. See the cross-domain product graph
section above.

## Cross-domain product graph

The relationship tables already describe a graph; until now nothing read them as
one. `EngineeringGraphService` is that reader — a **logical** graph over the
existing relational schema.

There is no graph database, no second store, and no duplicated edge. When
`RequirementService` writes a `RequirementDesignLink`, the graph sees that edge
because it reads that row. Nothing has to be kept in sync because there is only
one copy of anything.

### Nodes and edges

Eighteen node types and thirty-two edge types, all defined in
`src/domain/graph.ts` and all backed by a real table. Nothing is listed
speculatively. Three of the node types and ten of the edge types are supplier
engineering — see [Supplier engineering](#supplier-engineering).

A **node is an identity reference** — type, id, project, identifier, label — not
the artifact. A traversal that loaded every column of every visited record would
cost far more than the traversal itself; a caller who needs the full artifact
fetches it from that module's own API.

An **edge carries its provenance**: the relationship row's primary key, who
asserted it and when, plus the note and link type where the underlying table has
those columns and `null` where it does not. Nothing is invented to fill a field.

### One authoritative registry

`GRAPH_EDGE_DEFINITIONS` is the single source of truth for what an edge means:
its source type, its permitted target types, its direction, and whether it can
carry a note or a link type. `EDGE_RESOLVERS` in
`src/server/repositories/graph-edge-resolvers.ts` is the matching single source
of truth for how to *read* it. Adding a relationship means one entry in each, and
`Record<GraphEdgeType, …>` makes the compiler enforce that neither drifts.

Two edge types are genuinely polymorphic on their target — a change request
impacts one of six artifact types, an approval attaches to one of three — and
even those use real per-type foreign keys with a CHECK constraint enforcing
exactly one. There is no opaque `entityType + entityId` pair anywhere.

The resolvers are hand-written, not generated from a table config. There is no
SQL construction and no dynamic table dispatch: each resolver names the real
columns and the real relation it reads.

### Traversal

Breadth-first, because the useful question is "what is near this?" — and BFS
reaches every node by a shortest path first, so the recorded path is the shortest
one and a depth cap means what it says. `OUTBOUND`, `INBOUND` or `BOTH`; every
visited node reports its depth and the chain of edges that reached it, each step
naming the relationship row it came from.

Results are **deterministic**. Every query orders by `createdAt` then `id`, the
frontier is expanded in a stable order, and nodes and edges are sorted before
they are returned, so the same graph and the same request always produce the same
output — including the same truncation point.

Reads are **batched per frontier, not per node**. Each resolver takes a whole
breadth-first level and issues at most one query, and skips entirely when no node
in the frontier is of an endpoint type it can serve. Resolving edges one node at
a time would mean tens of queries per visited node, which is the load the caps
exist to prevent.

`GRAPH_LIMITS` caps depth (5), nodes (500) and edges (2000). A caller may ask for
less but never more: a request above a cap is **rejected, not clamped**, so a
caller is never told it received a complete answer when the server quietly
reduced the question. When a traversal does stop early it says so, and says which
ceiling stopped it.

### Project and organization boundary

The graph never crosses a project. Every edge query constrains **both** endpoints
to the project, and an edge whose endpoints do not both resolve inside it is
dropped rather than followed — the graph fails closed. A relationship row that
points into another project therefore produces no edge at all.

Organization tenancy goes through the same `requireProjectInOrganization` guard
as every other module, so a project in another organization is a 404, never a
403.

### Consistency: reported, never repaired

`checkConsistency` scans the project's relationship rows and reports four kinds
of anomaly — `MISSING_ENDPOINT`, `CROSS_PROJECT_ENDPOINT`,
`MALFORMED_RELATIONSHIP`, `DUPLICATE_EDGE` — and changes nothing.

That is deliberate. A row pointing somewhere it should not is evidence that
something wrote it, and quietly deleting it destroys that evidence. Worse, an
impact analysis run over a silently corrected graph is more dangerous than one
run over a graph known to be broken, because nobody knows to distrust it. A
non-empty report is a successful check that found problems, so it returns 200.

Under the schema as migrated, most of these anomalies are unreachable, and it is
worth being precise about which and why:

- `MISSING_ENDPOINT` — unreachable: every endpoint is a foreign key, and the
  cascades keep link rows from outliving what they point at.
- `MALFORMED_RELATIONSHIP` — unreachable: CHECK constraints enforce
  exactly-one-subject on `approvals`, `evidence_links` and
  `change_request_impacts`.
- `DUPLICATE_EDGE` — unreachable: every link table is unique on its pair. Five of
  them include `linkType` in that key, so the check keys on it too — a
  `DECOMPOSES_TO` and a `DEPENDS_ON` between the same requirements are two
  assertions, not a repeat. `approvals` has *no* unique constraint because an
  artifact accumulates an approval history, so the registry marks that edge type
  `uniquePerPair: false` and the check skips it. Flagging every approval after
  the first would be a false alarm on entirely normal data.
- `CROSS_PROJECT_ENDPOINT` — **reachable today.** Nothing in the schema forbids a
  link row whose two ends belong to different projects.

So the check earns its place on one anomaly now, and on the others if a
constraint is ever dropped by hand, a migration is partially applied, or a future
table is added without them. The integration suite writes a genuine cross-project
row and asserts both halves — the traversal refuses to follow it, and the check
reports it and leaves it in place — and asserts that the database itself rejects
the duplicate the check is written to catch.

### Graph API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/projects/:projectId/graph/node/:nodeType/:nodeId` | Resolve one node |
| GET | `…/graph/node/:nodeType/:nodeId/neighbors` | One hop; `direction`, repeatable `edgeType` |
| POST | `/api/projects/:projectId/graph/traverse` | Breadth-first traversal |
| GET | `/api/projects/:projectId/graph/consistency` | Anomaly report; repeatable `edgeType` |

The node type is in the path rather than inferred from the id: ids are unique per
table, not globally, so without the type the server would have to guess which
table to look in — and a wrong guess is a cross-artifact information leak.

Traverse is a POST because its request is a structured object (a typed root plus
node- and edge-type filters), not because it writes anything. It does not.

This layer is read-only. The [Traceability workspace](#traceability-workspace)
is a structured explorer built directly on these four endpoints — it adds no
second graph, no visualization canvas, and no traversal logic of its own.
Change-impact analysis, technical readiness and Decision Sentinel are built on
the same foundation, each documented in its own section.

## Verification readiness

One question, asked of one verification activity:

> *Given the current engineering baseline and the records that exist, can this
> verification activity be executed — or concluded — responsibly?*

### Readiness is not a result

This is the distinction the whole capability rests on, and it is held apart in
the schema, the service, the API and the interface:

| | Question | Where it lives |
| --- | --- | --- |
| **Verification result** | What happened when the verification was performed? | `VerificationActivity.status` — `PLANNED → IN_PROGRESS → PASSED \| FAILED \| WAIVED` |
| **Verification readiness** | Can it be executed or closed responsibly, given the recorded state? | `VerificationReadinessAssessment.status` — `READY \| NOT_READY \| UNKNOWN` |

A READY activity has **not** passed. A NOT_READY one has **not** failed, and does
not mean the requirement is wrong. Readiness never writes the activity's status,
and the transition endpoint never writes an assessment. Merging them would
destroy the only thing either is good for: a record that says both what was
attempted and whether attempting it was defensible.

Readiness also answers a *different question* depending on where the activity is
in its life, and the assessment records which one it answered:

- `PLANNED` → **EXECUTION**: can this be started?
- `IN_PROGRESS` → **CLOSURE**: can this be concluded?
- `PASSED` / `FAILED` / `WAIVED` → **NOT_APPLICABLE**: the record is closed, so
  there is no readiness question left. The engine says so with a blocking
  finding rather than calling a finished record "ready" because it exists.

Naming the scope is what lets an `IN_PROGRESS` activity be handled honestly
instead of being forced into a verdict that reads as an invitation to start
something already running.

### The rule registry

`VERIFICATION_READINESS_RULES` in `src/domain/verification-readiness.ts` is the
single authoritative statement of readiness policy. Each rule declares its id,
category, outcome, the condition it tests, the records it reads, the scopes it
applies in, and why the outcome is what it is.

**The service owns no policy.** Every finding it emits is produced by `emit`,
which looks the rule up by id and takes category, status, severity and base
markers from the registry; an id the registry does not define is refused. No
`if` in the service can introduce a condition nobody wrote down, and adding a
rule means adding a registry entry rather than editing a branch.

Rules that could produce two different outcomes are split into two rules, so a
rule id in a finding is enough to know what was concluded.

| Area | Rules |
| --- | --- |
| Traceability | `VR-TRACE-001` no requirement linked (blocking); `VR-TRACE-002` linked requirement unreadable (unknown) |
| Requirement state | `VR-REQ-001` DRAFT/IN_REVIEW (blocking); `VR-REQ-002` OBSOLETE (blocking); `VR-REQ-003` APPROVED/BASELINED (informational) |
| Definition | `VR-DEF-001` no title; `VR-DEF-002` no method (both blocking) |
| Lifecycle | `VR-LIFE-001` planned; `VR-LIFE-002` in progress (informational); `VR-LIFE-003` concluded (blocking) |
| Owner | `VR-OWN-001` unassigned (warning) |
| Design state | `VR-DES-001` obsolete (blocking); `VR-DES-002` uncontrolled (warning); `VR-DES-003` controlled (informational) |
| Decision state | `VR-DEC-001` proposed/under review (blocking); `VR-DEC-002` rejected (blocking); `VR-DEC-003` superseded (warning); `VR-DEC-004` approved (informational) |
| Assumption state | `VR-ASM-001` review required (blocking); `VR-ASM-002` basis changed (warning); `VR-ASM-003` never monitored (unknown); `VR-ASM-004` current (informational); `VR-ASM-005` invalidated (blocking) |
| Evidence | `VR-EVD-001` attached; `VR-EVD-002` absent before execution (both informational); `VR-EVD-003` absent at closure (warning) |
| Change impact | `VR-CHG-001` reaches the activity; `VR-CHG-002` reaches a verified requirement (both blocking); `VR-CHG-003` stale analysis; `VR-CHG-004` no analysis (both unknown); `VR-CHG-005` reaches surrounding configuration (warning) |

Three boundaries in that table are places where a plausible-looking rule would
have been wrong, and the registry records why:

- **Owner is not required.** `ownerId` is nullable and no operation refuses to
  run without it. Blocking on a missing owner would enforce a rule the product
  does not have, so `VR-OWN-001` warns.
- **Design need not be approved.** Analysis and demonstration legitimately run
  against a draft design. `VR-DES-002` reports the uncontrolled configuration
  and does not disqualify it; only an *obsolete* design blocks.
- **A decision merely derived from is not a dependency.** Only decisions that
  *address* a verified requirement or *shape* a prerequisite design item are
  evaluated. Applying the rule to every connected decision would fire on
  records nobody would call prerequisites.

### Why missing evidence does not mean not ready

Verification evidence is an **output** of verification, not an input to
readiness. Requiring it before execution would mean no activity is ever ready —
not a safety rule but a broken one — and it would conflate "not yet performed"
with "not defensible", which is the exact confusion this engine exists to
prevent.

`VR-EVD-002` therefore records the absence of evidence before execution as
*informational*, explicitly saying it is not a deficiency. At closure,
`VR-EVD-003` raises it to a warning — concluding an activity that recorded
nothing leaves an outcome with no support — but still does not block, because
the domain does not require evidence to conclude an activity and a waiver
legitimately has none.

The same principle governs the rest: **absence of information produces UNKNOWN,
never a pass and never a failure.** An assumption nobody has monitored, an
impact analysis nobody has run, a requirement that cannot be read — each is
reported as indeterminate.

### Blocking, warning, unknown

`readinessStatusFor` is the single place a verdict is decided:

```
BLOCKING present  → NOT_READY
UNKNOWN present   → UNKNOWN
otherwise         → READY
no findings at all→ UNKNOWN
```

Warnings and informational findings never move the verdict; a rule that should
disqualify says so in the registry. An empty finding list is UNKNOWN rather than
READY: every scope has a rule that always emits, so nothing at all means the
evaluation did not happen — and readiness must never be claimed from silence.

`severity` on a persisted finding (`BLOCKER` / `ADVISORY` / `NOTE` /
`INDETERMINATE`) is a one-to-one restatement of the finding status in report
wording, derived by a single mapping. It carries no information the status did
not, which is what stops it becoming a covert risk score.

**There is no percentage, no fraction, no confidence and no probability**, in
the schema, the API or the interface. The answer is READY, NOT_READY or UNKNOWN,
with findings that name the condition, the record it was read from, the object
it concerns, and the reason.

### Findings explain themselves

Every finding carries `condition → basis → affected object → reason`:

```
VR-REQ-001   BLOCKING   REQUIREMENT_STATE   REQ-104
Requirement REQ-104 is IN_REVIEW. A verification activity cannot be considered
ready until the requirement reaches APPROVED or BASELINED.
read from: REQUIREMENT_LIFECYCLE_STATE, REQUIREMENT_VERIFICATION_LINK
```

The basis markers are the "we did not look" half of the record as much as the
"we looked" half: `ASSUMPTION_MONITORING_NOT_EVALUATED`,
`CHANGE_IMPACT_ANALYSIS_STALE` and `EVIDENCE_NOT_A_READINESS_PREREQUISITE` exist
so a reader can tell what the engine deliberately did not decide. There is no
generic "readiness failed" anywhere.

Findings are stored with the `sequence` the engine produced, ordered blocking →
unknown → warning → informational, then by rule and subject. Nothing falls back
to row order, so two evaluations over the same state list identically.

### Immutable assessments

An assessment and its findings are written once, inside one transaction. There
is no update and no delete in `verification-readiness.repository.ts`, and no
`PATCH`, `PUT` or `DELETE` route — immutability is structural, not a convention.
Re-evaluating appends a new assessment, so "what did we believe on the day we
signed this off, and why?" stays answerable.

The interface reflects that: a historical assessment opens read-only and is
shown exactly as recorded, never re-judged under today's state.

### The readiness fingerprint

Each assessment stores a SHA-256 digest of **its own basis**, not of the
project:

- the activity, with its lifecycle state and revision stamp
- each verified requirement, prerequisite design item and relevant decision,
  each with the state the rules read and its own `updatedAt`
- each relevant assumption, with the monitoring record and verdict consumed
- each relationship row the walk went through, with its link type
- each relevant change request, with the impact analysis consumed and how fresh
  that analysis was
- the readiness scope and the rule-set version

Revision stamps are the objects' own `updatedAt` — never "now" — so two digests
taken a moment apart from an unchanged basis match. This is the deliberate
improvement over the conservative project-wide fingerprint impact analysis uses:
**an unrelated edit elsewhere in the project cannot stale a readiness
assessment**, which is what makes a "stale" badge worth believing.

One project-wide signal does enter, and only where it is genuinely part of the
basis. When an assessment consumed a change request's impact analysis, that
analysis's *freshness* is in the digest — and the impact engine derives freshness
from a project-wide digest, so an edit anywhere can flip it. That affects only
assessments actually resting on an impact analysis, and for those the flip is a
real change in what the assessment relied on rather than noise.

### Stale detection

Freshness is **derived at read time** by re-resolving the activity's basis and
comparing digests. It is never a stored column, because the assessment record
must not change after it is written.

- `CURRENT` — the digests match under the same rule version.
- `STALE` — the basis moved. The stored assessment is returned unchanged, with
  an explanation and an "evaluate again" action. Nothing is silently recomputed.
- `UNKNOWN` — the assessment was produced by a different rule version, or the
  basis could not be read back. Reported as indeterminate rather than presented
  as current.

The verification list shows the *last recorded* assessment per activity with its
date and no freshness verdict, because establishing currency means re-resolving
one basis per row. The column is labelled accordingly, and an activity nobody
has assessed shows "Not assessed" rather than a placeholder verdict. The same
reasoning is why the requirement detail page lists linked verification
activities without a readiness indicator.

### Reading other engines, never running them

The readiness engine composes existing capabilities and computes none of them:

- **Graph.** Every relationship read goes through `EngineeringGraphService`, in
  four batched hops — activity → requirements and evidence; requirements →
  design and decisions; design → decisions; decisions → assumptions. The walk
  stops there, so cost is bounded by the activity's neighbourhood rather than by
  the project. `getNeighborhoods` resolves a whole frontier in one read, so the
  bounded walk cannot become a query per node. There is no second traceability
  mechanism and no traversal code in the service.
- **Change impact.** Stored analyses are read and their freshness judged. The
  engine never runs an analysis, and it distinguishes *no analysis*, *failed
  analysis*, *stale analysis*, *reaches the activity*, *reaches a verified
  requirement* and *reaches the surrounding configuration*. A change is only in
  the basis at all when it declares or computes an effect on something this
  activity stands on, so readiness is not disturbed by every change in the
  project.
- **Assumption monitoring.** Monitoring verdicts are consumed. Nothing here
  runs monitoring, and nothing here writes an assumption's status — a
  VALIDATED assumption whose basis moved stays VALIDATED, with the readiness
  finding saying a person must look.
- **Decision memory.** A decision's lifecycle state is read. An APPROVED
  decision means the decision was *taken*, not that its content is correct, and
  the finding says so.

An evaluation reads, judges and appends. It modifies no source artifact — the
integration suite asserts that a verified requirement's `updatedAt` is unchanged
by an evaluation.

### Readiness API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/projects/:projectId/verification-activities/:activityId/readiness` | Evaluate; creates a new immutable assessment |
| GET | `…/verification-activities/:activityId/readiness` | Assessment history, newest first |
| GET | `…/verification-activities/:activityId/readiness/latest` | Latest assessment with derived freshness |
| GET | `/api/projects/:projectId/verification-readiness/:assessmentId` | One assessment in full, with its basis |

The evaluation body is `strictObject({})`: there is no readiness verdict,
finding or rule override a client may supply, and one that tries is rejected
rather than having the field quietly dropped. The project and activity come from
the path, the actor from the session. Assessment reads are project-scoped, so an
id from another project — or another organization — is simply not found.

Nothing evaluates on a page load. An assessment is a claim about a moment, and
silently recomputing it would make "when was this judged, and against what?"
unanswerable.

### Audit

Two events per evaluation: `verification_readiness.evaluation_started` against
the activity, and `verification_readiness.evaluated` against the assessment,
carrying the actor, project, activity, assessment id, version, verdict and
counts. Individual findings are **not** audited — the persisted assessment holds
the detail, and duplicating it into an append-only event stream would make both
harder to read. Reads are not audited.

### Feeding the technical-readiness engine

This is deliberately not a generic `ReadinessAssessment` table. Technical
readiness asks a different question of a different subject — a *project* at a
named gate, rather than one verification activity — so it has its own tables and
its own registry, and the two rule sets can change without either silently
rewriting the meaning of the other's history.

The data here is shaped so that engine consumes it without re-deriving anything:
verification readiness status and scope, blocking findings with their rule ids
and subjects, and a persisted basis snapshot naming the requirement, design,
decision, assumption and change-impact state each assessment rested on. See
[Technical readiness](#technical-readiness) for how that consumption works.

## Technical readiness

A **second, independent assessment engine**. It answers one question about one
project at one gate:

> Based on the current recorded engineering state, is this project technically
> ready to enter the specified development gate?

It shares no table, no rule registry and no status vocabulary with verification
readiness. What it shares is a *shape*: a declared rule registry, deterministic
status precedence, a scope-specific fingerprint, derived freshness and immutable
history. The two engines are siblings, not layers.

`src/domain/technical-readiness.ts` holds the whole contract — gates, statuses,
categories, basis markers, the rule registry, precedence, scope types,
fingerprint and freshness — and is Prisma-free.

### An aggregation, not a second system

Every input is already recorded somewhere authoritative. This engine reads that
state and applies gate policy to it; it re-derives nothing and writes to nothing
it reads. Four things it deliberately is not:

- **Not a completion percentage.** There is no score, percentage, fraction,
  confidence or probability in the module, the schema, the API or the interface.
  A number would read as a measurement of something nobody measured.
- **Not a checklist.** Nothing is a box a person ticks. Every finding is derived
  from a record and cites what it was read from.
- **Not certification.** These are *internal* engineering gates. `RELEASE_READY`
  is not a claim of regulatory or airworthiness approval. Compliance evidence has
  its own semantics, in a capability that does not exist yet.
- **Not an inference from silence.** Where the record cannot answer, the answer is
  UNKNOWN — never a pass.

### The gate model

Five internal gates, in programme order:

| Gate | The question it asks |
| --- | --- |
| `SYSTEM_DEFINITION` | Is what the product must do recorded, controlled and traceable to the needs it came from? |
| `DESIGN_REVIEW` | Is there a design to review, allocated from controlled requirements, with its decisions recorded? |
| `DESIGN_FREEZE` | Is the configuration settled enough that changing it should now go through change control? |
| `VERIFICATION_READY` | Can the planned verification actually be performed against what has been recorded? |
| `RELEASE_READY` | Has the product been shown to meet its baselined requirements, with the record to support it? |

These deliberately do not claim equivalence to PDR, CDR, TRR or any external
regulatory milestone — naming one after such a milestone would imply the system
knows what that milestone requires, which it does not.

A project is assessed against **one gate at a time**, and passing an earlier gate
is not a precondition for evaluating a later one: a programme may legitimately
want to know how far a later gate is from being reachable.

### The rule registry

`TECHNICAL_READINESS_RULES` is the single authoritative table. Each rule declares
a stable id, the gates it applies to, its category, its outcome, its subject
type, the basis markers it reads, and an engineering rationale.

The service owns **no gate policy**. Every finding flows through one `emitFinding`
function that looks the rule up by id and takes the category, status, severity
and base markers *from the registry*; an id the registry does not define throws,
and a rule that does not apply to the gate being evaluated produces nothing. No
`if` in the service can introduce a condition nobody wrote down, and no client can
add one — the request contract carries a gate and nothing else.

Where the same condition carries different weight at a later gate — an in-review
requirement is normal at design review and disqualifying at freeze — that is **two
rules, not one rule with a branch**, so a rule id in a finding is enough to know
both what was concluded and why it mattered at that gate.

Boundaries the registry deliberately holds, each a place where a plausible-looking
rule would have been wrong:

- **No completeness rule.** No "all requirements written", no "design N% mature".
  The record contains no statement of what a complete set would be, and inventing
  a denominator would be inventing a measurement.
- **Risk severity is not modelled.** `Risk` carries a status but no severity, so
  the engine will not rank risks. It reports an *open* risk — one nobody has
  mitigated, accepted or closed — and says explicitly that it is not classifying
  it further. `Issue` *does* carry a severity set by a person, so issue rules
  consume that human judgement rather than inventing one.
- **Design allocation warns, never blocks.** Not every requirement is met by a
  design element; process and programmatic requirements are not. Blocking would
  enforce a rule the product does not hold.
- **Evidence is not required because a gate exists.** It is required at
  `RELEASE_READY` for a verification that has *passed*, where its absence means a
  verdict with nothing behind it. A waiver legitimately has none, and a failure is
  already blocking on its own.

### Deterministic status precedence

One function decides every verdict:

```
any BLOCKING finding  → NOT_READY
any UNKNOWN finding   → UNKNOWN
otherwise             → READY
no findings at all    → UNKNOWN
```

Warnings and informational findings never move the verdict — a rule that should
block a gate says so in the registry. **Silence never produces READY:** every gate
has rules that always emit, so an empty result means the evaluation did not
actually happen.

Finding statuses rank `BLOCKING > UNKNOWN > WARNING > INFORMATIONAL`. Blocking
outranks unknown because a known disqualifier is a firmer statement than an
unanswered question; unknown outranks warning so "we could not tell" is never
buried under advisory noise.

The persisted `severity` (`BLOCKER`/`ADVISORY`/`NOTE`/`INDETERMINATE`) is a
one-to-one restatement of the finding status in report wording, produced only by
a mapping function. It is not a second axis and emphatically not a risk rating.

### Conservative semantics

The engine prefers UNKNOWN over READY whenever required information is
unavailable. An unmonitored assumption, an un-run or failed impact analysis, a
verification activity nobody has assessed, a readiness assessment that has gone
stale — each is indeterminate, never a pass. A missing record is never turned
into "passed". The product's credibility rests on this one property.

### Scope and the scope snapshot

V1 evaluates the project's **current active engineering scope**: records that are
still live, plus the ones a live record depends on. A withdrawn requirement is
not what a gate is about, but stays visible so "withdrawn" can be told from
"never existed"; an obsolete design item stays in scope when a live requirement is
still allocated to it, which is exactly the contradiction `TR-DES-002` reports.

There is no scope query DSL — a later version can add named scopes without
changing what this one meant.

Each assessment stores a compact snapshot: for every object, its role, type, id,
identifier, the lifecycle state a rule read and its own `updatedAt`; every
relationship row walked; and the verdicts consumed from the other three engines.
**No artifact record is copied.** That is enough to answer "what was considered for
this gate?" without turning the assessment into a duplicate of the project.

### The gate fingerprint

Gate-specific and scope-specific, never a project-wide timestamp. The SHA-256
digest covers the readiness version, the gate, the scope label, every scope
object with its state and revision stamp, every relationship row, and each
consumed verification-readiness, change-impact and assumption-monitoring verdict.

Two consequences that matter:

- **Unrelated project activity does not stale a gate assessment.** An artifact
  outside the evaluated basis cannot move the digest.
- **Two gates over the same project produce different fingerprints**, so neither
  can be mistaken for the other.

Time is never an input, so two digests taken a moment apart from an unchanged
scope match — otherwise every assessment would be stale the instant it was
written.

### Freshness is derived, never stored

There is no stale column. `CURRENT`, `STALE` or `UNKNOWN` is computed at read
time by re-resolving the gate's scope and comparing digests. A stored flag would
mean mutating a record that must not change.

An assessment written under a different `readinessVersion` reports **UNKNOWN**
rather than a guess at compatibility, and a scope that cannot be resolved reports
UNKNOWN rather than pretending either way. The one thing it must never do is
answer "current" because it failed to check.

### Immutable history

Every evaluation appends. Nothing is updated, nothing is overwritten and the
repository exposes no update or delete. A historical assessment is returned
exactly as it was recorded — the findings and the scope it was written with,
never re-judged under today's state — because the value of a gate record is that
it says what was believed *then*. Its freshness against the present is reported
alongside, so a reader sees both.

### Consuming the other engines

The engine composes; it does not duplicate. It never writes to anything it reads.

- **Verification readiness.** Its verdicts are consumed as verdicts, at
  `VERIFICATION_READY` (where the rules read status and freshness) and, for
  existence only, at `DESIGN_FREEZE`. None of its rules are re-implemented; the
  gate findings point at its assessments rather than restating them. A stale
  verification-readiness assessment is reported as indeterminate — it is not
  silently re-run, because re-evaluating is an explicit act by a person, not a
  side effect of asking about a gate.
- **Change-impact analysis.** The latest analysis per in-flight change is read
  along with its freshness. *No analysis*, *failed analysis*, *stale analysis* and
  *reaches the evaluated scope* are four distinct conditions with four distinct
  rules. A stale analysis is never treated as current, and the engine will not run
  one on the caller's behalf.
- **Assumption monitoring.** Monitoring verdicts are consumed. Nothing here runs
  monitoring or writes an assumption's status: a VALIDATED assumption whose basis
  moved stays VALIDATED, with the finding naming the decision, the assumption and
  the monitoring verdict so a person can look. An assumption that has never been
  monitored is UNKNOWN, not a pass.
- **Decision memory.** Lifecycle, assumptions and expectations are read. An
  APPROVED decision means the decision was *taken*, not that its content is
  correct, and the rationale says so. A SUPERSEDED decision warns rather than
  blocks: the schema records no link to a successor, so the engine genuinely
  cannot say which decision now governs and leaves the substitution to a person.
- **Graph.** All topology comes from `EngineeringGraphService` in four batched
  hops — needs → requirements; requirements → design, verification and decisions;
  design → decisions; activities → evidence (release gate only). `getNeighborhoods`
  resolves a whole frontier per hop, so the walk is bounded and never becomes a
  query per node. There is no traversal code in the service and no second
  traceability mechanism.

Artifact state itself comes from batched project-scoped reads in
`technical-readiness-scope.repository.ts` — one query per type, never one per
object. Two consumptions are gate-conditional (verification readiness at
`VERIFICATION_READY`, evidence at `RELEASE_READY`) because only those gates' rules
read them, and paying for them elsewhere would be waste that also widened the
fingerprint beyond the gate's real basis.

### Findings explain themselves

Every finding carries its rule id, category, status, severity, the subject by
type and id with its identifier and label snapshotted, a message naming the
object and the recorded state that produced it, the basis markers it was read
from, and its position in the deterministic ordering.

> `TR-REQ-002` · `BLOCKING` · Requirement REQ-014 is DRAFT. It has not been
> through review, so nothing downstream of it can be relied on at the system
> definition gate.

Never "Project not ready" without saying why.

Basis markers name what was read — `REQUIREMENT_LIFECYCLE_STATE`,
`VERIFICATION_READINESS_STALE`, `NEED_REQUIREMENT_LINK` — and carry the negative
space too: `ASSUMPTION_MONITORING_NOT_EVALUATED` and `RISK_SEVERITY_NOT_MODELLED`
exist so a reader can tell what the engine deliberately did *not* decide.

### Determinism

The same project state, gate and readiness version produce an equivalent
evaluated object set, findings, statuses, basis and fingerprint. Gates, rules,
subjects, scope objects and relationships are all explicitly ordered; findings are
sorted by status precedence, then rule id, then subject type and id, and the
resulting `sequence` is written with each row and used to order reads. **Nothing
depends on database row order** — including "latest", where the row id breaks ties
between two evaluations landing in the same millisecond.

`technicalReadinessSignature` reduces a report to version, gate, verdict and the
rules that fired against which subjects, deliberately excluding ids and
timestamps, so two evaluations can be compared for equivalence.

### Technical readiness API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/projects/:projectId/technical-readiness` | Evaluate one gate; creates a new immutable assessment |
| GET | `/api/projects/:projectId/technical-readiness/latest?gate=…` | Latest assessment for a gate, with derived freshness |
| GET | `/api/projects/:projectId/technical-readiness?gate=…` | Assessment history, newest first; all gates without `gate` |
| GET | `/api/projects/:projectId/technical-readiness/:assessmentId` | One assessment in full, with the scope it was written with |

The evaluation body is `strictObject({ gate })`. **The backend owns rule selection
entirely** — the gate names a set of rules in the registry, and there is no request
shape that could add to or subtract from it. A client that tries to send a
verdict, a rule, a finding, an organization, a project, an actor or a readiness
version is rejected outright rather than having the field quietly dropped, because
a silent drop hides an attempt worth failing loudly on.

The project comes from the path and the actor from the session. Every route is
authenticated, organization-scoped and project-scoped through
`requireProjectInOrganization`, and holds no Prisma. Assessment reads are
project-scoped, so an id from another project — or another organization — is
simply not found rather than refused: the API does not confirm the existence of
what it will not show. There is no PATCH, PUT or DELETE; immutability is
structural rather than a convention.

### Technical readiness UI

`TechnicalReadinessPanel` on the project detail page. A gate selector across the
five gates, and **selecting a gate never evaluates it** — nothing runs on a page
load. A gate nobody has assessed says so in words, rather than rendering zero
counts that would read as "we checked and found nothing wrong".

For the selected gate the panel shows the verdict as READY / NOT READY / UNKNOWN
with text and an icon — no score, no percentage, no progress bar — the evaluation
date, the readiness version, and CURRENT / STALE / UNKNOWN. A stale assessment
says it is stale and offers a re-evaluation rather than performing one. The
findings table gives rule, category, status, subject and explanation, with the
scope snapshot and each finding's basis inspectable. History lists past
assessments by gate, date, result and version, each openable read-only and
labelled as historical.

At `VERIFICATION_READY` and `RELEASE_READY` the panel summarises the
verification-readiness assessments consumed and links to them rather than
restating their findings. Change-impact analyses and assumptions requiring review
are surfaced the same way — named, explained and linked, never silently absorbed.

### Audit

Two events per evaluation: `technical_readiness.evaluation_started` against the
project, and `technical_readiness.evaluated` against the assessment, carrying the
actor, project, gate, assessment id, version, verdict and counts. Losing the
"started" marker never prevents the evaluation itself. Individual findings are
**not** audited — the persisted assessment holds the detail. Reads are not audited.

### Technical readiness is not certification readiness

`RELEASE_READY` is an internal engineering gate: a statement about what the
recorded state supports, made against a declared rule set, at a moment. It is not
a claim of regulatory or airworthiness approval, and `TECHNICAL_READY` must never
be read as `CERTIFICATION_READY`. A certification workspace would carry its own
compliance and evidence semantics — which standard, which objective, which
artifact satisfies it — and none of that is modelled here. READY is also not a
decision to hold the gate; a person still holds the gate.

### What is deliberately absent

No automatic gate progression, no background monitoring, no notifications, no
scheduled evaluations and no AI recommendations. Evaluation is explicit. A future
surveillance layer will decide when evaluations should be triggered; until it
exists, a gate assessment is something a person asked for.

## Supplier engineering

Supplier-side **engineering dependencies**, so that supplier changes participate
in the same product graph and the same impact analysis as everything else.

The question this exists to answer:

> If this supplier, supplied item or qualification changes, what engineering
> objects may be affected?

That question is only answerable if supplier records are in the graph. So the
model stops precisely where a supplier record touches engineering, and goes no
further.

### This is not procurement

There is no purchase order, invoice, contract, delivery, price, inventory level,
lead time, payment term, vendor score or supplier health rating in the schema,
the domain, the API or the interface — and no status value that implies one
(`PREFERRED`, `APPROVED`, `BLACKLISTED` and `CONTRACTED` are all absent, and a
domain test asserts their absence). Those belong to a procurement system.
Modelling them here would turn an engineering capability into a CRM wearing
aerospace vocabulary, and would put commercial relationships into a graph whose
edges are supposed to mean *the product depends on this*.

The counterpart discipline: **no derived judgement**. Nothing computes a rating,
ranks suppliers, or infers one record's state from another's.

### Four records, kept apart

| Record | What it says |
| --- | --- |
| `Supplier` | *Who* provides something the project's engineering depends on |
| `SuppliedItem` | *What* they provide |
| `SupplierQualification` | What establishes that it is *suitable* |
| Relationship rows | *Where* the supplied item participates in the product |

They are separate because they change independently and a change to one reaches
different things than a change to another. Collapsing them — a supplier record
carrying a qualification status, say — would make "the supplier changed" and "the
qualification lapsed" indistinguishable.

**Project-scoped**, like every other artifact. A supplier is conceptually
reusable across programmes, but one record spanning projects would carry a status
and a dependency graph meaning different things in each, and a change declared
against it would reach objects in projects the declarer cannot see. A later
version can add cross-project supplier identity above this without changing what
a project-level record meant.

`SuppliedItem` is the record that actually participates in the graph. A supplier
reaches engineering **through its items**, which is how a supplier-level declared
impact still finds design consequences — it propagates supplier → item → product.

### Qualification: recorded, never derived

`SupplierQualification` carries `PLANNED`, `ACTIVE`, `EXPIRED` or `WITHDRAWN`, and
**nothing in this system moves it between them**. In particular, an `expiryDate`
in the past does not make the status `EXPIRED`: a date that has passed is a fact
about the record, and treating it as a state change would be the system inventing
an engineering judgement nobody made. The detail page says so explicitly when it
sees the discrepancy, and leaves the status alone.

This is the same discipline the readiness engines hold: **change detected is not
failure proven**.

`suppliedItemId` is nullable. A `SOURCE` qualification is about the supplier and
is not scoped to any one item; a `MATERIAL`, `PART` or `PROCESS` qualification
usually is. Forcing an item onto the first case would invent a subject the record
does not have. Where an item *is* named, the service enforces that it is provided
by the named supplier — a qualification pointing at one supplier's record and
another's item would assert something false about both.

`evidenceReference` stays a plain string because this system stores no files.
Real `Evidence` records attach in addition, through the existing evidence link
table — not a second document store.

### Independent statuses

`Supplier.status` and `SupplierQualification.status` are never derived from each
other, in either direction. **Supplier `ACTIVE` with a qualification `EXPIRED` is
a real state the system preserves**, because reconciling them would destroy the
distinction between "we stopped using them" and "the qualification lapsed". No
badge blends the two, and no service writes one when the other changes.

### Graph integration

Three node types — `SUPPLIER`, `SUPPLIED_ITEM`, `SUPPLIER_QUALIFICATION` — and ten
edge types, each with its direction declared once in `GRAPH_EDGE_DEFINITIONS` and
read source → target. No client infers direction from a table or column name.

| Edge | Meaning |
| --- | --- |
| `SUPPLIER_PROVIDES_ITEM` | Supplier → SuppliedItem |
| `SUPPLIER_HAS_QUALIFICATION` | Supplier → SupplierQualification |
| `SUPPLIED_ITEM_QUALIFIED_BY` | SuppliedItem → SupplierQualification (absent for a SOURCE qualification) |
| `SUPPLIED_ITEM_ALLOCATED_TO_DESIGN` | SuppliedItem → DesignItem |
| `SUPPLIED_ITEM_SUPPORTS_REQUIREMENT` | SuppliedItem → Requirement |
| `SUPPLIED_ITEM_REQUIRES_VERIFICATION` | SuppliedItem → VerificationActivity |
| `SUPPLIED_ITEM_LINKED_TO_DECISION` | SuppliedItem → EngineeringDecision |
| `SUPPLIED_ITEM_LINKED_TO_RISK` | SuppliedItem → Risk |
| `SUPPLIED_ITEM_HAS_EVIDENCE` | SuppliedItem → Evidence |
| `SUPPLIER_QUALIFICATION_HAS_EVIDENCE` | SupplierQualification → Evidence |

The five supplied-item → engineering relationships are **typed join tables** with
real foreign keys on both ends — never an `entityType + entityId` pair. The three
parent edges are read from the child row's own foreign key, so the child's id is
both the edge's provenance and the target node's id; that is the same shape the
decision-memory children already use.

Each has one explicit resolver in `graph-edge-resolvers.ts`, batched over a whole
frontier and constraining **both** endpoints to the project. A link whose other
end is in another project yields no edge — the graph fails closed — and the
consistency check reports it as a `CROSS_PROJECT_ENDPOINT` anomaly rather than
repairing it.

### Impact integration: one engine, extended

There is **no `SupplierImpactService`**. A supplier-side change is an ordinary
`ChangeRequest` with an ordinary declared impact, and `ChangeImpactAnalysisService`
walks it under the same policy as everything else. `SUPPLIER` and `SUPPLIED_ITEM`
joined `CHANGE_IMPACT_TARGET_TYPES`, each with its own real foreign key column on
`change_request_impacts`, so "supplier S-01 is affected" is declared through the
same mechanism as "requirement REQ-100 is affected". There is no
`SupplierChangeRequest` and no separate supplier impact report — a second
mechanism would mean two answers to the same question.

What the engine gained is ten entries in `IMPACT_PROPAGATION`, one per new edge.
All of them propagate, because each is a genuine engineering dependency: the
product relies on the supplied item, so a change to it reaches what relies on it.
Note what is *not* there — no commercial relationship is in the graph at all, so
there is no edge that could carry impact without an engineering consequence behind
it.

Supplier records form their own artifact domain, `SUPPLY`. Reaching design,
requirements or verification from a supplied item therefore classifies as
**CROSS_DOMAIN**, which is exactly what an engineer needs to notice: a supply-side
change has left the supply side.

Two basis markers keep the engine honest about qualifications:
`QUALIFICATION_PRESENT` paired with `QUALIFICATION_VALIDITY_NOT_EVALUATED`.
Reaching a qualification means a change disturbed what it was granted against — it
does **not** mean the qualification lapsed, and the finding says so in its own
basis.

`IMPACT_ENGINE_VERSION` moved to `2`. The change is purely additive — no existing
edge's rule changed — but the set of relationships the engine walks is part of
what an analysis *means*, so a result produced before supplier records could be
reached is labelled as a different statement rather than quietly reinterpreted.

### Readiness integration

None, deliberately. No technical-readiness rule and no verification-readiness rule
was added or altered for suppliers. Supplier state is now *visible through the
graph*, which is what a later readiness rule would need; inventing a gate
condition now — "no supplier may be UNDER_REVIEW at design freeze" — would be
policy nobody asked for, expressed in a registry that is supposed to contain only
declared conditions. Supplier-linked verification activities continue to work
through their existing requirement relationships, unchanged.

### Services and repositories

`SupplierService`, `SuppliedItemService` and `SupplierQualificationService`, over
`supplier.repository.ts`, `supplied-item.repository.ts` and
`supplier-qualification.repository.ts`. Each repository owns its own table; there
is no generic "supplier store" deciding what a change to any of them implies.

The property that matters most across all three: **no id a caller supplies is
trusted**. The supplier on item creation, both parents on qualification creation,
and every link target are re-resolved inside the already-scoped project, inside
the transaction, before anything is written. That is the boundary that keeps
supplier impact honest — a link to another project's design item would let a
change declared here reach objects the declarer has no access to.

Deleting a supplier that still provides items is refused at the database
(`ON DELETE RESTRICT`): removing a supplier must not silently delete the items the
product depends on, along with every engineering link to them.

Supplier records have no owner field. They are organizations, not people; the
audit actor remains the authenticated application user.

### Supplier API

| Method | Path |
| --- | --- |
| GET, POST | `/api/projects/:projectId/suppliers` |
| GET, PATCH | `/api/projects/:projectId/suppliers/:supplierId` |
| GET, POST | `/api/projects/:projectId/supplied-items` |
| GET, PATCH | `/api/projects/:projectId/supplied-items/:suppliedItemId` |
| POST, DELETE | `…/supplied-items/:suppliedItemId/links` |
| GET | `/api/projects/:projectId/supplied-item-link-targets` |
| GET, POST | `/api/projects/:projectId/supplier-qualifications` |
| GET, PATCH | `…/supplier-qualifications/:qualificationId` |
| POST, DELETE | `…/supplier-qualifications/:qualificationId/evidence` |

The relationship endpoint is **typed, not generic**: the body carries a `relation`
drawn from a fixed list, each naming one real join table. Every route is
authenticated, organization- and project-scoped through
`requireProjectInOrganization`, and holds no Prisma. Identifiers are not editable
in any state, and a supplied item is never re-parented — a new item is recorded
and the old one marked `OBSOLETE`, because re-parenting would silently rewrite
what every existing engineering link on it means.

### Supplier UI

`/projects/:projectId/suppliers` lists suppliers with status, updated date, and
supplied-item and qualification counts that come from a real aggregate in the
same query — shown because they are genuinely derived, never estimated. Supplier
detail shows its items, its qualifications and its history, with supplier and
qualification statuses side by side and unreconciled.

Supplied-item detail is where the capability earns its place: the relationship
panel is what makes impact answerable, and the page says so — an item with no
links is described plainly as one that "will produce no downstream findings".
The relation picker offers only artifacts the project actually has, so it cannot
suggest something the server would refuse.

The project workspace now lists Requirements, Stakeholder needs, Design items,
Verification, Decisions, Changes and **Suppliers** as modules that exist and can
be opened. Traceability, Risks and Certification remain named as unbuilt — `Risk`
records exist and are readable through relationships, but there is no risk
management module and the interface does not claim one.

### Audit

`supplier.created/updated`, `supplied_item.created/updated/linked/unlinked`, and
`supplier_qualification.created/updated/status_changed/evidence_linked/evidence_unlinked`.
Each mutation and its audit event are written on the same transaction client, so
a write cannot land without its audit row or the reverse. A qualification status
change is audited as its own action carrying both the previous and new value: it
is an engineering event, and losing which state it came from would make the record
much harder to read later.

## Design / operations drift

A **fourth assessment capability**, alongside change-impact analysis, verification
readiness and technical readiness — but pointed the other direction. Where those
engines ask "what does a change reach" and "is the record ready for a gate", this
one asks a backward-looking question about one project against one baseline:

> Where does the operational state that has since been recorded no longer match
> the engineering basis that was approved?

Aerospace systems drift without anyone changing the baseline. The actual
operating temperature stops matching the design assumption; a supplier's process
moves without an engineering change; the field configuration diverges from the
approved design. Nothing in the record is *wrong* — each individual entry was
made honestly — and yet the engineering basis and reality have come apart. This
capability makes that visible, and it implements one chain, deliberately without
a shortcut:

> Engineering basis → baselined state → operational observation → deterministic
> comparison → drift finding → **a person decides**

`src/domain/drift.ts` holds the whole contract — baseline and observation
lifecycles, the exact-decimal comparison engine, the `DRIFT_RULES` registry,
status precedence, and the drift-specific fingerprint and freshness — and is
Prisma-free.

### Four things this deliberately is not

- **Not a failure judgement.** Expected 100, observed 103 produces
  `VALUE_DEVIATION / REVIEW_REQUIRED`. It never produces "design failed".
  Whether a deviation matters is an engineering conclusion that depends on
  margin, tolerance and intent — none of which this system holds.
- **Not anomaly detection.** There is no model, no training, no score, no
  confidence and no probability. Every finding is a comparison someone could
  perform by hand from the two values printed beside it.
- **Not telemetry.** Observations are recorded by people in V1. There is no
  ingestion pipeline, no time series, no event bus, and none is implied.
- **Not a baseline updater.** Detecting that an object changed since it was
  baselined must never rewrite the baseline. That divergence *is* the finding;
  erasing it would destroy the only evidence drift ever produces.

### EngineeringBaseline and its members: a fixed point, not a moving one

`EngineeringBaseline` moves through `DRAFT → ACTIVE → SUPERSEDED`, and nothing
returns to `DRAFT` — SUPERSEDED is terminal. A baseline that could be edited
after activation would make every drift finding computed against it
meaningless, so membership can only change while `DRAFT`
(`isBaselineMembershipEditable`); once `ACTIVE` or `SUPERSEDED` it is a fixed
engineering reference (`isBaselineImmutable`), and `addBaselineMember` /
`removeBaselineMember` refuse with `ConflictError` the moment `status` leaves
`DRAFT`. There is deliberately no branch, merge, variant or effectivity model —
this is a reference point for comparison, not a configuration-management
system.

`activateBaseline` enforces two rules the service holds, neither the database:
it refuses (`ValidationError`) to activate a baseline with zero members, since a
baseline recording no engineering basis would give drift nothing to compare
against; and if another baseline is already `ACTIVE` it refuses (`ConflictError`)
unless the caller sends `supersedeActive: true` explicitly — swapping an
engineering basis out as a side effect of activating a new one is exactly the
kind of quiet state change that would make a later drift result impossible to
interpret. Supersession is recorded on a self-relation
(`EngineeringBaseline.supersededById`) rather than implied by a status alone, so
the succession is traversable.

`EngineeringBaselineMember` is **a reference plus a snapshot, never a copy**.
The artifact tables remain the source of truth; the member row stores identity
(`nodeType`, `nodeId`), display metadata for a historical report
(`identifierSnapshot`, `labelSnapshot`, `stateSnapshot`, `revisionSnapshot`), and
a deterministic `fingerprint` of the engineering state as it stood at the
moment of baselining. That fingerprint is the whole mechanism — comparing it
against the object's fingerprint today is how "this changed since we baselined
it" becomes a fact rather than an impression. The seven baselineable node types
(`REQUIREMENT`, `DESIGN_ITEM`, `ENGINEERING_DECISION`, `DECISION_EXPECTATION`,
`VERIFICATION_ACTIVITY`, `SUPPLIED_ITEM`, `SUPPLIER_QUALIFICATION`) are a subset
of the graph node registry, not an arbitrary type/id pair: a change request or
an approval is an *event*, not part of the engineering basis, so neither is
baselineable.

### The object fingerprint: what it excludes, and why

`objectFingerprint(fields)` sorts a `key=value` field list and hashes it with
SHA-256. `loadBaselineableObjects` calls it with exactly the substantive fields
per node type — for a requirement: identifier, title, statement, rationale,
status, priority; for a design item: identifier, name, description, itemType,
status; for a decision expectation: statement, measure, expectedValue, unit,
**comparisonOperator**, status (the comparison terms are part of the basis —
changing the operator or the expected value changes what was approved, and that
is drift); and so on for the other four types. The object's own `updatedAt` is
deliberately **excluded**: an edit that saves without changing anything
substantive would otherwise register as drift, and a false positive here costs
an engineer a real investigation.

The same function is used both when a member is added to a `DRAFT` baseline (to
capture what was baselined) and at evaluation time (to compute what the object
looks like now). Using one reduction for both is what makes the comparison
meaningful — two different reductions would silently report drift that was only
ever a difference in how the state was hashed.

### OperationalObservation: RECORDED → REVIEWED or REJECTED

`RECORDED` means somebody wrote down what they saw — that is all it means. It is
deliberately **not** treated as established engineering evidence: field reports
are frequently wrong, mis-transcribed, or about a different unit. `REVIEWED`
means an engineer has looked at it and accepts it as a record of what happened;
from there the substance is locked. `REJECTED` means an engineer does not
accept it — kept, not deleted, because that someone reported it, and that it
was rejected, is itself part of the operational history. Both `REVIEWED` and
`REJECTED` are terminal (`OBSERVATION_TRANSITIONS`); changing one's mind means
recording a new observation, so the record of what was believed at the time
survives. `updateObservation` refuses (`ConflictError`) once an observation has
left `RECORDED`, and the subject is never editable at all — re-pointing an
observation at a different object would change what it asserts rather than
correct it.

**Only reviewed observations are compared.** An unreviewed one is somebody's
report, not established engineering evidence, so no rule runs a comparison
against it — but its existence is still surfaced, by `DR-OBS-001`, so a
`NO_DRIFT` verdict never implies the engine looked at everything that was
written down.

The measured value is stored as `NUMERIC(38,12)`, never a float, and read back
through Prisma's `Decimal` via `.toString()` as an exact decimal *string* end to
end. `parseExactDecimal` reduces that string to a scaled BigInt mantissa, and
`compareExactDecimals` rescales both sides to a common scale before comparing —
exact for every value a person can type, with no binary floating point involved
at any point. This system exists to say whether two numbers differ, so a float
round-trip that turns `0.1` into `0.09999999999999999` would be a defect in the
one thing it is for.

An observation's subject is at most one of `designItemId`,
`decisionExpectationId` or `suppliedItemId`, enforced by the CHECK constraint
`operational_observations_at_most_one_subject`. This is **AT MOST** one, not
*exactly* one the way `evidence_links` and `change_request_impacts` require —
a field report that does not yet name the element it concerns is still a real
and useful record, and forcing a subject onto it would invite somebody to
guess at one. `REQUIREMENT` is deliberately absent from the observable subject
types: an observation about a requirement is almost always really an
observation about the design that implements it or the verification that
demonstrates it.

### DriftAssessment / DriftFinding: the rule registry is the only source

`DRIFT_RULES` is the single authoritative table — sixteen rules across scope,
baseline integrity, expectations, configuration observations, value deviation,
supplier state, observation hygiene and context. The service holds **no
comparison policy of its own**: every finding flows through one `emitFinding`
function that looks a rule up by id and takes its category, status, severity
and basis markers *from the registry*; an id the registry does not define
throws (`DriftEvaluationFailure`) rather than silently dropping a comparison.
`evaluateDriftRequestSchema` is `strictObject({ baselineId })` — a client that
tries to send a verdict, a finding, a rule, an actor or anything else is
rejected outright.

`driftStatusFor` is the single place a drift verdict is decided:
`REVIEW_REQUIRED > UNKNOWN > NO_DRIFT`, precisely the same reasoning as the
readiness engines' precedence. An assessment with **no findings at all is
`UNKNOWN`, never `NO_DRIFT`** — every evaluation emits at least `DR-SCP-001`
(the scope rule, recording what was actually compared), so an empty result
means the evaluation did not actually happen, and silence must never read as
"nothing has drifted".

Each finding's `severity` (`ATTENTION` / `NOTE` / `INDETERMINATE`) is a
one-to-one restatement of its status, produced only by
`severityForDriftStatus` — not a second axis, and emphatically not a risk
rating; inventing one would be exactly the "anomaly score" this capability
refuses to produce. Findings are placed in a deterministic total order
(`compareDriftFindings`: status precedence, then rule id, then subject) and the
resulting `sequence` is written with each row, so two evaluations over the same
state list their findings identically and nothing depends on database row
order.

Both subjects a finding can name — `baselineSubject` and `observationSubject`
— are stored by `(type, id)` with snapshotted display metadata rather than a
foreign key, because a finding's subject may be any of eight artifact types or
an observation, and the artifact tables remain the source of truth. An
assessment is written **whole, inside one transaction**: `createAssessment`
plus a bulk `createFindings` insert, never opened and later closed, because
evaluation is synchronous and either produces a complete verdict or throws.
There is no update and no delete on either table — re-evaluating appends a new
assessment rather than replacing its predecessor, which is what makes drift
usable as engineering evidence months later: "what had diverged on the day we
decided to fly?" has an answer. The foreign key from `drift_assessments` to
its baseline is `RESTRICT`: a drift assessment is meaningless without the
baseline it compared against, so the baseline cannot be deleted out from under
its own history.

### The comparison engine: explicit operator, exact decimals, no unit conversion

`comparisonOperator` is a new nullable column on `DecisionExpectation`
(`EQUAL` / `NOT_EQUAL` / `LESS_THAN` / `LESS_THAN_OR_EQUAL` / `GREATER_THAN` /
`GREATER_THAN_OR_EQUAL`), added by a purely additive migration — every
existing expectation remains valid and simply reports as "not comparable"
until somebody records an operator. It is always **explicit**: nothing parses
`"< 800"` out of an expected-value string, because a system that infers an
operator from prose will eventually infer the wrong one, and it will do so
silently on the one expectation where it matters.

`compareObservedValue` is the single place a value comparison is decided. It
returns `NOT_COMPARABLE` — never a guess — whenever the operator is missing,
either value is absent or non-numeric, or the units do not match. Each of
those is a real gap in the record, and reporting it honestly is the entire
reason this engine can be trusted with the cases it does decide. The
arithmetic itself is the exact-decimal machinery described above — no floats,
anywhere in the comparison.

**No conversion, ever.** 800 °C and 1472 °F are the same temperature, and a
system that quietly converted them would eventually convert something it had
no business converting, or get the direction wrong on a scale with an offset.
Different units produce `UNKNOWN`, which is a true statement about what this
system knows. Both sides unitless is compatible — a dimensionless expectation
compared with a dimensionless observation is a real comparison — but one side
having a unit and the other not is *not* compatible, because it means somebody
recorded incomplete information and a silent match would be assuming what they
meant.

### The central distinction: drift vs failure

No rule in `DRIFT_RULES` ever concludes failure. `REVIEW_REQUIRED` is the
ceiling — there is no `FAILED`, `BREACHED` or `DEFECT` anywhere in
`DriftFindingStatus`, because producing one would be this engine claiming an
engineering conclusion it has no basis for. The registry's own rationale for
`DR-VAL-001` states the case plainly: *"Expected 100, observed 103 is a
`VALUE_DEVIATION` requiring review — it is not a failure, and the amount of the
difference is reported rather than scored."* `DR-BAS-002` — the central
configuration-drift comparison — says the same thing from the baseline side:
what it does not say is that a change was wrong, that it was unauthorised, or
that the baseline should be updated; a change may be entirely correct and
still need to be seen against the basis it diverged from.

The service enforces this structurally, not just by convention: it never
writes to anything another engine owns as a side effect of a finding. No
expectation moves to `BREACHED`, no assumption is invalidated, no
qualification is marked unqualified, no requirement is reopened. Those are
determinations people make, and two of them belong to engines that already
own that question. `DR-EXP-001` fires when an observation violates an
expectation's comparison and says so explicitly in its own explanation: *"The
expectation's status has not been changed — whether this constitutes a breach
is an engineering determination."*

### Freshness: a fingerprint scoped to drift, not to the project

`driftFreshnessOf` is derived at read time, never stored — there is no stale
column, because a stored flag would mean mutating a record that must not
change. It reports `UNKNOWN` outright when the stored `driftVersion` differs
from the current `DRIFT_VERSION` (assessments are only comparable within a
version) or when either fingerprint is empty; otherwise `CURRENT` or `STALE`
by direct comparison of `driftFingerprint(basis)` against the value stored on
the assessment.

`driftFingerprint` hashes exactly what an evaluation rested on: the drift
version, the baseline's id and status, every member with both its baselined
*and* current fingerprint, and every observation consumed with its own
revision stamp. Time is never included, so two digests taken a moment apart
from unchanged state match — otherwise every assessment would be stale the
instant it was written. Crucially, an artifact that is neither a baseline
member nor an observation subject cannot move this digest at all, so unrelated
project activity never stales a drift assessment.

This is deliberately its **own** function rather than a reuse of
`computeProjectFingerprint` (`project-revision.repository.ts`), which backs
change-impact analysis and is consumed by the readiness engines. That one is
blunt on purpose: for every table an analysis could have read, it hashes the
row count and the newest `updatedAt` across the *whole project*, so an edit
anywhere moves it. That bluntness is the right, conservative choice there — a
false "stale" costs one re-run, while a false "current" would present a
defunct impact analysis as though it still held, and a per-finding
fingerprint would be as expensive as re-walking the graph. Drift needed the
opposite property: its basis is narrow and known in advance — one baseline's
members, and the project's observations — so a fingerprint that moved on
unrelated activity would stale assessments for no reason a reader could see.
Reusing the project-wide digest would have made every drift assessment go
stale the moment anyone touched anything in the project, which would make the
freshness signal worthless.

### Relationship to other engines

- **Change Impact Analysis.** Drift reads only *declared* impacts
  (`loadChangeContext`), never runs or reads a computed impact analysis. A
  drifted baseline object that is also the target of a declared impact on an
  in-flight change surfaces as `DR-CTX-001` context — "it may have changed
  through that change request" — and nothing more. The change engine remains
  the change engine.
- **Assumption Monitoring.** `DR-CTX-002` surfaces the assumptions behind a
  decision whose expectation an observation concerns, as context worth
  re-reading — and **never** invalidates one. Assumption monitoring remains
  the sole owner of assumption status; the finding's own basis marker,
  `ASSUMPTION_VALIDITY_NOT_EVALUATED`, says so explicitly.
- **Verification Readiness / Technical Readiness.** Not integrated with any
  new rule in this pass. Drift assessments are exposed through the graph
  (`DRIFT_ASSESSMENT` / `DRIFT_FINDING` nodes) so a later readiness rule could
  consume them, the same way technical readiness consumes verification
  readiness and change-impact verdicts today — but none does yet.
- **Graph.** Five new node types (`ENGINEERING_BASELINE`, `BASELINE_MEMBER`,
  `OPERATIONAL_OBSERVATION`, `DRIFT_ASSESSMENT`, `DRIFT_FINDING`, all in the
  `DRIFT` domain) and six edges exist for traversal only, and are explicitly
  **inert** under impact-analysis propagation — `propagates: false,
  context: false` on every one of them:

  | Edge | Meaning |
  | --- | --- |
  | `BASELINE_HAS_MEMBER` | Baseline → Member |
  | `BASELINE_MEMBER_REFERENCES_OBJECT` | Member → the engineering object it snapshots |
  | `OBSERVATION_CONCERNS_OBJECT` | Observation → the object it was recorded about |
  | `DRIFT_ASSESSMENT_AGAINST_BASELINE` | Assessment → Baseline it compared against |
  | `DRIFT_ASSESSMENT_HAS_FINDING` | Assessment → Finding |
  | `DRIFT_FINDING_CONCERNS_OBJECT` | Finding → the object or observation it concerns |

  The impact-policy comments are explicit about why: a baseline records what
  was approved, an observation records what somebody saw, and a drift finding
  records that those two disagree — none of them *causes* an engineering
  change, so none can carry impact forward, and none is admitted as context
  either, or every observation ever recorded about a design item would bury
  the impact report for an unrelated change under operational history. The
  practical consequence: **a drift finding can never become an impact root**,
  and the change engine remains the change engine.

### No telemetry, no ML

Observations are recorded manually by people. There is no ingestion pipeline,
no time series store, no event bus, no sample table, and no anomaly detection
— no score, no confidence and no probability anywhere in the schema, the API,
or the interface. Every finding is a comparison a reader could repeat by hand
from the two values printed beside it, and the `*_NOT_EVALUATED` basis markers
(`ASSUMPTION_VALIDITY_NOT_EVALUATED`, `OBSERVATION_NOT_REVIEWED`, and so on)
exist specifically to carry the negative space — what the engine deliberately
did **not** decide — which for this capability matters as much as what it did.

### Drift API

| Method | Path |
| --- | --- |
| GET, POST | `/api/projects/:projectId/baselines` |
| GET, PATCH | `/api/projects/:projectId/baselines/:baselineId` |
| POST | `/api/projects/:projectId/baselines/:baselineId/activate` |
| POST | `/api/projects/:projectId/baselines/:baselineId/supersede` |
| GET, POST | `/api/projects/:projectId/baselines/:baselineId/members` |
| DELETE | `/api/projects/:projectId/baselines/:baselineId/members/:memberId` |
| GET | `/api/projects/:projectId/baseline-member-targets` |
| GET, POST | `/api/projects/:projectId/observations` |
| GET, PATCH | `/api/projects/:projectId/observations/:observationId` |
| POST | `/api/projects/:projectId/observations/:observationId/review` |
| POST | `/api/projects/:projectId/observations/:observationId/reject` |
| POST | `/api/projects/:projectId/drift/evaluate` |
| GET | `/api/projects/:projectId/drift/latest` |
| GET | `/api/projects/:projectId/drift` |
| GET | `/api/projects/:projectId/drift/:assessmentId` |

`activate` takes `{ supersedeActive?: boolean }` and nothing else. `evaluate`
takes `{ baselineId: string }` and nothing else — the backend owns rule
selection entirely; there is no request shape that could add to or subtract
from `DRIFT_RULES`. `latest` and the bare `drift` (history) route both accept
an optional `?baselineId=` query parameter to narrow to one baseline. Every
route is authenticated, organization- and project-scoped through
`requireProjectInOrganization`, and holds no Prisma. There is no PATCH, PUT or
DELETE on a baseline member, an assessment or a finding — deletion of a member
goes through its own `DELETE` route and only while the parent baseline is
`DRAFT`; assessments and findings have no mutation route of any kind, because
immutability here is structural rather than a convention.

### Drift UI

Three workspaces: `/projects/:projectId/baselines`,
`/projects/:projectId/observations`, and `/projects/:projectId/drift`. Nothing
evaluates automatically on page load — choosing a baseline in the drift
workspace only *reads* the latest recorded assessment for it; running the
comparison is its own explicit "Evaluate drift" action, and a baseline that
has never been evaluated says so in words rather than rendering an empty
findings table that would read as "nothing has drifted". A stale assessment
(one whose recomputed fingerprint no longer matches what is stored) is shown
as stale, with the same explicit control to re-evaluate rather than the page
recomputing it on its own. `DriftStatusBadge`, `DriftFindingStatusBadge`,
`DriftCategoryBadge`, `BaselineStatusBadge`, `ObservationStatusBadge` and
`DriftFreshnessBadge` (`src/components/common/drift-badges.tsx`) render every
status as text and colour — no score, no percentage, no progress bar anywhere
in the interface.

## Certification workspace

A first-class internal certification/compliance capability, built **on top of**
the engineering system rather than beside it. It answers, from records that
already exist, the chain a certification reviewer actually has to walk:

```
Certification basis → compliance obligation → applicability →
requirement / design / verification / decision → evidence →
finding / gap → disposition → certification readiness
```

**What this deliberately is not.** Not a document management system, not a
compliance-consultant CRM, not a static PDF checklist, not a claim of
regulatory approval, and not an automated certification authority. Every
status in this capability is an internal workspace state. `CertificationReview`
answers "ready for internal review" — never "certified", never "FAA
compliant", never "EASA approved". Nothing in the domain, the services, the
API, or the frontend is permitted to render any of those phrases as a verdict,
and this was verified directly: every occurrence of "certified", "FAA",
"EASA" and "regulatory approval" across the capability's source is either a
disclaiming comment, a UI string that explicitly denies the claim, a test
asserting the claim's absence, or free text a user typed into
`sourceReference` (a document/authority locator this system stores as an
opaque string and never interprets).

**What this never duplicates.** Requirement statements, decision rationale,
verification records, design records and evidence contents all remain owned
by their existing modules. A `ComplianceItem` references what it depends on
through the same shape of typed relationship table the rest of this schema
already uses; it never copies a record's content. The only thing this
capability snapshots is a `CertificationReview`'s own basis — identity, state
and revision stamps, not artifact content — for exactly the reason
`DriftAssessment` and `TechnicalReadinessAssessment` snapshot theirs: so a
historical review can explain what it rested on after the record has moved on.

### Certification programme and basis

`CertificationProgram` is the project's certification effort. It is
deliberately singular — `@@unique([projectId])` at the database level, backing
an API surface that is itself singular
(`GET/POST/PATCH /certification/program`, no id) — because a project runs one
certification workspace, not a competing set of them. Its status
(`DRAFT`/`ACTIVE`/`ON_HOLD`/`CLOSED`) is an internal workflow state; `CLOSED`
is terminal, so the record of when and why an effort ended is never
overwritten by reopening it.

`CertificationBasis` is the standard being tracked — `DRAFT` while assembled,
`ACTIVE` once fixed, `SUPERSEDED` once replaced — mirroring
`EngineeringBaseline`'s lifecycle field for field, including the self-relation
supersession (`supersededById`) and the explicit `supersedeActive: true` flag
activation requires when another basis is already active. The reason is the
same one drift's baseline gives: a basis that could still move after
activation would make every compliance item tracked against it ambiguous
about what it was actually tracked against. `sourceReference` is a
document/authority locator — this system stores no regulation text and no
files, exactly as `Evidence.sourceReference` stores no files for engineering
evidence.

### Compliance items — the central obligation, and its one absolute rule

A `ComplianceItem` carries four fields a person sets, and that a person alone
sets:

- `applicability` (`APPLICABLE`/`NOT_APPLICABLE`/`UNDETERMINED`) with a
  `applicabilityRationale`, an `applicabilityReviewerId` and an
  `applicabilityReviewedAt` — all four written together, in the same request,
  because a determination recorded with no accountable author and no moment
  would be worse than no determination at all.
- `method` (`ANALYSIS`/`TEST`/`INSPECTION`/`DEMONSTRATION`/
  `REVIEW_OF_DESIGN`/`DOCUMENTATION`/`OTHER`) — describes *how* compliance is
  established, never asserts *that* it has been.
- `status` (`OPEN`/`IN_PROGRESS`/`SATISFIED`/`BLOCKED`/`WAIVED`/`CLOSED`) — a
  plain workflow state.
- `disposition` (`UNASSESSED`/`COMPLIANT`/`NON_COMPLIANT`/`NOT_APPLICABLE`/
  `OPEN_FINDING`) — the reviewer's explicit determination.

**None of the four is ever derived.** There is no code path anywhere in
`ComplianceItemService`, `compliance-item.repository.ts`, or
`CertificationReviewService` that sets any of them from a linked artifact's
own state. Setting a linked `Requirement` to `APPROVED`, or a linked
`VerificationActivity`'s readiness to `READY`, changes nothing on the
compliance item that references them — an integration test asserts this
explicitly by doing exactly that and re-reading the compliance item row
unchanged. The review engine reads these four fields; it does not write any
of them, on any path, ever. This is the single load-bearing invariant of the
entire capability, and every other design choice below exists in service of
keeping it true.

### Compliance links — eight typed relationships, one reused evidence store

A compliance item links to real engineering (and governance) objects through
eight typed relationships: `Requirement`, `VerificationActivity`, `Evidence`,
`EngineeringDecision`, `DesignItem`, `Risk`, `Issue`, `SupplierQualification`.
Seven of them are dedicated join tables —
`ComplianceItemRequirementLink`, `ComplianceItemVerificationLink`,
`ComplianceItemDecisionLink`, `ComplianceItemDesignLink`,
`ComplianceItemRiskLink`, `ComplianceItemIssueLink`,
`ComplianceItemSupplierQualificationLink` — the same one-table-per-relationship
shape `RiskRequirementLink` and `SuppliedItemDesignLink` already use elsewhere
in this schema. There is no polymorphic `entityType`/`entityId` pair anywhere
in this capability.

The eighth, Evidence, is deliberately **not** a ninth table. It reuses the
existing `evidence_links` table via a new nullable `complianceItemId` column,
exactly as `SuppliedItem` and `SupplierQualification` already do — there is no
certification-specific evidence store, and file storage remains explicitly
out of scope. The table's `evidence_links_exactly_one_subject` CHECK
constraint was widened (dropped and re-added, since PostgreSQL has no other
way to widen a CHECK) to include the new column; the widening is a strict
superset of the previous constraint, so no existing row could ever violate it.

The composite id a client sees for a link (`"REQUIREMENT:cljk3f9..."`) is not
a database id — it is the link type and the underlying row's id joined the
same way `graphNodeKey` already joins a node's type and id elsewhere in this
codebase, and it is what `DELETE .../links/[linkId]` parses back apart to know
which of the eight tables to delete from.

### Certification findings

A `CertificationFinding` is an unresolved certification/compliance concern
against one compliance item. Its severity (`LOW`/`MEDIUM`/`HIGH`/`CRITICAL`)
is an explicit human classification — there is no numeric score anywhere on
this record, and no code path derives severity from anything. `OPEN` and
`IN_PROGRESS` findings are editable; `RESOLVED` and `ACCEPTED` are not, and
both transitions require a note, stamp the actor from the authenticated
context (never from the request body) and stamp the moment. There is no
delete anywhere for this record — no repository function, no service method,
no route — so a finding never silently disappears, only ever gets an
explicit, attributed disposition.

### The internal certification review

`CertificationReview` answers one question: given the compliance items
recorded against the active certification basis, and the engineering state
actually on record for what they link to, is this workspace ready for
internal review? It is immutable once written — a new evaluation creates a
new row — and it is never triggered automatically; the frontend evaluates
only on an explicit user action, exactly like every other assessment engine
in this codebase.

**The rule registry.** Every finding the review emits comes from
`CERTIFICATION_REVIEW_RULES`, looked up by id inside a private `emitFinding`
closure that throws `CertificationReviewFailure` on any id the registry does
not define — the same discipline `VERIFICATION_READINESS_RULES` and
`DRIFT_RULES` already enforce. The registry holds 39 concrete rule ids under
the `CR-<AREA>-<NNN>` convention, grouped by area: `CR-APL-*` (applicability),
`CR-MTH-*` (compliance method), `CR-LNK-001` (engineering linkage),
`CR-VER-*` (verification readiness), `CR-EVD-*` (evidence), `CR-FND-*`
(certification findings), `CR-CHG-*` (change impact), `CR-DRF-*` (drift),
`CR-SUP-*` (supplier qualification), `CR-REQ-*`/`CR-DEC-*`/`CR-DES-*`
(linked requirement/decision/design state), and `CR-ASM-*` (assumption
monitoring behind a linked decision). Every literal rule id passed to
`emitFinding` inside the service was cross-checked against the registry by
direct extraction and set comparison — zero fabricated or mistyped ids.

The registry is conservative by declared policy, not by accident:

- An `UNDETERMINED` applicability (`CR-APL-001`) and an `APPLICABLE` item with
  no engineering linkage at all (`CR-LNK-001`) or no compliance method
  (`CR-MTH-001`) are all `BLOCKING` — an empty or undecided certification
  record is never read as compliant.
- Conditions discovered by *other* engines — verification readiness, change
  impact, drift, supplier qualification, an assumption behind a linked
  decision — are always **surfaced**, never re-judged into `NON_COMPLIANT`.
  `CR-DRF-001` fires `WARNING` when drift is detected against a linked
  object, never higher; `CR-SUP-001`/`CR-SUP-002` fire `WARNING` for an
  expired or withdrawn qualification, using the spec's own phrase —
  "qualification status requires review" — never an automatic
  non-compliance verdict.
- A clean condition still gets an `INFORMATIONAL` row (`CR-APL-002`,
  `CR-MTH-002`, `CR-VER-004`, `CR-REQ-003`, and so on), so "we checked and it
  was fine" is distinguishable in the record from "we did not look".

**Status derivation.** `certificationReviewStatusFor` is centralized and
small: any `BLOCKING` finding → `NOT_READY`; otherwise any `UNKNOWN` →
`UNKNOWN`; an empty finding set → `UNKNOWN` (certification readiness is never
claimed from silence); otherwise → `READY`. Warnings never block on their own
— a rule that must block declares `BLOCKING` in the registry, not the service.

**Freshness.** `certificationFingerprint` is a SHA-256 digest over exactly
what a review evaluated — the compliance items and their four explicit
fields, every linked engineering object's state and revision, linked
evidence, consumed verification-readiness/change-impact/assumption-monitoring/
drift/supplier-qualification state, and open and dispositioned certification
findings — never wall-clock time, and never the project-wide
`computeProjectFingerprint` blunt instrument the change-impact engine uses for
its own, deliberately different, purpose. `certificationReviewFreshnessOf`
recomputes and compares at read time: a version mismatch is `UNKNOWN` (the
rule set itself differs, a stronger claim than "the same rules produced a
different result"); otherwise a fingerprint match is `CURRENT` and a mismatch
is `STALE`. An unrelated part of the project moving cannot stale a
certification review — only something inside its own narrow basis can.

### Graph integration

Six new node types (`CERTIFICATION_PROGRAM`, `CERTIFICATION_BASIS`,
`COMPLIANCE_ITEM`, `CERTIFICATION_FINDING`, `CERTIFICATION_REVIEW`,
`CERTIFICATION_REVIEW_FINDING`) and seven new edge types join the registry.
Six of the seven are fully inert
(`propagates: false, context: false`) — `CERTIFICATION_PROGRAM_HAS_BASIS`,
`CERTIFICATION_PROGRAM_HAS_REVIEW`, `CERTIFICATION_BASIS_HAS_COMPLIANCE_ITEM`,
`COMPLIANCE_ITEM_HAS_FINDING`, `CERTIFICATION_REVIEW_HAS_FINDING`,
`CERTIFICATION_REVIEW_FINDING_CONCERNS_OBJECT` — for the same reason every one
of drift's structural edges is inert: a certification record is evidence
*about* engineering, not an engineering object, and none of them causes a
change.

`COMPLIANCE_ITEM_LINKED_TO_OBJECT` is the one exception, and it is asymmetric
on purpose. Its canonical direction is `COMPLIANCE_ITEM → {REQUIREMENT,
VERIFICATION_ACTIVITY, EVIDENCE, ENGINEERING_DECISION, DESIGN_ITEM, RISK,
ISSUE, SUPPLIER_QUALIFICATION}`, and it never propagates forward — a
compliance item cannot cause an engineering change, because certification
stays downstream of engineering by design. But it *is* real dependency read
backwards (`context: true`): when the requirement, design item, decision,
verification activity, evidence, risk, issue or supplier qualification a
compliance item depends on changes, the compliance item becomes visible as
`UPSTREAM_CONTEXT` from that object — surfaced, never read as the item having
become non-compliant. `basisForNodeType` pairs this with the same
"present, not judged" marker discipline `SUPPLIER_QUALIFICATION` already
uses: reaching a `COMPLIANCE_ITEM` yields `CERTIFICATION_ITEM_PRESENT` +
`CERTIFICATION_ITEM_DISPOSITION_NOT_EVALUATED`.

`IMPACT_ENGINE_VERSION` moved from `"2"` to `"3"` for this addition, purely
additively — no existing edge's rule changed — because the set of
relationships the engine walks is part of what an analysis *means*, and a
result produced before certification records could be reached is not the
same statement as one produced after.

### Consumption from the other engines — never recomputation

- **Change impact.** The review reuses `loadChangeImpactContext` from
  `verification-readiness-basis.repository.ts` unmodified, over the same set
  of linked engineering objects `COMPLIANCE_ITEM_LINKED_TO_OBJECT` names.
  There is no second impact engine. A change reaching a linked object
  surfaces as `CR-CHG-001` (`WARNING`); a stale or absent analysis surfaces as
  `CR-CHG-002`/`CR-CHG-003` (`UNKNOWN`) rather than asserting either way.
- **Verification readiness.** For every *distinct* linked verification
  activity — not per compliance item — the review calls
  `VerificationReadinessService.getLatestVerificationReadiness` once. This
  mirrors `TechnicalReadinessService`'s own documented tradeoff at its
  `VERIFICATION_READY` gate exactly: reimplementing readiness's own freshness
  rule here would be the real duplication, and the cost is bounded by how
  many distinct activities are actually linked, not by the size of the
  project — the genuine target of "avoid N+1 queries", not a literal query
  count.
- **Technical readiness** is deliberately **not** consumed. Certification
  readiness has its own obligations, evidence and applicability, and mapping
  `TECHNICAL READY → CERTIFICATION READY` would collapse two different
  questions into one. Technical readiness remains a fully separate engine.
- **Assumption monitoring.** Batched by every linked decision's id
  (`loadAssumptionContext`, two queries regardless of how many decisions are
  in scope), never re-evaluated. `REVIEW_REQUIRED` surfaces as `CR-ASM-001`
  (`WARNING`); an `INVALIDATED` assumption status surfaces as `CR-ASM-004`
  (`WARNING`). Nothing here invalidates an assumption.
- **Drift.** The review reads the project's *active* `EngineeringBaseline`'s
  *latest* `DriftAssessment` and checks each linked object's own
  `baselineSubject` against it — it never runs a new drift evaluation. A
  `REVIEW_REQUIRED` drift finding concerning a linked object surfaces as
  `CR-DRF-001` (`WARNING`); operational deviation is never equated with
  certification failure.
- **Supplier qualification.** State is already joined by the same batched
  `loadReviewLinkage` read that resolves every other link type — no separate
  query. `EXPIRED`/`WITHDRAWN` surface as `CR-SUP-001`/`CR-SUP-002`
  (`WARNING`, "qualification status requires review"), never
  `NON_COMPLIANT`.

### API

| Method | Path | |
|---|---|---|
| GET/POST/PATCH | `/api/projects/[projectId]/certification/program` | the project's singular programme |
| GET/POST | `/api/projects/[projectId]/certification/bases` | |
| GET/PATCH | `/api/projects/[projectId]/certification/bases/[basisId]` | |
| POST | `/api/projects/[projectId]/certification/bases/[basisId]/activate` | |
| POST | `/api/projects/[projectId]/certification/bases/[basisId]/supersede` | |
| GET/POST | `/api/projects/[projectId]/certification/items` | `?basisId=` (default: active basis) |
| GET/PATCH | `/api/projects/[projectId]/certification/items/[itemId]` | |
| GET/POST | `/api/projects/[projectId]/certification/items/[itemId]/links` | |
| DELETE | `/api/projects/[projectId]/certification/items/[itemId]/links/[linkId]` | |
| GET | `/api/projects/[projectId]/certification/link-targets` | picker options, all 8 types |
| GET/POST | `/api/projects/[projectId]/certification/items/[itemId]/findings` | |
| PATCH | `/api/projects/[projectId]/certification/items/[itemId]/findings/[findingId]` | |
| POST | `/api/projects/[projectId]/certification/items/[itemId]/findings/[findingId]/resolve` | |
| POST | `/api/projects/[projectId]/certification/items/[itemId]/findings/[findingId]/accept` | |
| POST/GET | `/api/projects/[projectId]/certification/reviews` | POST evaluates — the only mutation |
| GET | `/api/projects/[projectId]/certification/reviews/latest` | |
| GET | `/api/projects/[projectId]/certification/reviews/[reviewId]` | |

Seventeen routes; no PATCH/PUT/DELETE exists anywhere under `.../reviews/**`
— review history is read-only by construction, not merely by convention.

### Frontend

Four pages under `/projects/[projectId]/certification`: the programme/basis
overview (create the programme, record and activate a basis), a compliance
items list (applicability/status/disposition filters, no search/pagination
yet), an item detail page that functions as the certification traceability
hub (applicability and method panels, the eight-type links panel, the
findings panel with resolve/accept dialogs), and the review workspace
(an explicit "Evaluate certification review" action, the latest verdict with
its freshness badge, a findings table, and history with a read-only historical
view). Nothing evaluates on page load anywhere in this capability. Every
create/edit dialog mounts its form body only while open, rather than
resetting fields with a `useEffect` — the same fix this codebase's drift
workspace needed for the same lint rule (`react-hooks/set-state-in-effect`).
No badge, label or copy anywhere in these four pages renders a percentage or
the words "certified", "FAA compliant" or "EASA approved" — verified directly
by grep and by a UI test asserting their absence on the rendered page.

## Decision Sentinel

An orchestration layer over the six assessment/review engines already in this
codebase — Change Impact Analysis, Assumption Monitoring, Verification
Readiness, Technical Readiness, Design/Operations Drift, Certification
Review — that turns "an engineer has to remember to re-run the right
analysis after something changes" into "the system names which analyses may
now be stale, and why":

```
engineering object changes → is this the kind of change a real engine's real
basis could reach? → does that engine's own real, already-stored assessment
actually reference the changed object? → open one surveillance target naming
the source, the domain, and the reason → an engineer acknowledges, dispatches
a real reevaluation, or resolves with a note
```

**Four things this deliberately is not**, stated once here because every
other design choice below exists to keep them true. **Not an autonomous
decision-maker** — it never approves, rejects, invalidates, certifies, or
declares failure; `SurveillanceTarget.reason` can say "verification
readiness should be reevaluated", never "verification is not ready". **Not
AI** — `SURVEILLANCE_DEPENDENCY_RULES` is a declared, deterministic table
looked up by source type, the same discipline `DRIFT_RULES` and
`CERTIFICATION_REVIEW_RULES` already hold to; there is no model call, no
inference, no probability anywhere in this capability. **Not an automatic
approval system** — reevaluation is always an explicit engineer action
(`POST .../reevaluate`); the Sentinel proposes a target, it never runs an
engine on its own initiative, and there is no cron, scheduler or background
worker anywhere in this capability that could. **Not a notification-spam
engine** — a surveillance target is one row with real provenance (a source
object, a source revision, a dependent domain, a reason), not an alert queue,
and a database-level partial unique index makes a second alert for the same
already-open signal structurally impossible rather than merely
discouraged.

**What this never does.** It never writes to a `Requirement`, a `DesignItem`,
an `EngineeringDecision`, a `DecisionAssumption`, an `EngineeringBaseline`, a
readiness verdict, or a certification disposition. The one place this service
calls another engine — `dispatchReevaluation`, a private method with exactly
six branches, one per target type — calls the real, unmodified public
`evaluate*` method of the real singleton service (`changeImpactAnalysisService`,
`verificationReadinessService`, `technicalReadinessService`,
`driftDetectionService`, `certificationReviewService`,
`assumptionMonitoringService`) and nothing else; there is no second
readiness/impact/drift/assumption/certification calculation anywhere in this
file, and a unit test asserts each branch's exact call shape against the real
engine's own request schema.

### Surveillance events

`SentinelEvent` is one immutable record of "something changed": a
`sourceType` (eleven of it — every engineering object type that already has
a stable `updatedAt` revision, or, for an observation, a meaningful
`createdAt`), a `sourceId`, and a `sourceRevision` that is either the
object's own `updatedAt` as an ISO string (a content change) or
`"audit:<auditLogId>"` (a relationship change, read from `AuditLog` rather
than any single row's own revision, since a link table has no owning row
whose `updatedAt` would capture "a link was added or removed"). Detection
events are never edited or deleted — rewriting one would destroy the
evidence that a change actually happened at a given moment — and they are
idempotent by construction: `@@unique([projectId, sourceType, sourceId,
sourceRevision])` backs `createManyAndReturn({ skipDuplicates: true })`, so
detecting the same revision twice (a concurrent call, a retried request)
writes it at most once, with no separate existence check and no
check-then-insert.

`eventType` is carried on the candidate at the point it is discovered, not
derived from `sourceType` alone when the event is written — the content-load
path and the relationship-load path both watch the same source types (a
requirement's own edit and a requirement's link addition are both
`sourceType: "REQUIREMENT"`), but they are genuinely different kinds of
change (`ENGINEERING_OBJECT_CHANGED` vs. `RELATIONSHIP_CHANGED`); deriving
the event type from `sourceType` alone at write time would make
`RELATIONSHIP_CHANGED` structurally unreachable — an actual bug this build
had for one commit, caught by the service unit test asserting the produced
`eventType` explicitly rather than trusting the mapping function.

`AuditLog` has no `projectId` column, only `organizationId`, so relationship
change detection first resolves the project's own requirement and decision
ids, then scopes the audit scan to `entityId IN (...)` — narrowed to this
project before the `organizationId` check is even applied, which is
therefore defense in depth, not the sole tenancy boundary.

### Surveillance targets

`SurveillanceTarget` is one signal: "this analysis/review may need
reevaluation, and here is why." Its lifecycle is four states — `OPEN` →
`ACKNOWLEDGED` → `RESOLVED`/`SUPERSEDED`, both terminal — with
`canTransitionSurveillanceTarget` as the single source of truth, the same
declared-transition-table shape `SURVEILLANCE_TARGET_TRANSITIONS` (not a
scattered set of ad hoc status checks) that `CertificationBasis` and
`EngineeringBaseline` already use for their own lifecycles.
`ACKNOWLEDGED` is explicitly **not** a claim that anything was fixed or is
safe — it means only "an engineer has seen this." `RESOLVED` always carries
a note: either the real evidence a fresh reevaluation produced, or an
engineer's explicit written judgement that no reevaluation was necessary;
there is no code path that resolves a target silently.

`supersededById` follows the same **many-to-one** self-relation cardinality
`EngineeringBaseline.supersededById` established — not `@unique`, with the
reverse relation `superseded SurveillanceTarget[]` as an array on the new
row — because a target's own history can carry more than one
superseded predecessor over the project's lifetime, and forcing a
one-to-one relation here would have been copying the wrong precedent.

### Dependency registry

`SURVEILLANCE_DEPENDENCY_RULES` is the single authoritative policy: 37 rows,
each a `{ sourceType, targetType, reason }` triple stating
once which changed source types *may* affect which of the six target
domains, and why, in plain engineering language a reviewer can check. It is
deliberately not "every relationship implies every engine" — a
`DecisionAssumption` cannot affect `DRIFT_ASSESSMENT` (drift compares
baselined engineering objects against observations, and an assumption is
neither), so no such row exists, and a domain test asserts this negative
directly. A row in the registry is a *may* affect, never a guarantee:
`evaluateTargetsForEvent` looks up candidates here, then confirms each one
against that specific target domain's own real, already-stored basis before
ever creating a row — "the registry says what is worth checking, not what is
true for every instance" is the load-bearing sentence of this capability,
matching the compliance-item invariant certification holds to the same
standard for a different reason.

### Target registry

`targetId` for each of the six target types is deliberately chosen to be
exactly the id the real engine's own `evaluate*` method already takes as its
argument — a `ChangeRequest` id for `IMPACT_ANALYSIS`, a
`DecisionAssumption` id for `ASSUMPTION_MONITORING`, a
`VerificationActivity` id for `VERIFICATION_READINESS`, the gate name itself
for `TECHNICAL_READINESS`, an `EngineeringBaseline` id for
`DRIFT_ASSESSMENT`, a `CertificationProgram` id for `CERTIFICATION_REVIEW`.
This is what turns `dispatchReevaluation` into a one-line-per-branch
`switch` rather than a lookup table of its own, and it is the reason
membership resolution for each target type reads that domain's *own*
storage shape rather than a generic one: relational membership checks
(`ImpactAnalysisRoot`/`ImpactFinding` rows for impact analysis,
`EngineeringBaselineMember` rows for drift) where relational data already
exists and is more reliable than assuming an unverified JSON shape, and
`basisContains(objects, sourceType, sourceId)` — one shared helper exploiting
the near-total structural consistency of `ReadinessBasisObject`,
`TechnicalScopeObject`, `CertificationBasisObject` and assumption
monitoring's `BasisObject` — everywhere a stored JSON basis genuinely is the
right shape to check.

### Detection

`detectProjectChanges` has two genuinely separate phases. First, *what
changed*: `loadContentChangeCandidates` runs ten parallel, project-scoped
`findMany` queries and keeps only rows where `updatedAt` has moved past
`createdAt`; `loadObservationCandidates` treats every observation as
inherently surveillance-worthy (recording one is the surveillance-worthy act
itself, not editing it); `loadRelationshipChangeCandidates` reads a curated,
explicit list of eight audit actions this codebase already emits
consistently (`requirement.link_added`/`link_removed`,
`decision.assumption_added`/`assumption_updated`,
`decision.expectation_set`/`expectation_cleared`, and their `link_added`/
`link_removed` decision counterparts) rather than attempting to parse every
action string this codebase's ~20 services happen to emit. Second, *what it
might affect*: each newly-created event is evaluated once, sequentially —
detection is an explicit, occasional action, the same philosophy
`AssumptionMonitoringService`'s own project sweep already follows, not a
per-request hot path that would justify parallelizing database load — against
`dependencyRulesFor(event.sourceType)`, and only a real membership match ever
reaches `upsertOpenTarget`.

### Reevaluation

`reEvaluateTarget` refuses a target that is not `OPEN` or `ACKNOWLEDGED`,
dispatches to the one real engine via `dispatchReevaluation`, and — on
success only — calls `resolveSurveillance` itself with an auto-generated
note (`"Resolved automatically: a new ... evaluation was run and reflects
the current engineering state."`). This is a deliberate reading of a
genuinely nuanced policy: reevaluation must never auto-resolve *merely
because an evaluation ran* (a failed evaluation leaves the target open, its
failure surfaced to the caller, never silently dropped), but a freshly-run
evaluation is, by construction, current relative to the specific change
that opened this particular target — the same "just written from this
basis, so it is current by construction" reasoning already established by
drift and readiness assessments about their own freshness. On failure the
target stays exactly where it was; nothing here retries or masks the
underlying engine's own error.

### Duplicate suppression

At most one `OPEN` row may exist for a given `(projectId, targetType,
targetId)` — enforced by `surveillance_targets_open_unique`, a **partial**
unique index (`WHERE status = 'OPEN'`), which cannot be expressed in
`schema.prisma`'s DSL and is hand-written into the migration instead.
`upsertOpenTarget` is deliberately raw SQL —
`INSERT ... ON CONFLICT ("projectId","targetType","targetId") WHERE
"status" = 'OPEN' DO UPDATE ... RETURNING "id", (xmax = 0) AS "inserted"` —
the standard PostgreSQL idiom for a race-safe insert-or-update against a
*filtered* index, which Prisma's own `upsert()` cannot express because it
only knows about constraints declared in the schema. This is explicitly not
a service-side check-then-insert: an integration test opens two identical
targets concurrently via `Promise.all` and asserts exactly one insert wins,
exactly one row exists afterward, and the database — not application
timing — is what guaranteed it. A fresh detection that reaches an object
whose target is already `OPEN` updates that row (`targetsUpdated`, not
`targetsOpened`) rather than duplicating it; a fresh detection reaching one
whose target is `ACKNOWLEDGED` opens a new row and immediately marks the old
one `SUPERSEDED` (`supersedeAcknowledged`), because acknowledging a signal
is explicitly not a claim that it is fixed, so a genuinely new change after
acknowledgement earns its own fresh signal rather than silently reusing the
stale one.

### Integration with the six engines

Every one of the six is consumed exactly twice, never duplicated: once for
*membership* (does this domain's own already-stored basis reference the
changed object?) and once for *reevaluation* (call the real `evaluate*`
method, unmodified). Change Impact Analysis is checked relationally against
`ImpactAnalysisRoot`/`ImpactFinding` rows of the latest `COMPLETED` analysis
for each active `ChangeRequest` — a `RUNNING` or absent analysis is never
consulted. Assumption Monitoring has one extra rule beyond basis membership:
a `DecisionAssumption`'s own change always concerns its own monitoring,
regardless of whether any assessment has ever run for it. Verification
Readiness and Technical Readiness both read `objects` off their own stored
JSON basis/scope via `basisContains`, resolved per distinct activity/gate the
same batching precedent certification's own review already established.
Drift is checked relationally against `EngineeringBaselineMember` rows of
the project's active baseline, with one unconditional rule: any new
observation is inherently drift-relevant by definition. Certification
Review distinguishes its own basis object (`CERTIFICATION_BASIS` — only the
*active* basis changing matters, and only the review's own linked
`objects` for every other source type) from every other domain's generic
basis check.

### API

| Method | Path | |
|---|---|---|
| GET | `/api/projects/[projectId]/sentinel` | real open/acknowledged counts |
| GET | `/api/projects/[projectId]/sentinel/open` | OPEN and ACKNOWLEDGED targets |
| GET | `/api/projects/[projectId]/sentinel/history` | RESOLVED and SUPERSEDED targets |
| POST | `/api/projects/[projectId]/sentinel/detect` | the only route that writes new detections |
| GET | `/api/projects/[projectId]/sentinel/[targetId]` | one target in full, with its source |
| POST | `/api/projects/[projectId]/sentinel/[targetId]/acknowledge` | `{note?}` |
| POST | `/api/projects/[projectId]/sentinel/[targetId]/resolve` | `{note}`, note required |
| POST | `/api/projects/[projectId]/sentinel/[targetId]/reevaluate` | dispatches, then resolves on success |

Eight routes — one beyond the seven named directly in the originating
specification, added because "reevaluation is always an explicit engineer
action" needs a route of its own to be explicit through, not folded into
acknowledge or resolve. No route here can rewrite an engineering object;
`readJsonBody` + a `z.strictObject` request schema on every mutating route
rejects any field beyond what each action actually accepts.

### Frontend

One workspace, `/projects/[projectId]/sentinel`: an explicit "Run detection"
action with the real summary it returns, an Open/Acknowledged list and a
Recently Resolved history list, and one card per target showing its type,
status, the real changed source (with a link to the source object where one
has a detail page), the real reason text from the registry, and
Acknowledge/Re-evaluate/Resolve actions gated by the same transition table
the service enforces. The Resolve dialog mounts its form body only while
open — the same fix this codebase's drift and certification workspaces
already needed for `react-hooks/set-state-in-effect` — and its submit button
stays disabled until a note is actually typed, matching the service's own
required-note rule rather than merely hoping the server rejects an empty
one. A compact `SentinelSummaryCard` on the project dashboard shows only the
two real counts the database holds — open and acknowledged — with an honest
"no open surveillance signals" state when both are zero, explicitly not a
health score, a risk rating, or a colour standing in for a number nobody
computed. Nothing in this workspace evaluates, acknowledges, resolves or
reevaluates on page load; every one of those four actions is a click.

## Risks and Issues

Two engineering records that were already fully modelled in the schema and
already consumed by the graph, change-impact, technical-readiness and
certification engines — but had no repository, no service, no API, and no
frontend of their own until this capability. Inspecting the schema first was
what made that possible: the `Risk` and `Issue` tables, their six link
tables (`RiskRequirementLink`, `RiskDesignLink`, `DecisionRiskLink`,
`IssueRequirementLink`, `IssueDesignLink`, `DecisionIssueLink`), their
`ChangeRequestImpact`/`ComplianceItemRiskLink`/`ComplianceItemIssueLink`/
`SuppliedItemRiskLink` columns, their graph node types and every edge type
that reaches them, and the `TR-RSK-*`/`TR-ISS-*` technical-readiness rules
that already read them, all existed before this session touched a line of
code. **No schema change was needed for either entity** — the one migration
this capability required was unrelated to Risk or Issue themselves (see
Notes).

Risk answers "what could go wrong, why, what would happen, and what is
being done about it" (`title`, `description`, `cause`, `consequence`,
`status`). Issue answers "something has actually gone wrong or requires
resolution — what is it, who owns it, what is its disposition"
(`title`, `description`, `severity`, `status`). They are deliberately not
merged: a risk with no `severity` field and an issue with no `cause`/
`consequence` fields are two different questions, not one entity with
optional columns.

**What this deliberately is not.** Not a probability × impact matrix, not a
risk heatmap, not FMEA scoring, not automated risk ranking, not a
comment/chat system, not a Kanban board, not sprint planning. There is no
numeric field anywhere in either domain module, and `Issue.severity` is the
one classification either domain records — an explicit human choice with
four values, never a derived score. A domain test asserts directly that
`probability`, `impact`, `score` and `matrix` are all rejected by the create
schemas.

### Risk lifecycle

`RiskStatus` is `OPEN → MITIGATED → CLOSED`, `OPEN → ACCEPTED → CLOSED`, or
`OPEN → CLOSED` directly — mitigation and acceptance are two different
dispositions of the same open risk, and either can be closed out.
`RISK_TRANSITIONS` is the same deterministic table shape every other
lifecycle in this codebase uses (`REQUIREMENT_TRANSITIONS`,
`CHANGE_REQUEST_TRANSITIONS`, ...); `canTransitionRisk`/
`allowedRiskTransitions` are its only readers, and the service's
`transitionRisk` is the only write path — a generic `PATCH` cannot move a
risk through its lifecycle because `updateRiskRequestSchema` has no
`status` field at all. `CLOSED` is terminal: there is no `CLOSED → OPEN`
transition, matching the spec's explicit instruction not to invent a reopen
mechanism.

Editability is a single not-closed/closed gate rather than a field-by-field
matrix: `isRiskContentEditable`/`isRiskOwnerAssignable`/
`areRiskLinksEditable` are all `status !== "CLOSED"`. This is a deliberate
reading of "controlled content changes" — `OPEN`, `MITIGATED` and
`ACCEPTED` all reach an edit through the same validated, audited update
path (every edit is attributed to an actor and timestamped regardless of
status), which is the real control this domain enforces on a still-open
risk; a field-level permission matrix would be exactly the complexity the
spec asked not to build. `CLOSED` is the actual lock.

### Issue lifecycle

`IssueStatus` is `OPEN → IN_PROGRESS → RESOLVED → CLOSED`, with
`OPEN → RESOLVED` also legal directly — nothing in this domain requires a
visible investigation phase before a problem can be recorded as resolved.
`CLOSED` is terminal, with no reopen path, for the same reason as Risk.

Content stays editable only through `OPEN` and `IN_PROGRESS`; `RESOLVED`
and `CLOSED` are both read-only for `title`/`description`/`severity` —
editing a resolved issue's description would quietly rewrite what was
actually found, and the schema records no separate closure note, so there
is no carve-out to make room for. Ownership stays assignable one stage
further than content, the same broader-than-content shape
`Requirement.isOwnerAssignable` already uses: who is tracking a resolved
issue through to closure is organizational bookkeeping, not a change to
what was found, so `isIssueOwnerAssignable` is frozen only at `CLOSED`.

### Traceability

Both entities link to exactly three relations — `REQUIREMENT`,
`DESIGN_ITEM`, `ENGINEERING_DECISION` — through six real join tables that
already existed (`RiskRequirementLink`/`RiskDesignLink`/`DecisionRiskLink`,
and the Issue equivalents). None of the six carries a link type, only an
optional `note`, so `riskLinkRequestSchema`/`issueLinkRequestSchema` are one
flat shape rather than a discriminated union per relation. The composite id
a client sees for a link (`"REQUIREMENT:cljk3f9..."`) is not a database id —
it is the relation and the underlying row's id joined the same way
certification's compliance links already do (`riskLinkKey`/
`parseRiskLinkKey`, `issueLinkKey`/`parseIssueLinkKey`), which is what lets
`DELETE .../links/[linkId]` parse it back apart to know which of the three
tables to delete from. A target is always re-resolved inside the caller's
own project before a link is written (`riskLinkTargetExistsInProject`/
`issueLinkTargetExistsInProject`), so an id from another project is
rejected rather than silently linked.

`EngineeringDecision`'s own linking to Risk and Issue
(`DECISION_HAS_RISK`/`DECISION_HAS_ISSUE`-shaped links, via
`DecisionRiskLink`/`DecisionIssueLink`) already existed and needed no
change — a link created from either the risk's own `/links` endpoint or the
decision's own linking endpoint lands in the same table, so Decision Memory
continues to see real linked risks and issues without any change to its own
semantics.

### Graph integration

Risk and Issue were already registered graph node types, and every edge
that reaches them — `RISK_AFFECTS_REQUIREMENT`, `RISK_AFFECTS_DESIGN`,
`ISSUE_AFFECTS_REQUIREMENT`, `ISSUE_AFFECTS_DESIGN`,
`DECISION_AFFECTS_RISK`, `DECISION_AFFECTS_ISSUE`,
`SUPPLIED_ITEM_LINKED_TO_RISK`, `CHANGE_IMPACTS_OBJECT`, and the generic
`COMPLIANCE_ITEM_LINKED_TO_OBJECT` — was already declared and already
resolved end to end in `graph-repository.ts`/`graph-edge-resolvers.ts`.
**No new edge type was added**, matching the instruction to extend the
registry only where something was genuinely missing — nothing was. What
this capability adds is real data to traverse: before it, `prisma.risk`/
`prisma.issue` had no way to gain rows outside a raw insert, so every one of
those edges was reachable in principle but empty in practice. The one gap
this session found and closed was at the *routing* layer, not the
resolution layer — `graph-repository.test.ts` had zero tests proving which
tables get queried for a `RISK`/`ISSUE` node's outgoing and incoming edges
(unlike every other node type, which already had one), so that routing is
now directly tested, including the subtlety that
`complianceItemRiskLink`/`complianceItemIssueLink` belong to a risk's or
issue's *incoming* side (a compliance item points at them, not the reverse)
— caught by running the test against the real routing code rather than
assuming the direction.

### Change Impact integration

`ChangeRequestImpact.riskId`/`.issueId` and `CHANGE_IMPACTS_OBJECT`'s
`RISK`/`ISSUE` targets already existed; `changeRequestService.
addDeclaredImpact` already re-scoped a `RISK`/`ISSUE` target to the caller's
project before accepting it. **No `RiskImpactAnalysis` or
`IssueImpactAnalysis` was created** — a change declared to affect a risk or
an issue is analyzed by the one real `ChangeImpactAnalysisService`, the
same as any other declared target, and a risk/issue reached by propagation
(via `RISK_AFFECTS_REQUIREMENT` and friends) classifies and reports exactly
like any other cross-domain finding. This was previously provable only
with a synthetic in-memory graph; the PostgreSQL integration suite now
declares a real impact on a real risk and a real issue on a real change
request and reads the real `ImpactAnalysisRoot` rows back.

### Technical Readiness integration

`TR-RSK-001`/`TR-RSK-002`/`TR-RSK-003` and `TR-ISS-001`/`TR-ISS-002`/
`TR-ISS-003`/`TR-ISS-004` already existed in the rule registry, and
`technical-readiness-scope.repository.ts`'s `loadRisks`/`loadIssues` and
`TechnicalReadinessService`'s own scope builder already included every
non-closed risk and non-closed/non-resolved issue in a gate's real
`scope.objects` — already exercised with synthetic risk/issue records in
`technical-readiness.service.test.ts` before this session. **No new
scoring was added, and none was needed**: `TR-RSK-001` still blocks
`RELEASE_READY` on any `OPEN` risk without ranking it, and `TR-ISS-001`
still blocks every gate on an unresolved `CRITICAL` issue — the registry's
own conservative UNKNOWN-avoiding design (report what exists, decline to
threshold it) was already correct and is now exercised with real,
persisted rows in the PostgreSQL suite.

### Certification integration

`ComplianceItemRiskLink`/`ComplianceItemIssueLink` and `compliance-
link.repository.ts`'s create/delete/list dispatch for `RISK`/`ISSUE` link
types already existed and needed no change — `complianceItemService.
addLink({linkType: "RISK", ...})` now succeeds against a real risk, where
it previously had nothing real to link to. One thing this session
confirmed by reading `CertificationReviewService.resolveBasis` closely,
rather than assuming: **a risk or issue linked to a compliance item is
supporting context, and is deliberately excluded from the review's own
`basis.objects` snapshot and from `certificationFingerprint`** (the
comment there already says so — `ENGINEERING_BASIS_LINK_TYPES` excludes
`RISK`/`ISSUE` for exactly this reason). A risk or issue changing can
therefore never make a certification review stale. This mattered directly
for the Sentinel dependency registry below.

### Sentinel integration

`RISK` and `ISSUE` were added to `SURVEILLANCE_SOURCE_TYPES` (thirteen now,
were eleven), mapped to the existing `ENGINEERING_OBJECT_CHANGED` event
type — a risk or issue changing is a content change to an engineering
record, the same shape a requirement or design item's own change already
is, so no new event type was needed. `decisionSentinelService`'s
`loadContentChangeCandidates` now scans `prisma.risk`/`prisma.issue` for
the project alongside every other entity it already scanned.

Two dependency rows were added to `SURVEILLANCE_DEPENDENCY_RULES`:
`RISK`/`ISSUE` → `IMPACT_ANALYSIS` (checked relationally against
`ImpactAnalysisRoot`/`ImpactFinding`, exactly like every other impact-
analysis dependency) and `RISK`/`ISSUE` → `TECHNICAL_READINESS` (checked via
`basisContains` against a gate's real `scope.objects`, which — see above —
genuinely does include open risks and unresolved issues). **A third row,
`RISK`/`ISSUE` → `CERTIFICATION_REVIEW`, was deliberately not added.**
It was actually written first, and an early draft of the PostgreSQL
integration test caught the mistake before it shipped: since a certification
review's own basis and fingerprint exclude risk/issue links entirely (see
Certification integration above), that dependency row would have been
unreachable by construction — the exact shape of defect a prior session's
`RELATIONSHIP_CHANGED` bug already taught this build to watch for. The
registry comment records why the row is absent, a service unit test asserts
`dependencyRulesFor("RISK")`/`dependencyRulesFor("ISSUE")` do not contain
`CERTIFICATION_REVIEW`, and the integration suite proves directly that a
real risk linked to a real compliance item still opens no certification
signal when it changes.

### API

| Method | Path | |
|---|---|---|
| GET/POST | `/api/projects/[projectId]/risks` | |
| GET/PATCH | `/api/projects/[projectId]/risks/[riskId]` | content fields only |
| POST | `/api/projects/[projectId]/risks/[riskId]/transition` | the only path that moves status |
| POST | `/api/projects/[projectId]/risks/[riskId]/owner` | `{ownerId}`, nullable to clear |
| GET/POST | `/api/projects/[projectId]/risks/[riskId]/links` | |
| DELETE | `/api/projects/[projectId]/risks/[riskId]/links/[linkId]` | composite key |
| GET | `/api/projects/[projectId]/risk-link-targets` | project-scoped selector options |
| GET/POST | `/api/projects/[projectId]/issues` | `?status=`, `?severity=` |
| GET/PATCH | `/api/projects/[projectId]/issues/[issueId]` | content fields only |
| POST | `/api/projects/[projectId]/issues/[issueId]/transition` | |
| POST | `/api/projects/[projectId]/issues/[issueId]/owner` | |
| GET/POST | `/api/projects/[projectId]/issues/[issueId]/links` | |
| DELETE | `/api/projects/[projectId]/issues/[issueId]/links/[linkId]` | |
| GET | `/api/projects/[projectId]/issue-link-targets` | |

Sixteen routes plus the two link-target selectors — one route beyond each
entity's literal seven, matching the same reasoning the certification and
sentinel capabilities already established for their own extra routes:
`DELETE .../links/[linkId]` needs its own path segment for the composite
key, and a project-scoped picker route is what every other traceability
panel in this codebase already uses (`/link-targets`,
`/decision-link-targets`, `/supplied-item-link-targets`, ...). Every
mutating route validates through a `z.strictObject` schema; create accepts
no `status`, no `organizationId`, no `actorId`, no timestamps.

### Frontend

`/projects/[projectId]/risks` and `/projects/[projectId]/issues`, each with
a list (identifier/title/status[/severity]/owner/updated, with status and
severity filters, no numeric column) and a detail page (full content,
lifecycle controls offering only the transitions the server allows,
an owner card, a traceability panel, and audit history via the existing
`AuditEventDto`/history-list shape every other detail page already
renders — no new audit viewer was built). The project workspace module
list gained "Risks" and "Issues" entries between "Changes" and
"Suppliers". (The dashboard's "traceability workspace is not built yet"
empty state, current as of this build, was later replaced outright once
the [Traceability workspace](#traceability-workspace) shipped — see that
section.) No probability field, no impact field, no risk-matrix widget,
and no comment thread exist anywhere in either module.

## Traceability workspace

A real, project-scoped interface for asking "what does this affect, what
affects it, and why are they connected?" — built entirely on the
[Cross-domain product graph](#cross-domain-product-graph) above. There is no
second graph model, no second traversal engine, and no new edge type: every
relationship the workspace shows comes from the same four endpoints
`EngineeringGraphService` already served before this capability existed.

### What this deliberately is not

Not a node-link canvas. The specification for this capability was explicit
that a structured explorer is preferable to a decorative visualization, and
the existing frontend has no graph-rendering library to build one cleanly
with. The workspace is rows, panels and a breadcrumb — the same idiom every
other module in this codebase already uses for a list and a detail view.

Not a write path. Opening an object, changing direction, filtering, and
traversing are all reads. Nothing here is audited, because nothing here
mutates — the same rule the graph layer itself already followed.

### The root-object picker

The workspace's one new backend surface: `TraceabilityService.listSelectableRoots`
(`src/server/services/traceability.service.ts`) and
`GET /api/projects/:projectId/traceability/objects?type=:nodeType`. It exists
for exactly one reason — to populate "choose an object to start from" with real
records — and it is not a general listing API: every branch dispatches straight
into that module's own existing service (`requirementService.listRequirements`,
`riskService.listRisks`, `driftDetectionService.listBaselines`, and so on) and
normalizes the result to `{ id, identifier, label }`. No new Prisma query was
written for any of the seventeen types it supports.

Seventeen of the registry's twenty-nine node types are offered as roots —
exactly the ones with a genuine project-wide "list everything of this type"
capability already sitting in some other service. The remaining twelve are
not offered, each for a specific, checked reason recorded in
`TRACEABILITY_UNSELECTABLE_REASONS` (`src/domain/traceability.ts`): most are
listed only per parent (a decision's alternatives, a baseline's members, a
compliance item's findings), two have no listing service at all (`EVIDENCE`,
`APPROVAL`), and `PROJECT` has zero edges registered in
`GRAPH_EDGE_DEFINITIONS` — nothing currently points at it or from it, so it
would always resolve to an empty neighborhood. A domain test asserts these two
lists partition all twenty-nine node types exactly, so a future node type
added to the registry without being placed in one list or the other fails a
test rather than silently having no picker entry and no explanation.

Selectability and having a standalone detail page are independent.
`CERTIFICATION_BASIS`, `CERTIFICATION_REVIEW`, `OPERATIONAL_OBSERVATION` and
`DRIFT_ASSESSMENT` are all real picker roots with no dynamic route to open —
`traceabilityDetailRoute` returns `null` for them, and the UI simply omits the
"Open in module" button rather than fabricating a link.

Being excluded from the flat picker does not mean a type is unreachable.
`EngineeringGraphService.getNode` resolves all twenty-nine node types
uniformly, so a `DECISION_ALTERNATIVE` or a `DRIFT_FINDING`, once reached by
following a relationship from a supported root, is inspected and traversed
exactly like anything else — the picker only decides where a user can *start*.

### Exploring from an object

Two panels, both reading the unmodified graph API:

- **Direct relationships** — one hop, via the existing
  `…/graph/node/:type/:id/neighbors` endpoint. `OUTBOUND` / `INBOUND` / `BOTH`,
  with an optional relationship-type filter built from `edgeTypesFrom` /
  `edgeTypesInto` (so the filter can never offer a relationship the registry
  does not permit for this node) and a client-side connected-object-type
  filter over whatever the response actually contains. Each row shows the
  connected object's type, identifier and label, the relationship's own
  meaning (`GRAPH_EDGE_DEFINITIONS[type].meaning`, never invented text), its
  `linkType` and `note` where the underlying table carries one, and when it
  was recorded — real provenance, not a summary of it.
- **Extended neighborhood** — several hops at once, via the existing
  `POST …/graph/traverse` endpoint, bounded by `GRAPH_LIMITS` exactly as
  before (depth capped at 5, the same request-rejected-not-clamped rule). Each
  reached object shows its depth and the *shortest* chain of relationships
  that reached it — literally `TraversalNode.path`, unmodified — and a
  truncation banner names which cap stopped it, when one did.

Clicking a connected object's identifier navigates the workspace into it: the
current object becomes a breadcrumb entry, the new one is resolved and its own
relationships are fetched. A visible breadcrumb (not just a single "Back"
button) lets a user jump back to any earlier point in the walk, not only the
previous one. None of this required a client-side graph cache or a second copy
of any node — each hop is exactly one more read through the same two
endpoints.

### Node type and edge type labels

`graphNodeTypeLabel` / `graphEdgeTypeLabel` (`src/domain/traceability.ts`)
turn a registry constant into a phrase — `ENGINEERING_DECISION` to
"Engineering decision", `RISK_AFFECTS_REQUIREMENT` to "Risk affects
requirement" — by splitting and capitalizing the constant itself. Every node
and edge type in the registry was already named to read correctly this way, so
there is no separate hand-maintained label table to fall out of sync with
`GRAPH_NODE_TYPES` / `GRAPH_EDGE_TYPES` as they grow.

### Navigating to a real module

`traceabilityDetailRoute(type, projectId, id)` maps a node type to its real
dynamic route — `/projects/:id/requirements/:reqId`,
`/projects/:id/certification/items/:itemId`, and eleven others — or `null`
when no standalone detail page exists for that type. The map is a literal
table of the actual routes under `src/app/(workspace)/projects/[projectId]`,
not a naming convention applied blindly: a type with no matching `page.tsx`
gets `null`, never a guessed URL.

### API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/projects/:projectId/traceability/objects?type=:nodeType` | Real, project-scoped objects of one selectable type, for the picker |

Everything else the workspace calls — node resolution, one-hop neighbors,
bounded traversal — is the pre-existing graph API in
[Cross-domain product graph](#cross-domain-product-graph), completely
unmodified. No route, request shape, or response shape there changed.

### Frontend

`/projects/[projectId]/traceability`
(`src/app/(workspace)/projects/[projectId]/traceability/`): an object-type +
object picker, a current-object card visually distinguished from its
neighbors (a tinted, bordered card versus plain rows), the two relationship
panels above, and a breadcrumb. The top-level `/traceability` route — like
every other top-level module entry — is now a real `ModuleProjectPicker`
rather than a stub, and the project dashboard's module grid gained a
"Traceability" entry; the dashboard's former "a dedicated traceability
workspace is not built yet" empty state is gone because it no longer applies.

### Verification

No new domain model, no new Prisma table, and no schema change of any kind —
`prisma migrate diff --from-empty` before and after this capability produces
an identical script. The one new backend module
(`traceability.service.ts`) has its own unit suite mocking every sibling
service it dispatches to; the domain module
(`traceability.ts`) is tested for the partition invariant, the display
helpers, and the detail-route map; a PostgreSQL integration suite
(`src/tests/integration/traceability.test.ts`, skipped without a reachable
database) proves the picker against real service-created data across a
representative sample of the seventeen types, proves the "no certification
program yet" case returns an empty list rather than an error, proves
cross-project isolation, and composes the picker with the real, unmodified
graph service across a real multi-hop scenario — including a genuine
two-hop object whose shortest path is asserted edge-by-edge. A Playwright
spec (`traceability.spec.ts`) drives the real UI: build a slice, open an
object, inspect both directions, narrow by direction, traverse into a
connected object and back, run the bounded extended-neighborhood traversal
and find a real two-hop object, and confirm project isolation through both
the real API and the real UI's error state.

## Directory structure

```
prisma/schema.prisma        72 tables: tenancy, artifacts, traceability links,
                            impact analysis, assumption monitoring,
                            verification readiness, technical readiness,
                            supplier engineering, design / operations drift,
                            certification workspace, Decision Sentinel. Risk
                            and Issue were already among the 72 — this build
                            added no table for either.
prisma/migrations/          Initial migration + eleven additive migrations
prisma/seed.ts              Development seed: one org, one user, one empty project
prisma7.config.ts           Prisma CLI config (schema, migrations, seed, datasource)

src/domain/                 Entities, enums, identifiers, link + input validation
  shared/enums.ts             Value lists + union types + Zod schemas
  shared/identifier.ts        Entity ids vs project-scoped artifact identifiers
  links.ts                    Link classifications and link input validation
  change-request.ts           Change as an engineering event: lifecycle,
                              editability, declared-impact contracts
  impact-analysis.ts          THE propagation policy, classification
                              precedence, basis markers, limits, signature
  verification-readiness.ts   THE readiness rule registry, scope semantics,
                              status precedence, basis + fingerprint, freshness
  technical-readiness.ts      THE gate rule registry, gate vocabulary, status
                              precedence, scope + gate fingerprint, freshness
  supplier.ts                 Supplier / SuppliedItem / SupplierQualification,
                              request + typed relationship contracts
                              (engineering only — no procurement concept)
  drift.ts                    THE drift rule registry, baseline/observation/
                              finding types, exact-decimal comparison engine,
                              drift + object fingerprints, freshness
  certification.ts            THE certification review rule registry (39 ids),
                              programme/basis/item/finding/review types, the
                              explicit-never-derived applicability/method/
                              status/disposition contract, review fingerprint
                              + freshness
  sentinel.ts                  THE surveillance dependency registry (41
                              rows), event/target types + status transitions,
                              detection-vs-membership distinction (Prisma-free,
                              no AI, no autonomous decisions)
  risk.ts                      Lifecycle, not-closed/closed editability,
                              owner contract, three-relation link contract
                              (Risk itself is typed in artifacts.ts, unchanged)
  issue.ts                     Lifecycle (incl. OPEN -> RESOLVED direct),
                              editability, owner contract, three-relation
                              link contract (Issue itself is typed in
                              artifacts.ts, unchanged)
  graph.ts                    Node/edge types, THE edge registry, traversal +
                              consistency contracts (Prisma-free)
  traceability.ts              Selectable-root allow-list + documented
                              exclusion reasons, node/edge label helpers,
                              the real-detail-route map (Prisma-free; adds
                              no graph structure of its own)

src/server/
  errors.ts                   AppError + typed subclasses (400/401/403/404/409)
  validation.ts               parseOrThrow: Zod failure → ValidationError
  api/response.ts             JSON responses, error→status translation, body parsing
  context/                    OrganizationContext (type only — the tenancy contract)
  auth/                       password (Argon2id), session tokens, cookies,
                              context resolver, sign-in throttle
  services/                   project + auth application services,
                              engineering-graph.service.ts (BFS, caps,
                              consistency rules),
                              change-request.service.ts (lifecycle, declared
                              impacts, target validation),
                              change-impact-analysis.service.ts (the engine),
                              verification-readiness.service.ts (rule
                              evaluation over a bounded, batched basis walk),
                              technical-readiness.service.ts (gate evaluation:
                              resolve scope, run the registry, append),
                              supplier.service.ts / supplied-item.service.ts /
                              supplier-qualification.service.ts (parent
                              integrity, typed links, no derived status),
                              drift-detection.service.ts (baseline + observation
                              lifecycle, rule evaluation: read, compare, append
                              — no comparison policy of its own),
                              certification-program.service.ts /
                              certification-basis.service.ts (singleton
                              programme, basis lifecycle + supersession),
                              compliance-item.service.ts (the four
                              explicit-never-derived fields; typed link
                              add/remove re-resolved in-project),
                              certification-finding.service.ts (resolve/accept:
                              note + actor + timestamp, no delete),
                              certification-review.service.ts (resolve a
                              batched basis across five other engines, run the
                              39-rule registry, append — recomputes none of
                              them),
                              decision-sentinel.service.ts (detect real
                              changes, confirm real membership before opening
                              a target, dispatch reevaluation to one of the
                              six real engines unmodified — no seventh
                              calculation of its own),
                              risk.service.ts / issue.service.ts (create,
                              list, get, content-update, transition,
                              assign/clear owner, link/unlink — a
                              cross-org owner or a cross-project link target
                              is re-resolved and rejected, never trusted),
                              traceability.service.ts (the root-object
                              picker: dispatches to seventeen other
                              services' own list methods, normalizes the
                              result — no Prisma query of its own)
  repositories/               Project, Requirement, EngineeringDecision,
                              ChangeRequest, Organization, User, Session, AuditLog
                              + mappers, Prisma error translation
    graph-edge-resolvers.ts     One explicit resolver per edge type
    graph-repository.ts         Node loaders, batched edge reads, audit scan
    impact-analysis.repository.ts   Immutable analyses, roots, bulk findings
    verification-readiness.repository.ts        Immutable assessments + findings
    verification-readiness-basis.repository.ts  Batched state reads the rules
                                    need, plus the change-impact context
    technical-readiness.repository.ts       Immutable gate assessments +
                                    findings; latest/history/detail by gate
    technical-readiness-scope.repository.ts Batched project-scoped state reads
                                    the gate rules need (one query per type)
    supplier.repository.ts          Suppliers + real item/qualification counts
    supplied-item.repository.ts     Items and their five typed join tables
    supplier-qualification.repository.ts  Qualifications + evidence links
    engineering-baseline.repository.ts    Baselines: create/list/find, activate,
                                    supersede (no delete — RESTRICT on assessments)
    baseline-member.repository.ts         Membership + loadBaselineableObjects
                                    (the object fingerprint reduction, batched
                                    by type)
    operational-observation.repository.ts Observations: exact-decimal NUMERIC
                                    read back as string, typed subject columns
    drift-assessment.repository.ts        Immutable assessments + findings,
                                    declared change-impact context (read-only)
    certification-program.repository.ts   The projectId-unique singleton
    certification-basis.repository.ts     Lifecycle + self-relation supersession
    compliance-item.repository.ts         Items; findItemInProject walks
                                    basis → programme → project
    compliance-link.repository.ts         Eight-table dispatch: create/delete/
                                    list/exists per link type, plus the
                                    batched loadReviewLinkage (8 queries, any
                                    item count)
    certification-finding.repository.ts   Findings; dispositionFinding is the
                                    only write path once OPEN
    certification-review.repository.ts    Immutable reviews + findings
    certification-review-basis.repository.ts  Batched assumption-monitoring
                                    context for the review's linked decisions
    sentinel-event.repository.ts    Append-only; createManyAndReturn +
                                    skipDuplicates for race-safe idempotency
    surveillance-target.repository.ts  upsertOpenTarget: raw SQL
                                    INSERT...ON CONFLICT against the partial
                                    unique index (Prisma's own upsert() can't
                                    target a filtered index); supersession
    project-revision.repository.ts  SHA-256 project fingerprint (freshness)
    risk.repository.ts / issue.repository.ts  CRUD + the three-table link
                                    dispatch (create/exists/delete/list),
                                    each target re-resolved inside the
                                    scoped project
src/middleware.ts             Edge: CSRF origin check + cookie-less redirect

src/app/
  (marketing)/                Public landing page
  (auth)/                     Real sign-in and sign-up forms (public)
  (workspace)/                Authenticated shell; session-gated in its layout
  api/auth/                   sign-up, sign-in, sign-out, session
  api/health/route.ts         Real healthcheck (degrades gracefully)
  api/projects/               Project REST endpoints (see API layer above)
  api/projects/[projectId]/graph/   node, neighbors, traverse, consistency
  api/projects/[projectId]/changes/ list, create, read, update, transition,
                              declared impacts (add/list/remove),
                              impact-analysis (run/history/latest)
  api/projects/[projectId]/impact-analyses/[analysisId]  one analysis in full
  api/projects/[projectId]/verification-activities/[activityId]/readiness
                              evaluate (POST), history (GET), latest (GET)
  api/projects/[projectId]/verification-readiness/[assessmentId]
                              one readiness assessment in full, with its basis
  api/projects/[projectId]/technical-readiness
                              evaluate a gate (POST), gate history (GET),
                              latest?gate= (GET), [assessmentId] in full (GET)
  api/projects/[projectId]/suppliers          list/create, read/update
  api/projects/[projectId]/supplied-items     list/create, read/update,
                              [suppliedItemId]/links (typed add/remove)
  api/projects/[projectId]/supplier-qualifications
                              list/create, read/update,
                              [qualificationId]/evidence (attach/detach)
  api/projects/[projectId]/baselines          list/create, read/update,
                              [baselineId]/activate (POST), [baselineId]/supersede
                              (POST), [baselineId]/members (list/add),
                              [baselineId]/members/[memberId] (DELETE)
  api/projects/[projectId]/baseline-member-targets
                              objects in this project eligible for baseline
                              membership
  api/projects/[projectId]/observations       list/create, read/update,
                              [observationId]/review (POST),
                              [observationId]/reject (POST)
  api/projects/[projectId]/drift
                              evaluate (POST), latest?baselineId= (GET),
                              history?baselineId= (GET), [assessmentId] in
                              full (GET)
  api/projects/[projectId]/certification/program
                              GET/POST/PATCH — the project's singular programme
  api/projects/[projectId]/certification/bases
                              list/create, read/update, [basisId]/activate
                              (POST), [basisId]/supersede (POST)
  api/projects/[projectId]/certification/items
                              list/create (?basisId=, default active), read/
                              update, [itemId]/links (list/add),
                              [itemId]/links/[linkId] (DELETE)
  api/projects/[projectId]/certification/link-targets
                              objects in this project eligible for a
                              compliance link, keyed by all eight link types
  api/projects/[projectId]/certification/items/[itemId]/findings
                              list/create, update, [findingId]/resolve
                              (POST), [findingId]/accept (POST)
  api/projects/[projectId]/certification/reviews
                              evaluate (POST — the only mutation), history
                              (GET), latest (GET), [reviewId] in full (GET)
  api/projects/[projectId]/sentinel
                              real open/acknowledged counts (GET), open
                              (GET), history (GET), detect (POST — the only
                              route that writes new detections),
                              [targetId] in full (GET), [targetId]/acknowledge
                              (POST), [targetId]/resolve (POST),
                              [targetId]/reevaluate (POST — dispatches to the
                              real engine, resolves on success)
  api/projects/[projectId]/risks
                              list/create (?status=), read/update,
                              [riskId]/transition (POST), [riskId]/owner
                              (POST), [riskId]/links (list/add),
                              [riskId]/links/[linkId] (DELETE)
  api/projects/[projectId]/risk-link-targets
                              requirements/design items/decisions eligible
                              for a risk link
  api/projects/[projectId]/issues
                              list/create (?status=, ?severity=), read/update,
                              [issueId]/transition (POST), [issueId]/owner
                              (POST), [issueId]/links (list/add),
                              [issueId]/links/[linkId] (DELETE)
  api/projects/[projectId]/issue-link-targets
                              requirements/design items/decisions eligible
                              for an issue link
  api/projects/[projectId]/traceability/objects
                              real, project-scoped objects of one
                              selectable node type, for the Traceability
                              workspace's own picker only — relationship
                              reads go through the unmodified graph routes
                              above

src/components/ui|common/   shadcn/ui-style primitives and shared wrappers
src/lib/                    db.ts (Prisma singleton), logger.ts, utils.ts,
                            api/ (browser-side API client — never imports server code)
```

## Notes

- `src/generated/prisma` is generated by `prisma generate` — gitignored, never edited.
- Migrations have **not** been applied to any database — no PostgreSQL instance
  has been available. The initial one was generated offline with
  `prisma migrate diff`; its three CHECK constraints are hand-written, so
  re-apply them if it is ever regenerated. The authentication migration
  (`20260901000000_add_authentication`) is hand-written and purely additive: two
  new tables, no change to any existing column or relationship. The verification
  readiness migration (`20260905000000_add_verification_readiness`) is likewise
  hand-written and purely additive — five enums and two tables, with
  `verification_activities` untouched — and its statements were checked
  statement-for-statement against what `prisma migrate diff` generates from the
  schema, including PostgreSQL's 63-character truncation of one index name. The
  technical readiness migration (`20260906000000_add_technical_readiness`) is
  additive in the same way: five enums and two tables
  (`technical_readiness_assessments`, `technical_readiness_findings`) plus their
  foreign keys into `projects` and `users`, with no existing table, column,
  index, constraint or enum altered or dropped — and deliberately **not** a reuse
  of `verification_readiness_assessments`, whose subject and rule set are
  different. The supplier engineering migration
  (`20260907000000_add_supplier_engineering`) adds five enums, eight tables and
  four nullable columns, and is the one migration that **replaces** two existing
  constraints: the `exactly_one_subject` CHECK on `evidence_links` and the
  `exactly_one_target` CHECK on `change_request_impacts`. Each enforces "exactly
  one is set" over a fixed column list, so adding a nullable column without
  widening it would leave the new column permanently unusable. Both replacements
  are strict supersets, so every row that satisfied the old constraint satisfies
  the new one and no existing data can be invalidated. Its index and constraint
  names were checked name-for-name against what `prisma migrate diff` generates
  from the schema, including PostgreSQL's 63-character truncation of
  `supplied_item_requirement_links_suppliedItemId_requirementI_key`. The design /
  operations drift migration (`20260908000000_add_design_operations_drift`) is
  additive in the same way: nine enums, five new tables
  (`engineering_baselines`, `engineering_baseline_members`,
  `operational_observations`, `drift_assessments`, `drift_findings`) plus their
  foreign keys into `projects`, `users`, `design_items`, `decision_expectations`
  and `supplied_items`, and one nullable column —
  `decision_expectations.comparisonOperator` — added to an existing table. No
  existing table, column, index, constraint or enum is altered or dropped. Its
  one CHECK constraint, `operational_observations_at_most_one_subject`, is new
  rather than a replacement: it allows **at most** one of `designItemId` /
  `decisionExpectationId` / `suppliedItemId`, deliberately weaker than the
  `exactly_one_subject` / `exactly_one_target` constraints above, because an
  observation naming no subject yet is still a real record. The certification
  workspace migration (`20260909000000_add_certification_workspace`) is
  additive in the same way: eleven enums, thirteen new tables
  (`certification_programs`, `certification_bases`, `compliance_items`, the
  seven `compliance_item_*_links` join tables, `certification_findings`,
  `certification_reviews`, `certification_review_findings`) plus their foreign
  keys into `projects`, `users`, `requirements`, `verification_activities`,
  `engineering_decisions`, `design_items`, `risks`, `issues`,
  `supplier_qualifications` and `evidence`, and one nullable column —
  `evidence_links.complianceItemId` — added to an existing table. No existing
  table, column, index, constraint or enum is altered or dropped. Its one
  CHECK constraint change widens `evidence_links_exactly_one_subject` (dropped
  and re-added, the only way PostgreSQL expresses a CHECK widening) to add the
  new column as a sixth alternative; the widened form is a strict superset of
  the previous one, so no existing row can violate it. Every enum, table and
  column addition in this migration was cross-checked against a fresh
  `prisma migrate diff --from-empty` output, line for line. The Decision
  Sentinel migration (`20260910000000_add_decision_sentinel`) is additive in
  the same way: four enums and two new tables (`sentinel_events`,
  `surveillance_targets`) plus their foreign keys into `projects` and `users`,
  with no existing table, column, index, constraint or enum altered or
  dropped. Its four auto-generated indexes and seven foreign keys were
  cross-checked column-for-column against a fresh
  `prisma migrate diff --from-empty` output. It adds exactly one hand-written
  statement beyond what that diff produces:
  `surveillance_targets_open_unique`, a **partial** unique index
  (`WHERE "status" = 'OPEN'`) on `("projectId", "targetType", "targetId")` —
  Prisma's `schema.prisma` DSL has no syntax for a filtered index, so this is
  the one constraint in this migration that could not be diffed against the
  schema and was instead verified by a concurrent-race integration test
  asserting the database itself allows at most one `OPEN` row. The Risks and
  Issues capability needed no table, column, index or constraint change at
  all — `Risk`, `Issue` and every link table they use already existed. Its
  one migration (`20260911000000_add_risk_issue_to_sentinel`) is unrelated
  to either entity: it widens the existing `SurveillanceSourceType` enum
  with two `ALTER TYPE ... ADD VALUE` statements (`RISK`, `ISSUE`) so the
  Decision Sentinel can record a change to one, exactly the same enum-
  widening shape (an addition, never a removal) used elsewhere in this
  schema's history. The Traceability workspace needed no schema change at
  all — it reads the existing graph API and existing services' own listing
  methods, and adds no table, column, enum or migration. CI re-checks every
  migration against the schema with a shadow database on every run.
- Cross-project integrity on the supplier relationship tables is enforced in the
  services — every parent and link target is re-resolved inside the scoped
  project before a write — and any row that still crossed a project is reported
  by the graph consistency check as a `CROSS_PROJECT_ENDPOINT` anomaly. This is
  the same mechanism every other relationship table uses. Composite foreign keys
  onto `(id, projectId)` would work, but only there, leaving one table protected
  by the database and twenty by the service layer — an inconsistency that reads
  as a guarantee the system does not actually make.
- **Local setup:** `npm run db:migrate:deploy`, set `SEED_*` variables (see
  `.env.example`), `npm run db:seed`, then sign in at `/sign-in`. The seed
  refuses to run without an explicitly supplied password — there is no default
  credential anywhere in this repository. For anything beyond local
  development, register through `/sign-up` instead of seeding.
- The dashboard reads real endpoints only (`/api/health`, `/api/projects`), with
  genuine loading, empty and error states. It shows a project count only when
  the database actually returns projects; with no database reachable it reports
  the error rather than rendering a zero or a placeholder figure.
