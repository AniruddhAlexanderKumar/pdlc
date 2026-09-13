# Security

How PDLC Platform is built to resist misuse, and what it does and does not
protect against. For how to deploy it, see [DEPLOYMENT.md](./DEPLOYMENT.md);
for how the system is built generally, see [ARCHITECTURE.md](./ARCHITECTURE.md).
This document does not duplicate either — it states the security-relevant
facts and points at the code that makes them true.

## Data ownership

Every piece of engineering data this system holds — requirements, decisions,
verification results, evidence records, certification data, audit history —
lives in the PostgreSQL database the operator provisions and controls.
Nothing is replicated to, or depends on, a third-party service for the
application to function. There is no managed database, no managed
authentication provider, and no external API this system calls to do its
job. PostgreSQL is the sole, authoritative store of record; this codebase
introduces no second copy of engineering data anywhere.

## Threat model

Trust boundaries this system actually has, and what crosses each:

| Boundary | Crosses it | Enforced by |
| --- | --- | --- |
| Unauthenticated internet → API | An unsigned request | `requireAuthenticatedContext()`; only `/api/auth/*` and `/api/health*` skip it |
| Authenticated user → organization | Session cookie resolves to a `User` row | `resolveSession` against the hashed token, server-side expiry |
| Organization member → project | `ProjectMembership` row, or organization `OWNER` | `authorization.service.ts`'s `requireProject*Access` |
| Project role → mutation tier | `VIEWER`/`REVIEWER`/`ENGINEER`/`MANAGER` | Per-action `require*Access` call at every service entry point |
| Browser ↔ API | Cookie, CSRF origin check | `SameSite=Lax` + `src/middleware.ts`'s origin comparison |
| Application ↔ PostgreSQL | The one thing every layer above ultimately gates | Prisma, parameterized, project/org id always in the `WHERE` |
| Evidence reference ↔ reality | Never crossed by this system | No fetch, no verification — see "Evidence storage limitation" |
| CI/deployment environment | Build- and deploy-time secrets | See "Dependency and CI/CD supply chain" below |

Attack classes considered, and where each is addressed in this document:
authentication bypass and session theft/fixation ("Authentication");
authorization bypass, IDOR, cross-org and cross-project access
("Authorization"); CSRF ("Authentication" — origin check); SQL/script
injection and unsafe URL handling ("Injection"); mass assignment
("Data integrity"); audit tampering, lifecycle bypass and race conditions
("Data integrity" — audit log, concurrency); information leakage
("Error handling and logging"); denial-of-service through unbounded
queries (addressed in Prompt 27's performance-hardening pass — pagination
bounds, batched queries, graph traversal caps — and not repeated here);
secret leakage ("Dependency and CI/CD supply chain", DEPLOYMENT.md's
environment variable handling). Replay of a session token is bounded by
server-side expiry and the token's own unforgeability (32 bytes of CSPRNG
output); there is no separate replay-detection mechanism because a stolen,
unexpired token *is* a valid session by this model's own design — the
mitigation is preventing theft (`httpOnly`, `Secure`, no token in logs),
not detecting reuse of one already stolen.

## Authentication

Self-hosted, first-party, password-based — no third-party identity provider
of any kind (`src/server/services/auth.service.ts`, `src/server/auth/`).

- **Passwords**: Argon2id via `@node-rs/argon2`, an in-process Rust
  implementation — no password ever leaves this application to be hashed.
  Parameters follow the OWASP Password Storage Cheat Sheet (19 MiB / t=2 /
  p=1; `src/server/auth/password.ts`). Never stored or logged in plaintext
  anywhere in this codebase.
- **Sign-in timing**: `signIn` always performs a real Argon2id verification,
  against the account's own hash when one exists and against a fixed decoy
  hash otherwise (`verifyPasswordSafely`). Without this, a request for an
  email with no account would return before a real hash computation,
  while a request for a real email with the wrong password would not — an
  easily-measurable timing gap that leaked which email addresses have
  accounts, despite every response carrying an identical generic message.
- **Sessions**: opaque, 32 bytes of CSPRNG output, never a JWT and never
  derived from user data. Only the SHA-256 hash of a token is ever
  persisted (`src/server/auth/session.ts`) — a database dump yields no
  usable cookies. There is no signing secret to configure, leak, or rotate.
  Expiry is enforced server-side against the stored `expiresAt` on every
  resolution; an expired session is deleted on sight. `signIn` always
  issues a brand-new token (never reuses or upgrades a pre-existing
  cookie), which is what rules out session fixation.
- **Logout** deletes the session row server-side, then clears the cookie —
  the row's absence is what actually invalidates the session; a copy of
  the cookie surviving somewhere is inert once it is gone.
- **Rate limiting**: an in-process, in-memory throttle on failed sign-in
  attempts (10 per 15 minutes per email; `src/server/auth/rate-limit.ts`).
  **Single-instance only** — it does not survive a restart and is not
  shared across instances. A multi-instance deployment needs a real
  rate-limiting layer in front of the sign-in endpoint (reverse proxy, WAF,
  or a shared store); this codebase does not provide one and does not
  claim to. Documented in the module itself, not silently assumed.
