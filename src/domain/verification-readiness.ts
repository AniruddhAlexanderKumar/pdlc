import { createHash } from "node:crypto";
import { z } from "zod";
import type { AssumptionMonitoringStatus } from "./assumption-monitoring";
import type { GraphEdgeType, GraphNodeType } from "./graph";
import type { VerificationStatus } from "./shared/enums";
import { entityIdSchema } from "./shared/identifier";

/**
 * Verification readiness.
 *
 * One question, asked of one verification activity:
 *
 * > *Given the current engineering baseline and the records that exist, can
 * > this verification activity be executed — or concluded — responsibly?*
 *
 * **Readiness is not a result.** A READY activity has not passed; a NOT_READY
 * activity is not a failure and does not mean the requirement is wrong. The two
 * live in different columns of the same record and are never merged: the
 * lifecycle (`PLANNED → IN_PROGRESS → PASSED | FAILED | WAIVED`) says what
 * happened, and readiness says whether what is about to happen rests on
 * anything defensible.
 *
 * Three things this deliberately is not:
 *
 *  - **Not a checklist.** Nothing here is a box a person ticks. Every finding is
 *    derived from a recorded engineering state — a requirement's lifecycle, a
 *    decision's status, a monitoring verdict — and cites the record it read.
 *  - **Not a score.** There is no percentage, no "4 of 5", no confidence and no
 *    probability. A fabricated number would be read as a measurement. The answer
 *    is READY, NOT_READY or UNKNOWN, with reasons.
 *  - **Not an inference from silence.** Missing information produces UNKNOWN,
 *    never a pass and never a failure. In particular, an activity with no
 *    evidence attached is *not* unready: verification evidence is an output of
 *    verification, not an input to readiness.
 *
 * Everything here is Prisma-free.
 */

/**
 * Which rule set produced an assessment.
 *
 * Assessments are only comparable within a version. Bump this whenever a rule
 * is added, removed, or its outcome changes, so an old assessment is never
 * silently read under new semantics.
 */
export const VERIFICATION_READINESS_VERSION = "1";

// --- Assessment status ------------------------------------------------------

/**
 * What the engine concluded.
 *
 * `READY` — every blocking condition in the registry was evaluated and none
 *   fired, and nothing was indeterminate.
 * `NOT_READY` — at least one blocking condition fired. The findings name it.
 * `UNKNOWN` — nothing blocking fired, but at least one condition could not be
 *   determined from the record. This is *not* a soft failure: it means the
 *   engine refuses to claim readiness it cannot support.
 */
export const VERIFICATION_READINESS_STATUSES = ["READY", "NOT_READY", "UNKNOWN"] as const;
export type VerificationReadinessStatus = (typeof VERIFICATION_READINESS_STATUSES)[number];

/**
 * Which question the assessment answered.
 *
 * Readiness is not one question. An activity that has not started is asked
 * whether it can be *executed*; one already running is asked whether it can be
 * *concluded*; one that has already landed on an outcome is asked nothing,
 * because its record is closed.
 *
 * Naming the scope is what lets the engine stay honest about an `IN_PROGRESS`
 * activity instead of either calling it READY (which would suggest it is
 * waiting to start) or NOT_READY (which would suggest something is wrong).
 */
export const VERIFICATION_READINESS_SCOPES = ["EXECUTION", "CLOSURE", "NOT_APPLICABLE"] as const;
export type VerificationReadinessScope = (typeof VERIFICATION_READINESS_SCOPES)[number];

/**
 * The scope implied by the activity's own lifecycle state.
 *
 * Pure, and the single place the mapping is written down.
 */
export function readinessScopeFor(status: VerificationStatus): VerificationReadinessScope {
  switch (status) {
    case "PLANNED":
      return "EXECUTION";
    case "IN_PROGRESS":
      return "CLOSURE";
    case "PASSED":
    case "FAILED":
    case "WAIVED":
      return "NOT_APPLICABLE";
  }
}

// --- Findings ---------------------------------------------------------------

/**
 * What part of the engineering record a finding concerns.
 *
 * Categories communicate *where a deterministic rule looked*, never how serious
 * a human should consider it. There is no risk axis here.
 */
export const VERIFICATION_READINESS_CATEGORIES = [
  "REQUIREMENT_STATE",
  "VERIFICATION_DEFINITION",
  "OWNER",
  "DESIGN_STATE",
  "DECISION_STATE",
  "ASSUMPTION_STATE",
  "EVIDENCE",
  "CHANGE_IMPACT",
  "TRACEABILITY",
  "UNKNOWN",
] as const;
export type VerificationReadinessCategory = (typeof VERIFICATION_READINESS_CATEGORIES)[number];

/**
 * What a finding does to the assessment.
 *
 * `BLOCKING` — readiness cannot be claimed while this holds.
 * `WARNING` — a real condition worth reading that the registry deliberately
 *   does not treat as disqualifying. Warnings never change the status.
 * `INFORMATIONAL` — a condition the engine checked and found satisfied, or a
 *   fact recorded so that a READY verdict is explainable rather than empty.
 * `UNKNOWN` — the condition could not be determined from the record.
 */
export const VERIFICATION_READINESS_FINDING_STATUSES = [
  "BLOCKING",
  "WARNING",
  "INFORMATIONAL",
  "UNKNOWN",
] as const;
export type VerificationReadinessFindingStatus =
  (typeof VERIFICATION_READINESS_FINDING_STATUSES)[number];

