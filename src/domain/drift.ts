import { createHash } from "node:crypto";
import { z } from "zod";
import {
  GRAPH_NODE_TYPES,
  type GraphNodeType,
  graphNodeTypeSchema,
} from "./graph";
import {
  type ComparisonOperator,
  comparisonOperatorSchema,
  comparisonOperatorSymbol,
} from "./shared/enums";
import { artifactIdentifierSchema, entityIdSchema } from "./shared/identifier";

/**
 * Design / operations drift.
 *
 * One question, asked of one project against one baseline:
 *
 * > *Where does the operational state that has since been recorded no longer
 * > match the engineering basis that was approved?*
 *
 * Engineered systems drift without anyone changing the baseline. The actual
 * operating temperature stops matching the design assumption; a supplier's
 * process moves without an engineering change; the field configuration diverges
 * from the approved design. Nothing in the record is *wrong* — each individual
 * entry was made honestly — and yet the engineering basis and reality have come
 * apart. This engine makes that visible.
 *
 * **The chain it implements, and refuses to shortcut:**
 *
 *   Engineering basis → baselined state → operational observation → deterministic
 *   comparison → drift finding → *a person decides*
 *
 * The last arrow is the important one. Four things this deliberately is not:
 *
 *  - **Not a failure judgement.** Expected 100, observed 103 produces
 *    `VALUE_DEVIATION / REVIEW_REQUIRED`. It never produces "design failed".
 *    Whether a deviation matters is an engineering conclusion that depends on
 *    margin, tolerance and intent — none of which this system holds.
 *  - **Not anomaly detection.** There is no model, no training, no score, no
 *    confidence and no probability. Every finding is a comparison someone could
 *    perform by hand from the two values printed beside it.
 *  - **Not telemetry.** Observations are recorded by people in V1. There is no
 *    ingestion pipeline, no time series, no event bus, and none is implied.
 *  - **Not a baseline updater.** Detecting that an object changed since it was
 *    baselined must never rewrite the baseline. That divergence *is* the
 *    finding; erasing it would destroy the only evidence drift ever produces.
 *
 * Everything here is Prisma-free.
 */

/**
 * Which rule set produced an assessment.
 *
 * Assessments are only comparable within a version. Bump this whenever a rule
 * is added, removed, or its outcome changes, so an old assessment is never
 * silently read under new semantics — freshness across versions reports UNKNOWN
 * rather than guessing compatibility.
 */
export const DRIFT_VERSION = "1";

// --- Engineering baseline ---------------------------------------------------

/**
 * The lifecycle of an engineering baseline.
 *
 * `DRAFT` — being assembled. Membership can still change.
 * `ACTIVE` — the approved engineering basis. **Immutable**: membership is fixed,
 *   and the snapshot each member carries is what later comparison is against.
 * `SUPERSEDED` — replaced by a newer baseline. Still readable, still immutable;
 *   the history of what was baselined when is the point.
 *
 * There is deliberately no branch, merge, variant or effectivity model. This is
 * a reference point for comparison, not a configuration-management system.
 */
export const BASELINE_STATUSES = ["DRAFT", "ACTIVE", "SUPERSEDED"] as const;
export type BaselineStatus = (typeof BASELINE_STATUSES)[number];
export const baselineStatusSchema = z.enum(BASELINE_STATUSES);

/**
 * Permitted transitions.
 *
 * A DRAFT is activated; an ACTIVE is superseded. Nothing returns to DRAFT,
 * because a baseline that could be edited after activation would make every
 * drift finding computed against it meaningless. SUPERSEDED is terminal.
 */
export const BASELINE_TRANSITIONS: Readonly<Record<BaselineStatus, readonly BaselineStatus[]>> = {
  DRAFT: ["ACTIVE"],
  ACTIVE: ["SUPERSEDED"],
  SUPERSEDED: [],
};

export function canTransitionBaseline(from: BaselineStatus, to: BaselineStatus): boolean {
  return BASELINE_TRANSITIONS[from].includes(to);
}

/** Whether membership may still be added or removed. DRAFT only. */
export function isBaselineMembershipEditable(status: BaselineStatus): boolean {
  return status === "DRAFT";
}

/** Whether the baseline is a fixed engineering reference that drift can use. */
export function isBaselineImmutable(status: BaselineStatus): boolean {
  return status === "ACTIVE" || status === "SUPERSEDED";
}

/**
 * The node types a baseline may contain.
 *
 * A subset of the graph registry, not an arbitrary type/id pair: these are the
 * artifacts that constitute an engineering basis and whose divergence is
 * meaningful. A change request or an approval is an *event*, not part of the
 * basis, so neither is baselineable.
 */
export const BASELINE_MEMBER_TYPES = [
  "REQUIREMENT",
  "DESIGN_ITEM",
  "ENGINEERING_DECISION",
  "DECISION_EXPECTATION",
  "VERIFICATION_ACTIVITY",
  "SUPPLIED_ITEM",
  "SUPPLIER_QUALIFICATION",
] as const;
export type BaselineMemberType = (typeof BASELINE_MEMBER_TYPES)[number];
export const baselineMemberTypeSchema = z.enum(BASELINE_MEMBER_TYPES);

/** Every baseline member type must be a real graph node type. */
export function isBaselineMemberType(value: string): value is BaselineMemberType {
  return (BASELINE_MEMBER_TYPES as readonly string[]).includes(value);
}

