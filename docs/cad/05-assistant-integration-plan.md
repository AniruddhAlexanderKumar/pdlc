# Built-in CAD assistant — implementation plan and prerequisites

**Status: design only, 2026-11-04. No CAD assistant is implemented.** The user requested an assistant integrated into a real CAD workspace, not a generic chat window or a simulated tutorial. Inspection of the current repository found an existing project/issue assistant and Help Centre, but no CAD workspace, document model, viewport, solver, feature evaluation pipeline, or CAD authorization model. The standalone solver and OCCT feasibility programs are research spikes; they are not an application. The prior milestone explicitly requires licensing review before CAD implementation and the rectangle-to-solid milestone before advancing to later capabilities. The necessary legal sign-off has not been provided. Do not create a launcher or tutorial that implies those capabilities exist.

This document plans the requested assistant as an **additive, future CAD integration**. It does not change the first substantive milestone or authorize advanced modeling or collaboration. All interface descriptions, contracts, events and APIs below are proposals, not current behavior. No in-product article should present an unimplemented capability as supported.

## Prerequisite and sequencing

1. Obtain and record the required OCCT and selected solver licensing/distribution review; resolve solver selection and artifact provenance as described in [the feasibility review](04-spikes-and-license-review.md).
2. Implement and pass the genuine single-writer, constrained rectangle → extrusion → upstream edit → regeneration → save/reopen milestone, including document authorization, source history, solver and kernel errors, and stable sketch/profile IDs. Until then there is no real CAD state for this assistant to consume.
3. Integrate the helper in the actual CAD workspace, in the user's stages below, with each increment independently tested. Early assistant capability may only refer to controls actually available in the current release. Do not introduce placeholder CAD operations or knowledge articles implying future features are supported.

## Existing integration surface

- `apps/server/src/routes/assistant.ts` provides an authenticated, workspace- and user-scoped project/issue conversation, help retrieval and explicitly confirmed project/issue actions. It does not have CAD document context, CAD permissions or CAD commands. Its action types and conversation schema cannot be assumed to cover CAD.
- `apps/server/src/services/assistant-ai.ts` and `assistant-providers.ts` provide configured model adapters and usage/allowance controls that can be evaluated for reuse; provider availability must remain optional. Do not send CAD data through an adapter until its disclosure, authorization and retention rules are explicitly designed.
- `apps/web/src/pages/Assistant.tsx` is the existing general assistant page, not a CAD-aware panel. The current Help Centre covers existing product features, not an implemented CAD knowledge base.
- The future CAD assistant must not repurpose project/issue identifiers as CAD document IDs, infer geometry from task data, or grant document access based on existing assistant conversation access. Existing app modules and data remain intact.

## Modular boundaries and state flow

```text
Actual CAD workspace (document + revision + current editor state)
 ├─ authenticated assistant panel / launcher / resizable pinned layout
 ├─ context adapter: current tool/plane/selection + evaluated status
 ├─ tutorial engine: derives progress from verified state/events
 ├─ highlight controller: resolves real registered controls/entities only
 ├─ deterministic documentation and diagnostics
 └─ optional AI conversation (advice only)
                     │
                     ▼
 CAD assistant API: authenticate → workspace/document authorization
 ├─ context reader: bounded revision-aware permission-checked projection
 ├─ conversation/progress store scoped by user + document
 ├─ AI adapter: explicit disclosure + minimal authorized context
 └─ action gateway: proposed typed action → explicit confirmation
                     │
                     ▼
 Existing CAD command gateway (once implemented): single-writer lease,
 validation, revision check → evaluation → commit → actual result
```

The assistant has **no direct kernel, database, shell, arbitrary code or object-storage access**. UI navigation and visual highlights are local, reversible and non-mutating; feature edits go only through the same validated CAD command pipeline as manual edits. The model never gets executable authority; model output is untrusted text, not a command. Show unconfirmed proposals separately from actual results. No CAD context is forwarded to a model without the user's authorized consent and a clear provider/data disclosure.

## Proposed context contract

The future workspace supplies a typed, versioned snapshot. Document identity and permissions are independently checked server-side; client context is an untrusted UI hint, never proof of authorization or committed geometry.

| Field | Source and availability rules |
|---|---|
| `documentId`, `revisionId`, `elementId` | Authorized committed document and its current immutable source revision; omission means no document context. |
| `mode`, `activeTool`, `activePlane` | Client editor state, explicitly marked UI-local; absent or unsupported values reported as unknown. |
| `selectedEntityIds` | Actual CAD selection, limited to current revision and types visible to this user; resolve through CAD selection service. |
| `sketch` | Entity/constraint summaries, driving dimensions and solver state from an actual evaluated sketch; solver DOF only when reported by solver. |
| `feature` / `history` | Supported feature type, parameters and dependency status from actual authorized source revision; bounded summaries only. |
| `evaluation` | `pending`, `valid`, `failed` or `blocked` plus structured diagnostic codes and source revision. Last-good geometry must be explicitly labelled stale. |
| `viewportMode` | UI-local camera and visibility mode; not a statement about model geometry. |
| `capabilities` | Server-validated installed feature/version flags controlling documentation, tutorial steps and actions. Planned/unsupported features cannot be advertised as working. |