/**
 * The severity label carried on a persisted finding.
 *
 * Deliberately **derived**, not judged: it is a one-to-one restatement of the
 * finding's status in words an engineer reads on a report, and the mapping
 * below is the only place it is produced. It is not a second axis, and it is
 * emphatically not a risk rating — inventing one would be a subjective score
 * wearing an enum's clothes.
 */
export const VERIFICATION_READINESS_SEVERITIES = [
  "BLOCKER",
  "ADVISORY",
  "NOTE",
  "INDETERMINATE",
] as const;
export type VerificationReadinessSeverity = (typeof VERIFICATION_READINESS_SEVERITIES)[number];

const SEVERITY_FOR_STATUS: Readonly<
  Record<VerificationReadinessFindingStatus, VerificationReadinessSeverity>
> = {
  BLOCKING: "BLOCKER",
  WARNING: "ADVISORY",
  INFORMATIONAL: "NOTE",
  UNKNOWN: "INDETERMINATE",
};

export function severityForFindingStatus(
  status: VerificationReadinessFindingStatus,
): VerificationReadinessSeverity {
  return SEVERITY_FOR_STATUS[status];
}

/**
 * Deterministic markers naming what a finding was read from.
 *
 * Every finding cites at least one. This is the "basis" half of
 * *condition → basis → affected object → reason*: a reader can tell which
 * record produced the statement, and — just as importantly — which questions
 * the engine deliberately did not answer.
 */
export const VERIFICATION_READINESS_BASIS_MARKERS = [
  "VERIFICATION_ACTIVITY_RECORD",
  "VERIFICATION_LIFECYCLE_STATE",
  "VERIFICATION_OWNER_FIELD",
  "OWNER_NOT_REQUIRED_BY_DOMAIN",
  "REQUIREMENT_VERIFICATION_LINK",
  "REQUIREMENT_LIFECYCLE_STATE",
  "NO_REQUIREMENT_LINK",
  "SUBJECT_UNRESOLVED",
  "REQUIREMENT_DESIGN_LINK",
  "DESIGN_LIFECYCLE_STATE",
  "REQUIREMENT_DECISION_LINK",
  "DECISION_DESIGN_LINK",
  "DECISION_LIFECYCLE_STATE",
  "DECISION_ASSUMPTION_RECORD",
  "ASSUMPTION_EXPLICIT_STATUS",
  "ASSUMPTION_MONITORING_RECORD",
  "ASSUMPTION_MONITORING_NOT_EVALUATED",
  "EVIDENCE_LINK",
  "EVIDENCE_NOT_A_READINESS_PREREQUISITE",
  "DECLARED_CHANGE_IMPACT",
  "COMPUTED_CHANGE_IMPACT",
  "CHANGE_IMPACT_ANALYSIS_STALE",
  "CHANGE_IMPACT_ANALYSIS_ABSENT",
] as const;
export type VerificationReadinessBasisMarker =
  (typeof VERIFICATION_READINESS_BASIS_MARKERS)[number];

/** Deduplicated and sorted, so identical findings carry identical basis lists. */
export function normalizeReadinessBasis(
  markers: readonly VerificationReadinessBasisMarker[],
): VerificationReadinessBasisMarker[] {
  return [...new Set(markers)].sort();
}

// --- The rule registry ------------------------------------------------------

/**
 * One deterministic readiness rule.
 *
 * A rule is a *condition* over recorded state with exactly one outcome. Rules
 * that could produce two different outcomes are split into two rules, so a rule
 * id in a finding is enough to know what was concluded and why.
 */
export interface VerificationReadinessRule {
  /** Stable identifier, quoted in findings and in the UI. */
  id: string;
  category: VerificationReadinessCategory;
  /** The outcome this rule produces when its condition holds. */
  status: VerificationReadinessFindingStatus;
  /** What the rule is for, in one line. */
  description: string;
  /** The condition, stated so it can be checked against the implementation. */
  condition: string;
  /** Which records the rule reads. Every finding it emits cites these. */
  basis: readonly VerificationReadinessBasisMarker[];
  /** Why the outcome is what it is, in engineering terms. */
  rationale: string;
  /**
   * Scopes the rule is evaluated in. A rule that only makes sense before
   * execution is not silently applied to an activity being concluded.
   */
  scopes: readonly VerificationReadinessScope[];
}

/**
 * The scopes in which an activity still has something ahead of it.
 *
 * Most rules apply to both: the conditions that make a verification defensible
 * to start are the same ones that make it defensible to close. Rules that only
 * make sense in one scope name it explicitly.
 */
const OPEN_SCOPES = ["EXECUTION", "CLOSURE"] as const;

/**
 * **The single authoritative readiness rule registry.**
 *
 * Nothing outside this table decides whether a condition blocks readiness. The
 * service resolves the engineering basis and evaluates these rules against it;
 * it contains no readiness policy of its own, and no `if` in the service may
 * introduce a condition that is not declared here.
 *
 * Two boundaries are worth stating explicitly, because both are places where a
 * plausible-looking rule would have been wrong:
 *
 *  - **Owner is not required.** The domain makes `ownerId` nullable on a
 *    verification activity, and no operation refuses to run without it. Making
 *    a missing owner blocking would invent a requirement the product does not
 *    have, so `VR-OWN-001` is a warning.
 *  - **Evidence is not a prerequisite.** Evidence records what a verification
 *    produced. Demanding it before execution would mean no activity is ever
 *    ready, which is not a safety rule but a broken one.
 */