- **Origin checking**: every state-changing (`POST`/`PUT`/`PATCH`/`DELETE`)
  request to `/api/*` is rejected if its `Origin` header disagrees with its
  `Host` (`src/middleware.ts`) — the second CSRF layer behind
  `SameSite=Lax`, which already stops the cookie riding along on a
  cross-site POST.
- **Error messages**: every sign-in failure — unknown email, no credential
  row, wrong password, rate-limited — produces the identical 401 and
  message, so the endpoint cannot be used to enumerate which addresses
  have accounts (beyond the timing property above, which the constant-time
  decoy closes).

## Authorization

Two independent axes, enforced server-side on every mutation and read that
matters, never trusted from the client:

- **Organization**: `OWNER` / `MEMBER`. An organization owner administers
  membership and billing-adjacent concerns; a member's access is entirely
  a function of which projects they belong to.
- **Project role**: `MANAGER` > `ENGINEER` / `REVIEWER` > `VIEWER`, resolved
  per project per user from `ProjectMembership`, never inferred from
  organization role alone. `src/server/services/authorization.service.ts`
  is the single decision point every service calls through
  (`requireProjectReadAccess`/`WriteAccess`/`ApproveAccess`/`ManageAccess`);
  no service constructs its own authorization logic. See
  ARCHITECTURE.md's "Engineering Access Control" section for the full role
  matrix and which action requires which tier.

