/**
 * The Engineering Command Center's response shape.
 *
 * Every type here is a read model over data other engines already produce
 * and already persist — Prisma-free, like every other domain file, and
 * deliberately inert: nothing here is a rule, a score, or a derivation. The
 * one thing this module contributes is `ATTENTION_SOURCE_MODULES` (an
 * enumeration of where an attention item can come from) and the shape an
 * attention item takes; the *decision* that a given record deserves
 * attention is made in `project-command-center.service.ts` by reading each
 * engine's own already-authoritative state, never recomputed here.
 *
 * Every composite type here is named `CommandCenter*` specifically so it
 * cannot collide with — and is never confused with — the real engine's own
 * summary type of a similar shape (e.g. `VerificationReadinessSummary` in
 * `verification-readiness.ts` is that engine's own finding tally;
 * `CommandCenterVerificationOverview` below is this read model's much
 * smaller aggregate over every activity in a project).
 *
 * There is no health score, no percentage, no weighted average and no
 * composite verdict anywhere in this file, and there must never be one added
 * to it — see the negative-assertion tests in
 * `project-command-center.service.test.ts` and the command center's own E2E
 * spec.
 */

/** Where an attention item's authoritative state actually lives. */
export const ATTENTION_SOURCE_MODULES = [
  "SENTINEL",
  "TECHNICAL_READINESS",
  "VERIFICATION_READINESS",
  "CERTIFICATION",
  "CHANGE_IMPACT",
  "ASSUMPTION_MONITORING",
  "DRIFT",
  "RISK",
  "ISSUE",
  "SUPPLIER",
] as const;
export type AttentionSourceModule = (typeof ATTENTION_SOURCE_MODULES)[number];

/**
 * One thing that currently requires engineering attention.
 *
 * `state` is always the literal status string the source engine already
 * stores (`"NOT_READY"`, `"CRITICAL"`, `"OPEN"`, `"STALE"`, ...) — never a
 * normalized severity scale, because inventing one would be exactly the kind
 * of composite judgement this capability is forbidden from making. `reason`
 * is a deterministic template built from real field values, not generated
 * text. `href` is a real route to the object's own existing detail page, or
 * to the workspace that owns it where no per-object page exists (a
 * certification review, a drift assessment) — never a fabricated one.
 */
export interface AttentionItem {
  /** Stable key: `${sourceModule}:${sourceType}:${sourceId}` — also the de-duplication key. */
  key: string;
  sourceModule: AttentionSourceModule;
  /** The kind of record this item names — a graph node type where one applies, or a source-specific tag. */
  sourceType: string;
  sourceId: string;
  identifier: string | null;
  title: string;
  /** The authoritative state string, verbatim from the source engine. */
  state: string;
  reason: string;
  href: string;
}

export interface CommandCenterProject {
  id: string;
  identifier: string | null;
  name: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommandCenterGateSummary {
  gate: string;
  status: "READY" | "NOT_READY" | "UNKNOWN" | "NOT_EVALUATED";
  freshness: "CURRENT" | "STALE" | "UNKNOWN" | null;
  evaluatedAt: Date | null;
  blocking: number;
  unknown: number;
  href: string;
}

export interface CommandCenterVerificationOverview {
  activitiesTotal: number;
  activitiesFailed: number;
  activitiesNeverEvaluated: number;
  attentionActivities: Array<{
    id: string;
    identifier: string | null;
    title: string;
    activityStatus: string;
    readinessStatus: "READY" | "NOT_READY" | "UNKNOWN" | "NOT_EVALUATED";
    evaluatedAt: Date | null;
    href: string;
  }>;
}

export interface CommandCenterCertificationOverview {
  hasProgram: boolean;
  programIdentifier: string | null;
  activeBasisIdentifier: string | null;
  review: {
    status: "READY" | "NOT_READY" | "UNKNOWN" | "NOT_EVALUATED";
    evaluatedAt: Date | null;
    blockingCount: number;
    unknownCount: number;
    href: string;
  } | null;
  openFindings: Array<{
    id: string;
    identifier: string;
    title: string;
    status: string;
    href: string;
  }>;
}

export interface CommandCenterChangeImpactOverview {
  activeChanges: Array<{
    id: string;
    identifier: string;
    title: string;
    status: string;
    latestAnalysis: {
      status: "RUNNING" | "COMPLETED" | "FAILED" | "NOT_RUN";
      freshness: "CURRENT" | "STALE" | "UNKNOWN" | null;
      startedAt: Date | null;
      direct: number;
      downstream: number;
      crossDomain: number;
      unknown: number;
    };
    href: string;
  }>;
}

export interface CommandCenterAssumptionOverview {
  total: number;
  reviewRequired: number;
  basisChanged: number;
  neverEvaluated: number;
  attentionAssumptions: Array<{
    id: string;
    decisionId: string;
    decisionIdentifier: string;
    statement: string;
    monitoringStatus: string;
    href: string;
  }>;
}

export interface CommandCenterDriftOverview {
  status: "NO_DRIFT" | "DRIFT_DETECTED" | "UNKNOWN" | "NOT_EVALUATED";
  evaluatedAt: Date | null;
  findings: number;
  reviewRequired: number;
  unknown: number;
  href: string;
}

export interface CommandCenterRiskOverview {
  open: number;
  items: Array<{ id: string; identifier: string; title: string; status: string; href: string }>;
}

export interface CommandCenterIssueOverview {
  open: number;
  attentionCount: number;
  items: Array<{
    id: string;
    identifier: string;
    title: string;
    status: string;
    severity: string;
    href: string;
  }>;
}

export interface CommandCenterSupplierOverview {
  suppliersUnderReview: Array<{ id: string; identifier: string; title: string; href: string }>;
  suppliedItemsUnderReview: Array<{ id: string; identifier: string; title: string; href: string }>;
  qualificationsAttention: Array<{
    id: string;
    identifier: string;
    title: string;
    status: string;
    href: string;
  }>;
}

export interface CommandCenterEvidenceOverview {
  draftCount: number;
  validatedCount: number;
  supersededCount: number;
  draftItems: Array<{ id: string; identifier: string; title: string; href: string }>;
}

export interface CommandCenterSentinelOverview {
  openCount: number;
  acknowledgedCount: number;
  targets: Array<{
    id: string;
    targetType: string;
    targetIdentifier: string | null;
    targetLabel: string;
    status: string;
    reason: string;
    href: string;
  }>;
}

export interface CommandCenterView {
  project: CommandCenterProject;
  attentionItems: AttentionItem[];
  readiness: {
    technical: CommandCenterGateSummary[];
    verification: CommandCenterVerificationOverview;
    certification: CommandCenterCertificationOverview;
    changeImpact: CommandCenterChangeImpactOverview;
    assumptions: CommandCenterAssumptionOverview;
    drift: CommandCenterDriftOverview;
  };
  risks: CommandCenterRiskOverview;
  issues: CommandCenterIssueOverview;
  suppliers: CommandCenterSupplierOverview;
  evidence: CommandCenterEvidenceOverview;
  sentinel: CommandCenterSentinelOverview;
  /** A single, existing route — never a second traversal implementation. */
  traceabilityHref: string;
}
