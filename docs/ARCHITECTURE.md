# NexGen PLM — Systems Engineering Operating System
## Engineering Product Development Life Cycle (PDLC) Architecture

NexGen PLM is a full-lifecycle Engineering Operating System built for mission-critical engineering organizations. It connects every requirement, system architecture element, verification procedure, empirical execution record, safety hazard, quality nonconformance, engineering change, configuration baseline, and release decision into an authoritative, auditable relational graph.

---

## 1. Core Engineering Operating Principle

> **Every important engineering decision must have an owner, an appropriate status, a history, relevant evidence, and traceable relationships to the affected engineering objects.**

The system actively prevents:
- Unallocated requirements (orphaned specs without parent PBS components).
- Unjustified components without parent systems or allocated requirements.
- Fake verification pass states (every test must have physical measurements and observations).
- Silently waiving or bypassing blocking engineering failures.
- Uncontrolled baseline modifications (historical baselines are immutable snapshots).
- Release with open high/critical risks or unresolved nonconformances.

---

## 2. Technical Stack

| Tier | Technology | Description |
|---|---|---|
| **Frontend** | React 18, Vite 6, TypeScript | Strict typing, accessible mission-control UI, dark technical aesthetic |
| **Styling** | Tailwind CSS, JetBrains Mono, Inter | Precise geometry, technical accents, responsive console |
| **Backend** | Node.js (v22), Express, TypeScript | Modular REST API with typed Zod validation |
| **Authoritative DB** | PostgreSQL 17 | Full relational foreign keys, cascades, indexes, and ACID transactions |
| **ORM & Migrations**| Prisma ORM (v6) | Declarative schema, automated migrations, type-safe query generation |
| **Security** | bcryptjs, JWT, RBAC | Role-based access control, HTTP-only bearer authentication, audit logging |
| **Testing** | Vitest, Supertest | Unit tests, domain engine checks, API integration suites |

---

## 3. Authoritative Domain Engines

### 3.1 Server-Side Gate Evaluation Engine (`gateEngine.ts`)
Calculates lifecycle gate and release readiness by executing deterministic queries against PostgreSQL:
1. **Verification Test Execution Integrity**: Verifies zero procedures are in `Failed` or `Pending` state. If any test failed (e.g. `VRF-002`), flags mandatory release blocker `GATE-VRF-01`.
2. **Architecture Allocation Completeness**: Validates that 100% of requirements are allocated to valid PBS elements.
3. **Baselining Maturity**: Validates all requirements possess `Baselined` status.
4. **Safety & Risk Mitigation Posture**: Verifies zero `High` or `Critical` risks remain open without active mitigations.
5. **Quality Nonconformance Closure**: Ensures all open nonconformances (`NC-xxx`) are formally closed with verified corrective action evidence.

### 3.2 Automated Ripple Effect Impact Analysis Engine (`impactEngine.ts`)
Given an engineering change target (Requirement or Architecture Component), traverses the dependency graph:
- Directly affected PBS architecture elements.
- Invalidated verification procedures (automatically flags `requiresRetest: true`).
- Re-opened safety hazards (flags `reopenRisk: true`).
- Child/derived requirements depending on parent specs.

### 3.3 Requirement Quality Advisory Engine (`qualityEngine.ts`)
Analyzes requirement statements and highlights engineering defects:
- Ambiguous / subjective vocabulary: *"adequate", "sufficient", "fast", "easy", "good", "flexible"*.
- Missing normative constraint words (*"shall"* or *"must"*).
- Missing engineering rationale or design justification.
- Orphaned status (unallocated to PBS).
- Missing verification method.

### 3.4 Immutable Baseline Engine (`baselineEngine.ts`)
Captures an immutable JSON snapshot of all requirements, architecture elements, verification procs, and risks at the exact moment of milestone freeze. Supports field-level diffing between any two historical baselines.

---

## 4. Database Relational Entities

- `Organization`: Enterprise tenant (`AERO-SYS`).
- `User`: Engineers, Quality Managers, and Admins with bcrypt password hashes.
- `Project`: Root project definition (`PRJ-AERO-01`).
- `Opportunity`: Problem definition and feasibility record.
- `Requirement`: System requirement specifications (`REQ-001` - `REQ-004`).
- `ArchitectureElement`: Product Breakdown Structure hierarchy (`SYS-001` - `SYS-004`).
- `VerificationProcedure`: Formal verification test specifications (`VRF-001` - `VRF-003`).
- `VerificationExecution`: Immutable historical test run instances with measurements and outcomes.
- `Risk`: Technical and safety hazards with likelihood/severity matrix (`RSK-001` - `RSK-002`).
- `Nonconformance`: Quality anomaly investigations, containment, and dispositions (`NC-001`).
- `EngineeringChangeRequest`: Change proposals with computed ripple impacts (`ECR-001`).
- `EngineeringChangeOrder`: Authorized change implementation orders (`ECO-001`).
- `Baseline`: Immutable configuration freeze-frame snapshots (`BSL-001`).
- `ReleaseRecord`: Released configurations with frozen flight manifests (`REL-001`).
- `DocumentRecord`: Engineering drawings, ICDs, specifications, and checksums (`DOC-001`).
- `TaskItem`: Cross-functional engineering action items (`TSK-001`).
- `AuditEvent`: System-wide immutable ledger of actor actions and diffs.
