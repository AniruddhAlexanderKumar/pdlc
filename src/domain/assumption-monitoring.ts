import { createHash } from "node:crypto";
import { z } from "zod";
import { type AssumptionStatus, assumptionStatusSchema } from "./decision-memory";
import { GRAPH_EDGE_TYPES, type GraphEdgeType, type GraphNodeType } from "./graph";
import { entityIdSchema } from "./shared/identifier";

/**
 * Assumption monitoring.
 *
 * An assumption is a standing engineering hypothesis: something that had to be
 * true for a decision to be sound. This module watches the *recorded basis* of
 * that hypothesis — the decision it belongs to, the evidence gathered for it,
 * the requirements and design it stands on — and reports when that basis moves.
 *
 * **The hard rule.** The engine may report that a basis changed. It may report
 * that a review is required. It may never report that an assumption is false.
 * Only an authenticated engineer, through an explicit review, changes an
 * assumption's status. A system that quietly downgraded a VALIDATED assumption
 * because a related record was edited would be manufacturing an engineering
 * judgement nobody made — and it would be trusted, which is worse.
 *
 * **Absence of evidence is not proof of falsity.** An assumption with nothing
 * supporting it is `UNKNOWN`, never `INVALIDATED`.
 *
 * Everything here is Prisma-free.
 */

/**
 * Which rule set produced a verdict. Monitoring results are only comparable
 * within a version, exactly as impact findings are.
 */
export const ASSUMPTION_MONITORING_VERSION = "1";

// --- Monitoring vocabulary --------------------------------------------------

/**
 * What monitoring says about an assumption — *never* whether it is true.
 *
 * `NOT_EVALUATED` — nobody has ever run monitoring on it. Distinct from
 *   `CURRENT`, which is a claim that the basis is unchanged.
 * `CURRENT` — the basis is as it was at the last baseline, whether that
 *   baseline came from an evaluation or from a review that acknowledged it.
 * `BASIS_CHANGED` — the basis moved, but the assumption carries no explicit
 *   judgement yet, so there is nothing standing on the old basis to re-confirm.
 *   Informational.
 * `REVIEW_REQUIRED` — the basis moved *and* someone had explicitly judged this
 *   assumption. That judgement was made against a basis that no longer holds,
 *   so a person needs to look at it.
 */
export const ASSUMPTION_MONITORING_STATUSES = [
  "NOT_EVALUATED",
  "CURRENT",
  "BASIS_CHANGED",
  "REVIEW_REQUIRED",
] as const;
export type AssumptionMonitoringStatus = (typeof ASSUMPTION_MONITORING_STATUSES)[number];

/**
 * What changed, when something did.
 *
 * `UNKNOWN` covers the two cases where no comparison is possible: a first
 * evaluation, which has nothing to compare against, and a basis that could not
 * be resolved. Those are honestly different from "nothing changed".
 */
export const ASSUMPTION_MONITORING_FINDINGS = [
  "NO_CHANGE",
  "EVIDENCE_CHANGED",
  "LINKED_OBJECT_CHANGED",
  "DECISION_BASIS_CHANGED",
  "UNKNOWN",
] as const;
export type AssumptionMonitoringFinding = (typeof ASSUMPTION_MONITORING_FINDINGS)[number];

export const ASSUMPTION_MONITORING_KINDS = ["EVALUATION", "REVIEW"] as const;
export type AssumptionMonitoringKind = (typeof ASSUMPTION_MONITORING_KINDS)[number];

/**
 * Precedence when several parts of the basis move at once.
 *
 * The decision outranks everything: it is what the assumption belongs to, and a
 * change there is the most direct disturbance of its basis. Evidence outranks
 * other linked objects because evidence is what the assumption was checked
 * against, where a linked requirement is context it merely stands on.
 *
 * Higher wins.
 */