export const VERIFICATION_READINESS_RULES: readonly VerificationReadinessRule[] = [
  // --- Traceability ---------------------------------------------------------
  {
    id: "VR-TRACE-001",
    category: "TRACEABILITY",
    status: "BLOCKING",
    description: "A verification activity must verify at least one requirement.",
    condition: "No RequirementVerificationLink exists for this activity.",
    basis: ["VERIFICATION_ACTIVITY_RECORD", "NO_REQUIREMENT_LINK"],
    rationale:
      "Verification demonstrates that a requirement is met. An activity attached to no requirement demonstrates nothing that the record can name, so there is no baseline against which readiness could be judged.",
    scopes: OPEN_SCOPES,
  },
  {
    id: "VR-TRACE-002",
    category: "TRACEABILITY",
    status: "UNKNOWN",
    description: "A linked requirement must be readable in this project.",
    condition:
      "A RequirementVerificationLink exists but the requirement record could not be resolved in the project.",
    basis: ["REQUIREMENT_VERIFICATION_LINK", "SUBJECT_UNRESOLVED"],
    rationale:
      "The link asserts a requirement this activity verifies, and that requirement cannot be read. The engine will not guess its state in either direction, so the condition is reported as indeterminate rather than as satisfied or failed.",
    scopes: OPEN_SCOPES,
  },

  // --- Requirement state ----------------------------------------------------
  {
    id: "VR-REQ-001",
    category: "REQUIREMENT_STATE",
    status: "BLOCKING",
    description: "A verified requirement must be under configuration control.",
    condition: "A linked requirement is DRAFT or IN_REVIEW.",
    basis: ["REQUIREMENT_VERIFICATION_LINK", "REQUIREMENT_LIFECYCLE_STATE"],
    rationale:
      "A requirement that is still being drafted or reviewed can change while the verification is being performed, which would leave a result that demonstrates something nobody agreed to. APPROVED or BASELINED is the point at which the statement is stable enough to verify against.",
    scopes: OPEN_SCOPES,
  },
  {
    id: "VR-REQ-002",
    category: "REQUIREMENT_STATE",
    status: "BLOCKING",
    description: "An obsolete requirement is not verifiable.",
    condition: "A linked requirement is OBSOLETE.",
    basis: ["REQUIREMENT_VERIFICATION_LINK", "REQUIREMENT_LIFECYCLE_STATE"],
    rationale:
      "An obsolete requirement has been withdrawn from the baseline. Verifying it would produce a result about a statement the programme no longer holds.",
    scopes: OPEN_SCOPES,
  },
  {
    id: "VR-REQ-003",
    category: "REQUIREMENT_STATE",
    status: "INFORMATIONAL",
    description: "The verified requirement is under configuration control.",
    condition: "A linked requirement is APPROVED or BASELINED.",
    basis: ["REQUIREMENT_VERIFICATION_LINK", "REQUIREMENT_LIFECYCLE_STATE"],
    rationale:
      "Recorded so a READY verdict names the requirement it rests on rather than being an unexplained pass.",
    scopes: OPEN_SCOPES,
  },

  // --- Verification definition and lifecycle -------------------------------
  {
    id: "VR-DEF-001",
    category: "VERIFICATION_DEFINITION",
    status: "BLOCKING",
    description: "The activity must carry a title.",
    condition: "The activity's title is empty or whitespace.",
    basis: ["VERIFICATION_ACTIVITY_RECORD"],
    rationale:
      "An activity nobody can name cannot be assigned, executed or reported. The create contract already requires a title; this rule catches a record that reached the database by some other route.",
    scopes: OPEN_SCOPES,
  },
  {
    id: "VR-DEF-002",
    category: "VERIFICATION_DEFINITION",
    status: "BLOCKING",
    description: "The activity must declare a verification method.",
    condition: "The activity has no method recorded.",
    basis: ["VERIFICATION_ACTIVITY_RECORD"],
    rationale:
      "Analysis, inspection, test and demonstration are not interchangeable. Without a method there is no statement of how the requirement would be shown to be met.",
    scopes: OPEN_SCOPES,
  },
  {
    id: "VR-LIFE-001",
    category: "VERIFICATION_DEFINITION",
    status: "INFORMATIONAL",
    description: "The activity is planned, so execution readiness is the live question.",
    condition: "The activity's lifecycle state is PLANNED.",
    basis: ["VERIFICATION_LIFECYCLE_STATE"],
    rationale:
      "Records which question this assessment answered, so a reader is never left guessing whether READY meant 'ready to start' or 'ready to close'.",
    scopes: ["EXECUTION"],
  },
  {
    id: "VR-LIFE-002",
    category: "VERIFICATION_DEFINITION",
    status: "INFORMATIONAL",
    description: "The activity is in progress, so the assessment addresses closure readiness.",
    condition: "The activity's lifecycle state is IN_PROGRESS.",
    basis: ["VERIFICATION_LIFECYCLE_STATE"],
    rationale:
      "Execution has begun, so 'ready to execute' is no longer the question being asked. Reporting READY without saying so would be read as an invitation to start something already running.",
    scopes: ["CLOSURE"],
  },
  {
    id: "VR-LIFE-003",
    category: "VERIFICATION_DEFINITION",
    status: "BLOCKING",
    description: "A concluded activity has no readiness question left to answer.",
    condition: "The activity's lifecycle state is PASSED, FAILED or WAIVED.",
    basis: ["VERIFICATION_LIFECYCLE_STATE"],
    rationale:
      "An outcome is a statement about one execution and is final. Calling a closed record READY merely because it exists would suggest something is still available to do; re-verification means planning a new activity.",
    scopes: ["NOT_APPLICABLE"],
  },

  // --- Owner ----------------------------------------------------------------
  {
    id: "VR-OWN-001",
    category: "OWNER",
    status: "WARNING",
    description: "No owner is assigned to the activity.",
    condition: "The activity's ownerId is null.",
    basis: ["VERIFICATION_OWNER_FIELD", "OWNER_NOT_REQUIRED_BY_DOMAIN"],
    rationale:
      "Nobody is accountable for performing this activity, which is worth seeing. It is not blocking: the domain models ownership as optional and no operation refuses to run without it, so blocking here would enforce a rule the product does not have.",
    scopes: OPEN_SCOPES,
  },

  // --- Design state ---------------------------------------------------------
  {
    id: "VR-DES-001",
    category: "DESIGN_STATE",
    status: "BLOCKING",
    description: "A prerequisite design item is obsolete.",
    condition:
      "A design item a verified requirement is allocated to, or satisfied by, is OBSOLETE.",
    basis: ["REQUIREMENT_DESIGN_LINK", "DESIGN_LIFECYCLE_STATE"],
    rationale:
      "The requirement is recorded as being met by a design element that has been withdrawn. Whatever the verification demonstrated would be a statement about a configuration the programme has abandoned.",
    scopes: OPEN_SCOPES,
  },
  {
    id: "VR-DES-002",
    category: "DESIGN_STATE",
    status: "WARNING",
    description: "A prerequisite design item is not yet under configuration control.",
    condition:
      "A design item a verified requirement is allocated to, or satisfied by, is DRAFT or IN_REVIEW.",
    basis: ["REQUIREMENT_DESIGN_LINK", "DESIGN_LIFECYCLE_STATE"],
    rationale:
      "The configuration being verified can still move. That is a real thing to know, but the domain permits verifying against an uncontrolled design — analysis and demonstration routinely run early — so imposing a universal approved-design requirement would invent a rule the product does not hold.",
    scopes: OPEN_SCOPES,
  },
  {
    id: "VR-DES-003",
    category: "DESIGN_STATE",
    status: "INFORMATIONAL",
    description: "The prerequisite design item is under configuration control.",
    condition:
      "A design item a verified requirement is allocated to, or satisfied by, is APPROVED or BASELINED.",
    basis: ["REQUIREMENT_DESIGN_LINK", "DESIGN_LIFECYCLE_STATE"],
    rationale: "Recorded so the configuration the assessment rests on is named.",
    scopes: OPEN_SCOPES,
  },

  // --- Decision state -------------------------------------------------------
  {
    id: "VR-DEC-001",
    category: "DECISION_STATE",
    status: "BLOCKING",
    description: "A decision the verified configuration depends on is unsettled.",
    condition: "A relevant decision dependency is PROPOSED or UNDER_REVIEW.",
    basis: ["DECISION_LIFECYCLE_STATE"],
    rationale:
      "The decision that establishes what is being verified has not been taken. A result obtained now would describe one candidate configuration and could be invalidated by the decision itself.",
    scopes: OPEN_SCOPES,
  },
  {
    id: "VR-DEC-002",
    category: "DECISION_STATE",
    status: "BLOCKING",
    description: "A decision the verified configuration depends on was rejected.",
    condition: "A relevant decision dependency is REJECTED.",
    basis: ["DECISION_LIFECYCLE_STATE"],
    rationale:
      "The record still says this decision addresses the requirement or shapes the design, and the decision was refused. Those two statements cannot both hold, and verification must not proceed on a contradiction the record has not resolved.",
    scopes: OPEN_SCOPES,
  },
  {
    id: "VR-DEC-003",
    category: "DECISION_STATE",
    status: "WARNING",
    description: "A decision the verified configuration depends on has been superseded.",
    condition: "A relevant decision dependency is SUPERSEDED.",
    basis: ["DECISION_LIFECYCLE_STATE"],
    rationale:
      "Something replaced this decision, and the schema records no link from a superseded decision to its successor — so the engine genuinely cannot say which decision now governs. It reports what it can see and leaves the substitution to a person rather than guessing.",
    scopes: OPEN_SCOPES,
  },
  {
    id: "VR-DEC-004",
    category: "DECISION_STATE",
    status: "INFORMATIONAL",
    description: "The decision dependency is approved.",
    condition: "A relevant decision dependency is APPROVED.",
    basis: ["DECISION_LIFECYCLE_STATE"],
    rationale:
      "Recorded so the decisions the configuration rests on are named. An approved decision is not a claim that its content is correct — only that it was taken.",
    scopes: OPEN_SCOPES,
  },

  // --- Assumption state -----------------------------------------------------
  {
    id: "VR-ASM-001",
    category: "ASSUMPTION_STATE",
    status: "BLOCKING",
    description: "An assumption behind a relevant decision needs review.",
    condition:
      "Assumption monitoring reports REVIEW_REQUIRED for an assumption of a relevant decision.",
    basis: ["DECISION_ASSUMPTION_RECORD", "ASSUMPTION_MONITORING_RECORD"],
    rationale:
      "Somebody had judged this assumption, and the basis that judgement was made against has since moved. The verification would rest on a conclusion nobody has re-confirmed. Monitoring's verdict is consumed here and never altered.",
    scopes: OPEN_SCOPES,
  },
  {
    id: "VR-ASM-002",
    category: "ASSUMPTION_STATE",
    status: "WARNING",
    description: "The basis of an assumption behind a relevant decision has changed.",
    condition:
      "Assumption monitoring reports BASIS_CHANGED for an assumption of a relevant decision.",
    basis: ["DECISION_ASSUMPTION_RECORD", "ASSUMPTION_MONITORING_RECORD"],
    rationale:
      "The recorded basis moved, but nobody had committed to a judgement standing on it, so there is nothing to re-confirm. Worth reading; not disqualifying.",
    scopes: OPEN_SCOPES,
  },
  {
    id: "VR-ASM-003",
    category: "ASSUMPTION_STATE",
    status: "UNKNOWN",
    description: "An assumption behind a relevant decision has never been monitored.",
    condition:
      "An assumption of a relevant decision has no monitoring record, so its basis has never been checked.",
    basis: ["DECISION_ASSUMPTION_RECORD", "ASSUMPTION_MONITORING_NOT_EVALUATED"],
    rationale:
      "Nobody has looked. That is different from having looked and found nothing wrong, and it is emphatically not evidence that the assumption fails — so the condition is indeterminate rather than blocking.",
    scopes: OPEN_SCOPES,
  },
  {
    id: "VR-ASM-004",
    category: "ASSUMPTION_STATE",
    status: "INFORMATIONAL",
    description: "The assumption's recorded basis is current.",
    condition: "Assumption monitoring reports CURRENT for an assumption of a relevant decision.",
    basis: ["DECISION_ASSUMPTION_RECORD", "ASSUMPTION_MONITORING_RECORD"],
    rationale: "Recorded so the assumptions the configuration stands on are named.",
    scopes: OPEN_SCOPES,
  },
  {
    id: "VR-ASM-005",
    category: "ASSUMPTION_STATE",
    status: "BLOCKING",
    description: "An assumption behind a relevant decision has been judged invalid.",
    condition: "An assumption of a relevant decision carries the explicit status INVALIDATED.",
    basis: ["DECISION_ASSUMPTION_RECORD", "ASSUMPTION_EXPLICIT_STATUS"],
    rationale:
      "An engineer stated that something the decision needed is not true. This consumes that person's judgement; nothing in this engine ever sets an assumption's status.",
    scopes: OPEN_SCOPES,
  },

  // --- Evidence -------------------------------------------------------------
  {
    id: "VR-EVD-001",
    category: "EVIDENCE",
    status: "INFORMATIONAL",
    description: "Evidence is attached to the activity.",
    condition: "One or more EvidenceLink rows point at this activity.",
    basis: ["EVIDENCE_LINK"],
    rationale: "Recorded so the report names what the activity already carries.",
    scopes: OPEN_SCOPES,
  },
  {
    id: "VR-EVD-002",
    category: "EVIDENCE",
    status: "INFORMATIONAL",
    description: "No evidence is attached, which is expected before execution.",
    condition: "The activity has no evidence and the assessment is about execution readiness.",
    basis: ["EVIDENCE_LINK", "EVIDENCE_NOT_A_READINESS_PREREQUISITE"],
    rationale:
      "Verification evidence is what verification produces. Treating its absence as a readiness deficiency would mean no activity is ever ready, and would confuse 'not yet performed' with 'not defensible' — the exact conflation this engine exists to avoid.",
    scopes: ["EXECUTION"],
  },
  {
    id: "VR-EVD-003",
    category: "EVIDENCE",
    status: "WARNING",
    description: "An in-progress activity carries no evidence yet.",
    condition: "The activity has no evidence and the assessment is about closure readiness.",
    basis: ["EVIDENCE_LINK", "EVIDENCE_NOT_A_READINESS_PREREQUISITE"],
    rationale:
      "Concluding an activity that recorded nothing leaves an outcome with no supporting record. It is not blocking, because the domain does not require evidence to conclude an activity and a waiver legitimately has none.",
    scopes: ["CLOSURE"],
  },

  // --- Change impact --------------------------------------------------------
  {
    id: "VR-CHG-001",
    category: "CHANGE_IMPACT",
    status: "BLOCKING",
    description: "An active change reaches this verification activity.",
    condition:
      "An active change request's current impact analysis names this verification activity in its affected set.",
    basis: ["COMPUTED_CHANGE_IMPACT"],
    rationale:
      "A change still in flight has been computed to reach this activity. Executing or closing it now would produce a result about a plan that is under revision.",
    scopes: OPEN_SCOPES,
  },
  {
    id: "VR-CHG-002",
    category: "CHANGE_IMPACT",
    status: "BLOCKING",
    description: "An active change reaches a requirement this activity verifies.",
    condition:
      "An active change request's current impact analysis names a linked requirement in its affected set.",
    basis: ["COMPUTED_CHANGE_IMPACT", "REQUIREMENT_VERIFICATION_LINK"],
    rationale:
      "The statement being verified is itself under proposed change. A result obtained now may demonstrate a requirement that is about to be rewritten.",
    scopes: OPEN_SCOPES,
  },
  {
    id: "VR-CHG-003",
    category: "CHANGE_IMPACT",
    status: "UNKNOWN",
    description: "A relevant change's impact analysis is stale.",
    condition:
      "An active change request touching this activity's basis has an impact analysis whose stored fingerprint no longer matches the project state, or cannot be compared against it.",
    basis: ["CHANGE_IMPACT_ANALYSIS_STALE", "DECLARED_CHANGE_IMPACT"],
    rationale:
      "The stored affected set was computed against a project state that has since moved. Reading it as current would present an out-of-date impact assessment as evidence, so the condition is reported as indeterminate. This engine never runs an impact analysis of its own.",
    scopes: OPEN_SCOPES,
  },
  {
    id: "VR-CHG-004",
    category: "CHANGE_IMPACT",
    status: "UNKNOWN",
    description: "A relevant change has never been analysed.",
    condition:
      "An active change request touching this activity's basis has no completed impact analysis — none was ever run, or the latest one failed.",
    basis: ["CHANGE_IMPACT_ANALYSIS_ABSENT", "DECLARED_CHANGE_IMPACT"],
    rationale:
      "An engineer asserted that this change touches something the verification stands on, and nobody has computed how far it reaches. The engine cannot claim the activity is unaffected, and it will not run the analysis itself.",
    scopes: OPEN_SCOPES,
  },
  {
    id: "VR-CHG-005",
    category: "CHANGE_IMPACT",
    status: "WARNING",
    description: "An active change reaches a prerequisite design item or decision.",
    condition:
      "An active change request's current impact analysis names a prerequisite design item or a relevant decision, but neither this activity nor a verified requirement.",
    basis: ["COMPUTED_CHANGE_IMPACT"],
    rationale:
      "The change reaches the surrounding configuration rather than the requirement or the activity itself. Worth reading before executing; not on its own a reason to stop.",
    scopes: OPEN_SCOPES,
  },
] as const;

