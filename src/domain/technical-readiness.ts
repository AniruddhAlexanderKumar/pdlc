import { sha256Hex } from "./sha256";
import { z } from "zod";
import type { AssumptionMonitoringStatus } from "./assumption-monitoring";
import type { GraphEdgeType, GraphNodeType } from "./graph";
import type { ConsumedAnalysisFreshness } from "./impact-analysis";
import type { ReadinessFreshness, VerificationReadinessStatus } from "./verification-readiness";

/**
 * Technical readiness.
 *
 * One question, asked of one project at one gate:
 *
 * > *Based on the current recorded engineering state, is this project
 * > technically ready to enter the specified development gate?*
 *
 * **This is an aggregation, not a second system.** Every input is already
 * recorded somewhere authoritative: requirement and design lifecycles,
 * engineering decisions, assumption monitoring, verification readiness,
 * verification outcomes, change-impact analyses, risks, issues, evidence and
 * the relationship rows between them. This engine reads that state and applies
 * gate policy to it. It re-derives nothing, and it writes to nothing it reads.
 *
 * Four things it deliberately is not:
 *
 *  - **Not a completion percentage.** There is no score, no percentage, no
 *    fraction, no confidence and no probability anywhere in this module, the
 *    schema, the API or the interface. A number would be read as a measurement
 *    of something nobody measured.
 *  - **Not a checklist.** Nothing here is a box a person ticks. Every finding is
 *    derived from a record and cites what it was read from.
 *  - **Not certification.** These are *internal* engineering gates. `RELEASE_READY`
 *    is not a claim of regulatory or airworthiness approval; compliance evidence
 *    has its own semantics and is a separate capability that does not exist yet.
 *  - **Not an inference from silence.** Where the record cannot answer a
 *    question the answer is UNKNOWN — never a pass. This is the property the
 *    product's credibility rests on.
 *
 * Everything here is Prisma-free.
 */

/**
 * Which rule set produced an assessment.
 *
 * Assessments are only comparable within a version. Bump this whenever a rule
 * is added, removed, or its outcome or gate applicability changes, so an old
 * assessment is never silently read under new semantics — freshness across
 * versions reports UNKNOWN rather than guessing compatibility.
 */
export const TECHNICAL_READINESS_VERSION = "1";

// --- Gates ------------------------------------------------------------------

/**
 * The internal development gates a project can be assessed against, in the
 * order a programme would normally pass through them.
 *
 * **These are internal engineering readiness gates.** They deliberately do not
 * claim equivalence to PDR, CDR, TRR, or any external regulatory milestone.
 * Naming one after such a milestone would imply this system knows what that
 * milestone requires, which it does not.
 *
 * A project is assessed against one gate at a time. Passing an earlier gate is
 * not a precondition for evaluating a later one — the engine reports what the
 * record supports, and a programme may legitimately want to know how far a
 * later gate is from being reachable.
 */
export const TECHNICAL_READINESS_GATES = [
  "SYSTEM_DEFINITION",
  "DESIGN_REVIEW",
  "DESIGN_FREEZE",
  "VERIFICATION_READY",
  "RELEASE_READY",
] as const;

export type TechnicalReadinessGate = (typeof TECHNICAL_READINESS_GATES)[number];
export const technicalReadinessGateSchema = z.enum(TECHNICAL_READINESS_GATES);

const GATE_LABELS: Readonly<Record<TechnicalReadinessGate, string>> = {
  SYSTEM_DEFINITION: "System definition",
  DESIGN_REVIEW: "Design review",
  DESIGN_FREEZE: "Design freeze",
  VERIFICATION_READY: "Verification ready",
  RELEASE_READY: "Release ready",
};

export function technicalReadinessGateLabel(gate: TechnicalReadinessGate): string {
  return GATE_LABELS[gate];
}

const GATE_QUESTIONS: Readonly<Record<TechnicalReadinessGate, string>> = {
  SYSTEM_DEFINITION:
    "Is what the product must do recorded, controlled and traceable to the needs it came from?",
  DESIGN_REVIEW:
    "Is there a design to review, allocated from controlled requirements, with its decisions recorded?",
  DESIGN_FREEZE:
    "Is the configuration settled enough that changing it should now go through change control?",
  VERIFICATION_READY:
    "Can the planned verification actually be performed against what has been recorded?",
  RELEASE_READY:
    "Has the product been shown to meet its baselined requirements, with the record to support it?",
};

export function technicalReadinessGateQuestion(gate: TechnicalReadinessGate): string {
  return GATE_QUESTIONS[gate];
}

/** Position in the gate sequence. Used for deterministic ordering only. */
export function gateOrder(gate: TechnicalReadinessGate): number {
  return TECHNICAL_READINESS_GATES.indexOf(gate);
}

// --- Status -----------------------------------------------------------------

/**
 * What the engine concluded about the gate.
 *
 * `READY` — every blocking condition the gate declares was evaluated and none
 *   applies, and nothing was indeterminate. It is a statement about the
 *   *record*, not a decision to hold the gate; a person still holds the gate.
 * `NOT_READY` — at least one blocking condition applies. The findings name each.
 * `UNKNOWN` — nothing blocking applies, but at least one condition could not be
 *   determined. Not a soft failure: a refusal to claim readiness the record
 *   cannot support.
 */
export const TECHNICAL_READINESS_STATUSES = ["READY", "NOT_READY", "UNKNOWN"] as const;
export type TechnicalReadinessStatus = (typeof TECHNICAL_READINESS_STATUSES)[number];

// --- Findings ---------------------------------------------------------------

/**
 * Which part of the engineering record a finding concerns.
 *
 * Categories say *where a deterministic rule looked*, never how serious a
 * person should consider it. There is no risk axis here.
 */
export const TECHNICAL_READINESS_CATEGORIES = [
  "REQUIREMENT",
  "DESIGN",
  "DECISION",
  "ASSUMPTION",
  "VERIFICATION",
  "CHANGE",
  "RISK",
  "ISSUE",
  "EVIDENCE",
  "TRACEABILITY",
  "UNKNOWN",
] as const;
export type TechnicalReadinessCategory = (typeof TECHNICAL_READINESS_CATEGORIES)[number];

/**
 * What a finding does to the assessment.
 *
 * `BLOCKING` — readiness for this gate cannot be claimed while it holds.
 * `WARNING` — a real condition worth reading that the registry deliberately does
 *   not treat as disqualifying at this gate. Warnings never change the verdict.
 * `INFORMATIONAL` — a condition the engine checked and found satisfied, or a
 *   fact recorded so a READY verdict is explainable rather than empty.
 * `UNKNOWN` — the condition could not be determined from the record.
 */
export const TECHNICAL_READINESS_FINDING_STATUSES = [
  "BLOCKING",
  "WARNING",
  "INFORMATIONAL",
  "UNKNOWN",
] as const;
export type TechnicalReadinessFindingStatus =
  (typeof TECHNICAL_READINESS_FINDING_STATUSES)[number];

/**
 * The severity label carried on a persisted finding.
 *
 * Deliberately **derived**, not judged: a one-to-one restatement of the finding
 * status in report wording, produced only by the mapping below. It is not a
 * second axis and emphatically not a risk rating — inventing one would be a
 * subjective score wearing an enum's clothes.
 */
export const TECHNICAL_READINESS_SEVERITIES = [
  "BLOCKER",
  "ADVISORY",
  "NOTE",
  "INDETERMINATE",
] as const;
export type TechnicalReadinessSeverity = (typeof TECHNICAL_READINESS_SEVERITIES)[number];

const SEVERITY_FOR_STATUS: Readonly<
  Record<TechnicalReadinessFindingStatus, TechnicalReadinessSeverity>
