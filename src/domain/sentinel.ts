import { z } from "zod";
import type { GraphNodeType } from "./graph";
import { entityIdSchema } from "./shared/identifier";

/**
 * The Decision Sentinel — continuous surveillance over the engineering
 * record.
 *
 * It turns "engineers manually run analysis" into "the system continuously
 * knows which analyses or reviews have become relevant because the
 * underlying engineering state changed." That is the whole of its job:
 *
 *   detect meaningful state changes
 *     → identify affected analysis/review domains
 *       → create actionable reevaluation signals
 *         → preserve provenance
 *
 * **Four things this deliberately is not.** Not an autonomous
 * decision-maker — it never approves, rejects, invalidates, certifies, or
 * declares failure. Not AI — every rule here is a declared, deterministic
 * table, the same discipline `DRIFT_RULES` and `CERTIFICATION_REVIEW_RULES`
 * already hold to. Not an automatic approval system — reevaluation is always
 * an explicit engineer action; the Sentinel proposes, never runs, an engine
 * on its own initiative. Not a notification engine — a surveillance target is
 * one engineering signal with real provenance, not an alert queue.
 *
 * **What it never does.** It never rewrites a requirement, a decision, an
 * assumption, a baseline, a readiness verdict, or a certification
 * disposition. "Verification readiness should be reevaluated" is a sentence
 * this module can produce; "verification is not ready" is not — that
 * conclusion belongs to `VerificationReadinessService` alone, and the
 * Sentinel only ever says a stored assessment's *basis* has moved, never
 * what a fresh one would conclude.
 *
 * Everything here is Prisma-free.
 */

export const SENTINEL_VERSION = "1";

// ---------------------------------------------------------------------------
// Sources and events
// ---------------------------------------------------------------------------

/**
 * The engineering object types the Sentinel watches for change.
 *
 * A deliberate subset of {@link GraphNodeType}: every one of these already
 * has a stable `updatedAt` revision (or, for a supplied item's/observation's
 * significance, a meaningful `createdAt`), and every one already appears as a
 * source in the dependency registry below. Adding a type here without an
 * entry in `SURVEILLANCE_DEPENDENCY_RULES` would be a source nothing ever
 * consumes.
 */
export const SURVEILLANCE_SOURCE_TYPES = [
  "REQUIREMENT",
  "DESIGN_ITEM",
  "ENGINEERING_DECISION",
  "DECISION_ASSUMPTION",
  "VERIFICATION_ACTIVITY",
  "SUPPLIER",
  "SUPPLIED_ITEM",
  "SUPPLIER_QUALIFICATION",
  "OPERATIONAL_OBSERVATION",
  "CHANGE_REQUEST",
  "CERTIFICATION_BASIS",
  "RISK",
  "ISSUE",
  "EVIDENCE",
] as const;
export type SurveillanceSourceType = (typeof SURVEILLANCE_SOURCE_TYPES)[number];
export const surveillanceSourceTypeSchema = z.enum(SURVEILLANCE_SOURCE_TYPES);

/** Every surveillance source type is a real graph node type. */
export function surveillanceSourceNodeType(type: SurveillanceSourceType): GraphNodeType {
  return type;
}

/**
 * What kind of change a detection event represents.
 *
 * Seven types, matching exactly what downstream dependency resolution
 * actually needs to distinguish — not one per source type, because several
 * source types share the same surveillance shape (a requirement and a design
 * item both just "changed content", so both produce
 * `ENGINEERING_OBJECT_CHANGED`).
 */
export const SURVEILLANCE_EVENT_TYPES = [
  "ENGINEERING_OBJECT_CHANGED",
  "RELATIONSHIP_CHANGED",
  "SUPPLIER_STATE_CHANGED",
  "OBSERVATION_RECORDED",
  "DECISION_BASIS_CHANGED",
  "CHANGE_REQUEST_CHANGED",
  "CERTIFICATION_BASIS_CHANGED",
] as const;
export type SurveillanceEventType = (typeof SURVEILLANCE_EVENT_TYPES)[number];
export const surveillanceEventTypeSchema = z.enum(SURVEILLANCE_EVENT_TYPES);