const FINDING_PRECEDENCE: Readonly<Record<AssumptionMonitoringFinding, number>> = {
  DECISION_BASIS_CHANGED: 4,
  EVIDENCE_CHANGED: 3,
  LINKED_OBJECT_CHANGED: 2,
  UNKNOWN: 1,
  NO_CHANGE: 0,
};

/** The finding that wins when more than one applies. */
export function strongestFinding(
  findings: readonly AssumptionMonitoringFinding[],
): AssumptionMonitoringFinding {
  if (findings.length === 0) return "NO_CHANGE";

  return findings.reduce((best, candidate) =>
    FINDING_PRECEDENCE[candidate] > FINDING_PRECEDENCE[best] ? candidate : best,
  );
}

/** Whether a finding represents an actual detected movement in the basis. */
export function isBasisMovement(finding: AssumptionMonitoringFinding): boolean {
  return (
    finding === "DECISION_BASIS_CHANGED" ||
    finding === "EVIDENCE_CHANGED" ||
    finding === "LINKED_OBJECT_CHANGED"
  );
}

/**
 * Whether an assumption carries an explicit engineering judgement.
 *
 * `UNKNOWN` means nobody has decided. Everything else was asserted by a person,
 * and is therefore something a changed basis can undermine.
 */
export function hasExplicitJudgement(status: AssumptionStatus): boolean {
  return status !== "UNKNOWN";
}

/**
 * The monitoring status implied by a finding and the assumption's own status.
 *
 * Deliberately a pure function of two inputs, so the verdict can be reasoned
 * about and tested without a database. Note what it never returns: nothing here
 * can produce an assumption status, only a monitoring one.
 */
export function monitoringStatusFor(
  finding: AssumptionMonitoringFinding,
  assumptionStatus: AssumptionStatus,
  options: { hasBaseline: boolean; basisResolved: boolean },
): Exclude<AssumptionMonitoringStatus, "NOT_EVALUATED"> {
  // The basis could not be read at all. That is not a change, and it is not
  // reassurance either — somebody should look.
  if (!options.basisResolved) return "REVIEW_REQUIRED";

  // A first evaluation establishes the baseline. There was nothing to compare
  // against, so it reports no movement rather than inventing one.
  if (!options.hasBaseline) return "CURRENT";

  if (!isBasisMovement(finding)) return "CURRENT";

  // The basis moved. Whether that demands attention depends on whether anyone
  // had committed to a judgement that now rests on it.
  return hasExplicitJudgement(assumptionStatus) ? "REVIEW_REQUIRED" : "BASIS_CHANGED";
}

// --- Basis policy -----------------------------------------------------------

/**
 * One edge's role in an assumption's basis.
 *
 * `from` names which hop the edge is walked at: an assumption's basis starts at
 * its owning decision, so `DECISION` edges are the first hop and `REQUIREMENT`
 * edges the second. Nothing is walked beyond that.
 */
export interface AssumptionBasisRule {
  type: GraphEdgeType;
  /** Which node the edge is walked from. */
  from: "DECISION" | "REQUIREMENT";
  /** Which way it is walked, relative to the edge's canonical direction. */
  direction: "OUTBOUND" | "INBOUND";
  /** Which component of the basis this edge contributes to. */
  component: "DECISION" | "EVIDENCE" | "LINKED";
  /** Why a change here is a change to what the assumption stands on. */
  rationale: string;
}

/**
 * **The single authoritative basis policy.**
 *
 * One entry per edge that contributes to an assumption's basis, and nothing
 * outside this table decides what an assumption stands on. Every entry answers
 * the same question: *would a change to this object reasonably constitute a
 * change to the recorded basis on which this assumption stands?*
 *
 * Deliberately absent:
 *
 *  - `DECISION_HAS_ASSUMPTION` / `DECISION_HAS_ALTERNATIVE` /
 *    `DECISION_HAS_EXPECTATION` — a sibling assumption, a rejected alternative
 *    or an expected outcome are records *of* the decision, not things this
 *    assumption rests on. Including them would mean editing one assumption
 *    flagged every other assumption on the same decision, which is noise.
 *  - `CHANGE_IMPACTS_OBJECT` / `APPROVAL_RELATES_TO_OBJECT` — a change request
 *    naming an object, or an approval recorded against it, does not alter the
 *    engineering content the assumption stands on.
 *  - Anything reachable only from a design item or verification activity. The
 *    walk stops at two hops from the decision, so the basis stays
 *    assumption-specific and bounded rather than growing into the project.
 */