> = {
  BLOCKING: "BLOCKER",
  WARNING: "ADVISORY",
  INFORMATIONAL: "NOTE",
  UNKNOWN: "INDETERMINATE",
};

export function severityForTechnicalFindingStatus(
  status: TechnicalReadinessFindingStatus,
): TechnicalReadinessSeverity {
  return SEVERITY_FOR_STATUS[status];
}

/**
 * Deterministic markers naming what a finding was read from.
 *
 * Every finding cites at least one. This is the "basis" half of
 * *condition → basis → affected object → reason*, and it carries the negative
 * space as well: the `*_NOT_EVALUATED` and `*_NOT_CLASSIFIED` markers exist so a
 * reader can tell what the engine deliberately did not decide.
 */
export const TECHNICAL_READINESS_BASIS_MARKERS = [
  "PROJECT_SCOPE",
  "REQUIREMENT_LIFECYCLE_STATE",
  "REQUIREMENT_ABSENT",
  "DESIGN_LIFECYCLE_STATE",
  "DESIGN_ABSENT",
  "DECISION_LIFECYCLE_STATE",
  "DECISION_SUCCESSOR_UNRESOLVABLE",
  "ASSUMPTION_EXPLICIT_STATUS",
  "ASSUMPTION_MONITORING_RECORD",
  "ASSUMPTION_MONITORING_NOT_EVALUATED",
  "VERIFICATION_LIFECYCLE_STATE",
  "VERIFICATION_READINESS_ASSESSMENT",
  "VERIFICATION_READINESS_ABSENT",
  "VERIFICATION_READINESS_STALE",
  "EVIDENCE_LINK",
  "EVIDENCE_ABSENT",
  "CHANGE_REQUEST_LIFECYCLE_STATE",
  "CHANGE_IMPACT_ANALYSIS",
  "CHANGE_IMPACT_ANALYSIS_ABSENT",
  "CHANGE_IMPACT_ANALYSIS_STALE",
  "RISK_STATE",
  "RISK_SEVERITY_NOT_MODELLED",
  "ISSUE_STATE",
  "ISSUE_SEVERITY",
  "NEED_REQUIREMENT_LINK",
  "REQUIREMENT_DESIGN_LINK",
  "REQUIREMENT_VERIFICATION_LINK",
  "REQUIREMENT_DECISION_LINK",
  "DECISION_DESIGN_LINK",
  "TRACEABILITY_GAP",
] as const;
export type TechnicalReadinessBasisMarker =
  (typeof TECHNICAL_READINESS_BASIS_MARKERS)[number];

/** Deduplicated and sorted, so identical findings carry identical basis lists. */
export function normalizeTechnicalBasis(
  markers: readonly TechnicalReadinessBasisMarker[],
): TechnicalReadinessBasisMarker[] {
  return [...new Set(markers)].sort();
}

// --- The rule registry ------------------------------------------------------

/**
 * One deterministic gate rule.
 *
 * A rule is a *condition* over recorded state with exactly one outcome at the
 * gates it applies to. Where the same condition carries a different weight at a
 * later gate — an in-review requirement is normal at design review and
 * disqualifying at freeze — that is two rules, not one rule with a branch, so a
 * rule id in a finding is enough to know both what was concluded and why it
 * mattered at that gate.
 */
export interface TechnicalReadinessRule {
  /** Stable identifier, quoted in findings and in the UI. */
  id: string;
  /** Which gates evaluate this rule. Never empty. */
  gates: readonly TechnicalReadinessGate[];
  category: TechnicalReadinessCategory;
  /** The outcome this rule produces when its condition holds. */
  status: TechnicalReadinessFindingStatus;
  /** What kind of object a finding from this rule is about. */
  subjectType: GraphNodeType;
  /** What the rule is for, in one line. */
  description: string;
  /** The condition, stated so it can be checked against the implementation. */
  condition: string;
  /** Which records the rule reads. Every finding it emits cites these. */
  basis: readonly TechnicalReadinessBasisMarker[];
  /** Why the outcome is what it is at these gates, in engineering terms. */
  rationale: string;
}

const ALL_GATES = TECHNICAL_READINESS_GATES;
const EARLY_GATES = ["SYSTEM_DEFINITION", "DESIGN_REVIEW"] as const;
const LATE_GATES = ["DESIGN_FREEZE", "VERIFICATION_READY", "RELEASE_READY"] as const;
const DESIGN_GATES = ["DESIGN_REVIEW", "DESIGN_FREEZE", "RELEASE_READY"] as const;

/**
 * **The single authoritative gate rule registry.**
 *
 * Nothing outside this table decides whether a condition blocks a gate. The
 * service resolves the project's engineering scope and evaluates these rules
 * against it; it contains no gate policy of its own, and `emitFinding` refuses
 * a rule id the registry does not define or a gate the rule does not apply to.
 *
 * Boundaries worth stating, because each is a place where a plausible-looking
 * rule would have been wrong:
 *
 *  - **No completeness rule.** There is no "all requirements written" or
 *    "design N% mature" condition, because the record contains no statement of
 *    what a complete set would be. Inventing a denominator would be inventing a
 *    measurement.
 *  - **Risk severity is not modelled.** `Risk` carries a status but no
 *    severity, so the engine will not rank risks. It reports an *open* risk —
 *    one nobody has mitigated, accepted or closed — and says explicitly that it
 *    is not classifying it further.
 *  - **Design allocation is a warning, never a blocker.** Not every requirement
 *    is met by a design element; process and programmatic requirements are not.
 *    Blocking would enforce a rule the product does not hold.
 *  - **Evidence is not required because a gate exists.** It is required at
 *    `RELEASE_READY` for a verification that has *passed*, where its absence
 *    means a verdict with nothing behind it.
 */