/** Rule lookup by id. Built once; the registry is immutable. */
const RULES_BY_ID: ReadonlyMap<string, VerificationReadinessRule> = new Map(
  VERIFICATION_READINESS_RULES.map((rule) => [rule.id, rule]),
);

export function readinessRule(ruleId: string): VerificationReadinessRule | null {
  return RULES_BY_ID.get(ruleId) ?? null;
}

/** Whether a rule's outcome disqualifies readiness. Derived, never declared twice. */
export function isBlockingRule(rule: VerificationReadinessRule): boolean {
  return rule.status === "BLOCKING";
}

/** Whether a rule is evaluated for an activity in this scope. */
export function ruleAppliesInScope(
  rule: VerificationReadinessRule,
  scope: VerificationReadinessScope,
): boolean {
  return rule.scopes.includes(scope);
}

/** The rules evaluated in a scope, in registry order. Deterministic by construction. */
export function rulesForScope(
  scope: VerificationReadinessScope,
): readonly VerificationReadinessRule[] {
  return VERIFICATION_READINESS_RULES.filter((rule) => ruleAppliesInScope(rule, scope));
}

/** Every rule id the registry defines, sorted. Used by the registry tests. */
export function readinessRuleIds(): string[] {
  return VERIFICATION_READINESS_RULES.map((rule) => rule.id).sort();
}