/** The one authoritative mapping from a changed source's type to its event type. */
const EVENT_TYPE_BY_SOURCE: Readonly<Record<SurveillanceSourceType, SurveillanceEventType>> = {
  REQUIREMENT: "ENGINEERING_OBJECT_CHANGED",
  DESIGN_ITEM: "ENGINEERING_OBJECT_CHANGED",
  VERIFICATION_ACTIVITY: "ENGINEERING_OBJECT_CHANGED",
  ENGINEERING_DECISION: "DECISION_BASIS_CHANGED",
  DECISION_ASSUMPTION: "DECISION_BASIS_CHANGED",
  SUPPLIER: "SUPPLIER_STATE_CHANGED",
  SUPPLIED_ITEM: "SUPPLIER_STATE_CHANGED",
  SUPPLIER_QUALIFICATION: "SUPPLIER_STATE_CHANGED",
  OPERATIONAL_OBSERVATION: "OBSERVATION_RECORDED",
  CHANGE_REQUEST: "CHANGE_REQUEST_CHANGED",
  CERTIFICATION_BASIS: "CERTIFICATION_BASIS_CHANGED",
  // A risk, issue or evidence changing is a content change to an engineering
  // record, the same shape as a requirement or design item — no new event
  // type.
  RISK: "ENGINEERING_OBJECT_CHANGED",
  ISSUE: "ENGINEERING_OBJECT_CHANGED",
  EVIDENCE: "ENGINEERING_OBJECT_CHANGED",
};

export function eventTypeForSource(sourceType: SurveillanceSourceType): SurveillanceEventType {
  return EVENT_TYPE_BY_SOURCE[sourceType];
}

/**
 * One immutable record of "something changed".
 *
 * Detection events are never edited and never deleted — they are the
 * Sentinel's own provenance, and rewriting one would destroy the evidence
 * that a change actually happened at a given moment. `sourceRevision` is
 * either the source object's own `updatedAt` (an ISO string) for a content
 * change, or `"audit:<auditLogId>"` for a relationship change read from the
 * audit log — either way, a stable key that makes detection idempotent: the
 * same revision is never recorded twice.
 */
