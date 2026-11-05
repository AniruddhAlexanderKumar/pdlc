# Parametric CAD feasibility and research package

**Status: research direction and first milestone approved, 2026-11-04.** The user conditioned application implementation on completed feasibility spikes and the necessary licensing review. The spikes and outstanding legal gate are recorded in [the feasibility and license review](04-spikes-and-license-review.md); no CAD application implementation is claimed.

## Contents

1. [Public product research and functional inventory](01-research-and-inventory.md) — evidence, observed interaction patterns, feature classification, and operation contracts.
2. [Proposed architecture and data contracts](02-architecture-and-contracts.md) — component and data-flow diagrams, technology evaluation, data model, security, APIs and regeneration design.
3. [Roadmap, acceptance tests and risks](03-roadmap-tests-and-risks.md) — staged delivery, acceptance criteria, mathematical test oracles, risks and review decisions.
4. [Milestone acceptance and feasibility/license review](04-spikes-and-license-review.md) — user-approved single-writer scope, measured experiments and the outstanding legal approval gate.
5. [CAD assistant integration plan](05-assistant-integration-plan.md) — prerequisites, real-state tutorial gates, secure action flow and staged implementation.

## Executive feasibility assessment

A serious browser CAD system is feasible as a staged, multi-disciplinary product, **not as a single implementation task**. The existing Solution Velocity app is a React/Vite and Express/PostgreSQL workspace for products, projects and issues. It currently has no CAD documents, geometry kernel, sketch solver, parametric history, assembly solver or drawing engine. Product tasks and project issues are not CAD features. No customer-visible CAD control should be exposed until its full operation is implemented and tested.

The highest risks are accurate constraint solving, B-rep topology identity through edits, robust geometric failure handling, reproducible evaluation across kernel versions, concurrency, secure resource isolation and preservation of model history. A rendering engine alone cannot solve these problems. A real MVP is a deliberately bounded subset: a constrained rectangle, an editable dimension, an actual kernel-generated extruded solid, and an upstream edit that regenerates the result through persistence and reopening. It is **not Onshape parity or production-ready engineering CAD**.

**Tentative architecture for review:** retain the current app's authenticated workspace boundary; add separate CAD documents and a server-authoritative, isolated native Open CASCADE Technology (OCCT) worker for B-rep evaluation. Use Three.js only for displaying/picking tessellation. Run interactive sketch solving locally only after a compatible solver is selected and evaluated, with authoritative server-side validation. Store source intent, derived B-rep and display mesh separately. Whether OCCT, a browser WASM build, or a particular constraint solver meets licensing, reliability and deployment requirements remains a gate; none has been added to the application.

## Evidence and limits

Research covers the user-requested subsystems using public vendor documentation and original upstream technology sources, checked on 2026-11-04. We did **not** sign in to Onshape, inspect its network traffic, decompile code, access private APIs, or reproduce proprietary assets. We did not perform hands-on product interaction, run geometry benchmarks, review every operation's help page, or review all licensing implications. Observations are cited; proposed behavior, algorithms and data contracts are explicitly our own. Detailed error handling and behavior under all possible topology changes cannot be inferred reliably from public UI descriptions. Further investigation is enumerated in the inventory and review gates. This is a scoped research baseline, **not a claim of a complete vendor inventory or exact functional parity**.

Existing access-request/education and language-removal work in the working tree is unrelated and has been preserved. No credentials, sample customer data, production records or external design assets were used.

## Decisions and outstanding gate — before application code

The user has approved the research direction and the rectangle-to-solid milestone, with tightened criteria in [the milestone document](04-spikes-and-license-review.md). The following decisions remain open, especially the necessary licensing review:

1. **MVP scope: approved.** Follow the narrowed rectangle → constraints → genuine extrusion → edit → regenerate → save/reopen gate and explicit numerical oracles.
2. **Engineering use:** prototypes/education only initially, or a specific safety-critical use? No engineering-safety claim or certified accuracy is proposed.
3. **Hosting and data:** acceptable server-worker deployment, geographic data residency, maximum expected design size and retention requirements.
4. **Licensing:** legal review of OCCT LGPL-2.1 + exception and any selected solver, third-party dependencies and distribution model. GPL-based solvers are not automatically approved.
5. **Collaboration: decided.** Initial milestone is single-writer, without branches, real-time editing or merging.
6. **Topology: decided for the milestone.** Extrusion references only the sketch profile; arbitrary face/edge referencing is out of scope. Future ambiguity must fail closed.

Application implementation starts only after the spikes and necessary licensing review are complete. Later work must remain additive, feature-gated, authenticated and tested; production and existing workspace data must not be replaced.
