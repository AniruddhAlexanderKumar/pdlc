import {
  type HistoryEvent,
  type HistoryEventCategory,
  type HistoryObjectType,
  type HistorySourceModule,
  codeLabel,
  entityIdSchema,
  historyEventLabel,
  historyObjectTypeSchema,
  dedupeHistoryEvents,
  paginateHistoryEvents,
  traceabilityDetailRoute,
} from "@/domain";
import type { OrganizationContext } from "@/server/context/organization-context";
import { NotFoundError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import * as monitoringRepository from "@/server/repositories/assumption-monitoring.repository";
import * as assessmentRepository from "@/server/repositories/drift-assessment.repository";
import {
  HISTORY_ARTIFACT_ENTITY_TYPES,
  type HistoryAuditRow,
  type ProjectArtifactRef,
  listAuditEventsForProjectArtifacts,
  listProjectArtifacts,
} from "@/server/repositories/engineering-history.repository";
import * as impactAnalysisRepository from "@/server/repositories/impact-analysis.repository";
import * as technicalReadinessRepository from "@/server/repositories/technical-readiness.repository";
import * as verificationReadinessRepository from "@/server/repositories/verification-readiness.repository";
import * as certificationProgramRepository from "@/server/repositories/certification-program.repository";
import * as certificationReviewRepository from "@/server/repositories/certification-review.repository";
import * as sentinelEventRepository from "@/server/repositories/sentinel-event.repository";
import * as surveillanceTargetRepository from "@/server/repositories/surveillance-target.repository";
import { parseOrThrow } from "@/server/validation";
import { sentinelTargetHref } from "./project-command-center.service";
import { requireProjectReadAccess } from "./project-scope";

/**
 * The Engineering History workspace.
 *
 * A read-only aggregation, exactly like the Engineering Command Center and
 * Traceability workspace before it — nothing here is a second audit system.
 * Every event this service returns is read from a record that already
 * exists: `AuditLog` rows for the seventeen artifact types that record their
 * lifecycle there, and the native, already-timestamped rows each assessment/
 * surveillance engine already persists (`DriftAssessment`,
 * `TechnicalReadinessAssessment`, `VerificationReadinessAssessment`,
 * `CertificationReview`, `ImpactAnalysis`, `SentinelEvent`,
 * `SurveillanceTarget`). This service writes nothing, ever — reading history
 * must never create history.
 *
 * **The strict distinction this service enforces throughout**: a
 * `HistoryEvent` names a fact that was actually persisted at some moment —
 * a transition that really happened, an assessment that really ran, a
 * target that really opened. Nothing here reconstructs what a record must
 * have looked like before an edit from what it looks like today; where the
 * old value was never stored (a description before a rewrite, an
 * alternative's prior text), no event claims to know it.
 */

// --- Filters and pagination ---------------------------------------------------

export interface ProjectHistoryFilter {
  module?: unknown;
  objectType?: unknown;
  actorId?: unknown;
  from?: unknown;
  to?: unknown;
}

export interface HistoryPagination {
  offset?: unknown;
  limit?: unknown;
}

export interface ProjectHistoryResult {
  events: HistoryEvent[];
  page: { offset: number; limit: number; total: number; hasMore: boolean };
}

export interface ObjectHistoryResult extends ProjectHistoryResult {
  object: { type: HistoryObjectType; id: string; identifier: string | null; label: string; href: string };
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function optionalDate(value: unknown): Date | null {
  const raw = optionalString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

// --- Entity-type lookup tables --------------------------------------------------

const OBJECT_TYPE_BY_ENTITY_TYPE = new Map(
  HISTORY_ARTIFACT_ENTITY_TYPES.map((row) => [row.entityType, row.objectType]),
);

const MODULE_BY_ENTITY_TYPE: Readonly<Record<string, HistorySourceModule>> = {
  Requirement: "REQUIREMENT",
  DesignItem: "DESIGN_ITEM",
  EngineeringDecision: "DECISION",
  Risk: "RISK",
  Issue: "ISSUE",
  Evidence: "EVIDENCE",
  ChangeRequest: "CHANGE_MANAGEMENT",
  EngineeringBaseline: "BASELINE",
  Supplier: "SUPPLIER",
  SuppliedItem: "SUPPLIER",
  SupplierQualification: "SUPPLIER",
  VerificationActivity: "VERIFICATION",
  StakeholderNeed: "STAKEHOLDER_NEED",
  CertificationBasis: "CERTIFICATION",
  ComplianceItem: "CERTIFICATION",
  CertificationFinding: "CERTIFICATION",
  OperationalObservation: "DRIFT",
};

const LIFECYCLE_ACTION_SUFFIXES = new Set([
  "status_transitioned",
  "status_changed",
  "activated",
  "validated",
  "superseded",
  "resolved",
  "accepted",
]);
const RELATIONSHIP_ACTION_SUFFIXES = new Set([
  "link_added",
  "link_removed",
  "linked",
  "unlinked",
  "evidence_linked",
  "evidence_unlinked",
  "member_added",
  "member_removed",
  "alternative_added",
  "alternative_updated",
  "alternative_removed",
  "assumption_added",
  "assumption_updated",
  "assumption_removed",
  "expectation_set",
  "expectation_cleared",
  "declared_impact_added",
  "declared_impact_removed",
]);
const OWNER_ACTION_SUFFIXES = new Set(["owner_assigned", "owner_cleared"]);

/**
 * `sourceType` for the three artifact types with no `HistoryObjectType` of
 * their own — the real `GraphNodeType` name each already carries in the
 * graph registry, not a mangled fallback string.
 */
const SOURCE_TYPE_WITHOUT_OBJECT_TYPE: Readonly<Record<string, string>> = {
  CertificationBasis: "CERTIFICATION_BASIS",
  CertificationFinding: "CERTIFICATION_FINDING",
  OperationalObservation: "OPERATIONAL_OBSERVATION",
};

function categoryForAuditAction(entityType: string, action: string): HistoryEventCategory {
  if (entityType === "OperationalObservation") return "OBSERVATION";
  const suffix = action.includes(".") ? action.split(".").slice(1).join(".") : action;
  if (LIFECYCLE_ACTION_SUFFIXES.has(suffix)) return "LIFECYCLE_TRANSITION";
  if (RELATIONSHIP_ACTION_SUFFIXES.has(suffix)) return "RELATIONSHIP_CHANGE";
  if (OWNER_ACTION_SUFFIXES.has(suffix)) return "OWNER_CHANGE";
  return "CONTENT_CHANGE";
}

/**
 * A short, deterministic description built only from fields the metadata
 * itself carries — never generated text, never a fact the record does not
 * hold.
 */
function detailFromMetadata(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const data = metadata as Record<string, unknown>;

  if (typeof data["from"] === "string" && typeof data["to"] === "string") {
    return `${codeLabel(data["from"])} → ${codeLabel(data["to"])}`;
  }
  if (Array.isArray(data["changedFields"])) {
    const fields = data["changedFields"].filter((f): f is string => typeof f === "string");
    return fields.length > 0 ? `Changed ${fields.join(", ")}` : null;
  }
  if (typeof data["relation"] === "string") return data["relation"].replaceAll("_", " ").toLowerCase();
  if (typeof data["status"] === "string") return codeLabel(data["status"]);
  if (typeof data["identifier"] === "string") return data["identifier"];
  return null;
}

function objectHref(projectId: string, objectType: HistoryObjectType | null, id: string, parentId?: string): string {
  if (objectType) return traceabilityDetailRoute(objectType, projectId, id) ?? "";
  // The three artifact types with no standalone detail page fall back to the
  // nearest real page: a finding to its own compliance item, a basis or an
  // observation to the workspace that lists it — never a fabricated route.
  if (parentId) {
    const parentRoute = traceabilityDetailRoute("COMPLIANCE_ITEM", projectId, parentId);
    if (parentRoute) return parentRoute;
  }
  return "";
}

function toArtifactEvent(
  projectId: string,
  entityType: string,
  artifact: ProjectArtifactRef,
  row: HistoryAuditRow,
): HistoryEvent {
  const objectType = OBJECT_TYPE_BY_ENTITY_TYPE.get(entityType) ?? null;
  const sourceModule = MODULE_BY_ENTITY_TYPE[entityType] ?? "REQUIREMENT";
  let href = objectHref(projectId, objectType, artifact.id, artifact.parentId);
  if (!href && entityType === "CertificationBasis") href = `/projects/${projectId}/certification`;
  if (!href && entityType === "OperationalObservation") href = `/projects/${projectId}/observations`;

  return {
    key: `${sourceModule}:${entityType}:${artifact.id}:${row.action}:${row.createdAt.toISOString()}:${row.id}`,
    timestamp: row.createdAt,
    category: categoryForAuditAction(entityType, row.action),
    sourceModule,
    sourceType: objectType ?? SOURCE_TYPE_WITHOUT_OBJECT_TYPE[entityType] ?? entityType,
    sourceId: artifact.id,
    sourceIdentifier: artifact.identifier,
    sourceLabel: artifact.label,
    action: row.action,
    label: historyEventLabel(row.action),
    actorId: row.actor?.id ?? null,
    actorName: row.actor?.name ?? null,
    detail: detailFromMetadata(row.metadata),
    href,
  };
}

// --- Native-table event builders -------------------------------------------------

function driftEvent(
  projectId: string,
  assessment: { id: string; baselineId: string; status: string; evaluatedAt: Date; evaluatedById: string | null },
  baseline: ProjectArtifactRef | undefined,
): HistoryEvent {
  return {
    key: `DRIFT:DRIFT_ASSESSMENT:${assessment.id}:evaluated:${assessment.evaluatedAt.toISOString()}`,
    timestamp: assessment.evaluatedAt,
    category: "ASSESSMENT",
    sourceModule: "DRIFT",
    sourceType: "DRIFT_ASSESSMENT",
    sourceId: assessment.id,
    sourceIdentifier: baseline?.identifier ?? null,
    sourceLabel: baseline ? `Drift evaluated against ${baseline.label}` : "Drift evaluated",
    action: "drift.evaluated",
    label: historyEventLabel("drift.evaluated"),
    actorId: assessment.evaluatedById,
    actorName: null,
    detail: codeLabel(assessment.status),
    href: `/projects/${projectId}/drift`,
  };
}

function technicalReadinessEvent(
  projectId: string,
  assessment: { id: string; gate: string; status: string; evaluatedAt: Date; evaluatedById: string | null },
): HistoryEvent {
  return {
    key: `TECHNICAL_READINESS:TECHNICAL_READINESS_GATE:${assessment.id}:evaluated:${assessment.evaluatedAt.toISOString()}`,
    timestamp: assessment.evaluatedAt,
    category: "ASSESSMENT",
    sourceModule: "TECHNICAL_READINESS",
    sourceType: "TECHNICAL_READINESS_GATE",
    sourceId: assessment.id,
    sourceIdentifier: null,
    sourceLabel: `${assessment.gate.replaceAll("_", " ")} gate evaluated`,
    action: "technical_readiness.evaluated",
    label: historyEventLabel("technical_readiness.evaluated"),
    actorId: assessment.evaluatedById,
    actorName: null,
    detail: codeLabel(assessment.status),
    href: `/projects/${projectId}`,
  };
}

function verificationReadinessEvent(
  projectId: string,
  assessment: { id: string; verificationActivityId: string; status: string; evaluatedAt: Date; evaluatedById: string | null },
  activity: ProjectArtifactRef | undefined,
): HistoryEvent {
  return {
    key: `VERIFICATION_READINESS:VERIFICATION_READINESS_ASSESSMENT:${assessment.id}:evaluated:${assessment.evaluatedAt.toISOString()}`,
    timestamp: assessment.evaluatedAt,
    category: "ASSESSMENT",
    sourceModule: "VERIFICATION_READINESS",
    sourceType: "VERIFICATION_ACTIVITY",
    sourceId: assessment.verificationActivityId,
    sourceIdentifier: activity?.identifier ?? null,
    sourceLabel: activity ? `Verification readiness evaluated for ${activity.label}` : "Verification readiness evaluated",
    action: "verification_readiness.evaluated",
    label: historyEventLabel("verification_readiness.evaluated"),
    actorId: assessment.evaluatedById,
    actorName: null,
    detail: codeLabel(assessment.status),
    href: activity ? (traceabilityDetailRoute("VERIFICATION_ACTIVITY", projectId, assessment.verificationActivityId) ?? "") : "",
  };
}

function certificationReviewEvent(
  projectId: string,
  review: { id: string; status: string; evaluatedAt: Date; evaluatedById: string | null },
): HistoryEvent {
  return {
    key: `CERTIFICATION:CERTIFICATION_REVIEW:${review.id}:evaluated:${review.evaluatedAt.toISOString()}`,
    timestamp: review.evaluatedAt,
    category: "ASSESSMENT",
    sourceModule: "CERTIFICATION",
    sourceType: "CERTIFICATION_REVIEW",
    sourceId: review.id,
    sourceIdentifier: null,
    sourceLabel: "Certification review evaluated",
    action: "certification_review.evaluated",
    label: historyEventLabel("certification_review.evaluated"),
    actorId: review.evaluatedById,
    actorName: null,
    detail: codeLabel(review.status),
    href: `/projects/${projectId}/certification/review`,
  };
}

function impactAnalysisEvents(
  projectId: string,
  analysis: { id: string; changeRequestId: string; status: string; startedAt: Date; completedAt: Date | null },
  change: ProjectArtifactRef | undefined,
): HistoryEvent[] {
  const href = traceabilityDetailRoute("CHANGE_REQUEST", projectId, analysis.changeRequestId) ?? "";
  const label = change ? `Impact analysis for ${change.label}` : "Impact analysis";
  const events: HistoryEvent[] = [
    {
      key: `CHANGE_MANAGEMENT:IMPACT_ANALYSIS:${analysis.id}:started:${analysis.startedAt.toISOString()}`,
      timestamp: analysis.startedAt,
      category: "ASSESSMENT",
      sourceModule: "CHANGE_MANAGEMENT",
      sourceType: "IMPACT_ANALYSIS",
      sourceId: analysis.id,
      sourceIdentifier: change?.identifier ?? null,
      sourceLabel: `${label} started`,
      action: "impact_analysis.ran",
      label: historyEventLabel("impact_analysis.ran"),
      actorId: null,
      actorName: null,
      detail: null,
      href,
    },
  ];
  if (analysis.completedAt) {
    events.push({
      key: `CHANGE_MANAGEMENT:IMPACT_ANALYSIS:${analysis.id}:completed:${analysis.completedAt.toISOString()}`,
      timestamp: analysis.completedAt,
      category: "ASSESSMENT",
      sourceModule: "CHANGE_MANAGEMENT",
      sourceType: "IMPACT_ANALYSIS",
      sourceId: analysis.id,
      sourceIdentifier: change?.identifier ?? null,
      sourceLabel: `${label} ${analysis.status === "FAILED" ? "failed" : "completed"}`,
      action: "impact_analysis.evaluated",
      label: historyEventLabel("impact_analysis.evaluated"),
      actorId: null,
      actorName: null,
      detail: codeLabel(analysis.status),
      href,
    });
  }
  return events;
}

function sentinelDetectionEvent(
  projectId: string,
  event: { id: string; sourceType: string; sourceId: string; sourceIdentifier: string | null; sourceLabel: string; detectedAt: Date; actorId: string | null },
): HistoryEvent {
  return {
    key: `SENTINEL:SENTINEL_EVENT:${event.id}:detected:${event.detectedAt.toISOString()}`,
    timestamp: event.detectedAt,
    category: "SURVEILLANCE",
    sourceModule: "SENTINEL",
    sourceType: "SENTINEL_EVENT",
    sourceId: event.id,
    sourceIdentifier: event.sourceIdentifier,
    sourceLabel: `Change detected: ${event.sourceLabel}`,
    action: "sentinel.change_detected",
    label: historyEventLabel("sentinel.detected"),
    actorId: event.actorId,
    actorName: null,
    detail: null,
    href: `/projects/${projectId}/sentinel`,
  };
}

function surveillanceTargetEvents(
  projectId: string,
  target: {
    id: string;
    targetType: string;
    targetId: string;
    targetIdentifier: string | null;
    targetLabel: string;
    reason: string;
    detectedAt: Date;
    acknowledgedAt: Date | null;
    acknowledgedById: string | null;
    resolvedAt: Date | null;
    resolvedById: string | null;
  },
  decisionIdByAssumptionId: Map<string, string>,
): HistoryEvent[] {
  const href = sentinelTargetHref(projectId, target.targetType, target.targetId, decisionIdByAssumptionId);
  const base = {
    sourceModule: "SENTINEL" as const,
    sourceType: "SURVEILLANCE_TARGET",
    sourceId: target.id,
    sourceIdentifier: target.targetIdentifier,
    category: "SURVEILLANCE" as const,
    href,
  };

  const events: HistoryEvent[] = [
    {
      ...base,
      key: `SENTINEL:SURVEILLANCE_TARGET:${target.id}:detected:${target.detectedAt.toISOString()}`,
      timestamp: target.detectedAt,
      sourceLabel: `${target.targetLabel} — surveillance opened`,
      action: "sentinel.target_detected",
      label: historyEventLabel("sentinel.detected"),
      actorId: null,
      actorName: null,
      detail: target.reason,
    },
  ];
  if (target.acknowledgedAt) {
    events.push({
      ...base,
      key: `SENTINEL:SURVEILLANCE_TARGET:${target.id}:acknowledged:${target.acknowledgedAt.toISOString()}`,
      timestamp: target.acknowledgedAt,
      sourceLabel: `${target.targetLabel} — acknowledged`,
      action: "sentinel.target_acknowledged",
      label: historyEventLabel("sentinel.acknowledged"),
      actorId: target.acknowledgedById,
      actorName: null,
      detail: null,
    });
  }
  if (target.resolvedAt) {
    events.push({
      ...base,
      key: `SENTINEL:SURVEILLANCE_TARGET:${target.id}:resolved:${target.resolvedAt.toISOString()}`,
      timestamp: target.resolvedAt,
      sourceLabel: `${target.targetLabel} — resolved`,
      action: "sentinel.target_resolved",
      label: historyEventLabel("sentinel.evaluated"),
      actorId: target.resolvedById,
      actorName: null,
      detail: null,
    });
  }
  return events;
}

// --- Project-wide native-table sweep --------------------------------------------

async function collectNativeEvents(
  projectId: string,
  artifacts: Map<string, ProjectArtifactRef[]>,
): Promise<HistoryEvent[]> {
  const baselineById = new Map((artifacts.get("EngineeringBaseline") ?? []).map((b) => [b.id, b]));
  const activityById = new Map((artifacts.get("VerificationActivity") ?? []).map((a) => [a.id, a]));
  const changeById = new Map((artifacts.get("ChangeRequest") ?? []).map((c) => [c.id, c]));

  const [
    driftAssessments,
    technicalAssessments,
    verificationAssessments,
    impactAnalyses,
    program,
    projectAssumptions,
    sentinelEvents,
    surveillanceTargets,
  ] = await Promise.all([
    assessmentRepository.listAssessments(projectId, undefined),
    technicalReadinessRepository.listAssessments(projectId, undefined),
    verificationReadinessRepository.listAllForProject(projectId),
    impactAnalysisRepository.listAllForProject(projectId),
    certificationProgramRepository.findProgramInProject(projectId),
    monitoringRepository.listProjectAssumptions(projectId),
    sentinelEventRepository.listEventsForProject(projectId, {}),
    surveillanceTargetRepository.listTargetsForProject(projectId, {}),
  ]);

  const reviews = program ? await certificationReviewRepository.listReviews(program.id) : [];

  // Decision-assumption -> decision-id map, for a real Sentinel navigation
  // href — the same lookup Command Center's own Sentinel section builds.
  const decisionIdByAssumptionId = new Map(
    projectAssumptions.map((assumption) => [assumption.id, assumption.engineeringDecisionId]),
  );

  return [
    ...driftAssessments.map((a) => driftEvent(projectId, a, baselineById.get(a.baselineId))),
    ...technicalAssessments.map((a) => technicalReadinessEvent(projectId, a)),
    ...verificationAssessments.map((a) => verificationReadinessEvent(projectId, a, activityById.get(a.verificationActivityId))),
    ...reviews.map((r) => certificationReviewEvent(projectId, r)),
    ...impactAnalyses.flatMap((a) => impactAnalysisEvents(projectId, a, changeById.get(a.changeRequestId))),
    ...sentinelEvents.map((e) => sentinelDetectionEvent(projectId, e)),
    ...surveillanceTargets.flatMap((t) => surveillanceTargetEvents(projectId, t, decisionIdByAssumptionId)),
  ];
}

// --- Public API ------------------------------------------------------------------

export async function getProjectHistory(
  context: OrganizationContext,
  projectId: unknown,
  filter: ProjectHistoryFilter = {},
  pagination: HistoryPagination = {},
): Promise<ProjectHistoryResult> {
  const scopedProjectId = await requireProjectReadAccess(context, projectId);

  const moduleFilter = optionalString(filter.module);
  const objectTypeFilter = optionalString(filter.objectType);
  const actorFilter = optionalString(filter.actorId);
  const fromFilter = optionalDate(filter.from);
  const toFilter = optionalDate(filter.to);

  const artifacts = await listProjectArtifacts(scopedProjectId);

  const entityIdsByType = new Map<string, string[]>(
    [...artifacts.entries()].map(([entityType, rows]) => [entityType, rows.map((r) => r.id)]),
  );
  const auditRows = await listAuditEventsForProjectArtifacts(context.organizationId, entityIdsByType);

  const artifactEvents: HistoryEvent[] = [];
  for (const row of auditRows) {
    const bucket = artifacts.get(row.entityType);
    const artifact = bucket?.find((a) => a.id === row.entityId);
    if (!artifact) continue; // Defense in depth: an id this scan did not itself enumerate is never surfaced.
    artifactEvents.push(toArtifactEvent(scopedProjectId, row.entityType, artifact, row));
  }

  const nativeEvents = await collectNativeEvents(scopedProjectId, artifacts);

  let events = dedupeHistoryEvents([...artifactEvents, ...nativeEvents]);

  if (moduleFilter) events = events.filter((e) => e.sourceModule === moduleFilter);
  if (objectTypeFilter) events = events.filter((e) => e.sourceType === objectTypeFilter);
  if (actorFilter) events = events.filter((e) => e.actorId === actorFilter);
  if (fromFilter) events = events.filter((e) => e.timestamp >= fromFilter);
  if (toFilter) events = events.filter((e) => e.timestamp <= toFilter);

  return paginateHistoryEvents(events, optionalNumber(pagination.offset), optionalNumber(pagination.limit));
}

export async function getObjectHistory(
  context: OrganizationContext,
  projectId: unknown,
  objectType: unknown,
  objectId: unknown,
  pagination: HistoryPagination = {},
): Promise<ObjectHistoryResult> {
  const scopedProjectId = await requireProjectReadAccess(context, projectId);
  const type = parseOrThrow(historyObjectTypeSchema, objectType, "Unsupported or unknown history object type");
  const id = parseOrThrow(entityIdSchema, objectId, "Invalid object id");

  const entityType = HISTORY_ARTIFACT_ENTITY_TYPES.find((row) => row.objectType === type)?.entityType;
  if (!entityType) {
    // Unreachable given historyObjectTypeSchema's own domain, but never silently
    // falls through to an unscoped read if the two tables ever drift apart.
    throw new NotFoundError(`${String(type)} history is not supported.`);
  }

  const artifacts = await listProjectArtifacts(scopedProjectId);
  const bucket = artifacts.get(entityType) ?? [];
  const object = bucket.find((row) => row.id === id);
  if (!object) {
    throw new NotFoundError(`${type} ${id} was not found in this project.`);
  }

  const auditRows = await auditLogRepository.listAuditEventsForEntity({
    organizationId: context.organizationId,
    entityType,
    entityId: id,
    limit: 200,
  });
  let events: HistoryEvent[] = auditRows.map((row) => ({
    ...toArtifactEvent(scopedProjectId, entityType, object, {
      id: row.id,
      entityType,
      entityId: id,
      action: row.action,
      createdAt: row.createdAt,
      actor: row.actor,
      metadata: row.metadata,
    }),
  }));

  // Supplementary native-table events genuinely about this specific object —
  // never a second traversal, just the one existing per-object list each
  // engine already exposes.
  if (type === "CHANGE_REQUEST") {
    const analyses = await impactAnalysisRepository.listAnalyses(scopedProjectId, id);
    events.push(...analyses.flatMap((a) => impactAnalysisEvents(scopedProjectId, a, object)));
  }
  if (type === "ENGINEERING_BASELINE") {
    const assessments = await assessmentRepository.listAssessments(scopedProjectId, id);
    events.push(...assessments.map((a) => driftEvent(scopedProjectId, a, object)));
  }
  if (type === "VERIFICATION_ACTIVITY") {
    const assessments = await verificationReadinessRepository.listAssessments(scopedProjectId, id);
    events.push(...assessments.map((a) => verificationReadinessEvent(scopedProjectId, a, object)));
  }

  events = dedupeHistoryEvents(events);
  const { events: paged, page } = paginateHistoryEvents(
    events,
    optionalNumber(pagination.offset),
    optionalNumber(pagination.limit),
  );

  return {
    object: {
      type,
      id: object.id,
      identifier: object.identifier,
      label: object.label,
      href: traceabilityDetailRoute(type, scopedProjectId, object.id) ?? "",
    },
    events: paged,
    page,
  };
}
