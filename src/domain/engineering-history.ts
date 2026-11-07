import { z } from "zod";
import type { GraphNodeType } from "./graph";

/**
 * The Engineering History workspace.
 *
 * Answers "what happened to this engineering object over time?" and "what
 * happened across this project?" by composing historical facts that are
 * *already persisted* elsewhere — `AuditLog` rows, and the append-only
 * assessment/event tables each engine already writes (`DriftAssessment`,
 * `CertificationReview`, `VerificationReadinessAssessment`,
 * `TechnicalReadinessAssessment`, `ImpactAnalysis`, `SentinelEvent`,
 * `SurveillanceTarget`). This file adds no audit mechanism of its own: it is
 * Prisma-free, like every other domain file, and defines only the shape a
 * composed event takes, which object types get their own history page, and
 * the deterministic ordering/pagination rules over the merged stream.
 *
 * **The one rule every event in this system must satisfy**: a `HistoryEvent`
 * exists only when the fact it names was actually written to the database at
 * some point — a status transition really was recorded, an assessment really
 * was persisted, a target really was detected. Nothing here infers what must
 * have happened from what is true today, and nothing here infers *why* two
 * events are related merely because their timestamps are close.
 */

// --- Source modules ----------------------------------------------------------

/**
 * The broad category a history event's filter dropdown groups by — coarser
 * than `sourceType` (which names the precise object/assessment kind for
 * navigation), and deliberately not identical to `GraphNodeType`: several
 * source types that are one graph node each (`CertificationBasis`,
 * `ComplianceItem`, `CertificationFinding`, `CertificationReview`) are one
 * module to a reader ("Certification"), and the readiness/impact/drift/
 * sentinel assessment tables are not graph nodes at all.
 */
export const HISTORY_SOURCE_MODULES = [
  "REQUIREMENT",
  "STAKEHOLDER_NEED",
  "DESIGN_ITEM",
  "DECISION",
  "RISK",
  "ISSUE",
  "EVIDENCE",
  "CHANGE_MANAGEMENT",
  "VERIFICATION",
  "SUPPLIER",
  "BASELINE",
  "CERTIFICATION",
  "DRIFT",
  "TECHNICAL_READINESS",
  "VERIFICATION_READINESS",
  "SENTINEL",
] as const;
export type HistorySourceModule = (typeof HISTORY_SOURCE_MODULES)[number];
export const historySourceModuleSchema = z.enum(HISTORY_SOURCE_MODULES);

/** What kind of historical fact an event records — presentation grouping only, never a judgement. */
export const HISTORY_EVENT_CATEGORIES = [
  "CONTENT_CHANGE",
  "LIFECYCLE_TRANSITION",
  "RELATIONSHIP_CHANGE",
  "OWNER_CHANGE",
  "ASSESSMENT",
  "SURVEILLANCE",
  "OBSERVATION",
] as const;
export type HistoryEventCategory = (typeof HISTORY_EVENT_CATEGORIES)[number];

/**
 * Object types eligible for their own standalone `/history/:objectType/:id`
 * page — exactly the graph node types that already have a real detail route
 * (`traceabilityDetailRoute` in `traceability.ts`), reused rather than
 * re-decided here. A type absent from this list (a certification basis, a
 * compliance item, a certification finding, an operational observation) can
 * still appear in the *project*-level stream; it just has no page of its own
 * to link back to, the same "selectable ≠ has a detail page" distinction
 * Traceability already draws.
 */
export const HISTORY_OBJECT_TYPES = [
  "REQUIREMENT",
  "STAKEHOLDER_NEED",
  "DESIGN_ITEM",
  "VERIFICATION_ACTIVITY",
  "ENGINEERING_DECISION",
  "CHANGE_REQUEST",
  "RISK",
  "ISSUE",
  "SUPPLIER",
  "SUPPLIED_ITEM",
  "SUPPLIER_QUALIFICATION",
  "ENGINEERING_BASELINE",
  "COMPLIANCE_ITEM",
  "EVIDENCE",
] as const satisfies readonly GraphNodeType[];
export type HistoryObjectType = (typeof HISTORY_OBJECT_TYPES)[number];
export const historyObjectTypeSchema = z.enum(
  HISTORY_OBJECT_TYPES as unknown as [HistoryObjectType, ...HistoryObjectType[]],
);

export function isHistoryObjectType(value: string): value is HistoryObjectType {
  return (HISTORY_OBJECT_TYPES as readonly string[]).includes(value);
}

// --- Events --------------------------------------------------------------------

/**
 * One historical fact, composed from an already-persisted record.
 *
 * `actorId`/`actorName` are `null` whenever the underlying row's own actor
 * reference is `null` — never filled in with a guess. `detail` is a short,
 * deterministic description built only from fields the source record itself
 * stores (a status pair, a count, a finding tally); it is never generated
 * text and never infers a fact the record does not hold.
 */
export interface HistoryEvent {
  /** Stable identity and the sort tie-breaker: `${sourceModule}:${sourceType}:${sourceId}:${action}:${timestamp.toISOString()}`. */
  key: string;
  timestamp: Date;
  category: HistoryEventCategory;
  sourceModule: HistorySourceModule;
  /** A graph node type where one applies, or a source-specific tag (e.g. `DRIFT_ASSESSMENT`, `SURVEILLANCE_TARGET`) otherwise. */
  sourceType: string;
  sourceId: string;
  sourceIdentifier: string | null;
  sourceLabel: string;
  /** The raw, namespaced action or a synthesized descriptor for a native-table event (e.g. `"drift.evaluated"`). */
  action: string;
  /** A deterministic, human-readable label derived from `action` — never generated prose. */
  label: string;
  actorId: string | null;
  actorName: string | null;
  detail: string | null;
  href: string;
}