export interface SentinelEvent {
  id: string;
  projectId: string;
  eventType: SurveillanceEventType;
  sourceType: SurveillanceSourceType;
  sourceId: string;
  sourceIdentifier: string | null;
  sourceLabel: string;
  sourceRevision: string;
  detectedAt: Date;
  actorId: string | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

/**
 * The six engines the Sentinel can point at.
 *
 * Every one of these already exists as an independent, deterministic
 * assessment/review engine. The Sentinel never reimplements any of them —
 * see `reEvaluateTarget` in the service, which dispatches to the real
 * engine and nothing else.
 */
export const SURVEILLANCE_TARGET_TYPES = [
  "IMPACT_ANALYSIS",
  "ASSUMPTION_MONITORING",
  "VERIFICATION_READINESS",
  "TECHNICAL_READINESS",
  "DRIFT_ASSESSMENT",
  "CERTIFICATION_REVIEW",
] as const;
export type SurveillanceTargetType = (typeof SURVEILLANCE_TARGET_TYPES)[number];
export const surveillanceTargetTypeSchema = z.enum(SURVEILLANCE_TARGET_TYPES);

/**
 * `targetId` for each target type — the *stable* domain object the target
 * monitors, chosen specifically because it is exactly what that engine's own
 * evaluate method takes as its own argument. This is what makes
 * `reEvaluateTarget` a one-line dispatch rather than a lookup table of its
 * own:
 *
 *   IMPACT_ANALYSIS        → ChangeRequest id
 *   ASSUMPTION_MONITORING  → DecisionAssumption id
 *   VERIFICATION_READINESS → VerificationActivity id
 *   TECHNICAL_READINESS    → the gate name itself (TechnicalReadinessGate)
 *   DRIFT_ASSESSMENT       → EngineeringBaseline id
 *   CERTIFICATION_REVIEW   → CertificationProgram id
 */
export type SurveillanceTargetId = string;

/**
 * Lifecycle of one surveillance signal.
 *
 * `OPEN` — needs attention. `ACKNOWLEDGED` — an engineer has seen it; this is
 * explicitly **not** a claim that anything was fixed or is safe. `RESOLVED`
 * — the associated analysis/review was rerun, or an engineer explicitly
 * recorded that no reevaluation was necessary; always carries a note.
 * `SUPERSEDED` — a newer surveillance event replaced this one before it was
 * resolved. `RESOLVED` and `SUPERSEDED` are both terminal: nothing
 * transitions out of them.
 */
export const SURVEILLANCE_TARGET_STATUSES = [
  "OPEN",
  "ACKNOWLEDGED",
  "SUPERSEDED",
  "RESOLVED",
] as const;
export type SurveillanceTargetStatus = (typeof SURVEILLANCE_TARGET_STATUSES)[number];
export const surveillanceTargetStatusSchema = z.enum(SURVEILLANCE_TARGET_STATUSES);

export const SURVEILLANCE_TARGET_TRANSITIONS: Readonly<
  Record<SurveillanceTargetStatus, readonly SurveillanceTargetStatus[]>
> = {
  OPEN: ["ACKNOWLEDGED", "RESOLVED", "SUPERSEDED"],
  ACKNOWLEDGED: ["RESOLVED", "SUPERSEDED"],
  RESOLVED: [],
  SUPERSEDED: [],
};

export function canTransitionSurveillanceTarget(
  from: SurveillanceTargetStatus,
  to: SurveillanceTargetStatus,
): boolean {
  return SURVEILLANCE_TARGET_TRANSITIONS[from].includes(to);
}

/** Whether a target still needs an engineer's attention. */
export function isSurveillanceTargetOpen(status: SurveillanceTargetStatus): boolean {
  return status === "OPEN" || status === "ACKNOWLEDGED";
}

/**
 * One surveillance signal: "this analysis/review may need reevaluation, and
 * here is why."
 *
 * At most one `OPEN` row may exist for a given (`projectId`, `targetType`,
 * `targetId`) — enforced by a partial unique index at the database level, not
 * merely a service-side check-then-insert, so concurrent detection calls
 * cannot race into duplicates. Multiple `RESOLVED`/`SUPERSEDED` rows for the
 * same target over time are expected and are the target's own history.
 */
export interface SurveillanceTarget {
  id: string;
  projectId: string;
  targetType: SurveillanceTargetType;
  targetId: SurveillanceTargetId;
  targetIdentifier: string | null;
  targetLabel: string;
  reason: string;
  sourceEventId: string;
  status: SurveillanceTargetStatus;
  detectedAt: Date;
  acknowledgedAt: Date | null;
  acknowledgedById: string | null;
  acknowledgementNote: string | null;
  resolvedAt: Date | null;
  resolvedById: string | null;
  resolutionNote: string | null;
  supersededById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Dependency registry
// ---------------------------------------------------------------------------

export interface SurveillanceDependencyRule {
  sourceType: SurveillanceSourceType;
  targetType: SurveillanceTargetType;
  /** The engineering reason a change here can affect this target domain. */
  reason: string;
}

/**
 * **The single authoritative dependency policy.**
 *
 * States, once, which source changes may affect which analysis/review
 * domains — and why. `evaluateSurveillance` never decides this ad hoc: it
 * looks up candidates here, then confirms each candidate against that
 * domain's own *actual* stored basis before creating a target (see
 * `resolveBasisMembership` in the service). A candidate the registry allows
 * is a *may* affect, not a guarantee — the registry says what is worth
 * checking, not what is true for every instance.
 *
 * Deliberately not "every relationship implies every engine": a
 * `DecisionAssumption` cannot affect `DRIFT_ASSESSMENT` (drift compares
 * baselined engineering objects against observations, and an assumption is
 * neither), so no such row exists.
 */
export const SURVEILLANCE_DEPENDENCY_RULES: readonly SurveillanceDependencyRule[] = [
  // --- Requirement ---
  {
    sourceType: "REQUIREMENT",
    targetType: "IMPACT_ANALYSIS",
    reason:
      "The requirement's statement or lifecycle state changed after an impact analysis reached it.",
  },
  {
    sourceType: "REQUIREMENT",
    targetType: "VERIFICATION_READINESS",
    reason:
      "The requirement changed after a verification readiness assessment included it in its basis.",
  },
  {
    sourceType: "REQUIREMENT",
    targetType: "TECHNICAL_READINESS",
    reason:
      "The requirement changed after a technical readiness gate assessment included it in its scope.",
  },
  {
    sourceType: "REQUIREMENT",
    targetType: "CERTIFICATION_REVIEW",
    reason: "The requirement changed after a certification review linked a compliance item to it.",
  },
  {
    sourceType: "REQUIREMENT",
    targetType: "DRIFT_ASSESSMENT",
    reason:
      "The requirement changed after it was baselined — the divergence drift exists to report.",
  },
  // --- Design item ---
  {
    sourceType: "DESIGN_ITEM",
    targetType: "IMPACT_ANALYSIS",
    reason: "The design item changed after an impact analysis reached it.",
  },
  {
    sourceType: "DESIGN_ITEM",
    targetType: "VERIFICATION_READINESS",
    reason:
      "The design item changed after a verification readiness assessment included it in its basis.",
  },
  {
    sourceType: "DESIGN_ITEM",
    targetType: "TECHNICAL_READINESS",
    reason:
      "The design item changed after a technical readiness gate assessment included it in its scope.",
  },
  {
    sourceType: "DESIGN_ITEM",
    targetType: "DRIFT_ASSESSMENT",
    reason:
      "The design item changed after it was baselined — the divergence drift exists to report.",
  },
  {
    sourceType: "DESIGN_ITEM",
    targetType: "CERTIFICATION_REVIEW",
    reason: "The design item changed after a certification review linked a compliance item to it.",
  },
  // --- Engineering decision ---
  {
    sourceType: "ENGINEERING_DECISION",
    targetType: "IMPACT_ANALYSIS",
    reason: "The decision changed after an impact analysis reached it.",
  },
  {
    sourceType: "ENGINEERING_DECISION",
    targetType: "ASSUMPTION_MONITORING",
    reason:
      "The decision changed, and its recorded assumptions may no longer rest on the same basis.",
  },
  {
    sourceType: "ENGINEERING_DECISION",
    targetType: "VERIFICATION_READINESS",
    reason:
      "The decision changed after a verification readiness assessment included it in its basis.",
  },
  {
    sourceType: "ENGINEERING_DECISION",
    targetType: "TECHNICAL_READINESS",
    reason:
      "The decision changed after a technical readiness gate assessment included it in its scope.",
  },
  {
    sourceType: "ENGINEERING_DECISION",
    targetType: "CERTIFICATION_REVIEW",
    reason: "The decision changed after a certification review linked a compliance item to it.",
  },
  {
    sourceType: "ENGINEERING_DECISION",
    targetType: "DRIFT_ASSESSMENT",
    reason: "The decision changed after it was baselined — the divergence drift exists to report.",
  },
  // --- Decision assumption ---
  {
    sourceType: "DECISION_ASSUMPTION",
    targetType: "ASSUMPTION_MONITORING",
    reason: "The assumption's own statement or status changed.",
  },
  {
    sourceType: "DECISION_ASSUMPTION",
    targetType: "VERIFICATION_READINESS",
    reason:
      "The assumption changed after a verification readiness assessment included it in its basis.",
  },
  {
    sourceType: "DECISION_ASSUMPTION",
    targetType: "TECHNICAL_READINESS",
    reason:
      "The assumption changed after a technical readiness gate assessment included it in its scope.",
  },
  // Deliberately no DECISION_ASSUMPTION -> CERTIFICATION_REVIEW row:
  // `CertificationReviewService.resolveBasis` reads assumption-monitoring
  // state only into the read-only `consumed.assumptions` display field
  // (`assumptionBasisRepository.loadAssumptionContext`) — never into
  // `basis.objects`, so no assumption id can ever satisfy Sentinel's
  // `basisContains` check for this target. Only the owning
  // ENGINEERING_DECISION is actually a basis object (via `engineeringRowsByType`),
  // which the row above already covers correctly.
  // --- Verification activity ---
  {
    sourceType: "VERIFICATION_ACTIVITY",
    targetType: "VERIFICATION_READINESS",
    reason: "The verification activity's own definition or status changed.",
  },
  {
    sourceType: "VERIFICATION_ACTIVITY",
    targetType: "TECHNICAL_READINESS",
    reason:
      "The verification activity changed after a technical readiness gate assessment included it in its scope.",
  },
  {
    sourceType: "VERIFICATION_ACTIVITY",
    targetType: "CERTIFICATION_REVIEW",
    reason:
      "The verification activity changed after a certification review linked a compliance item to it.",
  },
  {
    sourceType: "VERIFICATION_ACTIVITY",
    targetType: "DRIFT_ASSESSMENT",
    reason:
      "The verification activity changed after it was baselined — the divergence drift exists to report.",
  },
  // --- Supplier / supplied item / supplier qualification ---
  {
    sourceType: "SUPPLIER",
    targetType: "IMPACT_ANALYSIS",
    reason: "The supplier's status changed, reaching what it supplies.",
  },
  // Deliberately no SUPPLIER -> TECHNICAL_READINESS row: no gate's persisted
  // scope snapshot (`TechnicalReadinessService`'s own `refs`/`objects`
  // construction) ever includes a raw SUPPLIER node — only qualifications
  // ever entered a compliance item's engineering links, and even that
  // (see below) is not part of this engine's scope. A row here would be
  // unreachable by construction.
  //
  // Deliberately no SUPPLIER -> CERTIFICATION_REVIEW row either:
  // `COMPLIANCE_LINK_TYPES` (domain/certification.ts) never includes
  // SUPPLIER as a linkable type — only SUPPLIER_QUALIFICATION — so a
  // compliance item can never actually link to a raw supplier, and
  // `basis.objects` can never contain one.
  {
    sourceType: "SUPPLIED_ITEM",
    targetType: "IMPACT_ANALYSIS",
    reason: "The supplied item changed after an impact analysis reached it.",
  },
  {
    sourceType: "SUPPLIED_ITEM",
    targetType: "DRIFT_ASSESSMENT",
    reason:
      "The supplied item changed after it was baselined — the divergence drift exists to report.",
  },
  // Deliberately no SUPPLIED_ITEM -> CERTIFICATION_REVIEW row, for the
  // identical reason as SUPPLIER above — `COMPLIANCE_LINK_TYPES` never
  // includes SUPPLIED_ITEM either.
  {
    sourceType: "SUPPLIER_QUALIFICATION",
    targetType: "IMPACT_ANALYSIS",
    reason: "The supplier qualification's status changed, reaching what it qualifies.",
  },
  {
    sourceType: "SUPPLIER_QUALIFICATION",
    targetType: "DRIFT_ASSESSMENT",
    reason:
      "The supplier qualification changed after it was baselined — the divergence drift exists to report.",
  },
  // Deliberately no SUPPLIER_QUALIFICATION -> TECHNICAL_READINESS row, for
  // the same structural reason as SUPPLIER above.
  {
    sourceType: "SUPPLIER_QUALIFICATION",
    targetType: "CERTIFICATION_REVIEW",
    reason:
      "The supplier qualification changed after a certification review linked a compliance item to it.",
  },
  // --- Operational observation ---
  {
    sourceType: "OPERATIONAL_OBSERVATION",
    targetType: "DRIFT_ASSESSMENT",
    reason: "A new or changed observation was recorded against a baselined object.",
  },
  // Deliberately no OPERATIONAL_OBSERVATION -> ASSUMPTION_MONITORING row:
  // `AssumptionMonitoringService.resolveBasis` walks a fixed, documented
  // two-hop edge policy (`ASSUMPTION_BASIS_POLICY`) out of the owning
  // decision and, at most, its basis requirements — OPERATIONAL_OBSERVATION
  // is never a node that walk can reach, and the policy's own doc comment
  // says so explicitly ("deliberately absent... anything reachable only
  // from a design item or verification activity"). A row here would be
  // unreachable by construction.
  //
  // Deliberately no OPERATIONAL_OBSERVATION -> TECHNICAL_READINESS row
  // either: the same gap as SUPPLIER above — no gate's persisted scope ever
  // references an observation, despite an earlier version of this reason
  // claiming a gate "consumes drift for the object it concerns"; nothing in
  // `TechnicalReadinessService` ever did.
  //
  // Deliberately no OPERATIONAL_OBSERVATION -> CERTIFICATION_REVIEW row
  // either, for the identical reason: `CertificationReviewService.resolveBasis`
  // does consult the active baseline's latest drift assessment, but only to
  // populate the read-only `consumed.drift` display field — that data is
  // never folded into `basis.objects`, the only structure Sentinel's own
  // `basisContains` check reads.
  // --- Change request ---
  {
    sourceType: "CHANGE_REQUEST",
    targetType: "IMPACT_ANALYSIS",
    reason: "The change request's scope or status changed after an impact analysis was run for it.",
  },
  {
    sourceType: "CHANGE_REQUEST",
    targetType: "TECHNICAL_READINESS",
    reason:
      "The change request changed after a technical readiness gate assessment included it in its scope.",
  },
  // --- Certification basis ---
  {
    sourceType: "CERTIFICATION_BASIS",
    targetType: "CERTIFICATION_REVIEW",
    reason: "The certification basis changed — a new revision, or a status transition.",
  },
  // --- Risk ---
  {
    sourceType: "RISK",
    targetType: "IMPACT_ANALYSIS",
    reason: "The risk's status or content changed after an impact analysis declared it affected.",
  },
  {
    sourceType: "RISK",
    targetType: "TECHNICAL_READINESS",
    reason: "The risk changed after a technical readiness gate assessment counted it in its scope.",
  },
  // Deliberately no RISK -> CERTIFICATION_REVIEW row: a compliance item may
  // link to a risk as supporting context, but that link is explicitly
  // excluded from both the review's basis snapshot and its fingerprint (see
  // CertificationReviewService.resolveBasis and certificationFingerprint) —
  // a risk changing can never make a certification review stale, so a
  // dependency row here would be unreachable by construction, exactly the
  // defect an earlier build of this registry had for RELATIONSHIP_CHANGED.
  // --- Issue ---
  {
    sourceType: "ISSUE",
    targetType: "IMPACT_ANALYSIS",
    reason:
      "The issue's status, severity or content changed after an impact analysis declared it affected.",
  },
  {
    sourceType: "ISSUE",
    targetType: "TECHNICAL_READINESS",
    reason:
      "The issue changed after a technical readiness gate assessment counted it in its scope.",
  },
  // Deliberately no ISSUE -> CERTIFICATION_REVIEW row, for the same reason.
  // --- Evidence ---
  //
  // Unlike Risk/Issue, evidence genuinely does reach a certification review's
  // basis and fingerprint — verified by reading CertificationReviewService's
  // own basis construction before adding this row, not assumed from the
  // Risk/Issue precedent: `resolveBasis` builds a real `evidenceObjects` list
  // from the item/basis-scoped `EvidenceLink` rows and stamps each with its
  // own revision via `revisionOf("EVIDENCE", id)`, which folds into the
  // review's fingerprint the same way every other basis object does.
  {
    sourceType: "EVIDENCE",
    targetType: "IMPACT_ANALYSIS",
    reason:
      "Evidence content or lifecycle status changed; the project fingerprint impact analysis freshness is derived from includes every evidence row's own revision.",
  },
  {
    sourceType: "EVIDENCE",
    targetType: "TECHNICAL_READINESS",
    reason:
      "The evidence changed after a technical readiness gate assessment counted it in its scope (the release gate's evidence-per-activity check).",
  },
  {
    sourceType: "EVIDENCE",
    targetType: "VERIFICATION_READINESS",
    reason:
      "The evidence changed after a verification readiness assessment included it in its basis.",
  },
  {
    sourceType: "EVIDENCE",
    targetType: "CERTIFICATION_REVIEW",
    reason:
      "The evidence changed after a certification review's basis included it as linked supporting evidence for a compliance item.",
  },
] as const;

const DEPENDENCY_INDEX: ReadonlyMap<SurveillanceSourceType, readonly SurveillanceDependencyRule[]> =
  (() => {
    const index = new Map<SurveillanceSourceType, SurveillanceDependencyRule[]>();
    for (const rule of SURVEILLANCE_DEPENDENCY_RULES) {
      const list = index.get(rule.sourceType) ?? [];
      list.push(rule);
      index.set(rule.sourceType, list);
    }
    return index;
  })();

/** Candidate target domains for a changed source type, in registry order. */
export function dependencyRulesFor(
  sourceType: SurveillanceSourceType,
): readonly SurveillanceDependencyRule[] {
  return DEPENDENCY_INDEX.get(sourceType) ?? [];
}

export function dependencyReason(
  sourceType: SurveillanceSourceType,
  targetType: SurveillanceTargetType,
): string | null {
  return (
    dependencyRulesFor(sourceType).find((rule) => rule.targetType === targetType)?.reason ?? null
  );
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const detectSurveillanceRequestSchema = z.strictObject({});
export type DetectSurveillanceRequest = z.infer<typeof detectSurveillanceRequestSchema>;

export const acknowledgeSurveillanceRequestSchema = z.strictObject({
  note: z.string().trim().min(1).max(2000).nullish(),
});
export type AcknowledgeSurveillanceRequest = z.infer<typeof acknowledgeSurveillanceRequestSchema>;

/** Resolution always requires a note — the objective evidence the policy demands. */
export const resolveSurveillanceRequestSchema = z.strictObject({
  note: z.string().trim().min(1).max(2000),
});
export type ResolveSurveillanceRequest = z.infer<typeof resolveSurveillanceRequestSchema>;

export const reEvaluateSurveillanceRequestSchema = z.strictObject({});
export type ReEvaluateSurveillanceRequest = z.infer<typeof reEvaluateSurveillanceRequestSchema>;

export const surveillanceTargetIdSchema = entityIdSchema;

// ---------------------------------------------------------------------------
// Detection results
// ---------------------------------------------------------------------------

export interface DetectionSummary {
  eventsCreated: number;
  targetsOpened: number;
  targetsUpdated: number;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function surveillanceEventTypeLabel(type: SurveillanceEventType): string {
  switch (type) {
    case "ENGINEERING_OBJECT_CHANGED":
      return "Engineering object changed";
    case "RELATIONSHIP_CHANGED":
      return "Relationship changed";
    case "SUPPLIER_STATE_CHANGED":
      return "Supplier state changed";
    case "OBSERVATION_RECORDED":
      return "Observation recorded";
    case "DECISION_BASIS_CHANGED":
      return "Decision basis changed";
    case "CHANGE_REQUEST_CHANGED":
      return "Change request changed";
    case "CERTIFICATION_BASIS_CHANGED":
      return "Certification basis changed";
  }
}

export function surveillanceTargetTypeLabel(type: SurveillanceTargetType): string {
  switch (type) {
    case "IMPACT_ANALYSIS":
      return "Change Impact Analysis";
    case "ASSUMPTION_MONITORING":
      return "Assumption Monitoring";
    case "VERIFICATION_READINESS":
      return "Verification Readiness";
    case "TECHNICAL_READINESS":
      return "Technical Readiness";
    case "DRIFT_ASSESSMENT":
      return "Drift Assessment";
    case "CERTIFICATION_REVIEW":
      return "Certification Review";
  }
}

export function surveillanceTargetStatusLabel(status: SurveillanceTargetStatus): string {
  switch (status) {
    case "OPEN":
      return "Open";
    case "ACKNOWLEDGED":
      return "Acknowledged";
    case "RESOLVED":
      return "Resolved";
    case "SUPERSEDED":
      return "Superseded";
  }
}