/** Rule ids that block readiness, sorted. */
export function blockingReadinessRuleIds(): string[] {
  return VERIFICATION_READINESS_RULES.filter(isBlockingRule)
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
export const READINESS_FINDING_STATUS_PRECEDENCE: Readonly<
  Record<VerificationReadinessFindingStatus, number>
> = {
  BLOCKING: 4,
  UNKNOWN: 3,
  WARNING: 2,
  INFORMATIONAL: 1,
};

/** A finding as the precedence rule needs to see it. */
export interface ReadinessOutcome {
  status: VerificationReadinessFindingStatus;
}

/**
 * **The single place an assessment status is decided.**
 *
 * `BLOCKING > UNKNOWN > READY`. Warnings and informational findings never move
 * the verdict — a rule that should block says so in the registry.
 *
 * An assessment with no findings at all is UNKNOWN rather than READY: every
 * scope has at least one rule that always emits, so an empty result means the
 * evaluation did not actually happen, and claiming readiness from it would be
 * claiming readiness from silence.
 */
export function readinessStatusFor(
  findings: readonly ReadinessOutcome[],
): VerificationReadinessStatus {
  if (findings.length === 0) return "UNKNOWN";
  if (findings.some((finding) => finding.status === "BLOCKING")) return "NOT_READY";
  if (findings.some((finding) => finding.status === "UNKNOWN")) return "UNKNOWN";
  return "READY";
}

// --- Basis ------------------------------------------------------------------

/**
 * Why an object is in the assessment's basis.
 *
 * The role is the engineering reason, not the object's type: a design item is
 * in the basis because a verified requirement is allocated to it, and saying so
 * is what makes the basis chain readable.
 */
export const READINESS_BASIS_ROLES = [
  "VERIFICATION_ACTIVITY",
  "VERIFIED_REQUIREMENT",
  "PREREQUISITE_DESIGN_ITEM",
  "RELEVANT_DECISION",
  "DECISION_ASSUMPTION",
  "ATTACHED_EVIDENCE",
] as const;
export type ReadinessBasisRole = (typeof READINESS_BASIS_ROLES)[number];

/**
 * One engineering object the assessment read.
 *
 * `revision` is the object's own last-modified stamp, never "now" — that is
 * what makes "has this moved?" answerable without storing a copy of the record.
 * `state` is the lifecycle value the rules actually read, kept alongside the
 * revision so a fingerprint moves even where a timestamp did not.
 */
export interface ReadinessBasisObject {
  role: ReadinessBasisRole;
  type: GraphNodeType;
  id: string;
  identifier: string | null;
  label: string;
  revision: string;
  state: string | null;
}

/** A relationship row the basis was reached through. */
export interface ReadinessBasisRelationship {
  edgeType: GraphEdgeType;
  relationshipId: string;
  fromType: GraphNodeType;
  fromId: string;
  toType: GraphNodeType;
  toId: string;
  linkType: string | null;
}

/** Monitoring state consumed for one assumption. Never written by this engine. */
export interface ReadinessBasisMonitoring {
  assumptionId: string;
  /** The monitoring record read, or null when the assumption was never evaluated. */
  recordId: string | null;
  monitoringStatus: AssumptionMonitoringStatus;
  basisFingerprint: string | null;
}

/** How a relevant change request bears on this activity. Read, never computed. */
export const READINESS_CHANGE_FRESHNESS = ["CURRENT", "STALE", "UNKNOWN", "NOT_RUN"] as const;
export type ReadinessChangeFreshness = (typeof READINESS_CHANGE_FRESHNESS)[number];

export interface ReadinessBasisChange {
  changeRequestId: string;
  identifier: string | null;
  title: string;
  status: string;
  /** The latest impact analysis for this change, when one exists. */
  analysisId: string | null;
  analysisFingerprint: string | null;
  analysisFreshness: ReadinessChangeFreshness;
  /** Basis objects the change *declares*, as node keys. Sorted. */
  declaredSubjects: string[];
  /** Basis objects the change's latest analysis *reached*, as node keys. Sorted. */
  affectedSubjects: string[];
}

/** Everything one evaluation looked at. Persisted with the assessment. */
export interface VerificationReadinessBasis {
  verificationActivityId: string;
  scope: VerificationReadinessScope;
  objects: ReadinessBasisObject[];
  relationships: ReadinessBasisRelationship[];
  monitoring: ReadinessBasisMonitoring[];
  changes: ReadinessBasisChange[];
}

// --- Fingerprint ------------------------------------------------------------

function digest(parts: readonly string[]): string {
  return createHash("sha256").update([...parts].sort().join("\n")).digest("hex");
}

/**
 * A deterministic digest of exactly what this assessment rested on.
 *
 * **Activity-specific, not project-wide.** It contains only the objects this
 * activity's basis walk reached, so editing an unrelated requirement elsewhere
 * in the project cannot stale it. That is the deliberate improvement over the
 * conservative project-wide fingerprint the impact engine uses, and it is what
 * makes a "stale" badge worth believing.
 *
 * One project-wide signal does enter, and only where it is genuinely part of
 * the basis: when the assessment consumed a change request's impact analysis,
 * that analysis's freshness is included. The impact engine derives freshness
 * from a project-wide digest, so an edit anywhere can flip it — but this only
 * affects assessments that actually rest on an impact analysis, and for those
 * the flip is a real change in what the assessment relied on.
 *
 * Time is never included, and neither are ids of the assessment itself.
 */
export function readinessFingerprint(basis: VerificationReadinessBasis): string {
  const objects = basis.objects.map(
    (object) => `obj:${object.role}:${object.type}:${object.id}:${object.state ?? "-"}:${object.revision}`,
  );

  const relationships = basis.relationships.map(
    (relationship) =>
      `rel:${relationship.edgeType}:${relationship.relationshipId}:${relationship.linkType ?? "-"}`,
  );

  const monitoring = basis.monitoring.map(
    (record) =>
      `mon:${record.assumptionId}:${record.recordId ?? "none"}:${record.monitoringStatus}:${record.basisFingerprint ?? "-"}`,
  );

  const changes = basis.changes.map(
    (change) =>
      [
        "chg",
        change.changeRequestId,
        change.status,
        change.analysisId ?? "none",
        change.analysisFingerprint ?? "-",
        change.analysisFreshness,
        change.declaredSubjects.join("+") || "-",
        change.affectedSubjects.join("+") || "-",
      ].join(":"),
  );

  return digest([
    `version:${VERIFICATION_READINESS_VERSION}`,
    `activity:${basis.verificationActivityId}`,
    `scope:${basis.scope}`,
    ...objects,
    ...relationships,
    ...monitoring,
    ...changes,
  ]);
}

// --- Freshness --------------------------------------------------------------

/**
 * Whether a stored assessment still describes the current basis.
 *
 * Derived at read time by recomputing the basis and comparing fingerprints —
 * never stored as a mutable flag, because the assessment record itself must not
 * change after it is written.
 */
export const READINESS_FRESHNESS = ["CURRENT", "STALE", "UNKNOWN"] as const;
export type ReadinessFreshness = (typeof READINESS_FRESHNESS)[number];

export function readinessFreshnessOf(
  storedFingerprint: string,
  currentFingerprint: string,
  storedVersion: string,
): ReadinessFreshness {
  // An assessment produced by a different rule set is not comparable, and
  // saying "current" about it would be a claim under semantics it never ran on.
  if (storedVersion !== VERIFICATION_READINESS_VERSION) return "UNKNOWN";
  if (!storedFingerprint || !currentFingerprint) return "UNKNOWN";
  return storedFingerprint === currentFingerprint ? "CURRENT" : "STALE";
}

// --- Records ----------------------------------------------------------------

/** Counts, every one of them derived from the findings actually persisted. */
export interface VerificationReadinessSummary {
  findings: number;
  blocking: number;
  warning: number;
  informational: number;
  unknown: number;
}

/** One deterministic condition the engine evaluated. */
export interface VerificationReadinessFinding {
  id: string;
  assessmentId: string;
  ruleId: string;
  category: VerificationReadinessCategory;
  status: VerificationReadinessFindingStatus;
  severity: VerificationReadinessSeverity;
  /** The engineering object the condition concerns. */
  subjectType: GraphNodeType;
  subjectId: string;
  subjectIdentifier: string | null;
  subjectLabel: string;
  /** The explanation, naming the object and the state that produced it. */
  message: string;
  basis: VerificationReadinessBasisMarker[];
  /** Position in the deterministic ordering, written with the row. */
  sequence: number;
  createdAt: Date;
}

/** One immutable assessment. A re-evaluation creates a new one. */
export interface VerificationReadinessAssessment {
  id: string;
  projectId: string;
  verificationActivityId: string;
  status: VerificationReadinessStatus;
  scope: VerificationReadinessScope;
  readinessVersion: string;
  fingerprint: string;
  summary: VerificationReadinessSummary;
  evaluatedAt: Date;
  evaluatedById: string | null;
  createdAt: Date;
}

/** The full result, as the detail view and the API return it. */
export interface VerificationReadinessReport {
  assessment: VerificationReadinessAssessment;
  /** Derived at read time by recomputing the basis — never stored. */
  freshness: ReadinessFreshness;
  findings: VerificationReadinessFinding[];
  /** The engineering objects the evaluation actually read. */
  basis: VerificationReadinessBasis;
}

/**
 * What the API returns when nothing has been evaluated.
 *
 * A distinct shape rather than an empty report: zero findings would read as
 * "we checked and found nothing wrong", which is a far stronger claim than
 * "nobody has assessed this".
 */
export interface NoVerificationReadiness {
  status: "NOT_EVALUATED";
  verificationActivityId: string;
  readinessVersion: string;
}

export type LatestVerificationReadiness =
  | VerificationReadinessReport
  | NoVerificationReadiness;

export function hasVerificationReadiness(
  value: LatestVerificationReadiness,
): value is VerificationReadinessReport {
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
export function compareReadinessFindings(
  a: Pick<VerificationReadinessFinding, "status" | "ruleId" | "subjectType" | "subjectId">,
  b: Pick<VerificationReadinessFinding, "status" | "ruleId" | "subjectType" | "subjectId">,
): number {
  const byStatus =
    READINESS_FINDING_STATUS_PRECEDENCE[b.status] - READINESS_FINDING_STATUS_PRECEDENCE[a.status];
  if (byStatus !== 0) return byStatus;
  if (a.ruleId !== b.ruleId) return a.ruleId < b.ruleId ? -1 : 1;
  if (a.subjectType !== b.subjectType) return a.subjectType < b.subjectType ? -1 : 1;
  if (a.subjectId === b.subjectId) return 0;
  return a.subjectId < b.subjectId ? -1 : 1;
}

/** Stable order for basis objects, so two runs snapshot a basis identically. */
export function compareReadinessBasisObjects(
  a: ReadinessBasisObject,
  b: ReadinessBasisObject,
): number {
  const roleOrder = READINESS_BASIS_ROLES.indexOf(a.role) - READINESS_BASIS_ROLES.indexOf(b.role);
  if (roleOrder !== 0) return roleOrder;
  if (a.type !== b.type) return a.type < b.type ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/**
 * A stable signature of what an assessment concluded.
 *
 * Two evaluations are equivalent when their signatures match: same version,
 * same status, same rules fired against the same subjects. Ids and timestamps
 * are excluded on purpose — they differ between runs and say nothing about
 * whether the engine reached the same conclusion.
 */
export function readinessSignature(report: VerificationReadinessReport): string {
  const findings = [...report.findings]
    .sort(compareReadinessFindings)
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
    `scope=${report.assessment.scope}`,
    `status=${report.assessment.status}`,
    `findings=${findings.join(";")}`,
  ].join("\n");
}

// --- Request contracts ------------------------------------------------------

/**
 * Evaluation input.
 *
 * Deliberately empty and strict. There is nothing a client may supply: the
 * project and activity come from the route, the actor from the session, and
 * every rule outcome from recorded state. A client that tries to send a status,
 * a finding, or a rule override is rejected outright rather than having the
 * field quietly dropped.
 */
export const evaluateVerificationReadinessRequestSchema = z.strictObject({});

export type EvaluateVerificationReadinessRequest = z.infer<
  typeof evaluateVerificationReadinessRequestSchema
>;

export const verificationReadinessIdSchema = entityIdSchema;