**IDOR resistance**: every object lookup is scoped by both the caller's
authorized project *and* the object's own id in the same query — never "find
this id" alone. A nested route (`/projects/:projectId/evidence/:evidenceId`)
double-checks both: an id that resolves to a real record in a *different*
project than the one named in the URL is treated identically to an id that
does not exist at all (`NotFoundError`, not `ForbiddenError` — existence
inside another tenant's data is not confirmed or denied differently).
Verified in `src/tests/integration/access-control.test.ts`'s IDOR-specific
block, across direct, nested, and linked-object ids.

## Data integrity

- **Audit log**: every mutation writes its audit row in the same database
  transaction as the mutation itself — never a best-effort side call that
  could succeed while the audit write fails, or vice versa. The actor
  recorded is always the authenticated caller from server-side session
  context, never a client-supplied field — no request schema anywhere in
  `src/domain/` accepts an `actorId`. There is no update or delete path for
  an `AuditLog` row anywhere in the service layer.
- **Immutable/historical records**: `AuditLog`, every persisted assessment
  (`TechnicalReadinessAssessment`, `VerificationReadinessAssessment`,
  `DriftAssessment`, `ImpactAnalysis`/`ImpactFinding`,
  `AssumptionMonitoringRecord`, `CertificationReview`), and `Evidence` once
  `VALIDATED` are never edited or deleted in place — a re-evaluation
  appends a new row; a superseded record points at its successor and stays
  exactly as it was. Enforced by the service layer having no update/delete
  path for these tables, not by a database permission alone.
- **Concurrency**: lifecycle transitions (Requirement, EngineeringDecision,
  Risk, Issue, ChangeRequest, Evidence, CertificationFinding,
  VerificationActivity, CertificationProgram) use a guarded conditional
  update — the write only applies if the row is still in the status the
  decision was based on — so two callers racing a transition of the same
  object cannot have one silently overwrite the other; the loser gets a
  real `ConflictError`. Two singleton invariants ("at most one ACTIVE
  baseline per project", "at most one ACTIVE certification basis per
  program") and Sentinel's "at most one OPEN surveillance target per
  domain object" are enforced by partial unique indexes at the database
  level, not a service-side check alone.
- **Mass assignment**: every client-facing request schema is a Zod
  `strictObject` — an unrecognized field (a client-chosen `id`,
  `projectId`, `organizationId`, lifecycle `status`, timestamp, or role) is
  rejected outright, not silently stripped. Verified directly against the
  real schemas in `src/tests/security/mass-assignment.test.ts`.

## Injection

- **SQL**: Prisma's query builder parameterizes every value by
  construction. The one raw-SQL usage in the codebase
  (`surveillance-target.repository.ts`'s `upsertOpenTarget`, needed for a
  race-safe `INSERT ... ON CONFLICT` against a partial index Prisma's typed
  `upsert()` cannot target) uses a tagged template, which Prisma
  parameterizes the same way; no string concatenation into SQL exists
  anywhere in this codebase.
- **Script/HTML**: no `dangerouslySetInnerHTML`, no raw HTML injection, and
  no `eval`/`new Function` anywhere in the codebase — every user-entered
  title, description, note, and reference string is rendered through
  React's default (auto-escaping) text interpolation.
- **URL/reference safety**: evidence's `sourceReference` (and every other
  external-locator field) is rendered as inert text, never as a clickable
  `href` — this system never turns user-supplied text into a link a
  browser would navigate to, so a `javascript:` or similar scheme in a
  reference field has nothing to execute through. The server never fetches
  a user-supplied URL (evidence references are explicitly metadata this
  system does not verify — see "Evidence storage" below); there is no
  server-side request forgery (SSRF) surface via evidence or any other
  reference field.

## Error handling and logging

Every route handler funnels a thrown value through one function
(`src/server/api/response.ts`'s `errorResponse`): a known `AppError` keeps
its real status/code/message; anything else — a raw Prisma error, a driver
exception, a plain `Error`, a non-Error thrown value — is logged in full
server-side and reported to the client as a generic 500 with no stack
trace, no SQL detail, and no internal identifier. Verified directly in
`src/server/api/response.test.ts`, including that a database error
containing a connection string or constraint name never reaches the
client's JSON body.

`src/lib/logger.ts` never logs passwords (hashed in-process, plaintext
never reaches a log call), session tokens (only their SHA-256 hash is ever
persisted, and that hash is never logged either), `DATABASE_URL`, or
evidence/document content (this system never holds evidence content to
begin with — see below). Every request gets a server-generated correlation
id (never a client-supplied one), logged once and echoed back as the
`x-request-id` response header for support diagnostics.

## Session model

Cookie-based, `httpOnly` + `SameSite=Lax` in every environment, `Secure` in
production (`src/server/auth/cookies.ts`, verified per-environment in
`cookies.test.ts`). No token is ever placed anywhere a script can read it.

## Security headers

Applied to every response (`next.config.ts`): `Content-Security-Policy`,
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive
`Permissions-Policy`. The CSP is stated honestly rather than claimed
perfect: `script-src` and `style-src` both need `'unsafe-inline'` — Next.js
injects its hydration payload as an inline script with no nonce wired
through, and Radix UI (a real dependency) sets inline `style` attributes
for portalled positioning. Every other directive is as strict as the
application allows, including `frame-ancestors 'none'` for clickjacking.

## Evidence storage limitation

Stated here because a security document is exactly where this gets assumed
otherwise: **this system stores evidence as metadata/reference records
only. It has never stored evidence file contents.** A `sourceReference` is
a pointer an engineer typed — a document id, a path, a URL — to something
that lives outside this system, never verified or fetched by it. This is
not a storage bug to be hardened; it is the current, disclosed shape of the
product. See ARCHITECTURE.md's Evidence section for the full reasoning.

## Backups

The application implements no backup automation. See DEPLOYMENT.md's
"Backups" section for the documented `pg_dump`/`pg_restore` procedure —
running it on a schedule, and verifying restores, is an operator
responsibility this codebase does not and cannot discharge for you.

## Dependency and CI/CD supply chain

- `npm audit` currently reports one advisory pair (high + moderate) in
  `mysql2`, reachable only as a transitive dependency of the `prisma` CLI
  package (which bundles driver support for every database Prisma can
  target, not just the one this project uses). `mysql2` is never imported
  or invoked anywhere in this codebase — there is no MySQL connection
  string, ever — and is absent from the production Docker image entirely
  (the image ships only `next build`'s traced runtime dependencies, which
  do not include the `prisma` CLI package). `npm audit fix --force`'s
  proposed remediation is a major downgrade of `prisma` itself (7.x → 6.x),
  which this project does not accept as a fix. Tracked as a known,
  unexploitable-in-this-application risk pending an upstream Prisma
  release with an updated `mysql2` dependency.
- CI (`.github/workflows/ci.yml`) declares explicit least-privilege
  `permissions: contents: read` at the workflow level, uses the safe
  `pull_request` trigger (never `pull_request_target`, which would run
  fork PR code with repository secrets), and interpolates no untrusted,
  attacker-controllable string (PR title/body, branch name) into a shell
  command anywhere.
- The production Docker image (`Dockerfile`) runs as a non-root user, ships
  only the production dependency trace `output: "standalone"` computes
  (never the full `npm ci` tree, never `devDependencies`), copies no
  environment file or secret (`.dockerignore` excludes `.env*`), and
  exposes exactly the one port the application listens on.

## Known, disclosed limitations

- **Rate limiting is single-instance** — see "Authentication" above.
- **No file/binary storage** — see "Evidence storage limitation" above.
- **No down-migrations** — a migration failure or an unwanted schema
  change is recovered by restoring a backup or authoring a new forward
  migration, never an automatic rollback. See DEPLOYMENT.md's "Migration"
  section.
- **CSP requires `'unsafe-inline'`** for two directives — see "Security
  headers" above.
- **This codebase holds no compliance certification and claims none.**
  Aerospace-domain terminology in this product (certification basis,
  compliance items, traceability) describes what the *product* helps an
  operator track about *their own* certification process — it is not a
  claim that this software itself has been certified against any standard
  (DO-178C, AS9100, SOC 2, ISO 27001, or otherwise).

## Reporting a vulnerability

This project does not yet have a dedicated security contact or disclosure
process. Until one exists, report a suspected vulnerability through
whatever channel you would use to reach the maintainers of this repository
directly, rather than filing a public issue — replace this paragraph with
a real contact (a security email alias, a private advisory link) once one
is established.