Before displaying guidance, verify that context revision equals the displayed committed/evaluated revision. On mismatch, say the state is stale and refresh; do not fabricate inferred dimensions, geometry, solver degrees of freedom, diagnostics, or topology mappings. Context fields that are unavailable must remain unknown rather than fabricated defaults. Minimize provider payloads: user question, permitted bounded summaries, relevant supported documentation and diagnostic codes only; no full model, storage paths, kernel internals, credentials or unfiltered document contents. Explicitly indicate when external AI is used.

## First-model tutorial: evidence-based step completion

Progress is derived from actual state, not clicks, narration or a model's text. The exact predicates below assume the future CAD implementation emits authenticated and revision-bound structured results. If an operation fails, keep the step incomplete and show the actual diagnostic.

| Step | Proposed user guidance | Completion evidence |
|---|---|---|
| 1. Plane | Explain XY/YZ/XZ as concepts, but offer only implemented plane selection. Highlight XY if its registered control/geometry is currently available. | Current editor confirms an XY-plane sketch is active for the authorized document. |
| 2. Rectangle | Explain and highlight the supported line/rectangle creation controls. | Actual sketch contains four editable line segments with corresponding connected endpoints; not just a clicked rectangle button or visual silhouette. |
| 3. Constraints | Explain coincident, horizontal, vertical, origin anchor and driving dimensions; direct user to available constraint controls. | Actual sketch constraint records include those applied to the intended entity IDs and dimensions 10 mm and 20 mm. No synthetic state or unverified inference. |
| 4. Fully constrain | Explain actual solver status and report DOF only when provided. | Current-revision solver result confirms valid, fully constrained sketch with zero DOF; solver errors or unavailable status cannot pass. |
| 5. Extrude | Offer the implemented blind +normal extrusion only; describe depth 5 mm. Explain new/add/remove conceptually only if clearly identified as unsupported where appropriate. | Current source contains the accepted extrusion referencing this sketch profile, depth 5 mm; associated evaluation for that same revision succeeds. |
| 6. Verify solid | Explain B-rep vs visual mesh. | Kernel reports the evaluated source revision has one valid closed solid and kernel-computed volume; for acceptance test, expect 1,000 mm³ (or 1,200 mm³ after width edit). |
| 7. Save/reopen | Explain persisted editable source and history; route to actual save UI if needed. | Committed revision is durable and reopen from saved source has succeeded; opening a dialog or clicking Save alone is insufficient. |

Upstream edits can invalidate steps. On reopen, reload per-user tutorial state but re-evaluate applicable predicates against the authorized current revision. If state cannot be verified, mark it unknown, not complete. Tutorial step skip/repeat/restart affects only learning progress, never marks geometry work successful or modifies the model. Completion is per user, document and tutorial version; revoked document access must prevent both retrieval and resumption.

## Highlight and navigation rules

- The CAD workspace owns a registry of real toolbar controls, tree nodes and viewport entities keyed by stable, revision-bound identifiers; the assistant requests highlights but does not fabricate selections or coordinates.
- Resolve and validate each target against current mode, revision, document and user permissions. If missing, hidden, ambiguous or stale, show a text explanation and no highlight. Clear overlays when context changes, the tutorial closes, permissions change or the viewport is unmounted.
- Non-destructive overlays and labels are visually distinguishable from actual selection and support reduced motion, keyboard access and screen readers. The panel is collapsible, resizable, minimizable and pinnable without blocking normal viewport interaction. Camera demonstrations, if supported, require an explicit user action and restore/allow cancel of the previous camera; they never change geometry.
- The first milestone does not support arbitrary face/edge references. Do not highlight faces/edges as repair targets until the underlying selection and reference systems support them reliably. Sketch entity guidance must use unambiguous real entity IDs or decline the highlight.

## Diagnostics and supported knowledge

Use a registry of structured, actual error codes, not substring matches on speculative AI text. Suggested mappings only after the CAD engine provides them:

| Actual signal | Safe explanation | Recovery |
|---|---|---|
| solver reports underconstrained | Some motion remains; include DOF only if provided. | Suggest supported constraints; identify entities only when solver provides unambiguous IDs. |
| solver reports conflict or redundancy | Explain the reported classification and implicated constraints if available. | Offer navigation to those actual constraints; never silently delete them. |
| open profile | The evaluated profile is not closed, when the engine explicitly reports that cause. | Navigate to sketch and affected endpoints if provided; otherwise ask the user to inspect the contour. |
| invalid depth | Explain positive/finite requirements for the supported extrusion. | Open the existing feature editor; user changes input. |
| kernel failure with no specific cause | Evaluation failed; the precise cause is unavailable. | Provide feature ID, documented retry/recovery steps and technical diagnostic code without guessing. |
| missing/ambiguous reference | Only when the engine supplies that code. | Navigate to supported manual repair UI; future arbitrary topology references are outside the first milestone. |
| downstream blocked | Identify the first upstream failed feature and distinguish it from dependent blocked features. | Navigate to actual failing feature; do not assert each downstream feature independently failed. |

