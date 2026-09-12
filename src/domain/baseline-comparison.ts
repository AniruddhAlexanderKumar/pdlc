import type { BaselineMemberType, BaselineStatus } from "./drift";

/**
 * Engineering configuration and baseline integrity.
 *
 * `EngineeringBaseline` and `EngineeringBaselineMember` (in `drift.ts`)
 * already carry everything this file needs: a frozen snapshot per member
 * (`fingerprint`, `stateSnapshot`, `revisionSnapshot`) and, at read time, that
 * same object's *current* fingerprint via `loadBaselineableObjects`
 * (`baseline-member.repository.ts`). This file adds no baseline model, no
 * second snapshot mechanism and no new fingerprint algorithm — it is the one
 * missing piece: a formal, deterministic classification of "snapshot vs
 * current" that a baseline workspace, the Command Center, and an API
 * consumer can all read the same way, instead of each inferring it ad hoc
 * from a raw `currentFingerprint: string | null`.
 *
 * This is deliberately **not** a drift assessment. `DriftAssessment` is an
 * explicit, persisted, versioned evaluation that also reads observations and
 * applies `DRIFT_RULES` (expectation breaches, supplier state, configuration
 * observations, and so on) — a genuinely broader engineering question,
 * answered only when someone runs it. A baseline comparison answers a
 * narrower one — "does this baseline's own membership still match the
 * engineering record, right now?" — for *any* baseline, DRAFT included,
 * without requiring an observation to exist or an evaluation to be run. The
 * central member-level fact both rest on (fingerprint equality) is the same
 * fact; this file gives it a name on its own, not a second engine.
 */

/**
 * What the record can prove about one member, and nothing more.
 *
 * - `UNCHANGED` — the object's current fingerprint equals what was captured.
 * - `CHANGED` — it resolves in the project, and the fingerprints differ.
 * - `OBJECT_MISSING` — the object no longer resolves in the project at all.
 *   Distinct from `CHANGED` on purpose: a caller who conflated the two could
 *   not tell "the record changed" from "the record is gone", and those merit
 *   different attention.
 * - `UNKNOWN` — the comparison genuinely cannot be established. In practice
 *   this is the defensive case of a member row whose own captured
 *   `fingerprint` is empty — never fabricated as a stand-in for a
 *   classification the data could actually prove; every ordinary member has
 *   a real fingerprint and resolves to exactly `UNCHANGED`, `CHANGED` or
 *   `OBJECT_MISSING`.
 *
 * There is no fifth `OBJECT_NO_LONGER_MATCHES` state: given only a
 * fingerprint pair, that would be indistinguishable from `CHANGED` — adding
 * one would be exactly the invented distinction this capability's own
 * specification forbids.
 */
export const BASELINE_COMPARISON_STATUSES = [
  "UNCHANGED",
  "CHANGED",
  "OBJECT_MISSING",
  "UNKNOWN",
] as const;
export type BaselineComparisonStatus = (typeof BASELINE_COMPARISON_STATUSES)[number];

/**
 * The single place a member's comparison outcome is decided.
 *
 * Pure and total: given the snapshot fingerprint and the (possibly absent)
 * current object, exactly one of the four statuses always results. No
 * database, no clock — the same two inputs always classify the same way.
 */
export function classifyBaselineMemberComparison(
  baselinedFingerprint: string,
  current: { fingerprint: string } | null,
): BaselineComparisonStatus {
  if (!baselinedFingerprint) return "UNKNOWN";
  if (!current) return "OBJECT_MISSING";
  return current.fingerprint === baselinedFingerprint ? "UNCHANGED" : "CHANGED";
}

/**
 * One change request already declared as touching this member.
 *
 * Read directly from `ChangeRequestImpact` (the same declared-impact table
 * `DriftDetectionService`'s own `DR-CTX-001` context rule reads) — never a
 * recomputed impact analysis, and never a second traversal engine. Empty
 * when nothing has been declared.
 */
export interface BaselineComparisonDeclaredChange {
  changeRequestId: string;
  identifier: string;
  status: string;
}

export interface BaselineComparisonMember {
  memberId: string;
  nodeType: BaselineMemberType;
  nodeId: string;
  identifier: string | null;
  label: string;
  baselinedState: string | null;
  currentState: string | null;
  baselinedFingerprint: string;
  currentFingerprint: string | null;
  status: BaselineComparisonStatus;
  declaredChanges: BaselineComparisonDeclaredChange[];
}

export interface BaselineComparisonSummary {
  total: number;
  unchanged: number;
  changed: number;
  missing: number;
  unknown: number;
}

export interface BaselineComparisonReport {
  baselineId: string;
  baselineIdentifier: string;
  baselineName: string;
  baselineStatus: BaselineStatus;
  /**
   * When this comparison was read. Not a stored, versioned fact the way
   * `DriftAssessment.evaluatedAt` is — this report is never persisted, so
   * there is nothing here to go stale. Carried only so a caller can show
   * "as of" beside a live read, never to imply a saved record.
   */
  comparedAt: Date;
  members: BaselineComparisonMember[];
  summary: BaselineComparisonSummary;
}

/** Deterministic tally over already-classified members. No score, no weighting. */
export function summarizeBaselineComparison(
  members: readonly { status: BaselineComparisonStatus }[],
): BaselineComparisonSummary {
  return {
    total: members.length,
    unchanged: members.filter((m) => m.status === "UNCHANGED").length,
    changed: members.filter((m) => m.status === "CHANGED").length,
    missing: members.filter((m) => m.status === "OBJECT_MISSING").length,
    unknown: members.filter((m) => m.status === "UNKNOWN").length,
  };
}

const BASELINE_COMPARISON_STATUS_LABELS: Readonly<Record<BaselineComparisonStatus, string>> = {
  UNCHANGED: "Unchanged",
  CHANGED: "Changed since baseline",
  OBJECT_MISSING: "No longer resolvable",
  UNKNOWN: "Unknown",
};

export function baselineComparisonStatusLabel(status: BaselineComparisonStatus): string {
  return BASELINE_COMPARISON_STATUS_LABELS[status];
}