export const ASSUMPTION_BASIS_POLICY: readonly AssumptionBasisRule[] = [
  {
    type: "REQUIREMENT_LINKED_TO_DECISION",
    from: "DECISION",
    direction: "INBOUND",
    component: "LINKED",
    rationale:
      "The requirements the decision was taken to address. If what was required changes, the ground the assumption was made on changes.",
  },
  {
    type: "DECISION_AFFECTS_DESIGN",
    from: "DECISION",
    direction: "OUTBOUND",
    component: "LINKED",
    rationale:
      "The design the decision shaped. An assumption about a design choice stands on the design as recorded.",
  },
  {
    type: "DECISION_AFFECTS_RISK",
    from: "DECISION",
    direction: "OUTBOUND",
    component: "LINKED",
    rationale:
      "The risk the decision accepted or mitigated. A reassessed risk changes what the assumption was weighed against.",
  },
  {
    type: "DECISION_AFFECTS_ISSUE",
    from: "DECISION",
    direction: "OUTBOUND",
    component: "LINKED",
    rationale:
      "The issue the decision drove or resolved. Its movement is part of the recorded situation the assumption belongs to.",
  },
  {
    type: "DECISION_HAS_EVIDENCE",
    from: "DECISION",
    direction: "OUTBOUND",
    component: "EVIDENCE",
    rationale:
      "Evidence gathered for the decision. This is the closest thing the record has to support for the assumption, since evidence attaches to decisions rather than to assumptions directly.",
  },
  {
    type: "REQUIREMENT_ALLOCATED_TO_DESIGN",
    from: "REQUIREMENT",
    direction: "OUTBOUND",
    component: "LINKED",
    rationale:
      "Where a basis requirement is allocated. The assumption stands on that allocation as much as on the requirement text.",
  },
  {
    type: "REQUIREMENT_VERIFIED_BY",
    from: "REQUIREMENT",
    direction: "OUTBOUND",
    component: "LINKED",
    rationale:
      "How a basis requirement is shown to be met. A changed verification plan changes what is actually being demonstrated.",
  },
  {
    type: "REQUIREMENT_HAS_EVIDENCE",
    from: "REQUIREMENT",
    direction: "OUTBOUND",
    component: "EVIDENCE",
    rationale:
      "Evidence recorded against a basis requirement. Treated as evidence rather than as a linked object, because that is what it is.",
  },
] as const;

/** Edges walked at the first hop, out of the owning decision. */
export const DECISION_BASIS_EDGE_TYPES: readonly GraphEdgeType[] = ASSUMPTION_BASIS_POLICY.filter(
  (rule) => rule.from === "DECISION",
)
  .map((rule) => rule.type)
  .sort();

/** Edges walked at the second hop, out of a basis requirement. */
export const REQUIREMENT_BASIS_EDGE_TYPES: readonly GraphEdgeType[] =
  ASSUMPTION_BASIS_POLICY.filter((rule) => rule.from === "REQUIREMENT")
    .map((rule) => rule.type)
    .sort();

/** Which basis component an edge contributes to. */
export function basisComponentFor(edgeType: GraphEdgeType): "EVIDENCE" | "LINKED" | null {
  const rule = ASSUMPTION_BASIS_POLICY.find((candidate) => candidate.type === edgeType);
  if (!rule || rule.component === "DECISION") return null;
  return rule.component;
}