Articles are versioned, searchable, and tagged `supported`, `partial`, or `planned`. The in-product default lists only supported/partial operations, accurately explaining each supported subset, inputs, steps, common mistakes, terminology and related supported operations. Planned functionality, if deliberately exposed, must be clearly labelled and have no action button. No article for circles, arcs, revolve, Boolean, fillet, chamfer or advanced reference geometry may claim implementation until that capability is genuinely released. General engineering concepts can be explained as concepts, separately from application instructions.

## Controlled actions and consent

1. **Read/navigation:** only typed, allowlisted actions tied to actual capabilities, e.g. open available tool, open existing sketch editor, navigate to feature, or open an implemented article. Validate IDs and context freshness. Highlighting and opening a panel do not mutate geometry.
2. **Geometry changes:** construct a typed proposal with exact document/element ID, base revision, entity references, parameters and an expiration/idempotency key. Show proposed change, parameters and preview when available. The user must explicitly confirm; cancel or expiration makes no model change.
3. At confirmation, re-authenticate, re-authorize document and workspace, check the single-writer lease/fencing token and exact base revision, then call the same CAD command pipeline as the user interface. Never bypass dependency checks, validation, kernel evaluation or persistence. Stale revisions, expired access/leases, unsupported operations, missing references and evaluation errors produce an actual failure response and no successful-action claim.
4. Report success only after the command pipeline returns its committed revision and evaluation result. If evaluation is asynchronous, show pending and distinguish later success/failure. Do not expose raw model instructions or model-provided code to an evaluator. Provider tool requests are untrusted suggestions, validated against an allowlist and the current capability set.

## Delivery stages and test gates

These stages follow the requested assistant order, but start **after** the CAD prerequisites above:

1. **Interface/launcher:** embed in real CAD workspace; open/close, minimize, pin and resize with keyboard and screen-reader support; persist preferences without affecting model. No dead buttons for unavailable features.
2. **Context:** connect to real revision/selection/editor/solver/evaluation sources; mark unknown and stale data; enforce document authorization.
3. **Documentation/help:** searchable supported-capability articles and deterministic context cards; works with AI disabled.
4. **Tutorials/highlighting:** implement the first-model workflow and the state-based predicates above; test no click-only progress, invalidation, saved progress and real target selection.
5. **Diagnosis:** map actual solver/kernel/feature diagnostics with actionable but non-speculative guidance; test root vs downstream errors and missing information.
6. **AI:** use configured adapters only when enabled, with permission and data-disclosure controls, bounded prompt context, model output treated as untrusted and clear unavailable fallback. Test provider failure and prompt injection.
7. **Confirmed actions:** action schema, confirmation/cancel, permissions, lease/revision fences, revalidation and result verification. No NL-to-code execution.
8. **Hardening:** test usability, accessibility, performance, security, retry/crash behavior and audit/retention. Keep subsequent advanced features independently gated.

### Required end-to-end tests

- Beginner completes a real supported sketch via tutorial; dimensional and geometric constraints actually exist and solver verifies status. Extrude real solid; verify kernel output and that progress tracks the committed result, not clicks.
- Underconstrained sketch guidance matches actual solver state; a real kernel failure is reported accurately; unsupported operation is clearly unavailable without a fabricated button or answer.
- A cancelled assistant proposal leaves source revision, B-rep and history unchanged; a confirmed permitted action executes once via the CAD pipeline, passing evaluation and revision checks. Stale preview, expired lease and denied access fail closed.
- Reopen document: authorized user can resume applicable tutorial progress; verified state is recalculated from persisted source and evaluation. A user without document access cannot read context, conversation, progress, highlights or execute actions; revoke access during an active session and test subsequent requests.
- Run deterministic/tutorial tests with no model provider. With a configured fake transport used **only in tests**, verify bounded context, permission checks, injection resistance, unavailable/error handling and no unconfirmed execution. Test never claims a mocked provider is a real production response.
- Exercise keyboard-only panel controls, resize, pin, minimize, focus restoration, screen reader messages, reduced motion, responsive viewports, simultaneous tabs/read-only behavior, and no persistent obstruction of the CAD viewport.

## Current blocker and next action

There is no genuine CAD workspace in this checkout to integrate with. Legal sign-off remains outstanding under the user's prior gate; this new request does not waive it. Record approval of the dependency/distribution review, finish the approved rectangle-to-solid milestone, then implement assistant Stage 1 against the real workspace. Until those prerequisites exist, a clickable “CAD assistant” would be disconnected and would conflict with the request's accuracy and no-placeholder requirements.