export interface EngineeringBaseline {
  id: string;
  projectId: string;
  identifier: string;
  name: string;
  description: string | null;
  status: BaselineStatus;
  createdById: string | null;
  baselinedAt: Date | null;
  baselinedById: string | null;
  supersededAt: Date | null;
  /** The baseline that replaced this one, where one did. */
  supersededById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * One engineering object a baseline represents.
 *
 * **A reference plus a snapshot, never a copy.** The artifact tables remain the
 * source of truth; what is stored here is identity (`nodeType`, `nodeId`), the
 * display metadata needed to name the object in a historical report, and a
 * deterministic fingerprint of the engineering state as it stood at the moment
 * of baselining.
 *
 * That fingerprint is the whole mechanism. Comparing it against the object's
 * fingerprint today is how "this changed since we baselined it" becomes a fact
 * rather than an impression.
 */
export interface EngineeringBaselineMember {
  id: string;
  baselineId: string;
  nodeType: BaselineMemberType;
  nodeId: string;
  /** Human-facing key at baseline time. Null where the type has none. */
  identifierSnapshot: string | null;
  labelSnapshot: string;
  /** The lifecycle value the object carried at baseline time, where it has one. */
  stateSnapshot: string | null;
  /** Deterministic digest of the object's engineering state at baseline time. */
  fingerprint: string;
  /** The object's own `updatedAt` at baseline time. Never "now". */
  revisionSnapshot: Date;
  createdAt: Date;
}

// --- Operational observation ------------------------------------------------

/**
 * What kind of operational record this is.
 *
 * Broad on purpose. The engineering question — *does this match what we
 * approved?* — does not depend on distinguishing twelve flavours of inspection,
 * and a finer taxonomy would be a reporting schema rather than a drift input.
 */
export const OBSERVATION_TYPES = [
  "MEASUREMENT",
  "INSPECTION",
  "FIELD_REPORT",
  "MAINTENANCE",
  "OPERATIONS_EVENT",
  "PERFORMANCE_RESULT",
  "CONFIGURATION_OBSERVATION",
  "OTHER",
] as const;
export type ObservationType = (typeof OBSERVATION_TYPES)[number];
export const observationTypeSchema = z.enum(OBSERVATION_TYPES);

/**
 * How much engineering weight an observation carries.
 *
 * `RECORDED` — somebody wrote down what they saw. That is all it means. It is
 *   deliberately *not* treated as established engineering evidence: field
 *   reports are frequently wrong, mis-transcribed, or about a different unit.
 * `REVIEWED` — an engineer has looked at it and accepts it as a record of what
 *   happened. From here the substance is locked.
 * `REJECTED` — an engineer has looked at it and does not accept it. Kept, not
 *   deleted: that someone reported this, and that it was rejected, is itself
 *   part of the operational history.
 */
export const OBSERVATION_STATUSES = ["RECORDED", "REVIEWED", "REJECTED"] as const;
export type ObservationStatus = (typeof OBSERVATION_STATUSES)[number];
export const observationStatusSchema = z.enum(OBSERVATION_STATUSES);

export const OBSERVATION_TRANSITIONS: Readonly<
  Record<ObservationStatus, readonly ObservationStatus[]>
> = {
  RECORDED: ["REVIEWED", "REJECTED"],
  // Terminal: a reviewed or rejected observation is a historical determination.
  // Changing one's mind means recording a new observation, so the record of
  // what was believed at the time survives.
  REVIEWED: [],
  REJECTED: [],
};

export function canTransitionObservation(
  from: ObservationStatus,
  to: ObservationStatus,
): boolean {
  return OBSERVATION_TRANSITIONS[from].includes(to);
}

/**
 * Whether the substance of an observation may still be edited.
 *
 * Open while RECORDED — correcting a typo before anyone has relied on it is
 * ordinary work, and forcing a new record for every fix would bury the real
 * history in noise. Closed once REVIEWED or REJECTED, because editing then would
 * rewrite evidence an engineer has already made a determination about.
 */
export function isObservationEditable(status: ObservationStatus): boolean {
  return status === "RECORDED";
}

/**
 * What an observation can be about.
 *
 * The three most direct drift anchors, each a typed foreign key rather than a
 * polymorphic pair. A design item covers configuration drift, an expectation
 * covers performance drift against a recorded engineering claim, and a supplied
 * item covers supply-side drift.
 *
 * `REQUIREMENT` is deliberately absent in V1: an observation about a requirement
 * is almost always really an observation about the design that implements it or
 * the verification that demonstrates it, and adding a fourth column to support a
 * case with no deterministic comparison rule behind it would be schema for its
 * own sake.
 */
export const OBSERVATION_SUBJECT_TYPES = [
  "DESIGN_ITEM",
  "DECISION_EXPECTATION",
  "SUPPLIED_ITEM",
] as const;
export type ObservationSubjectType = (typeof OBSERVATION_SUBJECT_TYPES)[number];
export const observationSubjectTypeSchema = z.enum(OBSERVATION_SUBJECT_TYPES);

export const observationSubjectSchema = z.strictObject({
  type: observationSubjectTypeSchema,
  id: entityIdSchema,
});

export type ObservationSubject = z.infer<typeof observationSubjectSchema>;

/**
 * Something actually observed.
 *
 * The value structure is bounded on purpose: a subject, a numeric value with a
 * unit, or a text value. That is enough to compare against an expectation and
 * to record a configuration observation, and it stops short of being a
 * measurement schema language.
 *
 * Note what is **not** here: no expected value. The expectation lives on the
 * engineering side, in `DecisionExpectation`. Copying it onto the observation
 * would create two versions of the same claim that could disagree, and the
 * disagreement would be invisible.
 */
export interface OperationalObservation {
  id: string;
  projectId: string;
  identifier: string;
  title: string;
  description: string;
  observationType: ObservationType;
  status: ObservationStatus;
  /** Where the report came from — a person, a station, a report number. */
  source: string | null;
  observedAt: Date;
  /** What was measured or looked at, in the recorder's words. */
  subjectLabel: string | null;
  /**
   * The measured value, as an exact decimal string.
   *
   * Kept as a string end to end, and compared by exact decimal arithmetic
   * rather than by parsing to a float. `0.1 + 0.2` problems have no place in a
   * system whose entire purpose is saying whether two numbers differ.
   */
  numericValue: string | null;
  unit: string | null;
  /** For observations that are not numeric at all. */
  textValue: string | null;
  subject: ObservationSubject | null;
  createdById: string | null;
  reviewedAt: Date | null;
  reviewedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// --- Exact decimal comparison -----------------------------------------------

/**
 * A decimal parsed into an exact scaled integer.
 *
 * `1.25` becomes `{ mantissa: 125n, scale: 2 }`. Comparison rescales both sides
 * to a common scale and compares BigInts, so it is exact for every value a
 * person can type — no binary floating point is involved at any point.
 */
interface ExactDecimal {
  mantissa: bigint;
  scale: number;
}

const DECIMAL_PATTERN = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/** Parses an exact decimal, or null when the text is not one. */
export function parseExactDecimal(value: string | null | undefined): ExactDecimal | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "" || !DECIMAL_PATTERN.test(trimmed)) return null;

  const negative = trimmed.startsWith("-");
  const unsigned = trimmed.replace(/^[+-]/, "");
  const [whole = "", fraction = ""] = unsigned.split(".");