export const TECHNICAL_READINESS_RULES: readonly TechnicalReadinessRule[] = [
  // --- Scope --------------------------------------------------------------
  {
    id: "TR-SCP-001",
    gates: ALL_GATES,
    category: "UNKNOWN",
    status: "INFORMATIONAL",
    subjectType: "PROJECT",
    description: "Records what was actually evaluated for this gate.",
    condition: "Always emitted, with the counts the scope resolution produced.",
    basis: ["PROJECT_SCOPE"],
    rationale:
      "A verdict whose scope a reader cannot see is not auditable. The counts are the objects the engine genuinely resolved, never an estimate of what the project ought to contain.",
  },

  // --- Requirements -------------------------------------------------------
  {
    id: "TR-REQ-001",
    gates: ALL_GATES,
    category: "REQUIREMENT",
    status: "BLOCKING",
    subjectType: "PROJECT",
    description: "The project records no requirement to assess.",
    condition: "No requirement exists in the project.",
    basis: ["PROJECT_SCOPE", "REQUIREMENT_ABSENT"],
    rationale:
      "Every gate is a statement about whether what the product must do is adequately established. With nothing recorded there is no engineering state to assess, and calling that ready would be claiming readiness from an empty record.",
  },
  {
    id: "TR-REQ-002",
    gates: ALL_GATES,
    category: "REQUIREMENT",
    status: "BLOCKING",
    subjectType: "REQUIREMENT",
    description: "A requirement in scope is still a draft.",
    condition: "An in-scope requirement's status is DRAFT.",
    basis: ["REQUIREMENT_LIFECYCLE_STATE"],
    rationale:
      "A draft requirement has not been put in front of anyone. Design, verification and every later gate rest on the requirement set, and a statement nobody has reviewed cannot carry that weight at any gate.",
  },
  {
    id: "TR-REQ-003",
    gates: EARLY_GATES,
    category: "REQUIREMENT",
    status: "WARNING",
    subjectType: "REQUIREMENT",
    description: "A requirement in scope is still under review.",
    condition: "An in-scope requirement's status is IN_REVIEW.",
    basis: ["REQUIREMENT_LIFECYCLE_STATE"],
    rationale:
      "Review in progress is the normal state while the definition is being settled, so it is reported rather than treated as a defect this early.",
  },
  {
    id: "TR-REQ-004",
    gates: LATE_GATES,
    category: "REQUIREMENT",
    status: "BLOCKING",
    subjectType: "REQUIREMENT",
    description: "A requirement is still under review at a gate that assumes it is settled.",
    condition: "An in-scope requirement's status is IN_REVIEW.",
    basis: ["REQUIREMENT_LIFECYCLE_STATE"],
    rationale:
      "From design freeze onward the requirement set is what the configuration, the verification plan and the release argument are built against. A statement that can still change invalidates all three.",
  },
  {
    id: "TR-REQ-005",
    gates: ["RELEASE_READY"],
    category: "REQUIREMENT",
    status: "BLOCKING",
    subjectType: "REQUIREMENT",
    description: "A requirement being released is approved but not baselined.",
    condition: "An in-scope requirement's status is APPROVED rather than BASELINED.",
    basis: ["REQUIREMENT_LIFECYCLE_STATE"],
    rationale:
      "A release argument is a claim about a fixed set of statements. BASELINED is the point at which the record says which version of the requirement the product was shown to meet.",
  },
  {
    id: "TR-REQ-006",
    gates: ALL_GATES,
    category: "REQUIREMENT",
    status: "INFORMATIONAL",
    subjectType: "PROJECT",
    description: "Records how much of the requirement set is under configuration control.",
    condition: "Always emitted, counting in-scope requirements by lifecycle state.",
    basis: ["REQUIREMENT_LIFECYCLE_STATE", "PROJECT_SCOPE"],
    rationale:
      "Makes a READY verdict explainable by naming the state it rests on, rather than leaving the reader with an unexplained pass.",
  },

  // --- Traceability -------------------------------------------------------
  {
    id: "TR-TRC-001",
    gates: ["SYSTEM_DEFINITION"],
    category: "TRACEABILITY",
    status: "WARNING",
    subjectType: "STAKEHOLDER_NEED",
    description: "A recorded stakeholder need has no requirement derived from it.",
    condition:
      "A stakeholder need exists in the project and no NeedRequirementLink connects it to a requirement.",
    basis: ["NEED_REQUIREMENT_LINK", "TRACEABILITY_GAP"],
    rationale:
      "Something was asked for and nothing in the requirement set answers it. Reported only where needs are actually recorded — a project that does not use them is not penalised for it.",
  },
  {
    id: "TR-TRC-002",
    gates: DESIGN_GATES,
    category: "TRACEABILITY",
    status: "WARNING",
    subjectType: "REQUIREMENT",
    description: "A requirement is not allocated to any design item.",
    condition: "An in-scope requirement has no RequirementDesignLink.",
    basis: ["REQUIREMENT_DESIGN_LINK", "TRACEABILITY_GAP"],
    rationale:
      "Nothing in the recorded product structure is answerable for this requirement. It is a warning rather than a blocker because not every requirement is met by a design element — process and programmatic requirements legitimately are not — and the record does not say which kind this is.",
  },
  {
    id: "TR-TRC-003",
    gates: ["DESIGN_FREEZE"],
    category: "TRACEABILITY",
    status: "WARNING",
    subjectType: "REQUIREMENT",
    description: "A requirement has no verification activity planned.",
    condition: "An in-scope requirement has no RequirementVerificationLink.",
    basis: ["REQUIREMENT_VERIFICATION_LINK", "TRACEABILITY_GAP"],
    rationale:
      "Verification planning may legitimately still be in progress when the configuration is frozen, so the gap is surfaced rather than treated as disqualifying.",
  },
  {
    id: "TR-TRC-004",
    gates: ["VERIFICATION_READY", "RELEASE_READY"],
    category: "TRACEABILITY",
    status: "BLOCKING",
    subjectType: "REQUIREMENT",
    description: "A requirement has nothing that would show it is met.",
    condition: "An in-scope requirement has no RequirementVerificationLink.",
    basis: ["REQUIREMENT_VERIFICATION_LINK", "TRACEABILITY_GAP"],
    rationale:
      "At these gates the question is whether the product can be, or has been, shown to meet its requirements. A requirement with no verification activity cannot be shown to be met by anything the record contains.",
  },
  {
    id: "TR-TRC-005",
    gates: ALL_GATES,
    category: "TRACEABILITY",
    status: "INFORMATIONAL",
    subjectType: "PROJECT",
    description: "Records the traceability the engine actually walked.",
    condition: "Always emitted, counting the relationship rows resolved for this gate.",
    basis: ["PROJECT_SCOPE", "TRACEABILITY_GAP"],
    rationale:
      "Traceability claims are only as good as the rows behind them; recording the count makes the basis checkable.",
  },

  // --- Design -------------------------------------------------------------
  {
    id: "TR-DES-001",
    gates: DESIGN_GATES,
    category: "DESIGN",
    status: "BLOCKING",
    subjectType: "PROJECT",
    description: "The project records no design item.",
    condition: "No design item exists in the project.",
    basis: ["PROJECT_SCOPE", "DESIGN_ABSENT"],
    rationale:
      "A design review, a freeze and a release are all statements about a product structure. With none recorded there is nothing to review, freeze or release.",
  },
  {
    id: "TR-DES-002",
    gates: ["DESIGN_REVIEW", "DESIGN_FREEZE", "VERIFICATION_READY", "RELEASE_READY"],
    category: "DESIGN",
    status: "BLOCKING",
    subjectType: "DESIGN_ITEM",
    description: "An obsolete design item is still allocated from a live requirement.",
    condition:
      "A design item whose status is OBSOLETE is the target of a RequirementDesignLink from a requirement that is not obsolete.",
    basis: ["DESIGN_LIFECYCLE_STATE", "REQUIREMENT_DESIGN_LINK"],
    rationale:
      "The record simultaneously says a live requirement is met by this element and that the element has been withdrawn. Those cannot both hold, and no gate should be passed on a contradiction nobody has resolved.",
  },
  {
    id: "TR-DES-003",
    gates: ["DESIGN_REVIEW"],
    category: "DESIGN",
    status: "WARNING",
    subjectType: "DESIGN_ITEM",
    description: "A design item is not yet under configuration control.",
    condition: "An in-scope design item's status is DRAFT or IN_REVIEW.",
    basis: ["DESIGN_LIFECYCLE_STATE"],
    rationale:
      "Reviewing a design that is still being drafted is exactly what a design review is for, so this is reported rather than treated as a defect.",
  },
  {
    id: "TR-DES-004",
    gates: ["DESIGN_FREEZE", "RELEASE_READY"],
    category: "DESIGN",
    status: "BLOCKING",
    subjectType: "DESIGN_ITEM",
    description: "A design item is still uncontrolled at a gate that assumes it is settled.",
    condition: "An in-scope design item's status is DRAFT or IN_REVIEW.",
    basis: ["DESIGN_LIFECYCLE_STATE"],
    rationale:
      "Freezing or releasing a configuration means stating what it is. An element that can still change without going through change control makes that statement untrue.",
  },
  {
    id: "TR-DES-005",
    gates: ["RELEASE_READY"],
    category: "DESIGN",
    status: "WARNING",
    subjectType: "DESIGN_ITEM",
    description: "A design item being released is approved but not baselined.",
    condition: "An in-scope design item's status is APPROVED rather than BASELINED.",
    basis: ["DESIGN_LIFECYCLE_STATE"],
    rationale:
      "Baselining a design item is not something the domain requires, so this cannot block; it is worth seeing, because a release record is clearer when the configuration it describes is baselined.",
  },
  {
    id: "TR-DES-006",
    gates: DESIGN_GATES,
    category: "DESIGN",
    status: "INFORMATIONAL",
    subjectType: "PROJECT",
    description: "Records the state of the design items in scope.",
    condition: "Always emitted at design-bearing gates, counting them by lifecycle state.",
    basis: ["DESIGN_LIFECYCLE_STATE", "PROJECT_SCOPE"],
    rationale: "Names the configuration the verdict rests on.",
  },

  // --- Decisions ----------------------------------------------------------
  {
    id: "TR-DEC-001",
    gates: EARLY_GATES,
    category: "DECISION",
    status: "WARNING",
    subjectType: "ENGINEERING_DECISION",
    description: "A governing decision has not been taken yet.",
    condition: "An in-scope engineering decision's status is PROPOSED or UNDER_REVIEW.",
    basis: ["DECISION_LIFECYCLE_STATE"],
    rationale:
      "Decisions being open is the normal condition while the system is being defined and the design reviewed. It is reported so a reviewer knows what is still in play.",
  },
  {
    id: "TR-DEC-002",
    gates: LATE_GATES,
    category: "DECISION",
    status: "BLOCKING",
    subjectType: "ENGINEERING_DECISION",
    description: "A governing decision is still open at a gate that assumes it is settled.",
    condition: "An in-scope engineering decision's status is PROPOSED or UNDER_REVIEW.",
    basis: ["DECISION_LIFECYCLE_STATE"],
    rationale:
      "The decision that establishes part of the configuration has not been taken, so the configuration this gate is about is not the one that will exist.",
  },
  {
    id: "TR-DEC-003",
    gates: ALL_GATES,
    category: "DECISION",
    status: "BLOCKING",
    subjectType: "ENGINEERING_DECISION",
    description: "A rejected decision is still recorded as governing.",
    condition:
      "An engineering decision whose status is REJECTED still addresses an in-scope requirement or shapes an in-scope design item.",
    basis: ["DECISION_LIFECYCLE_STATE", "REQUIREMENT_DECISION_LINK", "DECISION_DESIGN_LINK"],
    rationale:
      "The record says this decision governs something and also that it was refused. That contradiction has to be resolved by a person before any gate rests on it.",
  },
  {
    id: "TR-DEC-004",
    gates: ALL_GATES,
    category: "DECISION",
    status: "WARNING",
    subjectType: "ENGINEERING_DECISION",
    description: "A governing decision has been superseded.",
    condition: "An in-scope engineering decision's status is SUPERSEDED.",
    basis: ["DECISION_LIFECYCLE_STATE", "DECISION_SUCCESSOR_UNRESOLVABLE"],
    rationale:
      "Something replaced this decision, and the schema records no link from a superseded decision to its successor — so the engine genuinely cannot say which decision now governs. It reports what it can see and leaves the substitution to a person rather than guessing.",
  },
  {
    id: "TR-DEC-005",
    gates: ALL_GATES,
    category: "DECISION",
    status: "INFORMATIONAL",
    subjectType: "PROJECT",
    description: "Records the state of the decisions the scope depends on.",
    condition: "Always emitted, counting in-scope decisions by lifecycle state.",
    basis: ["DECISION_LIFECYCLE_STATE", "PROJECT_SCOPE"],
    rationale:
      "An approved decision means the decision was taken, not that its content is correct. Recording the counts says what was relied on without overstating it.",
  },

  // --- Assumptions --------------------------------------------------------
  {
    id: "TR-ASM-001",
    gates: LATE_GATES,
    category: "ASSUMPTION",
    status: "BLOCKING",
    subjectType: "DECISION_ASSUMPTION",
    description: "An assumption behind a governing decision needs review.",
    condition:
      "Assumption monitoring reports REVIEW_REQUIRED for an assumption of an in-scope decision.",
    basis: ["ASSUMPTION_MONITORING_RECORD"],
    rationale:
      "Somebody had judged this assumption and the basis that judgement rested on has since moved. From design freeze onward the configuration is being fixed against conclusions nobody has re-confirmed. Monitoring's verdict is consumed here and never altered.",
  },
  {
    id: "TR-ASM-002",
    gates: EARLY_GATES,
    category: "ASSUMPTION",
    status: "WARNING",
    subjectType: "DECISION_ASSUMPTION",
    description: "An assumption behind a governing decision needs review.",
    condition:
      "Assumption monitoring reports REVIEW_REQUIRED for an assumption of an in-scope decision.",
    basis: ["ASSUMPTION_MONITORING_RECORD"],
    rationale:
      "Worth a reviewer's attention while the definition and design are still moving, but not disqualifying at a stage where the ground is expected to shift.",
  },
  {
    id: "TR-ASM-003",
    gates: ALL_GATES,
    category: "ASSUMPTION",
    status: "WARNING",
    subjectType: "DECISION_ASSUMPTION",
    description: "The recorded basis of an assumption has changed.",
    condition:
      "Assumption monitoring reports BASIS_CHANGED for an assumption of an in-scope decision.",
    basis: ["ASSUMPTION_MONITORING_RECORD"],
    rationale:
      "The basis moved, but no explicit judgement rested on it, so there is nothing to re-confirm. Worth reading; not disqualifying.",
  },
  {
    id: "TR-ASM-004",
    gates: ALL_GATES,
    category: "ASSUMPTION",
    status: "UNKNOWN",
    subjectType: "DECISION_ASSUMPTION",
    description: "An assumption behind a governing decision has never been monitored.",
    condition:
      "An assumption of an in-scope decision has no monitoring record, so its basis has never been checked.",
    basis: ["ASSUMPTION_MONITORING_NOT_EVALUATED"],
    rationale:
      "Something the decision needed to be true is recorded, and nobody has checked whether what it stands on still holds. That is not evidence the assumption fails — so it is indeterminate rather than blocking — but it is exactly the missing information that must not be allowed to read as a pass.",
  },
  {
    id: "TR-ASM-005",
    gates: ALL_GATES,
    category: "ASSUMPTION",
    status: "BLOCKING",
    subjectType: "DECISION_ASSUMPTION",
    description: "An assumption behind a governing decision has been judged invalid.",
    condition: "An assumption of an in-scope decision carries the explicit status INVALIDATED.",
    basis: ["ASSUMPTION_EXPLICIT_STATUS"],
    rationale:
      "An engineer stated that something a governing decision needed is not true. This consumes that person's judgement; nothing in this engine ever sets an assumption's status.",
  },
  {
    id: "TR-ASM-006",
    gates: ALL_GATES,
    category: "ASSUMPTION",
    status: "INFORMATIONAL",
    subjectType: "PROJECT",
    description: "Records the monitoring state of the assumptions in scope.",
    condition: "Always emitted, counting in-scope assumptions by monitoring state.",
    basis: ["ASSUMPTION_MONITORING_RECORD", "PROJECT_SCOPE"],
    rationale: "Names what the verdict stands on, including what has not been checked.",
  },

  // --- Verification -------------------------------------------------------
  {
    id: "TR-VER-001",
    gates: ["VERIFICATION_READY"],
    category: "VERIFICATION",
    status: "BLOCKING",
    subjectType: "VERIFICATION_ACTIVITY",
    description: "A verification activity has never had its readiness assessed.",
    condition: "An in-scope verification activity has no verification-readiness assessment.",
    basis: ["VERIFICATION_READINESS_ABSENT"],
    rationale:
      "This gate asks whether the planned verification can actually be performed. For an activity nobody has assessed, the record does not answer that — and this engine will not answer it by guessing, or by silently running the assessment on someone's behalf.",
  },
  {
    id: "TR-VER-002",
    gates: ["VERIFICATION_READY"],
    category: "VERIFICATION",
    status: "UNKNOWN",
    subjectType: "VERIFICATION_ACTIVITY",
    description: "A verification-readiness assessment no longer describes the current state.",
    condition:
      "An in-scope verification activity's latest readiness assessment is STALE, or its freshness cannot be determined.",
    basis: ["VERIFICATION_READINESS_ASSESSMENT", "VERIFICATION_READINESS_STALE"],
    rationale:
      "The assessment was made against a basis that has since moved. Reading it as current would carry an out-of-date verdict into a gate decision, so the condition is reported as indeterminate. Re-evaluating it is an explicit act by a person, not a side effect of asking about a gate.",
  },
  {
    id: "TR-VER-003",
    gates: ["VERIFICATION_READY"],
    category: "VERIFICATION",
    status: "BLOCKING",
    subjectType: "VERIFICATION_ACTIVITY",
    description: "A current verification-readiness assessment says the activity is not ready.",
    condition:
      "An in-scope verification activity's latest readiness assessment is CURRENT and NOT_READY.",
    basis: ["VERIFICATION_READINESS_ASSESSMENT"],
    rationale:
      "The verification-readiness engine already established why, against that activity's own basis. This gate consumes that verdict and points at it rather than restating or re-deriving its rules.",
  },
  {
    id: "TR-VER-004",
    gates: ["VERIFICATION_READY"],
    category: "VERIFICATION",
    status: "UNKNOWN",
    subjectType: "VERIFICATION_ACTIVITY",
    description: "A current verification-readiness assessment could not reach a verdict.",
    condition:
      "An in-scope verification activity's latest readiness assessment is CURRENT and UNKNOWN.",
    basis: ["VERIFICATION_READINESS_ASSESSMENT"],
    rationale:
      "The readiness engine declined to claim readiness it could not support. Treating that as satisfied here would launder an unknown into a pass one level up.",
  },
  {
    id: "TR-VER-005",
    gates: ["VERIFICATION_READY"],
    category: "VERIFICATION",
    status: "INFORMATIONAL",
    subjectType: "PROJECT",
    description: "Records the verification-readiness state consumed for this gate.",
    condition: "Always emitted at this gate, counting activities by consumed readiness verdict.",
    basis: ["VERIFICATION_READINESS_ASSESSMENT", "PROJECT_SCOPE"],
    rationale: "Names which assessments the gate verdict was built from.",
  },
  {
    id: "TR-VER-006",
    gates: ["RELEASE_READY"],
    category: "VERIFICATION",
    status: "BLOCKING",
    subjectType: "VERIFICATION_ACTIVITY",
    description: "A verification activity has not concluded.",
    condition: "An in-scope verification activity's status is PLANNED or IN_PROGRESS.",
    basis: ["VERIFICATION_LIFECYCLE_STATE"],
    rationale:
      "A release argument is a claim that the product was shown to meet its requirements. Verification that has not been performed shows nothing.",
  },
  {
    id: "TR-VER-007",
    gates: ["RELEASE_READY"],
    category: "VERIFICATION",
    status: "BLOCKING",
    subjectType: "VERIFICATION_ACTIVITY",
    description: "A verification activity recorded a failure.",
    condition: "An in-scope verification activity's status is FAILED.",
    basis: ["VERIFICATION_LIFECYCLE_STATE"],
    rationale:
      "The record states that the product did not do what was required. A failed verification must be visible at the release gate; it is not superseded by later activity unless someone plans a new one and records its result.",
  },
  {
    id: "TR-VER-008",
    gates: ["RELEASE_READY"],
    category: "VERIFICATION",
    status: "WARNING",
    subjectType: "VERIFICATION_ACTIVITY",
    description: "A requirement's verification was waived rather than performed.",
    condition: "An in-scope verification activity's status is WAIVED.",
    basis: ["VERIFICATION_LIFECYCLE_STATE"],
    rationale:
      "A waiver is a recorded decision not to verify, made by a person. The engine surfaces it so the release argument includes it, and does not overrule the judgement by blocking on it.",
  },
  {
    id: "TR-VER-010",
    gates: ["DESIGN_FREEZE"],
    category: "VERIFICATION",
    status: "WARNING",
    subjectType: "VERIFICATION_ACTIVITY",
    description: "A verification activity has no readiness assessment yet.",
    condition: "An in-scope verification activity has no verification-readiness assessment.",
    basis: ["VERIFICATION_READINESS_ABSENT"],
    rationale:
      "Freezing a configuration is the point at which the verification plan starts to be built against something fixed, so it is worth knowing which activities have never been assessed. It is a warning rather than a blocker because verification readiness is legitimately established after the freeze, not before it. Only the *existence* of an assessment is read here — its verdict and freshness are the verification-ready gate's question, and consuming them at this gate would make it depend on state it is not asking about.",
  },
  {
    id: "TR-VER-009",
    gates: ["RELEASE_READY"],
    category: "VERIFICATION",
    status: "INFORMATIONAL",
    subjectType: "PROJECT",
    description: "Records how the in-scope verification activities concluded.",
    condition: "Always emitted at this gate, counting activities by outcome.",
    basis: ["VERIFICATION_LIFECYCLE_STATE", "PROJECT_SCOPE"],
    rationale: "Names the outcomes the release argument rests on.",
  },

  // --- Evidence -----------------------------------------------------------
  {
    id: "TR-EVD-001",
    gates: ["RELEASE_READY"],
    category: "EVIDENCE",
    status: "BLOCKING",
    subjectType: "VERIFICATION_ACTIVITY",
    description: "A passed verification has nothing recorded behind it.",
    condition:
      "An in-scope verification activity whose status is PASSED has no EvidenceLink attached.",
    basis: ["VERIFICATION_LIFECYCLE_STATE", "EVIDENCE_ABSENT"],
    rationale:
      "Evidence is the output of verification, so requiring it before execution would be wrong — but a *passed* activity with nothing attached is a verdict with no record behind it, and that is precisely what a release argument cannot contain. Scoped to PASSED alone: a waiver legitimately has no evidence, and a failure is already blocking on its own.",
  },
  {
    id: "TR-EVD-002",
    gates: ["RELEASE_READY"],
    category: "EVIDENCE",
    status: "INFORMATIONAL",
    subjectType: "PROJECT",
    description: "Records the evidence attached to concluded verification.",
    condition: "Always emitted at this gate, counting concluded activities that carry evidence.",
    basis: ["EVIDENCE_LINK", "PROJECT_SCOPE"],
    rationale:
      "Names what supports the release argument. Evidence existing is not the same as the product being correct, and this records the former only.",
  },

  // --- Change -------------------------------------------------------------
  {
    id: "TR-CHG-001",
    gates: LATE_GATES,
    category: "CHANGE",
    status: "UNKNOWN",
    subjectType: "CHANGE_REQUEST",
    description: "An in-flight change has never been analysed.",
    condition:
      "A change request that is still in flight has no completed impact analysis — none was run, or the latest failed.",
    basis: ["CHANGE_REQUEST_LIFECYCLE_STATE", "CHANGE_IMPACT_ANALYSIS_ABSENT"],
    rationale:
      "How far the change reaches has not been computed, so the engine cannot say whether it touches what this gate is about. It will not run the analysis itself, and it will not assume the change is harmless.",
  },
  {
    id: "TR-CHG-002",
    gates: EARLY_GATES,
    category: "CHANGE",
    status: "WARNING",
    subjectType: "CHANGE_REQUEST",
    description: "An in-flight change has never been analysed.",
    condition:
      "A change request that is still in flight has no completed impact analysis — none was run, or the latest failed.",
    basis: ["CHANGE_REQUEST_LIFECYCLE_STATE", "CHANGE_IMPACT_ANALYSIS_ABSENT"],
    rationale:
      "Un-analysed changes are normal while the definition and design are still moving; the gap is surfaced rather than made indeterminate this early.",
  },
  {
    id: "TR-CHG-003",
    gates: LATE_GATES,
    category: "CHANGE",
    status: "UNKNOWN",
    subjectType: "CHANGE_REQUEST",
    description: "An in-flight change's impact analysis is out of date.",
    condition:
      "A change request that is still in flight has an impact analysis whose stored fingerprint no longer matches the project state, or cannot be compared against it.",
    basis: ["CHANGE_REQUEST_LIFECYCLE_STATE", "CHANGE_IMPACT_ANALYSIS_STALE"],
    rationale:
      "The stored affected set was computed against a project state that has since moved. Presenting it as current would carry an out-of-date impact assessment into a gate decision.",
  },
  {
    id: "TR-CHG-004",
    gates: EARLY_GATES,
    category: "CHANGE",
    status: "WARNING",
    subjectType: "CHANGE_REQUEST",
    description: "An in-flight change's impact analysis is out of date.",
    condition:
      "A change request that is still in flight has an impact analysis whose stored fingerprint no longer matches the project state, or cannot be compared against it.",
    basis: ["CHANGE_REQUEST_LIFECYCLE_STATE", "CHANGE_IMPACT_ANALYSIS_STALE"],
    rationale:
      "Surfaced so a reviewer knows the analysis needs re-running, without making an early gate indeterminate over it.",
  },
  {
    id: "TR-CHG-005",
    gates: ["DESIGN_FREEZE", "RELEASE_READY"],
    category: "CHANGE",
    status: "BLOCKING",
    subjectType: "CHANGE_REQUEST",
    description: "A change at or beyond review reaches the objects this gate is about.",
    condition:
      "A change request in UNDER_REVIEW or APPROVED has a current impact analysis that reaches an object in the evaluated scope.",
    basis: ["CHANGE_REQUEST_LIFECYCLE_STATE", "CHANGE_IMPACT_ANALYSIS"],
    rationale:
      "Freezing or releasing a configuration that a reviewed-and-unimplemented change is known to reach means fixing something that is already agreed to be moving.",
  },
  {
    id: "TR-CHG-006",
    gates: ["SYSTEM_DEFINITION", "DESIGN_REVIEW", "VERIFICATION_READY"],
    category: "CHANGE",
    status: "WARNING",
    subjectType: "CHANGE_REQUEST",
    description: "A change at or beyond review reaches the objects this gate is about.",
    condition:
      "A change request in UNDER_REVIEW or APPROVED has a current impact analysis that reaches an object in the evaluated scope.",
    basis: ["CHANGE_REQUEST_LIFECYCLE_STATE", "CHANGE_IMPACT_ANALYSIS"],
    rationale:
      "Worth reading before holding the gate, but these gates are not statements that the configuration has stopped moving, so an in-flight change does not by itself disqualify them.",
  },
  {
    id: "TR-CHG-007",
    gates: ALL_GATES,
    category: "CHANGE",
    status: "INFORMATIONAL",
    subjectType: "PROJECT",
    description: "Records the in-flight change activity considered for this gate.",
    condition: "Always emitted, counting in-flight change requests and how each was read.",
    basis: ["CHANGE_REQUEST_LIFECYCLE_STATE", "PROJECT_SCOPE"],
    rationale: "Names which changes the verdict accounted for, and on what analysis.",
  },

  // --- Risks --------------------------------------------------------------
  {
    id: "TR-RSK-001",
    gates: ["RELEASE_READY"],
    category: "RISK",
    status: "BLOCKING",
    subjectType: "RISK",
    description: "A risk is still open at the release gate.",
    condition: "A risk in the project has status OPEN.",
    basis: ["RISK_STATE", "RISK_SEVERITY_NOT_MODELLED"],
    rationale:
      "OPEN means nobody has mitigated, accepted or closed it — the record contains no decision about it at all. Releasing with an undecided risk is a decision made by omission. Note what this deliberately does not do: the Risk model carries no severity, so the engine does not rank risks or infer how serious one is.",
  },
  {
    id: "TR-RSK-002",
    gates: ["DESIGN_FREEZE", "VERIFICATION_READY"],
    category: "RISK",
    status: "WARNING",
    subjectType: "RISK",
    description: "A risk is still open.",
    condition: "A risk in the project has status OPEN.",
    basis: ["RISK_STATE", "RISK_SEVERITY_NOT_MODELLED"],
    rationale:
      "Open risks are expected while the programme is running. They are surfaced without being ranked, because the record does not say how serious any of them is.",
  },
  {
    id: "TR-RSK-003",
    gates: EARLY_GATES,
    category: "RISK",
    status: "INFORMATIONAL",
    subjectType: "PROJECT",
    description: "Records open risks without classifying them.",
    condition: "Always emitted at these gates, counting risks by status.",
    basis: ["RISK_STATE", "RISK_SEVERITY_NOT_MODELLED"],
    rationale:
      "The domain records no risk severity, so at these gates the engine reports what exists and explicitly declines to turn it into a gate condition rather than inventing a threshold.",
  },

  // --- Issues -------------------------------------------------------------
  {
    id: "TR-ISS-001",
    gates: ALL_GATES,
    category: "ISSUE",
    status: "BLOCKING",
    subjectType: "ISSUE",
    description: "A critical issue is unresolved.",
    condition: "An issue with severity CRITICAL has status OPEN or IN_PROGRESS.",
    basis: ["ISSUE_STATE", "ISSUE_SEVERITY"],
    rationale:
      "Severity is recorded on the issue by a person, so this consumes a human judgement rather than inventing one. An unresolved critical issue blocks every gate, because it is a statement that something is wrong now.",
  },
  {
    id: "TR-ISS-002",
    gates: ["DESIGN_FREEZE", "RELEASE_READY"],
    category: "ISSUE",
    status: "BLOCKING",
    subjectType: "ISSUE",
    description: "A high-severity issue is unresolved.",
    condition: "An issue with severity HIGH has status OPEN or IN_PROGRESS.",
    basis: ["ISSUE_STATE", "ISSUE_SEVERITY"],
    rationale:
      "At the gates that fix a configuration or release it, a high-severity problem nobody has closed is a known defect being carried across the line.",
  },
  {
    id: "TR-ISS-003",
    gates: ["SYSTEM_DEFINITION", "DESIGN_REVIEW", "VERIFICATION_READY"],
    category: "ISSUE",
    status: "WARNING",
    subjectType: "ISSUE",
    description: "A high-severity issue is unresolved.",
    condition: "An issue with severity HIGH has status OPEN or IN_PROGRESS.",
    basis: ["ISSUE_STATE", "ISSUE_SEVERITY"],
    rationale:
      "Open problems are expected at these stages and working through them is the point; they are surfaced rather than treated as disqualifying.",
  },
  {
    id: "TR-ISS-004",
    gates: ALL_GATES,
    category: "ISSUE",
    status: "INFORMATIONAL",
    subjectType: "PROJECT",
    description: "Records unresolved issues below the blocking severity.",
    condition: "Always emitted, counting unresolved issues by severity.",
    basis: ["ISSUE_STATE", "ISSUE_SEVERITY", "PROJECT_SCOPE"],
    rationale:
      "Lower-severity issues are reported as context. Turning them into a gate condition would be inventing a threshold the domain does not state.",
  },
] as const;