export interface HistoryPage {
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export const HISTORY_PAGE_DEFAULT_LIMIT = 50;
export const HISTORY_PAGE_MAX_LIMIT = 200;

/** Never trusts a caller-supplied limit past the hard cap — this is what keeps the stream bounded. */
export function clampHistoryLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit) || limit <= 0) return HISTORY_PAGE_DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), HISTORY_PAGE_MAX_LIMIT);
}

export function clampHistoryOffset(offset: number | undefined): number {
  if (offset === undefined || !Number.isFinite(offset) || offset < 0) return 0;
  return Math.floor(offset);
}

/**
 * **The single deterministic ordering.** Newest first; ties broken by the
 * event's own stable key, never by database return order — two calls over
 * the same underlying state always produce the same sequence.
 */
export function compareHistoryEvents(
  a: Pick<HistoryEvent, "timestamp" | "key">,
  b: Pick<HistoryEvent, "timestamp" | "key">,
): number {
  const byTime = b.timestamp.getTime() - a.timestamp.getTime();
  if (byTime !== 0) return byTime;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/** Keeps the first occurrence of each key — the same de-duplication discipline the Command Center's attention list uses. */
export function dedupeHistoryEvents(events: readonly HistoryEvent[]): HistoryEvent[] {
  const seen = new Set<string>();
  const result: HistoryEvent[] = [];
  for (const event of events) {
    if (seen.has(event.key)) continue;
    seen.add(event.key);
    result.push(event);
  }
  return result;
}

/**
 * Sorts, then slices — stable offset pagination over an already-bounded,
 * already-bucketed merge. Never a database cursor across a heterogeneous
 * union of sources, but never an unbounded in-memory scan either: every
 * source this composes is itself capped before it reaches this function.
 */
export function paginateHistoryEvents(
  events: readonly HistoryEvent[],
  offset: number | undefined,
  limit: number | undefined,
): { events: HistoryEvent[]; page: HistoryPage } {
  const safeOffset = clampHistoryOffset(offset);
  const safeLimit = clampHistoryLimit(limit);
  const sorted = [...events].sort(compareHistoryEvents);
  const page = sorted.slice(safeOffset, safeOffset + safeLimit);

  return {
    events: page,
    page: {
      offset: safeOffset,
      limit: safeLimit,
      total: sorted.length,
      hasMore: safeOffset + safeLimit < sorted.length,
    },
  };
}

// --- Display helpers -----------------------------------------------------------

/**
 * One consolidated action → label table for every `AuditLog` action this
 * capability reads, plus the synthesized action names the native-table
 * sources use. Several detail pages (`requirement-detail-view.tsx`,
 * `risk-detail-view.tsx`, `issue-detail-view.tsx`, `evidence-detail-view.tsx`)
 * keep their own smaller, local versions of this same idea; this is not a
 * fifth one bolted on for the sake of it — it is the single table the new
 * project- and object-level history workspaces both read, so a label never
 * differs depending on which page a reader found the event through.
 */
const HISTORY_ACTION_LABELS: Readonly<Record<string, string>> = {
  created: "Created",
  updated: "Content updated",
  status_transitioned: "Status changed",
  status_changed: "Status changed",
  owner_assigned: "Owner assigned",
  owner_cleared: "Owner cleared",
  link_added: "Traceability link added",
  link_removed: "Traceability link removed",
  linked: "Engineering link added",
  unlinked: "Engineering link removed",
  // Evidence
  validated: "Validated",
  superseded: "Superseded",
  // Engineering decision memory
  alternative_added: "Alternative recorded",
  alternative_updated: "Alternative revised",
  alternative_removed: "Alternative removed",
  assumption_added: "Assumption recorded",
  assumption_updated: "Assumption revised",
  assumption_removed: "Assumption removed",
  expectation_set: "Expected outcome recorded",
  expectation_cleared: "Expected outcome cleared",
  // Change request
  declared_impact_added: "Impact declared",
  declared_impact_removed: "Declared impact withdrawn",
  // Baseline
  member_added: "Member added",
  member_removed: "Member removed",
  activated: "Activated",
  // Observation
  reviewed: "Reviewed",
  rejected: "Rejected",
  // Supplier qualification / supplied item
  evidence_linked: "Evidence attached",
  evidence_unlinked: "Evidence detached",
  // Certification
  resolved: "Resolved",
  accepted: "Accepted",
  // Native-table sources (synthesized action strings, not raw AuditLog)
  evaluated: "Evaluated",
  ran: "Run",
  detected: "Detected",
  acknowledged: "Acknowledged",
};

/** `"design_item.owner_assigned"` → `"Owner assigned"`; an unrecognized suffix falls back to the raw action, never blank. */
export function historyEventLabel(action: string): string {
  const suffix = action.includes(".") ? action.split(".").slice(1).join(".") : action;
  return HISTORY_ACTION_LABELS[suffix] ?? action;
}

export function historySourceModuleLabel(module: HistorySourceModule): string {
  return module
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