/** Edge types the policy deliberately excludes, for documentation and tests. */
export function excludedBasisEdgeTypes(): GraphEdgeType[] {
  const included = new Set(ASSUMPTION_BASIS_POLICY.map((rule) => rule.type));
  return GRAPH_EDGE_TYPES.filter((type) => !included.has(type));
}

// --- Basis records ----------------------------------------------------------

/**
 * One object in an assumption's basis, with the revision stamp used to tell
 * whether it moved.
 *
 * The identifier and label are kept so a finding can name real records —
 * "Requirement REQ-104 changed" rather than an opaque id or, worse, an
 * unexplained conclusion.
 */
export interface BasisObject {
  type: GraphNodeType;
  id: string;
  identifier: string | null;
  label: string;
  /** ISO timestamp of the object's own last revision. Never "now". */
  revision: string;
  component: "DECISION" | "EVIDENCE" | "LINKED";
}

/** How a basis object differs from the previous evaluation. */
export const BASIS_CHANGE_KINDS = ["UPDATED", "ADDED", "REMOVED"] as const;
export type BasisChangeKind = (typeof BASIS_CHANGE_KINDS)[number];

export interface BasisChange {
  kind: BasisChangeKind;
  object: BasisObject;
}

/** The resolved basis of one assumption at one moment. */
export interface AssumptionBasis {
  assumptionId: string;
  /** False when the owning decision could not be resolved in the project graph. */
  resolved: boolean;
  objects: BasisObject[];
  /** Relationship rows the basis was reached through, so link changes register. */
  relationshipIds: string[];
}

// --- Fingerprints -----------------------------------------------------------

function digest(parts: readonly string[]): string {
  return createHash("sha256").update([...parts].sort().join("\n")).digest("hex");
}

function stampOf(object: BasisObject): string {
  return `${object.type}:${object.id}:${object.revision}`;
}

/**
 * Digest of one component of the basis.
 *
 * Component digests exist so a difference can be *attributed* — knowing only
 * that an aggregate moved would leave the finding unexplainable, which is the
 * one thing this feature cannot afford.
 */
export function componentFingerprint(
  basis: AssumptionBasis,
  component: BasisObject["component"],
): string {
  const parts = basis.objects.filter((o) => o.component === component).map(stampOf);

  // Relationship rows belong with the linked component: adding or removing a
  // link changes what the assumption stands on even when no object was edited.
  if (component === "LINKED") {
    parts.push(...basis.relationshipIds.map((id) => `rel:${id}`));
  }
  return digest(parts);
}

/**
 * Digest of the whole basis.
 *
 * Assumption-specific by construction: it contains only objects this
 * assumption's policy walk reached. An unrelated edit elsewhere in the project
 * cannot move it — which is the point, and the deliberate improvement over the
 * conservative project-wide fingerprint impact analysis uses.
 *
 * The assumption's own id is included so a fingerprint cannot be confused
 * between assumptions; its own `updatedAt` is **not**, because editing the
 * statement of an assumption is a change to the assumption, not to its basis.
 */
export function basisFingerprint(basis: AssumptionBasis): string {
  return digest([
    `version:${ASSUMPTION_MONITORING_VERSION}`,
    `assumption:${basis.assumptionId}`,
    `decision:${componentFingerprint(basis, "DECISION")}`,
    `evidence:${componentFingerprint(basis, "EVIDENCE")}`,
    `linked:${componentFingerprint(basis, "LINKED")}`,
  ]);
}

/**
 * What moved between two evaluations, named object by object.
 *
 * Deterministically ordered so two runs over the same difference produce the
 * same explanation.
 */