/** Rule lookup by id. Built once; the registry is immutable. */
const RULES_BY_ID: ReadonlyMap<string, TechnicalReadinessRule> = new Map(
  TECHNICAL_READINESS_RULES.map((rule) => [rule.id, rule]),
);

export function technicalReadinessRule(ruleId: string): TechnicalReadinessRule | null {
  return RULES_BY_ID.get(ruleId) ?? null;
}

/** Whether a rule's outcome disqualifies the gate. Derived, never declared twice. */
export function isBlockingTechnicalRule(rule: TechnicalReadinessRule): boolean {
  return rule.status === "BLOCKING";
}

/** Whether a rule is evaluated at this gate. */
export function ruleAppliesToGate(
  rule: TechnicalReadinessRule,
  gate: TechnicalReadinessGate,
): boolean {
  return rule.gates.includes(gate);
}

/** The rules evaluated at a gate, in registry order. Deterministic by construction. */
export function rulesForGate(
  gate: TechnicalReadinessGate,
): readonly TechnicalReadinessRule[] {
  return TECHNICAL_READINESS_RULES.filter((rule) => ruleAppliesToGate(rule, gate));
}

/** Every rule id the registry defines, sorted. Used by the registry tests. */
export function technicalReadinessRuleIds(): string[] {
  return TECHNICAL_READINESS_RULES.map((rule) => rule.id).sort();
}