  const digits = `${whole}${fraction}` || "0";
  const mantissa = BigInt(digits) * (negative ? -1n : 1n);

  return { mantissa, scale: fraction.length };
}

/** -1, 0 or 1. Exact: both sides are rescaled to a common scale first. */
export function compareExactDecimals(left: ExactDecimal, right: ExactDecimal): number {
  const scale = Math.max(left.scale, right.scale);
  const lifted = (value: ExactDecimal): bigint =>
    value.mantissa * 10n ** BigInt(scale - value.scale);

  const a = lifted(left);
  const b = lifted(right);
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Whether two units may be compared.
 *
 * **No conversion, ever.** 800 °C and 1472 °F are the same temperature, and a
 * system that quietly converted them would eventually convert something it had
 * no business converting — or get the direction wrong on a scale with an offset.
 * Different units produce UNKNOWN, which is a true statement about what this
 * system knows.
 *
 * Both sides unitless is compatible: a dimensionless expectation compared with a
 * dimensionless observation is a real comparison. One side having a unit and the
 * other not is *not* compatible, because it means somebody recorded incomplete
 * information and the comparison would be assuming what they meant.
 */
export function unitsAreComparable(
  expected: string | null | undefined,
  observed: string | null | undefined,
): boolean {
  const normalize = (unit: string | null | undefined): string | null => {
    const trimmed = (unit ?? "").trim();
    return trimmed === "" ? null : trimmed.toLowerCase();
  };

  const a = normalize(expected);
  const b = normalize(observed);
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a === b;
}

/** What a deterministic comparison concluded. */
export const COMPARISON_OUTCOMES = ["SATISFIED", "VIOLATED", "NOT_COMPARABLE"] as const;
export type ComparisonOutcome = (typeof COMPARISON_OUTCOMES)[number];

export interface ComparisonResult {
  outcome: ComparisonOutcome;
  /** Why it could not be compared, when that is the outcome. */
  reason: string | null;
}

/**
 * **The single place a value comparison is decided.**
 *
 * Returns NOT_COMPARABLE — never a guess — whenever the operator is missing,
 * either value is absent or non-numeric, or the units do not match. Each of
 * those is a real gap in the record, and reporting it honestly is the entire
 * reason this engine can be trusted with the cases it *does* decide.
 */
export function compareObservedValue(input: {
  operator: ComparisonOperator | null | undefined;
  expectedValue: string | null | undefined;
  expectedUnit: string | null | undefined;
  observedValue: string | null | undefined;
  observedUnit: string | null | undefined;
}): ComparisonResult {
  if (!input.operator) {
    return {
      outcome: "NOT_COMPARABLE",
      reason: "The expectation records no explicit comparison operator.",
    };
  }

  const expected = parseExactDecimal(input.expectedValue);
  if (!expected) {
    return {
      outcome: "NOT_COMPARABLE",
      reason: "The expected value is absent or not a number.",
    };
  }

  const observed = parseExactDecimal(input.observedValue);
  if (!observed) {
    return {
      outcome: "NOT_COMPARABLE",
      reason: "The observed value is absent or not a number.",
    };
  }

  if (!unitsAreComparable(input.expectedUnit, input.observedUnit)) {
    return {
      outcome: "NOT_COMPARABLE",
      reason: `Units do not match (expected ${input.expectedUnit ?? "none"}, observed ${input.observedUnit ?? "none"}). No conversion is performed.`,
    };
  }

  const sign = compareExactDecimals(observed, expected);

  const satisfied = ((): boolean => {
    switch (input.operator) {
      case "EQUAL":
        return sign === 0;
      case "NOT_EQUAL":
        return sign !== 0;
      case "LESS_THAN":
        return sign < 0;
      case "LESS_THAN_OR_EQUAL":
        return sign <= 0;
      case "GREATER_THAN":
        return sign > 0;
      case "GREATER_THAN_OR_EQUAL":
        return sign >= 0;
    }
  })();

  return { outcome: satisfied ? "SATISFIED" : "VIOLATED", reason: null };
}

/** "≤ 800 °C", for a finding message. */
export function describeExpectation(
  operator: ComparisonOperator | null | undefined,
  value: string | null | undefined,
  unit: string | null | undefined,
): string {
  const symbol = operator ? comparisonOperatorSymbol(operator) : "?";
  return `${symbol} ${value ?? "—"}${unit ? ` ${unit}` : ""}`.trim();
}

// --- Drift findings ---------------------------------------------------------

/**
 * What kind of divergence a finding represents.
 *
 * Each corresponds to a deterministic comparison, not to a severity or a
 * judgement about consequence.
 */
export const DRIFT_CATEGORIES = [
  "VALUE_DEVIATION",
  "CONFIGURATION_MISMATCH",
  "EXPECTATION_BREACH",
  "BASELINE_CHANGED",
  "SUPPLIER_STATE_CHANGE",
  "UNKNOWN",
] as const;
export type DriftCategory = (typeof DRIFT_CATEGORIES)[number];

/**
 * What the finding asks of a person.
 *
 * `REVIEW_REQUIRED` — a real divergence was computed and an engineer has to
 *   decide what it means. **This is not a failure.** It is the system saying
 *   "these two records disagree; you know things I do not".
 * `INFORMATIONAL` — a comparison was performed and nothing diverged, or context
 *   worth recording so a NO_DRIFT verdict is explainable rather than empty.
 * `UNKNOWN` — the comparison could not be performed. Missing operator, absent
 *   value, mismatched units, unresolvable object. Never silently a pass.
 *
 * There is deliberately no FAILED, BREACHED or DEFECT: producing one would be
 * this engine claiming an engineering conclusion it has no basis for.
 */
export const DRIFT_FINDING_STATUSES = ["REVIEW_REQUIRED", "INFORMATIONAL", "UNKNOWN"] as const;
export type DriftFindingStatus = (typeof DRIFT_FINDING_STATUSES)[number];

/**
 * The severity label carried on a persisted finding.
 *
 * Derived one-to-one from the finding status by the mapping below, never judged.
 * It is report wording, not a second axis and emphatically not a risk rating —
 * inventing one would be exactly the "anomaly score" this capability refuses to
 * produce.
 */
export const DRIFT_SEVERITIES = ["ATTENTION", "NOTE", "INDETERMINATE"] as const;
export type DriftSeverity = (typeof DRIFT_SEVERITIES)[number];

const SEVERITY_FOR_STATUS: Readonly<Record<DriftFindingStatus, DriftSeverity>> = {
  REVIEW_REQUIRED: "ATTENTION",
  INFORMATIONAL: "NOTE",
  UNKNOWN: "INDETERMINATE",
};

export function severityForDriftStatus(status: DriftFindingStatus): DriftSeverity {
  return SEVERITY_FOR_STATUS[status];
}

/**
 * Deterministic markers naming what a finding was read from.
 *
 * The `*_NOT_EVALUATED` markers carry the negative space: they say what the
 * engine deliberately did not conclude, which for this capability matters more
 * than what it did.
 */
export const DRIFT_BASIS_MARKERS = [
  "BASELINE_MEMBER_SNAPSHOT",
  "BASELINE_MEMBER_FINGERPRINT",
  "BASELINE_MEMBER_UNRESOLVABLE",
  "CURRENT_OBJECT_STATE",
  "OBSERVATION_RECORD",
  "OBSERVATION_NOT_REVIEWED",
  "OBSERVATION_VALUE",
  "EXPECTATION_RECORD",
  "EXPECTATION_OPERATOR_ABSENT",
  "EXPECTATION_STATUS_NOT_CHANGED",
  "UNIT_MISMATCH",
  "VALUE_NOT_NUMERIC",
  "SUPPLIER_QUALIFICATION_STATE",
  "SUPPLIED_ITEM_STATE",
  "CHANGE_IMPACT_CONTEXT",
  "ASSUMPTION_CONTEXT",
  "ASSUMPTION_VALIDITY_NOT_EVALUATED",
  "VERIFICATION_CONTEXT",
  "ENGINEERING_JUDGEMENT_REQUIRED",
] as const;
export type DriftBasisMarker = (typeof DRIFT_BASIS_MARKERS)[number];

/** Deduplicated and sorted, so identical findings carry identical basis lists. */
export function normalizeDriftBasis(markers: readonly DriftBasisMarker[]): DriftBasisMarker[] {
  return [...new Set(markers)].sort();
}

// --- The rule registry ------------------------------------------------------

/**
 * One deterministic drift rule.
 *
 * A rule is a *comparison* over recorded state with exactly one outcome. No rule
 * concludes that anything failed; the strongest thing any of them says is that
 * an engineer needs to look.
 */
export interface DriftRule {
  /** Stable identifier, quoted in findings and in the interface. */
  id: string;
  category: DriftCategory;
  status: DriftFindingStatus;
  /** What kind of object a finding from this rule concerns. */
  subjectType: GraphNodeType | "PROJECT";
  /** What the rule is for, in one line. */
  description: string;
  /** The comparison, stated so it can be checked against the implementation. */
  condition: string;
  /** Which records the rule reads. Every finding it emits cites these. */
  basis: readonly DriftBasisMarker[];
  /** Why the outcome is what it is — and, where it matters, what it is not. */
  rationale: string;
}

/**
 * **The single authoritative drift rule registry.**
 *
 * Nothing outside this table produces a finding. The service resolves the
 * baseline and the observations and applies these rules; it holds no comparison
 * policy of its own, and `emitFinding` refuses a rule id the registry does not
 * define.
 *
 * Read the `status` column of this table as the answer to "what is the most this
 * system will ever say?". The answer is REVIEW_REQUIRED. There is no rule, and
 * there will not be one, whose outcome is that something failed.
 */
export const DRIFT_RULES: readonly DriftRule[] = [
  // --- Scope --------------------------------------------------------------
  {
    id: "DR-SCP-001",
    category: "UNKNOWN",
    status: "INFORMATIONAL",
    subjectType: "PROJECT",
    description: "Records what was actually compared.",
    condition: "Always emitted, with the counts the evaluation resolved.",
    basis: ["BASELINE_MEMBER_SNAPSHOT", "OBSERVATION_RECORD"],
    rationale:
      "A NO_DRIFT verdict whose scope a reader cannot see is not auditable. The counts are the objects genuinely compared, never an estimate of what the project ought to contain.",
  },

  // --- Baseline integrity -------------------------------------------------
  {
    id: "DR-BAS-001",
    category: "UNKNOWN",
    status: "UNKNOWN",
    subjectType: "PROJECT",
    description: "A baselined object can no longer be resolved in the project.",
    condition:
      "A baseline member's node does not resolve through the graph node registry inside this project.",
    basis: ["BASELINE_MEMBER_SNAPSHOT", "BASELINE_MEMBER_UNRESOLVABLE"],
    rationale:
      "Something that was part of the approved basis is not there now. It may have been deleted, or it may be a scoping error; the engine cannot tell which, so it reports that it could not compare rather than concluding the object was removed.",
  },
  {
    id: "DR-BAS-002",
    category: "BASELINE_CHANGED",
    status: "REVIEW_REQUIRED",
    subjectType: "PROJECT",
    description: "A baselined object's engineering state has changed since it was baselined.",
    condition:
      "A baseline member's current engineering fingerprint differs from the fingerprint stored at baseline time.",
    basis: [
      "BASELINE_MEMBER_FINGERPRINT",
      "CURRENT_OBJECT_STATE",
      "ENGINEERING_JUDGEMENT_REQUIRED",
    ],
    rationale:
      "This is the central configuration-drift comparison: the approved basis and the live object have come apart. Note precisely what it does not say — not that the change was wrong, not that it was unauthorised, and not that the baseline should be updated. A change may be entirely correct and still need to be seen against the basis it diverged from.",
  },
  {
    id: "DR-BAS-003",
    category: "BASELINE_CHANGED",
    status: "INFORMATIONAL",
    subjectType: "PROJECT",
    description: "A baselined object still matches the state it was baselined in.",
    condition: "A baseline member's current fingerprint equals the stored fingerprint.",
    basis: ["BASELINE_MEMBER_FINGERPRINT", "CURRENT_OBJECT_STATE"],
    rationale:
      "Recorded so a NO_DRIFT verdict names what it rests on. An engineer reading 'no drift' should be able to see which objects were actually checked.",
  },

  // --- Expectations -------------------------------------------------------
  {
    id: "DR-EXP-001",
    category: "EXPECTATION_BREACH",
    status: "REVIEW_REQUIRED",
    subjectType: "DECISION_EXPECTATION",
    description: "An observation does not satisfy the expectation's explicit comparison.",
    condition:
      "A reviewed observation of an expectation carries a numeric value in matching units, the expectation declares an explicit operator and numeric expected value, and the comparison evaluates false.",
    basis: [
      "EXPECTATION_RECORD",
      "OBSERVATION_VALUE",
      "ENGINEERING_JUDGEMENT_REQUIRED",
      "EXPECTATION_STATUS_NOT_CHANGED",
    ],
    rationale:
      "The recorded expectation and the recorded observation disagree, by an arithmetic comparison anyone can repeat from the two values printed beside it. What the engine will not do is set the expectation to BREACHED: whether a measurement outside a stated bound means the decision was wrong depends on margin, on measurement conditions and on intent, and the expectation's status stays where the engineer left it.",
  },
  {
    id: "DR-EXP-002",
    category: "EXPECTATION_BREACH",
    status: "INFORMATIONAL",
    subjectType: "DECISION_EXPECTATION",
    description: "An observation satisfies the expectation's explicit comparison.",
    condition: "As DR-EXP-001, but the comparison evaluates true.",
    basis: ["EXPECTATION_RECORD", "OBSERVATION_VALUE", "EXPECTATION_STATUS_NOT_CHANGED"],
    rationale:
      "A satisfied comparison is worth recording — it is the evidence behind a NO_DRIFT verdict. It is equally not a conclusion: one observation inside a bound does not make the expectation HELD, and the engine does not set that either.",
  },
  {
    id: "DR-EXP-003",
    category: "UNKNOWN",
    status: "UNKNOWN",
    subjectType: "DECISION_EXPECTATION",
    description: "An observation of an expectation could not be compared.",
    condition:
      "A reviewed observation of an expectation exists, but the operator is absent, either value is non-numeric, or the units do not match.",
    basis: [
      "EXPECTATION_RECORD",
      "OBSERVATION_VALUE",
      "EXPECTATION_OPERATOR_ABSENT",
      "UNIT_MISMATCH",
      "VALUE_NOT_NUMERIC",
    ],
    rationale:
      "The one outcome this engine must never get wrong. Comparing 800 °C against 1472 °F, or reading an operator out of the prose in an expected-value field, would produce a confident answer from information the record does not contain. Reporting the gap is the honest result, and it names which gap.",
  },

  // --- Configuration observations -----------------------------------------
  {
    id: "DR-CFG-001",
    category: "CONFIGURATION_MISMATCH",
    status: "REVIEW_REQUIRED",
    subjectType: "DESIGN_ITEM",
    description: "A configuration observation concerns a design item that has since changed.",
    condition:
      "A reviewed CONFIGURATION_OBSERVATION names a design item that is a baseline member whose current fingerprint differs from the baselined one.",
    basis: [
      "OBSERVATION_RECORD",
      "BASELINE_MEMBER_FINGERPRINT",
      "CURRENT_OBJECT_STATE",
      "ENGINEERING_JUDGEMENT_REQUIRED",
    ],
    rationale:
      "Somebody looked at the field configuration of an element that is no longer what was approved. Whether the observation describes the baselined state, the current state, or a third thing is exactly what an engineer needs to establish — and exactly what the engine cannot.",
  },
  {
    id: "DR-CFG-002",
    category: "CONFIGURATION_MISMATCH",
    status: "UNKNOWN",
    subjectType: "DESIGN_ITEM",
    description: "A configuration observation concerns a design item outside the baseline.",
    condition:
      "A reviewed CONFIGURATION_OBSERVATION names a design item that is not a member of the evaluated baseline.",
    basis: ["OBSERVATION_RECORD", "BASELINE_MEMBER_SNAPSHOT"],
    rationale:
      "There is nothing approved to compare the observation against. That is a gap in the baseline's coverage, not evidence about the design, and it is reported as such rather than being silently dropped.",
  },

  // --- Value deviation ----------------------------------------------------
  {
    id: "DR-VAL-001",
    category: "VALUE_DEVIATION",
    status: "REVIEW_REQUIRED",
    subjectType: "SUPPLIED_ITEM",
    description: "A measurement of a supplied item differs from the expectation it was taken for.",
    condition:
      "A reviewed MEASUREMENT or PERFORMANCE_RESULT names a supplied item, and a baselined expectation covering that item evaluates false against it.",
    basis: [
      "OBSERVATION_VALUE",
      "EXPECTATION_RECORD",
      "SUPPLIED_ITEM_STATE",
      "ENGINEERING_JUDGEMENT_REQUIRED",
    ],
    rationale:
      "A deviation is a difference between two numbers, and this rule says exactly that much. Expected 100, observed 103 is a VALUE_DEVIATION requiring review — it is not a failure, and the amount of the difference is reported rather than scored.",
  },

  // --- Supplier state -----------------------------------------------------
  {
    id: "DR-SUP-001",
    category: "SUPPLIER_STATE_CHANGE",
    status: "REVIEW_REQUIRED",
    subjectType: "SUPPLIER_QUALIFICATION",
    description: "A baselined supplier qualification is no longer in the state it was baselined in.",
    condition:
      "A baseline member of type SUPPLIER_QUALIFICATION has a current status differing from the status snapshotted at baseline time.",
    basis: [
      "SUPPLIER_QUALIFICATION_STATE",
      "BASELINE_MEMBER_SNAPSHOT",
      "ENGINEERING_JUDGEMENT_REQUIRED",
    ],
    rationale:
      "The basis on which a supplied item was accepted has moved since it was approved. This is emphatically not a finding that the item is unqualified: a qualification recorded as EXPIRED may have been renewed under a new record, and a WITHDRAWN one may have been replaced. The engine reports the state change and names both statuses.",
  },
  {
    id: "DR-SUP-002",
    category: "SUPPLIER_STATE_CHANGE",
    status: "REVIEW_REQUIRED",
    subjectType: "SUPPLIED_ITEM",
    description: "A baselined supplied item is no longer in the state it was baselined in.",
    condition:
      "A baseline member of type SUPPLIED_ITEM has a current status differing from the status snapshotted at baseline time.",
    basis: ["SUPPLIED_ITEM_STATE", "BASELINE_MEMBER_SNAPSHOT", "ENGINEERING_JUDGEMENT_REQUIRED"],
    rationale:
      "Something the approved configuration depends on has been marked obsolete or put under review since. Worth an engineer's attention; not a conclusion that the product is affected.",
  },

  // --- Observation hygiene ------------------------------------------------
  {
    id: "DR-OBS-001",
    category: "UNKNOWN",
    status: "UNKNOWN",
    subjectType: "PROJECT",
    description: "Observations exist that nobody has reviewed.",
    condition: "One or more observations in the project are still RECORDED.",
    basis: ["OBSERVATION_RECORD", "OBSERVATION_NOT_REVIEWED"],
    rationale:
      "An unreviewed observation is somebody's report, not established engineering evidence, so no comparison is performed against it. Reporting that they exist keeps a NO_DRIFT verdict honest: the engine has not looked at everything that was written down, and says so rather than letting silence imply it did.",
  },

  // --- Context ------------------------------------------------------------
  {
    id: "DR-CTX-001",
    category: "UNKNOWN",
    status: "INFORMATIONAL",
    subjectType: "PROJECT",
    description: "Records change-impact context for objects that drifted.",
    condition:
      "A drifted baseline object is the target of a declared impact on an in-flight change request.",
    basis: ["CHANGE_IMPACT_CONTEXT", "CURRENT_OBJECT_STATE"],
    rationale:
      "An object that changed since baselining may have changed through an open change request, which is the well-governed case. Surfacing that context saves an engineer a search. Nothing here runs an impact analysis or reads its findings — the change engine remains the change engine.",
  },
  {
    id: "DR-CTX-002",
    category: "UNKNOWN",
    status: "INFORMATIONAL",
    subjectType: "DECISION_ASSUMPTION",
    description: "Records assumptions whose decision an observation concerns.",
    condition:
      "A reviewed observation concerns an expectation whose decision also records assumptions.",
    basis: ["ASSUMPTION_CONTEXT", "ASSUMPTION_VALIDITY_NOT_EVALUATED"],
    rationale:
      "The observation may bear on what the decision assumed, and an engineer re-reading the decision will want the assumptions in front of them. This engine does not judge them and never sets an assumption's status — assumption monitoring owns that question, and this marker says so explicitly.",
  },
  {
    id: "DR-CTX-003",
    category: "UNKNOWN",
    status: "INFORMATIONAL",
    subjectType: "VERIFICATION_ACTIVITY",
    description: "Records verification already planned against a drifted object.",
    condition:
      "A drifted baseline object is a verification activity, or is a requirement linked to one.",
    basis: ["VERIFICATION_CONTEXT", "CURRENT_OBJECT_STATE"],
    rationale:
      "Drift often means something needs re-verifying, and the activity that would do it may already exist. Surfacing it is useful; creating one automatically would be this engine deciding a verification plan, which is not its job.",
  },
] as const;

/** Rule lookup by id. Built once; the registry is immutable. */
const RULES_BY_ID: ReadonlyMap<string, DriftRule> = new Map(
  DRIFT_RULES.map((rule) => [rule.id, rule]),
);

export function driftRule(ruleId: string): DriftRule | null {
  return RULES_BY_ID.get(ruleId) ?? null;
}

/** Every rule id the registry defines, sorted. Used by the registry tests. */
export function driftRuleIds(): string[] {
  return DRIFT_RULES.map((rule) => rule.id).sort();
}

// --- Status precedence ------------------------------------------------------

/**
 * Ordering of finding statuses, strongest first.
 *
 * Review-required outranks unknown because a computed divergence is a firmer
 * statement than a comparison that could not be made. Unknown outranks
 * informational so "we could not tell" is never buried under satisfied checks.
 */
export const DRIFT_FINDING_PRECEDENCE: Readonly<Record<DriftFindingStatus, number>> = {
  REVIEW_REQUIRED: 3,
  UNKNOWN: 2,
  INFORMATIONAL: 1,
};

/** The overall verdict of an assessment. */
export const DRIFT_STATUSES = ["NO_DRIFT", "DRIFT_DETECTED", "UNKNOWN"] as const;
export type DriftStatus = (typeof DRIFT_STATUSES)[number];

/**
 * **The single place a drift verdict is decided.**
 *
 * `REVIEW_REQUIRED > UNKNOWN > NO_DRIFT`. An assessment with no findings at all
 * is UNKNOWN rather than NO_DRIFT: every evaluation emits at least the scope
 * rule, so an empty result means the evaluation did not actually happen — and
 * silence must never read as "nothing has drifted".
 */
export function driftStatusFor(
  findings: readonly { status: DriftFindingStatus }[],
): DriftStatus {
  if (findings.length === 0) return "UNKNOWN";
  if (findings.some((finding) => finding.status === "REVIEW_REQUIRED")) return "DRIFT_DETECTED";
  if (findings.some((finding) => finding.status === "UNKNOWN")) return "UNKNOWN";
  return "NO_DRIFT";
}

// --- Records ----------------------------------------------------------------

export interface DriftSummary {
  findings: number;
  reviewRequired: number;
  informational: number;
  unknown: number;
}

/**
 * One object a finding concerns, as stored on the row.
 *
 * Identity plus display metadata, never a copy of the artifact. Snapshotted so a
 * historical assessment can still name real records even after they change.
 */
export interface DriftSubject {
  type: string;
  id: string;
  identifier: string | null;
  label: string;
}

export interface DriftFinding {
  id: string;
  assessmentId: string;
  ruleId: string;
  category: DriftCategory;
  status: DriftFindingStatus;
  severity: DriftSeverity;
  /** What the approved basis said. Null where the finding is not about a baseline member. */
  baselineSubject: DriftSubject | null;
  /** What was observed. Null where the finding is not about an observation. */
  observationSubject: DriftSubject | null;
  expectedValue: string | null;
  observedValue: string | null;
  /** The explanation, naming both sides and the comparison performed. */
  explanation: string;
  basis: DriftBasisMarker[];
  /** Position in the deterministic ordering, written with the row. */
  sequence: number;
  createdAt: Date;
}

/** One immutable drift assessment. A re-evaluation creates a new one. */
export interface DriftAssessment {
  id: string;
  projectId: string;
  baselineId: string;
  status: DriftStatus;
  driftVersion: string;
  fingerprint: string;
  summary: DriftSummary;
  evaluatedAt: Date;
  evaluatedById: string | null;
  createdAt: Date;
}

/**
 * Whether a stored assessment still describes the current state.
 *
 * Derived at read time by recomputing the drift basis and comparing digests —
 * never stored as a mutable flag, because the assessment record must not change
 * after it is written.
 */
export const DRIFT_FRESHNESS = ["CURRENT", "STALE", "UNKNOWN"] as const;
export type DriftFreshness = (typeof DRIFT_FRESHNESS)[number];

export function driftFreshnessOf(
  storedFingerprint: string,
  currentFingerprint: string,
  storedVersion: string,
): DriftFreshness {
  // An assessment produced by a different rule set is not comparable, and
  // claiming either way about it would be a statement under semantics it never
  // ran on.
  if (storedVersion !== DRIFT_VERSION) return "UNKNOWN";
  if (!storedFingerprint || !currentFingerprint) return "UNKNOWN";
  return storedFingerprint === currentFingerprint ? "CURRENT" : "STALE";
}

export interface DriftReport {
  assessment: DriftAssessment;
  /** Derived at read time — never stored. */
  freshness: DriftFreshness;
  findings: DriftFinding[];
  /** What the evaluation compared. */
  basis: DriftEvaluationBasis;
}

/**
 * What a drift evaluation was performed against.
 *
 * Compact by construction: identity and the state each rule read. No artifact is
 * copied here.
 */
export interface DriftEvaluationBasis {
  baselineId: string;
  baselineIdentifier: string;
  baselineName: string;
  baselineStatus: BaselineStatus;
  /** Members compared, with the baselined and current fingerprints. */
  members: Array<{
    memberId: string;
    nodeType: BaselineMemberType;
    nodeId: string;
    identifier: string | null;
    baselinedFingerprint: string;
    /** Null when the object no longer resolves in the project. */
    currentFingerprint: string | null;
  }>;
  /** Observations consumed, with the state that made them usable or not. */
  observations: Array<{
    observationId: string;
    identifier: string;
    status: ObservationStatus;
    subjectType: ObservationSubjectType | null;
    subjectId: string | null;
    /** The observation's own revision stamp. Never "now". */
    revision: string;
  }>;
}

/**
 * What the API returns when a project has never been evaluated for drift.
 *
 * A distinct shape rather than an empty report: zero findings would read as "we
 * compared everything and nothing has drifted", which is a far stronger claim
 * than "nobody has run this".
 */
export interface NoDriftAssessment {
  status: "NOT_EVALUATED";
  projectId: string;
  driftVersion: string;
}

export type LatestDrift = DriftReport | NoDriftAssessment;

export function hasDriftAssessment(value: LatestDrift): value is DriftReport {
  return "assessment" in value;
}

// --- Deterministic ordering -------------------------------------------------

/**
 * Total order over findings.
 *
 * Strongest status first, then rule id, then subject. Nothing falls back to
 * insertion order or database row order, so two evaluations over the same state
 * list their findings identically.
 */
export function compareDriftFindings(
  a: Pick<DriftFinding, "status" | "ruleId" | "baselineSubject" | "observationSubject">,
  b: Pick<DriftFinding, "status" | "ruleId" | "baselineSubject" | "observationSubject">,
): number {
  const byStatus = DRIFT_FINDING_PRECEDENCE[b.status] - DRIFT_FINDING_PRECEDENCE[a.status];
  if (byStatus !== 0) return byStatus;
  if (a.ruleId !== b.ruleId) return a.ruleId < b.ruleId ? -1 : 1;

  const key = (finding: typeof a): string =>
    `${finding.baselineSubject?.type ?? ""}:${finding.baselineSubject?.id ?? ""}:${finding.observationSubject?.type ?? ""}:${finding.observationSubject?.id ?? ""}`;

  const left = key(a);
  const right = key(b);
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

// --- Fingerprint ------------------------------------------------------------

function digest(parts: readonly string[]): string {
  return createHash("sha256").update([...parts].sort().join("\n")).digest("hex");
}

/**
 * A deterministic digest of exactly what a drift evaluation rested on.
 *
 * **Drift-specific, not a project-wide timestamp.** It contains the baseline and
 * its members with both the baselined and the current fingerprint of each, and
 * the observations consumed with their own revision stamps. An artifact that is
 * neither a baseline member nor an observation subject cannot move it, so
 * unrelated project activity does not stale a drift assessment.
 *
 * Time is never included, so two digests taken a moment apart from unchanged
 * state match — otherwise every assessment would be stale the instant it was
 * written.
 */
export function driftFingerprint(basis: DriftEvaluationBasis): string {
  const members = basis.members.map(
    (member) =>
      `mem:${member.memberId}:${member.nodeType}:${member.nodeId}:${member.baselinedFingerprint}:${member.currentFingerprint ?? "absent"}`,
  );

  const observations = basis.observations.map(
    (observation) =>
      `obs:${observation.observationId}:${observation.status}:${observation.subjectType ?? "-"}:${observation.subjectId ?? "-"}:${observation.revision}`,
  );

  return digest([
    `version:${DRIFT_VERSION}`,
    `baseline:${basis.baselineId}:${basis.baselineStatus}`,
    ...members,
    ...observations,
  ]);
}

/**
 * A deterministic digest of one engineering object's baselineable state.
 *
 * This is what a baseline member stores and what later comparison is against, so
 * it must contain the fields whose change constitutes drift — identity, the
 * lifecycle state, the substantive content — and nothing whose change does not.
 * The object's own `updatedAt` is deliberately **excluded**: an edit that saves
 * without changing anything substantive would otherwise register as drift, and a
 * false positive here costs an engineer a real investigation.
 */
export function objectFingerprint(fields: Readonly<Record<string, string | null>>): string {
  const parts = Object.entries(fields)
    .map(([key, value]) => `${key}=${value ?? "-"}`)
    .sort();
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

/**
 * A stable signature of what an assessment concluded.
 *
 * Two evaluations are equivalent when their signatures match. Ids and timestamps
 * are excluded on purpose — they differ between runs and say nothing about
 * whether the engine reached the same conclusion.
 */
export function driftSignature(report: DriftReport): string {
  const findings = [...report.findings]
    .sort(compareDriftFindings)
    .map((finding) =>
      [
        finding.ruleId,
        finding.category,
        finding.status,
        finding.baselineSubject?.id ?? "-",
        finding.observationSubject?.id ?? "-",
        finding.expectedValue ?? "-",
        finding.observedValue ?? "-",
        finding.basis.join("+"),
      ].join("|"),
    );

  return [
    `version=${report.assessment.driftVersion}`,
    `status=${report.assessment.status}`,
    `findings=${findings.join(";")}`,
  ].join("\n");
}

// --- Request contracts ------------------------------------------------------

export const createBaselineRequestSchema = z.strictObject({
  identifier: artifactIdentifierSchema,
  name: z.string().trim().min(1, "A baseline name is required").max(300),
  description: z.string().trim().max(10_000).nullish(),
});

export type CreateBaselineRequest = z.infer<typeof createBaselineRequestSchema>;

/**
 * Only the description and name may be edited, and only while DRAFT.
 *
 * There is no `status` field: activation and supersession are their own
 * operations so each audits as its own event and neither can happen by accident
 * in an ordinary PATCH.
 */
export const updateBaselineRequestSchema = z
  .strictObject({
    name: z.string().trim().min(1, "A baseline name is required").max(300).optional(),
    description: z.string().trim().max(10_000).nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateBaselineRequest = z.infer<typeof updateBaselineRequestSchema>;

/**
 * A member is named by node type and id, both validated against the registry and
 * the project. There is no free-form entity reference.
 */
export const addBaselineMemberRequestSchema = z.strictObject({
  nodeType: baselineMemberTypeSchema,
  nodeId: entityIdSchema,
});

export type AddBaselineMemberRequest = z.infer<typeof addBaselineMemberRequestSchema>;

/**
 * Activation takes an explicit acknowledgement of what happens to the current
 * active baseline.
 *
 * `supersedeActive` must be sent deliberately. Without it, activating while
 * another baseline is ACTIVE is refused rather than silently replacing it —
 * an engineering basis should never be swapped out as a side effect.
 */
export const activateBaselineRequestSchema = z.strictObject({
  supersedeActive: z.boolean().optional(),
});

export type ActivateBaselineRequest = z.infer<typeof activateBaselineRequestSchema>;

export const createObservationRequestSchema = z
  .strictObject({
    identifier: artifactIdentifierSchema,
    title: z.string().trim().min(1, "An observation title is required").max(300),
    description: z.string().trim().min(1, "Record what was observed").max(10_000),
    observationType: observationTypeSchema,
    source: z.string().trim().max(300).nullish(),
    observedAt: z.string().trim().refine((value) => !Number.isNaN(Date.parse(value)), "Not a valid date"),
    subject: observationSubjectSchema.nullish(),
    subjectLabel: z.string().trim().max(300).nullish(),
    /** Exact decimal text. Never a float — see {@link parseExactDecimal}. */
    numericValue: z
      .string()
      .trim()
      .max(64)
      .refine((value) => parseExactDecimal(value) !== null, "Not an exact decimal value")
      .nullish(),
    unit: z.string().trim().max(50).nullish(),
    textValue: z.string().trim().max(2000).nullish(),
  })
  .refine(
    (value) =>
      (value.numericValue !== undefined && value.numericValue !== null) ||
      (value.textValue !== undefined && value.textValue !== null) ||
      value.description.trim().length > 0,
    "An observation must record a value or a description",
  );

export type CreateObservationRequest = z.infer<typeof createObservationRequestSchema>;

/**
 * The identifier and the subject are absent.
 *
 * Re-pointing an observation at a different subject would change what it
 * asserts rather than correct it — a new observation is recorded instead, so the
 * original report survives.
 */
export const updateObservationRequestSchema = z
  .strictObject({
    title: z.string().trim().min(1, "An observation title is required").max(300).optional(),
    description: z.string().trim().min(1, "Record what was observed").max(10_000).optional(),
    observationType: observationTypeSchema.optional(),
    source: z.string().trim().max(300).nullish(),
    observedAt: z
      .string()
      .trim()
      .refine((value) => !Number.isNaN(Date.parse(value)), "Not a valid date")
      .optional(),
    subjectLabel: z.string().trim().max(300).nullish(),
    numericValue: z
      .string()
      .trim()
      .max(64)
      .refine((value) => parseExactDecimal(value) !== null, "Not an exact decimal value")
      .nullish(),
    unit: z.string().trim().max(50).nullish(),
    textValue: z.string().trim().max(2000).nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateObservationRequest = z.infer<typeof updateObservationRequestSchema>;

export const reviewObservationRequestSchema = z.strictObject({
  note: z.string().trim().max(2000).nullish(),
});

export type ReviewObservationRequest = z.infer<typeof reviewObservationRequestSchema>;

/**
 * Drift evaluation input.
 *
 * The baseline, and nothing else. `strictObject` means a client that tries to
 * send a verdict, a finding, a rule, an organization, a project or an actor is
 * rejected outright rather than having the field quietly dropped.
 */
export const evaluateDriftRequestSchema = z.strictObject({
  baselineId: entityIdSchema,
});

export type EvaluateDriftRequest = z.infer<typeof evaluateDriftRequestSchema>;

export const driftIdSchema = entityIdSchema;

// --- Display helpers --------------------------------------------------------

const BASELINE_STATUS_LABELS: Readonly<Record<BaselineStatus, string>> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  SUPERSEDED: "Superseded",
};

export function baselineStatusLabel(status: BaselineStatus): string {
  return BASELINE_STATUS_LABELS[status];
}

const OBSERVATION_STATUS_LABELS: Readonly<Record<ObservationStatus, string>> = {
  RECORDED: "Recorded",
  REVIEWED: "Reviewed",
  REJECTED: "Rejected",
};

export function observationStatusLabel(status: ObservationStatus): string {
  return OBSERVATION_STATUS_LABELS[status];
}

const DRIFT_STATUS_LABELS: Readonly<Record<DriftStatus, string>> = {
  NO_DRIFT: "No drift",
  DRIFT_DETECTED: "Drift detected",
  UNKNOWN: "Unknown",
};

export function driftStatusLabel(status: DriftStatus): string {
  return DRIFT_STATUS_LABELS[status];
}

export function driftCategoryLabel(category: DriftCategory): string {
  return category
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

/** Every baseline member type is a registered graph node type. */
export function baselineMemberTypesAreGraphNodes(): boolean {
  return BASELINE_MEMBER_TYPES.every((type) =>
    (GRAPH_NODE_TYPES as readonly string[]).includes(type),
  );
}

export { graphNodeTypeSchema, comparisonOperatorSchema };
export type { ComparisonOperator };