export function diffBasis(
  previous: readonly BasisObject[],
  current: readonly BasisObject[],
): BasisChange[] {
  const before = new Map(previous.map((object) => [`${object.type}:${object.id}`, object]));
  const after = new Map(current.map((object) => [`${object.type}:${object.id}`, object]));
  const changes: BasisChange[] = [];

  for (const [key, object] of after) {
    const prior = before.get(key);
    if (!prior) changes.push({ kind: "ADDED", object });
    else if (prior.revision !== object.revision) changes.push({ kind: "UPDATED", object });
  }

  for (const [key, object] of before) {
    if (!after.has(key)) changes.push({ kind: "REMOVED", object });
  }

  return changes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    if (a.object.type !== b.object.type) return a.object.type < b.object.type ? -1 : 1;
    if (a.object.id === b.object.id) return 0;
    return a.object.id < b.object.id ? -1 : 1;
  });
}

/**
 * The finding implied by which component digests differ.
 *
 * Pure, so precedence is testable without a database.
 */
export function findingFor(
  previous: { decision: string; evidence: string; linked: string } | null,
  current: { decision: string; evidence: string; linked: string },
): AssumptionMonitoringFinding {
  // Nothing to compare against yet. Saying "no change" here would be a claim
  // about a period that does not exist.
  if (!previous) return "UNKNOWN";

  const findings: AssumptionMonitoringFinding[] = [];
  if (previous.decision !== current.decision) findings.push("DECISION_BASIS_CHANGED");
  if (previous.evidence !== current.evidence) findings.push("EVIDENCE_CHANGED");
  if (previous.linked !== current.linked) findings.push("LINKED_OBJECT_CHANGED");

  return strongestFinding(findings);
}

// --- Records ----------------------------------------------------------------

/** One append-only entry in an assumption's monitoring history. */
export interface AssumptionMonitoringRecord {
  id: string;
  assumptionId: string;
  kind: AssumptionMonitoringKind;
  status: Exclude<AssumptionMonitoringStatus, "NOT_EVALUATED">;
  finding: AssumptionMonitoringFinding;
  basisFingerprint: string;
  decisionFingerprint: string;
  evidenceFingerprint: string;
  linkedFingerprint: string;
  basisSnapshot: BasisObject[];
  changedObjects: BasisChange[];
  /** The assumption's explicit status when the record was written. */
  assumptionStatus: AssumptionStatus;
  monitoredAt: Date;
  reviewNote: string | null;
  reviewedAt: Date | null;
  statusBefore: AssumptionStatus | null;
  statusAfter: AssumptionStatus | null;
  actor: { id: string; name: string } | null;
  createdAt: Date;
}

/** Current monitoring state for one assumption, as the UI and API return it. */
export interface AssumptionMonitoringState {
  assumptionId: string;
  /** The engineer's own judgement. Monitoring never writes this. */
  assumptionStatus: AssumptionStatus;
  monitoringStatus: AssumptionMonitoringStatus;
  finding: AssumptionMonitoringFinding | null;
  lastEvaluatedAt: Date | null;
  lastReviewedAt: Date | null;
  /** True when the basis moved under an assumption somebody had judged. */
  reviewRequired: boolean;
  /** The records that moved, so the flag can be explained. */
  changedObjects: BasisChange[];
  basisObjectCount: number;
  monitoringVersion: string;
}

/** Counts from a project-wide sweep. Every one derived from real evaluations. */
export interface AssumptionMonitoringSummary {
  evaluated: number;
  unchanged: number;
  reviewRequired: number;
  basisChanged: number;
  unknown: number;
}

// --- Request contracts ------------------------------------------------------

/**
 * Review input.
 *
 * There is no reviewer field: the reviewer is the authenticated session, and a
 * client that tries to supply one is rejected rather than having it silently
 * dropped. `status` is optional — a review that leaves the judgement alone is a
 * real outcome, and the commonest one.
 */
export const reviewAssumptionRequestSchema = z.strictObject({
  note: z.string().trim().max(4000).nullish(),
  status: assumptionStatusSchema.optional(),
});

export type ReviewAssumptionRequest = z.infer<typeof reviewAssumptionRequestSchema>;

export const evaluateAssumptionRequestSchema = z.strictObject({});

export const assumptionMonitoringIdSchema = entityIdSchema;