/** Rule ids that block a given gate, sorted. */
export function blockingRuleIdsForGate(gate: TechnicalReadinessGate): string[] {
  return TECHNICAL_READINESS_RULES.filter(
    (rule) => isBlockingTechnicalRule(rule) && ruleAppliesToGate(rule, gate),
  )
    .map((rule) => rule.id)
    .sort();
}

// --- Status precedence ------------------------------------------------------

/**
 * Ordering of finding statuses, strongest first.
 *
 * Blocking outranks unknown because a known disqualifier is a firmer statement
 * than an unanswered question. Unknown outranks warning because "we could not
 * tell" must never be buried below advisory noise.
 */
export const TECHNICAL_FINDING_STATUS_PRECEDENCE: Readonly<
  Record<TechnicalReadinessFindingStatus, number>
> = {
  BLOCKING: 4,
  UNKNOWN: 3,
  WARNING: 2,
  INFORMATIONAL: 1,
};

/** A finding as the precedence rule needs to see it. */
export interface TechnicalOutcome {
  status: TechnicalReadinessFindingStatus;
}

/**
 * **The single place a gate verdict is decided.**
 *
 * `BLOCKING > UNKNOWN > READY`. Warnings and informational findings never move
 * the verdict — a rule that should block a gate says so in the registry.
 *
 * An assessment with no findings at all is UNKNOWN rather than READY. Every gate
 * has rules that always emit, so an empty result means the evaluation did not
 * actually happen, and silence must never produce a pass.
 */
export function technicalReadinessStatusFor(
  findings: readonly TechnicalOutcome[],
): TechnicalReadinessStatus {
  if (findings.length === 0) return "UNKNOWN";
  if (findings.some((finding) => finding.status === "BLOCKING")) return "NOT_READY";
  if (findings.some((finding) => finding.status === "UNKNOWN")) return "UNKNOWN";
  return "READY";
}

// --- Scope ------------------------------------------------------------------

/**
 * Why an object is in the evaluated scope.
 *
 * V1 evaluates the project's **current active engineering scope**: the records
 * that are still live, plus the ones a live record depends on. It is not a
 * query language and there is no scope DSL — a later version can add named
 * scopes without changing what this one meant.
 */
export const TECHNICAL_SCOPE_ROLES = [
  "REQUIREMENT",
  "DESIGN_ITEM",
  "ENGINEERING_DECISION",
  "DECISION_ASSUMPTION",
  "VERIFICATION_ACTIVITY",
  "STAKEHOLDER_NEED",
  "EVIDENCE",
  "CHANGE_REQUEST",
  "RISK",
  "ISSUE",
] as const;
export type TechnicalScopeRole = (typeof TECHNICAL_SCOPE_ROLES)[number];

/**
 * One object the gate was evaluated against.
 *
 * Identity and the state the rules read — never a copy of the record. The
 * revision stamp is the object's own `updatedAt`, which is what makes "has the
 * basis moved?" answerable without storing the artifact.
 */
export interface TechnicalScopeObject {
  role: TechnicalScopeRole;
  type: GraphNodeType;
  id: string;
  identifier: string | null;
  /** The lifecycle value the rules read, where the object has one. */
  state: string | null;
  /** ISO timestamp of the object's own last revision. Never "now". */
  revision: string;
}

/** A relationship row the scope resolution walked. */
export interface TechnicalScopeRelationship {
  edgeType: GraphEdgeType;
  relationshipId: string;
  fromType: GraphNodeType;
  fromId: string;
  toType: GraphNodeType;
  toId: string;
}

/** A verification-readiness verdict consumed, never recomputed. */
export interface ConsumedVerificationReadiness {
  verificationActivityId: string;
  assessmentId: string | null;
  status: VerificationReadinessStatus | null;
  freshness: ReadinessFreshness | null;
  /** How many blocking findings that assessment recorded. Its count, not ours. */
  blockingCount: number | null;
}

/** A change-impact analysis consumed, never recomputed. */
export interface ConsumedChangeImpact {
  changeRequestId: string;
  identifier: string | null;
  status: string;
  analysisId: string | null;
  analysisFreshness: ConsumedAnalysisFreshness;
  /** Scope objects the analysis reached, as `type:id` keys. Sorted. */
  reachedScopeKeys: string[];
}

/** An assumption-monitoring verdict consumed, never recomputed. */
export interface ConsumedAssumptionMonitoring {
  assumptionId: string;
  decisionId: string;
  monitoringStatus: AssumptionMonitoringStatus;
  assumptionStatus: string;
}

/**
 * What the gate was evaluated against.
 *
 * Compact by construction: identity, the state a rule read, and the verdicts
 * consumed from the other engines. No artifact is copied here.
 */
export interface TechnicalReadinessScope {
  gate: TechnicalReadinessGate;
  /** How the scope was chosen, in words a reader can check. */
  label: string;
  counts: Record<TechnicalScopeRole, number>;
  objects: TechnicalScopeObject[];
  relationships: TechnicalScopeRelationship[];
  consumed: {
    verificationReadiness: ConsumedVerificationReadiness[];
    changeImpact: ConsumedChangeImpact[];
    assumptionMonitoring: ConsumedAssumptionMonitoring[];
  };
}

export const ACTIVE_SCOPE_LABEL = "Current active engineering scope";

export function emptyScopeCounts(): Record<TechnicalScopeRole, number> {
  return {
    REQUIREMENT: 0,
    DESIGN_ITEM: 0,
    ENGINEERING_DECISION: 0,
    DECISION_ASSUMPTION: 0,
    VERIFICATION_ACTIVITY: 0,
    STAKEHOLDER_NEED: 0,
    EVIDENCE: 0,
    CHANGE_REQUEST: 0,
    RISK: 0,
    ISSUE: 0,
  };
}

// --- Fingerprint ------------------------------------------------------------

function digest(parts: readonly string[]): string {
  return sha256Hex([...parts].sort().join("\n"));
}

/**
 * A deterministic digest of exactly what this gate assessment rested on.
 *
 * **Gate-specific and scope-specific, not a project timestamp.** It contains the
 * objects the scope resolution reached, the state each rule read, each object's
 * own revision stamp, the relationship rows walked, and the verdicts consumed
 * from the verification-readiness, change-impact and assumption-monitoring
 * engines. An artifact outside the evaluated scope cannot move it.
 *
 * The gate is part of the digest, so two gates over the same project produce
 * different fingerprints and neither can be mistaken for the other.
 *
 * Time is never included, so two digests taken a moment apart from an unchanged
 * scope match — otherwise every assessment would be stale the instant it was
 * written.
 */
export function technicalReadinessFingerprint(scope: TechnicalReadinessScope): string {
  const objects = scope.objects.map(
    (object) => `obj:${object.role}:${object.type}:${object.id}:${object.state ?? "-"}:${object.revision}`,
  );

  const relationships = scope.relationships.map(
    (relationship) => `rel:${relationship.edgeType}:${relationship.relationshipId}`,
  );

  const verification = scope.consumed.verificationReadiness.map(
    (entry) =>
      `vr:${entry.verificationActivityId}:${entry.assessmentId ?? "none"}:${entry.status ?? "-"}:${entry.freshness ?? "-"}`,
  );

  const changes = scope.consumed.changeImpact.map(
    (entry) =>
      `chg:${entry.changeRequestId}:${entry.status}:${entry.analysisId ?? "none"}:${entry.analysisFreshness}:${entry.reachedScopeKeys.join("+") || "-"}`,
  );

  const assumptions = scope.consumed.assumptionMonitoring.map(
    (entry) =>
      `asm:${entry.assumptionId}:${entry.monitoringStatus}:${entry.assumptionStatus}`,
  );

  return digest([
    `version:${TECHNICAL_READINESS_VERSION}`,
    `gate:${scope.gate}`,
    `scope:${scope.label}`,
    ...objects,
    ...relationships,
    ...verification,
    ...changes,
    ...assumptions,
  ]);
}

// --- Freshness --------------------------------------------------------------

/**
 * Whether a stored gate assessment still describes the current state.
 *
 * Derived at read time by re-resolving the gate's scope and comparing digests —
 * never stored as a mutable flag, because the assessment record itself must not
 * change after it is written.
 */
export const TECHNICAL_READINESS_FRESHNESS = ["CURRENT", "STALE", "UNKNOWN"] as const;
export type TechnicalReadinessFreshness = (typeof TECHNICAL_READINESS_FRESHNESS)[number];

export function technicalReadinessFreshnessOf(
  storedFingerprint: string,
  currentFingerprint: string,
  storedVersion: string,
): TechnicalReadinessFreshness {
  // An assessment produced by a different rule set is not comparable, and
  // claiming either way about it would be a statement under semantics it never
  // ran on.
  if (storedVersion !== TECHNICAL_READINESS_VERSION) return "UNKNOWN";
  if (!storedFingerprint || !currentFingerprint) return "UNKNOWN";
  return storedFingerprint === currentFingerprint ? "CURRENT" : "STALE";
}

// --- Records ----------------------------------------------------------------

/** Counts, every one of them derived from the findings actually persisted. */
export interface TechnicalReadinessSummary {
  findings: number;
  blocking: number;
  warning: number;
  informational: number;
  unknown: number;
}

/** One deterministic condition the engine evaluated. */
export interface TechnicalReadinessFinding {
  id: string;
  assessmentId: string;
  ruleId: string;
  category: TechnicalReadinessCategory;
  status: TechnicalReadinessFindingStatus;
  severity: TechnicalReadinessSeverity;
  subjectType: GraphNodeType;
  subjectId: string;
  subjectIdentifier: string | null;
  subjectLabel: string;
  /** The explanation, naming the object and the state that produced it. */
  message: string;
  basis: TechnicalReadinessBasisMarker[];
  /** Position in the deterministic ordering, written with the row. */
  sequence: number;
  createdAt: Date;
}

/** One immutable gate assessment. A re-evaluation creates a new one. */
export interface TechnicalReadinessAssessment {
  id: string;
  projectId: string;
  gate: TechnicalReadinessGate;
  status: TechnicalReadinessStatus;
  readinessVersion: string;
  fingerprint: string;
  summary: TechnicalReadinessSummary;
  evaluatedAt: Date;
  evaluatedById: string | null;
  createdAt: Date;
}

/** The full result, as the detail view and the API return it. */
export interface TechnicalReadinessReport {
  assessment: TechnicalReadinessAssessment;
  /** Derived at read time by re-resolving the scope — never stored. */
  freshness: TechnicalReadinessFreshness;
  findings: TechnicalReadinessFinding[];
  /** What the gate was evaluated against. */
  scope: TechnicalReadinessScope;
}

/**
 * What the API returns when a gate has never been evaluated.
 *
 * A distinct shape rather than an empty report: zero findings would read as "we
 * checked and found nothing wrong", which is a far stronger claim than "nobody
 * has assessed this gate".
 */
export interface NoTechnicalReadiness {
  status: "NOT_EVALUATED";
  projectId: string;
  gate: TechnicalReadinessGate;
  readinessVersion: string;
}

export type LatestTechnicalReadiness = TechnicalReadinessReport | NoTechnicalReadiness;

export function hasTechnicalReadiness(
  value: LatestTechnicalReadiness,
): value is TechnicalReadinessReport {
  return "assessment" in value;
}

// --- Deterministic ordering -------------------------------------------------

/**
 * Total order over findings.
 *
 * Strongest status first so blockers lead, then rule id, then subject. Nothing
 * falls back to insertion order or database row order, so two evaluations over
 * the same state list their findings identically.
 */
export function compareTechnicalFindings(
  a: Pick<TechnicalReadinessFinding, "status" | "ruleId" | "subjectType" | "subjectId">,
  b: Pick<TechnicalReadinessFinding, "status" | "ruleId" | "subjectType" | "subjectId">,
): number {
  const byStatus =
    TECHNICAL_FINDING_STATUS_PRECEDENCE[b.status] - TECHNICAL_FINDING_STATUS_PRECEDENCE[a.status];
  if (byStatus !== 0) return byStatus;
  if (a.ruleId !== b.ruleId) return a.ruleId < b.ruleId ? -1 : 1;
  if (a.subjectType !== b.subjectType) return a.subjectType < b.subjectType ? -1 : 1;
  if (a.subjectId === b.subjectId) return 0;
  return a.subjectId < b.subjectId ? -1 : 1;
}

/** Stable order for scope objects, so two runs snapshot a scope identically. */
export function compareScopeObjects(
  a: TechnicalScopeObject,
  b: TechnicalScopeObject,
): number {
  const byRole =
    TECHNICAL_SCOPE_ROLES.indexOf(a.role) - TECHNICAL_SCOPE_ROLES.indexOf(b.role);
  if (byRole !== 0) return byRole;

  const left = a.identifier ?? a.id;
  const right = b.identifier ?? b.id;
  if (left !== right) return left < right ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/**
 * A stable signature of what a gate assessment concluded.
 *
 * Two evaluations are equivalent when their signatures match: same version,
 * same gate, same verdict, same rules fired against the same subjects. Ids and
 * timestamps are excluded on purpose — they differ between runs and say nothing
 * about whether the engine reached the same conclusion.
 */
export function technicalReadinessSignature(report: TechnicalReadinessReport): string {
  const findings = [...report.findings]
    .sort(compareTechnicalFindings)
    .map((finding) =>
      [
        finding.ruleId,
        finding.category,
        finding.status,
        finding.severity,
        finding.subjectType,
        finding.subjectId,
        finding.basis.join("+"),
      ].join("|"),
    );

  return [
    `version=${report.assessment.readinessVersion}`,
    `gate=${report.assessment.gate}`,
    `status=${report.assessment.status}`,
    `findings=${findings.join(";")}`,
  ].join("\n");
}

// --- Request contracts ------------------------------------------------------

/**
 * Evaluation input.
 *
 * The gate, and nothing else. `strictObject` means a client that tries to send
 * a verdict, a rule, a finding, an organization, a project, an actor or a
 * readiness version is rejected outright rather than having the field quietly
 * dropped — a silent drop hides an attempt worth failing loudly on.
 *
 * The backend owns rule selection entirely: the gate names a set of rules in the
 * registry, and there is no request shape that could add to or subtract from it.
 */
export const evaluateTechnicalReadinessRequestSchema = z.strictObject({
  gate: technicalReadinessGateSchema,
});

export type EvaluateTechnicalReadinessRequest = z.infer<
  typeof evaluateTechnicalReadinessRequestSchema
>;

export const technicalReadinessIdSchema = z
  .string()
  .trim()
  .min(1, "An assessment id is required")
  .max(64, "Assessment id is too long")
  .regex(/^[A-Za-z0-9_-]+$/, "Assessment id contains invalid characters");
